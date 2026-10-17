import React, { useState } from 'react';
import { X, Info, Sparkles } from 'lucide-react';
import { EVIDENCE_CARDS } from '../data/retinaImages';
import { useApp } from '../context/AppContext';

interface AiExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiExplanationModal: React.FC<AiExplanationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useApp();
  const [activeTab, setActiveTab] = useState<'why' | 'explanation' | 'clinical'>('why');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header matching clinical ophthalmology design */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-50 text-[#0284C7] border border-sky-100">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {t.aiExplanation}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                {t.xaiFeatureAttribution}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons: Why this result? | Explanation | Clinical References */}
        <div className="flex border-b border-slate-100 px-6 bg-slate-50/40">
          <button
            type="button"
            onClick={() => setActiveTab('why')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'why'
                ? 'border-[#0284C7] text-[#0284C7] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.whyThisResult}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('explanation')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'explanation'
                ? 'border-[#0284C7] text-[#0284C7] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.detailedModelExplanation}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('clinical')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'clinical'
                ? 'border-[#0284C7] text-[#0284C7] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.clinicalReferences}
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {activeTab === 'why' && (
            <>
              {/* Heading Callout */}
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-amber-800">
                    {t.aiScreeningResult}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    Moderate DR — Level 2
                  </span>
                </div>
                <p className="text-slate-700 text-xs leading-relaxed">
                  The screening model identified retinal patterns associated with moderate
                  diabetic retinopathy. The highlighted regions and detected features contributed to
                  the screening result.
                </p>
              </div>

              {/* Key Visual Evidence Grid */}
              <div>
                <h3 className="font-bold text-slate-900 mb-3 text-xs uppercase tracking-wider">
                  {t.keyVisualEvidence}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {EVIDENCE_CARDS.map((card) => (
                    <div
                      key={card.id}
                      className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl flex flex-col justify-between"
                    >
                      {/* Stylized Thumbnail Graphic */}
                      <div className="aspect-square w-full rounded-lg bg-slate-900 mb-2.5 overflow-hidden flex items-center justify-center relative">
                        {card.id === 'ma' && (
                          <div className="relative w-12 h-12 rounded-full bg-amber-950 flex items-center justify-center">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/80 animate-pulse" />
                            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-red-400" />
                          </div>
                        )}
                        {card.id === 'hem' && (
                          <div className="relative w-12 h-12 rounded-full bg-amber-950 flex items-center justify-center">
                            <div className="w-4 h-3 bg-red-600 rounded-full rotate-45" />
                            <div className="w-2 h-2 bg-red-700 rounded-full ml-1" />
                          </div>
                        )}
                        {card.id === 'ex' && (
                          <div className="relative w-12 h-12 rounded-full bg-amber-950 flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-sm" />
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 ml-1.5" />
                            <span className="w-1 h-1 rounded-full bg-yellow-200 -mt-2" />
                          </div>
                        )}
                        {card.id === 'gradcam' && (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#0284C7] via-amber-400 to-rose-500 opacity-90" />
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-xs leading-tight">
                          {card.title}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {card.category}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'explanation' && (
            <div className="space-y-3.5 leading-relaxed text-slate-700">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90">
                <h4 className="font-bold text-slate-900 mb-1">{t.spatialFeatureAttribution}</h4>
                <p className="text-xs">
                  The model utilized a multi-scale convolutional backbone with Guided Grad-CAM++
                  attention mechanisms. Spatial activations clustered primarily within the temporal
                  parafoveal region, corresponding to a cluster of 14 microaneurysms and flame
                  hemorrhages.
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90">
                <h4 className="font-bold text-slate-900 mb-1">{t.differentialStagingReasoning}</h4>
                <p className="text-xs space-y-1">
                  • <strong>Level 0 (No DR):</strong> Excluded due to presence of verified vascular abnormalities.<br />
                  • <strong>Level 1 (Mild DR):</strong> Excluded because lesions exceed isolated microaneurysms, including intraretinal hemorrhages.<br />
                  • <strong>Level 2 (Moderate DR):</strong> High probability match (87%) based on the International Clinical Diabetic Retinopathy (ICDR) scale.<br />
                  • <strong>Level 3+ (Severe / PDR):</strong> Excluded due to absence of venous beading or neovascularization.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'clinical' && (
            <div className="space-y-3 text-slate-700">
              <p className="text-xs font-bold text-slate-900">
                {t.peerReviewedGuidelines}:
              </p>
              <ul className="space-y-2.5 text-xs">
                <li className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90">
                  <p className="font-bold text-slate-900">
                    AAO Preferred Practice Pattern: Diabetic Retinopathy (2024)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    American Academy of Ophthalmology clinical staging and referral guidelines.
                  </p>
                </li>
                <li className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90">
                  <p className="font-bold text-slate-900">
                    Proposed International Clinical Diabetic Retinopathy Disease Severity Scale
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ophthalmology 2003;110:1677–1682. Grading criteria for Levels 0 through 4.
                  </p>
                </li>
              </ul>
            </div>
          )}

          {/* Blue Info Callout */}
          <div className="p-4 bg-sky-50/80 border border-sky-200 rounded-xl flex items-start gap-3 text-sky-950">
            <Info className="w-4.5 h-4.5 text-[#0284C7] shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong className="text-sky-900">{t.clinicalAdvisory}:</strong> {t.clinicalAdvisoryDesc}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-[#0284C7] hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};

