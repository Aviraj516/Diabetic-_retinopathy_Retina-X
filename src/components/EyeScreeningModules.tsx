import React from 'react';
import { ArrowRight, Sparkles, Activity, Eye, Scan } from 'lucide-react';
import { useApp } from '../context/AppContext';

// Clinical images from assets
import cataractImg from '../assets/conditions/cataract.jpg';
import drImg from '../assets/conditions/diabetic_retinopathy.jpg';
import glaucomaImg from '../assets/conditions/glaucoma.jpg';

interface DiseaseModule {
  id: string;
  name: string;
  tag: string;
  image: string;
  description: string;
  status: string;
  isPending: boolean;
  count: number;
  route: () => void;
  accentColor: string;
}

export const EyeScreeningModules: React.FC = () => {
  const {
    setActivePage,
    resetWizard,
    screenings,
    cataractScreenings,
    glaucomaScreenings,
  } = useApp();

  const handleLaunchDR = () => {
    resetWizard();
    setActivePage('dr-screening');
  };

  const handleLaunchCataract = () => {
    setActivePage('cataract-screening');
  };

  const handleLaunchGlaucoma = () => {
    setActivePage('glaucoma-screening');
  };

  const localCataractCount = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('retina_x_v3_cataract');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  }, []);

  const localGlaucomaCount = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('retina_x_v3_glaucoma');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  }, []);

  const drCount = screenings.filter((s) => !s.condition || s.condition === 'dr' || s.drSeverity).length;
  const cataractCount = Math.max(cataractScreenings.length, localCataractCount);
  const glaucomaCount = Math.max(glaucomaScreenings.length, localGlaucomaCount);

  const pendingDRCount = screenings.filter((s) => s.status === 'Review' || s.status === 'Referred').length;
  const pendingGlaucomaCount = glaucomaScreenings.filter(
    (s) => s.glaucomaPrediction === 'GLAUCOMA_SUSPECT' || s.overallStatus === 'Referred'
  ).length;

  const modules: DiseaseModule[] = [
    {
      id: 'dr',
      name: 'Diabetic Retinopathy',
      tag: 'Fundus AI Triage',
      image: drImg,
      description: 'Automated fundus screening for microaneurysms, hemorrhages, hard exudates, and NV progression.',
      status: pendingDRCount > 0 ? `${pendingDRCount} Awaiting Review` : 'Pipeline Operational',
      isPending: pendingDRCount > 0,
      count: drCount,
      route: handleLaunchDR,
      accentColor: 'text-[#0284C7]',
    },
    {
      id: 'glaucoma',
      name: 'Glaucoma Assessment',
      tag: 'Optic Nerve & CDR',
      image: glaucomaImg,
      description: 'Optic nerve head cup-to-disc ratio (CDR) segmentation, ISNT rule verification, and neuroretinal rim loss.',
      status: pendingGlaucomaCount > 0 ? `${pendingGlaucomaCount} Awaiting Review` : 'Pipeline Operational',
      isPending: pendingGlaucomaCount > 0,
      count: glaucomaCount,
      route: handleLaunchGlaucoma,
      accentColor: 'text-teal-600',
    },
    {
      id: 'cataract',
      name: 'Cataract Screening',
      tag: 'Anterior Segment LOCS III',
      image: cataractImg,
      description: 'Anterior segment lens opalescence analysis, LOCS III grading, and nuclear sclerosis evaluation.',
      status: 'Pipeline Operational',
      isPending: false,
      count: cataractCount,
      route: handleLaunchCataract,
      accentColor: 'text-amber-600',
    },
  ];

  return (
    <section className="space-y-3.5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#0F172A] tracking-tight leading-tight flex items-center gap-2">
            <span>Eye Screening Modules</span>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-sky-50 text-[#0284C7] border border-sky-100">
              3 Active Pipelines
            </span>
          </h2>
          <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
            Select a disease module to launch automated AI inference, inspect anatomical overlays, and review evidence.
          </p>
        </div>
      </div>

      {/* Responsive Grid of Disease Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <div
            key={mod.id}
            onClick={mod.route}
            className="bg-white rounded-2xl border border-slate-200/85 p-4.5 sm:p-5 flex flex-col justify-between hover:border-sky-300 hover:shadow-[0_10px_25px_-5px_rgba(15,23,42,0.06),0_8px_10px_-6px_rgba(15,23,42,0.03)] hover:-translate-y-1 transition-all duration-200 group cursor-pointer shadow-[0_1px_3px_0_rgba(15,23,42,0.03)]"
          >
            <div>
              {/* Top Row: Thumbnail + Status Badge */}
              <div className="flex items-start justify-between gap-3 mb-3.5">
                <div className="relative">
                  <img
                    src={mod.image}
                    alt={mod.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200/80 shadow-2xs group-hover:scale-105 transition-transform duration-200"
                  />
                  <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-200" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      mod.isPending
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        mod.isPending ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                    />
                    <span>{mod.status}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {mod.count} records processed
                  </span>
                </div>
              </div>

              {/* Title & Tag */}
              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {mod.tag}
                </div>
                <h3 className="text-base font-extrabold text-[#0F172A] group-hover:text-[#0284C7] transition-colors leading-snug">
                  {mod.name}
                </h3>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-[13px] text-slate-500 leading-relaxed mt-2 line-clamp-2">
                {mod.description}
              </p>
            </div>

            {/* Action Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs sm:text-[13px] font-bold text-[#0284C7] group-hover:text-sky-700">
              <span className="group-hover:underline">Launch Screening</span>
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-50 group-hover:bg-[#0284C7] text-[#0284C7] group-hover:text-white transition-colors">
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

