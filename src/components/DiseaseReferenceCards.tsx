import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, X, ExternalLink, Eye, Activity, Target } from 'lucide-react';

interface DiseaseCardProps {
  id: 'glaucoma' | 'cataract' | 'diabeticRetinopathy';
  icon: React.ReactNode;
}

export const ClinicalDiseaseReference: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="mt-8 space-y-4">
      <div className="px-1">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          Clinical Disease Reference
        </h2>
        <p className="text-base font-medium text-slate-500">
          Quick clinical cues for screening and interpretation
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DiseaseCard
          id="glaucoma"
          icon={<Target className="w-5 h-5 text-[#0284C7]" />}
        />
        <DiseaseCard
          id="cataract"
          icon={<Eye className="w-5 h-5 text-amber-600" />}
        />
        <DiseaseCard
          id="diabeticRetinopathy"
          icon={<Activity className="w-5 h-5 text-rose-600" />}
        />
      </div>
    </div>
  );
};

const DiseaseCard: React.FC<DiseaseCardProps> = ({ id, icon }) => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Use the nested keys we merged in i18n
  const title = t(`diseaseReference.${id}.title`);
  const overview = t(`diseaseReference.${id}.overview`);
  const symptomsRaw = t(`diseaseReference.${id}.symptoms`) || '';
  const symptoms = symptomsRaw.split('|');
  const screeningFocus = t(`diseaseReference.${id}.screeningFocus`);

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200/85 p-5 flex flex-col h-full hover:border-sky-300 hover:shadow-[0_10px_25px_-5px_rgba(15,23,42,0.05),0_8px_10px_-6px_rgba(15,23,42,0.02)] transition-all duration-200 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <h3 className="text-base font-extrabold text-[#0F172A] leading-tight">
            {title}
          </h3>
        </div>

        <p className="text-xs sm:text-[13px] text-slate-500 leading-relaxed mb-3.5 line-clamp-2">
          {overview}
        </p>

        <div className="space-y-3 mb-4 flex-1">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Key Symptoms
            </h4>
            <ul className="space-y-1">
              {symptoms.slice(0, 3).map((symptom, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1 shrink-0" />
                  <span className="leading-snug">{symptom}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Screening Focus
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/60 font-medium">
              {screeningFocus}
            </p>
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="text-xs font-bold text-[#0284C7] hover:text-sky-700 flex items-center gap-1 transition-colors cursor-pointer"
          >
            Learn more <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-medium text-slate-400">
            Mayo Clinic Guidelines
          </span>
        </div>
      </div>

      {isModalOpen && (
        <LearnMoreModal
          id={id}
          title={title}
          overview={overview}
          symptoms={symptoms}
          screeningFocus={screeningFocus}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
};

interface ModalProps {
  id: string;
  title: string;
  overview: string;
  symptoms: string[];
  screeningFocus: string;
  onClose: () => void;
}

const LearnMoreModal: React.FC<ModalProps> = ({ title, overview, symptoms, screeningFocus, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Clinical Overview
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {overview}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Key Symptoms
            </h3>
            <ul className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
              {symptoms.map((symptom, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] mt-1.5 shrink-0" />
                  <span className="leading-snug">{symptom}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Screening Considerations & Focus
            </h3>
            <div className="bg-sky-50 border border-sky-100 p-4 rounded-xl">
              <p className="text-sm text-sky-900 leading-relaxed font-medium">
                {screeningFocus}
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Clinical Note
            </h3>
            <p className="text-[13px] text-slate-600 leading-relaxed italic">
              AI-assisted screening identifies patterns requiring clinical review. 
              The TRINAY AI output alone does not establish a definitive medical diagnosis. 
              Always correlate with a comprehensive clinical examination.
            </p>
          </section>
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between items-center">
          <a
            href="https://www.mayoclinic.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            Clinical reference: Mayo Clinic <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
