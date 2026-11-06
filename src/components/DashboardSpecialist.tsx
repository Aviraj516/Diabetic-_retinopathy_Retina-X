import React, { useState } from 'react';
import {
  Search,
  FileText,
  AlertOctagon,
  CheckCircle2,
  CalendarClock,
  ArrowRight,
  ClipboardList,
  Users,
  Activity,
  Send,
  Stethoscope,
  Calendar,
  UserPlus,
  PlusCircle,
  Phone,
  Target,
  Eye,
  FileCheck,
  TrendingUp,
  BarChart3,
  Shield,
  Clock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ScreeningRecord } from '../types';
import { EyeScreeningModules } from './EyeScreeningModules';
import { ClinicalDiseaseReference } from './DiseaseReferenceCards';

interface DashboardSpecialistProps {
  onOpenCaseReview?: (screening: ScreeningRecord) => void;
}

export const DashboardSpecialist: React.FC<DashboardSpecialistProps> = ({
  onOpenCaseReview,
}) => {
  const {
    currentUser,
    screenings,
    cataractScreenings,
    glaucomaScreenings,
    patients,
    referrals,
    totalReports,
    setActivePage,
    setActiveScreeningForModal,
    setIsAddPatientModalOpen,
    t,
  } = useApp();

  const [currentGreeting, setCurrentGreeting] = React.useState<string>(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  React.useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) setCurrentGreeting('Good morning');
      else if (hour < 17) setCurrentGreeting('Good afternoon');
      else setCurrentGreeting('Good evening');
    };
    updateGreeting();
    const interval = setInterval(updateGreeting, 30000);
    return () => clearInterval(interval);
  }, []);

  const getGreeting = () => currentGreeting;

  const doctorName = currentUser?.name
    ? currentUser.name.toLowerCase() === 'avi' ||
      currentUser.name.includes('Arvind') ||
      currentUser.name.includes('Kulkarni')
      ? 'Dr. Aviraj Murkute'
      : currentUser.name.startsWith('Dr.')
      ? currentUser.name
      : `Dr. ${currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1)}`
    : 'Dr. Aviraj Murkute';

  // For a Specialist:
  const assignedCases = screenings.filter((s) => {
    if (!currentUser) return false;
    const isAssignedAssessment =
      s.specialistAssessment?.specialistId === currentUser.id ||
      (s.specialistAssessment?.specialistName &&
        currentUser.name &&
        s.specialistAssessment.specialistName.trim().toLowerCase() === currentUser.name.trim().toLowerCase());

    const isAssignedReferral = referrals.some(
      (r) =>
        r.screeningId === s.id &&
        (r.specialistId === currentUser.id ||
          (r.specialistName &&
            currentUser.name &&
            r.specialistName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()))
    );

    return isAssignedAssessment || isAssignedReferral;
  });

  const casesAwaitingReview = assignedCases.filter(
    (s) => (s.status === 'Referred' || s.status === 'Review') && !s.specialistAssessment
  );

  const urgentCases = casesAwaitingReview.filter(
    (s) => s.drSeverity === 'Severe' || s.drSeverity === 'PDR'
  );

  const reviewedCases = assignedCases.filter((s) => s.status === 'Reviewed');

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const todaysPatientsCount = patients.filter(
    (p) => p.lastScreeningDate === todayStr || p.createdAt?.startsWith(new Date().toISOString().slice(0, 10))
  ).length;
  const todaysScreeningsCount = screenings.filter((s) => s.date === todayStr).length;

  const drCount = screenings.filter((s) => !s.condition || s.condition === 'dr' || s.drSeverity).length;
  const cataractCount = cataractScreenings?.length || 0;
  const glaucomaCount = glaucomaScreenings?.length || 0;
  const totalCombinedScreenings = drCount + cataractCount + glaucomaCount;

  const drPct = totalCombinedScreenings > 0 ? Math.round((drCount / totalCombinedScreenings) * 100) : 45;
  const cataractPct = totalCombinedScreenings > 0 ? Math.round((cataractCount / totalCombinedScreenings) * 100) : 30;
  const glaucomaPct = totalCombinedScreenings > 0 ? 100 - drPct - cataractPct : 25;

  const handleReviewClick = (caseItem: ScreeningRecord) => {
    setActiveScreeningForModal(caseItem);
    if (onOpenCaseReview) {
      onOpenCaseReview(caseItem);
    } else {
      setActivePage('cases-reviews');
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActivePage('patients');
    }
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Search Bar - Clean & Modern V16 Style */}
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

      {/* Welcome & Overview Card - Dashboard V16 Composition */}
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
            {getGreeting()}, {doctorName}
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1 max-w-2xl">
            Ophthalmic AI decision-support platform for automated diabetic retinopathy, cataract, and glaucoma triage.
          </p>
        </div>

        {/* Quick Actions in Welcome Card */}
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
            onClick={() => setActivePage('cases-reviews')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-[13px] font-bold rounded-xl shadow-xs transition-all cursor-pointer h-10 ${
              casesAwaitingReview.length > 0
                ? 'bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Review Pending Cases ({casesAwaitingReview.length})</span>
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Summary Cards */}
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

        {/* Card 2: TODAY'S PATIENTS */}
        <div className="v16-stat-card group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              TODAY'S PATIENTS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600">
              <Calendar className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {todaysPatientsCount}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1.5">
              <span>Scheduled Clinic / Camp</span>
            </div>
          </div>
        </div>

        {/* Card 3: TODAY'S SCREENINGS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('screening-history')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-sky-600 uppercase tracking-wider transition-colors">
              TODAY'S SCREENINGS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-50 text-[#0284C7] group-hover:bg-sky-100 transition-colors">
              <Activity className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {todaysScreeningsCount}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1.5">
              <span>Optical AI Captures</span>
            </div>
          </div>
        </div>

        {/* Card 4: PENDING REVIEWS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('cases-reviews')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-amber-600 uppercase tracking-wider transition-colors">
              PENDING REVIEWS
            </span>
            <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${
              urgentCases.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
            }`}>
              <AlertOctagon className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {casesAwaitingReview.length}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mt-1.5">
              {casesAwaitingReview.length === 0 ? (
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All reviews cleared
                </span>
              ) : urgentCases.length > 0 ? (
                <span className="text-rose-600">{urgentCases.length} Urgent Priority Cases</span>
              ) : (
                <span className="text-amber-600">Awaiting Specialist Sign-off</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Eye Screening Modules Section (Cataract, DR, Glaucoma) */}
      <EyeScreeningModules />

      {/* Main Content Grid: Balanced 12-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 cols): Cases Awaiting Review + Clinical Activity */}
        <div className="lg:col-span-8 space-y-5">
          {/* Cases Awaiting Review Card */}
          <div className="bg-white rounded-2xl border border-slate-200/85 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-extrabold text-[#0F172A] tracking-tight">
                  {t.casesAwaitingReview}
                </h2>
                {casesAwaitingReview.length > 0 && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {casesAwaitingReview.length} {t.actionNeeded}
                  </span>
                )}
              </div>
              {casesAwaitingReview.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActivePage('cases-reviews')}
                  className="text-xs font-bold text-[#0284C7] hover:text-sky-800 transition-colors cursor-pointer"
                >
                  Review All ({casesAwaitingReview.length})
                </button>
              )}
            </div>

            {/* Empty state when 0 cases exist */}
            {casesAwaitingReview.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-2xs">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  {t.noCasesAwaitingReview}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  {t.noCasesDesc}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-[13px]">
                  <thead className="bg-slate-50/70 text-[11px] font-bold text-slate-400 border-b border-slate-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">{t.patientId}</th>
                      <th className="px-4 py-3">{t.fullName}</th>
                      <th className="px-4 py-3">{t.date}</th>
                      <th className="px-4 py-3">{t.selectEye}</th>
                      <th className="px-4 py-3">{t.result}</th>
                      <th className="px-4 py-3">{t.confidence}</th>
                      <th className="px-5 py-3 text-right">{t.action}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {casesAwaitingReview.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-900 font-mono">{item.patientId}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{item.patientName}</td>
                        <td className="px-4 py-3 text-slate-500">{item.date}</td>
                        <td className="px-4 py-3 font-medium">{item.eye}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${
                            item.drSeverity === 'Severe' || item.drSeverity === 'PDR'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : item.drSeverity === 'Moderate'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}>
                            {item.drSeverity}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 font-mono">{item.confidence}%</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleReviewClick(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#0284C7] hover:bg-sky-700 rounded-lg transition-colors shadow-2xs cursor-pointer"
                          >
                            <span>{t.reviewCase}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    <div className="text-[11px] text-slate-400">Multi-disease capture flow</div>
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
                    <div className="text-[11px] text-slate-400">View and manage records</div>
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
                    <div className="text-[11px] text-slate-400">Export & clinical summaries</div>
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

