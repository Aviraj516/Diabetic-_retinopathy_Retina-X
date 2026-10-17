import React from 'react';
import {
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
    referrals,
    reports,
    setActivePage,
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
            {getGreeting()}, {currentUser?.name || 'Administrator'}
          </h1>
          <p className="text-base sm:text-lg font-medium text-slate-500 mt-1.5">
            Manage patients, screenings, and eye-care reports from one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActivePage('users')}
            className="inline-flex items-center gap-2 px-5.5 py-3 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white text-base font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <UserCheck className="w-5 h-5" />
            <span>Manage System Users</span>
          </button>
        </div>
      </div>

      {/* 4 Primary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: TOTAL PATIENTS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              TOTAL PATIENTS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7]">
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

        {/* Card 2: SYSTEM USERS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              SYSTEM USERS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {users.length}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              {totalNurses} Clinicians, {totalSpecialists} Specialists
            </div>
          </div>
        </div>

        {/* Card 3: TOTAL SCREENINGS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              TOTAL SCREENINGS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7]">
              <ScanEye className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {screenings.length}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              Conducted AI evaluations
            </div>
          </div>
        </div>

        {/* Card 4: PENDING REVIEWS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              PENDING REVIEWS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-500">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {pendingReviews}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              {pendingReviews === 0 ? 'No pending reviews' : `${pendingReviews} pending reviews`}
            </div>
          </div>
        </div>
      </div>



      {/* Eye Screening Modules Section (5 Diseases) */}
      <EyeScreeningModules />

      {/* Admin Modules Directory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          onClick={() => setActivePage('patients')}
          className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sky-400 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-sky-50 text-[#0284C7] border border-sky-100 group-hover:bg-[#0284C7] group-hover:text-white transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#0284C7] group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{t.patientsDirectory}</h3>
          <p className="text-sm text-slate-500 mt-1">
            {t.patientsDirectoryDesc}
          </p>
          <div className="mt-4 text-sm font-bold text-[#0284C7]">
            {patients.length} {t.registeredPatients}
          </div>
        </div>

        <div
          onClick={() => setActivePage('screenings')}
          className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sky-400 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
              <ScanEye className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-600 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{t.screeningOperations}</h3>
          <p className="text-sm text-slate-500 mt-1">
            {t.screeningOperationsDesc}
          </p>
          <div className="mt-4 text-sm font-bold text-cyan-600">
            {screenings.length} {t.conductedScreenings}
          </div>
        </div>

        <div
          onClick={() => setActivePage('users')}
          className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:purple-400 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <UserCheck className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{t.userManagement}</h3>
          <p className="text-sm text-slate-500 mt-1">
            {t.userManagementDesc}
          </p>
          <div className="mt-4 text-sm font-bold text-purple-600">
            {users.length} {t.activeSystemUsers}
          </div>
        </div>
      </div>

      {/* Doctor-Facing Disease Reference */}
      <ClinicalDiseaseReference />
    </div>
  );
};

