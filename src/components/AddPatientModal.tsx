import React, { useState } from 'react';
import { X, UserPlus, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Patient } from '../types';

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientSaved?: (patient: Patient) => void;
}

export const AddPatientModal: React.FC<AddPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientSaved,
}) => {
  const { addPatient, patients, t } = useApp();

  // "ALL FIELDS MUST INITIALLY BE EMPTY. Do not pre-fill any patient information."
  const [patientIdInput, setPatientIdInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [diabetesDuration, setDiabetesDuration] = useState('');
  const [knownDR, setKnownDR] = useState<'No' | 'Yes' | 'Uncertain' | ''>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    const newPatient = addPatient({
      fullName: fullName.trim(),
      age: Number(age) || 45,
      gender: (gender as 'Male' | 'Female' | 'Other') || 'Male',
      phoneNumber: phoneNumber.trim() || '98765 43210',
      diabetesDurationYears: Number(diabetesDuration) || 5,
      knownDR: (knownDR as 'No' | 'Yes' | 'Uncertain') || 'No',
    });

    // Reset form fields
    setPatientIdInput('');
    setFullName('');
    setAge('');
    setGender('');
    setPhoneNumber('');
    setDiabetesDuration('');
    setKnownDR('');

    if (onPatientSaved) {
      onPatientSaved(newPatient);
    }
    onClose();
  };

  const handleFillDemoHelper = () => {
    setPatientIdInput(`PX-${1025 + patients.length}`);
    setFullName('Ramesh Rao');
    setAge('54');
    setGender('Male');
    setPhoneNumber('98765 43210');
    setDiabetesDuration('8');
    setKnownDR('No');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header (matches reference image #3) */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t.addNewPatient}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Enter basic patient details.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Patient ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">{t.patientId}</label>
              <span className="text-[11px] text-slate-400">
                (Auto-assigned as PX-{1025 + patients.length})
              </span>
            </div>
            <input
              type="text"
              value={patientIdInput}
              onChange={(e) => setPatientIdInput(e.target.value)}
              placeholder={`e.g. PX-${1025 + patients.length}`}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Full Name */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {t.fullName} *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter patient full name..."
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Age and Gender row */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.age} *</label>
              <input
                type="number"
                required
                min="1"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Years..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.gender} *</label>
              <select
                required
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="" disabled>
                  Select gender
                </option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {t.phone}
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. 98765 43210"
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Diabetes Duration & Known DR */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {t.diabetesDuration}
              </label>
              <input
                type="number"
                min="0"
                max="70"
                value={diabetesDuration}
                onChange={(e) => setDiabetesDuration(e.target.value)}
                placeholder="e.g. 5"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {t.knownDR}
              </label>
              <select
                value={knownDR}
                onChange={(e) => setKnownDR(e.target.value as 'No' | 'Yes' | 'Uncertain')}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="" disabled>
                  Select status
                </option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
                <option value="Uncertain">Uncertain</option>
              </select>
            </div>
          </div>

          {/* Quick Helper button */}
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleFillDemoHelper}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              <Sparkles className="w-3 h-3" />
              <span>Fill sample values for test</span>
            </button>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              {t.savePatient}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
