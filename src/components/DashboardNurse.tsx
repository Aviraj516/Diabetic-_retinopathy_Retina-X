import React from 'react';
import {
  Users,
  AlertTriangle,
  Plus,
  Eye,
  Calendar,
  UserPlus,
  Activity,
  FileText,
  Clock,
  Send,
  CheckCircle2,
  Stethoscope,
  PlusCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { ScreeningRecord } from '../types';
import { EyeScreeningModules } from './EyeScreeningModules';

export const DashboardNurse: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentUser,
    screenings,
    patients,
    referrals,
    cataractScreenings,
    glaucomaScreenings,
    setActivePage,
    setIsAddPatientModalOpen,
    resetWizard,
    setActiveScreeningForModal,
    setIsReportModalOpen,
    openReport,
  } = useApp();

  const [isScreeningDropdownOpen, setIsScreeningDropdownOpen] = React.useState(false);

  const handleStartDR = () => {
    setIsScreeningDropdownOpen(false);
    resetWizard();
    setActivePage('new-screening');
  };

  const handleStartCataract = () => {
    setIsScreeningDropdownOpen(false);
    setActivePage('cataract-screening');
  };

  const handleStartGlaucoma = () => {
    setIsScreeningDropdownOpen(false);
    setActivePage('glaucoma-screening');
  };

  const handleOpenReport = (screening: any) => {
    openReport(screening.id);
  };

  const computeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const [currentGreeting, setCurrentGreeting] = React.useState<string>(computeGreeting());

  React.useEffect(() => {
    const updateGreeting = () => {
      setCurrentGreeting(computeGreeting());
    };
    const interval = setInterval(updateGreeting, 30000);
    return () => clearInterval(interval);
  }, []);

  const getGreeting = () => currentGreeting;

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  
  const allNurseScreenings = [
    ...screenings.map((s) => ({
      ...s,
      pipeline: 'dr' as const,
      pipelineLabel: 'DR',
      resultBadge: s.drSeverity || 'No DR',
      confidenceDisplay: `${s.confidence}%`,
      statusDisplay: s.status,
      timestamp: (s as any).timestamp || ((s as any).createdAt ? new Date((s as any).createdAt).getTime() : 0),
    })),
    ...cataractScreenings.map((c) => ({
      ...c,
      pipeline: 'cataract' as const,
      pipelineLabel: 'Cataract',
      resultBadge: c.cataractPrediction === 'CATARACT' ? 'Cataract' : 'Normal',
      confidenceDisplay: `${((c.cataractProbability || 0) * 100).toFixed(1)}%`,
      statusDisplay: c.overallStatus || 'Completed',
      timestamp: (c as any).timestamp || ((c as any).createdAt ? new Date((c as any).createdAt).getTime() : 0),
    })),
    ...glaucomaScreenings.map((g) => ({
      ...g,
      pipeline: 'glaucoma' as const,
      pipelineLabel: 'Glaucoma',
      resultBadge: g.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? 'Glaucoma Suspect' : 'Normal / Low Risk',
      confidenceDisplay: `${((g.glaucomaProbability || 0) * 100).toFixed(1)}%`,
      statusDisplay: g.overallStatus || 'Completed',
      timestamp: (g as any).timestamp || ((g as any).createdAt ? new Date((g as any).createdAt).getTime() : 0),
    })),
  ].sort((a, b) => {
    const timeA = (a as any).timestamp || 0;
    const timeB = (b as any).timestamp || 0;
    if (timeA !== timeB) return timeB - timeA;
    return (b.id || '').localeCompare(a.id || '');
  });

  const nurseScreenings = allNurseScreenings;

  const doctorDisplayName = currentUser?.name
    ? currentUser.name.toLowerCase() === 'avi' || currentUser.name.includes('Arvind') || currentUser.name.includes('Kulkarni')
      ? 'Dr. Aviraj Murkute'
      : currentUser.name.startsWith('Dr.')
      ? currentUser.name
      : `Dr. ${currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1)}`
    : 'Dr. Aviraj Murkute';

  const awaitingReviewCount = nurseScreenings.filter((s) => {
    const st = (s.statusDisplay || (s as any).status || (s as any).overallStatus || '').toLowerCase();
    return st === 'review' || st === 'referred' || st === 'pending';
  }).length;

  const nurseReferrals = referrals.filter((r) => {
    if (!currentUser) return false;
    return (
      (r.nurseName && currentUser.name && r.nurseName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      nurseScreenings.some((s) => s.id === r.screeningId)
    );
  });
  const referralsCount = nurseReferrals.length;

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Card matching Reference Image */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold rounded-lg bg-sky-50 text-[#0284C7] border border-sky-100">
              <Stethoscope className="w-4 h-4 text-[#0284C7]" />
              <span>Clinician Workspace Active</span>
            </span>
          </div>
          <h1 className="text-3xl sm:text-[34px] font-extrabold text-[#0F172A] tracking-tight leading-tight">
            {getGreeting()}, {doctorDisplayName}
          </h1>
          <p className="text-base sm:text-lg font-medium text-slate-500 mt-1.5">
            Manage patients, screenings, and eye-care reports from one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsAddPatientModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 text-base font-bold rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4.5 h-4.5 text-slate-500" />
            <span>+ Add Patient</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('new-screening')}
            className="inline-flex items-center gap-2.5 px-5.5 py-3 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white text-base font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            <span>+ Start New Screening</span>
          </button>
        </div>
      </div>

      {/* 3 Primary Summary Stat Cards: Total Patients, Total Screenings, Pending Reviews */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: TOTAL PATIENTS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('patients')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActivePage('patients');
            }
          }}
          className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-sky-300 hover:shadow-xs transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 group-hover:text-sky-600 uppercase tracking-wider transition-colors">
              TOTAL PATIENTS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7] group-hover:bg-sky-100 transition-colors">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {patients.length}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              Enrolled in Registry
            </div>
          </div>
        </div>

        {/* Card 2: TOTAL SCREENINGS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('screening-history')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActivePage('screening-history');
            }
          }}
          className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-sky-300 hover:shadow-xs transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 group-hover:text-sky-600 uppercase tracking-wider transition-colors">
              TOTAL SCREENINGS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7] group-hover:bg-sky-100 transition-colors">
              <Eye className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {nurseScreenings.length}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              Optical AI Captures
            </div>
          </div>
        </div>

        {/* Card 3: PENDING REVIEWS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('screening-history')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActivePage('screening-history');
            }
          }}
          className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-amber-300 hover:shadow-xs transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 group-hover:text-amber-600 uppercase tracking-wider transition-colors">
              PENDING REVIEWS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-500 group-hover:bg-amber-100 transition-colors">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {awaitingReviewCount}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              Awaiting Doctor Sign-off
            </div>
          </div>
        </div>
      </div>



      {/* Eye Screening Modules Section (5 Diseases) */}
      <EyeScreeningModules />

      {/* Recent Screenings Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900">
            {t('recentScreenings')}
          </h2>
          {nurseScreenings.length > 0 && (
            <button
              type="button"
              onClick={() => setActivePage('screening-history')}
              className="text-base font-bold text-[#0284C7] hover:text-sky-800 transition-colors cursor-pointer"
            >
              {t('viewAll')}
            </button>
          )}
        </div>

        {nurseScreenings.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-sky-50 text-[#0284C7] border border-sky-100 shadow-2xs">
              <Eye className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {t('noScreeningsYet')}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-6">
              {t('noScreeningsDesc')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setActivePage('new-screening')}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 text-sm font-bold text-white bg-[#0284C7] hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('startNewScreening')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">{t('patientId')}</th>
                  <th className="px-6 py-3.5">{t('fullName')}</th>
                  <th className="px-6 py-3.5">{t('screening')}</th>
                  <th className="px-6 py-3.5">{t('date')}</th>
                  <th className="px-6 py-3.5">{t('result')}</th>
                  <th className="px-6 py-3.5">{t('confidenceHeader', { defaultValue: 'Confidence' })}</th>
                  <th className="px-6 py-3.5">{t('status')}</th>
                  <th className="px-6 py-3.5 text-right">{t('action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {nurseScreenings.slice(0, 8).map((screening) => (
                  <tr key={screening.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-slate-900 font-mono">
                      {screening.patientId}
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-slate-900">
                      {screening.patientName}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-xs font-extrabold uppercase border ${
                          screening.pipeline === 'glaucoma'
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : screening.pipeline === 'cataract'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {screening.pipelineLabel}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {screening.date}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[13px] font-bold border ${
                          screening.resultBadge.toLowerCase().includes('no dr') ||
                          screening.resultBadge.toLowerCase().includes('normal')
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : screening.resultBadge.toLowerCase().includes('mild')
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : screening.resultBadge.toLowerCase().includes('moderate') ||
                              screening.resultBadge.toLowerCase().includes('suspect')
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {screening.resultBadge}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-bold text-slate-900 font-mono">
                      {screening.confidenceDisplay}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-md text-[13px] font-bold ${
                          screening.statusDisplay === 'Completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : screening.statusDisplay === 'Reviewed'
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : screening.statusDisplay === 'Referred'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {screening.statusDisplay}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenReport(screening)}
                        className="text-sm font-bold text-[#0284C7] hover:text-sky-800 transition-colors cursor-pointer"
                      >
                        {t('viewReport')}
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

