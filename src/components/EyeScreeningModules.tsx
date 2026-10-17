import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

// Clinical images from assets
import cataractImg from '../assets/conditions/cataract.jpg';
import drImg from '../assets/conditions/diabetic_retinopathy.jpg';
import glaucomaImg from '../assets/conditions/glaucoma.jpg';

interface DiseaseModule {
  id: string;
  name: string;
  image: string;
  description: string;
  status: string;
  statusBadgeColor: string;
  route: () => void;
}

export const EyeScreeningModules: React.FC = () => {
  const { setActivePage, resetWizard, screenings, cataractScreenings, glaucomaScreenings } = useApp();

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

  const pendingDRCount = screenings.filter((s) => s.status === 'Review' || s.status === 'Referred').length;
  const pendingGlaucomaCount = glaucomaScreenings.filter(
    (s) => s.glaucomaPrediction === 'GLAUCOMA_SUSPECT' || s.overallStatus === 'Referred'
  ).length;

  const modules: DiseaseModule[] = [
    {
      id: 'cataract',
      name: 'Cataract Screening',
      image: cataractImg,
      description: 'Anterior segment lens opalescence analysis, LOCS III grading, and nuclear sclerosis...',
      status: 'Operational',
      statusBadgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      route: handleLaunchCataract,
    },
    {
      id: 'dr',
      name: 'Diabetic Retinopathy Screening',
      image: drImg,
      description: 'Automated fundus screening for microaneurysms, hemorrhages, hard exudates, and NV...',
      status: pendingDRCount > 0 ? `${pendingDRCount} Pending` : 'Operational',
      statusBadgeColor: pendingDRCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
      route: handleLaunchDR,
    },
    {
      id: 'glaucoma',
      name: 'Glaucoma Assessment',
      image: glaucomaImg,
      description: 'Optic nerve head cup-to-disc ratio (CDR) segmentation, ISNT rule verification, and rim...',
      status: pendingGlaucomaCount > 0 ? `${pendingGlaucomaCount} Pending` : 'Operational',
      statusBadgeColor: pendingGlaucomaCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
      route: handleLaunchGlaucoma,
    },
  ];

  return (
    <section className="space-y-4.5">
      {/* Section Header */}
      <div>
        <h2 className="text-2xl sm:text-[28px] font-extrabold text-[#0F172A] tracking-tight leading-tight">
          Eye Screening Modules
        </h2>
        <p className="text-base font-medium text-slate-500 mt-1.5">
          Select a disease module to access specialized dashboards, registries, and automated AI analysis.
        </p>
      </div>

      {/* Responsive Grid of Disease Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((mod) => (
          <div
            key={mod.id}
            onClick={mod.route}
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5.5 flex flex-col justify-between hover:border-sky-300 hover:shadow-md transition-all group cursor-pointer"
          >
            <div>
              {/* Top Row: Thumbnail + Status Badge */}
              <div className="flex items-center justify-between mb-4">
                <img
                  src={mod.image}
                  alt={mod.name}
                  className="w-15 h-15 rounded-xl object-cover shrink-0 border border-slate-100 shadow-2xs group-hover:scale-105 transition-transform"
                />
                <span className={`inline-flex px-4 py-1.5 rounded-full text-sm font-bold border ${mod.statusBadgeColor}`}>
                  {mod.status}
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="text-xl sm:text-2xl font-bold text-[#0F172A] group-hover:text-[#0284C7] transition-colors leading-snug">
                {mod.name}
              </h3>
              <p className="text-base text-slate-500 leading-relaxed mt-2 line-clamp-2">
                {mod.description}
              </p>
            </div>

            {/* Action Link */}
            <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-base font-bold text-[#0284C7] group-hover:text-sky-700">
              <span>Open Module</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
