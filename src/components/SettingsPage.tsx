import React, { useState } from 'react';
import {
  User,
  Building2,
  Eye,
  Bell,
  ShieldCheck,
  Monitor,
  Info,
  CheckCircle2,
  Lock,
  Globe,
  Sliders,
  Stethoscope,
  Shield,
  UserCheck,
  ChevronRight,
  AlertCircle,
  Volume2,
  VolumeX,
  Sparkles,
  Cpu,
  Layers,
  Clock,
  EyeOff,
  Sun,
  Moon,
  Laptop,
  Check,
  ExternalLink,
  Smartphone,
  Server,
  FileText,
  BadgeCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LANGUAGES } from '../data/translations';
import { LanguageCode } from '../types';

type SettingsTab =
  | 'all'
  | 'profile'
  | 'clinic'
  | 'preferences'
  | 'notifications'
  | 'security'
  | 'display'
  | 'about';

interface TabItem {
  id: SettingsTab;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const TABS: TabItem[] = [
  {
    id: 'all',
    label: 'Overview (All Sections)',
    shortDesc: 'Complete clinical workstation configuration',
    icon: Layers,
  },
  {
    id: 'profile',
    label: 'Profile & Account',
    shortDesc: 'Practitioner identity & clinical authorization',
    icon: User,
    badge: 'Active',
  },
  {
    id: 'clinic',
    label: 'Clinic Information',
    shortDesc: 'Facility metadata & ophthalmic hardware',
    icon: Building2,
    badge: 'Station 4',
  },
  {
    id: 'preferences',
    label: 'Clinical Preferences',
    shortDesc: 'Diagnostic scales, triage rules & protocols',
    icon: Eye,
    badge: 'ICDR / VCDR',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    shortDesc: 'Urgent findings & queue alerts',
    icon: Bell,
  },
  {
    id: 'security',
    label: 'Security & Privacy',
    shortDesc: '2FA TOTP, session cryptography & PHI',
    icon: ShieldCheck,
    badge: '2FA Active',
  },
  {
    id: 'display',
    label: 'Display & Accessibility',
    shortDesc: 'Language localization & retinal contrast',
    icon: Monitor,
  },
  {
    id: 'about',
    label: 'Application Information',
    shortDesc: 'Platform build & SaMD regulatory notice',
    icon: Info,
    badge: 'v2.4.0',
  },
];

export const SettingsPage: React.FC = () => {
  const {
    currentUser,
    currentRole,
    language,
    setLanguage,
    t,
  } = useApp();

  const [activeTab, setActiveTab] = useState<SettingsTab>('all');

  // Client-side notification preferences persisted locally
  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('trinay_notifications_settings');
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return {
      criticalFindings: true,
      specialistReviews: true,
      imageQualityAlerts: true,
      queueSummaries: false,
      audibleChimes: true,
    };
  });

  // Client-side display and accessibility preferences persisted locally
  const [displayPrefs, setDisplayPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem('trinay_display_settings');
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return {
      highContrastFundus: false,
      invertedGrayscale: false,
      compactDensity: false,
    };
  });

  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev: typeof notifications) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('trinay_notifications_settings', JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return updated;
    });
    showSaveNotification('Workstation notification preference updated');
  };

  const toggleDisplayPref = (key: keyof typeof displayPrefs) => {
    setDisplayPrefs((prev: typeof displayPrefs) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('trinay_display_settings', JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return updated;
    });
    showSaveNotification('Workstation display preference updated');
  };

  const handleLanguageChange = (code: LanguageCode) => {
    setLanguage(code);
    showSaveNotification(`Application language updated to ${code.toUpperCase()}`);
  };

  const showSaveNotification = (msg: string) => {
    setSaveBanner(msg);
    setTimeout(() => {
      setSaveBanner(null);
    }, 2400);
  };

  const displayName = currentUser?.name
    ? currentUser.name.toLowerCase() === 'avi' || currentUser.name.includes('Arvind') || currentUser.name.includes('Kulkarni')
      ? 'Dr. Aviraj Murkute'
      : currentUser.name.startsWith('Dr.')
      ? currentUser.name
      : `Dr. ${currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1)}`
    : 'Dr. Aviraj Murkute';

  const initials =
    displayName
      ? displayName
          .replace(/^Dr\.\s*/i, '')
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : 'AM';

  const displayEmail =
    currentUser?.email && !currentUser.email.includes('placeholder') && !currentUser.email.includes('arvind')
      ? currentUser.email
      : 'dr.aviraj.murkute@trinay.org';

  const displayTitle =
    currentUser?.title &&
    !currentUser.title.toLowerCase().includes('primary healthcare') &&
    !currentUser.title.toLowerCase().includes('optometrist')
      ? currentUser.title
      : currentRole === 'admin'
      ? 'Hospital System Administrator'
      : 'Ophthalmologist';
  const practitionerId = currentUser?.id || 'AUTH-OPHTH-01';

  const getRoleBadge = () => {
    switch (currentRole) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Shield className="w-3.5 h-3.5 text-purple-600" />
            <span>Hospital Administrator</span>
          </span>
        );
      case 'specialist':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <Stethoscope className="w-3.5 h-3.5 text-sky-600" />
            <span>Consultant Ophthalmologist</span>
          </span>
        );
      case 'nurse':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
            <span>Ophthalmologist</span>
          </span>
        );
    }
  };

  const shouldRenderSection = (section: SettingsTab) => {
    return activeTab === 'all' || activeTab === section;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Save / Feedback Toast */}
      {saveBanner && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveBanner}</span>
        </div>
      )}

      {/* Header & Station Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#0284C7]/10 text-[#0284C7] rounded-xl">
              <Sliders className="w-5 h-5 text-[#0284C7]" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {t.settings || 'Settings & System Preferences'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Ophthalmology clinical workstation parameters, practitioner profile &amp; diagnostic guidelines
              </p>
            </div>
          </div>
        </div>

        {/* Current Clinician Station Quick Chip */}
        <div className="flex items-center gap-3 p-2.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#0284C7] to-sky-700 text-white font-bold text-xs shadow-2xs">
            {initials}
          </div>
          <div className="text-left pr-2">
            <p className="text-xs font-bold text-slate-900 leading-tight">
              {displayName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-slate-600">
                {displayTitle}
              </span>
            </div>
          </div>
          <div className="hidden sm:block pl-2 border-l border-slate-100">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>2FA Verified</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Settings Layout: Sub-navigation & Content Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Navigation Sidebar (Desktop) / Horizontal Tabs (Mobile) */}
        <div className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs">
            <div className="px-3 pt-2 pb-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Settings Categories
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                7 Sections
              </span>
            </div>

            <nav className="mt-2 space-y-1">
              {TABS.map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#0284C7] text-white shadow-xs font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs truncate ${isActive ? 'font-bold' : 'font-semibold'}`}>
                          {tab.label}
                        </p>
                        <p
                          className={`text-[10.5px] truncate mt-0.5 ${
                            isActive ? 'text-white/80' : 'text-slate-500'
                          }`}
                        >
                          {tab.shortDesc}
                        </p>
                      </div>
                    </div>
                    {tab.badge && (
                      <span
                        className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Workstation Read-Only Status Info */}
          <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-100 text-xs text-sky-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sky-900 text-xs">
              <BadgeCheck className="w-4 h-4 text-[#0284C7]" />
              <span>Clinical System Standard</span>
            </div>
            <p className="text-[11.5px] text-sky-900/80 leading-relaxed font-normal">
              TRINAY runs on hospital clinical standards. Clinical grading criteria and access privileges are managed centrally to maintain patient safety and audit traceability.
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8 space-y-6">
          {/* ============================================================ */}
          {/* 1. Profile & Account */}
          {/* ============================================================ */}
          {shouldRenderSection('profile') && (
            <section
              id="settings-profile"
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl border border-sky-100">
                    <User className="w-4.5 h-4.5 text-[#0284C7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Profile &amp; Account
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Practitioner identity, authorized designation &amp; authentication credentials
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                  Read-Only Profile
                </span>
              </div>

              {/* Practitioner Card Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 bg-slate-50/80 rounded-xl border border-slate-200/90">
                <div className="flex items-center gap-3.5">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#0284C7] to-sky-700 text-white font-bold text-base shadow-xs">
                    {initials}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {displayName}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {displayEmail}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {getRoleBadge()}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Active Session</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Field Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Practitioner Full Name
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={displayName}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-not-allowed select-text"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Registered Email Address
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={displayEmail}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-not-allowed select-text"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Clinical Designation / Title
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={displayTitle}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-not-allowed select-text"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Practitioner Identifier (ID)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={practitionerId}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-mono text-[11px] cursor-not-allowed select-text"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-600">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11.5px]">
                  <strong>Directory Managed:</strong> Practitioner credentials, roles, and signing privileges are synchronized with the hospital authentication directory. To request title or authorization updates, contact the Hospital System Administrator.
                </p>
              </div>
            </section>
          )}

          {/* ============================================================ */}
          {/* 2. Clinic Information */}
          {/* ============================================================ */}
          {shouldRenderSection('clinic') && (
            <section
              id="settings-clinic"
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl border border-sky-100">
                    <Building2 className="w-4.5 h-4.5 text-[#0284C7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Clinic Information
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Healthcare facility configuration, station ID &amp; ophthalmic imaging hardware
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                  Station Config
                </span>
              </div>

              {/* Station Summary Pill Bar */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-slate-900 text-xs">
                    Station Identifier: <span className="font-mono text-[#0284C7]">STATION-OPHTH-04</span>
                  </p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    District Ophthalmic Medical Center #4 • Tele-Screening Unit
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Hardware Calibrated</span>
                </span>
              </div>

              {/* Facility Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Medical Facility Name
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="District Ophthalmic Medical Center #4"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-not-allowed select-text"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Clinical Department / Division
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="Vitreoretinal Services & Community Tele-Screening"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-not-allowed select-text"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Primary Fundus Imaging Hardware
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="Remidio Non-Mydriatic Fundus AI-Cam"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-not-allowed select-text"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Optical Field of View (FOV) &amp; Protocol
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="45° Non-Mydriatic Two-Field (Macula & Disc)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-not-allowed select-text"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11.5px] text-slate-600 flex items-start gap-2.5">
                <Server className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Hardware Profile:</strong> Station profile and camera serial parameters are locked to ensure consistent image scale and optical calibrations for DR lesion segmentation and Cup-to-Disc Ratio (CDR) estimations.
                </p>
              </div>
            </section>
          )}

          {/* ============================================================ */}
          {/* 3. Clinical Preferences */}
          {/* ============================================================ */}
          {shouldRenderSection('preferences') && (
            <section
              id="settings-preferences"
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl border border-sky-100">
                    <Eye className="w-4.5 h-4.5 text-[#0284C7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Clinical Preferences
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Diagnostic classification scales, examination sequence &amp; triage referral triggers
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                  Standard Protocols
                </span>
              </div>

              {/* Protocol Cards List */}
              <div className="space-y-3.5 text-xs">
                {/* 1. DR Grading */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        Diabetic Retinopathy Classification Scale
                      </span>
                      <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold text-[10px] rounded-md">
                        ICDR Standard
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11.5px]">
                      International Clinical Diabetic Retinopathy scale (Grades 0 to 4: No DR, Mild, Moderate, Severe, PDR).
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs self-start sm:self-auto shrink-0">
                    Enforced (5-Tier)
                  </span>
                </div>

                {/* 2. Glaucoma CDR */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        Glaucoma Evaluation Standard
                      </span>
                      <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold text-[10px] rounded-md">
                        CDR &amp; ISNT
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11.5px]">
                      Vertical Cup-to-Disc Ratio (VCDR) estimation combined with neuroretinal rim ISNT rule compliance analysis.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs self-start sm:self-auto shrink-0">
                    Threshold: 0.65
                  </span>
                </div>

                {/* 3. Cataract LOCS III */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        Cataract Grading System
                      </span>
                      <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold text-[10px] rounded-md">
                        LOCS III Compatible
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11.5px]">
                      Anterior segment lens opacity scoring (Clear, Mild Early, Moderate, Dense Mature cataract).
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs self-start sm:self-auto shrink-0">
                    4-Tier Scale
                  </span>
                </div>

                {/* 4. Eye Sequence */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        Screening Sequence Protocol
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-md">
                        OD → OS
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11.5px]">
                      Default screening sequence begins with Right Eye (Oculus Dexter, OD) followed by Left Eye (Oculus Sinister, OS).
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs self-start sm:self-auto shrink-0">
                    Standard Sequence
                  </span>
                </div>

                {/* 5. Triage Referral Trigger */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        Automated Specialist Referral Trigger
                      </span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold text-[10px] rounded-md">
                        High-Sensitivity Triage
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11.5px]">
                      Automated draft referral generated whenever DR severity is Moderate+ or Glaucoma VCDR exceeds 0.65.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs self-start sm:self-auto shrink-0">
                    Active Clinical Rule
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11.5px] text-slate-600 flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Clinical Standards Notice:</strong> Diagnostic grading schemes and cut-offs follow the All India Ophthalmological Society (AIOS) and International Council of Ophthalmology (ICO) tele-ophthalmology guidelines.
                </p>
              </div>
            </section>
          )}

          {/* ============================================================ */}
          {/* 4. Notifications */}
          {/* ============================================================ */}
          {shouldRenderSection('notifications') && (
            <section
              id="settings-notifications"
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl border border-sky-100">
                    <Bell className="w-4.5 h-4.5 text-[#0284C7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Notifications
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Workstation alert preferences for urgent findings, referrals &amp; screening queue events
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                  Local Preferences
                </span>
              </div>

              {/* Toggles List */}
              <div className="space-y-3.5 text-xs">
                {/* 1. Critical Finding Alerts */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900 text-xs">
                      Critical Finding &amp; High Priority Alerts
                    </p>
                    <p className="text-slate-500 text-[11.5px]">
                      Immediate desktop alert when AI identifies Severe NPDR, PDR, or VCDR &gt; 0.70 requiring urgent specialist evaluation.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifications.criticalFindings}
                    onClick={() => toggleNotification('criticalFindings')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      notifications.criticalFindings ? 'bg-[#0284C7]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        notifications.criticalFindings ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Specialist Review Assignment */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900 text-xs">
                      Specialist Review Queue Notifications
                    </p>
                    <p className="text-slate-500 text-[11.5px]">
                      Notify when a newly screened patient case is queued for ophthalmologist secondary confirmation.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifications.specialistReviews}
                    onClick={() => toggleNotification('specialistReviews')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      notifications.specialistReviews ? 'bg-[#0284C7]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        notifications.specialistReviews ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 3. Image Quality Alerts */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900 text-xs">
                      Image Quality &amp; Gradability Warnings
                    </p>
                    <p className="text-slate-500 text-[11.5px]">
                      Warn screening operator when fundus image illumination or focus fails minimum quality thresholds.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifications.imageQualityAlerts}
                    onClick={() => toggleNotification('imageQualityAlerts')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      notifications.imageQualityAlerts ? 'bg-[#0284C7]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        notifications.imageQualityAlerts ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 4. Queue Summaries */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900 text-xs">
                      Daily Screening Queue Summary
                    </p>
                    <p className="text-slate-500 text-[11.5px]">
                      Display end-of-day summary banner of completed screenings, referred cases &amp; pending reviews.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifications.queueSummaries}
                    onClick={() => toggleNotification('queueSummaries')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      notifications.queueSummaries ? 'bg-[#0284C7]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        notifications.queueSummaries ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 5. Audible Chime */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 text-xs">
                        Audible Alert Chime
                      </p>
                      {notifications.audibleChimes ? (
                        <Volume2 className="w-3.5 h-3.5 text-[#0284C7]" />
                      ) : (
                        <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="text-slate-500 text-[11.5px]">
                      Play subtle clinical audio tone on high-priority triage alerts.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifications.audibleChimes}
                    onClick={() => toggleNotification('audibleChimes')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      notifications.audibleChimes ? 'bg-[#0284C7]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        notifications.audibleChimes ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11.5px] text-slate-600 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Local Workstation Storage:</strong> Notification settings are saved in your local browser profile. No telemetry or clinical patient data is transmitted to external notification servers.
                </p>
              </div>
            </section>
          )}

          {/* ============================================================ */}
          {/* 5. Security & Privacy */}
          {/* ============================================================ */}
          {shouldRenderSection('security') && (
            <section
              id="settings-security"
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl border border-sky-100">
                    <ShieldCheck className="w-4.5 h-4.5 text-[#0284C7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Security &amp; Privacy
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Multi-Factor Authentication (MFA), session cryptography &amp; patient health data safeguards
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                  2FA Active
                </span>
              </div>

              {/* Status Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                {/* 2FA Card */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#0284C7]" />
                      Two-Factor Authentication
                    </span>
                    <span className="px-2 py-0.5 text-[10.5px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                      Verified
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11.5px] leading-relaxed">
                    Time-based One-Time Password (TOTP MFA via RFC 6238) active for practitioner session.
                  </p>
                  <p className="text-[11px] text-slate-600 font-semibold">
                    Assurance Level: <span className="font-mono text-[#0284C7]">AAL2 (Two-Step Enforced)</span>
                  </p>
                </div>

                {/* Session Protection */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#0284C7]" />
                      Session Inactivity Protection
                    </span>
                    <span className="px-2 py-0.5 text-[10.5px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                      Enforced
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11.5px] leading-relaxed">
                    Automatic clinical session lock upon idle timeout compliant with hospital workstation security guidelines.
                  </p>
                  <p className="text-[11px] text-slate-600 font-semibold">
                    Policy: <span className="text-slate-800">HIPAA Workstation Standard</span>
                  </p>
                </div>

                {/* In-Transit & At-Rest Cryptography */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-[#0284C7]" />
                      Data Cryptography
                    </span>
                    <span className="px-2 py-0.5 text-[10.5px] font-bold bg-sky-100 text-sky-800 rounded-md">
                      TLS 1.3
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11.5px] leading-relaxed">
                    End-to-end encrypted transport over TLS 1.3 with AES-256 database-level data at rest protection.
                  </p>
                  <p className="text-[11px] text-slate-600 font-semibold">
                    Cipher: <span className="text-slate-800">ECDHE-RSA-AES256-GCM</span>
                  </p>
                </div>

                {/* Audit Logging */}
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#0284C7]" />
                      Clinical Audit Logging
                    </span>
                    <span className="px-2 py-0.5 text-[10.5px] font-bold bg-sky-100 text-sky-800 rounded-md">
                      Active
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11.5px] leading-relaxed">
                    All patient lookups, AI screening inferences &amp; report generation events are logged with timestamps.
                  </p>
                  <p className="text-[11px] text-slate-600 font-semibold">
                    Scope: <span className="text-slate-800">Immutable Audit Trail</span>
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11.5px] text-slate-600 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Patient Health Information (PHI) Protection:</strong> Patient identifiable information is safeguarded under DISHA &amp; HIPAA standards. Access to screening records is restricted by authenticated role. Security policies are enforced at the server level.
                </p>
              </div>
            </section>
          )}

          {/* ============================================================ */}
          {/* 6. Display & Accessibility */}
          {/* ============================================================ */}
          {shouldRenderSection('display') && (
            <section
              id="settings-display"
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl border border-sky-100">
                    <Monitor className="w-4.5 h-4.5 text-[#0284C7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Display &amp; Accessibility
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Interface language localization, retinal visualization contrast &amp; accessibility modes
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                  Active
                </span>
              </div>

              {/* Language Selector (Directly bound to AppContext) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-slate-900 text-xs block">
                      Application Interface Language
                    </label>
                    <p className="text-slate-500 text-[11.5px] mt-0.5">
                      Select your preferred clinical interface language. Updates immediately across all screens.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-sky-50 text-[#0284C7] font-bold text-[10.5px] rounded-md border border-sky-100">
                    {LANGUAGES.find((l) => l.code === language)?.name || 'English'} Active
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                  {LANGUAGES.map((lang) => {
                    const isSelected = language === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-sky-50/80 border-[#0284C7] shadow-2xs'
                            : 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200/90 text-slate-700'
                        }`}
                      >
                        <div>
                          <p className={`text-xs ${isSelected ? 'font-bold text-[#0284C7]' : 'font-semibold text-slate-900'}`}>
                            {lang.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {lang.nativeName}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-[#0284C7] text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Retinal Canvas & Accessibility Toggles */}
              <div className="pt-2 space-y-3 border-t border-slate-100">
                <h3 className="font-bold text-slate-900 text-xs">
                  Retinal Canvas &amp; Visual Assist
                </h3>

                <div className="space-y-3 text-xs">
                  {/* High Contrast Fundus Mode */}
                  <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-900 text-xs">
                        High-Contrast Fundus Visualization Assist
                      </p>
                      <p className="text-slate-500 text-[11.5px]">
                        Enhances microaneurysm and retinal vessel contrast for standard low-contrast examination monitors.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={displayPrefs.highContrastFundus}
                      onClick={() => toggleDisplayPref('highContrastFundus')}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        displayPrefs.highContrastFundus ? 'bg-[#0284C7]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          displayPrefs.highContrastFundus ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Compact Clinical Density */}
                  <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-900 text-xs">
                        Compact Workstation Information Density
                      </p>
                      <p className="text-slate-500 text-[11.5px]">
                        Optimizes table padding and report headers for smaller clinical tablet or laptop screens.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={displayPrefs.compactDensity}
                      onClick={() => toggleDisplayPref('compactDensity')}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        displayPrefs.compactDensity ? 'bg-[#0284C7]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          displayPrefs.compactDensity ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11.5px] text-slate-600 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Accessibility Compliance:</strong> TRINAY interface elements conform to WCAG 2.1 AA accessibility guidelines, with ARIA landmark attributes, high-contrast text ratios, and keyboard focus outlines.
                </p>
              </div>
            </section>
          )}

          {/* ============================================================ */}
          {/* 7. Application Information */}
          {/* ============================================================ */}
          {shouldRenderSection('about') && (
            <section
              id="settings-about"
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl border border-sky-100">
                    <Info className="w-4.5 h-4.5 text-[#0284C7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Application Information
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Platform build version, AI inference engines &amp; clinical SaMD regulatory notice
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-sky-50 text-sky-700 rounded-lg border border-sky-200">
                  Clinical Release
                </span>
              </div>

              {/* Platform Banner */}
              <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl shadow-xs space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white p-1 flex items-center justify-center shrink-0">
                    <img src="/trinay_logo.png" alt="Trinay Logo" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold tracking-wide">
                      TRINAY
                    </h3>
                    <p className="text-xs text-sky-300 font-semibold tracking-wider">
                      AI FOR BETTER VISION • CLINICAL WORKSTATION
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-700/80 text-xs">
                  <div>
                    <p className="text-slate-400 text-[10.5px]">Platform Version</p>
                    <p className="font-bold text-white mt-0.5">v2.4.0-clinical</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10.5px]">Build Channel</p>
                    <p className="font-bold text-white mt-0.5">Production</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10.5px]">Runtime Framework</p>
                    <p className="font-bold text-white mt-0.5">React 19 / Vite 6</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10.5px]">Classification</p>
                    <p className="font-bold text-white mt-0.5">Class IIa SaMD</p>
                  </div>
                </div>
              </div>

              {/* AI Inference Architecture Specifications */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 text-xs">
                  AI Diagnostic Inference Engines
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Cpu className="w-3.5 h-3.5 text-[#0284C7]" />
                      <span>Diabetic Retinopathy</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      EfficientNet-B4 classification + Multi-Task UNet for microaneurysms, hemorrhages, exudates &amp; fovea localization.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Glaucoma VCDR</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      ResNet-50 deep optic disc and cup segmentation for Vertical Cup-to-Disc Ratio estimation &amp; ISNT rule analysis.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Cpu className="w-3.5 h-3.5 text-amber-600" />
                      <span>Cataract Classification</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      LOCS III compatible anterior segment classifier assessing nuclear, cortical &amp; subcapsular lens opacification.
                    </p>
                  </div>
                </div>
              </div>

              {/* Clinical Decision Support Regulatory Notice */}
              <div className="p-4 bg-amber-50/70 border border-amber-200/90 rounded-xl text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Clinical Decision Support System (CDSS) Regulatory Notice</span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-amber-900/90 font-normal">
                  TRINAY is an AI-assisted Clinical Decision Support System designed for trained healthcare workers and ophthalmologists. Automated lesion segmentations, severity predictions, and referral proposals are decision-support aids and do not substitute for formal clinical evaluation by a certified ophthalmologist.
                </p>
              </div>

              {/* Footer info */}
              <div className="pt-2 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100">
                <p>© 2026 TRINAY Tele-Ophthalmology Network. All rights reserved.</p>
                <p>Support: <span className="font-medium text-slate-700">support@trinay.org</span></p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
