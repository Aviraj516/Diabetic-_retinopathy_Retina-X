import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, UserPlus, ArrowRight, Eye, Activity, AlertTriangle, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Patient } from '../types';

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientSaved?: (patient: Patient) => void;
}

type Discipline = 'cataract' | 'dr' | 'glaucoma';

// Normalization helper functions
const normalizeName = (name: string): string => {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // If starts with 91 followed by 10 digits, strip country code for consistent local comparison
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  // If starts with 0 followed by 10 digits, strip leading trunk zero
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
};

const normalizeDob = (dob?: string): string => {
  if (!dob) return '';
  return dob.trim();
};

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
    openPatientProfile,
    t,
  } = useApp();

  // Compute next incremental numeric patient ID
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

  // Discipline selection
  const [discipline, setDiscipline] = useState<Discipline>('cataract');

  // Demographic form state
  const [patientIdInput, setPatientIdInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
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

  // Interaction tracking state for professional validation
  const [touched, setTouched] = useState<{
    fullName?: boolean;
    phoneNumber?: boolean;
    age?: boolean;
    dateOfBirth?: boolean;
  }>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Track previous open state to only reset when modal is opened fresh
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
      setTouched({});
      setAttemptedSubmit(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, nextIncrementalId]);

  // -------------------------------------------------------------
  // Validation Rules Engine
  // -------------------------------------------------------------
  const validationErrors = useMemo(() => {
    const errors: {
      fullName?: string;
      phoneNumber?: string;
      age?: string;
      dateOfBirth?: string;
    } = {};

    // 1. Full Name: Required, trim whitespace, reject empty, reject names with only numbers/symbols
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      errors.fullName = 'Full name is required.';
    } else if (trimmedName.length < 2) {
      errors.fullName = 'Full name must be at least 2 characters.';
    } else {
      // Must contain at least one alphabetical letter across Latin or Unicode scripts
      const containsLetter = /[a-zA-Z\u00C0-\u024F\u0900-\u097F]/.test(trimmedName);
      if (!containsLetter) {
        errors.fullName = 'Full name must contain alphabetical characters.';
      }
    }

    // 2. Phone Number: Optional, but if entered, validate accepted format (10-15 digits)
    const trimmedPhone = phoneNumber.trim();
    if (trimmedPhone) {
      const validPhoneChars = /^[+\d\s().-]+$/.test(trimmedPhone);
      const digitsOnly = trimmedPhone.replace(/\D/g, '');
      if (!validPhoneChars) {
        errors.phoneNumber = 'Phone number contains invalid characters.';
      } else if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        errors.phoneNumber = 'Please enter a valid 10 to 15 digit phone number.';
      }
    }

    // 3. Date of Birth: Real date, not in the future, not > 130 years ago
    const trimmedDob = dateOfBirth.trim();
    let calculatedAgeFromDob: number | null = null;

    if (trimmedDob) {
      const birthDate = new Date(trimmedDob);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (isNaN(birthDate.getTime())) {
        errors.dateOfBirth = 'Please enter a valid calendar date.';
      } else if (birthDate > today) {
        errors.dateOfBirth = 'Date of birth cannot be in the future.';
      } else if (birthDate.getFullYear() < today.getFullYear() - 130) {
        errors.dateOfBirth = 'Date of birth cannot be more than 130 years in the past.';
      } else {
        const now = new Date();
        let calculated = now.getFullYear() - birthDate.getFullYear();
        const m = now.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
          calculated--;
        }
        calculatedAgeFromDob = calculated;
      }
    }

    // 4. Age: Accept only non-negative whole number (0 - 125), consistency with DOB
    const trimmedAge = age.trim();
    if (trimmedAge === '' && !trimmedDob) {
      errors.age = 'Please enter patient age or date of birth.';
    } else if (trimmedAge !== '') {
      if (!/^\d+$/.test(trimmedAge)) {
        errors.age = 'Age must be a valid whole number.';
      } else {
        const ageNum = parseInt(trimmedAge, 10);
        if (ageNum < 0 || ageNum > 125) {
          errors.age = 'Age must be a valid number between 0 and 125.';
        } else if (calculatedAgeFromDob !== null && Math.abs(ageNum - calculatedAgeFromDob) > 1) {
          errors.age = `Age (${ageNum}) conflicts with date of birth (indicates ${calculatedAgeFromDob} yrs).`;
          if (!errors.dateOfBirth) {
            errors.dateOfBirth = `Date of birth indicates ${calculatedAgeFromDob} yrs, conflicting with entered age ${ageNum}.`;
          }
        }
      }
    }

    return errors;
  }, [fullName, phoneNumber, age, dateOfBirth]);

  // -------------------------------------------------------------
  // Duplicate Patient Detection Engine
  // Flagged as duplicate ONLY when BOTH normalized full name AND
  // normalized phone number match an existing patient record.
  // -------------------------------------------------------------
  const duplicateMatch = useMemo(() => {
    if (!patients || patients.length === 0) return null;

    const normEnteredName = normalizeName(fullName);
    const normEnteredPhone = normalizePhone(phoneNumber);

    // If either field is empty or phone is incomplete (< 10 digits), do not declare duplicate
    if (!normEnteredName || !normEnteredPhone || normEnteredPhone.length < 10) {
      return null;
    }

    for (const p of patients) {
      const normExistingName = normalizeName(p.fullName);
      const normExistingPhone = normalizePhone(p.phoneNumber);

      // Condition: normalizedExistingName === normalizedEnteredName && normalizedExistingPhone === normalizedEnteredPhone
      if (
        normExistingName &&
        normExistingPhone &&
        normExistingName === normEnteredName &&
        normExistingPhone === normEnteredPhone
      ) {
        return {
          patient: p,
          matchedFields: { name: true, phone: true },
        };
      }
    }

    return null;
  }, [patients, fullName, phoneNumber]);

  if (!isOpen) return null;

  // Handle Date of Birth change with age sync
  const handleDobChange = (val: string) => {
    setDateOfBirth(val);
    setTouched((prev) => ({ ...prev, dateOfBirth: true }));
    if (val) {
      const birthDate = new Date(val);
      const today = new Date();
      if (!isNaN(birthDate.getTime()) && birthDate <= today) {
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        if (calculatedAge >= 0 && calculatedAge <= 125) {
          // Auto-fill age if empty or untouched so user doesn't have to calculate manually
          if (!age.trim() || !touched.age) {
            setAge(String(calculatedAge));
          }
        }
      }
    }
  };

  // Handle Age change
  const handleAgeChange = (val: string) => {
    setAge(val);
    setTouched((prev) => ({ ...prev, age: true }));
  };

  // Action to navigate directly to the existing duplicate patient chart
  const handleViewExistingPatient = (existingId: string) => {
    openPatientProfile(existingId);
    onClose();
  };

  // Submission handler
  const handleRegisterPatient = (
    targetDiscipline: Discipline = discipline,
    proceedToScreening: boolean = true
  ) => {
    setAttemptedSubmit(true);

    // Block submission if duplicate patient is detected
    if (duplicateMatch) {
      return;
    }

    // Block submission if required fields are invalid
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const chosenId = patientIdInput.trim() || nextIncrementalId;

    // Build baseline clinical history notes based on chosen discipline
    const baselineNotes =
      targetDiscipline === 'cataract'
        ? [bcva.trim() && `BCVA: ${bcva.trim()}`, cataractSymptoms.trim() && `Symptoms: ${cataractSymptoms.trim()}`].filter(Boolean).join(' | ')
        : targetDiscipline === 'dr'
        ? [diabetesDuration.trim() && `Diabetes: ${diabetesDuration.trim()}`, drSymptoms.trim() && `Symptoms: ${drSymptoms.trim()}`].filter(Boolean).join(' | ')
        : [iopHistory.trim() && `IOP/CDR: ${iopHistory.trim()}`, glaucomaHistory.trim() && `History: ${glaucomaHistory.trim()}`].filter(Boolean).join(' | ');

    const newPatient = addPatient({
      id: chosenId,
      fullName: fullName.trim(),
      age: parseInt(age.trim(), 10) || 45,
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
      setWizardPatient(newPatient);
      setWizardDisease(targetDiscipline);

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

  const hasErrors = Object.keys(validationErrors).length > 0;
  const isBlocked = !!duplicateMatch || (attemptedSubmit && hasErrors);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#0284C7] flex items-center justify-center text-white shadow-2xs shrink-0">
              <UserPlus className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[#0F172A] tracking-tight">
                Register New Patient
              </h2>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                ID: <span className="text-[#0284C7] font-bold">PT-{patientIdInput || nextIncrementalId}</span> • TRINAY Clinical Registry
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-add-patient-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="register-patient-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
            {/* DUPLICATE PATIENT WARNING BANNER */}
            {duplicateMatch && (
              <div
                id="duplicate-patient-warning"
                className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 sm:p-3.5 text-amber-950 shadow-xs animate-in fade-in slide-in-from-top-1 duration-150"
                role="alert"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-1 rounded-lg bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-amber-950 flex items-center gap-1.5 flex-wrap">
                      <span>Duplicate Patient Detected</span>
                      <span className="text-[10px] font-mono font-bold bg-amber-200/90 text-amber-950 px-1.5 py-0.5 rounded">
                        PT-{duplicateMatch.patient.id}
                      </span>
                    </h3>
                    <p className="text-xs font-semibold text-amber-900 mt-1 leading-snug">
                      This patient already exists in the system. Please check the existing patient record instead of registering again.
                    </p>

                    {/* Matched Patient Information Card */}
                    <div className="mt-2.5 p-2.5 bg-white/95 border border-amber-200/90 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-slate-900 text-xs truncate">
                          {duplicateMatch.patient.fullName}
                        </div>
                        <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                          <span>Age {duplicateMatch.patient.age}</span>
                          <span>•</span>
                          <span>{duplicateMatch.patient.gender}</span>
                          {duplicateMatch.patient.phoneNumber && (
                            <>
                              <span>•</span>
                              <span>{duplicateMatch.patient.phoneNumber}</span>
                            </>
                          )}
                          {duplicateMatch.patient.dob && (
                            <>
                              <span>•</span>
                              <span>DOB: {duplicateMatch.patient.dob}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        id="view-existing-patient-btn"
                        onClick={() => handleViewExistingPatient(duplicateMatch.patient.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white font-bold text-xs rounded-lg transition-colors shadow-2xs shrink-0 cursor-pointer"
                      >
                        <span>View Existing Patient Record</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[10px] text-amber-800/80 mt-1.5 font-medium">
                      Note: Duplicate check validates against loaded registry records. Submission is blocked to prevent duplicate entries.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PRIMARY SCREENING DISCIPLINE */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Primary Screening Discipline
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  id="discipline-cataract-btn"
                  onClick={() => setDiscipline('cataract')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center border cursor-pointer ${
                    discipline === 'cataract'
                      ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-2xs'
                      : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Cataract
                </button>

                <button
                  type="button"
                  id="discipline-dr-btn"
                  onClick={() => setDiscipline('dr')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center border cursor-pointer ${
                    discipline === 'dr'
                      ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-2xs'
                      : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Diabetic Retinopathy
                </button>

                <button
                  type="button"
                  id="discipline-glaucoma-btn"
                  onClick={() => setDiscipline('glaucoma')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center border cursor-pointer ${
                    discipline === 'glaucoma'
                      ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-2xs'
                      : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Glaucoma
                </button>
              </div>
            </div>

            {/* Demographic Inputs */}
            {/* Full Name & Phone Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="patient-fullname-input" className="block text-xs font-bold text-slate-700">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  {duplicateMatch?.matchedFields.name && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded">
                      Matches existing record
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  id="patient-fullname-input"
                  required
                  value={fullName}
                  onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder=""
                  className={`w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50/80 border rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 transition-all font-medium ${
                    (touched.fullName || attemptedSubmit) && validationErrors.fullName
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                      : duplicateMatch?.matchedFields.name
                      ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-200 bg-amber-50/20'
                      : 'border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20'
                  }`}
                />
                {(touched.fullName || attemptedSubmit) && validationErrors.fullName && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{validationErrors.fullName}</span>
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="patient-phone-input" className="block text-xs font-bold text-slate-700">
                    Phone Number
                  </label>
                  {duplicateMatch?.matchedFields.phone && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded">
                      Matches existing record
                    </span>
                  )}
                </div>
                <input
                  type="tel"
                  id="patient-phone-input"
                  value={phoneNumber}
                  onBlur={() => setTouched((prev) => ({ ...prev, phoneNumber: true }))}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder=""
                  className={`w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50/80 border rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 transition-all font-medium ${
                    (touched.phoneNumber || attemptedSubmit) && validationErrors.phoneNumber
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                      : duplicateMatch?.matchedFields.phone
                      ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-200 bg-amber-50/20'
                      : 'border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20'
                  }`}
                />
                {(touched.phoneNumber || attemptedSubmit) && validationErrors.phoneNumber && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{validationErrors.phoneNumber}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Age & Gender */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="patient-age-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Age <span className="text-slate-400 font-normal">(Years)</span>
                </label>
                <input
                  type="number"
                  id="patient-age-input"
                  min="0"
                  max="125"
                  value={age}
                  onBlur={() => setTouched((prev) => ({ ...prev, age: true }))}
                  onChange={(e) => handleAgeChange(e.target.value)}
                  placeholder=""
                  className={`w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50/80 border rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 transition-all font-medium ${
                    (touched.age || attemptedSubmit) && validationErrors.age
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                      : 'border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20'
                  }`}
                />
                {(touched.age || attemptedSubmit) && validationErrors.age && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{validationErrors.age}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="patient-gender-select" className="block text-xs font-bold text-slate-700 mb-1">
                  Gender
                </label>
                <select
                  id="patient-gender-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50/80 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium cursor-pointer"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Date of Birth */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="patient-dob-input" className="block text-xs font-bold text-slate-700">
                  Date of Birth
                </label>
              </div>
              <input
                type="date"
                id="patient-dob-input"
                value={dateOfBirth}
                onBlur={() => setTouched((prev) => ({ ...prev, dateOfBirth: true }))}
                onChange={(e) => handleDobChange(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50/80 border rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 transition-all font-medium ${
                  (touched.dateOfBirth || attemptedSubmit) && validationErrors.dateOfBirth
                    ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                    : 'border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20'
                }`}
              />
              {(touched.dateOfBirth || attemptedSubmit) && validationErrors.dateOfBirth && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{validationErrors.dateOfBirth}</span>
                </p>
              )}
            </div>

            {/* Disease-Specific Clinical Baseline Section */}
            {discipline === 'cataract' && (
              <div className="rounded-xl border border-sky-200/90 bg-sky-50/30 p-3 sm:p-3.5 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 text-[#0284C7] font-bold text-xs sm:text-sm">
                  <Eye className="w-4 h-4 text-[#0284C7]" />
                  <span>Cataract Clinical Baseline</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label htmlFor="cataract-bcva-input" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Best Corrected Visual Acuity (BCVA)
                    </label>
                    <input
                      type="text"
                      id="cataract-bcva-input"
                      value={bcva}
                      onChange={(e) => setBcva(e.target.value)}
                      placeholder=""
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="cataract-symptoms-input" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Specific Symptoms / Onset Duration
                    </label>
                    <input
                      type="text"
                      id="cataract-symptoms-input"
                      value={cataractSymptoms}
                      onChange={(e) => setCataractSymptoms(e.target.value)}
                      placeholder=""
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            )}

            {discipline === 'dr' && (
              <div className="rounded-xl border border-sky-200/90 bg-sky-50/30 p-3 sm:p-3.5 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 text-[#0284C7] font-bold text-xs sm:text-sm">
                  <Activity className="w-4 h-4 text-[#0284C7]" />
                  <span>Diabetic Retinopathy Clinical Baseline</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label htmlFor="dr-duration-input" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Diabetes Duration (Years) & Glycemic Control
                    </label>
                    <input
                      type="text"
                      id="dr-duration-input"
                      value={diabetesDuration}
                      onChange={(e) => setDiabetesDuration(e.target.value)}
                      placeholder=""
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="dr-symptoms-input" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Visual Symptoms & Known Retinal History
                    </label>
                    <input
                      type="text"
                      id="dr-symptoms-input"
                      value={drSymptoms}
                      onChange={(e) => setDrSymptoms(e.target.value)}
                      placeholder=""
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            )}

            {discipline === 'glaucoma' && (
              <div className="rounded-xl border border-sky-200/90 bg-sky-50/30 p-3 sm:p-3.5 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 text-[#0284C7] font-bold text-xs sm:text-sm">
                  <Eye className="w-4 h-4 text-[#0284C7]" />
                  <span>Glaucoma Clinical Baseline</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label htmlFor="glaucoma-iop-input" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Intraocular Pressure (IOP) / Cup-to-Disc History
                    </label>
                    <input
                      type="text"
                      id="glaucoma-iop-input"
                      value={iopHistory}
                      onChange={(e) => setIopHistory(e.target.value)}
                      placeholder=""
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="glaucoma-history-input" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Family History & Peripheral Vision Status
                    </label>
                    <input
                      type="text"
                      id="glaucoma-history-input"
                      value={glaucomaHistory}
                      onChange={(e) => setGlaucomaHistory(e.target.value)}
                      placeholder=""
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer Form Actions */}
          <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-t border-slate-100 bg-slate-50/90 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              id="cancel-add-patient-btn"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer text-center h-9"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              id="register-only-patient-btn"
              disabled={isBlocked}
              onClick={() => handleRegisterPatient(discipline, false)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all text-center h-9 border ${
                isBlocked
                  ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                  : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-100 cursor-pointer'
              }`}
              title={duplicateMatch ? 'Cannot register: duplicate patient exists' : undefined}
            >
              Register Only
            </button>
            <button
              type="submit"
              id="register-and-start-screening-btn"
              disabled={isBlocked}
              className={`px-4 py-2 text-xs sm:text-[13px] font-bold rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 h-9 ${
                isBlocked
                  ? 'opacity-50 cursor-not-allowed bg-slate-300 text-slate-500 shadow-none'
                  : 'bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white cursor-pointer'
              }`}
              title={duplicateMatch ? 'Cannot register: duplicate patient exists' : undefined}
            >
              <span>
                {discipline === 'cataract'
                  ? 'Register & Start Cataract'
                  : discipline === 'dr'
                  ? 'Register & Start DR'
                  : 'Register & Start Glaucoma'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
