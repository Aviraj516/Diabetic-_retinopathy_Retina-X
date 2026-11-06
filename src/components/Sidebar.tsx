import React from 'react';
import {
  LayoutDashboard,
  Users,
  Eye,
  FileText,
  Settings,
  User,
  Activity,
  Target,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { NavigationPage } from '../types';

interface SidebarProps {
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpenOnMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const {
    activePage,
    setActivePage,
    isOffline,
    pendingSyncCount,
    resetWizard,
    patients,
    screenings,
    cataractScreenings,
    glaucomaScreenings,
    totalReports,
    reportsLoading,
    reportsError,
  } = useApp();
  const { t } = useTranslation();

  const reportsBadge =
    reportsLoading && totalReports === 0 ? '…' : reportsError && totalReports === 0 ? '—' : totalReports;

  const handleNavClick = (pageId: NavigationPage) => {
    setActivePage(pageId);
    if (onCloseMobile) onCloseMobile();
  };

  const handleStartDR = () => {
    resetWizard();
    setActivePage('dr-screening');
    if (onCloseMobile) onCloseMobile();
  };

  const handleStartCataract = () => {
    setActivePage('cataract-screening');
    if (onCloseMobile) onCloseMobile();
  };

  const handleStartGlaucoma = () => {
    setActivePage('glaucoma-screening');
    if (onCloseMobile) onCloseMobile();
  };

  const localCataractCount = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('retina_x_v3_cataract');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  }, []);

  const localGlaucomaCount = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('retina_x_v3_glaucoma');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  }, []);

  const drCount = screenings.filter((s) => !s.condition || s.condition === 'dr' || s.drSeverity).length;
  const cataractCount = Math.max(cataractScreenings.length, localCataractCount);
  const glaucomaCount = Math.max(glaucomaScreenings.length, localGlaucomaCount);
  const totalScreeningsCount = (screenings?.length || 0) + (cataractScreenings?.length || 0) + (glaucomaScreenings?.length || 0);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenOnMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container: Docked full-height on desktop, overlay drawer on mobile */}
      <aside
        id="app-sidebar"
        className={`fixed md:sticky top-0 md:top-16 bottom-0 left-0 z-40 flex flex-col shrink-0 bg-white border-r border-slate-200/90 transition-all duration-300 ease-in-out h-full md:h-[calc(100vh-64px)] md:overflow-y-auto select-none ${
          isCollapsed ? 'w-[260px] md:w-[72px] p-2.5 md:p-2' : 'w-[260px] md:w-[244px] p-3 sm:p-3.5'
        } ${
          isOpenOnMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col flex-1 justify-between min-h-0">
          <div className="space-y-5">
            {/* Section 1: CLINICAL */}
            <div className="space-y-1">
              {!isCollapsed ? (
                <div className="px-3 mb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  CLINICAL
                </div>
              ) : (
                <div className="h-2" />
              )}

              {/* Dashboard */}
              <button
                type="button"
                onClick={() => handleNavClick('dashboard')}
                title={isCollapsed ? 'Dashboard' : undefined}
                className={`w-full flex items-center rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'dashboard'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <LayoutDashboard
                  className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                    activePage === 'dashboard' ? 'text-[#0284C7]' : 'text-slate-400 group-hover:text-slate-700'
                  }`}
                />
                {!isCollapsed && <span className="truncate">Dashboard</span>}
              </button>

              {/* Patient Registry */}
              <button
                type="button"
                onClick={() => handleNavClick('patients')}
                title={isCollapsed ? `Patient Registry (${patients.length})` : undefined}
                className={`w-full flex items-center justify-between rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5 relative' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'patients' || activePage === 'patient-detail'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Users
                    className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                      activePage === 'patients' || activePage === 'patient-detail'
                        ? 'text-[#0284C7]'
                        : 'text-slate-400 group-hover:text-slate-700'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">Patient Registry</span>}
                </div>
                {!isCollapsed ? (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 shrink-0">
                    {patients.length}
                  </span>
                ) : (
                  patients.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-sky-500 ring-2 ring-white" />
                  )
                )}
              </button>

              {/* Screenings */}
              <button
                type="button"
                onClick={() => handleNavClick('screening-history')}
                title={isCollapsed ? `Screenings (${totalScreeningsCount})` : undefined}
                className={`w-full flex items-center justify-between rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5 relative' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'screening-history' || activePage === 'screenings'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Eye
                    className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                      activePage === 'screening-history' || activePage === 'screenings'
                        ? 'text-[#0284C7]'
                        : 'text-slate-400 group-hover:text-slate-700'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">Screenings</span>}
                </div>
                {!isCollapsed ? (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 shrink-0">
                    {totalScreeningsCount}
                  </span>
                ) : (
                  totalScreeningsCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-sky-500 ring-2 ring-white" />
                  )
                )}
              </button>

              {/* Reports */}
              <button
                type="button"
                onClick={() => handleNavClick('reports-card')}
                title={isCollapsed ? `Reports (${reportsBadge})` : undefined}
                className={`w-full flex items-center justify-between rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5 relative' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'reports-card' || activePage === 'reports' || activePage === 'report-detail'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText
                    className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                      activePage === 'reports-card' || activePage === 'reports' || activePage === 'report-detail'
                        ? 'text-[#0284C7]'
                        : 'text-slate-400 group-hover:text-slate-700'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">Reports</span>}
                </div>
                {!isCollapsed ? (
                  reportsBadge !== 0 && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 shrink-0">
                      {reportsBadge}
                    </span>
                  )
                ) : (
                  reportsBadge !== 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-sky-500 ring-2 ring-white" />
                  )
                )}
              </button>
            </div>

            {/* Section 2: EYE CONDITIONS */}
            <div className="space-y-1">
              {!isCollapsed ? (
                <div className="px-3 mb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  EYE CONDITIONS
                </div>
              ) : (
                <div className="my-2 border-t border-slate-100" />
              )}

              {/* Cataract */}
              <button
                type="button"
                onClick={handleStartCataract}
                title={isCollapsed ? `Cataract (${cataractCount})` : undefined}
                className={`w-full flex items-center justify-between rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5 relative' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'cataract-screening' || activePage === 'cataract-history' || activePage === 'cataract-report-detail'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-50 text-amber-600 border border-amber-200/60 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                  </span>
                  {!isCollapsed && <span className="truncate">Cataract</span>}
                </div>
                {!isCollapsed ? (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 shrink-0">
                    {cataractCount}
                  </span>
                ) : (
                  cataractCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
                  )
                )}
              </button>

              {/* Diabetic Retinopathy */}
              <button
                type="button"
                onClick={handleStartDR}
                title={isCollapsed ? `Diabetic Retinopathy (${drCount})` : undefined}
                className={`w-full flex items-center justify-between rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5 relative' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'dr-screening'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-sky-50 text-[#0284C7] border border-sky-200/60 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                  </span>
                  {!isCollapsed && <span className="truncate">Diabetic Retinopathy</span>}
                </div>
                {!isCollapsed ? (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 shrink-0">
                    {drCount}
                  </span>
                ) : (
                  drCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-sky-500 ring-2 ring-white" />
                  )
                )}
              </button>

              {/* Glaucoma */}
              <button
                type="button"
                onClick={handleStartGlaucoma}
                title={isCollapsed ? `Glaucoma (${glaucomaCount})` : undefined}
                className={`w-full flex items-center justify-between rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5 relative' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'glaucoma-screening' || activePage === 'glaucoma-history' || activePage === 'glaucoma-report-detail'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-teal-50 text-teal-600 border border-teal-200/60 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-teal-500" />
                  </span>
                  {!isCollapsed && <span className="truncate">Glaucoma</span>}
                </div>
                {!isCollapsed ? (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200/70 shrink-0">
                    {glaucomaCount}
                  </span>
                ) : (
                  glaucomaCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-teal-500 ring-2 ring-white" />
                  )
                )}
              </button>
            </div>

            {/* Section 3: ACCOUNT */}
            <div className="space-y-1">
              {!isCollapsed ? (
                <div className="px-3 mb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  ACCOUNT
                </div>
              ) : (
                <div className="my-2 border-t border-slate-100" />
              )}

              {/* Doctor Profile */}
              <button
                type="button"
                onClick={() => handleNavClick('settings')}
                title={isCollapsed ? 'Doctor Profile' : undefined}
                className={`w-full flex items-center rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
                } ${
                  activePage === 'settings'
                    ? 'bg-sky-50 text-[#0284C7] shadow-2xs font-bold border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <User className="w-4.5 h-4.5 text-slate-400 group-hover:text-slate-700 shrink-0 transition-colors" />
                {!isCollapsed && <span className="truncate">Doctor Profile</span>}
              </button>

              {/* Settings */}
              <button
                type="button"
                onClick={() => handleNavClick('settings')}
                title={isCollapsed ? 'Settings' : undefined}
                className={`w-full flex items-center rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
                  isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
                } text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent`}
              >
                <Settings className="w-4.5 h-4.5 text-slate-400 group-hover:text-slate-700 shrink-0 transition-colors" />
                {!isCollapsed && <span className="truncate">Settings</span>}
              </button>
            </div>
          </div>

          {/* Bottom Section: Offline indicator + Collapse toggle */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {/* Offline status indicator */}
            {isOffline && (
              <div
                className={`flex items-center rounded-xl bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200 ${
                  isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'
                }`}
                title={isOffline ? 'Offline mode active' : undefined}
              >
                <WifiOff className="w-4 h-4 shrink-0" />
                {!isCollapsed && (
                  <span className="truncate">
                    Offline {pendingSyncCount > 0 ? `(${pendingSyncCount} unsynced)` : ''}
                  </span>
                )}
              </div>
            )}

            {/* Desktop Collapse / Expand Toggle Button */}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className={`hidden md:flex items-center w-full rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer ${
                  isCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
                }`}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {!isCollapsed && <span>Collapse Sidebar</span>}
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

