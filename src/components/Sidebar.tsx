import React from 'react';
import {
  Activity,
  Users,
  Eye,
  FileText,
  Settings,
  User,
  PlusCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

  const handleNewScreening = () => {
    resetWizard();
    setActivePage('new-screening');
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

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenOnMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container: Docked full-height on desktop, overlay drawer on mobile */}
      <aside
        id="app-sidebar"
        className={`fixed md:sticky top-0 md:top-[68px] bottom-0 left-0 z-40 flex flex-col w-[280px] md:w-[264px] shrink-0 bg-white border-r border-slate-300 p-5 transition-transform duration-200 ease-in-out h-full md:h-[calc(100vh-68px)] md:overflow-y-auto ${
          isOpenOnMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col flex-1">
          {/* Section 1: CLINICAL */}
          <div className="space-y-1">
            <div className="px-3 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              CLINICAL
            </div>

            {/* Dashboard */}
            <button
              type="button"
              onClick={() => handleNavClick('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'dashboard'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Activity className={`w-5 h-5 shrink-0 ${activePage === 'dashboard' ? 'text-[#0284C7]' : 'text-slate-400'}`} />
              <span>Dashboard</span>
            </button>

            {/* Patient Registry */}
            <button
              type="button"
              onClick={() => handleNavClick('patients')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'patients' || activePage === 'patient-detail'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className={`w-5 h-5 shrink-0 ${activePage === 'patients' || activePage === 'patient-detail' ? 'text-[#0284C7]' : 'text-slate-400'}`} />
                <span>Patient Registry</span>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-600">
                {patients.length}
              </span>
            </button>

            {/* Screenings */}
            <button
              type="button"
              onClick={() => handleNavClick('screening-history')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'screening-history' || activePage === 'screenings'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Eye className={`w-5 h-5 shrink-0 ${activePage === 'screening-history' || activePage === 'screenings' ? 'text-[#0284C7]' : 'text-slate-400'}`} />
                <span>Screenings</span>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-600">
                {(screenings?.length || 0) + (cataractScreenings?.length || 0) + (glaucomaScreenings?.length || 0)}
              </span>
            </button>

            {/* Reports */}
            <button
              type="button"
              onClick={() => handleNavClick('reports-card')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'reports-card' || activePage === 'reports' || activePage === 'report-detail'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className={`w-5 h-5 shrink-0 ${activePage === 'reports-card' || activePage === 'reports' ? 'text-[#0284C7]' : 'text-slate-400'}`} />
                <span>Reports</span>
              </div>
              {reportsBadge !== 0 && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-600">
                  {reportsBadge}
                </span>
              )}
            </button>
          </div>

          {/* Section 2: EYE CONDITIONS */}
          <div className="mt-6 space-y-1">
            <div className="px-3 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              EYE CONDITIONS
            </div>

            {/* Cataract */}
            <button
              type="button"
              onClick={handleStartCataract}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'cataract-screening' || activePage === 'cataract-history' || activePage === 'cataract-report-detail'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[#0284C7] shrink-0" />
                <span>Cataract</span>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-600">
                {cataractCount}
              </span>
            </button>

            {/* Diabetic Retinopathy */}
            <button
              type="button"
              onClick={handleStartDR}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'dr-screening'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[#0284C7] shrink-0" />
                <span>Diabetic Retinopathy</span>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-600">
                {drCount}
              </span>
            </button>

            {/* Glaucoma */}
            <button
              type="button"
              onClick={handleStartGlaucoma}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'glaucoma-screening' || activePage === 'glaucoma-history' || activePage === 'glaucoma-report-detail'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[#0284C7] shrink-0" />
                <span>Glaucoma</span>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-600">
                {glaucomaCount}
              </span>
            </button>
          </div>

          {/* Section 3: ACCOUNT */}
          <div className="mt-6 space-y-1">
            <div className="px-3 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              ACCOUNT
            </div>

            {/* Doctor Profile */}
            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                activePage === 'settings'
                  ? 'bg-sky-50 text-[#0284C7]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <User className="w-5 h-5 text-slate-400 shrink-0" />
              <span>Doctor Profile</span>
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
            >
              <Settings className="w-5 h-5 text-slate-400 shrink-0" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
