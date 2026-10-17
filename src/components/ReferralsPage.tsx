import React from 'react';
import { AlertTriangle, Send, Eye, ArrowRight, Stethoscope, Clock, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ReferralRecord } from '../types';

export const ReferralsPage: React.FC = () => {
  const {
    referrals,
    screenings,
    currentRole,
    currentUser,
    setActivePage,
    switchRole,
    setActiveScreeningForModal,
    setIsReferralModalOpen,
    t,
  } = useApp();

  const roleScopedReferrals = referrals.filter((r) => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'nurse') {
      if (!currentUser) return false;
      return (
        (r.nurseName &&
          currentUser.name &&
          r.nurseName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
        screenings.some(
          (s) =>
            s.id === r.screeningId &&
            (s.nurseId === currentUser.id ||
              (s.nurseName &&
                currentUser.name &&
                s.nurseName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()))
        )
      );
    }
    if (currentRole === 'specialist') {
      if (!currentUser) return false;
      return (
        r.specialistId === currentUser.id ||
        (r.specialistName &&
          currentUser.name &&
          r.specialistName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
      );
    }
    return true;
  });

  const handleOpenReferralModal = (referral: ReferralRecord) => {
    const relatedScreening = screenings.find((s) => s.id === referral.screeningId);
    if (relatedScreening) {
      setActiveScreeningForModal(relatedScreening);
      setIsReferralModalOpen(true);
    }
  };

  const handleOpenInSpecialist = (referral: ReferralRecord) => {
    const relatedScreening = screenings.find((s) => s.id === referral.screeningId);
    if (relatedScreening) {
      setActiveScreeningForModal(relatedScreening);
    }
    switchRole('specialist');
    setActivePage('cases-reviews');
  };

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.referrals}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {roleScopedReferrals.length} active specialist referrals
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActivePage('new-screening')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0284C7] hover:bg-sky-600 active:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs shadow-sky-500/15 transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>{t.startNewScreening}</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Empty state when 0 referrals */}
        {roleScopedReferrals.length === 0 ? (
          <div className="py-20 px-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3.5 rounded-full bg-sky-50 flex items-center justify-center text-sky-600">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              {t.noReferralsYet}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
              {t.noReferralsDesc}
            </p>
            <button
              type="button"
              onClick={() => setActivePage('new-screening')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-sky-600 rounded-xl shadow-xs cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>Perform Retinal Screening</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {roleScopedReferrals.map((item) => (
              <div
                key={item.id}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-sky-50/20 transition-colors"
              >
                <div className="flex items-start gap-3.5">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 shadow-2xs shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-sm font-bold text-slate-900">
                        {item.patientName}
                      </h4>
                      <span className="font-mono text-xs text-slate-400">
                        ({item.patientId})
                      </span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.priority === 'High'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : item.priority === 'Medium'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.priority} Priority
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                      <span>{t.severity}: <strong className="text-slate-800">{item.drSeverity}</strong></span>
                      <span>•</span>
                      <span>{t.keyFindings}: {item.keyFindings.join(', ')}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {item.createdDate}
                      </span>
                    </div>

                    {item.notes && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mt-2 max-w-xl">
                        &quot;{item.notes}&quot;
                      </p>
                    )}
                  </div>
                </div>

                {/* Referral Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenReferralModal(item)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                  >
                    {t.viewDetails}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenInSpecialist(item)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0284C7] hover:bg-sky-600 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>Open in Specialist Mode</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
