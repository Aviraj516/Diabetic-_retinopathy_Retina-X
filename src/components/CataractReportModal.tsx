import React, { useState } from 'react';
import { X, FileText, Download, Eye, AlertTriangle, CheckCircle2, ShieldCheck, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { resolveImageUrl, getArtifactUrl } from '../utils/imageUtils';

export const CataractReportModal: React.FC = () => {
  const {
    isCataractReportModalOpen,
    setIsCataractReportModalOpen,
    activeCataractScreeningForModal,
    openCataractReportDetail,
  } = useApp();
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  if (!isCataractReportModalOpen || !activeCataractScreeningForModal) return null;

  const screening = activeCataractScreeningForModal;
  const isCataract = screening.cataractPrediction === 'CATARACT';

  const handleOpenFullPage = () => {
    setIsCataractReportModalOpen(false);
    openCataractReportDetail(screening.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 shadow-2xs">
              <Eye className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Cataract Screening Summary</h3>
              <p className="text-[11px] text-slate-500">Report ID: <span className="font-mono">{screening.id}</span></p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCataractReportModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Patient Header */}
          <div className="flex justify-between items-center p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <span className="font-bold text-slate-900 text-sm">{screening.patientName}</span>
              <span className="text-slate-500 block text-[11px] mt-0.5">
                {screening.patientId} • {screening.patientAge} yrs • {screening.eye}
              </span>
            </div>
            <div className="text-right text-slate-500 text-[11px] space-y-0.5">
              <div>Date: <span className="font-semibold text-slate-700">{screening.date}</span></div>
              <div>Quality: <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">GOOD</span></div>
            </div>
          </div>

          {/* Verdict Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isCataract ? 'bg-rose-50/80 border-rose-200' : 'bg-emerald-50/70 border-emerald-200'
            }`}
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Diagnosis</div>
              <div
                className={`text-lg font-extrabold ${
                  isCataract ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {isCataract ? 'CATARACT DETECTED' : 'NORMAL / NO CATARACT'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-slate-900 text-sm font-mono">
                {((screening.cataractProbability || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-[10px] text-slate-500">Cataract Probability</div>
            </div>
          </div>

          {/* Visual Thumbnails (4-Panel Clinical Evidence) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="space-y-1 text-center">
              <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800">
                {!imgErrors['original'] && (screening.imageOriginal || screening.artifacts?.original || getArtifactUrl(screening.id, 'original')) ? (
                  <img
                    src={resolveImageUrl(screening.imageOriginal || screening.artifacts?.original || getArtifactUrl(screening.id, 'original'))}
                    alt="Original"
                    className="w-full h-full object-contain"
                    onError={() => setImgErrors((prev) => ({ ...prev, original: true }))}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                    <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                    <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-semibold text-slate-600 block">1. Original Eye</span>
            </div>

            <div className="space-y-1 text-center">
              <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800">
                {!imgErrors['analyzed_region'] && (screening.imageAnalyzedRegion || screening.imageEyeDetection || getArtifactUrl(screening.id, 'analyzed_region') || getArtifactUrl(screening.id, 'eye_box')) ? (
                  <img
                    src={resolveImageUrl(screening.imageAnalyzedRegion || screening.imageEyeDetection || getArtifactUrl(screening.id, 'analyzed_region') || getArtifactUrl(screening.id, 'eye_box'))}
                    alt="Analyzed Lens Region"
                    className="w-full h-full object-contain"
                    onError={() => setImgErrors((prev) => ({ ...prev, analyzed_region: true }))}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                    <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                    <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-semibold text-sky-700 block">2. Analyzed Region</span>
            </div>

            <div className="space-y-1 text-center">
              <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800">
                {!imgErrors['opacity_evidence'] && (screening.imageOpacityEvidence || getArtifactUrl(screening.id, 'opacity_evidence')) ? (
                  <img
                    src={resolveImageUrl(screening.imageOpacityEvidence || getArtifactUrl(screening.id, 'opacity_evidence'))}
                    alt="Opacity Evidence Map"
                    className="w-full h-full object-contain"
                    onError={() => setImgErrors((prev) => ({ ...prev, opacity_evidence: true }))}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                    <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                    <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-semibold text-red-700 block">3. Opacity Evidence</span>
            </div>

            <div className="space-y-1 text-center">
              <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800">
                {!imgErrors['gradcam'] && (screening.imageGradCam || getArtifactUrl(screening.id, 'gradcam')) ? (
                  <img
                    src={resolveImageUrl(screening.imageGradCam || getArtifactUrl(screening.id, 'gradcam'))}
                    alt="Grad-CAM++"
                    className="w-full h-full object-contain"
                    onError={() => setImgErrors((prev) => ({ ...prev, gradcam: true }))}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                    <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                    <span className="text-[8.5px] text-slate-400 leading-tight">Unavailable</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-semibold text-slate-700 block">4. Grad-CAM++ Attention</span>
            </div>
          </div>

          {screening.quantitativeAnalysis && (
            <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px]">
              <div>
                <span className="text-slate-400 block text-[9.5px]">Analyzed Region</span>
                <span className="font-bold text-slate-800 font-mono">
                  {screening.quantitativeAnalysis.analyzedRegionAreaPx ? `${screening.quantitativeAnalysis.analyzedRegionAreaPx.toLocaleString()} px` : 'ROI'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9.5px]">Opacity Zone</span>
                <span className="font-bold text-slate-800 font-mono">
                  {screening.quantitativeAnalysis.opacityEvidenceAreaPx ? `${screening.quantitativeAnalysis.opacityEvidenceAreaPx.toLocaleString()} px` : '0 px'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9.5px]">Evidence Coverage</span>
                <span className="font-bold text-slate-800 font-mono">
                  {screening.quantitativeAnalysis.opacityEvidencePercentage !== undefined ? `${screening.quantitativeAnalysis.opacityEvidencePercentage.toFixed(1)}%` : '0%'}
                </span>
              </div>
            </div>
          )}

          <p className="text-slate-600 leading-relaxed text-[11px] bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
            <strong className="text-slate-900">Recommendation:</strong> {screening.clinicalRecommendation || (isCataract ? 'If cataract is detected by the AI screening model, recommend ophthalmologist evaluation and slit-lamp examination for clinical confirmation.' : 'Clear crystalline lens pattern identified. Continue routine preventive ophthalmic checkup schedule.')}
          </p>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={() => setIsCataractReportModalOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleOpenFullPage}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0284C7] hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Open Full Clinical Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
