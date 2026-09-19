import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Send,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
  ShieldCheck,
  Info,
  Phone,
  Check,
  Loader2,
  AlertCircle,
  XCircle,
  Activity,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FundusRetinaCanvas } from './FundusRetinaCanvas';
import { downloadRetinaXPdf } from '../utils/generateMedicalPdf';

export const DetailedReportPage: React.FC = () => {
  const {
    activeReportId,
    reports,
    patients,
    setActivePage,
    sendReportToPatientPhone,
  } = useApp();

  const report = reports.find((r) => r.id === activeReportId) || reports[0];
  const patient = patients.find((p) => p.id === report?.patientId);

  const [isSendingModalOpen, setIsSendingModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!report) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-3.5 rounded-full bg-slate-100 text-slate-400">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">No Report Available</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
          No report has been generated yet. Complete a screening analysis first to view a report here.
        </p>
        <button
          type="button"
          onClick={() => setActivePage('dashboard')}
          className="mt-3 px-4 py-2 bg-[#1E60D5] text-white text-xs font-semibold rounded-lg"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const patientPhoneNumber = report.patientPhone || patient?.phoneNumber || '';
  const hasVisualizations = !!(report.imageOriginal || report.imageLesions || report.imageAnatomy);

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

  const handleSimulateSend = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setSendSuccess(true);
      sendReportToPatientPhone(report.id);
      setTimeout(() => {
        setIsSendingModalOpen(false);
        setSendSuccess(false);
      }, 2600);
    }, 1200);
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

  const formatCenter = (center: unknown): string | undefined => {
    if (!center) return undefined;
    if (Array.isArray(center) && center.length >= 2) {
      const x = typeof center[0] === 'number' ? Math.round(center[0]) : center[0];
      const y = typeof center[1] === 'number' ? Math.round(center[1]) : center[1];
      return `(${x}, ${y})`;
    }
    if (typeof center === 'object' && center !== null) {
      const obj = center as { x?: unknown; y?: unknown };
      if (obj.x !== undefined && obj.y !== undefined) {
        const x = typeof obj.x === 'number' ? Math.round(obj.x) : obj.x;
        const y = typeof obj.y === 'number' ? Math.round(obj.y) : obj.y;
        return `(${x}, ${y})`;
      }
    }
    return undefined;
  };

  // Helper to safely get lesion count & pixels for any key alias
  const getLesionStats = (key: 'MA' | 'HE' | 'EX' | 'SE') => {
    if (!report.lesionData || typeof report.lesionData !== 'object') {
      return { regions: 0, pixels: 0, detected: false };
    }
    const aliases: Record<string, string[]> = {
      MA: ['MA', 'ma', 'Microaneurysms', 'microaneurysms', 'Microaneurysm', 'microaneurysm'],
      HE: ['HE', 'he', 'Haemorrhages', 'haemorrhages', 'Hemorrhages', 'hemorrhages', 'Haemorrhage', 'haemorrhage'],
      EX: ['EX', 'ex', 'Hard Exudates', 'hard exudates', 'Exudates', 'exudates', 'Hard Exudate'],
      SE: ['SE', 'se', 'Soft Exudates', 'soft exudates', 'Cotton Wool Spots', 'cotton wool spots', 'Soft Exudate'],
    };
    for (const alias of aliases[key] || [key]) {
      const item = (report.lesionData as Record<string, { detected?: boolean; regions?: number; pixels?: number }>)[alias];
      if (item && typeof item === 'object') {
        return {
          regions: typeof item.regions === 'number' ? item.regions : 0,
          pixels: typeof item.pixels === 'number' ? item.pixels : 0,
          detected: Boolean(item.detected),
        };
      }
    }
    return { regions: 0, pixels: 0, detected: false };
  };

  // ---- Anatomy section: real data or empty state ----
  const anatomy = report.anatomyData;
  const anatomyRows = anatomy
    ? [
      {
        label: 'Optic Disc',
        detected: anatomy.optic_disc?.detected,
        extra: formatPx(anatomy.optic_disc?.pixels),
      },
      {
        label: 'Macula / Fovea',
        detected: anatomy.macula?.detected ?? true,
        extra: anatomy.fovea ? formatCoord(anatomy.fovea.x, anatomy.fovea.y) : undefined,
      },
      {
        label: 'Retinal Blood Vessels',
        detected: anatomy.blood_vessels?.detected,
        extra: formatPx(anatomy.blood_vessels?.pixels),
      },
    ]
    : null;

  // ---- Lesion section: real data or empty state ----
  const lesionData = report.lesionData;
  const lesionRows = lesionData && typeof lesionData === 'object'
    ? Object.entries(lesionData).map(([name, info]) => ({
        name,
        detected: Boolean(info && typeof info === 'object' && (info as any).detected),
      }))
    : report.findings?.map((f) => ({ name: typeof f === 'string' ? f : String(f), detected: true })) || [];


  // ---- Quality badge ----
  const qualityIsGood = report.imageQuality === 'Good';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Top Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setActivePage('patients')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-slate-600" />
                <span>Download PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsSendingModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-xs shadow-blue-500/20 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{report.status === 'Sent to Patient' ? 'Resend Report' : 'Send Report'}</span>
          </button>
        </div>
      </div>

      {/* Main Medical Report Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-8 md:p-10 space-y-8 text-slate-800 print:border-none print:shadow-none print:p-0">
        {/* Report Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b-2 border-slate-900">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0D1829] text-white font-bold text-sm">
                R-X
              </div>
              <h1 className="text-xl font-black tracking-wider text-slate-900">
                RETINA-X
              </h1>
            </div>
            <p className="text-sm font-semibold text-blue-700 mt-1 uppercase tracking-wide">
              AI-Assisted Retinal Screening Report
            </p>
            <p className="text-xs text-slate-500">
              Department of Tele-Ophthalmology &amp; Diabetic Retinopathy Screening
            </p>
          </div>

          <div className="text-left sm:text-right space-y-0.5 text-xs text-slate-600">
            <p><strong>Report ID:</strong> {report.id}</p>
            <p><strong>Screening ID:</strong> {report.screeningId}</p>
            <p><strong>Date Generated:</strong> {report.generatedDate}</p>
            <div className="mt-2">
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${report.status === 'Sent to Patient'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
              >
                Status: {report.status}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 1: PATIENT INFORMATION */}
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">
            Patient Information
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block">Full Name</span>
              <strong className="text-sm text-slate-900">{report.patientName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Patient ID</span>
              <strong className="text-sm text-slate-900">{report.patientId}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Age &amp; Gender</span>
              <strong className="text-slate-900">{report.patientAge} Years / {report.patientGender}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Phone Number</span>
              <strong className="text-slate-900">{patientPhoneNumber || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Date of Screening</span>
              <strong className="text-slate-900">{report.generatedDate}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Eye Screened</span>
              <span className="font-bold text-blue-700">{report.eye}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Screening Nurse</span>
              <strong className="text-slate-900">{report.nurseName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Diabetes Duration</span>
              <strong className="text-slate-900">{patient?.diabetesDurationYears ?? '—'} {patient?.diabetesDurationYears != null ? 'Years' : ''}</strong>
            </div>
          </div>
        </div>

        {/* SECTION 2: IMAGE INFORMATION */}
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">
            Image Information &amp; Quality Assessment
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block">Image Filename</span>
              <span className="font-mono text-slate-800 font-semibold truncate block">
                {report.imageFileName}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">File Size</span>
              <span className="text-slate-800 font-semibold">{report.imageFileSize}</span>
            </div>
            {report.imageResolution && (
              <div>
                <span className="text-slate-400 block">Resolution</span>
                <span className="text-slate-800 font-semibold font-mono">{report.imageResolution}</span>
              </div>
            )}
            <div>
              <span className="text-slate-400 block">Quality Status</span>
              {qualityIsGood ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Good (Suitable for Analysis)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  <XCircle className="w-3 h-3 text-red-600" />
                  <span>{report.imageQuality}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: AI SCREENING RESULT */}
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">
            AI Screening Result
          </h2>
          <div className="p-5 rounded-xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-blue-600 uppercase font-bold tracking-wider">Classification</span>
              <h3 className="text-xl font-black text-slate-900 mt-0.5">
                {report.drSeverityLevel || report.drSeverity}
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Deep neural ensemble prediction calibrated for primary tele-screening.
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-xs text-slate-500 uppercase font-semibold block">Confidence Score</span>
              <span className="text-3xl font-black text-blue-700">{report.confidence}%</span>
              <span className="text-[11px] text-slate-500 block">Threshold: &gt;85% High</span>
            </div>
          </div>
        </div>

        {/* SECTION 4 & 5: AI DETECTED FEATURES & RETINAL ANATOMY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AI Detected Features */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>AI-Detected Features</span>
            </h3>
            {lesionRows.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {lesionRows.map(({ name, detected }) => (
                  <li key={name} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-600">{name}</span>
                    {detected ? (
                      <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Present / Detected
                      </span>
                    ) : (
                      <span className="font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        Not observed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>No lesion data available for this screening.</span>
              </div>
            )}
          </div>

          {/* Retinal Anatomy */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-blue-600" />
              <span>Retinal Anatomy Localization</span>
            </h3>
            {anatomyRows ? (
              <ul className="space-y-2 text-xs">
                {anatomyRows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-600">{row.label}</span>
                    <div className="flex items-center gap-1.5">
                      {row.extra && <span className="text-[10px] text-slate-400 font-mono">{row.extra}</span>}
                      {row.detected ? (
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Detected
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                          Not detected
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>No anatomy localization data available for this screening.</span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 6: EXPLAINABILITY VISUALIZATIONS */}
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-1">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Explainability Visualizations
            </h2>
            {hasVisualizations && (
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                Real ML Pipeline Outputs
              </span>
            )}
          </div>

          {hasVisualizations ? (
            <div className="space-y-6">
              {/* 4-Panel Visualization Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Original Fundus */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Original Fundus</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      Canonical 512×512
                    </span>
                  </div>
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black border border-slate-300">
                    <FundusRetinaCanvas
                      mode="Original"
                      imageOriginal={report.imageOriginal}
                      className="w-full h-full"
                    />
                  </div>
                </div>

                {/* 2. Lesion Segmentation Overlay */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Lesion Segmentation</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700">
                      MA • HE • EX • SE
                    </span>
                  </div>
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black border border-slate-300">
                    <FundusRetinaCanvas
                      mode="Lesions"
                      imageOriginal={report.imageOriginal}
                      imageLesions={report.imageLesions}
                      className="w-full h-full"
                    />
                  </div>
                </div>

                {/* 3. Retinal Anatomy Localization */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Retinal Anatomy Localization</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      Vessels • Disc • Fovea
                    </span>
                  </div>
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black border border-slate-300">
                    <FundusRetinaCanvas
                      mode="Anatomy"
                      imageOriginal={report.imageOriginal}
                      imageAnatomy={report.imageAnatomy}
                      className="w-full h-full"
                    />
                  </div>
                </div>

                {/* 4. Combined / XAI Saliency Heatmap */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">XAI / Combined Overlay</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                      Multi-Task Fusion
                    </span>
                  </div>
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black border border-slate-300">
                    <FundusRetinaCanvas
                      mode="Combined"
                      imageOriginal={report.imageOriginal}
                      imageGradCam={report.imageGradCam}
                      imageCombined={report.imageCombined}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>

              {/* What do the markings mean? Lesion Legend */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    What do the markings mean? — Clinical Lesion Legend
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* MA */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-sm bg-[#DC2626] shrink-0 border border-red-700 shadow-2xs" />
                      <span className="font-bold text-slate-900">MA — Microaneurysm</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Tiny outpouchings of retinal capillaries; earliest observable vascular sign of diabetic retinopathy.
                    </p>
                  </div>

                  {/* HE */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-sm bg-[#7C3AED] shrink-0 border border-purple-800 shadow-2xs" />
                      <span className="font-bold text-slate-900">HE — Haemorrhage</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Blood leakage into retinal layers resulting from damaged and ruptured microvessels.
                    </p>
                  </div>

                  {/* EX */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-sm bg-[#EAB308] shrink-0 border border-amber-600 shadow-2xs" />
                      <span className="font-bold text-slate-900">EX — Hard Exudate</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Lipid and proteinaceous deposits accumulating from persistent vascular permeability and leakage.
                    </p>
                  </div>

                  {/* SE */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-sm bg-[#10B981] shrink-0 border border-emerald-600 shadow-2xs" />
                      <span className="font-bold text-slate-900">SE — Soft Exudate</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Cotton-wool spots representing focal retinal nerve fiber layer micro-infarcts from ischemia.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quantitative Measurements & Spatial Analysis Cards */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <span>Real Model Measurements &amp; Quantitative Features</span>
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {/* Blood Vessels Card */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-slate-500 block text-[11px] font-semibold">Vessel Pixels</span>
                    <strong className="text-sm font-mono text-slate-900 block">
                      {anatomy?.blood_vessels?.pixels ? `${anatomy.blood_vessels.pixels.toLocaleString()} px` : '—'}
                    </strong>
                    <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-200/60">
                      <p>Density: <span className="font-mono font-semibold text-slate-800">{anatomy?.blood_vessels?.density ?? anatomy?.measurements?.vessel_density_pct ?? '—'}%</span></p>
                      <p>Macular: <span className="font-mono font-semibold text-slate-800">{anatomy?.blood_vessels?.macular_density ?? anatomy?.measurements?.macular_vessel_density_pct ?? '—'}%</span></p>
                    </div>
                  </div>

                  {/* Optic Disc Card */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-slate-500 block text-[11px] font-semibold">Optic Disc Area</span>
                    <strong className="text-sm font-mono text-slate-900 block">
                      {anatomy?.optic_disc?.pixels ? `${anatomy.optic_disc.pixels.toLocaleString()} px` : '—'}
                    </strong>
                    <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-200/60">
                      <p>Status: <span className="font-semibold text-emerald-700">{anatomy?.optic_disc?.detected ? 'Localized' : '—'}</span></p>
                      {anatomy?.optic_disc?.center && (
                        <p>Center: <span className="font-mono text-slate-800">({anatomy.optic_disc.center[0]}, {anatomy.optic_disc.center[1]})</span></p>
                      )}
                    </div>
                  </div>

                  {/* Fovea & Disc Distance Card */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-slate-500 block text-[11px] font-semibold">Fovea Coordinates</span>
                    <strong className="text-sm font-mono text-slate-900 block">
                      {anatomy?.fovea ? `(${Math.round(anatomy.fovea.x)}, ${Math.round(anatomy.fovea.y)})` : '—'}
                    </strong>
                    <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-200/60">
                      <p>OD–Fovea: <span className="font-mono font-semibold text-slate-800">{anatomy?.fovea?.disc_distance ?? anatomy?.measurements?.disc_fovea_distance_px ?? '—'} px</span></p>
                      <p>Macula ROI: <span className="font-semibold text-emerald-700">Present</span></p>
                    </div>
                  </div>

                  {/* Lesion Region Counts Card */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-slate-500 block text-[11px] font-semibold">Lesion Regions</span>
                    <div className="text-[11px] text-slate-700 space-y-0.5 pt-0.5 font-mono">
                      <p className="flex justify-between"><span className="text-red-700 font-bold">MA:</span> <span>{lesionData?.['MA']?.regions ?? 0} ({lesionData?.['MA']?.pixels ?? 0}px)</span></p>
                      <p className="flex justify-between"><span className="text-fuchsia-700 font-bold">HE:</span> <span>{lesionData?.['HE']?.regions ?? 0} ({lesionData?.['HE']?.pixels ?? 0}px)</span></p>
                      <p className="flex justify-between"><span className="text-amber-700 font-bold">EX:</span> <span>{lesionData?.['EX']?.regions ?? 0} ({lesionData?.['EX']?.pixels ?? 0}px)</span></p>
                      <p className="flex justify-between"><span className="text-sky-700 font-bold">SE:</span> <span>{lesionData?.['SE']?.regions ?? 0} ({lesionData?.['SE']?.pixels ?? 0}px)</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <span>No visualization maps available for this screening record. Run screening to generate overlays.</span>
            </div>
          )}
        </div>

      {/* SECTION 7: AI-ASSISTED EXPLANATION */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          AI-Assisted Plain-Language Explanation
        </h2>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed space-y-2">
          {report.plainLanguageExplanation ? (
            <p>{report.plainLanguageExplanation}</p>
          ) : (
            <div className="flex items-center gap-2 text-slate-500">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Plain-language explanation was not generated for this screening record.</span>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 8: CLINICAL INFORMATION (RAG REFERENCE) */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          Clinical Reference Information
        </h2>
        <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 text-xs text-slate-700 space-y-2">
          <div className="flex items-center gap-1.5 text-indigo-900 font-bold">
            <Info className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Reference Information from Curated Clinical Guidelines</span>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Diabetic retinopathy is a microvascular complication of diabetes caused by prolonged high blood sugar levels damaging the tiny capillaries in the retina at the back of the eye. In its early stages, symptoms are frequently silent, yet irreversible vision loss can occur without systematic screening and timely glycemic and laser/anti-VEGF intervention.
          </p>
          <p className="text-[11px] text-slate-500 italic">
            Source: International Council of Ophthalmology (ICO) Guidelines for Diabetic Eye Care.
          </p>
        </div>
      </div>

      {/* SECTION 9: REFERRAL & SPECIALIST REVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Referral Recommendation */}
        <div className="p-5 rounded-xl bg-amber-50/50 border border-amber-200 space-y-2">
          <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
            Referral Recommendation
          </h3>
          {report.referralStatus === 'Referred to Specialist' || report.referralPriority ? (
            <div className="space-y-1.5 text-xs text-slate-700">
              <p><strong>Referral Status:</strong> {report.referralStatus}</p>
              <p><strong>Priority:</strong> {report.referralPriority || '—'}</p>
              <p><strong>Reason:</strong> {report.referralReason || '—'}</p>
            </div>
          ) : (
            <div className="space-y-1.5 text-xs text-slate-700">
              <p><strong>Referral:</strong> <span className="font-semibold text-slate-700">Not referred</span></p>
              <p className="text-slate-500 text-[11px]">No immediate vitreo-retinal referral required based on current screening findings. Routine 12-month annual screening cycle advised.</p>
            </div>
          )}
        </div>

        {/* Specialist Review */}
        <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
            <span>Specialist Review</span>
            {report.specialistReview ? (
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
                Reviewed
              </span>
            ) : (
              <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">
                Pending
              </span>
            )}
          </h3>
          {report.specialistReview ? (
            <div className="text-xs text-slate-700 space-y-1">
              <p><strong>Reviewer:</strong> {report.specialistReview.specialistName}</p>
              <p><strong>Date:</strong> {report.specialistReview.reviewDate}</p>
              <p><strong>Specialist Assessment:</strong> {report.specialistReview.assessment}</p>
              <p><strong>Specialist Notes:</strong> {report.specialistReview.notes}</p>
              <p><strong>Specialist Recommendation:</strong> {report.specialistReview.recommendation}</p>
            </div>
          ) : (
            <div className="text-xs text-slate-700 space-y-1 py-1">
              <p><strong>Specialist Review:</strong> <span className="font-semibold text-amber-700">Pending</span></p>
              <p><strong>Specialist Assessment:</strong> <span className="text-slate-500 italic">Pending specialist evaluation</span></p>
              <p><strong>Specialist Notes:</strong> <span className="text-slate-500 italic">Queued for tele-ophthalmology verification</span></p>
              <p><strong>Specialist Recommendation:</strong> <span className="text-slate-500 italic">Pending clinical review by assigned specialist</span></p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 10: FOLLOW-UP RECOMMENDATION */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
        <span className="font-bold text-slate-900 block mb-1">Follow-up Recommendation</span>
        <p className="text-slate-600">
          {report.drSeverity === 'No DR'
            ? 'Routine annual diabetic eye screening is recommended. Continue blood glucose (HbA1c < 7.0%) and blood pressure monitoring in consultation with the primary physician.'
            : report.drSeverity === 'Mild'
              ? 'Follow-up dilated eye examination within 6–12 months. Ensure strict blood glucose and blood pressure control.'
              : <>Comprehensive dilated ophthalmology evaluation within <strong>2 to 4 weeks</strong>. Continue strict blood glucose (HbA1c &lt; 7.0%) and blood pressure monitoring in consultation with the primary physician.</>}
        </p>
      </div>

      {/* SECTION 11: PATIENT PHONE & SEND REPORT */}
      <div className="p-5 rounded-xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block">
            Patient Phone
          </span>
          <div className="flex items-center gap-2 mt-1">
            <Phone className="w-4 h-4 text-blue-600" />
            <span className="text-base font-bold font-mono text-slate-900">
              {patientPhoneNumber || '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {report.status === 'Sent to Patient'
              ? '✓ Digital report was delivered to patient\'s registered phone number'
              : 'Click Send Report to transmit a digital copy to the patient\'s registered mobile'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsSendingModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>{report.status === 'Sent to Patient' ? 'Resend Report' : 'Send Report'}</span>
        </button>
      </div>

      {/* SECTION 12: OFFICIAL MEDICAL DISCLAIMER */}
      <div className="pt-4 border-t border-slate-200 text-center text-[11px] text-slate-500 leading-relaxed">
        <div className="flex items-center justify-center gap-1.5 font-semibold text-slate-700 mb-1">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>Official Regulatory Disclaimer</span>
        </div>
        <p>
          RETINA-X provides AI-assisted screening support and does not replace diagnosis by a qualified eye-care professional. Definitive clinical decisions should always be confirmed through direct dilated slit-lamp biomicroscopy or OCT by an ophthalmologist.
        </p>
      </div>
    </div>

      {/* SEND REPORT MODAL */ }
  {
    isSendingModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">Send Report to Patient</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsSendingModalOpen(false)}
              className="text-slate-400 hover:text-slate-700 text-sm"
            >
              ✕
            </button>
          </div>

          {sendSuccess ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold">Report Delivered Successfully</p>
              <p className="text-xs text-emerald-700">
                ✓ Report sent to patient&apos;s registered phone number:
              </p>
              <p className="font-mono text-sm font-bold text-emerald-900">
                {patientPhoneNumber || '—'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <p className="text-slate-500">Patient:</p>
                <p className="font-bold text-slate-900 text-sm">{report.patientName} ({report.patientId})</p>
                <div className="pt-2">
                  <p className="text-slate-500">Registered Phone Number:</p>
                  <p className="font-mono font-bold text-blue-700 text-sm">
                    {patientPhoneNumber || '—'}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                A direct link containing the digital PDF report and explainability visualizer will be transmitted via secure tele-health messaging.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSendingModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleSimulateSend}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-2"
                >
                  {isSending ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Send</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
    </div >
  );
};
