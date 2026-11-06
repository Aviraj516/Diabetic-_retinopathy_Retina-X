import React, { useState } from 'react';
import {
  Search,
  Users,
  ScanEye,
  Send,
  FileText,
  UserCheck,
  Stethoscope,
  Clock,
  Shield,
  ArrowRight,
  Plus,
  Layers,
  Calendar,
  UserPlus,
  PlusCircle,
  Phone,
  ShieldCheck,
  Activity,
  FileCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EyeScreeningModules } from './EyeScreeningModules';
import { ClinicalDiseaseReference } from './DiseaseReferenceCards';

export const DashboardAdmin: React.FC = () => {
  const {
    currentUser,
    users,
    patients,
    screenings,
    cataractScreenings,
    glaucomaScreenings,
    referrals,
    reports,
    totalReports,
    setActivePage,
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

  const totalNurses = users.filter(
    (u) =>
      u.role?.toLowerCase() === 'nurse' &&
      (u.status?.toLowerCase() === 'active' || !u.status)
  ).length;

  const totalSpecialists = users.filter(
    (u) =>
      u.role?.toLowerCase() === 'specialist' &&
      (u.status?.toLowerCase() === 'active' || !u.status)
  ).length;

  const pendingReviews = screenings.filter(
    (s) =>
      (s.status === 'Referred' || s.status === 'Review') &&
      !s.specialistAssessment
  ).length;

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

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
              <ShieldCheck className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Hospital System Administration</span>
            </span>
            {(currentUser?.phone || currentUser?.contactNo) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-slate-50 text-slate-700 border border-slate-200/80">
                <Phone className="w-3 h-3 text-[#0284C7]" />
                <span>Contact: <strong className="font-bold text-[#0F172A]">{currentUser.phone || currentUser.contactNo}</strong></span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-slate-50 text-slate-600 border border-slate-200/70">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>{todayStr}</span>
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight leading-tight">
            {getGreeting()}, {currentUser?.name || 'Administrator'}
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1 max-w-2xl">
            Manage system users, clinician privileges, patient registries, and ophthalmic screening logs.
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
            onClick={() => setActivePage('users')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white text-xs sm:text-[13px] font-bold rounded-xl shadow-xs transition-all cursor-pointer h-10"
          >
            <UserCheck className="w-4 h-4" />
            <span>Manage System Users</span>
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

        {/* Card 2: SYSTEM USERS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('users')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-emerald-600 uppercase tracking-wider transition-colors">
              SYSTEM USERS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <UserCheck className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {users.length}
            </div>
            <div className="text-xs text-slate-400 font-medium mt-1.5">
              {totalNurses} Clinicians, {totalSpecialists} Specialists
            </div>
          </div>
        </div>

        {/* Card 3: TOTAL SCREENINGS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('screenings')}
          className="v16-stat-card cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-sky-600 uppercase tracking-wider transition-colors">
              TOTAL SCREENINGS
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-50 text-[#0284C7] group-hover:bg-sky-100 transition-colors">
              <ScanEye className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#0F172A] tracking-tight leading-none">
              {totalCombinedScreenings}
            </div>
            <div className="text-xs text-slate-400 font-medium mt-1.5">
              Across 3 AI Pipelines
            </div>
          </div>
        </div>

        {/* Card 4: PENDING REVIEWS */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActivePage('screenings')}
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
              {pendingReviews}
            </div>
            <div className="text-xs text-slate-400 font-medium mt-1.5">
              {pendingReviews === 0 ? 'All clinical reviews cleared' : `${pendingReviews} Awaiting Sign-off`}
            </div>
          </div>
        </div>
      </div>

      {/* Eye Screening Modules Section (Cataract, DR, Glaucoma) */}
      <EyeScreeningModules />

      {/* Main Content Grid: Balanced 12-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 cols): Admin Modules Directory Cards + Clinical Activity */}
        <div className="lg:col-span-8 space-y-5">
          {/* Admin Directory Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => setActivePage('patients')}
              className="bg-white rounded-2xl border border-slate-200/85 p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] hover:border-sky-300 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7] border border-sky-100 flex items-center justify-center group-hover:bg-[#0284C7] group-hover:text-white transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#0284C7] group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-base font-extrabold text-[#0F172A] group-hover:text-[#0284C7] transition-colors">{t.patientsDirectory}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t.patientsDirectoryDesc}
              </p>
              <div className="mt-3.5 pt-3 border-t border-slate-100 text-xs font-bold text-[#0284C7]">
                {patients.length} {t.registeredPatients}
              </div>
            </div>

            <div
              onClick={() => setActivePage('screenings')}
              className="bg-white rounded-2xl border border-slate-200/85 p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] hover:border-cyan-300 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100 flex items-center justify-center group-hover:bg-cyan-700 group-hover:text-white transition-colors">
                  <ScanEye className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-cyan-700 group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-base font-extrabold text-[#0F172A] group-hover:text-cyan-700 transition-colors">{t.screeningOperations}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t.screeningOperationsDesc}
              </p>
              <div className="mt-3.5 pt-3 border-t border-slate-100 text-xs font-bold text-cyan-700">
                {totalCombinedScreenings} Total Screenings
              </div>
            </div>

            <div
              onClick={() => setActivePage('users')}
              className="bg-white rounded-2xl border border-slate-200/85 p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] hover:border-purple-300 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center group-hover:bg-purple-700 group-hover:text-white transition-colors">
                  <UserCheck className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-purple-700 group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-base font-extrabold text-[#0F172A] group-hover:text-purple-700 transition-colors">{t.userManagement}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t.userManagementDesc}
              </p>
              <div className="mt-3.5 pt-3 border-t border-slate-100 text-xs font-bold text-purple-700">
                {users.length} {t.activeSystemUsers}
              </div>
            </div>
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
              Admin Quick Actions
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
                    <div className="text-[11px] text-slate-400">Enroll new patient record</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#0284C7] group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => setActivePage('users')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200/80 hover:border-sky-300 hover:bg-sky-50/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Manage Users</div>
                    <div className="text-[11px] text-slate-400">Manage clinician accounts</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
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
                    <div className="text-[11px] text-slate-400">Browse all patient records</div>
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
                    <div className="text-[11px] text-slate-400">Export clinical summaries</div>
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
                System Health
              </h3>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                All Operational
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              DR, Cataract, and Glaucoma AI evaluation pipelines are running nominally. High-throughput optical screening is enabled across all clinician accounts.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActivePage('settings')}
                className="w-full py-2 text-xs font-bold text-[#0284C7] bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors text-center cursor-pointer"
              >
                View System Settings
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


