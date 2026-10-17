import React, { useState } from 'react';
import {
  X,
  FileText,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  EyeOff,
  Activity,
  Layers,
  Send,
  Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { resolveImageUrl, getArtifactUrl, FALLBACK_IMAGES } from '../utils/imageUtils';
import { downloadGlaucomaPdf } from '../utils/generateMedicalPdf';
import {
  generateGlaucomaDoctorTriage,
  generateGlaucomaPatientExplanation,
} from '../utils/glaucomaClinicalExplanations';
import { GlaucomaResultsExplainedPanel } from './GlaucomaResultsExplainedPanel';

export const GlaucomaReportModal: React.FC = () => {
  const {
    isGlaucomaReportModalOpen,
    setIsGlaucomaReportModalOpen,
    activeGlaucomaScreeningForModal,
    openGlaucomaReportDetail,
    setIsReferralModalOpen,
    setActiveScreeningForModal,
    patients,
  } = useApp();

  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  // Live-artifact retry: stored signed URLs expire after 24h — on load
  // failure, retry once against the live (non-expiring) artifact endpoint
  // before showing "Unavailable".
  const [imgLiveRetry, setImgLiveRetry] = useState<Record<string, boolean>>({});

  if (!isGlaucomaReportModalOpen || !activeGlaucomaScreeningForModal) return null;

  const screening = activeGlaucomaScreeningForModal;
  const isSuspect =
    screening.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ||
    Boolean(screening.glaucomaFlag) ||
    (screening.verticalCDR || 0) > 0.58;

  const patient = patients.find((p) => p.id === screening.patientId);

  const handleOpenFullPage = () => {
    setIsGlaucomaReportModalOpen(false);
    openGlaucomaReportDetail(screening.id);
  };

  const handleModalImgError = (panel: string, liveName: string, currentSrc: string) => {
    const liveUrl = getArtifactUrl(screening.id, liveName);
    if (!imgLiveRetry[panel] && liveUrl && currentSrc !== liveUrl) {
      setImgLiveRetry((prev) => ({ ...prev, [panel]: true }));
    } else {
      setImgErrors((prev) => ({ ...prev, [panel]: true }));
    }
  };
  const modalImgSrc = (panel: string, liveName: string, primary?: string | null) => {
    if (imgLiveRetry[panel]) {
      return getArtifactUrl(screening.id, liveName) || FALLBACK_IMAGES.glaucoma;
    }
    return resolveImageUrl(primary || getArtifactUrl(screening.id, liveName), FALLBACK_IMAGES.glaucoma);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      await downloadGlaucomaPdf(screening, patient);
    } catch (e) {
      console.error('[GlaucomaReportModal] PDF download error:', e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleReferToSpecialist = () => {
    setIsGlaucomaReportModalOpen(false);
    setActiveScreeningForModal(screening as any);
    setIsReferralModalOpen(true);
  };

  const doctorTriage = generateGlaucomaDoctorTriage({
    verticalCDR: screening.verticalCDR,
    glaucomaPrediction: screening.glaucomaPrediction,
    glaucomaFlag: screening.glaucomaFlag,
  });

  const patientExplanation = generateGlaucomaPatientExplanation({
    glaucomaPrediction: screening.glaucomaPrediction,
    glaucomaFlag: screening.glaucomaFlag,
  });

  const verticalCdrVal =
    screening.cdrFeatures?.vertical_cdr ?? screening.verticalCDR ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-teal-50 text-teal-700 border border-teal-100 shadow-2xs">
              <Eye className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Glaucoma Screening Clinical Report</h3>
              <p className="text-[11px] text-slate-500">Report ID: <span className="font-mono">{screening.id}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
              ) : (
                <Download className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>{isDownloading ? 'Generating...' : 'PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGlaucomaReportModalOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Patient Header */}
          <div className="flex justify-between items-center p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <span className="font-bold text-slate-900 text-sm">{screening.patientName}</span>
              <span className="text-slate-500 block text-[11px] mt-0.5">
                {screening.patientId} • {screening.patientAge} yrs • {screening.patientGender} • {screening.eye}
              </span>
            </div>
            <div className="text-right text-slate-500 text-[11px] space-y-0.5">
              <div>Date: <span className="font-semibold text-slate-700">{screening.date}</span></div>
              <div>Quality: <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{screening.imageQuality || 'Good'}</span></div>
            </div>
          </div>

          {/* Verdict Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isSuspect ? 'bg-amber-50/80 border-amber-200' : 'bg-emerald-50/80 border-emerald-200'
            }`}
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Screening Verdict</div>
              <div
                className={`text-lg font-extrabold flex items-center gap-2 mt-0.5 ${
                  isSuspect ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {isSuspect ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span>GLAUCOMA SUSPECT</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>NORMAL / LOW RISK</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5 max-w-md">
                {screening.clinicalRecommendation ||
                  (isSuspect
                    ? 'Elevated cup-to-disc ratio or structural feature suspicion. Dilated ophthalmoscopy and tonometry advised.'
                    : 'Optic nerve head morphology within expected physiological limits.')}
              </p>
            </div>
            <div className="text-right pl-3">
              <div className={`font-black text-xl font-mono ${isSuspect ? 'text-amber-700' : 'text-emerald-700'}`}>
                {((screening.glaucomaProbability || 0) * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500 font-medium uppercase">Glaucoma Probability</div>
            </div>
          </div>

          {/* Visual Thumbnails (4-Panel Clinical Evidence Gallery matching Cataract & DR) */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-teal-600" />
              <span>Visual AI Evidence & Screening Result (1:1 Canonical Frames)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* 1. Original Fundus */}
              <div className="space-y-1 text-center">
                <div className="rounded-xl overflow-hidden bg-slate-950 aspect-square flex items-center justify-center border border-slate-800 p-1">
                  {!imgErrors['original'] && (screening.imageOriginal || screening.artifacts?.original || getArtifactUrl(screening.id, 'original')) ? (
                    <img
                      src={modalImgSrc('original', 'original', screening.imageOriginal || screening.artifacts?.original)}
                      alt="Original Fundus"
                      className="w-full h-full object-contain"
                      onError={(e) => handleModalImgError('original', 'original', (e.target as HTMLImageElement).src)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                      <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                      <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-semibold text-slate-600 block">1. Original Fundus</span>
              </div>

              {/* 2. Optic Disc & Cup */}
              <div className="space-y-1 text-center">
                <div className="rounded-xl overflow-hidden bg-slate-950 aspect-square flex items-center justify-center border border-slate-800 p-1">
                  {!imgErrors['optic_nerve'] && (screening.imageOpticNerve || screening.artifacts?.optic_nerve || screening.artifacts?.opticNerve || getArtifactUrl(screening.id, 'optic_nerve')) ? (
                    <img
                      src={modalImgSrc('optic_nerve', 'optic_nerve', screening.imageOpticNerve || screening.artifacts?.optic_nerve || screening.artifacts?.opticNerve)}
                      alt="Optic Disc & Cup"
                      className="w-full h-full object-contain"
                      onError={(e) => handleModalImgError('optic_nerve', 'optic_nerve', (e.target as HTMLImageElement).src)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                      <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                      <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-semibold text-teal-700 block">2. Disc & Cup (U-Net)</span>
              </div>

              {/* 3. Retinal Vessels */}
              <div className="space-y-1 text-center">
                <div className="rounded-xl overflow-hidden bg-slate-950 aspect-square flex items-center justify-center border border-slate-800 p-1">
                  {!imgErrors['vessels'] && (screening.imageRetinalAnatomy || screening.artifacts?.vessels || screening.artifacts?.retinalAnatomy || getArtifactUrl(screening.id, 'vessels')) ? (
                    <img
                      src={modalImgSrc('vessels', 'vessels', screening.imageRetinalAnatomy || screening.artifacts?.vessels || screening.artifacts?.retinalAnatomy)}
                      alt="Retinal Vessels"
                      className="w-full h-full object-contain"
                      onError={(e) => handleModalImgError('vessels', 'vessels', (e.target as HTMLImageElement).src)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                      <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                      <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-semibold text-sky-700 block">3. Retinal Vessels</span>
              </div>

              {/* 4. Grad-CAM / Workflow */}
              <div className="space-y-1 text-center">
                <div className="rounded-xl overflow-hidden bg-slate-950 aspect-square flex items-center justify-center border border-slate-800 p-1">
                  {!imgErrors['gradcam'] && (screening.imageGradCam || screening.imageWorkflow || screening.artifacts?.gradcam || getArtifactUrl(screening.id, 'gradcam')) ? (
                    <img
                      src={modalImgSrc('gradcam', 'gradcam', screening.imageGradCam || screening.imageWorkflow || screening.artifacts?.gradcam)}
                      alt="Grad-CAM Focus"
                      className="w-full h-full object-contain"
                      onError={(e) => handleModalImgError('gradcam', 'gradcam', (e.target as HTMLImageElement).src)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                      <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                      <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-semibold text-purple-700 block">4. Grad-CAM Attention</span>
              </div>
            </div>
          </div>

          {/* Key Quantitative Morphometry Grid */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="text-[11px] font-bold uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-teal-600" />
              <span>Quantitative Optic Nerve Morphometry</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Vertical CDR</span>
                <span className={`font-bold font-mono text-sm mt-0.5 block ${verticalCdrVal > 0.55 ? 'text-amber-700' : 'text-slate-900'}`}>
                  {verticalCdrVal > 0 ? Number(verticalCdrVal).toFixed(3) : '—'}
                </span>
                <span className="text-[9.5px] text-slate-400">Normal &lt; 0.55</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Horizontal CDR</span>
                <span className="font-bold font-mono text-slate-900 text-sm mt-0.5 block">
                  {(screening.cdrFeatures?.horizontal_cdr ?? screening.horizontalCDR) != null && (screening.cdrFeatures?.horizontal_cdr ?? screening.horizontalCDR) !== 0
                    ? Number(screening.cdrFeatures?.horizontal_cdr ?? screening.horizontalCDR).toFixed(3)
                    : '—'}
                </span>
                <span className="text-[9.5px] text-slate-400">Normal &lt; 0.60</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Area CDR</span>
                <span className="font-bold font-mono text-slate-900 text-sm mt-0.5 block">
                  {(screening.cdrFeatures?.area_cdr ?? screening.areaCDR) != null && (screening.cdrFeatures?.area_cdr ?? screening.areaCDR) !== 0
                    ? Number(screening.cdrFeatures?.area_cdr ?? screening.areaCDR).toFixed(3)
                    : '—'}
                </span>
                <span className="text-[9.5px] text-slate-400">Excavation Ratio</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Cup Inside Ratio</span>
                <span className="font-bold font-mono text-emerald-700 text-sm mt-0.5 block">
                  {screening.cdrFeatures?.cup_inside_ratio != null
                    ? `${(Number(screening.cdrFeatures.cup_inside_ratio) * 100).toFixed(0)}%`
                    : '100%'}
                </span>
                <span className="text-[9.5px] text-slate-400">Concordance</span>
              </div>
            </div>
          </div>

          {/* Glaucoma Screening — Results Explained */}
          <GlaucomaResultsExplainedPanel
            data={{
              glaucomaPrediction: screening.glaucomaPrediction,
              glaucomaProbability: screening.glaucomaProbability,
              normalProbability: screening.normalProbability,
              glaucomaFlag: screening.glaucomaFlag,
              confidence: screening.glaucomaProbability ? Math.round(screening.glaucomaProbability * 100) : 92,
              verticalCDR: verticalCdrVal,
              horizontalCDR: screening.horizontalCDR,
              areaCDR: screening.areaCDR,
              cdrFeatures: screening.cdrFeatures as any,
              vesselsDetected: screening.vesselsDetected,
              vesselDensityPct: screening.vesselDensityPct,
              imageQuality: screening.imageQuality,
              gradcamAvailable: Boolean(screening.imageGradCam || screening.artifacts?.gradcam),
              clinicalRecommendation: screening.clinicalRecommendation,
              specialistReviewStatus: 'Pending Specialist Review',
            }}
            compact
          />

          {/* Doctor Triage & Patient Explanation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                Doctor's Clinical Triage Summary
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                {doctorTriage.triageText}
              </p>
            </div>

            <div className="p-3.5 bg-teal-50/50 rounded-xl border border-teal-100 space-y-1">
              <span className="font-bold text-teal-900 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-teal-600" />
                What This Means For The Patient
              </span>
              <p className="text-slate-700 text-[11px] leading-relaxed">
                {patientExplanation}
              </p>
            </div>
          </div>

          {/* Clinical Precautions */}
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 text-xs">
            <span className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Clinical Precautions & Recommendations
            </span>
            <ul className="text-slate-700 text-[11px] space-y-0.5 list-disc list-inside">
              {doctorTriage.precautions.map((p, idx) => (
                <li key={idx}>{p}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={handleReferToSpecialist}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-amber-600" />
            <span>Refer to Glaucoma Specialist</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsGlaucomaReportModalOpen(false)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleOpenFullPage}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0284C7] hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Open Full Clinical Report</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
