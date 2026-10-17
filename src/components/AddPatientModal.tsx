import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, UserPlus, ArrowRight, Calendar, Heart, Eye, Activity } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Patient } from '../types';

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientSaved?: (patient: Patient) => void;
}

type Discipline = 'cataract' | 'dr' | 'glaucoma';

export const AddPatientModal: React.FC<AddPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientSaved,
}) => {
  const {
    addPatient,
    patients,
    setActivePage,
    setWizardPatient,
    setWizardDisease,
    t,
  } = useApp();

  // Compute next incremental numeric patient ID (starts at 1 by default, then 2, 3...)
  const nextIncrementalId = useMemo(() => {
    if (!patients || patients.length === 0) {
      return '1';
    }

    let maxId = 0;
    let foundNumeric = false;

    for (const p of patients) {
      const trimmed = (p.id || '').trim();
      if (/^\d+$/.test(trimmed)) {
        const val = parseInt(trimmed, 10);
        if (!isNaN(val)) {
          foundNumeric = true;
          if (val > maxId) {
            maxId = val;
          }
        }
      }
    }

    if (foundNumeric) {
      return String(maxId + 1);
    }

    return '1';
  }, [patients]);

  // Discipline selection (Only Cataract, Diabetic Retinopathy, and Glaucoma)
  const [discipline, setDiscipline] = useState<Discipline>('cataract');

  // Demographic form state
  const [patientIdInput, setPatientIdInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('Female');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Discipline-specific clinical baseline state
  // Cataract
  const [bcva, setBcva] = useState('');
  const [cataractSymptoms, setCataractSymptoms] = useState('');

  // Diabetic Retinopathy
  const [diabetesDuration, setDiabetesDuration] = useState('');
  const [drSymptoms, setDrSymptoms] = useState('');

  // Glaucoma
  const [iopHistory, setIopHistory] = useState('');
  const [glaucomaHistory, setGlaucomaHistory] = useState('');

  // Error feedback state
  const [nameError, setNameError] = useState(false);

  // Track previous open state to only reset when opening
  const prevIsOpenRef = useRef(false);

  // Reset inputs when modal opens
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setPatientIdInput(nextIncrementalId);
      setDiscipline('cataract');
      setFullName('');
      setPhoneNumber('');
      setAge('');
      setGender('Female');
      setDateOfBirth('');
      setBcva('');
      setCataractSymptoms('');
      setDiabetesDuration('');
      setDrSymptoms('');
      setIopHistory('');
      setGlaucomaHistory('');
      setNameError(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, nextIncrementalId]);

  if (!isOpen) return null;

  const handleDobChange = (val: string) => {
    setDateOfBirth(val);
    if (val) {
      const birthDate = new Date(val);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      if (calculatedAge >= 0 && calculatedAge < 130) {
        setAge(String(calculatedAge));
      }
    }
  };

  const handleAgeChange = (val: string) => {
    setAge(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0 && num < 130 && !dateOfBirth) {
      const year = new Date().getFullYear() - num;
      setDateOfBirth(`${year}-01-01`);
    }
  };

  const handleRegisterPatient = (
    targetDiscipline: Discipline = discipline,
    proceedToScreening: boolean = true
  ) => {
    if (!fullName.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);

    const chosenId = patientIdInput.trim() || nextIncrementalId;

    // Build baseline clinical history notes based on chosen discipline
    const baselineNotes =
      targetDiscipline === 'cataract'
        ? [bcva && `BCVA: ${bcva}`, cataractSymptoms && `Symptoms: ${cataractSymptoms}`].filter(Boolean).join(' | ')
        : targetDiscipline === 'dr'
        ? [diabetesDuration && `Diabetes: ${diabetesDuration}`, drSymptoms && `Symptoms: ${drSymptoms}`].filter(Boolean).join(' | ')
        : [iopHistory && `IOP/CDR: ${iopHistory}`, glaucomaHistory && `History: ${glaucomaHistory}`].filter(Boolean).join(' | ');

    const newPatient = addPatient({
      id: chosenId,
      fullName: fullName.trim(),
      age: Number(age) || 45,
      gender: (gender as 'Male' | 'Female' | 'Other') || 'Female',
      phoneNumber: phoneNumber.trim(),
      dob: dateOfBirth || undefined,
      primaryDiscipline: targetDiscipline,
      diabetesDurationYears: targetDiscipline === 'dr' ? (parseInt(diabetesDuration, 10) || 0) : 0,
      knownDR: targetDiscipline === 'dr' ? 'Yes' : 'No',
      otherDiseases: baselineNotes || undefined,
      medicalDetails: baselineNotes || undefined,
    });

    if (onPatientSaved) {
      onPatientSaved(newPatient);
    }

    if (proceedToScreening) {
      // Preselect the newly registered patient into the shared screening wizard
      setWizardPatient(newPatient);
      setWizardDisease(targetDiscipline);

      // Navigate straight to the corresponding screening section
      if (targetDiscipline === 'cataract') {
        setActivePage('cataract-screening');
      } else if (targetDiscipline === 'glaucoma') {
        setActivePage('glaucoma-screening');
      } else {
        setActivePage('dr-screening');
      }
    }

    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRegisterPatient(discipline, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header matching reference */}
        <div className="flex items-center justify-between px-6 py-5 sm:px-8 sm:py-6 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#0284C7] flex items-center justify-center text-white shadow-sm shrink-0">
              <UserPlus className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
                Register New Patient
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                ID: <span className="text-[#0284C7] font-bold">PT-{patientIdInput || nextIncrementalId}</span> • TRINAY Clinical Registry
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-add-patient-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="register-patient-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
            {/* PRIMARY SCREENING DISCIPLINE */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                PRIMARY SCREENING DISCIPLINE
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Cataract */}
                <button
                  type="button"
                  id="discipline-cataract-btn"
                  onClick={() => setDiscipline('cataract')}
                  className={`py-3 px-4 rounded-xl text-sm font-bold transition-all text-center border cursor-pointer ${
                    discipline === 'cataract'
                      ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-sm'
                      : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Cataract
                </button>

                {/* Diabetic Retinopathy */}
                <button
                  type="button"
                  id="discipline-dr-btn"
                  onClick={() => setDiscipline('dr')}
                  className={`py-3 px-4 rounded-xl text-sm font-bold transition-all text-center border cursor-pointer ${
                    discipline === 'dr'
                      ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-sm'
                      : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Diabetic Retinopathy
                </button>

                {/* Glaucoma */}
                <button
                  type="button"
                  id="discipline-glaucoma-btn"
                  onClick={() => setDiscipline('glaucoma')}
                  className={`py-3 px-4 rounded-xl text-sm font-bold transition-all text-center border cursor-pointer ${
                    discipline === 'glaucoma'
                      ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-sm'
                      : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Glaucoma
                </button>
              </div>
            </div>

            {/* Demographic Inputs */}
            {/* Full Name & Phone Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="patient-fullname-input"
                  required
                  value={fullName}
                  onChange={(e) => {
                    console.log('FULLNAME CHANGE:', e.target.value);
                    setFullName(e.target.value);
                    if (e.target.value.trim()) setNameError(false);
                  }}
                  placeholder="e.g. Ramesh Chandra Sharma"
                  className={`w-full px-4 py-2.5 text-sm sm:text-base bg-slate-50/80 border rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 transition-all font-medium ${
                    nameError
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                      : 'border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20'
                  }`}
                />
                {nameError && (
                  <p className="text-xs text-rose-500 font-medium mt-1">Please enter patient full name.</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
                  Phone Number (SMS & WhatsApp Reports)
                </label>
                <input
                  type="tel"
                  id="patient-phone-input"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98..."
                  className="w-full px-4 py-2.5 text-sm sm:text-base bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                />
              </div>
            </div>

            {/* Age & Gender */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
                  Age
                </label>
                <input
                  type="number"
                  id="patient-age-input"
                  min="1"
                  max="125"
                  value={age}
                  onChange={(e) => handleAgeChange(e.target.value)}
                  placeholder="52"
                  className="w-full px-4 py-2.5 text-sm sm:text-base bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
                  Gender
                </label>
                <select
                  id="patient-gender-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full px-4 py-2.5 text-sm sm:text-base bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium cursor-pointer"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
                Date of Birth
              </label>
              <div className="relative">
                <input
                  type="date"
                  id="patient-dob-input"
                  value={dateOfBirth}
                  onChange={(e) => handleDobChange(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm sm:text-base bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                />
              </div>
            </div>

            {/* Dynamic Condition-Specific Clinical Baseline Section */}
            {discipline === 'cataract' && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5 space-y-3.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-[#0284C7] font-bold text-sm sm:text-base">
                  <span>💙</span>
                  <span>Cataract Specific Clinical Baseline</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Best Corrected Visual Acuity (BCVA)
                    </label>
                    <input
                      type="text"
                      id="cataract-bcva-input"
                      value={bcva}
                      onChange={(e) => setBcva(e.target.value)}
                      placeholder="e.g. OD: 6/18, OS: 6/9"
                      className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Specific Symptoms / Onset Duration
                    </label>
                    <input
                      type="text"
                      id="cataract-symptoms-input"
                      value={cataractSymptoms}
                      onChange={(e) => setCataractSymptoms(e.target.value)}
                      placeholder="e.g. Blurry central vision for 3 months, photophobia in sunlight"
                      className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            )}

            {discipline === 'dr' && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5 space-y-3.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-[#0284C7] font-bold text-sm sm:text-base">
                  <span>🩺</span>
                  <span>Diabetic Retinopathy Specific Clinical Baseline</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Diabetes Duration (Years) & Glycemic Control
                    </label>
                    <input
                      type="text"
                      id="dr-duration-input"
                      value={diabetesDuration}
                      onChange={(e) => setDiabetesDuration(e.target.value)}
                      placeholder="e.g. 8 years, Type 2 Diabetes, HbA1c: 7.8%"
                      className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Visual Symptoms & Known Retinal History
                    </label>
                    <input
                      type="text"
                      id="dr-symptoms-input"
                      value={drSymptoms}
                      onChange={(e) => setDrSymptoms(e.target.value)}
                      placeholder="e.g. Occasional floaters, blurred vision, history of NPDR"
                      className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            )}

            {discipline === 'glaucoma' && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5 space-y-3.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-[#0284C7] font-bold text-sm sm:text-base">
                  <span>👁️</span>
                  <span>Glaucoma Specific Clinical Baseline</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Intraocular Pressure (IOP) / Cup-to-Disc History
                    </label>
                    <input
                      type="text"
                      id="glaucoma-iop-input"
                      value={iopHistory}
                      onChange={(e) => setIopHistory(e.target.value)}
                      placeholder="e.g. IOP OD: 21 mmHg, OS: 19 mmHg, CDR: 0.6"
                      className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Visual Field Deficits & Family History
                    </label>
                    <input
                      type="text"
                      id="glaucoma-history-input"
                      value={glaucomaHistory}
                      onChange={(e) => setGlaucomaHistory(e.target.value)}
                      placeholder="e.g. Peripheral vision loss, positive family history of glaucoma"
                      className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer Form Actions */}
          <div className="px-6 py-4 sm:px-8 sm:py-5 border-t border-slate-100 bg-slate-50/90 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              id="cancel-add-patient-btn"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer text-center"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              id="register-only-patient-btn"
              onClick={() => handleRegisterPatient(discipline, false)}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center"
            >
              Register Only
            </button>
            <button
              type="submit"
              id="register-and-start-screening-btn"
              className="px-6 py-2.5 text-sm sm:text-base font-bold text-white bg-[#0284C7] hover:bg-sky-700 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>
                {discipline === 'cataract'
                  ? 'Register & Start Cataract'
                  : discipline === 'dr'
                  ? 'Register & Start DR'
                  : 'Register & Start Glaucoma'}
              </span>
              <ArrowRight className="w-4.5 h-4.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
