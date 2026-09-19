import React, { useState } from 'react';
import { X, AlertTriangle, Send, FileCheck, CheckCircle2, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen, onClose }) => {
  const { activeScreeningForModal, createReferral, setActivePage, t } = useApp();

  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [specialistNotes, setSpecialistNotes] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen || !activeScreeningForModal) return null;

  const rec = activeScreeningForModal;

  const handleShareWithSpecialist = () => {
    createReferral({
      screeningId: rec.id,
      patientId: rec.patientId,
      patientName: rec.patientName,
      patientAge: rec.patientAge,
      patientGender: rec.patientGender,
      priority,
      drSeverity: rec.drSeverityLevel,
      keyFindings: rec.findings,
      notes: specialistNotes.trim() || undefined,
    });

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header matching reference image #13 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            {t.referralRecommendation}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Red Alert Banner matching reference image #13 */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-900 text-xs">
                {t.specialistReviewRecommended}
              </h3>
              <p className="text-[11px] text-red-700 mt-0.5">
                {t.specialistReviewDesc}
              </p>
            </div>
          </div>

          {/* Form details */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* Priority Level dropdown */}
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700">{t.priorityLevel}:</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-xs text-red-600 focus:outline-hidden focus:border-blue-500"
              >
                <option value="High">{t.highPriority}</option>
                <option value="Medium">{t.mediumPriority}</option>
                <option value="Low">{t.lowPriority}</option>
              </select>
            </div>

            {/* DR Severity */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">{t.drSeverity}:</span>
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
                {rec.drSeverityLevel}
              </span>
            </div>

            {/* Key Findings */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">{t.keyFindings}:</span>
              <span className="font-medium text-slate-800 text-right">
                {rec.findings.join(', ')}
              </span>
            </div>

            {/* Screening Date */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">{t.screeningDate}:</span>
              <span className="font-medium text-slate-800">{rec.date}</span>
            </div>
          </div>

          {/* Clinical Notes input */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {t.clinicalNotes} ({t.optional})
            </label>
            <textarea
              rows={3}
              value={specialistNotes}
              onChange={(e) => setSpecialistNotes(e.target.value)}
              placeholder="Add specific clinical notes or urgent referral context..."
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {isSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">
                {t.savedSuccessfully}
              </span>
            </div>
          )}

          {/* Action Buttons matching reference image #13 */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              disabled={isSuccess}
              onClick={handleShareWithSpecialist}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>{t.shareWithSpecialist}</span>
            </button>
            <button
              type="button"
              onClick={handleShareWithSpecialist}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg border border-slate-200 transition-colors"
            >
              <FileCheck className="w-4 h-4 text-slate-500" />
              <span>{t.generateReferralReport}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
