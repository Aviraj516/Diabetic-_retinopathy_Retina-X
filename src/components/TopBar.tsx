import React from 'react';
import {
  Menu,
  LogOut,
  Phone,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import trinayLogo from '../assets/logo.png';
import { useApp } from '../context/AppContext';
import { NavigationPage } from '../types';

interface TopBarProps {
  onToggleMobileSidebar: () => void;
  isSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Clinical Overview',
  patients: 'Patient Registry',
  'patient-detail': 'Patient Profile',
  'new-screening': 'Start Screening',
  'dr-screening': 'Diabetic Retinopathy',
  'screening-history': 'Screening Records',
  'cataract-screening': 'Cataract Assessment',
  'cataract-history': 'Cataract Records',
  'cataract-report-detail': 'Cataract Report',
  'glaucoma-screening': 'Glaucoma Assessment',
  'glaucoma-history': 'Glaucoma Records',
  'glaucoma-report-detail': 'Glaucoma Report',
  analytics: 'Analytics & Insights',
  'reports-card': 'Diagnostic Reports',
  reports: 'Diagnostic Reports',
  'report-detail': 'Detailed Report',
  screenings: 'Screening Audit',
  referrals: 'Clinical Referrals',
  'cases-reviews': 'Specialist Reviews',
  users: 'System Users',
  settings: 'Clinician Settings',
};

export const TopBar: React.FC<TopBarProps> = ({
  onToggleMobileSidebar,
  isSidebarCollapsed = false,
  onToggleDesktopSidebar,
}) => {
  const {
    currentUser,
    currentRole,
    activePage,
    logout,
    setActivePage,
  } = useApp();

  const displayName = currentUser?.name
    ? currentUser.name.toLowerCase() === 'avi' ||
      currentUser.name.includes('Arvind') ||
      currentUser.name.includes('Kulkarni')
      ? 'Dr. Aviraj Murkute'
      : currentUser.name.startsWith('Dr.')
      ? currentUser.name
      : `Dr. ${currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1)}`
    : 'Dr. Aviraj Murkute';

  const displayTitle =
    currentUser?.title &&
    !currentUser.title.toLowerCase().includes('primary healthcare') &&
    !currentUser.title.toLowerCase().includes('optometrist')
      ? currentUser.title
      : currentRole === 'admin'
      ? 'System Administrator'
      : 'Ophthalmologist';

  const initials = displayName
    ? displayName
        .replace(/^Dr\.\s*/i, '')
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AM';

  const currentSection = PAGE_TITLES[activePage] || 'Dashboard';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-3 sm:px-5 md:px-6 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] w-full max-w-full min-w-0 transition-all">
      {/* Left side: Navigation toggles, Logo & Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3.5 shrink-0 min-w-0">
        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Open sidebar"
          className="p-1.5 -ml-1 text-slate-600 rounded-lg md:hidden hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Desktop sidebar collapse/expand toggle */}
        {onToggleDesktopSidebar && (
          <button
            type="button"
            onClick={onToggleDesktopSidebar}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:inline-flex items-center justify-center w-8 h-8 -ml-1 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-4.5 h-4.5" />
            ) : (
              <PanelLeftClose className="w-4.5 h-4.5" />
            )}
          </button>
        )}

        {/* TRINAY Logo & Branding */}
        <div
          onClick={() => setActivePage('dashboard')}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none group min-w-0"
        >
          <img
            src={trinayLogo}
            alt="TRINAY Logo"
            className="h-8 sm:h-9 w-auto max-h-[36px] object-contain shrink-0 transition-transform group-hover:scale-105"
          />
          <div className="flex flex-col min-w-0 justify-center">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[17px] sm:text-[18px] font-black tracking-tight text-[#0F172A] leading-none"
                style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
              >
                TRINAY
              </span>
              <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-200/80 rounded-md">
                Clinical AI
              </span>
            </div>
            <span
              className="text-[10px] sm:text-[11px] font-semibold text-[#0284C7] tracking-normal leading-none mt-1 truncate"
              style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
            >
              Eye Health Platform
            </span>
          </div>
        </div>

        {/* Breadcrumb Context (Desktop) */}
        <div className="hidden xl:flex items-center gap-1.5 ml-3 pl-3.5 border-l border-slate-200 text-xs font-medium text-slate-500 min-w-0">
          <span className="text-slate-400">TRINAY</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <span className="font-semibold text-slate-800 truncate">{currentSection}</span>
        </div>
      </div>

      {/* Right controls: Clinical Workspace Status, Doctor Profile, Logout */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
        {/* Clinician Active Pill */}
        <div className="hidden lg:inline-flex items-center gap-2 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>Clinician Workspace Active</span>
        </div>

        {/* Doctor Profile Info */}
        <div
          onClick={() => setActivePage('settings')}
          className="flex items-center gap-2.5 pl-1 py-1 pr-1.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
          title="View profile & settings"
        >
          <div className="flex items-center justify-center w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full bg-[#0284C7] text-white font-extrabold text-[11px] sm:text-xs shrink-0 shadow-xs ring-2 ring-sky-100">
            {initials}
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-bold text-[#0F172A] leading-tight">
              {displayName}
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
              <span>{displayTitle}</span>
              {(currentUser?.phone || currentUser?.contactNo) && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-0.5 text-[#0284C7] font-semibold">
                    <Phone className="w-2.5 h-2.5 shrink-0" />
                    <span>{currentUser.phone || currentUser.contactNo}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dedicated Logout Action Button */}
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50/70 hover:bg-rose-100/80 hover:text-rose-700 border border-rose-200/80 rounded-xl transition-all cursor-pointer shadow-2xs"
          title="Sign out of TRINAY"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

