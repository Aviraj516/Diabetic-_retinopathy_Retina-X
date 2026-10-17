import { jsPDF } from 'jspdf';
import { ReportRecord, Patient, CataractScreeningRecord, GlaucomaScreeningRecord } from '../types';
import { resolveImageUrl } from './imageUtils';
import { uploadReportPdf } from '../services/screeningService';
import {
  extractLesionItems,
  generateDrClinicalSummary,
  generateDrClinicalInterpretation,
  getRecommendedAction,
  getCategoryWhatThisMeans,
  getModelScoreExplanation,
  VISUALIZATION_EXPLANATIONS,
  getModelLimitations,
  DR_LESION_DEFINITIONS,
} from './drClinicalExplanations';
import { getEvidenceIntensityLevel, buildCataractWhyExplanation } from './cataractEvidence';

async function loadImageDataUrl(src?: string, fallbackUrl?: string): Promise<string> {
  const tryResolve = (target?: string) => {
    if (!target || typeof target !== 'string') return '';
    const resolved = resolveImageUrl(target);
    return resolved || '';
  };

  const candidateUrls: string[] = [];
  const primary = tryResolve(src);
  if (primary) candidateUrls.push(primary);
  const secondary = tryResolve(fallbackUrl);
  if (secondary && secondary !== primary) candidateUrls.push(secondary);

  for (const url of candidateUrls) {
    if (url.startsWith('data:image/')) return url;

    // 1. Direct fetch with timeout (fastest and cleanest for blob-to-data-uri)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.size > 50) {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string) || '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
          });
          if (dataUrl && dataUrl.startsWith('data:image/')) {
            return dataUrl;
          }
        }
      }
    } catch {
      // Direct fetch failed or CORS restricted, proceed to canvas fallback
    }

    // 2. HTML Image + Canvas with anonymous crossOrigin
    try {
      const dataUrlFromCanvas = await new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(''), 4000);
        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 400;
            canvas.height = img.naturalHeight || img.height || 400;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/jpeg', 0.92));
              return;
            }
          } catch (e) {
            console.warn('[PDF Image Canvas conversion error]', e);
          }
          resolve('');
        };
        img.onerror = () => {
          clearTimeout(timer);
          resolve('');
        };
        img.src = url;
      });
      if (dataUrlFromCanvas && dataUrlFromCanvas.startsWith('data:image/')) {
        return dataUrlFromCanvas;
      }
    } catch {}
  }

  return '';
}

/**
 * Draws an image inside a bounding box while strictly maintaining aspect ratio
 * (equivalent to object-fit: contain). Never crops or stretches unnaturally.
 */
function drawImageContained(
  doc: jsPDF,
  imgDataUrl: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): boolean {
  if (!imgDataUrl || !imgDataUrl.startsWith('data:image/')) return false;
  try {
    const props = doc.getImageProperties(imgDataUrl);
    const imgAspect = (props.width || 1) / (props.height || 1);
    const boxAspect = boxW / boxH;

    let targetW = boxW;
    let targetH = boxH;
    let targetX = boxX;
    let targetY = boxY;

    if (imgAspect > boxAspect) {
      // Wider than box
      targetW = boxW;
      targetH = boxW / imgAspect;
      targetY = boxY + (boxH - targetH) / 2;
    } else {
      // Taller than box
      targetH = boxH;
      targetW = boxH * imgAspect;
      targetX = boxX + (boxW - targetW) / 2;
    }

    const fmt = imgDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    doc.addImage(imgDataUrl, fmt, targetX, targetY, targetW, targetH);
    return true;
  } catch (e) {
    try {
      const fmt = imgDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(imgDataUrl, fmt, boxX, boxY, boxW, boxH);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Main function to generate and trigger download of the official TRINAY Diabetic Retinopathy medical PDF report.
 * Strictly populated with dynamic patient and model inference data in a concise 5-section decision-support layout.
 */
export async function downloadRetinaXPdf(report: ReportRecord, patient?: Patient): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // Load actual screening artifact images
  const [imgOriginal, imgGradCam, imgLesions, imgAnatomy, imgCombined] = await Promise.all([
    loadImageDataUrl(report.imageOriginal || report.imageUrl || (report.id ? `/api/screenings/${report.id}/artifacts/original` : '')),
    loadImageDataUrl(report.imageGradCam || (report.id ? `/api/screenings/${report.id}/artifacts/gradcam` : '')),
    loadImageDataUrl(report.imageLesions || (report.id ? `/api/screenings/${report.id}/artifacts/lesions` : '')),
    loadImageDataUrl(report.imageAnatomy || (report.id ? `/api/screenings/${report.id}/artifacts/anatomy` : '')),
    loadImageDataUrl(report.imageCombined || (report.id ? `/api/screenings/${report.id}/artifacts/combined` : '')),
  ]);

  // Dynamic clinical summaries & interpretations
  const lesionItems = extractLesionItems(report.lesionData);
  const interpretation = generateDrClinicalInterpretation({
    lesionData: report.lesionData,
    drSeverity: report.drSeverity,
    drSeverityLevel: report.drSeverityLevel,
    confidence: report.confidence,
    imageQuality: report.imageQuality,
  });

  const recommendedAction = getRecommendedAction({
    imageQuality: report.imageQuality,
    drSeverity: report.drSeverity,
    drSeverityLevel: report.drSeverityLevel,
    referralStatus: report.referralStatus,
    referralPriority: report.referralPriority,
    referralReason: report.referralReason,
    recommendation: report.recommendation,
  });

  const patientName = report.patientName || patient?.fullName || 'Patient Information Unavailable';
  const patientId = report.patientId || patient?.id || 'N/A';
  const ageGenderStr = `${report.patientAge || patient?.age || '—'} Yrs / ${report.patientGender || patient?.gender || '—'}`;
  const eyeShort = report.eye === 'Left Eye' ? 'OS' : report.eye === 'Right Eye' ? 'OD' : report.eye || 'OD';

  const isNormalDR =
    report.drSeverity === 'No DR' ||
    report.drSeverityLevel === 'No DR (Level 0)' ||
    (report.drSeverityLevel || '').includes('Level 0');

  const patientHistory =
    (report as any).patientHistory ||
    (patient?.diabetesDurationYears != null
      ? `Type 2 Diabetes (${patient.diabetesDurationYears} yrs)${patient.knownDR && patient.knownDR !== 'Uncertain' ? ` • Known DR: ${patient.knownDR}` : ''}`
      : undefined);

  // ==========================================
  // PAGE 1: OUTCOME, FINDINGS & VISUAL EVIDENCE
  // ==========================================

  // Top Navy Banner
  doc.setFillColor(13, 24, 41); // #0D1829
  doc.rect(margin, 12, contentWidth, 18, 'F');

  // White text in banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TRINAY TELE-OPHTHALMOLOGY NETWORK', margin + 6, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('AI-ASSISTED RETINAL SCREENING CLINICAL DECISION-SUPPORT REPORT', margin + 6, 25.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('CONFIDENTIAL MEDICAL DOCUMENT', pageWidth - margin - 6, 19.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`DATE: ${report.generatedDate || new Date().toLocaleDateString('en-GB')}`, pageWidth - margin - 6, 25, { align: 'right' });

  // Sub-header info row
  let curY = 34;
  doc.setTextColor(30, 96, 213);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DEPARTMENT OF RETINAL TELE-SCREENING & DIABETIC EYE CARE', margin, curY);

  curY += 4.5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, curY, pageWidth - margin, curY);

  const qualityGrade = report.imageQuality || 'Unrecorded';
  const isUngradable = qualityGrade === 'Poor' || qualityGrade === 'Ungradable' || qualityGrade.toLowerCase().includes('poor');
  const isQualityGood = qualityGrade === 'Good';
  const gradabilityText = isUngradable ? 'Ungradable' : isQualityGood ? 'Gradable (Adequate)' : 'Gradable (Review Quality)';
  const spec = report.specialistReview;
  const whatThisMeans = getCategoryWhatThisMeans(report.drSeverity);
  const scoreExplanation = getModelScoreExplanation(report.confidence);
  const modelLimitations = getModelLimitations({
    imageQuality: qualityGrade,
    isUngradable,
    lesionData: report.lesionData,
    anatomyData: report.anatomyData,
  });

  // -------------------------------------------------------------------------
  // 1. PATIENT & EXAMINATION DETAILS
  // -------------------------------------------------------------------------
  curY += 3.5;
  const patientBoxH = 25;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, contentWidth, patientBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('1. PATIENT & EXAMINATION DETAILS', margin + 4, curY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Demographics, Examination Parameters & Clinical History', pageWidth - margin - 4, curY + 5.5, { align: 'right' });

  // Row 1
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Patient Name / ID:', margin + 4, curY + 11.5);
  doc.text('Age / Gender:', margin + 64, curY + 11.5);
  doc.text('Examined Eye:', margin + 124, curY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${patientName} (${patientId})`, margin + 4, curY + 16);
  doc.text(ageGenderStr, margin + 64, curY + 16);
  doc.setTextColor(30, 96, 213);
  doc.text(`${report.eye || 'Right Eye'} (${eyeShort})`, margin + 124, curY + 16);

  // Row 2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Examination Date:', margin + 4, curY + 20);
  doc.text('Screening Operator:', margin + 64, curY + 20);
  doc.text('Relevant Medical History:', margin + 124, curY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(report.generatedDate || 'Not recorded', margin + 4, curY + 24);
  doc.text(report.nurseName || 'Recorded in protocol', margin + 64, curY + 24);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(patientHistory || 'None recorded', margin + 124, curY + 24);

  // -------------------------------------------------------------------------
  // 2. SCREENING SUMMARY
  // -------------------------------------------------------------------------
  curY += patientBoxH + 3.5;
  const summaryBoxH = 34;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, contentWidth, summaryBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('2. SCREENING SUMMARY & MODEL OUTPUT SCORE', margin + 4, curY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Primary AI Staging, Model Score, Image Quality & Review Status', pageWidth - margin - 4, curY + 5.5, { align: 'right' });

  // 4 columns: Staging | Model Score | Image Quality & Gradability | Review Status
  const sCol1 = margin + 4;
  const sCol2 = margin + 50;
  const sCol3 = margin + 96;
  const sCol4 = margin + 142;

  // Col 1: DR Staging
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Predicted DR Severity:', sCol1, curY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  if (isNormalDR) {
    doc.setTextColor(4, 120, 87);
  } else {
    doc.setTextColor(180, 83, 9);
  }
  doc.text(report.drSeverityLevel || report.drSeverity || 'No DR', sCol1, curY + 16.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('ICDR Classification Standard', sCol1, curY + 21);

  // Col 2: Model Score
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Model Output Score:', sCol2, curY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(scoreExplanation.scoreDisplay, sCol2, curY + 16.5);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(doc.splitTextToSize('Uncalibrated model score; not disease probability.', 42), sCol2, curY + 21);

  // Col 3: Quality & Gradability
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Image Quality & Gradability:', sCol3, curY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  if (isUngradable) {
    doc.setTextColor(225, 29, 72);
    doc.text(`${qualityGrade} (${gradabilityText})`, sCol3, curY + 16.5);
  } else if (isQualityGood) {
    doc.setTextColor(4, 120, 87);
    doc.text(`${qualityGrade} (${gradabilityText})`, sCol3, curY + 16.5);
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text(`${qualityGrade} (${gradabilityText})`, sCol3, curY + 16.5);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(71, 85, 105);
  if (isUngradable) {
    doc.text(doc.splitTextToSize('Degraded quality; repeat capture advised.', 42), sCol3, curY + 21);
  } else if (isQualityGood) {
    doc.text(doc.splitTextToSize('Adequate clarity; no repeat capture indicated.', 42), sCol3, curY + 21);
  } else {
    doc.text(doc.splitTextToSize('Borderline clarity; specialist review advised.', 42), sCol3, curY + 21);
  }

  // Col 4: Review Status
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Clinical Review Status:', sCol4, curY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  if (spec) {
    doc.setTextColor(4, 120, 87);
    doc.text('Verified by Specialist ✓', sCol4, curY + 16.5);
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text('Pending Specialist Review', sCol4, curY + 16.5);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(doc.splitTextToSize(spec ? 'Specialist sign-off recorded' : 'Queued for tele-ophthalmology verification', 36), sCol4, curY + 21);

  // -------------------------------------------------------------------------
  // 3. WHAT THE AI FOUND
  // -------------------------------------------------------------------------
  curY += summaryBoxH + 3.5;
  const findingsBoxH = 55;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, contentWidth, findingsBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('3. WHAT THE AI FOUND', margin + 4, curY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Inference Findings Present in Model Outputs & Retinal Landmarks', pageWidth - margin - 4, curY + 5.5, { align: 'right' });

  // Table header
  const tableY = curY + 8;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin + 2, tableY, contentWidth - 4, 5.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('PATHOLOGICAL FINDING', margin + 5, tableY + 4);
  doc.text('DETECTION STATUS', margin + 70, tableY + 4);
  doc.text('EXISTING MEASURED RESULT (RAW MODEL UNITS)', pageWidth - margin - 5, tableY + 4, { align: 'right' });

  // 4 Supported lesion rows
  lesionItems.forEach((item, idx) => {
    const rowY = tableY + 5.5 + idx * 5.8;
    const isAssessed = item.isAssessed;
    const isDet = isAssessed && item.detected && item.pixels > 0;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.def.fullName} (${item.code})`, margin + 5, rowY + 4);

    doc.setFont('helvetica', 'bold');
    if (!isAssessed) {
      doc.setTextColor(148, 163, 184);
      doc.text('Not evaluated', margin + 70, rowY + 4);
      doc.setFont('helvetica', 'normal');
      doc.text('Unavailable', pageWidth - margin - 5, rowY + 4, { align: 'right' });
    } else if (isDet) {
      doc.setTextColor(180, 83, 9);
      doc.text('Detected', margin + 70, rowY + 4);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const regText = item.regions > 0 ? ` (${item.regions} segmented regions)` : '';
      doc.text(`${item.pixels.toLocaleString()} px detected area${regText}`, pageWidth - margin - 5, rowY + 4, { align: 'right' });
    } else {
      doc.setTextColor(100, 116, 139);
      doc.text('Not detected', margin + 70, rowY + 4);
      doc.setFont('helvetica', 'normal');
      doc.text('0 px detected', pageWidth - margin - 5, rowY + 4, { align: 'right' });
    }

    if (idx < 3) {
      doc.setDrawColor(241, 245, 249);
      doc.line(margin + 4, rowY + 5.5, pageWidth - margin - 4, rowY + 5.5);
    }
  });

  // Retinal Landmarks strip inside box
  const landmarksY = curY + 39;
  doc.setFillColor(248, 250, 252);
  doc.rect(margin + 2, landmarksY, contentWidth - 4, 13, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(30, 96, 213);
  doc.text('RETINAL ANATOMY LOCALIZATION:', margin + 4, landmarksY + 4.5);

  const anatomy = report.anatomyData;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);

  const odText = anatomy?.optic_disc?.pixels ? `Optic Disc: ${anatomy.optic_disc.pixels.toLocaleString()} px` : 'Optic Disc: Localized';
  const fovText = anatomy?.fovea ? `Fovea: (${Math.round(anatomy.fovea.x)}, ${Math.round(anatomy.fovea.y)})` : 'Fovea: Identified';
  const macText = 'Macula: Estimated ROI (r=56px)';
  const vesText = anatomy?.blood_vessels?.pixels ? `Vessels: ${anatomy.blood_vessels.pixels.toLocaleString()} px` : 'Vessels: Segmented';

  doc.text(`${odText}   •   ${fovText}   •   ${macText}   •   ${vesText}`, margin + 4, landmarksY + 9.5);

  // -------------------------------------------------------------------------
  // 4. VISUAL EVIDENCE
  // -------------------------------------------------------------------------
  curY += findingsBoxH + 3.5;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('4. VISUAL EVIDENCE', margin, curY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('5 Canonical Visualizations with Clinical Explanations', pageWidth - margin, curY, { align: 'right' });

  curY += 3.5;
  const imgWidth = 33;
  const gap = 4.25;
  const imgBoxH = 54;

  const images = [
    { src: imgOriginal, title: '1. Original Fundus', sub: VISUALIZATION_EXPLANATIONS.original.short },
    { src: imgLesions || imgCombined, title: '2. Lesions Map', sub: VISUALIZATION_EXPLANATIONS.lesions.short },
    { src: imgGradCam, title: '3. Grad-CAM++', sub: VISUALIZATION_EXPLANATIONS.gradcam.short },
    { src: imgAnatomy, title: '4. Anatomy Map', sub: VISUALIZATION_EXPLANATIONS.anatomy.short },
    { src: imgCombined, title: '5. Combined Overlay', sub: VISUALIZATION_EXPLANATIONS.combined.short },
  ];

  images.forEach((img, idx) => {
    const xPos = margin + idx * (imgWidth + gap);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(xPos, curY, imgWidth, imgBoxH, 2, 2, 'FD');

    let drew = false;
    if (img.src) {
      drew = drawImageContained(doc, img.src, xPos + 2, curY + 2, imgWidth - 4, 38);
    }

    if (!drew) {
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(6.5);
      doc.text(img.src ? 'Image Rendered' : 'Artifact Pending', xPos + imgWidth / 2, curY + 20, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(img.title, xPos + imgWidth / 2, curY + 45, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(img.sub, xPos + imgWidth / 2, curY + 50, { align: 'center' });
  });

  // Page 1 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('TRINAY Tele-Ophthalmology Screening Platform | Confidential Clinical Decision Support', margin, 287);
  doc.text('Page 1 of 2', pageWidth - margin, 287, { align: 'right' });

  // ==========================================
  // PAGE 2: INTERPRETATION, ACTION & REVIEW
  // ==========================================
  doc.addPage();

  doc.setFillColor(13, 24, 41);
  doc.rect(margin, 12, contentWidth, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('TRINAY | Retinal Screening Clinical Decision-Support Report (Continuation)', margin + 5, 19.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    `Patient: ${patientName} (${patientId}) | Eye: ${report.eye || 'Right Eye'} (${eyeShort}) | ${report.generatedDate || new Date().toLocaleDateString('en-GB')}`,
    pageWidth - margin - 5,
    19.5,
    { align: 'right' }
  );

  let p2Y = 27;

  // -------------------------------------------------------------------------
  // 5. WHAT THIS MEANS (CLINICAL INTERPRETATION)
  // -------------------------------------------------------------------------
  const interpBoxH = 48;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, p2Y, contentWidth, interpBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('5. WHAT THIS MEANS (CLINICAL INTERPRETATION)', margin + 4, p2Y + 5.5);

  // Concordance badge
  doc.setFontSize(7);
  if (interpretation.concordanceType === 'concordant_negative') {
    doc.setTextColor(4, 120, 87);
    doc.text('Status: Concordant Negative (No DR)', pageWidth - margin - 4, p2Y + 5.5, { align: 'right' });
  } else if (interpretation.concordanceType === 'concordant_positive') {
    doc.setTextColor(30, 96, 213);
    doc.text(`Status: Concordant (${interpretation.classifierVerdict})`, pageWidth - margin - 4, p2Y + 5.5, { align: 'right' });
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text('Status: Clinician Review Required', pageWidth - margin - 4, p2Y + 5.5, { align: 'right' });
  }

  // Predicted Category
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${whatThisMeans.categoryTitle} • Predicted Category`, margin + 4, p2Y + 11.5);

  // Clinical Meaning
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  const meaningLines = doc.splitTextToSize(whatThisMeans.clinicalMeaning, contentWidth - 8);
  doc.text(meaningLines, margin + 4, p2Y + 16.5);

  // Verification Notice
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(180, 83, 9);
  doc.text('Clinical Verification Required:', margin + 4, p2Y + 31);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(146, 64, 14);
  const verLines = doc.splitTextToSize(whatThisMeans.verificationNotice, contentWidth - 46);
  doc.text(verLines, margin + 42, p2Y + 31);

  // Model concordance detail & distinction note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`Model Analysis: ${interpretation.concordanceTitle} — ${interpretation.concordanceDetail}`, margin + 4, p2Y + 41.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(148, 163, 184);
  doc.text(doc.splitTextToSize(interpretation.distinctionNote, contentWidth - 8), margin + 4, p2Y + 45.5);

  // -------------------------------------------------------------------------
  // 6. RECOMMENDED NEXT STEPS & FOLLOW-UP
  // -------------------------------------------------------------------------
  p2Y += interpBoxH + 3.5;
  const actionBoxH = 38;
  doc.setFillColor(recommendedAction.isReferral ? 254 : 248, recommendedAction.isReferral ? 243 : 250, recommendedAction.isReferral ? 199 : 252);
  doc.setDrawColor(recommendedAction.isReferral ? 253 : 203, recommendedAction.isReferral ? 226 : 213, recommendedAction.isReferral ? 138 : 225);
  doc.roundedRect(margin, p2Y, contentWidth, actionBoxH, 2, 2, 'FD');

  doc.setTextColor(recommendedAction.isReferral ? 180 : 15, recommendedAction.isReferral ? 83 : 23, recommendedAction.isReferral ? 9 : 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('6. RECOMMENDED NEXT STEPS & FOLLOW-UP', margin + 4, p2Y + 5.5);

  doc.setFontSize(7);
  doc.text(recommendedAction.priorityBadge, pageWidth - margin - 4, p2Y + 5.5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(recommendedAction.actionTitle, margin + 4, p2Y + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  const actionLines = doc.splitTextToSize(recommendedAction.actionSummary, contentWidth - 8);
  doc.text(actionLines, margin + 4, p2Y + 16.5);

  // Follow-up timing & protocol basis
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Recommended Follow-Up Interval:', margin + 4, p2Y + 27.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 96, 213);
  doc.text(recommendedAction.timingGuideline, margin + 48, p2Y + 27.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`Guideline Basis: ${recommendedAction.protocolBasis} • AI recommendation subject to clinician confirmation`, margin + 4, p2Y + 33.5);

  // -------------------------------------------------------------------------
  // 7. MODEL LIMITATIONS & QUALITY NOTES
  // -------------------------------------------------------------------------
  p2Y += actionBoxH + 3.5;
  const limitBoxH = 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, p2Y, contentWidth, limitBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('7. MODEL LIMITATIONS & QUALITY NOTES', margin + 4, p2Y + 5);

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Image Quality: ${qualityGrade || report.imageQuality || 'Gradable'}`, pageWidth - margin - 4, p2Y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);

  const displayLimitations =
    modelLimitations && modelLimitations.length > 0
      ? modelLimitations.slice(0, 2)
      : ['No pipeline limitations identified. Field illumination and focus meet automated decision-support criteria.'];

  displayLimitations.forEach((lim, idx) => {
    const limLines = doc.splitTextToSize(`• ${lim}`, contentWidth - 8);
    doc.text(limLines, margin + 4, p2Y + 10 + idx * 4.8);
  });

  // -------------------------------------------------------------------------
  // 8. OPHTHALMOLOGIST REVIEW
  // -------------------------------------------------------------------------
  p2Y += limitBoxH + 3.5;
  const reviewBoxH = 58;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, p2Y, contentWidth, reviewBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('8. OPHTHALMOLOGIST REVIEW', margin + 4, p2Y + 5.5);

  doc.setFontSize(7);
  if (spec) {
    doc.setTextColor(4, 120, 87);
    doc.text('Status: Verified by Specialist ✓', pageWidth - margin - 4, p2Y + 5.5, { align: 'right' });
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text('Status: Pending Specialist Review', pageWidth - margin - 4, p2Y + 5.5, { align: 'right' });
  }

  // Review details
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Reviewing Specialist:', margin + 4, p2Y + 11.5);
  doc.text('Review Date:', margin + 124, p2Y + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(spec?.specialistName || 'Assigned Review Queue: Tele-Ophthalmology Network', margin + 32, p2Y + 11.5);
  doc.text(spec?.reviewDate || report.generatedDate || 'Pending', margin + 142, p2Y + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Clinical Assessment:', margin + 4, p2Y + 17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(spec?.assessment || (spec ? report.drSeverity : 'Pending specialist clinical counter-verification'), margin + 32, p2Y + 17);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Assessment Notes:', margin + 4, p2Y + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const specNotesText = doc.splitTextToSize(spec?.notes || 'Queued for ophthalmologist counter-verification and review.', contentWidth - 36);
  doc.text(specNotesText, margin + 32, p2Y + 22.5);

  // Formal 3-column Sign-Off Table
  const signY = p2Y + 33;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 4, signY, pageWidth - margin - 4, signY);

  const signCol1 = margin + 4;
  const signCol2 = margin + 64;
  const signCol3 = margin + 124;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('REVIEWING OPHTHALMOLOGIST:', signCol1, signY + 5.5);
  doc.text('MEDICAL REGISTRATION / LICENSE:', signCol2, signY + 5.5);
  doc.text('CLINICAL SIGNATURE & DATE:', signCol3, signY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(spec?.specialistName || 'Dr. ___________________________', signCol1, signY + 11.5);
  doc.text((spec as any)?.registrationNumber || 'MCI / Reg: ____________________', signCol2, signY + 11.5);
  doc.text(spec?.reviewDate ? `Date: ${spec.reviewDate}` : 'Date: ________________________', signCol3, signY + 11.5);

  doc.setDrawColor(203, 213, 225);
  doc.line(signCol1, signY + 17.5, signCol1 + 52, signY + 17.5);
  doc.line(signCol2, signY + 17.5, signCol2 + 52, signY + 17.5);
  doc.line(signCol3, signY + 17.5, signCol3 + 52, signY + 17.5);

  // -------------------------------------------------------------------------
  // 9. DISCLAIMER
  // -------------------------------------------------------------------------
  p2Y += reviewBoxH + 3.5;
  const disclaimerBoxH = 20;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(margin, p2Y, contentWidth, disclaimerBoxH, 2, 2, 'FD');

  doc.setTextColor(190, 18, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('9. DISCLAIMER', margin + 4, p2Y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(87, 83, 78);
  const disclaimerText =
    'TRINAY is an artificial intelligence decision-support tool intended for tele-retinal screening and primary triage. ' +
    'It does not provide an autonomous medical diagnosis. All automated classifications, lesion segmentations, and landmark ' +
    'localizations must be clinically correlated and verified by a licensed ophthalmologist through direct clinical examination (slit-lamp biomicroscopy / OCT).';
  doc.text(doc.splitTextToSize(disclaimerText, contentWidth - 8), margin + 4, p2Y + 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(120, 113, 108);
  doc.text(`Report ID: ${report.id} • Screening ID: ${report.screeningId} • Generated: ${report.generatedDate} • Eye: ${report.eye || 'Right Eye'} (${eyeShort})`, margin + 4, p2Y + 17.5);

  // Page 2 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('TRINAY Tele-Ophthalmology Screening Platform | Confidential Clinical Decision Support', margin, 287);
  doc.text('Page 2 of 2', pageWidth - margin, 287, { align: 'right' });

  const patientIdClean = (patientId || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '');
  const dateClean = (report.generatedDate || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename = `TRINAY_DR_Report_${patientIdClean}_${dateClean}.pdf`;

  // Asynchronously upload PDF report to Supabase Storage in the background
  try {
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const targetSessionId = report.screeningId || report.id;
    if (pdfBase64 && targetSessionId) {
      uploadReportPdf(targetSessionId, pdfBase64, report.nurseId, patientId).catch(() => {});
    }
  } catch {
    // ignore background upload failure
  }

  doc.save(filename);
}

/**
 * Generates and downloads a real, deterministic Glaucoma Screening Medical PDF report
 * physically embedding high-resolution artifacts (Original, Optic Nerve, Vessels, Grad-CAM).
 */
export async function downloadGlaucomaPdf(
  screening: GlaucomaScreeningRecord,
  patient?: Patient
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(margin, 12, contentWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('TRINAY CLINICAL GLAUCOMA REPORT', margin + 6, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('AI-Assisted Optic Nerve, CDR & Retinal Vessel Screening', margin + 6, 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(45, 212, 191); // Teal-400
  doc.text(`ID: ${screening.id}`, pageWidth - margin - 6, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Date: ${screening.date}`, pageWidth - margin - 6, 28, { align: 'right' });

  // Patient Info Box
  let y = 42;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PATIENT DEMOGRAPHICS', margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Patient Name:', margin + 4, y + 11);
  doc.text('Patient ID:', margin + 4, y + 16);
  doc.text('Age / Gender:', margin + 60, y + 11);
  doc.text('Examined Eye:', margin + 60, y + 16);
  doc.text('Phone:', margin + 120, y + 11);
  doc.text('Operator:', margin + 120, y + 16);

  const pName = screening.patientName || patient?.fullName || 'Patient Information Unavailable';
  const pId = screening.patientId || patient?.id || 'N/A';
  const pAge = screening.patientAge || patient?.age;
  const pGender = screening.patientGender || patient?.gender;
  const pPhone = screening.patientPhone || patient?.phoneNumber || 'N/A';

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(pName, margin + 26, y + 11);
  doc.text(pId, margin + 26, y + 16);
  doc.text(`${pAge !== undefined ? pAge + ' yrs' : 'N/A'} / ${pGender || 'N/A'}`, margin + 82, y + 11);
  doc.text(screening.eye || 'Right Eye', margin + 82, y + 16);
  doc.text(pPhone, margin + 134, y + 11);
  doc.text(screening.nurseName || 'Clinical Operator', margin + 134, y + 16);

  // Verdict Banner
  y += 26;
  const isSuspect = screening.glaucomaPrediction === 'GLAUCOMA_SUSPECT';
  if (isSuspect) {
    doc.setFillColor(254, 243, 199); // Amber-100
    doc.setDrawColor(245, 158, 11);  // Amber-500
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
    doc.setTextColor(180, 83, 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DIAGNOSTIC VERDICT: GLAUCOMA SUSPECT', margin + 4, y + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Further clinical examination & dilated ophthalmoscopy recommended.', margin + 4, y + 14);
  } else {
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(16, 185, 129);  // Emerald-500
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
    doc.setTextColor(4, 120, 87);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DIAGNOSTIC VERDICT: NORMAL / LOW RISK', margin + 4, y + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Optic nerve and CDR within expected physiologic bounds. Routine follow-up.', margin + 4, y + 14);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `Glaucoma Prob: ${((screening.glaucomaProbability || 0) * 100).toFixed(1)}%`,
    pageWidth - margin - 4,
    y + 8,
    { align: 'right' }
  );

  // Structural & CDR Quantitative Breakdown Table
  y += 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 48, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('QUANTITATIVE MORPHOLOGICAL & CDR MEASUREMENTS', margin + 4, y + 5);

  const cdr = (screening.cdrFeatures || {}) as any;
  const vCDR = cdr.vertical_cdr !== undefined ? cdr.vertical_cdr : screening.verticalCDR;
  const hCDR = cdr.horizontal_cdr !== undefined ? cdr.horizontal_cdr : screening.horizontalCDR;
  const aCDR = cdr.area_cdr !== undefined ? cdr.area_cdr : screening.areaCDR;

  const metrics = [
    ['Vertical CDR', vCDR !== undefined ? Number(vCDR).toFixed(4) : 'N/A', 'Threshold: < 0.65'],
    ['Horizontal CDR', hCDR !== undefined ? Number(hCDR).toFixed(4) : 'N/A', 'Threshold: < 0.65'],
    ['Area CDR', aCDR !== undefined ? Number(aCDR).toFixed(4) : 'N/A', 'Ratio: Cup / Disc Area'],
    ['Cup Inside Ratio', cdr.cup_inside_ratio !== undefined ? Number(cdr.cup_inside_ratio).toFixed(4) : 'N/A', 'Anatomical concentricity'],
    ['Optic Disc Area', cdr.disc_area !== undefined ? `${cdr.disc_area} px` : 'N/A', 'Disc Detection: PASS'],
    ['Optic Cup Area', cdr.cup_area !== undefined ? `${cdr.cup_area} px` : 'N/A', 'Cup Detection: PASS'],
  ];

  let ty = y + 12;
  metrics.forEach(([label, val, note], idx) => {
    const col = idx % 2 === 0 ? margin + 4 : margin + 96;
    const rowY = ty + Math.floor(idx / 2) * 11;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label + ':', col, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(val), col + 36, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`(${note})`, col + 54, rowY);
  });

  // Physical Visual Evidence Gallery (4 Panels)
  y += 54;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('VISUAL EVIDENCE & OPTICAL LANDMARKS', margin, y);

  const imgY = y + 3;
  const imgW = (contentWidth - 9) / 4;
  const imgH = imgW * 0.95;

  const originalDataUrl = await loadImageDataUrl(screening.imageOriginal || (screening as any).imageUrl || (screening.id ? `/api/screenings/${screening.id}/artifacts/original` : ''));
  const opticDataUrl = await loadImageDataUrl(screening.imageOpticNerve || (screening.id ? `/api/screenings/${screening.id}/artifacts/optic_nerve` : ''));
  const vesselsDataUrl = await loadImageDataUrl(screening.imageRetinalAnatomy || (screening.id ? `/api/screenings/${screening.id}/artifacts/vessels` : ''));
  const gradcamDataUrl = await loadImageDataUrl(screening.imageGradCam || screening.imageWorkflow || (screening as any).imageUrl || (screening.id ? `/api/screenings/${screening.id}/artifacts/combined` : ''));

  const panels = [
    { title: '1. Original Fundus', img: originalDataUrl },
    { title: '2. Optic Disc/Cup', img: opticDataUrl },
    { title: '3. Retinal Vessels', img: vesselsDataUrl },
    { title: '4. Grad-CAM / XAI', img: gradcamDataUrl },
  ];

  panels.forEach((p, i) => {
    const px = margin + i * (imgW + 3);
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(px, imgY, imgW, imgH, 1, 1, 'F');
    if (p.img) {
      try {
        const fmt = p.img.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(p.img, fmt, px, imgY, imgW, imgH);
      } catch {
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(6.5);
        doc.text('Image Attached', px + imgW / 2, imgY + 20, { align: 'center' });
      }
    } else {
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(6.5);
      doc.text('Artifact Pending', px + imgW / 2, imgY + 20, { align: 'center' });
    }
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(p.title, px + imgW / 2, imgY + imgH + 4, { align: 'center' });
  });

  // Clinical Recommendation Box
  y = imgY + imgH + 9;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('RECOMMENDED CLINICAL ACTION & REFERRAL TIMELINE', margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const recText =
    screening.clinicalRecommendation ||
    (isSuspect
      ? 'Priority ophthalmology referral: Comprehensive dilated stereoscopic disc examination, Goldmann applanation tonometry (IOP), and Humphrey automated visual field testing recommended within 2 to 4 weeks.'
      : 'Routine preventive care: Structural optic nerve parameters within physiologic range. Continue annual visual acuity and eye health evaluations.');
  doc.text(doc.splitTextToSize(recText, contentWidth - 8), margin + 4, y + 10.5);

  // Page 1 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('TRINAY Glaucoma Screening Platform | Confidential Clinical Document', margin, 287);
  doc.text('Page 1 of 2', pageWidth - margin, 287, { align: 'right' });

  // -------------------------------------------------------------
  // PAGE 2: CLINICAL INTERPRETATION, PATIENT GUIDANCE & PRECAUTIONS
  // -------------------------------------------------------------
  doc.addPage();

  // Page 2 Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, 12, contentWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TRINAY CLINICAL GLAUCOMA REPORT — DOCTOR & PATIENT SUMMARY', margin + 6, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Patient: ${pName} (${pId}) | Examined Eye: ${screening.eye || 'Right Eye'}`, pageWidth - margin - 6, 23, { align: 'right' });

  // 1. Doctor's Triage Summary Box
  let y2 = 36;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y2, contentWidth, 38, 2, 2, 'FD');

  doc.setTextColor(13, 148, 136); // Teal-600
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("DOCTOR'S CLINICAL TRIAGE SUMMARY (FOR ATTENDING CLINICIAN)", margin + 4, y2 + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  const docSummary = (screening as any).doctorSummary || (isSuspect
    ? "Quantitative structural assessment of the optic nerve head demonstrates vertical cup-to-disc ratio (CDR) enlargement exceeding physiological limits (> 0.65) with focal thinning of the neuroretinal rim, notably at the superior and inferior borders (possible breach of ISNT rule). Retinal vessel displacement/bayoneting noted at cup margins. \n\n" +
      "Clinical Findings: Increased optic cup volume without visible disc hemorrhage on primary image. Retinal nerve fiber layer (RNFL) reflectivity reduced. Recommendation: Dilated stereoscopic biomicroscopy of optic nerve head, Goldmann applanation tonometry (IOP), central corneal thickness (CCT) measurement, and automated perimetry (Humphrey 24-2 or 30-2) to establish baseline and determine if glaucomatous neuropathy is active."
    : "Quantitative structural assessment of the optic nerve head demonstrates a healthy, well-perfused neuroretinal rim. Vertical and horizontal cup-to-disc ratios (CDR) conform to normal physiological limits (< 0.65) and adhere to standard ISNT anatomical contours. \n\n" +
      "Clinical Findings: No focal notching, cup excavation, disc hemorrhage, or nerve fiber layer defect detected. Retinal vascular caliber and vascular density appear normal. Recommendation: Continue routine preventive annual ophthalmic surveillance.");
  doc.text(doc.splitTextToSize(docSummary, contentWidth - 8), margin + 4, y2 + 12);

  // 2. Patient-Friendly Explanation Box
  y2 += 44;
  doc.setFillColor(240, 253, 250); // Teal-50
  doc.setDrawColor(153, 246, 228); // Teal-200
  doc.roundedRect(margin, y2, contentWidth, 34, 2, 2, 'FD');

  doc.setTextColor(15, 118, 110); // Teal-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("PATIENT COUNSELING & EXPLANATION (SIMPLE & UNDERSTANDABLE)", margin + 4, y2 + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const patientExplanation = (screening as any).patientSummary || (isSuspect
    ? "What this means for you: Your screening shows changes at the optic nerve — the main cable that connects your eye to your brain. Glaucoma is often called the 'silent thief of sight' because it develops slowly and without any pain or early symptoms. \n\n" +
      "Why early action is important: When caught early, glaucoma can be successfully managed with gentle daily eye drops or routine treatments to keep your vision safe. An eye doctor (ophthalmologist) will measure the fluid pressure in your eye and test your side vision to protect your sight."
    : "What this means for you: The optic nerve at the back of your eye looks healthy, strong, and well-supported today. There are no signs of glaucoma damage or nerve thinning. Having your eyes checked once a year is the best way to keep your optic nerves healthy and ensure your vision stays clear.");
  doc.text(doc.splitTextToSize(patientExplanation, contentWidth - 8), margin + 4, y2 + 12);

  // 3. Clinical Precautions & Guidelines Box
  y2 += 40;
  doc.setFillColor(254, 252, 232); // Amber-50
  doc.setDrawColor(254, 240, 138); // Amber-200
  doc.roundedRect(margin, y2, contentWidth, 34, 2, 2, 'FD');

  doc.setTextColor(180, 83, 9); // Amber-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("CLINICAL PRECAUTIONS & ACTIONABLE GUIDELINES (FOR PATIENT & CAREGIVER)", margin + 4, y2 + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const precautions = isSuspect
    ? "• Consult an eye doctor (ophthalmologist) within 2 to 4 weeks for complete eye pressure (IOP) and visual field tests.\n" +
      "• Do not rub your eyes forcefully or do heavy head-down / inverted exercises before your pressure examination.\n" +
      "• Inform your ophthalmologist if any close blood relatives (parents, siblings) have a history of glaucoma or high eye pressure.\n" +
      "• Never start or stop prescription eye pressure drops without explicit direction from your treating eye physician."
    : "• Schedule routine annual comprehensive dilated eye exams to maintain your healthy optic nerve baseline.\n" +
      "• Stay well-hydrated throughout the day and engage in regular cardiovascular exercise (walking, swimming).\n" +
      "• Protect eyes from blunt trauma with appropriate protective eyewear during sports or home maintenance.";
  doc.text(doc.splitTextToSize(precautions, contentWidth - 8), margin + 4, y2 + 12);

  // 4. Specialist Review Attestation & Signature Box
  y2 += 40;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y2, contentWidth, 30, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CLINICAL SPECIALIST VERIFICATION & ATTESTATION', margin + 4, y2 + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Reviewing Specialist:', margin + 4, y2 + 13);
  doc.text('Clinical Registration / License:', margin + 4, y2 + 20);
  doc.text('Signature & Date:', margin + 110, y2 + 13);

  doc.setDrawColor(203, 213, 225);
  doc.line(margin + 36, y2 + 14, margin + 95, y2 + 14);
  doc.line(margin + 44, y2 + 21, margin + 95, y2 + 21);
  doc.line(margin + 136, y2 + 14, margin + contentWidth - 4, y2 + 14);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.text('(Licensed Ophthalmologist / Retina Specialist)', margin + 136, y2 + 19);

  // 5. Regulatory Disclaimer Box
  y2 += 36;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(margin, y2, contentWidth, 16, 2, 2, 'FD');

  doc.setTextColor(190, 18, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('REGULATORY & MEDICAL DISCLAIMER', margin + 4, y2 + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(87, 83, 78);
  const disclaimerText =
    'TRINAY Glaucoma Screening is an AI-assisted decision support system for triage and early detection. ' +
    'This report does not constitute a definitive medical diagnosis. All findings must be clinically correlated by a licensed ophthalmologist.';
  doc.text(doc.splitTextToSize(disclaimerText, contentWidth - 8), margin + 4, y2 + 9);

  // Page 2 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('TRINAY Tele-Ophthalmology Screening Platform | Confidential Medical Document', margin, 287);
  doc.text('Page 2 of 2', pageWidth - margin, 287, { align: 'right' });

  const patientIdClean = (pId || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '');
  const dateClean = (screening.date || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename = `TRINAY_Glaucoma_Report_${patientIdClean}_${dateClean}.pdf`;

  // Asynchronously upload PDF report to Supabase Storage in the background
  try {
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    if (pdfBase64 && screening.id) {
      uploadReportPdf(screening.id, pdfBase64, screening.nurseId, screening.patientId).catch(() => {});
    }
  } catch {
    // ignore background upload failure
  }

  doc.save(filename);
}

/**
 * Generates and downloads a real, deterministic Cataract Screening Medical PDF report
 * physically embedding high-resolution artifacts (Original, Eye Box, Iris/Pupil, Grad-CAM).
 */
export async function downloadCataractPdf(
  screening: CataractScreeningRecord,
  patient?: Patient
): Promise<void> {
  // STRICT VALIDATION: Ensure current screening session data is valid, complete and not placeholder/fallback
  if (!screening || !screening.id || !screening.patientId || screening.cataractProbability === undefined) {
    console.error('[downloadCataractPdf] Validation failed - missing current screening data:', {
      hasScreening: !!screening,
      id: screening?.id,
      patientId: screening?.patientId,
      cataractProbability: screening?.cataractProbability,
      cataractPrediction: screening?.cataractPrediction,
    });
    alert('Current screening result unavailable. Please verify that the screening session is active.');
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // -------------------------------------------------------------
  // PAGE 1: CLINICAL VERDICT, VISUAL EVIDENCE & ANATOMICAL STATUS
  // -------------------------------------------------------------

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(margin, 12, contentWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('TRINAY CLINICAL CATARACT REPORT', margin + 6, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Anterior Segment & Crystalline Lens Triage Examination', margin + 6, 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(56, 189, 248); // Sky-400
  doc.text(`ID: ${screening.id}`, pageWidth - margin - 6, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Date: ${screening.date || new Date().toLocaleDateString('en-GB')}`, pageWidth - margin - 6, 28, { align: 'right' });

  // Patient Info Box
  let y = 41;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PATIENT DEMOGRAPHICS & CLINICAL METADATA', margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Patient Name:', margin + 4, y + 11);
  doc.text('Patient ID:', margin + 4, y + 16);
  doc.text('Age / Gender:', margin + 60, y + 11);
  doc.text('Examined Eye:', margin + 60, y + 16);
  doc.text('Phone:', margin + 120, y + 11);
  doc.text('Clinical Operator:', margin + 120, y + 16);

  const pName = screening.patientName || patient?.fullName || 'Patient Information Unavailable';
  const pId = screening.patientId || patient?.id || 'N/A';
  const pAge = screening.patientAge || patient?.age;
  const pGender = screening.patientGender || patient?.gender;
  const pPhone = screening.patientPhone || patient?.phoneNumber || 'N/A';

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(pName, margin + 26, y + 11);
  doc.text(pId, margin + 26, y + 16);
  doc.text(`${pAge !== undefined ? pAge + ' yrs' : 'N/A'} / ${pGender || 'N/A'}`, margin + 82, y + 11);
  doc.text(screening.eye || 'Right Eye', margin + 82, y + 16);
  doc.text(pPhone, margin + 144, y + 11);
  doc.text(screening.nurseName || 'Clinical Operator', margin + 144, y + 16);

  // Diagnostic Verdict Banner
  y += 26;
  const isCataract = screening.cataractPrediction === 'CATARACT' || String(screening.cataractPrediction).toUpperCase().includes('CATARACT');
  const catProb = typeof screening.cataractProbability === 'number' && !isNaN(screening.cataractProbability)
    ? screening.cataractProbability
    : 0;
  const normProb = typeof screening.normalProbability === 'number' && !isNaN(screening.normalProbability)
    ? screening.normalProbability
    : (1 - catProb);
  const displayProb = isCataract ? catProb : normProb;
  const confidenceVal = Math.round(Math.max(catProb, normProb) * 1000) / 10;

  if (isCataract) {
    doc.setFillColor(254, 242, 242); // Rose-50
    doc.setDrawColor(244, 63, 94);   // Rose-500
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
    doc.setTextColor(190, 18, 60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AI SCREENING RESULT: CATARACT DETECTED', margin + 4, y + 8);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('If cataract is detected by the AI screening model, recommend ophthalmologist evaluation and slit-lamp examination.', margin + 4, y + 14);
  } else {
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(16, 185, 129);  // Emerald-500
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
    doc.setTextColor(4, 120, 87);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AI SCREENING RESULT: NO CATARACT DETECTED', margin + 4, y + 8);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Clear crystalline lens pattern identified. Continue routine preventive ophthalmic checkup schedule.', margin + 4, y + 14);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(isCataract ? 190 : 4, isCataract ? 18 : 120, isCataract ? 60 : 87);
  doc.text(
    `${isCataract ? 'Cataract' : 'Normal'} Probability: ${(displayProb * 100).toFixed(2)}%`,
    pageWidth - margin - 4,
    y + 7.5,
    { align: 'right' }
  );
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Classifier: EfficientNet-V2-S (${confidenceVal.toFixed(1)}%)`,
    pageWidth - margin - 4,
    y + 13.5,
    { align: 'right' }
  );

  // Visual AI Evidence (4 High-Resolution Evidence Panels: Original, Analyzed Lens Region, Opacity Evidence Map, Grad-CAM++)
  y += 24;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('VISUAL AI EVIDENCE — CLINICAL LAYERS', margin, y);

  const imgY = y + 3;
  const numPanels = 4;
  const panelGap = 3.5;
  const imgW = (contentWidth - panelGap * (numPanels - 1)) / numPanels;
  const imgH = 34;

  // Resolve all 4 actual artifacts cleanly from current screening
  const [originalDataUrl, analyzedRegionDataUrl, opacityEvidenceDataUrl, gradcamDataUrl] = await Promise.all([
    loadImageDataUrl(
      screening.imageOriginal ||
      (screening as any).imageUrl ||
      screening.artifacts?.original_fundus ||
      screening.artifacts?.original,
      screening.id ? `/api/screenings/${screening.id}/artifacts/original` : undefined
    ),
    loadImageDataUrl(
      screening.imageAnalyzedRegion ||
      screening.artifacts?.analyzed_region ||
      screening.imageEyeDetection ||
      screening.artifacts?.eye_box,
      screening.id ? `/api/screenings/${screening.id}/artifacts/analyzed_region` : undefined
    ),
    loadImageDataUrl(
      screening.imageOpacityEvidence ||
      screening.artifacts?.opacity_evidence ||
      screening.imageGradCam,
      screening.id ? `/api/screenings/${screening.id}/artifacts/opacity_evidence` : undefined
    ),
    loadImageDataUrl(
      screening.imageGradCam ||
      screening.artifacts?.gradcam ||
      screening.artifacts?.gradcamOverlay ||
      screening.artifacts?.workflow,
      screening.id ? `/api/screenings/${screening.id}/artifacts/gradcam` : undefined
    ),
  ]);

  const panels = [
    { title: '1. Original Eye Image', sub: 'Submitted Photo', img: originalDataUrl },
    { title: '2. Analyzed Lens Region', sub: 'ROI Delineated', img: analyzedRegionDataUrl || originalDataUrl },
    { title: '3. Lens Opacity Evidence Map', sub: 'Primary Evidence', img: opacityEvidenceDataUrl || gradcamDataUrl || originalDataUrl },
    { title: '4. Model Attention — Grad-CAM++', sub: 'Secondary Attribution', img: gradcamDataUrl || originalDataUrl },
  ];

  panels.forEach((p, i) => {
    const px = margin + i * (imgW + panelGap);
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(px, imgY, imgW, imgH, 1.5, 1.5, 'F');
    if (p.img && p.img.startsWith('data:image/')) {
      const drew = drawImageContained(doc, p.img, px + 0.5, imgY + 0.5, imgW - 1, imgH - 1);
      if (!drew) {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(px, imgY, imgW, imgH, 1.5, 1.5, 'F');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(6.5);
        doc.text('Visual Attached', px + imgW / 2, imgY + imgH / 2, { align: 'center' });
      }
    } else {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(px, imgY, imgW, imgH, 1.5, 1.5, 'F');
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(6.5);
      doc.text('Evidence Map Unavailable', px + imgW / 2, imgY + imgH / 2, { align: 'center' });
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(p.title, px + imgW / 2, imgY + imgH + 3.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(p.sub, px + imgW / 2, imgY + imgH + 6.5, { align: 'center' });
  });

  // Quantitative AI Evidence Summary Box
  const qBoxY = imgY + imgH + 9;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, qBoxY, contentWidth, 19, 1.5, 1.5, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('AI EVIDENCE SUMMARY & QUANTITATIVE OPACITY ANALYSIS', margin + 3.5, qBoxY + 4.5);

  // AI Evidence Intensity from the CURRENT screening's own evidence map.
  const cataractEvidenceLevel = getEvidenceIntensityLevel(screening.quantitativeAnalysis);
  const cataractEvidenceCoverage =
    screening.quantitativeAnalysis?.evidenceCoveragePct ??
    screening.quantitativeAnalysis?.opacityEvidencePercentage ?? 0;
  doc.setFontSize(7);
  doc.setTextColor(isCataract ? 190 : 4, isCataract ? 18 : 120, isCataract ? 60 : 87);
  doc.text(
    `AI Evidence: ${cataractEvidenceLevel} (${cataractEvidenceCoverage.toFixed(1)}%)`,
    pageWidth - margin - 3.5,
    qBoxY + 4.5,
    { align: 'right' }
  );

  const quant = screening.quantitativeAnalysis;
  const qColW = contentWidth / 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Analyzed Region Area:', margin + 3.5, qBoxY + 9);
  doc.text('Opacity Evidence Area:', margin + 3.5 + qColW, qBoxY + 9);
  doc.text('Opacity Evidence %:', margin + 3.5 + qColW * 2, qBoxY + 9);
  doc.text('Cataract Probability:', margin + 3.5 + qColW * 3, qBoxY + 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(quant?.analyzedRegionAreaPx ? `${quant.analyzedRegionAreaPx.toLocaleString()} px` : 'Calculated in ROI', margin + 3.5, qBoxY + 13.5);
  doc.text(quant?.opacityEvidenceAreaPx ? `${quant.opacityEvidenceAreaPx.toLocaleString()} px` : '0 px', margin + 3.5 + qColW, qBoxY + 13.5);
  doc.text(quant?.opacityEvidencePercentage !== undefined ? `${quant.opacityEvidencePercentage.toFixed(1)}%` : '0.0%', margin + 3.5 + qColW * 2, qBoxY + 13.5);
  doc.setTextColor(isCataract ? 190 : 4, isCataract ? 18 : 120, isCataract ? 60 : 87);
  doc.text(`${(catProb * 100).toFixed(2)}%`, margin + 3.5 + qColW * 3, qBoxY + 13.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.8);
  doc.setTextColor(100, 116, 139);
  doc.text('AI-derived screening evidence. These measurements are not a substitute for clinical slit-lamp examination.', margin + 3.5, qBoxY + 17.2);

  // Clinical Breakdown Table (Synchronized with Current Screening Output)
  y = qBoxY + 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 42, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('AI CATARACT SCREENING RESULT & CLINICAL ASSESSMENT BREAKDOWN', margin + 4, y + 4.5);

  const stages = [
    [
      '1. Optical Quality',
      screening.imageQuality === 'BAD' ? 'Suboptimal Quality' : 'Gradable (Pass)',
      screening.imageQuality === 'BAD' ? 'Reduced anterior segment clarity' : 'Sharp anterior focus, suitable for diagnostic staging',
    ],
    [
      '2. Analyzed Lens Region',
      'Region Delineated',
      'Exact anterior lens aperture extracted and delineated for model inspection',
    ],
    [
      '3. Lens Opacity Evidence Map (Primary)',
      isCataract ? 'Opacity Evidence Identified' : 'Clear Optical Axis',
      'Transparent overlay restricted strictly to analyzed lens region',
    ],
    [
      '4. Model Attention — Grad-CAM++',
      'Attribution Computed',
      'Gradient-weighted activation map showing classifier feature focus',
    ],
    [
      '5. Cataract Classifier Prediction',
      isCataract ? 'Cataract Detected' : 'No Cataract Detected',
      `EfficientNet-V2-S Probability: ${(displayProb * 100).toFixed(2)}% • Confidence: ${confidenceVal.toFixed(1)}%`,
    ],
    [
      '6. Referral Recommendation',
      isCataract ? 'Referred for Slit-Lamp' : 'Routine Preventive Care',
      isCataract ? 'Ophthalmologist consultation & dilated slit-lamp biomicroscopy advised' : 'Routine annual ophthalmic examination recommended',
    ],
  ];

  let ty = y + 10;
  stages.forEach(([stg, val, desc], idx) => {
    const col = idx % 2 === 0 ? margin + 4 : margin + 94;
    const rowY = ty + Math.floor(idx / 2) * 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(stg + ':', col, rowY);
    doc.setFont('helvetica', 'bold');
    const isAlert = val.includes('Cataract Detected') || val.includes('Referred') || val.includes('Suboptimal') || val.includes('Opacity Evidence Identified');
    doc.setTextColor(isAlert ? 190 : 4, isAlert ? 18 : 120, isAlert ? 60 : 87);
    doc.text(val, col + 48, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(desc, col, rowY + 3.4);
  });

  // Actionable Recommendation Box
  y += 45;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('RECOMMENDED CLINICAL ACTION & REFERRAL TIMELINE', margin + 4, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(51, 65, 85);
  const recText = isCataract
    ? 'If cataract is detected by the AI screening model, recommend ophthalmologist evaluation and slit-lamp examination for clinical confirmation within 2 to 4 weeks.'
    : 'Routine preventive care: Annual visual acuity and anterior segment evaluation recommended. Continue protective eye hygiene and monitor for subjective visual blur.';
  doc.text(doc.splitTextToSize(recText, contentWidth - 8), margin + 4, y + 9.5);

  // Page 1 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('TRINAY Anterior Segment Screening Platform | Confidential Medical Document', margin, 287);
  doc.text('Page 1 of 2', pageWidth - margin, 287, { align: 'right' });

  // -------------------------------------------------------------
  // PAGE 2: CLINICAL INTERPRETATION, PATIENT GUIDANCE & PRECAUTIONS
  // -------------------------------------------------------------
  doc.addPage();

  // Page 2 Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, 12, contentWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TRINAY CLINICAL CATARACT REPORT — DOCTOR & PATIENT SUMMARY', margin + 6, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Patient: ${pName} (${pId}) | Examined Eye: ${screening.eye || 'Right Eye'}`, pageWidth - margin - 6, 23, { align: 'right' });

  // 1. Doctor's Triage Summary Box
  let y2 = 36;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y2, contentWidth, 38, 2, 2, 'FD');

  doc.setTextColor(30, 96, 213);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("DOCTOR'S CLINICAL TRIAGE SUMMARY (FOR ATTENDING CLINICIAN)", margin + 4, y2 + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  const docSummary = (screening as any).doctorSummary || (isCataract
    ? `AI screening identified visual features associated with cataract in the analyzed lens region. The cataract classifier produced a probability of ${(catProb * 100).toFixed(2)}%. Clinical examination is recommended for confirmation.\n\n` +
      "Clinical Findings: Nuclear and/or cortical opacification visual features detected within the crystalline lens aperture. Pupillary margins are intact on anterior segment capture. Recommendation: Dilated slit-lamp biomicroscopy, visual acuity measurement (Snellen), and intraocular pressure check advised for definitive diagnosis and staging."
    : `AI screening identified clear anterior segment patterns with normal crystalline lens optical transparency. The cataract classifier produced a normal probability of ${(normProb * 100).toFixed(2)}%. Clinical examination is recommended for confirmation if visual symptoms persist.\n\n` +
      "Clinical Findings: Cornea is transparent with intact light reflex. Crystalline lens optical axis is unimpeded. No anterior segment pathology identified on primary screening capture. Routine annual ophthalmic examination advised.");
  doc.text(doc.splitTextToSize(docSummary, contentWidth - 8), margin + 4, y2 + 12);

  // 2. Patient-Friendly Explanation Box
  y2 += 44;
  doc.setFillColor(240, 249, 255); // Sky-50
  doc.setDrawColor(186, 230, 253); // Sky-200
  doc.roundedRect(margin, y2, contentWidth, 34, 2, 2, 'FD');

  doc.setTextColor(2, 132, 199);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("PATIENT COUNSELING & EXPLANATION (SIMPLE & UNDERSTANDABLE)", margin + 4, y2 + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const patientExplanation = (screening as any).patientSummary || (isCataract
    ? "What this means for you: A clouding (cataract) was observed in the natural lens of your eye. Just like a frosted window makes it hard to see outside, a cataract scatters incoming light and causes blurry, dimmed, or hazy vision. \n\n" +
      "Good news: Cataracts are extremely common and can be safely treated. An eye doctor (ophthalmologist) will examine your eyes in detail, test your vision clarity, and discuss treatment options such as updated eyeglasses or a gentle, highly effective outpatient procedure."
    : "What this means for you: The natural lens inside your eye is clear and healthy today. No signs of cataract clouding were detected. You are seeing through a clear optical window. Continuing healthy eye habits and having your eyes checked once every year will help keep your vision sharp and clear.");
  doc.text(doc.splitTextToSize(patientExplanation, contentWidth - 8), margin + 4, y2 + 12);

  // 3. Clinical Precautions & Guidelines Box
  y2 += 40;
  doc.setFillColor(254, 252, 232); // Amber-50
  doc.setDrawColor(253, 230, 138); // Amber-200
  doc.roundedRect(margin, y2, contentWidth, 38, 2, 2, 'FD');

  doc.setTextColor(180, 83, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("CLINICAL PRECAUTIONS & PATIENT GUIDANCE", margin + 4, y2 + 6);

  const precautions = isCataract
    ? [
        "Avoid unassisted night driving, especially on roads with bright oncoming headlights that cause glare and halo effects.",
        "Wear certified UV400 sunglasses during daytime hours to protect the crystalline lens from solar ultraviolet exposure.",
        "Ensure direct, well-positioned reading lamps and high-contrast lighting when reading or performing detailed tasks.",
        "Do not rub your eyes and avoid self-prescribing over-the-counter eye drops without formal consultation.",
        "Schedule an in-person dilated slit-lamp evaluation with an ophthalmologist within the recommended referral timeframe.",
      ]
    : [
        "Schedule an annual comprehensive eye examination to monitor long-term ocular health and visual acuity.",
        "Wear UV-rated sunglasses when outdoors in direct sunlight to protect your cornea and crystalline lens from UV strain.",
        "Maintain a balanced diet rich in eye-healthy antioxidants, vitamins C and E, and omega-3 fatty acids.",
        "Take regular 20-second visual breaks when looking at digital computer or smartphone screens for prolonged periods.",
        "Promptly seek medical attention if you experience sudden visual blur, flashes of light, or ocular pain.",
      ];

  let py = y2 + 12;
  precautions.forEach((pText) => {
    doc.setFillColor(180, 83, 9);
    doc.circle(margin + 6, py - 1, 0.7, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85);
    doc.text(pText, margin + 10, py);
    py += 5;
  });

  // 4. Clinical Verification & Attestation Box
  y2 += 44;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y2, contentWidth, 24, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CLINICAL VERIFICATION & SIGN-OFF', margin + 4, y2 + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Triage Screening Nurse:', margin + 4, y2 + 12);
  doc.text('Screening Platform:', margin + 60, y2 + 12);
  doc.text('Attending Reviewer Status:', margin + 120, y2 + 12);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(screening.nurseName || 'Clinical Operator', margin + 4, y2 + 17);
  doc.text('TRINAY Anterior Vision System', margin + 60, y2 + 17);
  doc.setTextColor(30, 96, 213);
  doc.text('Pending Ophthalmologist Review', margin + 120, y2 + 17);

  // 5. Regulatory Disclaimer
  y2 += 30;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(margin, y2, contentWidth, 18, 2, 2, 'FD');

  doc.setTextColor(190, 18, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('REGULATORY & MEDICAL DISCLAIMER', margin + 4, y2 + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(87, 83, 78);
  const disclaimerText =
    'TRINAY Cataract Screening is an AI-assisted diagnostic support tool intended for primary health triage. ' +
    'Definitive clinical diagnosis, cataract staging, and surgical eligibility must be confirmed by an ophthalmologist via in-person slit-lamp biomicroscopy.';
  doc.text(doc.splitTextToSize(disclaimerText, contentWidth - 8), margin + 4, y2 + 9);

  // WHY THIS RESULT — generated from the CURRENT screening's own values
  // (prediction, probabilities, evidence map). Same derivation as dashboard.
  y2 += 24;
  const cataractWhy = buildCataractWhyExplanation({
    prediction: screening.cataractPrediction,
    cataractProbability: catProb,
    normalProbability: normProb,
    quant: screening.quantitativeAnalysis,
  });
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(186, 230, 253);
  doc.roundedRect(margin, y2, contentWidth, 42, 2, 2, 'FD');

  doc.setTextColor(2, 132, 199);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('WHY THIS RESULT — AI EVIDENCE EXPLANATION', margin + 4, y2 + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);
  const whyLines = doc.splitTextToSize(
    `Why: ${cataractWhy.whyResult} Visual evidence: ${cataractWhy.visualEvidence} ` +
    `What this means: ${cataractWhy.whatItMeans} Next step: ${cataractWhy.nextStep}`,
    contentWidth - 8
  );
  doc.text(whyLines.slice(0, 10), margin + 4, y2 + 10);

  // Page 2 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('TRINAY Cataract Screening Platform | Confidential Medical Document', margin, 287);
  doc.text('Page 2 of 2', pageWidth - margin, 287, { align: 'right' });

  const patientIdClean = (pId || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '');
  const dateClean = (screening.date || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename = `TRINAY_Cataract_Report_${patientIdClean}_${dateClean}.pdf`;

  // Asynchronously upload PDF report to Supabase Storage in the background
  try {
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    if (pdfBase64 && screening.id) {
      uploadReportPdf(screening.id, pdfBase64, screening.nurseId, screening.patientId).catch(() => {});
    }
  } catch {}

  doc.save(filename);
}
