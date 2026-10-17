import React, { useState } from 'react';
import {
  Search,
  UserPlus,
  CheckCircle2,
  Eye,
  Layers,
  Scan,
  ArrowRight,
  User,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AddPatientModal } from './AddPatientModal';
import { Patient } from '../types';

type DiseaseChoice = 'cataract' | 'dr' | 'glaucoma';

const DISEASE_CARDS: Array<{
  id: DiseaseChoice;
  name: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  cardActive: string;
  iconBox: string;
}> = [
  {
    id: 'cataract',
    name: 'Cataract Screening',
    tagline: 'Anterior segment examination with lens opacity grading.',
    icon: Eye,
    cardActive: 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500',
    iconBox: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  {
    id: 'dr',
    name: 'Diabetic Retinopathy',
    tagline: 'Retinal fundus lesion detection and stage classification.',
    icon: Layers,
    cardActive: 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500',
    iconBox: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  {
    id: 'glaucoma',
    name: 'Glaucoma Screening',
    tagline: 'Optic CDR measurement and glaucoma risk evaluation.',
    icon: Scan,
    cardActive: 'border-teal-500 bg-teal-50/60 ring-1 ring-teal-500',
    iconBox: 'bg-teal-100 text-teal-700 border-teal-200',
  },
];

/**
 * Generic New Screening entry flow.
 *
 * P0: This page NEVER defaults to any disease. selectedDisease starts as
 * null and Start is disabled until the doctor explicitly picks patient +
 * disease. Routing depends only on the actual selection.
 */
export const NewScreeningEntry: React.FC = () => {
  const {
    patients,
    activePatientId,
    setActivePatientId,
    screeningWizard,
    setWizardPatient,
    setWizardDisease,
    setWizardEye,
    setWizardImageSource,
    setWizardCapturedImage,
    setWizardImageFile,
    setWizardQualityPassed,
    setWizardActiveResult,
    setActivePage,
    resetWizard,
    refreshDatabaseState,
  } = useApp();

  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(() => {
    if (screeningWizard.selectedPatient) return screeningWizard.selectedPatient;
    if (activePatientId) {
      const found = patients.find((p) => p.id === activePatientId || p.dbId === activePatientId);
      if (found) return found;
    }
    return null;
  });
  const [selectedDisease, setSelectedDisease] = useState<DiseaseChoice | null>(
    screeningWizard.selectedDisease
  );
  const [isAddOpen, setIsAddOpen] = useState(false);

  React.useEffect(() => {
    if (screeningWizard.selectedPatient) {
      setSelectedPatient(screeningWizard.selectedPatient);
    } else if (activePatientId) {
      const found = patients.find((p) => p.id === activePatientId || p.dbId === activePatientId);
      if (found) {
        setSelectedPatient(found);
      }
    }
  }, [screeningWizard.selectedPatient, activePatientId, patients]);

  const filteredPatients = patients.filter(
    (p) =>
      p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.id.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const handlePatientSaved = (p: Patient) => {
    setSelectedPatient(p);
    setWizardPatient(p);
    setActivePatientId(p.id);
    try {
      localStorage.setItem('retina_x_active_patient_id', p.id);
    } catch {
      // ignore
    }
    setIsAddOpen(false);
    refreshDatabaseState().catch(() => {});
  };

  const canStart = selectedPatient !== null && selectedDisease !== null;

  const handleStart = () => {
    if (!canStart || !selectedPatient || !selectedDisease) return;
    setActivePatientId(selectedPatient.id);
    try {
      localStorage.setItem('retina_x_active_patient_id', selectedPatient.id);
    } catch {
      // ignore
    }
    setWizardPatient(selectedPatient);
    setWizardDisease(selectedDisease);
    setWizardEye('Right Eye');
    setWizardImageSource(null);
    setWizardCapturedImage(null);
    setWizardImageFile(null);
    setWizardQualityPassed(false);
    setWizardActiveResult(null);
    if (selectedDisease === 'cataract') {
      setActivePage('cataract-screening');
    } else if (selectedDisease === 'glaucoma') {
      setActivePage('glaucoma-screening');
    } else {
      setActivePage('dr-screening');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border border-sky-100 rounded-2xl p-6 shadow-sm">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-800">
          New Screening
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Select a patient, choose a screening type, then start. No disease is pre-selected.
        </p>
        {/* Steps */}
        <div className="flex items-center gap-2 mt-4 text-xs font-semibold">
          <span className="px-3 py-1 rounded-full bg-[#0284C7] text-white">1. Patient</span>
          <span className="text-slate-400">→</span>
          <span className={`px-3 py-1 rounded-full ${selectedPatient ? 'bg-[#0284C7] text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
            2. Disease
          </span>
          <span className="text-slate-400">→</span>
          <span className={`px-3 py-1 rounded-full ${canStart ? 'bg-[#0284C7] text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
            3. Start
          </span>
        </div>
      </div>

      {/* STEP 1: Patient */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            1. Select Patient
          </h2>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0284C7] hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add New Patient</span>
          </button>
        </div>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Search patient by name or ID..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15"
          />
        </div>

        {selectedPatient ? (
          <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Selected Patient
              </p>
              <p className="font-bold text-slate-800 text-sm mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {selectedPatient.fullName}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                ID: <span className="font-mono text-emerald-700">{selectedPatient.id}</span>
                {' '}• {selectedPatient.age} yrs • {selectedPatient.gender}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPatient(null);
                setWizardPatient(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {filteredPatients.length > 0 ? (
              filteredPatients.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPatient(p);
                    setWizardPatient(p);
                    setActivePatientId(p.id);
                    try {
                      localStorage.setItem('retina_x_active_patient_id', p.id);
                    } catch {
                      // ignore
                    }
                  }}
                  className="p-2.5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-sky-300 rounded-lg cursor-pointer transition-all flex justify-between items-center text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 text-sky-700 font-bold border border-sky-100">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{p.fullName}</p>
                      <p className="text-slate-500 font-mono">{p.id}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 bg-slate-50 rounded-lg text-center text-xs text-slate-500">
                No patients match. Use + Add New Patient to register.
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 2: Disease */}
      <div className={`bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm ${!selectedPatient ? 'opacity-60' : ''}`}>
        <h2 className="text-base font-semibold text-slate-800">
          2. Select Screening Type
        </h2>
        {!selectedPatient ? (
          <p className="text-xs text-slate-500">Select a patient first to unlock disease selection.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DISEASE_CARDS.map((d) => {
              const Icon = d.icon;
              const active = selectedDisease === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDisease(d.id)}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    active ? d.cardActive : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl border ${d.iconBox}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="font-bold text-slate-900 text-sm mt-2.5">{d.name}</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{d.tagline}</p>
                  {active && (
                    <p className="text-[11px] font-bold text-emerald-700 mt-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* STEP 3: Start */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {canStart
            ? `Ready: ${selectedPatient?.fullName} (${selectedPatient?.id}) → ${DISEASE_CARDS.find((d) => d.id === selectedDisease)?.name}`
            : 'Start is enabled after patient + disease are both selected.'}
        </p>
        <button
          type="button"
          disabled={!canStart}
          onClick={handleStart}
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            canStart
              ? 'bg-[#0284C7] hover:bg-sky-700 text-white shadow-md cursor-pointer'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          <span>Start Screening</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <AddPatientModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onPatientSaved={handlePatientSaved}
      />
    </div>
  );
};
