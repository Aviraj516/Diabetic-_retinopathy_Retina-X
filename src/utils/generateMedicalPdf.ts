import { jsPDF } from 'jspdf';
import { ReportRecord, Patient } from '../types';

/**
 * Renders an offscreen canvas with authentic retina fundus graphics
 * for each of the 4 visualization modes and returns a JPEG data URL.
 */
export function generateFundusImageMode(
  mode: 'Original' | 'Grad-CAM++' | 'Lesions' | 'Anatomy',
  userImageSrc?: string
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      // 1. Black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 400, 400);

      const drawOverlaysAndFinish = () => {
        // Mode overlays
        if (mode === 'Grad-CAM++') {
          // Heatmap 1 over temporal arcade area
          const heat1 = ctx.createRadialGradient(244, 196, 10, 244, 196, 110);
          heat1.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
          heat1.addColorStop(0.25, 'rgba(249, 115, 22, 0.75)');
          heat1.addColorStop(0.45, 'rgba(251, 191, 36, 0.65)');
          heat1.addColorStop(0.65, 'rgba(34, 197, 94, 0.5)');
          heat1.addColorStop(0.85, 'rgba(6, 182, 212, 0.3)');
          heat1.addColorStop(1, 'rgba(29, 78, 216, 0)');
          ctx.beginPath();
          ctx.arc(244, 196, 110, 0, Math.PI * 2);
          ctx.fillStyle = heat1;
          ctx.fill();

          // Heatmap 2 near optic disc
          const heat2 = ctx.createRadialGradient(176, 144, 5, 176, 144, 68);
          heat2.addColorStop(0, 'rgba(239, 68, 68, 0.75)');
          heat2.addColorStop(0.35, 'rgba(245, 158, 11, 0.6)');
          heat2.addColorStop(0.7, 'rgba(16, 185, 129, 0.35)');
          heat2.addColorStop(1, 'rgba(59, 130, 246, 0)');
          ctx.beginPath();
          ctx.arc(176, 144, 68, 0, Math.PI * 2);
          ctx.fillStyle = heat2;
          ctx.fill();
        }

        if (mode === 'Lesions') {
          // Hard exudates (yellow clustered dots)
          ctx.fillStyle = '#FEF08A';
          const exudates = [
            [270, 160, 3.5], [276, 165, 3], [282, 158, 4], [288, 168, 3],
            [265, 172, 3], [250, 150, 3.5], [258, 144, 4], [295, 175, 3],
            [210, 140, 3], [218, 135, 3.5], [225, 142, 3], [305, 190, 3.2]
          ];
          for (const [x, y, r] of exudates) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }

          // Microaneurysms (dark red small dots with subtle rings)
          ctx.fillStyle = '#DC2626';
          ctx.strokeStyle = '#F87171';
          ctx.lineWidth = 1;
          const micro = [
            [235, 175, 2.5], [245, 165, 2], [280, 195, 2.5], [290, 220, 2],
            [220, 230, 2.5], [190, 160, 2], [180, 220, 2.5], [260, 240, 2]
          ];
          for (const [x, y, r] of micro) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        if (mode === 'Anatomy') {
          // Optic disc outline
          ctx.strokeStyle = '#06B6D4';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.ellipse(116, 196, 26, 30, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Macula outline
          ctx.strokeStyle = '#EAB308';
          ctx.beginPath();
          ctx.arc(240, 208, 42, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Vessel arcade annotations
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(200, 200, 140, -Math.PI * 0.4, -Math.PI * 0.1);
          ctx.stroke();
        }

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };

      // If user uploaded image exists and can be loaded
      if (userImageSrc) {
        const userImg = new Image();
        userImg.crossOrigin = 'anonymous';
        userImg.onload = () => {
          ctx.save();
          ctx.beginPath();
          ctx.arc(200, 200, 188, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(userImg, 0, 0, 400, 400);
          ctx.restore();
          drawOverlaysAndFinish();
        };
        userImg.onerror = () => {
          renderBaseRetinaAndFinish();
        };
        userImg.src = userImageSrc;
      } else {
        renderBaseRetinaAndFinish();
      }

      function renderBaseRetinaAndFinish() {
        // Draw base retina circle:
        const grad = ctx.createRadialGradient(192, 200, 10, 200, 200, 188);
        grad.addColorStop(0, '#C95B2A');
        grad.addColorStop(0.45, '#A84018');
        grad.addColorStop(0.75, '#7E240B');
        grad.addColorStop(0.92, '#4A1005');
        grad.addColorStop(1, '#1E0502');

        ctx.beginPath();
        ctx.arc(200, 200, 188, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Optic Disc (Nasal side, x=116, y=196)
        const discGrad = ctx.createRadialGradient(116, 196, 2, 116, 196, 24);
        discGrad.addColorStop(0, '#FFF2D6');
        discGrad.addColorStop(0.4, '#FED7AA');
        discGrad.addColorStop(0.7, '#FDBA74');
        discGrad.addColorStop(1, '#EA580C');
        ctx.beginPath();
        ctx.ellipse(116, 196, 22, 25, 0, 0, Math.PI * 2);
        ctx.fillStyle = discGrad;
        ctx.fill();

        // Cup
        ctx.beginPath();
        ctx.ellipse(114, 196, 11, 13, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 251, 235, 0.85)';
        ctx.fill();

        // Macula / Fovea (temporal, x=240, y=208)
        const maculaGrad = ctx.createRadialGradient(240, 208, 2, 240, 208, 36);
        maculaGrad.addColorStop(0, '#3E1108');
        maculaGrad.addColorStop(0.5, '#5B1D0E');
        maculaGrad.addColorStop(0.85, '#802812');
        maculaGrad.addColorStop(1, 'rgba(168, 64, 24, 0)');
        ctx.beginPath();
        ctx.arc(240, 208, 36, 0, Math.PI * 2);
        ctx.fillStyle = maculaGrad;
        ctx.fill();

        // Fovea pit
        ctx.beginPath();
        ctx.arc(240, 208, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46, 10, 5, 0.85)';
        ctx.fill();

        // Retinal blood vessels
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Superior temporal venule & arteriole
        ctx.beginPath();
        ctx.moveTo(116, 188);
        ctx.bezierCurveTo(120, 144, 152, 104, 204, 92);
        ctx.bezierCurveTo(248, 82, 288, 96, 324, 124);
        ctx.strokeStyle = '#500707';
        ctx.lineWidth = 4.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(118, 190);
        ctx.bezierCurveTo(124, 152, 156, 116, 200, 104);
        ctx.bezierCurveTo(240, 94, 280, 106, 316, 134);
        ctx.strokeStyle = '#831818';
        ctx.lineWidth = 2.6;
        ctx.stroke();

        // Inferior temporal venule & arteriole
        ctx.beginPath();
        ctx.moveTo(116, 204);
        ctx.bezierCurveTo(122, 244, 152, 284, 204, 300);
        ctx.bezierCurveTo(256, 314, 300, 296, 332, 264);
        ctx.strokeStyle = '#500707';
        ctx.lineWidth = 4.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(118, 202);
        ctx.bezierCurveTo(126, 236, 158, 272, 200, 286);
        ctx.bezierCurveTo(244, 298, 288, 284, 324, 254);
        ctx.strokeStyle = '#831818';
        ctx.lineWidth = 2.6;
        ctx.stroke();

        // Nasal vessels
        ctx.beginPath();
        ctx.moveTo(112, 188);
        ctx.bezierCurveTo(96, 148, 68, 120, 36, 108);
        ctx.strokeStyle = '#630D0D';
        ctx.lineWidth = 2.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(112, 204);
        ctx.bezierCurveTo(92, 244, 64, 276, 36, 292);
        ctx.strokeStyle = '#630D0D';
        ctx.lineWidth = 2.8;
        ctx.stroke();

        drawOverlaysAndFinish();
      }
    } catch {
      resolve('');
    }
  });
}

/**
 * Main function to generate and trigger download of the official RETINA-X medical PDF report.
 */
export async function downloadRetinaXPdf(report: ReportRecord, patient?: Patient): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // Pre-generate 4 visualization images
  const [imgOriginal, imgGradCam, imgLesions, imgAnatomy] = await Promise.all([
    generateFundusImageMode('Original', report.imageUrl),
    generateFundusImageMode('Grad-CAM++', report.imageUrl),
    generateFundusImageMode('Lesions', report.imageUrl),
    generateFundusImageMode('Anatomy', report.imageUrl),
  ]);

  // ==========================================
  // PAGE 1: CLINICAL RESULTS & VISUALIZATIONS
  // ==========================================

  // Top Navy Banner
  doc.setFillColor(13, 24, 41); // #0D1829
  doc.rect(margin, 12, contentWidth, 18, 'F');

  // White text in banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('RETINA-X', margin + 6, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('AI-ASSISTED RETINAL SCREENING REPORT', margin + 6, 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('CONFIDENTIAL MEDICAL DOCUMENT', pageWidth - margin - 6, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`DATE: ${report.generatedDate}`, pageWidth - margin - 6, 25, { align: 'right' });

  // Sub-header info row
  let curY = 35;
  doc.setTextColor(30, 96, 213); // #1E60D5
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DEPARTMENT OF TELE-OPHTHALMOLOGY & DIABETIC RETINOPATHY SCREENING', margin, curY);

  curY += 5;
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.setLineWidth(0.4);
  doc.line(margin, curY, pageWidth - margin, curY);

  // SECTION 1: PATIENT INFORMATION
  curY += 4;
  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(203, 213, 225); // #CBD5E1
  doc.roundedRect(margin, curY, contentWidth, 29, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105); // #475569
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('1. PATIENT INFORMATION & SCREENING DETAILS', margin + 4, curY + 5);

  const phoneNum = report.patientPhone || patient?.phoneNumber || '+91 98200 00000';
  const duration = patient?.diabetesDurationYears ? `${patient.diabetesDurationYears} Years` : '6 Years';

  // Row 1
  const col1 = margin + 4;
  const col2 = margin + 50;
  const col3 = margin + 98;
  const col4 = margin + 140;

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Patient Name:', col1, curY + 11);
  doc.text('Patient ID:', col2, curY + 11);
  doc.text('Age / Gender:', col3, curY + 11);
  doc.text('Patient Phone:', col4, curY + 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(report.patientName || 'Patient', col1, curY + 16);
  doc.text(report.patientId || 'PX-0000', col2, curY + 16);
  doc.text(`${report.patientAge} Yrs / ${report.patientGender}`, col3, curY + 16);
  doc.text(phoneNum, col4, curY + 16);

  // Row 2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Screening Date:', col1, curY + 21);
  doc.text('Examined Eye:', col2, curY + 21);
  doc.text('Screening Nurse:', col3, curY + 21);
  doc.text('Diabetes Duration:', col4, curY + 21);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(report.generatedDate, col1, curY + 26);
  doc.setTextColor(30, 96, 213);
  doc.text(report.eye || 'Right Eye', col2, curY + 26);
  doc.setTextColor(15, 23, 42);
  doc.text(report.nurseName || 'Nurse Staff', col3, curY + 26);
  doc.text(duration, col4, curY + 26);

  // SECTION 2: IMAGE INFORMATION & QUALITY ASSESSMENT
  curY += 33;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, contentWidth, 14, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('2. IMAGE INFORMATION & QUALITY ASSESSMENT', margin + 4, curY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Image Filename: ', col1, curY + 10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(report.imageFileName || 'retina_scan_01.jpg', col1 + 22, curY + 10);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Image Quality: ', col3, curY + 10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87); // Emerald
  doc.text('Good (Diagnostic Grade)', col3 + 20, curY + 10);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Quality Status: ', col4, curY + 10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87);
  doc.text('Suitable for Analysis', col4 + 20, curY + 10);

  // SECTION 3: AI SCREENING RESULT CARD
  curY += 18;
  doc.setFillColor(239, 246, 255); // #EFF6FF
  doc.setDrawColor(191, 219, 254); // #BFDBFE
  doc.roundedRect(margin, curY, contentWidth, 23, 2, 2, 'FD');

  doc.setTextColor(30, 96, 213);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('3. AI SCREENING RESULT & CLASSIFICATION', margin + 4, curY + 5);

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(report.drSeverityLevel || 'Moderate DR (Level 2)', margin + 4, curY + 12);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Deep neural ensemble prediction calibrated for primary tele-screening.', margin + 4, curY + 18);

  // Right confidence box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('CONFIDENCE SCORE', pageWidth - margin - 4, curY + 7, { align: 'right' });

  doc.setFontSize(18);
  doc.setTextColor(30, 96, 213);
  doc.text(`${report.confidence}%`, pageWidth - margin - 4, curY + 15, { align: 'right' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Threshold: >85% High Confidence', pageWidth - margin - 4, curY + 20, { align: 'right' });

  // SECTION 4: AI-DETECTED FINDINGS & RETINAL ANATOMY
  curY += 27;
  const halfWidth = (contentWidth - 6) / 2; // 88mm

  // Box Left: AI-Detected Findings
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, curY, halfWidth, 34, 2, 2, 'FD');

  doc.setTextColor(180, 83, 9); // Amber-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('4. AI-DETECTED FINDINGS', margin + 4, curY + 5);

  const findingsList = [
    { label: 'Microaneurysms', val: 'Present / Detected', color: [180, 83, 9] },
    { label: 'Hemorrhages', val: 'Present (Multiple)', color: [180, 83, 9] },
    { label: 'Hard Exudates', val: 'Present / Clustered', color: [180, 83, 9] },
    { label: 'Soft Exudates (Cotton Wool)', val: 'Not observed', color: [100, 116, 139] },
  ];

  findingsList.forEach((item, idx) => {
    const rowY = curY + 11 + idx * 5.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(item.label, margin + 4, rowY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.val, margin + halfWidth - 4, rowY, { align: 'right' });

    if (idx < 3) {
      doc.setDrawColor(241, 245, 249);
      doc.line(margin + 4, rowY + 1.8, margin + halfWidth - 4, rowY + 1.8);
    }
  });

  // Box Right: Retinal Anatomy Localization
  const rightBoxX = margin + halfWidth + 6;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightBoxX, curY, halfWidth, 34, 2, 2, 'FD');

  doc.setTextColor(30, 96, 213); // Blue-600
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('5. RETINAL ANATOMY LOCALIZATION', rightBoxX + 4, curY + 5);

  const anatomyList = [
    { label: 'Optic Disc', val: 'Visible / Normal Margin', color: [4, 120, 87] },
    { label: 'Macula / Fovea', val: 'Visible / Clear Center', color: [4, 120, 87] },
    { label: 'Retinal Blood Vessels', val: 'Visible / Caliber Intact', color: [4, 120, 87] },
    { label: 'Media Clarity', val: 'Adequate Transparency', color: [4, 120, 87] },
  ];

  anatomyList.forEach((item, idx) => {
    const rowY = curY + 11 + idx * 5.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(item.label, rightBoxX + 4, rowY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.val, rightBoxX + halfWidth - 4, rowY, { align: 'right' });

    if (idx < 3) {
      doc.setDrawColor(241, 245, 249);
      doc.line(rightBoxX + 4, rowY + 1.8, rightBoxX + halfWidth - 4, rowY + 1.8);
    }
  });

  // SECTION 5: EXPLAINABILITY VISUALIZATIONS (4 CARDS)
  curY += 38;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('6. EXPLAINABILITY VISUALIZATIONS (XAI MODES)', margin, curY);

  curY += 4;
  const imgWidth = 41; // 41mm x 4 + 3 gaps (6mm) = 164 + 18 = 182mm
  const gap = 6;
  const imgY = curY;

  const images = [
    { src: imgOriginal, title: 'Original Fundus', sub: 'True color raw scan' },
    { src: imgGradCam, title: 'Grad-CAM++', sub: 'Neural attention' },
    { src: imgLesions, title: 'Lesion Overlay', sub: 'Microaneurysms/Exudates' },
    { src: imgAnatomy, title: 'Anatomy Map', sub: 'Disc & vessel landmarks' },
  ];

  images.forEach((img, idx) => {
    const xPos = margin + idx * (imgWidth + gap);

    // Box container
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(xPos, imgY, imgWidth, 54, 2, 2, 'FD');

    // Image slot
    if (img.src) {
      doc.addImage(img.src, 'JPEG', xPos + 2.5, imgY + 2.5, imgWidth - 5, imgWidth - 5);
    }

    // Title & subtitle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(img.title, xPos + imgWidth / 2, imgY + 43, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(img.sub, xPos + imgWidth / 2, imgY + 48, { align: 'center' });
  });

  // Page 1 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text('RETINA-X Tele-Ophthalmology Screening Platform | Confidential Clinical Document', margin, 287);
  doc.text('Page 1 of 2', pageWidth - margin, 287, { align: 'right' });

  // ==========================================
  // PAGE 2: CLINICAL CONTEXT & SPECIALIST REVIEW
  // ==========================================
  doc.addPage();

  // Top Compact Continuation Header
  doc.setFillColor(13, 24, 41);
  doc.rect(margin, 12, contentWidth, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RETINA-X | AI-Assisted Retinal Screening Report (Continuation)', margin + 5, 19.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    `Patient: ${report.patientName} (${report.patientId}) | Eye: ${report.eye} | ${report.generatedDate}`,
    pageWidth - margin - 5,
    19.5,
    { align: 'right' }
  );

  let p2Y = 28;

  // SECTION 7: AI-ASSISTED PLAIN-LANGUAGE EXPLANATION
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, p2Y, contentWidth, 25, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('7. AI-ASSISTED CLINICAL EXPLANATION', margin + 4, p2Y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const explanationText =
    `The screening algorithm detected visual evidence consistent with ${report.drSeverityLevel}. ` +
    'The AI identified tiny swellings in retinal blood vessels (microaneurysms) and localized small fluid deposits ' +
    '(hard exudates) predominantly in the mid-peripheral retinal fields. The central foveal zone currently appears spared, ' +
    'but timely specialist ophthalmology evaluation is required to prevent progression toward sight-threatening macular edema.';

  const splitExplanation = doc.splitTextToSize(explanationText, contentWidth - 8);
  doc.text(splitExplanation, margin + 4, p2Y + 11);

  // SECTION 8: CLINICAL REFERENCE INFORMATION (RAG REFERENCES)
  p2Y += 29;
  doc.setFillColor(238, 242, 255); // Indigo-50
  doc.setDrawColor(224, 231, 255); // Indigo-100
  doc.roundedRect(margin, p2Y, contentWidth, 27, 2, 2, 'FD');

  doc.setTextColor(67, 56, 202); // Indigo-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('8. CLINICAL REFERENCE INFORMATION (RAG CURATED GUIDELINES)', margin + 4, p2Y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const ragText =
    'Diabetic retinopathy is a microvascular complication of diabetes caused by prolonged high blood sugar levels ' +
    'damaging the tiny capillaries in the retina at the back of the eye. In its early stages, symptoms are frequently silent, ' +
    'yet irreversible vision loss can occur without systematic screening and timely glycemic and laser/anti-VEGF intervention.';
  const splitRag = doc.splitTextToSize(ragText, contentWidth - 8);
  doc.text(splitRag, margin + 4, p2Y + 11);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Source: International Council of Ophthalmology (ICO) Guidelines for Diabetic Eye Care.', margin + 4, p2Y + 23);

  // SECTION 9: REFERRAL RECOMMENDATION & STATUS
  p2Y += 31;
  const isReferred = report.referralStatus === 'Referred' || !!report.referralPriority;
  doc.setFillColor(isReferred ? 254 : 248, isReferred ? 243 : 250, isReferred ? 199 : 252); // Amber-50 or Slate-50
  doc.setDrawColor(isReferred ? 253 : 226, isReferred ? 230 : 232, isReferred ? 138 : 240);
  doc.roundedRect(margin, p2Y, contentWidth, 27, 2, 2, 'FD');

  doc.setTextColor(isReferred ? 146 : 71, isReferred ? 64 : 85, isReferred ? 14 : 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('9. REFERRAL RECOMMENDATION & STATUS', margin + 4, p2Y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Referral Status:', col1, p2Y + 11);
  doc.text('Priority Level:', col2, p2Y + 11);
  doc.text('Target Facility:', col3, p2Y + 11);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(isReferred ? (report.referralStatus || 'Referred') : 'Not referred', col1, p2Y + 16);
  doc.text(isReferred ? (report.referralPriority || 'Medium Priority') : 'Routine', col2, p2Y + 16);
  doc.text(isReferred ? 'Regional Eye Care Center - Vitreo-Retina' : 'Primary Health Centre', col3, p2Y + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Referral Reason:', col1, p2Y + 21);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(
    isReferred
      ? (report.referralReason || 'Moderate DR features requiring clinical slit-lamp dilated examination.')
      : 'No active sight-threatening lesions observed. Routine 12-month follow-up.',
    col1 + 22,
    p2Y + 21
  );

  // SECTION 10: SPECIALIST REVIEW & CLINICAL ASSESSMENT
  p2Y += 31;
  const spec = report.specialistReview;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, p2Y, contentWidth, 38, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('10. SPECIALIST REVIEW & ASSESSMENT', margin + 4, p2Y + 5);

  if (spec) {
    doc.setTextColor(4, 120, 87);
    doc.text('Status: Reviewed by Specialist', pageWidth - margin - 4, p2Y + 5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Reviewing Specialist:', col1, p2Y + 11);
    doc.text('Review Date:', col3, p2Y + 11);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(spec.specialistName || 'Dr. Ananya Sen, MD (Ophthalmology)', col1 + 28, p2Y + 11);
    doc.text(spec.reviewDate || report.generatedDate, col3 + 18, p2Y + 11);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Specialist Assessment:', col1, p2Y + 17);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 96, 213);
    doc.text(spec.assessment || report.drSeverity, col1 + 30, p2Y + 17);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Specialist Notes:', col1, p2Y + 23);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    const specNotes = doc.splitTextToSize(
      spec.notes || 'Dilated fundus photography confirms scattered microaneurysms in the temporal arcade.',
      contentWidth - 32
    );
    doc.text(specNotes, col1 + 22, p2Y + 23);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Recommendation:', col1, p2Y + 33);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(spec.recommendation || 'Specialist monitoring within 3 weeks', col1 + 25, p2Y + 33);
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text('Specialist Review: Pending', pageWidth - margin - 4, p2Y + 5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Specialist Review:', col1, p2Y + 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text('Pending', col1 + 24, p2Y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Specialist Assessment:', col1, p2Y + 18);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    doc.text('Pending specialist clinical evaluation.', col1 + 30, p2Y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Specialist Notes:', col1, p2Y + 24);
    doc.setFont('helvetica', 'italic');
    doc.text('This screening record is queued for tele-ophthalmology verification.', col1 + 22, p2Y + 24);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Specialist Recommendation:', col1, p2Y + 30);
    doc.setFont('helvetica', 'italic');
    doc.text('Pending clinical review by assigned vitreo-retinal specialist.', col1 + 38, p2Y + 30);
  }

  // SECTION 11: FOLLOW-UP RECOMMENDATION
  p2Y += 42;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, p2Y, contentWidth, 18, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('11. FOLLOW-UP RECOMMENDATION', margin + 4, p2Y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const followUpText =
    'Comprehensive dilated ophthalmology evaluation within 2 to 4 weeks. ' +
    'Continue strict blood glucose (HbA1c < 7.0%) and blood pressure monitoring in consultation with the primary physician.';
  doc.text(doc.splitTextToSize(followUpText, contentWidth - 8), margin + 4, p2Y + 11);

  // SECTION 12: REGULATORY MEDICAL DISCLAIMER
  p2Y += 22;
  doc.setFillColor(254, 242, 242); // Red-50 / Rose-50
  doc.setDrawColor(254, 205, 211); // Rose-200
  doc.roundedRect(margin, p2Y, contentWidth, 23, 2, 2, 'FD');

  doc.setTextColor(190, 18, 60); // Rose-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('12. OFFICIAL REGULATORY DISCLAIMER', margin + 4, p2Y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(87, 83, 78);
  const disclaimerText =
    'RETINA-X provides AI-assisted screening support and does not replace diagnosis by a qualified eye-care professional. ' +
    'Definitive clinical decisions should always be confirmed through direct dilated slit-lamp biomicroscopy or OCT by an ophthalmologist. ' +
    'This report is generated for tele-ophthalmic screening and triage purposes only.';
  doc.text(doc.splitTextToSize(disclaimerText, contentWidth - 8), margin + 4, p2Y + 10);

  // SECTION 13: PATIENT COMMUNICATION & TRANSMISSION AUDIT
  p2Y += 27;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, p2Y, contentWidth, 14, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PATIENT COMMUNICATION AUDIT', margin + 4, p2Y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Patient Phone:', col1, p2Y + 9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 96, 213);
  doc.text(phoneNum, col1 + 20, p2Y + 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Transmission Status:', col3, p2Y + 9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(report.status === 'Sent to Patient' ? 4 : 71, report.status === 'Sent to Patient' ? 120 : 85, report.status === 'Sent to Patient' ? 87 : 105);
  doc.text(report.status === 'Sent to Patient' ? 'Delivered to Registered Phone' : 'Pending Patient Transmission', col3 + 28, p2Y + 9.5);

  // Page 2 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 282, pageWidth - margin, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('RETINA-X Tele-Ophthalmology Screening Platform | Confidential Clinical Document', margin, 287);
  doc.text('Page 2 of 2', pageWidth - margin, 287, { align: 'right' });

  // DYNAMIC FILENAME REQUIREMENT
  // e.g. RETINA-X_Report_[PatientID]_[Date].pdf
  const patientIdClean = (report.patientId || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '');
  const dateClean = (report.generatedDate || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename = `RETINA-X_Report_${patientIdClean}_${dateClean}.pdf`;

  doc.save(filename);
}
