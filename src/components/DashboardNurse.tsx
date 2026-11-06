import React, { useState } from 'react';
import {
  Search,
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
  Phone,
  ArrowRight,
  Filter,
  Layers,
  Target,
  FileCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { ScreeningRecord } from '../types';
import { EyeScreeningModules } from './EyeScreeningModules';
import { ClinicalDiseaseReference } from './DiseaseReferenceCards';

export const DashboardNurse: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentUser,
    screenings,
    patients,
    referrals,
    cataractScreenings,
    glaucomaScreenings,
    totalReports,
    setActivePage,
    setIsAddPatientModalOpen,
    resetWizard,
    openReport,
  } = useApp();

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

  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'dr' | 'cataract' | 'glaucoma'>('all');

  const filteredScreenings = allNurseScreenings.filter((s) => {
    if (pipelineFilter === 'all') return true;
    return s.pipeline === pipelineFilter;
  });

  const doctorDisplayName = currentUser?.name
    ? currentUser.name.toLowerCase() === 'avi' ||
      currentUser.name.includes('Arvind') ||
      currentUser.name.includes('Kulkarni')
      ? 'Dr. Aviraj Murkute'
      : currentUser.name.startsWith('Dr.')
      ? currentUser.name
      : `Dr. ${currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1)}`
    : 'Dr. Aviraj Murkute';

  const awaitingReviewCount = allNurseScreenings.filter((s) => {
    const st = (s.statusDisplay || (s as any).status || (s as any).overallStatus || '').toLowerCase();
    return st === 'review' || st === 'referred' || st === 'pending';
  }).length;

  const drCount = screenings.filter((s) => !s.condition || s.condition === 'dr' || s.drSeverity).length;
  const cataractCount = cataractScreenings?.length || 0;
  const glaucomaCount = glaucomaScreenings?.length || 0;
  const totalCombinedScreenings = drCount + cataractCount + glaucomaCount;

  const drPct = totalCombinedScreenings > 0 ? Math.round((drCount / totalCombinedScreenings) * 100) : 45;
  const cataractPct = totalCombinedScreenings > 0 ? Math.round((cataractCount / totalCombinedScreenings) * 100) : 30;
  const glaucomaPct = totalCombinedScreenings > 0 ? 100 - drPct - cataractPct : 25;

  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActivePage('patients');
    }
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Patient Search Bar - V16 Style */}
      <div className="w-full">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient by name, Phone or Patient ID... (Press Enter)"
            className="w-full pl-11 pr-24 py-3 text-xs sm:text-[13px] text-slate-800 placeholder-slate-400 bg-white border border-slate-200/90 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] transition-all font-medium"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-md">
              ↵ Enter
            </kbd>
          </div>
        </form>
      </div>

      {/* Welcome Card - Dashboard V16 Composition */}
      <div className="bg-white rounded-2xl border border-slate-200/85 p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-sky-50 text-[#0284C7] border border-sky-100">
              <Stethoscope className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Clinician Workspace Active</span>
            </span>
            {(currentUser?.phone || currentUser?.contactNo) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-slate-50 text-slate-700 border border-slate-200/80">
                <Phone className="w-3 h-3 text-[#0284C7]" />
                <span>Dr. Contact: <strong className="font-bold text-[#0F172A]">{currentUser.phone || currentUser.contactNo}</strong></span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-slate-50 text-slate-600 border border-slate-200/70">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>{todayStr}</span>
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight leading-tight">
            {getGreeting()}, {doctorDisplayName}
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1 max-w-2xl">
            Manage ophthalmic patient registry, optical image captures, and automated diagnostic reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsAddPatientModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-[13px] font-bold rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all cursor-pointer h-10"
          >
            <UserPlus className="w-4 h-4 text-slate-500" />
            <span>+ Add Patient</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('new-screening')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white text-xs sm:text-[13px] font-bold rounded-xl shadow-xs transition-all cursor-pointer h-10"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Start Screening</span>
          </button>
        </div>
      </div>

      {/* 4 Primary Summary Stat Cards: Total Patients, Total Screenings, Pending Reviews, Completed Reports */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TOTAL PATIENTS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('patients')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-sky-600 uppercase tracking-wider transition-colors">
              TOTAL PATIENTS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-50 text-[#0284C7] group-hover:bg-sky-100 transition-colors">
              <Users className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {patients.length}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Enrolled in Registry</span>
            </div>
          </div>
        </div>

        {/* Card 2: TOTAL SCREENINGS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('screening-history')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-sky-600 uppercase tracking-wider transition-colors">
              TOTAL SCREENINGS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-50 text-[#0284C7] group-hover:bg-sky-100 transition-colors">
              <Eye className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {totalCombinedScreenings}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1.5">
              <span>Across 3 AI Pipelines</span>
            </div>
          </div>
        </div>

        {/* Card 3: PENDING REVIEWS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('screening-history')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-amber-600 uppercase tracking-wider transition-colors">
              PENDING REVIEWS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
              <Clock className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {awaitingReviewCount}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 mt-1.5">
              <span>Awaiting Doctor Sign-off</span>
            </div>
          </div>
        </div>

        {/* Card 4: COMPLETED REPORTS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('reports-card')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-emerald-600 uppercase tracking-wider transition-colors">
              COMPLETED REPORTS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <FileCheck className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {totalReports}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1.5">
              <span>Evidence Verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Eye Screening Modules Section (Cataract, DR, Glaucoma) */}
      <EyeScreeningModules />

      {/* Main Content Grid: Balanced 12-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 cols): Recent Screenings Table + Clinical Distribution */}
        <div className="lg:col-span-8 space-y-5">
          {/* Recent Screenings Card with Filter Pills */}
          <div className="bg-white rounded-2xl border border-slate-200/85 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-[#0F172A] tracking-tight">
                  {t('recentScreenings')}
                </h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {filteredScreenings.length}
                </span>
              </div>

              {/* Modality Filter Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200/70">
                {(['all', 'dr', 'cataract', 'glaucoma'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPipelineFilter(filter)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer uppercase ${
                      pipelineFilter === filter
                        ? 'bg-white text-[#0284C7] shadow-2xs border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {filteredScreenings.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-2xl bg-sky-50 text-[#0284C7] border border-sky-100 shadow-2xs">
                  <Eye className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  {t('noScreeningsYet')}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  {t('noScreeningsDesc')}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePage('new-screening')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0284C7] hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('startNewScreening')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-[13px]">
                  <thead className="bg-slate-50/70 text-[11px] font-bold text-slate-400 border-b border-slate-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">{t('patientId')}</th>
                      <th className="px-4 py-3">{t('fullName')}</th>
                      <th className="px-4 py-3">{t('screening')}</th>
                      <th className="px-4 py-3">{t('date')}</th>
                      <th className="px-4 py-3">{t('result')}</th>
                      <th className="px-4 py-3">{t('confidenceHeader', { defaultValue: 'Confidence' })}</th>
                      <th className="px-4 py-3">{t('status')}</th>
                      <th className="px-5 py-3 text-right">{t('action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredScreenings.slice(0, 7).map((screening) => (
                      <tr key={screening.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-900 font-mono">
                          {screening.patientId}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {screening.patientName}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase border ${
                              screening.pipeline === 'glaucoma'
                                ? 'bg-teal-50 text-teal-700 border-teal-200'
                                : screening.pipeline === 'cataract'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}
                          >
                            {screening.pipelineLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {screening.date}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${
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
                        <td className="px-4 py-3 font-bold text-slate-900 font-mono">
                          {screening.confidenceDisplay}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold border ${
                              screening.statusDisplay === 'Completed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : screening.statusDisplay === 'Reviewed'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : screening.statusDisplay === 'Referred'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {screening.statusDisplay}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenReport(screening)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#0284C7] hover:text-sky-800 transition-colors cursor-pointer"
                          >
                            <span>{t('viewReport')}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredScreenings.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActivePage('screening-history')}
                  className="text-xs font-bold text-[#0284C7] hover:text-sky-800 transition-colors cursor-pointer"
                >
                  {t('viewAll')} Screenings ({filteredScreenings.length}) →
                </button>
              </div>
            )}
          </div>

          {/* Clinical Activity & Disease Distribution Card */}
          <div className="bg-white rounded-2xl border border-slate-200/85 p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#0F172A] tracking-tight">
                  Clinical Screening Distribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Proportion of AI screening records across ophthalmic modules.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/70">
                {totalCombinedScreenings} Total Captures
              </span>
            </div>

            {/* Visual Multi-segment Distribution Bar */}
            <div className="space-y-2">
              <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                <div
                  style={{ width: `${drPct}%` }}
                  className="h-full bg-[#0284C7] transition-all duration-500"
                  title={`Diabetic Retinopathy: ${drPct}%`}
                />
                <div
                  style={{ width: `${glaucomaPct}%` }}
                  className="h-full bg-teal-500 transition-all duration-500"
                  title={`Glaucoma: ${glaucomaPct}%`}
                />
                <div
                  style={{ width: `${cataractPct}%` }}
                  className="h-full bg-amber-500 transition-all duration-500"
                  title={`Cataract: ${cataractPct}%`}
                />
              </div>

              {/* Legend & Exact Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-sky-50/50 border border-sky-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]" />
                    <span className="text-xs font-bold text-slate-700">Diabetic Retinopathy</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#0284C7]">{drCount} ({drPct}%)</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/50 border border-teal-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                    <span className="text-xs font-bold text-slate-700">Glaucoma</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-teal-700">{glaucomaCount} ({glaucomaPct}%)</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-xs font-bold text-slate-700">Cataract</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-700">{cataractCount} ({cataractPct}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Quick Clinical Shortcuts + Disease Reference */}
        <div className="lg:col-span-4 space-y-5">
          {/* Quick Actions Panel */}
          <div className="bg-white rounded-2xl border border-slate-200/85 p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] space-y-3.5">
            <h3 className="text-base font-extrabold text-[#0F172A] tracking-tight">
              Clinical Quick Actions
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(true)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200/80 hover:border-sky-300 hover:bg-sky-50/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-[#0284C7] flex items-center justify-center">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Register Patient</div>
                    <div className="text-[11px] text-slate-400">Enroll new patient in registry</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#0284C7] group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => setActivePage('new-screening')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200/80 hover:border-sky-300 hover:bg-sky-50/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <PlusCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Start Screening</div>
                    <div className="text-[11px] text-slate-400">Launch multi-disease capture</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => setActivePage('patients')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200/80 hover:border-sky-300 hover:bg-sky-50/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Patient Registry</div>
                    <div className="text-[11px] text-slate-400">Browse & search patients</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => setActivePage('reports-card')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200/80 hover:border-sky-300 hover:bg-sky-50/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Diagnostic Reports</div>
                    <div className="text-[11px] text-slate-400">Export & view completed reports</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>
          </div>

          {/* Clinical Reference Box */}
          <div className="bg-white rounded-2xl border border-slate-200/85 p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#0F172A] tracking-tight">
                Clinical Cues
              </h3>
              <span className="text-[11px] font-semibold text-slate-400">Mayo Clinic</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Automated inference supports clinical triage. Review all borderline cup-to-disc ratios (CDR &gt; 0.65) and moderate-to-severe retinopathy findings.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActivePage('screening-history')}
                className="w-full py-2 text-xs font-bold text-[#0284C7] bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors text-center cursor-pointer"
              >
                Open Screening History
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Disease Reference Details */}
      <ClinicalDiseaseReference />
    </div>
  );
};


