import React from 'react';
import {
  Users,
  Clock,
  AlertTriangle,
  RefreshCw,
  Plus,
  Eye,
  ArrowRight,
  UserPlus,
  Calendar,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ScreeningRecord } from '../types';

export const DashboardNurse: React.FC = () => {
  const {
    currentUser,
    screenings,
    referrals,
    pendingSyncCount,
    setActivePage,
    setIsAddPatientModalOpen,
    resetWizard,
    setActiveScreeningForModal,
    setIsReportModalOpen,
    t,
  } = useApp();

  const handleStartScreening = () => {
    resetWizard();
    setActivePage('new-screening');
  };

  const handleOpenReport = (screening: ScreeningRecord) => {
    setActiveScreeningForModal(screening);
    setIsReportModalOpen(true);
  };

  // Dynamic calculations strictly scoped to the logged-in Nurse:
  // If the Nurse has no screenings/referrals, all counters are 0!
  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  
  const nurseScreenings = screenings.filter((s) => {
    if (!currentUser) return false;
    return (
      s.nurseId === currentUser.id ||
      (s.nurseName && currentUser.name && s.nurseName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      (s.nurseName && currentUser.email && s.nurseName.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
    );
  });

  const todaysCount = nurseScreenings.filter((s) => s.date === todayStr).length;
  const awaitingReviewCount = nurseScreenings.filter(
    (s) => s.status === 'Review' || (s.status === 'Referred' && !s.specialistAssessment)
  ).length;

  const nurseReferrals = referrals.filter((r) => {
    if (!currentUser) return false;
    return (
      (r.nurseName && currentUser.name && r.nurseName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      nurseScreenings.some((s) => s.id === r.screeningId)
    );
  });
  const referralsCount = nurseReferrals.length;

  return (
    <div className="space-y-6">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>{t.goodMorning}, {currentUser?.name || 'Nurse'}</span>
            <span className="text-2xl select-none" role="img" aria-label="wave">
              👋
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{t.togetherVision}</p>
        </div>

        <button
          type="button"
          onClick={handleStartScreening}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow-xs shadow-blue-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t.startNewScreening}</span>
        </button>
      </div>

      {/* 4 Summary Stat Cards (exact colors and icons from reference image #1) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {/* Card 1: Today's Screenings */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 text-blue-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {todaysCount}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.todaysScreenings}
            </div>
          </div>
        </div>

        {/* Card 2: Awaiting Review */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 text-amber-600 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {awaitingReviewCount}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.awaitingReview}
            </div>
          </div>
        </div>

        {/* Card 3: Referrals */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-red-50 text-red-600 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {referralsCount}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.referrals}
            </div>
          </div>
        </div>

        {/* Card 4: Pending Sync */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {pendingSyncCount}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.pendingSync}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Screenings Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {t.recentScreenings}
          </h2>
          {nurseScreenings.length > 0 && (
            <button
              type="button"
              onClick={() => setActivePage('screening-history')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              {t.viewAll}
            </button>
          )}
        </div>

        {/* Brand new empty state when 0 screenings exist */}
        {nurseScreenings.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-3.5 rounded-full bg-slate-100 text-slate-400">
              <Eye className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              {t.noScreeningsYet}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
              {t.noScreeningsDesc}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              >
                <UserPlus className="w-4 h-4 text-slate-500" />
                <span>{t.addPatient}</span>
              </button>
              <button
                type="button"
                onClick={handleStartScreening}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{t.startNewScreening}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Table of Screenings if populated through actual workflow */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">{t.patientId}</th>
                  <th className="px-6 py-3.5">{t.fullName}</th>
                  <th className="px-6 py-3.5">{t.date}</th>
                  <th className="px-6 py-3.5">{t.result}</th>
                  <th className="px-6 py-3.5">{t.confidence}</th>
                  <th className="px-6 py-3.5">{t.status}</th>
                  <th className="px-6 py-3.5 text-right">{t.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                {nurseScreenings.slice(0, 5).map((screening) => (
                  <tr key={screening.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      {screening.patientId}
                    </td>
                    <td className="px-6 py-3.5 font-medium">
                      {screening.patientName}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {screening.date}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          screening.drSeverity === 'No DR'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : screening.drSeverity === 'Mild'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : screening.drSeverity === 'Moderate'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {screening.drSeverity}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-slate-800">
                      {screening.confidence}%
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-md text-[11px] font-medium ${
                          screening.status === 'Completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : screening.status === 'Reviewed'
                            ? 'bg-blue-50 text-blue-700'
                            : screening.status === 'Referred'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {screening.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenReport(screening)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {t.viewReport}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
