import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Printer,
  Phone,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
  ShieldCheck,
  Info,
  Loader2,
  AlertCircle,
  Maximize2,
  X,
  Layers,
  Sparkles,
  Sliders,
  Compass,
  FileSignature,
  ZoomIn,
  Activity,
  CheckCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FundusRetinaCanvas, XaiTab } from './FundusRetinaCanvas';
import { downloadRetinaXPdf } from '../utils/generateMedicalPdf';
import { getArtifactUrl } from '../utils/imageUtils';
import {
  extractLesionItems,
  generateDrClinicalInterpretation,
  getRecommendedAction,
  getCategoryWhatThisMeans,
  getModelScoreExplanation,
  VISUALIZATION_EXPLANATIONS,
  getModelLimitations,
} from '../utils/drClinicalExplanations';

export const DetailedReportPage: React.FC = () => {
  const {
    activeReportId,
    activePatientId,
    reports,
    screenings,
    patients,
    setActivePage,
    sendReportToPatientPhone,
  } = useApp();

  // Single source of truth: report page resolves by active report ID or connected screening ID
  let report = reports.find((r) => r.id === activeReportId || r.screeningId === activeReportId) || null;

  // Fallback 1: match from screenings collection
  if (!report && screenings && activeReportId) {
    const matchedScreening = screenings.find(
      (s) => s.id === activeReportId || s.reportId === activeReportId
    );
    if (matchedScreening) {
      report = {
        id: matchedScreening.reportId || matchedScreening.id,
        patientId: matchedScreening.patientId,
        screeningId: matchedScreening.id,
        screeningType: 'dr',
        generatedDate: matchedScreening.date || new Date().toISOString().split('T')[0],
        patientName: matchedScreening.patientName,
        patientPhone: matchedScreening.patientPhone || '',
        patientAge: matchedScreening.patientAge || 50,
        patientGender: matchedScreening.patientGender || 'Other',
        eye: matchedScreening.eye || 'Right Eye',
        drSeverity: (matchedScreening.drSeverity || 'Moderate') as any,
        drSeverityLevel: matchedScreening.drSeverityLevel || matchedScreening.drSeverity || 'Moderate Non-Proliferative Diabetic Retinopathy (NPDR)',
        confidence: matchedScreening.confidence || 96,
        findings: matchedScreening.findings || ['Microaneurysms', 'Hard Exudates'],
        imageQuality: matchedScreening.imageQuality || 'Good',
        imageFileName: matchedScreening.imageFileName || 'fundus.jpg',
        imageFileSize: matchedScreening.imageFileSize || '',
        imageUrl: matchedScreening.imageUrl,
        imageOriginal: matchedScreening.imageOriginal,
        imageGradCam: matchedScreening.imageGradCam,
        imageLesions: matchedScreening.imageLesions,
        imageAnatomy: matchedScreening.imageAnatomy,
        imageCombined: matchedScreening.imageCombined,
        nurseName: matchedScreening.nurseName || 'Clinic Staff',
        referralStatus: matchedScreening.status === 'Referred' ? 'Specialist Referral Initiated' : 'Routine Screening',
        status: 'Generated',
      };
    }
  }

  // Fallback 2: match by activePatientId
  if (!report && activePatientId && reports) {
    report = reports.find((r) => r.patientId === activePatientId) || null;
  }

  const patient = report ? patients.find((p) => p.id === report.patientId || p.dbId === report.patientId) : undefined;

  const [isSendingModalOpen, setIsSendingModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Visual evidence state
  const [activeXaiTab, setActiveXaiTab] = useState<XaiTab>('Combined');
  const [highlightedLesion, setHighlightedLesion] = useState<string | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(65);

  if (!report) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 max-w-lg mx-auto my-12 shadow-sm">
        <div className="flex items-center justify-center w-14 h-14 mx-auto mb-3.5 rounded-full bg-slate-100 text-slate-400">
          <FileText className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Report Not Found</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5 leading-relaxed">
          The requested screening report ({activeReportId || 'unknown ID'}) could not be located in the current screening registry.
        </p>
        <button
          type="button"
          onClick={() => setActivePage('dashboard')}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const screeningId = report.screeningId || report.id;
  const originalImg = report.imageOriginal || (screeningId ? getArtifactUrl(screeningId, 'original') : undefined);
  const gradCamImg = report.imageGradCam || (screeningId ? getArtifactUrl(screeningId, 'gradcam') : undefined);
  const lesionsImg = report.imageLesions || (screeningId ? getArtifactUrl(screeningId, 'lesions') : undefined);
  const anatomyImg = report.imageAnatomy || (screeningId ? getArtifactUrl(screeningId, 'anatomy') : undefined);
  const combinedImg = report.imageCombined || (screeningId ? getArtifactUrl(screeningId, 'combined') : undefined);
  const debugAnatomyImg = report.imageDebugAnatomy || (screeningId ? getArtifactUrl(screeningId, 'debug_anatomy') : undefined);

  const patientPhoneNumber = report.patientPhone || patient?.phoneNumber || '';
  const hasVisualizations = !!(originalImg || lesionsImg || anatomyImg || combinedImg || gradCamImg);

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      await downloadRetinaXPdf(report, patient);
    } catch (err) {
      console.error('Error generating PDF report:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSimulateSend = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setSendSuccess(true);
      sendReportToPatientPhone(report.id);
      setTimeout(() => {
        setIsSendingModalOpen(false);
        setSendSuccess(false);
      }, 2400);
    }, 1000);
  };

  const openFullscreen = (tab: XaiTab) => {
    setActiveXaiTab(tab);
    setIsFullscreenOpen(true);
  };

  // Safe formatters
  const formatPx = (val: unknown): string | undefined => {
    if (typeof val === 'number' && !isNaN(val)) return `${val.toLocaleString()} px`;
    if (typeof val === 'string' && val.trim() !== '') return val.includes('px') ? val : `${val} px`;
    return undefined;
  };

  const formatCoord = (x: unknown, y: unknown): string | undefined => {
    if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
      return `(${Math.round(x)}, ${Math.round(y)})`;
    }
    return undefined;
  };

  // Structured lesion findings
  const structuredLesions = extractLesionItems(report.lesionData);
  const detectedLesions = structuredLesions.filter((i) => i.isAssessed && i.detected && i.pixels > 0);

  // 'What This Means' categorical explanation
  const whatThisMeans = getCategoryWhatThisMeans({
    drSeverity: report.drSeverity,
    drSeverityLevel: report.drSeverityLevel,
    imageQuality: report.imageQuality,
  });

  // Model output score explanation
  const scoreExplanation = getModelScoreExplanation(report.confidence);

  // Model limitations notes
  const modelLimitations = getModelLimitations({
    lesionData: report.lesionData,
    anatomyData: report.anatomyData,
    imageQuality: report.imageQuality,
  });

  // Clinical interpretation & concordance synthesis
  const interpretation = generateDrClinicalInterpretation({
    lesionData: report.lesionData,
    drSeverity: report.drSeverity,
    drSeverityLevel: report.drSeverityLevel,
    confidence: report.confidence,
    imageQuality: report.imageQuality,
  });

  // Recommended action synthesis
  const recommendedAction = getRecommendedAction({
    imageQuality: report.imageQuality,
    drSeverity: report.drSeverity,
    drSeverityLevel: report.drSeverityLevel,
    referralStatus: report.referralStatus,
    referralPriority: report.referralPriority,
    referralReason: report.referralReason,
    recommendation: report.recommendation,
  });

  // Retinal anatomy data
  const anatomy = report.anatomyData;

  // Presentation derivations
  const eyeShort = report.eye === 'Left Eye' ? 'OS' : report.eye === 'Right Eye' ? 'OD' : report.eye;
  const isNoDR =
    report.drSeverity === 'No DR' ||
    report.drSeverityLevel === 'No DR (Level 0)' ||
    (report.drSeverityLevel || '').includes('Level 0');

  const qualityGrade = report.imageQuality || 'Unrecorded';
  const isQualityUngradable =
    qualityGrade === 'Poor' ||
    qualityGrade === 'Ungradable' ||
    qualityGrade.toLowerCase().includes('poor');
  const isQualityGood = qualityGrade === 'Good';

  const patientHistory =
    (report as any).patientHistory ||
    (patient?.diabetesDurationYears != null
      ? `Type 2 Diabetes (${patient.diabetesDurationYears} yrs)${patient.knownDR && patient.knownDR !== 'Uncertain' ? ` • Prior DR: ${patient.knownDR}` : ''}`
      : undefined);

  const gradabilityText = isQualityUngradable
    ? 'Ungradable'
    : isQualityGood
    ? 'Gradable (Adequate)'
    : 'Gradable (Borderline / Review Quality)';

  const reviewStatusText = report.specialistReview
    ? 'Verified by Specialist'
    : report.status === 'Sent to Patient'
    ? 'Sent to Patient (Pending Specialist Review)'
    : 'Pending Specialist Review';

  // Severity color tokens
  const getSeverityBadgeClasses = () => {
    if (isNoDR) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    if (report.drSeverity === 'Mild' || report.drSeverityLevel?.includes('Level 1')) return 'bg-sky-50 text-sky-800 border-sky-300';
    if (report.drSeverity === 'Moderate' || report.drSeverityLevel?.includes('Level 2')) return 'bg-amber-50 text-amber-800 border-amber-300';
    if (report.drSeverity === 'Severe' || report.drSeverityLevel?.includes('Level 3')) return 'bg-rose-50 text-rose-800 border-rose-300';
    return 'bg-red-50 text-red-800 border-red-300';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-20 px-2 sm:px-4">
      {/* Top Clinical Actions Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 print:hidden">
        <button
          type="button"
          onClick={() => setActivePage(activePatientId ? 'patient-detail' : 'patients')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors w-fit cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{activePatientId ? 'Back to Patient Profile' : 'Back to Screening List'}</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {patientPhoneNumber && (
            <button
              type="button"
              onClick={() => setIsSendingModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>Send to Patient</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>

          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-black rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-white" />
                <span>Download Official PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Medical Report Document Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-10 space-y-6 text-slate-800 print:border-none print:shadow-none print:p-0 print:space-y-4 print:text-black">
        
        {/* Document Header */}
        <header className="border-b-2 border-slate-900 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-950 text-white font-extrabold text-xs tracking-wider">
                  RX
                </div>
                <div>
                  <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
                    TRINAY TELE-OPHTHALMOLOGY NETWORK
                  </h1>
                  <p className="text-[11px] font-bold text-slate-500 tracking-wide uppercase">
                    Diabetic Retinopathy Clinical Decision-Support Report
                  </p>
                </div>
              </div>
              <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wide mt-2">
                AI Retinal Screening Decision-Support Summary
              </h2>
              <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Confidential Clinical Document • For Eye-Care Decision Support Only
              </span>
            </div>

            <div className="sm:text-right text-xs space-y-1 font-mono text-slate-600 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-slate-200">
              <p><span className="text-slate-400 font-sans">Report ID:</span> <strong className="text-slate-900">{report.id}</strong></p>
              <p><span className="text-slate-400 font-sans">Screening ID:</span> <strong className="text-slate-900">{report.screeningId}</strong></p>
              <p><span className="text-slate-400 font-sans">Screening Date:</span> <span className="text-slate-800">{report.generatedDate}</span></p>
              <p>
                <span className="text-slate-400 font-sans">Examined Eye:</span>{' '}
                <strong className="text-blue-700 font-bold font-sans">{report.eye} ({eyeShort})</strong>
              </p>
              <div className="pt-1 flex sm:justify-end gap-1.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                    report.status === 'Sent to Patient'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}
                >
                  Status: {report.status}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* 1. PATIENT & EXAMINATION DETAILS */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-1-heading" className="space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                1
              </span>
              <h3 id="section-1-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Patient &amp; Examination Details
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Demographics, Examination Parameters &amp; Clinical History</span>
          </div>

          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2.5">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Patient Name &amp; ID</span>
                <div className="mt-0.5">
                  <strong className="text-slate-900 font-bold block">{report.patientName}</strong>
                  <span className="font-mono text-slate-500 text-[11px] block">{report.patientId}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Age &amp; Gender</span>
                <span className="text-slate-800 font-medium block mt-0.5">
                  {report.patientAge} Years / {report.patientGender}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Examination Date</span>
                <span className="text-slate-800 font-medium block mt-0.5">
                  {report.generatedDate || 'Not recorded'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Examined Eye</span>
                <strong className="text-blue-700 font-bold block mt-0.5">
                  {report.eye} ({eyeShort})
                </strong>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Screening Operator</span>
                <span className="text-slate-700 block mt-0.5">
                  {report.nurseName || 'Recorded in screening protocol'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Relevant Medical History</span>
                <span className="text-slate-700 block mt-0.5">
                  {patientHistory || 'None recorded'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 2. SCREENING SUMMARY */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-2-heading" className="space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                2
              </span>
              <h3 id="section-2-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Screening Summary
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Primary AI Staging, Model Score, Image Quality &amp; Review Status</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* DR Severity Staging */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col justify-between space-y-1.5">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  Predicted DR Severity
                </span>
                <div className="mt-1">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider border inline-block ${getSeverityBadgeClasses()}`}>
                    {report.drSeverity || 'No DR'}
                  </span>
                </div>
                <strong className="text-xs font-extrabold text-slate-900 block mt-1.5 leading-snug">
                  {report.drSeverityLevel || report.drSeverity || 'No DR (Level 0)'}
                </strong>
              </div>
              <span className="text-[10px] text-slate-400 block pt-1 border-t border-slate-200/60">
                ICDR Classification Standard
              </span>
            </div>

            {/* Model Output Score */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col justify-between space-y-1.5">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  Model Output Score
                </span>
                <span className="text-lg font-black font-mono text-slate-900 block mt-0.5">
                  {scoreExplanation.scoreDisplay}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 leading-snug pt-1 border-t border-slate-200/60 space-y-0.5">
                <p className="font-medium text-slate-700">{scoreExplanation.explanation}</p>
                <p className="text-slate-500 italic">{scoreExplanation.safetyNote}</p>
              </div>
            </div>

            {/* Image Quality & Gradability */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col justify-between space-y-1.5">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  Image Quality &amp; Gradability
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  {isQualityGood ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                  <strong className={`font-bold ${isQualityGood ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {qualityGrade}
                  </strong>
                  <span className="text-[10px] text-slate-500 font-medium">({gradabilityText})</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 leading-snug pt-1 border-t border-slate-200/60">
                {isQualityUngradable ? (
                  <span className="text-rose-700 font-medium">Ungradable. Repeat capture recommended.</span>
                ) : !isQualityGood ? (
                  <span className="text-amber-800">Borderline clarity; clinician review advised.</span>
                ) : (
                  <span className="text-emerald-800">Adequate for screening triage.</span>
                )}
              </div>
            </div>

            {/* Clinical Review Status */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col justify-between space-y-1.5">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  Clinical Review Status
                </span>
                <div className="mt-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      report.specialistReview
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {reviewStatusText}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 block pt-1 border-t border-slate-200/60">
                {report.specialistReview ? 'Specialist sign-off recorded' : 'Queued for specialist counter-check'}
              </span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. WHAT THE AI FOUND */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-3-heading" className="space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                3
              </span>
              <Activity className="w-4 h-4 text-blue-600" />
              <h3 id="section-3-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                What the AI Found
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Inference Findings Present in Model Outputs
            </span>
          </div>

          {/* Quick Doctor Summary of Actual Model Findings */}
          <div className="p-3.5 bg-sky-50/70 rounded-xl border border-sky-200/80 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-sky-950">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <span>Summary of Detected Findings:</span>
            </div>
            <ul className="space-y-1.5 pl-5 list-disc text-sky-900 text-[11.5px]">
              <li>
                <strong>Focal Retinal Lesions:</strong>{' '}
                {detectedLesions.length > 0 ? (
                  <span>
                    Identified candidate regions for{' '}
                    <strong className="text-slate-950">
                      {detectedLesions.map(d => `${d.def.name} (${d.pixels.toLocaleString()} px area, ${d.regions} region${d.regions === 1 ? '' : 's'})`).join(', ')}
                    </strong>
                    .
                  </span>
                ) : (
                  <span>
                    No microaneurysms, hemorrhages, hard exudates, or soft exudates were detected across the examined field.
                  </span>
                )}
              </li>
              <li>
                <strong>Retinal Landmarks:</strong>{' '}
                {anatomy ? (
                  <span>
                    {anatomy.optic_disc?.pixels ? `Optic Disc localized (${anatomy.optic_disc.pixels.toLocaleString()} px)` : 'Optic Disc localized'}
                    {anatomy.fovea ? ` • Fovea Centralis localized at (${Math.round(anatomy.fovea.x)}, ${Math.round(anatomy.fovea.y)})` : ''}
                    {anatomy.fovea?.disc_distance ? ` with OD–Fovea distance of ${anatomy.fovea.disc_distance} px` : ''}
                    {anatomy.blood_vessels?.pixels ? ` • Retinal vasculature tracked (${anatomy.blood_vessels.pixels.toLocaleString()} px, ${anatomy.blood_vessels.density != null ? `${anatomy.blood_vessels.density}% density` : ''})` : ''}
                    .
                  </span>
                ) : (
                  <span>Landmark localization was not evaluated for this image.</span>
                )}
              </li>
              <li>
                <strong>Image Clarity:</strong> Evaluated as <strong className="text-slate-950">{qualityGrade}</strong> ({gradabilityText}).
              </li>
            </ul>
          </div>

          {/* Compact Lesion Findings Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wide">
                  <th className="px-3.5 py-2 text-left font-bold">Pathological Finding</th>
                  <th className="px-3.5 py-2 text-left font-bold">Detection Status</th>
                  <th className="px-3.5 py-2 text-right font-bold">Existing Measured Result</th>
                  <th className="px-3.5 py-2 text-right font-bold print:hidden">Evidence / Overlay</th>
                </tr>
              </thead>
              <tbody>
                {structuredLesions.map((item, idx) => {
                  const isAssessed = item.isAssessed;
                  const isDetected = isAssessed && item.detected && item.pixels > 0;

                  return (
                    <tr
                      key={item.code}
                      className={idx % 2 === 0 ? 'bg-white border-b border-slate-100' : 'bg-slate-50/60 border-b border-slate-100 last:border-0'}
                    >
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: item.def.colorHex }}
                          />
                          <span className="font-semibold text-slate-900">{item.def.fullName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({item.code})</span>
                        </span>
                      </td>

                      <td className="px-3.5 py-2.5">
                        {!isAssessed ? (
                          <span className="inline-flex items-center gap-1 font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            Not evaluated
                          </span>
                        ) : isDetected ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px] border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Detected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                            Not detected
                          </span>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-right font-mono text-slate-800">
                        {!isAssessed ? (
                          <span className="text-slate-400 italic font-sans text-[11px]">Unavailable</span>
                        ) : isDetected ? (
                          <span className="font-bold text-slate-900">
                            {item.pixels.toLocaleString()} px detected area
                            {item.regions > 0 ? (
                              <span className="text-slate-500 font-normal text-[11px]"> ({item.regions} segmented region{item.regions === 1 ? '' : 's'})</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-slate-500">0 px detected</span>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-right print:hidden">
                        {isDetected ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveXaiTab('Lesions');
                              setHighlightedLesion(item.code);
                              openFullscreen('Lesions');
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Overlay</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 italic">
            Note: Detected areas represent raw segmented pixel footprints from the multi-task lesion network and are not clinical microaneurysm counts.
          </p>

          {/* Retinal Anatomical Localization Strip */}
          <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/70 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">
                  Retinal Anatomical Landmarks ({report.eye})
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Pipeline Landmark Detection</span>
            </div>

            {anatomy ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Optic Disc</span>
                  <span className="font-bold text-slate-900 font-mono text-xs block mt-0.5">
                    {formatPx(anatomy.optic_disc?.pixels) || (anatomy.optic_disc?.detected !== false ? 'Localized' : 'Not localized')}
                  </span>
                  {anatomy.optic_disc?.center && (
                    <span className="text-[10px] text-slate-500 font-mono block">
                      Centroid: ({anatomy.optic_disc.center[0]}, {anatomy.optic_disc.center[1]})
                    </span>
                  )}
                </div>

                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Fovea Centralis</span>
                  <span className="font-bold text-slate-900 font-mono text-xs block mt-0.5">
                    {anatomy.fovea ? formatCoord(anatomy.fovea.x, anatomy.fovea.y) : 'Not localized'}
                  </span>
                  {anatomy.fovea?.disc_distance && (
                    <span className="text-[10px] text-slate-500 font-mono block">
                      OD–Fovea: {anatomy.fovea.disc_distance} px
                    </span>
                  )}
                </div>

                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Macula Region</span>
                  <span className="font-bold text-slate-900 text-xs block mt-0.5">
                    Estimated ROI
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    r = 56 px (geometric proxy)
                  </span>
                </div>

                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Retinal Blood Vessels</span>
                  <span className="font-bold text-slate-900 font-mono text-xs block mt-0.5">
                    {formatPx(anatomy.blood_vessels?.pixels) || (anatomy.blood_vessels?.detected ? 'Segmented' : 'Not evaluated')}
                  </span>
                  {anatomy.blood_vessels?.density != null && (
                    <span className="text-[10px] text-slate-500 font-mono block">
                      Density: {anatomy.blood_vessels.density}%
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                Anatomical landmark measurements were not evaluated or recorded for this screening record.
              </p>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. WHAT THIS MEANS (CLINICAL INTERPRETATION) */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-4-heading" className="space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                4
              </span>
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h3 id="section-4-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                What This Means
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Clinical Context &amp; Decision-Support Significance
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Predicted Screening Category
                </span>
                <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                  {whatThisMeans.categoryTitle}
                </h4>
              </div>
              <span className="px-2.5 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-wide bg-blue-50 text-blue-800 border border-blue-200">
                AI Decision Support
              </span>
            </div>

            {/* Clinical Meaning */}
            <div className="space-y-1">
              <strong className="text-slate-800 text-xs block">Clinical Relevance of Category:</strong>
              <p className="text-slate-700 leading-relaxed text-[11.5px]">
                {whatThisMeans.clinicalMeaning}
              </p>
            </div>

            {/* Verification Notice */}
            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/90 text-amber-950 text-[11px] space-y-1">
              <strong className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Clinical Verification Required:
              </strong>
              <p className="leading-relaxed text-amber-900/90 font-medium">
                {whatThisMeans.verificationNotice}
              </p>
            </div>

            {/* Concordance summary */}
            <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
              <p>
                <strong>Model Output Concordance:</strong> {interpretation.concordanceTitle} — {interpretation.concordanceDetail}
              </p>
              <p className="text-slate-500 italic">
                {interpretation.distinctionNote}
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 5. VISUAL EVIDENCE */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-5-heading" className="space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                5
              </span>
              <Layers className="w-4 h-4 text-blue-600" />
              <h3 id="section-5-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Visual Evidence
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">
              {eyeShort} • Original, Lesions, Attention Heatmap, Anatomy &amp; Combined AI Overlay
            </span>
          </div>

          {hasVisualizations ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Panel 1: Original Fundus */}
              <figure className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-bold text-slate-900 truncate">
                      {VISUALIZATION_EXPLANATIONS.original.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => openFullscreen('Original')}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-0.5 cursor-pointer print:hidden"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="aspect-[4/3] w-full bg-black flex items-center justify-center p-1">
                    <FundusRetinaCanvas mode="Original" imageOriginal={originalImg} className="w-full h-full" />
                  </div>
                </div>
                <figcaption className="p-2.5 text-[10.5px] text-slate-600 border-t border-slate-100 leading-snug">
                  <strong className="text-slate-800 block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                    {VISUALIZATION_EXPLANATIONS.original.short}
                  </strong>
                  {VISUALIZATION_EXPLANATIONS.original.description}
                </figcaption>
              </figure>

              {/* Panel 2: Candidate Lesions Overlay */}
              <figure className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-bold text-slate-900 truncate">
                      {VISUALIZATION_EXPLANATIONS.lesions.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => openFullscreen('Lesions')}
                      className="text-[10px] font-semibold text-rose-700 hover:text-rose-900 flex items-center gap-0.5 cursor-pointer print:hidden"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="aspect-[4/3] w-full bg-black flex items-center justify-center p-1">
                    <FundusRetinaCanvas
                      mode="Lesions"
                      imageOriginal={originalImg}
                      imageLesions={lesionsImg}
                      className="w-full h-full"
                    />
                  </div>
                </div>
                <figcaption className="p-2.5 text-[10.5px] text-slate-600 border-t border-slate-100 leading-snug">
                  <strong className="text-slate-800 block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                    {VISUALIZATION_EXPLANATIONS.lesions.short}
                  </strong>
                  {VISUALIZATION_EXPLANATIONS.lesions.description}
                </figcaption>
              </figure>

              {/* Panel 3: Grad-CAM++ Attention */}
              <figure className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-bold text-slate-900 truncate">
                      {VISUALIZATION_EXPLANATIONS.gradcam.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => openFullscreen('Grad-CAM++')}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-0.5 cursor-pointer print:hidden"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="aspect-[4/3] w-full bg-black flex items-center justify-center p-1">
                    <FundusRetinaCanvas
                      mode="Grad-CAM++"
                      opacity={heatmapOpacity}
                      imageOriginal={originalImg}
                      imageGradCam={gradCamImg}
                      className="w-full h-full"
                    />
                  </div>
                </div>
                <figcaption className="p-2.5 text-[10.5px] text-slate-600 border-t border-slate-100 leading-snug">
                  <strong className="text-slate-800 block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                    {VISUALIZATION_EXPLANATIONS.gradcam.short}
                  </strong>
                  {VISUALIZATION_EXPLANATIONS.gradcam.description}
                </figcaption>
              </figure>

              {/* Panel 4: Retinal Anatomy Landmarks */}
              <figure className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-bold text-slate-900 truncate">
                      {VISUALIZATION_EXPLANATIONS.anatomy.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => openFullscreen('Anatomy')}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-0.5 cursor-pointer print:hidden"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="aspect-[4/3] w-full bg-black flex items-center justify-center p-1">
                    <FundusRetinaCanvas
                      mode="Anatomy"
                      imageOriginal={originalImg}
                      imageAnatomy={anatomyImg}
                      imageDebugAnatomy={debugAnatomyImg}
                      className="w-full h-full"
                    />
                  </div>
                </div>
                <figcaption className="p-2.5 text-[10.5px] text-slate-600 border-t border-slate-100 leading-snug">
                  <strong className="text-slate-800 block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                    {VISUALIZATION_EXPLANATIONS.anatomy.short}
                  </strong>
                  {VISUALIZATION_EXPLANATIONS.anatomy.description}
                </figcaption>
              </figure>

              {/* Panel 5: Combined Multi-Layer Overlay */}
              <figure className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-bold text-slate-900 truncate">
                      {VISUALIZATION_EXPLANATIONS.combined.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => openFullscreen('Combined')}
                      className="text-[10px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-0.5 cursor-pointer print:hidden"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="aspect-[4/3] w-full bg-black flex items-center justify-center p-1">
                    <FundusRetinaCanvas
                      mode="Combined"
                      imageOriginal={originalImg}
                      imageCombined={combinedImg}
                      className="w-full h-full"
                    />
                  </div>
                </div>
                <figcaption className="p-2.5 text-[10.5px] text-slate-600 border-t border-slate-100 leading-snug">
                  <strong className="text-slate-800 block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                    {VISUALIZATION_EXPLANATIONS.combined.short}
                  </strong>
                  {VISUALIZATION_EXPLANATIONS.combined.description}
                </figcaption>
              </figure>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Visual evidence overlays have not been generated for this screening record.</span>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* 6. RECOMMENDED CLINICAL ACTION */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-6-heading" className="space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                6
              </span>
              <Compass className="w-4 h-4 text-blue-600" />
              <h3 id="section-6-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Recommended Next Steps &amp; Follow-Up
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Triage Referral Recommendation, Follow-Up Interval &amp; Protocol Basis
            </span>
          </div>

          <div
            className={`p-4 rounded-xl border space-y-2.5 text-xs ${
              recommendedAction.isReferral
                ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                : 'bg-slate-50/80 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  AI-Generated Recommendation (Subject to Clinician Confirmation)
                </span>
                <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                  {recommendedAction.actionTitle}
                </h4>
              </div>

              <span
                className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded border ${
                  recommendedAction.isReferral
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {recommendedAction.priorityBadge}
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              {recommendedAction.actionSummary}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/80 text-[11px]">
              <div>
                <span className="text-slate-400 uppercase font-bold text-[10px] block">Follow-Up Interval:</span>
                <strong className="text-slate-900 font-semibold">{recommendedAction.timingGuideline}</strong>
              </div>
              <div>
                <span className="text-slate-400 uppercase font-bold text-[10px] block">Guideline Basis:</span>
                <span className="text-slate-600">{recommendedAction.protocolBasis}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 7. MODEL LIMITATIONS & QUALITY ASSESSMENT */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-7-heading" className="space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                7
              </span>
              <Info className="w-4 h-4 text-slate-600" />
              <h3 id="section-7-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Model Limitations &amp; Quality Notes
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Pipeline Boundary Conditions &amp; Capture Constraints
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 text-xs space-y-2">
            {modelLimitations.length > 0 ? (
              <ul className="space-y-1.5 list-disc pl-5 text-slate-700 text-[11.5px]">
                {modelLimitations.map((lim, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {lim}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-slate-600 leading-relaxed">
                No model pipeline limitations or missing modalities identified. Retinal photography clarity is adequate for automated diabetic retinopathy decision support across the 45° central field. Automated outputs do not inspect peripheral retina beyond the captured field.
              </p>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 8. OPHTHALMOLOGIST REVIEW */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-8-heading" className="space-y-3 pt-1">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                8
              </span>
              <FileSignature className="w-4 h-4 text-blue-600" />
              <h3 id="section-8-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Ophthalmologist Review
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Clinical Attestation, Specialist Assessment &amp; Counter-Verification Sign-Off</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                Tele-Ophthalmology Verification Status
              </span>
              {report.specialistReview ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Verified by Specialist ✓
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Pending Specialist Review
                </span>
              )}
            </div>

            {report.specialistReview ? (
              <div className="space-y-1 text-slate-800">
                <p><strong>Reviewing Specialist:</strong> {report.specialistReview.specialistName || 'Not available'}</p>
                <p><strong>Review Date:</strong> {report.specialistReview.reviewDate || 'Not available'}</p>
                <p><strong>Assessment Notes:</strong> {report.specialistReview.assessment || 'Not available'}</p>
                {report.specialistReview.notes && <p><strong>Additional Notes:</strong> {report.specialistReview.notes}</p>}
                {report.specialistReview.recommendation && <p><strong>Recommendation:</strong> {report.specialistReview.recommendation}</p>}
              </div>
            ) : (
              <div className="space-y-1 text-slate-600">
                <p><strong>Assigned Review Queue:</strong> Regional Tele-Ophthalmology Network</p>
                <p><strong>Specialist Assessment:</strong> <span className="text-slate-500 italic">Pending specialist clinical evaluation</span></p>
                <p><strong>Clinical Notes:</strong> <span className="text-slate-500 italic">Queued for ophthalmologist counter-verification</span></p>
              </div>
            )}

            {/* Formal Medical Sign-off Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">
                  Reviewing Ophthalmologist
                </span>
                <span className="text-slate-900 font-semibold block text-xs mt-0.5">
                  {report.specialistReview?.specialistName || 'Dr. ___________________________'}
                </span>
                <div className="mt-3 border-b border-slate-300" />
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">
                  Medical Registration / License
                </span>
                <span className="text-slate-900 font-mono block text-xs mt-0.5">
                  {(report.specialistReview as any)?.registrationNumber || 'MCI / Reg: ____________________'}
                </span>
                <div className="mt-3 border-b border-slate-300" />
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">
                  Clinical Signature &amp; Date
                </span>
                <span className="text-slate-900 block text-xs mt-0.5">
                  {report.specialistReview?.reviewDate ? `Date: ${report.specialistReview.reviewDate}` : 'Date: ________________________'}
                </span>
                <div className="mt-3 border-b border-slate-300" />
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 9. DISCLAIMER */}
        {/* ========================================================================= */}
        <section aria-labelledby="section-9-heading" className="space-y-3 pt-1">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">
                9
              </span>
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <h3 id="section-9-heading" className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Disclaimer
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Regulatory &amp; Tele-Ophthalmology Decision-Support Notice</span>
          </div>

          <footer className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 text-center text-[10px] text-slate-500 space-y-1.5">
            <div className="flex items-center justify-center gap-1.5 font-bold text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Official Tele-Ophthalmology Decision-Support Disclaimer</span>
            </div>
            <p className="max-w-3xl mx-auto leading-relaxed text-slate-600">
              TRINAY is an artificial intelligence decision-support tool intended for tele-retinal screening and primary triage. It does not provide an autonomous medical diagnosis. All automated classifications, lesion segmentations, and landmark localizations must be clinically correlated and verified by a licensed ophthalmologist through direct clinical examination (slit-lamp biomicroscopy / OCT).
            </p>
            <p className="text-slate-400 font-mono pt-1 border-t border-slate-200/60">
              Report ID: {report.id} • Screening ID: {report.screeningId} • Generated: {report.generatedDate} • Eye: {report.eye} ({eyeShort})
            </p>
          </footer>
        </section>
      </div>

      {/* Fullscreen Deep Inspection Modal */}
      {isFullscreenOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-in fade-in duration-150 print:hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h4 className="text-xs font-bold text-white tracking-wide uppercase">
                High-Resolution Evidence Inspection — {activeXaiTab}
              </h4>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                ({report.eye} • 512×512 Canonical)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                {(['Original', 'Lesions', 'Grad-CAM++', 'Anatomy', 'Combined'] as XaiTab[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveXaiTab(mode)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      activeXaiTab === mode ? 'bg-[#0284C7] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {(activeXaiTab === 'Grad-CAM++' || activeXaiTab === 'Combined') && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-300">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] text-slate-400">Heatmap:</span>
                  <input
                    type="range"
                    min="20"
                    max="95"
                    value={heatmapOpacity}
                    onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
                    className="w-16 accent-[#0284C7] cursor-pointer"
                  />
                  <span className="text-[11px] font-mono text-slate-400">{heatmapOpacity}%</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsFullscreenOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                title="Close Fullscreen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full h-full flex items-center justify-center p-2 overflow-hidden">
            <FundusRetinaCanvas
              mode={activeXaiTab}
              opacity={heatmapOpacity}
              className="w-full h-full"
              imageOriginal={originalImg}
              imageGradCam={gradCamImg}
              imageLesions={lesionsImg}
              imageAnatomy={anatomyImg}
              imageCombined={combinedImg}
              imageDebugAnatomy={debugAnatomyImg}
              highlightLesion={highlightedLesion}
            />
          </div>
        </div>
      )}

      {/* Send to Patient Phone Modal */}
      {isSendingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">Send Report Link to Patient</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsSendingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Send an automated SMS containing a secure link to access this official screening report:
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
              <p><span className="text-slate-400">Patient:</span> <strong>{report.patientName}</strong></p>
              <p><span className="text-slate-400">Phone:</span> <strong className="font-mono">{patientPhoneNumber}</strong></p>
              <p><span className="text-slate-400">Report ID:</span> <span className="font-mono text-slate-700">{report.id}</span></p>
            </div>

            {sendSuccess ? (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Report sent successfully to {patientPhoneNumber}!</span>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSendingModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleSimulateSend}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Phone className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Send</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
