import React from 'react';
import {
  LayoutGrid,
  Users,
  ScanEye,
  History,
  Send,
  Settings,
  ClipboardCheck,
  Eye,
  Wifi,
  WifiOff,
  FileText,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NavigationPage } from '../types';

interface SidebarProps {
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpenOnMobile = false,
  onCloseMobile,
}) => {
  const { activePage, setActivePage, currentRole, isOffline, pendingSyncCount, t } = useApp();

  interface NavItemConfig {
    id: NavigationPage;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }

  // 1. Nurse navigation items (Strictly NO Analytics, NO Admin, NO Users)
  const nurseNavItems: NavItemConfig[] = [
    { id: 'dashboard', label: t.dashboard, icon: LayoutGrid },
    { id: 'patients', label: t.patients, icon: Users },
    { id: 'new-screening', label: t.newScreening, icon: ScanEye },
    { id: 'screening-history', label: t.screeningHistory, icon: History },
    { id: 'referrals', label: t.referrals, icon: Send },
    { id: 'settings', label: t.settings, icon: Settings },
  ];

  // 2. Specialist navigation items (Strictly NO Admin, NO Users, NO Analytics)
  const specialistNavItems: NavItemConfig[] = [
    { id: 'dashboard', label: t.dashboard, icon: LayoutGrid },
    { id: 'cases-reviews', label: t.casesReviews, icon: ClipboardCheck },
    { id: 'patients', label: t.patients, icon: Users },
    { id: 'reports', label: t.reports, icon: FileText },
    { id: 'referrals', label: t.referrals, icon: Send },
    { id: 'settings', label: t.settings, icon: Settings },
  ];

  // 3. Admin navigation items (Full system access)
  const adminNavItems: NavItemConfig[] = [
    { id: 'dashboard', label: t.dashboard, icon: LayoutGrid },
    { id: 'patients', label: t.patients, icon: Users },
    { id: 'screenings', label: t.screenings, icon: ScanEye },
    { id: 'referrals', label: t.referrals, icon: Send },
    { id: 'reports', label: t.reports, icon: FileText },
    { id: 'users', label: t.users, icon: UserCheck },
    { id: 'settings', label: t.settings, icon: Settings },
  ];

  let navItems = nurseNavItems;
  if (currentRole === 'specialist') {
    navItems = specialistNavItems;
  } else if (currentRole === 'admin') {
    navItems = adminNavItems;
  }

  const handleNavClick = (pageId: NavigationPage) => {
    setActivePage(pageId);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop (only visible on mobile drawer) */}
      {isOpenOnMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Primary Left Fixed Sidebar:
          Fixed on desktop (md:translate-x-0), 240px wide, deep navy #0D1829 background */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-[240px] bg-[#0D1829] text-slate-200 border-r border-slate-800 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpenOnMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 px-6 h-18 border-b border-slate-800/80">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-inner">
            <Eye className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-wider text-white">
              RETINA<span className="text-[#1E60D5]">-X</span>
            </span>
            <span className="text-[10px] text-slate-400 tracking-tight leading-none">
              EXPLAINABLE AI SCREENING
            </span>
          </div>
        </div>

        {/* Role Badge */}
        <div className="px-5 py-2.5 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {t.activeRole}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
            {currentRole}
          </span>
        </div>

        {/* Navigation list with clearly visible BLUE rectangular highlighted box for active page */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Also treat child detail pages as part of their parent nav item
            const isMatch =
              activePage === item.id ||
              (item.id === 'patients' && activePage === 'patient-detail') ||
              (item.id === 'reports' && activePage === 'report-detail');

            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
                  isMatch
                    ? 'bg-[#1E60D5] text-white shadow-md shadow-blue-900/30 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon
                  className={`w-4.5 h-4.5 shrink-0 ${
                    isMatch ? 'text-white' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Connectivity Status Indicator (Offline-first architecture) */}
        <div className="p-3.5 mx-3 mb-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isOffline ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 shadow-xs shadow-emerald-400/50'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white leading-tight">
                {isOffline ? t.offline : t.online}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {isOffline
                  ? `${pendingSyncCount} ${t.recordsWaitingToSync}`
                  : t.allDataSynced}
              </p>
            </div>
            {isOffline ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
