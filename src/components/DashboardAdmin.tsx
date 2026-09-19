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
} from 'lucide-react';
import { useApp } from '../context/AppContext';

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
    <div className="space-y-6">
      {/* Admin Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>{t.systemOverview}, {currentUser?.name || t.adminRole}</span>
            <Shield className="w-5 h-5 text-purple-600" />
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t.adminSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActivePage('users')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t.manageSystemUsers}</span>
          </button>
        </div>
      </div>

      {/* 7 System Metrics Cards (All start at 0 except registered staff users) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
        {/* Total Patients */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 text-blue-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {patients.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.totalPatients}
            </div>
          </div>
        </div>

        {/* Total Nurses */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-teal-50 text-teal-600 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {totalNurses}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.totalNurses}
            </div>
          </div>
        </div>

        {/* Total Specialists */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {totalSpecialists}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.totalSpecialists}
            </div>
          </div>
        </div>

        {/* Total Screenings */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-cyan-50 text-cyan-600 shrink-0">
            <ScanEye className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {screenings.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.totalScreenings}
            </div>
          </div>
        </div>

        {/* Total Referrals */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 text-amber-600 shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {referrals.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.totalReferrals}
            </div>
          </div>
        </div>

        {/* Total Reports */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {reports.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.totalReports}
            </div>
          </div>
        </div>

        {/* Pending Specialist Reviews */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-rose-50 text-rose-600 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {pendingReviews}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.pendingReviews}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Modules Directory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          onClick={() => setActivePage('patients')}
          className="p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-400 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-[#1E60D5] group-hover:text-white transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{t.patientsDirectory}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {t.patientsDirectoryDesc}
          </p>
          <div className="mt-4 text-xs font-semibold text-blue-600">
            {patients.length} {t.registeredPatients}
          </div>
        </div>

        <div
          onClick={() => setActivePage('screenings')}
          className="p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-400 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-cyan-50 text-cyan-600 group-hover:bg-[#1E60D5] group-hover:text-white transition-colors">
              <ScanEye className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{t.screeningOperations}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {t.screeningOperationsDesc}
          </p>
          <div className="mt-4 text-xs font-semibold text-cyan-600">
            {screenings.length} {t.conductedScreenings}
          </div>
        </div>

        <div
          onClick={() => setActivePage('users')}
          className="p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-400 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <UserCheck className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{t.userManagement}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {t.userManagementDesc}
          </p>
          <div className="mt-4 text-xs font-semibold text-purple-600">
            {users.length} {t.activeSystemUsers}
          </div>
        </div>
      </div>
    </div>
  );
};
