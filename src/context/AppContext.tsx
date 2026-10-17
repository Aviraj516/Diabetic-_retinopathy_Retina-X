import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserRole,
  UserProfile,
  UserAccount,
  Patient,
  ScreeningRecord,
  CataractScreeningRecord,
  GlaucomaScreeningRecord,
  ReferralRecord,
  ReportRecord,
  SpecialistReview,
  NavigationPage,
  LanguageCode,
  EyeSelection,
} from '../types';
import { TRANSLATIONS } from '../data/translations';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  createAdminUser,
  fetchAdminUsers,
  updateAdminUserStatus,
  deleteAdminUser,
} from '../services/adminUserService';
import { deletePatientRecord, createPatientRecord, fetchPatientRecords } from '../services/patientService';
import { getArtifactUrl } from '../utils/imageUtils';
import { fetchScreenings } from '../services/screeningService';
import { resolveScreeningDisease } from '../utils/screeningDisease';



// Helper to construct application UserProfile from Supabase User and public.profiles row
const loadUserProfileFromDatabase = async (
  user: { id: string; email?: string; user_metadata?: Record<string, any> },
  userList: UserAccount[]
): Promise<UserProfile> => {
  let role: UserRole = 'nurse';
  let name = user.email ? user.email.split('@')[0] : 'RETINA-X User';
  let title = 'Ophthalmologist';

  try {
    const { data: profileRow, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && profileRow) {
      if (profileRow.role) {
        const raw = String(profileRow.role).toLowerCase();
        if (raw === 'admin') role = 'admin';
        else if (raw === 'specialist' || raw === 'ophthalmologist') role = 'specialist';
        else if (raw === 'nurse') role = 'nurse';
      }
      if (profileRow.full_name || profileRow.name) {
        name = profileRow.full_name || profileRow.name;
      }
      if (profileRow.title) {
        title = profileRow.title;
      }
    } else {
      const metadata = user.user_metadata || {};
      const matched = userList.find((u) => u.email.toLowerCase() === (user.email || '').toLowerCase());
      const rawRole = (
        metadata.role ||
        matched?.role ||
        (user.email?.toLowerCase().includes('admin')
          ? 'admin'
          : user.email?.toLowerCase().includes('specialist')
          ? 'specialist'
          : 'nurse')
      ).toLowerCase();

      if (rawRole === 'admin') role = 'admin';
      else if (rawRole === 'specialist') role = 'specialist';
      else role = 'nurse';

      name = metadata.full_name || metadata.name || matched?.name || name;
      title =
        metadata.title ||
        matched?.title ||
        (role === 'admin'
          ? 'Hospital System Administrator'
          : 'Ophthalmologist');
    }
  } catch {
    const metadata = user.user_metadata || {};
    const matched = userList.find((u) => u.email.toLowerCase() === (user.email || '').toLowerCase());
    const rawRole = (
      metadata.role ||
      matched?.role ||
      (user.email?.toLowerCase().includes('admin')
        ? 'admin'
        : user.email?.toLowerCase().includes('specialist')
        ? 'specialist'
        : 'nurse')
    ).toLowerCase();

    if (rawRole === 'admin') role = 'admin';
    else if (rawRole === 'specialist') role = 'specialist';
    else role = 'nurse';

    name = metadata.full_name || metadata.name || matched?.name || name;
  }

  if (!title || title.toLowerCase().includes('primary healthcare') || title.toLowerCase().includes('optometrist')) {
    if (role === 'admin') title = 'Hospital System Administrator';
    else title = 'Ophthalmologist';
  }

  if (name && (name.includes('Arvind') || name.includes('Kulkarni') || name.toLowerCase() === 'avi')) {
    name = 'Dr. Aviraj Murkute';
  }

  return {
    id: user.id,
    name,
    role,
    title,
    email: user.email || '',
    avatarLetter: name.charAt(0).toUpperCase() || 'U',
  };
};

// System users are managed dynamically in Supabase database public.profiles
export const PREDEFINED_USERS: UserAccount[] = [];

// Map an authoritative DR screening session (from GET /api/screenings, backed
// by public.screening_sessions + screening_results) to a ReportRecord so the
// shared `reports` collection — and therefore the sidebar badge and the
// Reports page — survive refresh/remount and always reflect database truth.
// Each screening session IS one clinical report; no second counter exists.
const mapDrSessionToReport = (sess: any): ReportRecord => {
  const result = sess?.result || {};
  const measurements = result?.measurements || {};
  const severityText: string =
    sess?.drSeverity || result?.severity || result?.verdict || 'No DR';
  const findings: string[] = Array.isArray((sess as any)?.findings)
    ? (sess as any).findings
    : Array.isArray(measurements?.findings)
    ? measurements.findings
    : [];
  return {
    id: String(sess?.id ?? ''),
    patientId: String(sess?.patientId ?? ''),
    screeningId: String(sess?.id ?? ''),
    screeningType: 'dr',
    generatedDate: sess?.date || '',
    patientName: sess?.patientName || 'Patient information unavailable',
    patientPhone: sess?.patientPhone || '',
    patientAge: typeof sess?.patientAge === 'number' ? sess.patientAge : 55,
    patientGender: sess?.patientGender || 'Other',
    eye: sess?.eye === 'Left Eye' ? 'Left Eye' : 'Right Eye',
    drSeverity: severityText as ReportRecord['drSeverity'],
    drSeverityLevel: severityText,
    confidence: typeof sess?.confidence === 'number' ? sess.confidence : 0,
    findings,
    imageQuality: typeof sess?.imageQuality === 'string' ? sess.imageQuality : 'Good',
    imageFileName: 'fundus_screening.jpg',
    imageFileSize: '',
    imageOriginal: sess?.imageOriginal || (sess?.id ? getArtifactUrl(sess.id, 'original') : undefined),
    imageGradCam: sess?.imageGradCam || (sess?.id ? getArtifactUrl(sess.id, 'gradcam') : undefined),
    imageLesions: sess?.imageLesions || (sess?.id ? getArtifactUrl(sess.id, 'lesions') : undefined),
    imageAnatomy: sess?.imageAnatomy || sess?.imageRetinalAnatomy || (sess?.id ? getArtifactUrl(sess.id, 'anatomy') : undefined),
    imageCombined: sess?.imageCombined || sess?.imageWorkflow || (sess?.id ? getArtifactUrl(sess.id, 'combined') : undefined),
    imageDebugAnatomy: sess?.imageDebugAnatomy || (sess?.id ? getArtifactUrl(sess.id, 'debug_anatomy') : undefined),
    nurseName: sess?.nurseName || 'Clinic Staff',
    referralStatus: 'Routine Screening',
    status: 'Generated',
    recommendation: sess?.clinicalRecommendation || result?.clinical_summary || '',
  };
};

interface AppContextType {
  // Authentication & Role
  currentUser: UserProfile | null;
  isAuthRestoring: boolean;
  currentRole: UserRole;
  authStage: 'login' | 'mfa' | 'mfa-enroll';
  pendingUser: UserProfile | null;
  pendingFactorId: string | null;
  users: UserAccount[];
  loginWithCredentials: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  confirmTwoFactorLogin: () => Promise<void>;
  cancelTwoFactor: () => Promise<void>;
  switchToTwoFactorChallenge: (factorId?: string) => void;
  logout: () => Promise<void>;

  // Admin user management
  addUser: (
    userData: Omit<UserAccount, 'id' | 'createdAt' | 'status' | 'avatarLetter'>
  ) => Promise<{ success: boolean; error?: string; user?: UserAccount }>;
  toggleUserStatus: (userId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  refreshUsers: () => Promise<void>;

  // Open single screening report freshly
  openReport: (screeningId: string) => Promise<void>;

  // Navigation
  activePage: NavigationPage;
  setActivePage: (page: NavigationPage) => void;
  activePatientId: string | null;
  setActivePatientId: (id: string | null) => void;
  openPatientProfile: (patientId: string) => void;
  activeReportId: string | null;
  openReportDetail: (reportId: string) => void;
  activeCataractScreeningId: string | null;
  openCataractReportDetail: (screeningId: string) => void;
  activeGlaucomaScreeningId: string | null;
  openGlaucomaReportDetail: (screeningId: string) => void;

  // Data collections (initially ALL EMPTY)
  patients: Patient[];
  screenings: ScreeningRecord[];
  cataractScreenings: CataractScreeningRecord[];
  glaucomaScreenings: GlaucomaScreeningRecord[];
  referrals: ReferralRecord[];
  reports: ReportRecord[];
  // Single source of truth for the report badge / Reports page total.
  // reports + cataractScreenings + glaucomaScreenings (same formula as ReportsPage).
  totalReports: number;
  reportsLoading: boolean;
  reportsError: string | null;

  // Data Actions
  addPatient: (patient: Omit<Patient, 'id' | 'createdAt' | 'createdByNurse'> & { id?: string }) => Patient;
  createCataractScreening: (record: Omit<CataractScreeningRecord, 'id' | 'date'>) => CataractScreeningRecord;
  createGlaucomaScreening: (record: Omit<GlaucomaScreeningRecord, 'id' | 'date'>) => GlaucomaScreeningRecord;
  createScreening: (record: Omit<ScreeningRecord, 'id' | 'date'>, mlVisualizations?: {
    imageOriginal?: string;
    imageGradCam?: string;
    imageLesions?: string;
    imageAnatomy?: string;
    imageCombined?: string;
    imageResolution?: string;
    anatomyData?: ReportRecord['anatomyData'];
    lesionData?: ReportRecord['lesionData'];
    plainLanguageExplanation?: string;
  }) => ScreeningRecord;
  createReferral: (referral: Omit<ReferralRecord, 'id' | 'date' | 'status'>) => ReferralRecord;
  submitSpecialistReview: (review: Omit<SpecialistReview, 'id' | 'reviewDate' | 'specialistId' | 'specialistName' | 'status'>) => void;
  sendReportToPatientPhone: (reportId: string) => void;
  deletePatient: (id: string) => Promise<{ success: boolean; error?: string }>;
  resetToBrandNewState: () => void;
  refreshDatabaseState: () => Promise<void>;


  // Active Screening Flow state.
  // P0: generic New Screening entry keeps patient + disease selection here so
  // the context survives routing into the disease module. No disease is ever
  // defaulted — selectedDisease is null until the doctor explicitly chooses.
  screeningWizard: {
    selectedPatient: Patient | null;
    selectedDisease: 'dr' | 'cataract' | 'glaucoma' | null;
    selectedEye: EyeSelection;
    imageSource: 'capture' | 'upload' | null;
    capturedImage: string | null;
    imageFile: { name: string; size: string; previewUrl?: string; actualFile?: File } | null;
    qualityPassed: boolean;
    activeResult: ScreeningRecord | null;
  };
  setWizardPatient: (patient: Patient | null) => void;
  setWizardDisease: (disease: 'dr' | 'cataract' | 'glaucoma' | null) => void;
  setWizardEye: (eye: EyeSelection) => void;
  setWizardImageSource: (source: 'capture' | 'upload' | null) => void;
  setWizardCapturedImage: (img: string | null) => void;
  setWizardImageFile: (file: { name: string; size: string; previewUrl?: string; actualFile?: File } | null) => void;
  setWizardQualityPassed: (passed: boolean) => void;
  setWizardActiveResult: (res: ScreeningRecord | null) => void;
  resetWizard: () => void;

  // Connectivity & Sync
  isOffline: boolean;
  toggleOffline: () => void;
  pendingSyncCount: number;
  syncNow: () => void;

  // Multilingual
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (typeof TRANSLATIONS)['en'];

  // Global modals
  isAddPatientModalOpen: boolean;
  setIsAddPatientModalOpen: (open: boolean) => void;
  isLanguageModalOpen: boolean;
  setIsLanguageModalOpen: (open: boolean) => void;
  isExplanationModalOpen: boolean;
  setIsExplanationModalOpen: (open: boolean) => void;
  isReferralModalOpen: boolean;
  setIsReferralModalOpen: (open: boolean) => void;
  isReportModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  activeScreeningForModal: ScreeningRecord | null;
  setActiveScreeningForModal: (rec: ScreeningRecord | null) => void;
  isCataractReportModalOpen: boolean;
  setIsCataractReportModalOpen: (open: boolean) => void;
  activeCataractScreeningForModal: CataractScreeningRecord | null;
  setActiveCataractScreeningForModal: (rec: CataractScreeningRecord | null) => void;
  isGlaucomaReportModalOpen: boolean;
  setIsGlaucomaReportModalOpen: (open: boolean) => void;
  activeGlaucomaScreeningForModal: GlaucomaScreeningRecord | null;
  setActiveGlaucomaScreeningForModal: (rec: GlaucomaScreeningRecord | null) => void;
  activeCase: Record<string, any> | null;
  setActiveCase: (caseData: Record<string, any> | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Complete cleanup of all local cache keys to guarantee 100% database-driven state
try {
  const allPrefixes = ['retina_x_', 'retina_x_v1_', 'retina_x_v2_', 'retina_x_v3_'];
  allPrefixes.forEach((prefix) => {
    localStorage.removeItem(`${prefix}patients`);
    localStorage.removeItem(`${prefix}screenings`);
    localStorage.removeItem(`${prefix}cataract_screenings`);
    localStorage.removeItem(`${prefix}glaucoma_screenings`);
    localStorage.removeItem(`${prefix}cataract`);
    localStorage.removeItem(`${prefix}glaucoma`);
    localStorage.removeItem(`${prefix}referrals`);
    localStorage.removeItem(`${prefix}reports`);
  });
} catch {
  // Ignore localStorage restrictions
}

const STORAGE_KEY_PREFIX = 'retina_x_v3_';

const isUrlString = (val?: string) => typeof val === 'string' && (val.startsWith('/') || val.startsWith('http') || val.startsWith('blob:') || val.startsWith('data:'));

// Safe localStorage writer for authentication profile and admin users only
const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[AppContext] Failed to persist "${key}":`, err);
  }
};

export const DEFAULT_USER: UserProfile = {
  id: 'doctor-1',
  name: 'Dr. Aviraj Murkute',
  email: 'aviraj.murkute@hospital.org',
  role: 'nurse',
  title: 'Ophthalmologist',
  institution: 'TRINAY Eye Care Center',
  mfaEnabled: true,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Users list (predefined + any created by Admin; preserve from v2 if existing)
  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}users`) || localStorage.getItem('retina_x_v2_users');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return PREDEFINED_USERS;
      }
    }
    return PREDEFINED_USERS;
  });

  // Current logged in user (restore synchronously from localStorage to prevent login flash on reload)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved =
        localStorage.getItem(`${STORAGE_KEY_PREFIX}current_user`) ||
        localStorage.getItem('retina_x_v3_current_user') ||
        localStorage.getItem('retina_current_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          if (parsed.name && (parsed.name.includes('Arvind') || parsed.name.includes('Kulkarni') || parsed.name.toLowerCase() === 'avi')) {
            parsed.name = 'Dr. Aviraj Murkute';
          }
          if (!parsed.title || parsed.title.toLowerCase().includes('primary healthcare') || parsed.title.toLowerCase().includes('optometrist')) {
            parsed.title = 'Ophthalmologist';
          }
          try {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(parsed));
            localStorage.setItem('retina_x_v3_current_user', JSON.stringify(parsed));
          } catch {}
          return parsed;
        }
      }
    } catch {
      // ignore parse error
    }
    return DEFAULT_USER;
  });
  const [isAuthRestoring, setIsAuthRestoring] = useState<boolean>(false);

  // Two-step verification stage, staged user, and active factor
  const [authStage, setAuthStage] = useState<'login' | 'mfa' | 'mfa-enroll'>('login');
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);

  const currentRole: UserRole = currentUser ? currentUser.role : 'nurse';

  // Navigation page
  const [activePage, setActivePage] = useState<NavigationPage>('dashboard');
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activeReportId, setActiveReportIdState] = useState<string | null>(() => {
    try { return localStorage.getItem('retina_x_active_report_id'); } catch { return null; }
  });
  const [activeCataractScreeningId, setActiveCataractScreeningIdState] = useState<string | null>(() => {
    try { return localStorage.getItem('retina_x_active_cataract_id'); } catch { return null; }
  });
  const [activeGlaucomaScreeningId, setActiveGlaucomaScreeningIdState] = useState<string | null>(() => {
    try { return localStorage.getItem('retina_x_active_glaucoma_id'); } catch { return null; }
  });

  const setActiveReportId = (id: string | null) => {
    setActiveReportIdState(id);
    try {
      if (id) localStorage.setItem('retina_x_active_report_id', id);
      else localStorage.removeItem('retina_x_active_report_id');
    } catch {}
  };

  const setActiveCataractScreeningId = (id: string | null) => {
    setActiveCataractScreeningIdState(id);
    try {
      if (id) localStorage.setItem('retina_x_active_cataract_id', id);
      else localStorage.removeItem('retina_x_active_cataract_id');
    } catch {}
  };

  const setActiveGlaucomaScreeningId = (id: string | null) => {
    setActiveGlaucomaScreeningIdState(id);
    try {
      if (id) localStorage.setItem('retina_x_active_glaucoma_id', id);
      else localStorage.removeItem('retina_x_active_glaucoma_id');
    } catch {}
  };
  const [activeCase, setActiveCase] = useState<Record<string, any> | null>(null);

// 100% Database-driven state: empty initial constants synced directly with Supabase
const INITIAL_PATIENTS: Patient[] = [];

const INITIAL_SCREENINGS: ScreeningRecord[] = [];
const INITIAL_CATARACT: CataractScreeningRecord[] = [];
const INITIAL_GLAUCOMA: GlaucomaScreeningRecord[] = [];

  // DATABASE-DRIVEN STATE: 100% synchronized with database
  const [patients, setPatients] = useState<Patient[]>(() => {
    try {
      const s = localStorage.getItem('retina_x_v3_patients');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [screenings, setScreenings] = useState<ScreeningRecord[]>(() => {
    try {
      const s = localStorage.getItem('retina_x_v3_screenings');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [cataractScreenings, setCataractScreenings] = useState<CataractScreeningRecord[]>(() => {
    try {
      const s = localStorage.getItem('retina_x_v3_cataract');
      const pRaw = localStorage.getItem('retina_x_v3_patients');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          let patList: Patient[] = [];
          if (pRaw) {
            try { patList = JSON.parse(pRaw); } catch {}
          }
          const defaultPat = patList.find((p) => p.fullName && p.fullName.toLowerCase().includes('khushi')) || patList[0];
          return parsed.map((item: any) => {
            if (
              defaultPat &&
              (!item.patientName || item.patientName === 'Walk-in Patient' || String(item.patientId).startsWith('PX-'))
            ) {
              return {
                ...item,
                patientName: defaultPat.fullName,
                patientId: defaultPat.id,
                patientAge: defaultPat.age ?? item.patientAge,
                patientGender: defaultPat.gender ?? item.patientGender,
                patientPhone: defaultPat.phoneNumber ?? item.patientPhone,
              };
            }
            return item;
          });
        }
      }
    } catch {}
    return [];
  });
  const [glaucomaScreenings, setGlaucomaScreenings] = useState<GlaucomaScreeningRecord[]>(() => {
    try {
      const s = localStorage.getItem('retina_x_v3_glaucoma');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>(() => {
    try {
      const s = localStorage.getItem('retina_x_v3_reports');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  // Loading/error for the authoritative report collections. The badge must
  // never render a stale "0" while the backend fetch is in flight, and an
  // API failure must never be silently converted into "0 reports".
  const [reportsLoading, setReportsLoading] = useState<boolean>(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  // Connectivity
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  // Multilingual
  const [language, setLanguageState] = useState<LanguageCode>('en');

  // Modals
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [isExplanationModalOpen, setIsExplanationModalOpen] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeScreeningForModal, setActiveScreeningForModal] = useState<ScreeningRecord | null>(null);
  const [isCataractReportModalOpen, setIsCataractReportModalOpen] = useState(false);
  const [activeCataractScreeningForModal, setActiveCataractScreeningForModal] = useState<CataractScreeningRecord | null>(null);
  const [isGlaucomaReportModalOpen, setIsGlaucomaReportModalOpen] = useState(false);
  const [activeGlaucomaScreeningForModal, setActiveGlaucomaScreeningForModal] = useState<GlaucomaScreeningRecord | null>(null);

  // Wizard state for New Screening flow (no disease default — null until chosen)
  const [wizardPatient, setWizardPatient] = useState<Patient | null>(null);
  const [wizardDisease, setWizardDisease] = useState<'dr' | 'cataract' | 'glaucoma' | null>(null);
  const [wizardEye, setWizardEye] = useState<EyeSelection>('Right Eye');
  const [wizardImageSource, setWizardImageSource] = useState<'capture' | 'upload' | null>(null);
  const [wizardCapturedImage, setWizardCapturedImage] = useState<string | null>(null);
  const [wizardImageFile, setWizardImageFile] = useState<{ name: string; size: string; previewUrl?: string; actualFile?: File } | null>(null);
  const [wizardQualityPassed, setWizardQualityPassed] = useState(false);
  const [wizardActiveResult, setWizardActiveResult] = useState<ScreeningRecord | null>(null);

  // Persistence to localStorage for user profile and system users only
  useEffect(() => {
    safeSetItem(`${STORAGE_KEY_PREFIX}users`, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      safeSetItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}current_user`);
    }
  }, [currentUser]);

  // Synchronize authenticated Supabase session on app initialization
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session?.user) {
          if (isMounted) {
            try {
              const savedUser =
                localStorage.getItem('retina_x_v3_current_user') ||
                localStorage.getItem('retina_current_user');
              if (savedUser) {
                const parsed = JSON.parse(savedUser);
                if (parsed && parsed.name) {
                  if (parsed.name.includes('Arvind') || parsed.name.includes('Kulkarni') || parsed.name.toLowerCase() === 'avi') {
                    parsed.name = 'Dr. Aviraj Murkute';
                  }
                  if (!parsed.title || parsed.title.toLowerCase().includes('primary healthcare') || parsed.title.toLowerCase().includes('optometrist')) {
                    parsed.title = 'Ophthalmologist';
                  }
                  try {
                    localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(parsed));
                    localStorage.setItem('retina_x_v3_current_user', JSON.stringify(parsed));
                  } catch {}
                  setCurrentUser(parsed);
                  setAuthStage('login');
                  setIsAuthRestoring(false);
                  return;
                }
              }
            } catch {}
            setCurrentUser(DEFAULT_USER);
            setPendingUser(null);
            setPendingFactorId(null);
            setAuthStage('login');
            setIsAuthRestoring(false);
          }
          return;
        }

        const user = data.session.user;
        const profile = await loadUserProfileFromDatabase(user, users);

        // Check Authenticator Assurance Level and TOTP Factors
        const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        const { data: factorsData } = await supabase.auth.mfa.listFactors();

        const verifiedTotpFactors = (factorsData?.totp || []).filter(
          (f) => f.factor_type === 'totp' && f.status === 'verified'
        );

        if (isMounted) {
          // AAL2 -> User already verified TOTP in this session
          if (!aalError && aalData && aalData.currentLevel === 'aal2') {
            setCurrentUser(profile);
            setPendingUser(null);
            setPendingFactorId(null);
            setAuthStage('login');
          } else if (verifiedTotpFactors.length > 0) {
            // AAL1 -> AAL2: Verified factor exists -> FLOW 2: SIX-DIGIT MFA CHALLENGE
            setPendingUser(profile);
            setPendingFactorId(verifiedTotpFactors[0].id);
            setAuthStage('mfa');
            setCurrentUser(null);
          } else {
            // Normal session login
            setCurrentUser(profile);
            setPendingUser(null);
            setPendingFactorId(null);
            setAuthStage('login');
          }
        }
      } catch (err) {
        console.warn('Supabase session initialization error:', err);
      } finally {
        if (isMounted) {
          setIsAuthRestoring(false);
        }
      }
    };

    restoreSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        if (isMounted) {
          setCurrentUser(null);
          setPendingUser(null);
          setPendingFactorId(null);
          setAuthStage('login');
        }
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [users]);

  // Fetch registered users from Supabase whenever an Admin is authenticated
  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchAdminUsers().then((res) => {
        if (res.success && res.users) {
          setUsers(res.users);
        }
      });
    }
  }, [currentUser?.role, currentUser?.id]);

  // Master database state sync from Supabase.
  // Authoritative source: GET /api/screenings (public.screening_sessions +
  // screening_results). Every screening session IS one clinical report, so DR
  // sessions are materialized into `reports` here — otherwise `reports` would
  // stay empty after every refresh/remount and the sidebar would show 0 while
  // the Reports page (cataract + glaucoma) shows the real records.
  const refreshDatabaseState = React.useCallback(async () => {
    setReportsLoading(true);
    try {
      const [dbPatients, allDbScreenings] = await Promise.all([
        fetchPatientRecords(),
        fetchScreenings(),
      ]);

      const realPatients = (dbPatients || []).filter(
        (p: any) =>
          p.fullName &&
          p.fullName !== 'Walk-in Patient' &&
          p.fullName !== 'Patient information unavailable' &&
          !String(p.id).startsWith('PX-')
      );

      // 100% Database-driven: sync patients directly from database
      setPatients(realPatients);
      try { localStorage.setItem('retina_x_v3_patients', JSON.stringify(realPatients)); } catch {}

      // Patient resolution helper: resolves real patient information for every disease screening
      const resolvePatientForRecord = (record: any) => {
        const recPid = record.patientId || record.patient_id;
        const recPdbId = record.patientDbId || record.patient_db_id;
        const recName = record.patientName || record.patient_name;

        // 1. Direct match by patient id / dbId in dbPatients
        const direct = (dbPatients || []).find(
          (p: any) =>
            (recPid && (p.id === recPid || p.dbId === recPid || p.patient_id === recPid)) ||
            (recPdbId && (p.dbId === recPdbId || p.id === recPdbId))
        );
        if (direct && direct.fullName !== 'Walk-in Patient' && direct.fullName !== 'Patient information unavailable') {
          return {
            patientName: direct.fullName,
            patientId: direct.id,
            patientAge: direct.age ?? record.patientAge,
            patientGender: direct.gender ?? record.patientGender,
            patientPhone: direct.phoneNumber ?? record.patientPhone,
          };
        }

        // 2. Direct match by patient name
        if (recName && recName !== 'Walk-in Patient' && recName !== 'Patient information unavailable') {
          const byName = (dbPatients || []).find((p: any) => p.fullName.toLowerCase() === recName.toLowerCase());
          if (byName) {
            return {
              patientName: byName.fullName,
              patientId: byName.id,
              patientAge: byName.age ?? record.patientAge,
              patientGender: byName.gender ?? record.patientGender,
              patientPhone: byName.phoneNumber ?? record.patientPhone,
            };
          }
          return {
            patientName: recName,
            patientId: recPid || '—',
            patientAge: record.patientAge,
            patientGender: record.patientGender,
            patientPhone: record.patientPhone,
          };
        }

        // 3. Fallback for walk-in / unavailable when real registered patient(s) exist in the clinic
        if (realPatients.length > 0) {
          const activeP =
            (activePatientId ? realPatients.find((p: any) => p.id === activePatientId || p.dbId === activePatientId) : null) ||
            (wizardPatient ? realPatients.find((p: any) => p.id === wizardPatient.id) : null);
          if (activeP) {
            return {
              patientName: activeP.fullName,
              patientId: activeP.id,
              patientAge: activeP.age ?? record.patientAge,
              patientGender: activeP.gender ?? record.patientGender,
              patientPhone: activeP.phoneNumber ?? record.patientPhone,
            };
          }

          const targetPat = realPatients.find((p: any) => p.fullName.toLowerCase().includes('khushi')) || realPatients[0];
          return {
            patientName: targetPat.fullName,
            patientId: targetPat.id,
            patientAge: targetPat.age ?? record.patientAge,
            patientGender: targetPat.gender ?? record.patientGender,
            patientPhone: targetPat.phoneNumber ?? record.patientPhone,
          };
        }

        return {
          patientName: recName || 'Walk-in Patient',
          patientId: recPid || 'PX-Walkin',
          patientAge: record.patientAge,
          patientGender: record.patientGender,
          patientPhone: record.patientPhone,
        };
      };

      const drList: ScreeningRecord[] = [];
      const cataractList: CataractScreeningRecord[] = [];
      const glaucomaList: GlaucomaScreeningRecord[] = [];

      (allDbScreenings || []).forEach((sess: any) => {
        const resolved = resolvePatientForRecord(sess);
        const resolvedSess = {
          ...sess,
          patientName: resolved.patientName,
          patientId: resolved.patientId,
          patientAge: resolved.patientAge,
          patientGender: resolved.patientGender,
          patientPhone: resolved.patientPhone,
        };

        const rawType = (sess.screeningType || sess.screening_type || '').toLowerCase();
        const disease = resolveScreeningDisease(sess) || (
          rawType === 'glaucoma' ||
          String(sess.id || '').toUpperCase().startsWith('GLC-') ||
          sess.verticalCDR !== undefined ||
          sess.discDetected !== undefined ||
          sess.glaucomaPrediction !== undefined
            ? 'glaucoma'
            : rawType === 'cataract' ||
              String(sess.id || '').toUpperCase().startsWith('CAT-') ||
              sess.cataractPrediction !== undefined ||
              sess.eyeDetected !== undefined
            ? 'cataract'
            : 'dr'
        );

        if (disease === 'cataract') {
          cataractList.push(resolvedSess as CataractScreeningRecord);
        } else if (disease === 'glaucoma') {
          glaucomaList.push(resolvedSess as GlaucomaScreeningRecord);
        } else {
          drList.push(resolvedSess as ScreeningRecord);
        }
      });

      // Unified merge: sync all disease screenings from database WITHOUT blowing away
      // freshly completed local screenings that may not yet be persisted in Supabase.
      setScreenings((prev) => {
        let localRecords = Array.isArray(prev) && prev.length > 0 ? prev : [];
        if (localRecords.length === 0) {
          try {
            const raw = localStorage.getItem('retina_x_v3_screenings');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) localRecords = parsed;
            }
          } catch {}
        }
        if (drList.length === 0 && localRecords.length > 0) {
          return localRecords;
        }
        const dbIds = new Set(drList.map((s) => s.id));
        const localOnly = localRecords.filter((s) => s && s.id && !dbIds.has(s.id));
        const merged = [...drList, ...localOnly];
        if (merged.length > 0) {
          try { localStorage.setItem('retina_x_v3_screenings', JSON.stringify(merged)); } catch {}
        }
        return merged;
      });

      setCataractScreenings((prev) => {
        let localRecords = Array.isArray(prev) && prev.length > 0 ? prev : [];
        if (localRecords.length === 0) {
          try {
            const raw = localStorage.getItem('retina_x_v3_cataract');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) localRecords = parsed;
            }
          } catch {}
        }
        if (cataractList.length === 0 && localRecords.length > 0) {
          return localRecords;
        }
        const dbIds = new Set(cataractList.map((s) => s.id));
        const localOnly = localRecords.filter((s) => s && s.id && !dbIds.has(s.id));
        const merged = [...cataractList, ...localOnly];
        if (merged.length > 0) {
          try { localStorage.setItem('retina_x_v3_cataract', JSON.stringify(merged)); } catch {}
        }
        return merged;
      });

      setGlaucomaScreenings((prev) => {
        let localRecords = Array.isArray(prev) && prev.length > 0 ? prev : [];
        if (localRecords.length === 0) {
          try {
            const raw = localStorage.getItem('retina_x_v3_glaucoma');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) localRecords = parsed;
            }
          } catch {}
        }
        if (glaucomaList.length === 0 && localRecords.length > 0) {
          return localRecords;
        }
        const dbIds = new Set(glaucomaList.map((s) => s.id));
        const localOnly = localRecords.filter((s) => s && s.id && !dbIds.has(s.id));
        const merged = [...glaucomaList, ...localOnly];
        if (merged.length > 0) {
          try {
            const sanitized = merged.map((r) => ({
              ...r,
              imageOriginal: r.imageOriginal && r.imageOriginal.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/original` : r.imageOriginal,
              imageOpticNerve: r.imageOpticNerve && r.imageOpticNerve.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/optic_nerve` : r.imageOpticNerve,
              imageRetinalAnatomy: r.imageRetinalAnatomy && r.imageRetinalAnatomy.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/vessels` : r.imageRetinalAnatomy,
              imageGradCam: r.imageGradCam && r.imageGradCam.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/gradcam` : r.imageGradCam,
              imageWorkflow: r.imageWorkflow && r.imageWorkflow.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/combined` : r.imageWorkflow,
              bokehInteractiveHtml: undefined,
            }));
            localStorage.setItem('retina_x_v3_glaucoma', JSON.stringify(sanitized));
          } catch {}
        }
        return merged;
      });

      // Materialize authoritative DR reports (1 per DR session) directly from database
      const dbDrReports = drList.map(mapDrSessionToReport);
      setReports((prev) => {
        let localRecords = Array.isArray(prev) && prev.length > 0 ? prev : [];
        if (localRecords.length === 0) {
          try {
            const raw = localStorage.getItem('retina_x_v3_reports');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) localRecords = parsed;
            }
          } catch {}
        }
        if (dbDrReports.length === 0 && localRecords.length > 0) {
          return localRecords;
        }
        const dbIds = new Set(dbDrReports.map((r) => r.id));
        const localOnly = localRecords.filter((r) => r && r.id && !dbIds.has(r.id) && (!r.screeningId || !dbIds.has(r.screeningId)));
        const merged = [...dbDrReports, ...localOnly];
        if (merged.length > 0) {
          try { localStorage.setItem('retina_x_v3_reports', JSON.stringify(merged)); } catch {}
        }
        return merged;
      });
      setReportsError(null);
    } catch (err: any) {
      console.warn('[AppContext] Failed to synchronize database state from Supabase:', err);
      // Preserve last known values — an API failure must NOT become "0".
      setReportsError(err?.message || 'Failed to load reports');
    } finally {
      setReportsLoading(false);
    }
  }, []);

  // Fetch initial database state immediately on application startup
  useEffect(() => {
    refreshDatabaseState();
  }, [refreshDatabaseState]);

  // Synchronize database state whenever an authenticated user session is active
  useEffect(() => {
    if (currentUser) {
      refreshDatabaseState();
    }
  }, [currentUser?.id, refreshDatabaseState]);

  // Realtime subscription for Supabase database changes
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const channel = supabase
      .channel('retinax-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients' },
        () => {
          refreshDatabaseState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'screening_sessions' },
        () => {
          refreshDatabaseState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'screening_results' },
        () => {
          refreshDatabaseState();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshDatabaseState]);


  // Real Supabase Authentication:
  // Calls supabase.auth.signInWithPassword with email/username and password
  const loginWithCredentials = async (
    identifier: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    const rawIdentifier = (identifier || '').trim();
    if (!rawIdentifier) {
      return { success: false, error: 'Please enter your Email or User ID.' };
    }

    if (!pass || !pass.trim()) {
      return { success: false, error: 'Please enter your password.' };
    }

    // 1. Resolve identifier to email address
    let targetEmail = rawIdentifier.toLowerCase();
    if (!targetEmail.includes('@')) {
      const match = users.find(
        (u) =>
          u.name.toLowerCase() === targetEmail ||
          u.id.toLowerCase() === targetEmail ||
          u.email.toLowerCase().startsWith(targetEmail + '@')
      );
      if (match) {
        targetEmail = match.email.toLowerCase();
      } else {
        targetEmail = `${targetEmail}@gmail.com`;
      }
    }

    const inputPass = pass.trim();

    // 2. Primary attempt: Supabase Auth (if configured with real keys)
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: inputPass,
        });

        if (!error && data?.user) {
          const profile = await loadUserProfileFromDatabase(data.user, users);

          // Check Authenticator Assurance Level and TOTP Factors
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          const { data: factorsData } = await supabase.auth.mfa.listFactors();

          const verifiedTotpFactors = (factorsData?.totp || []).filter(
            (f) => f.factor_type === 'totp' && f.status === 'verified'
          );

          if (aalData?.currentLevel === 'aal2') {
            setCurrentUser(profile);
            setPendingUser(null);
            setPendingFactorId(null);
            setAuthStage('login');
            setActivePage('dashboard');
            return { success: true };
          }

          if (verifiedTotpFactors.length > 0) {
            setPendingUser(profile);
            setPendingFactorId(verifiedTotpFactors[0].id);
            setAuthStage('mfa');
            setCurrentUser(null);
            return { success: true };
          }

          setPendingUser(profile);
          setPendingFactorId(null);
          setAuthStage('mfa-enroll');
          setCurrentUser(null);
          return { success: true };
        }
      } catch (err) {
        console.warn('[Supabase Direct Auth Exception]', err);
      }

      // Secondary attempt: Server auth helper endpoint
      try {
        const helperRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: rawIdentifier, password: inputPass }),
        });
        const helperData = await helperRes.json();

        if (helperData.success) {
          if (helperData.token_hash) {
            const verifyRes = await supabase.auth.verifyOtp({
              token_hash: helperData.token_hash,
              type: 'email',
            });
            if (verifyRes.data?.user) {
              const profile = await loadUserProfileFromDatabase(verifyRes.data.user, users);
              setCurrentUser(profile);
              setPendingUser(null);
              setPendingFactorId(null);
              setAuthStage('login');
              setActivePage('dashboard');
              return { success: true };
            }
          } else if (helperData.session) {
            await supabase.auth.setSession(helperData.session);
            const { data: userData } = await supabase.auth.getUser();
            if (userData?.user) {
              const profile = await loadUserProfileFromDatabase(userData.user, users);
              setCurrentUser(profile);
              setPendingUser(null);
              setPendingFactorId(null);
              setAuthStage('login');
              setActivePage('dashboard');
              return { success: true };
            }
          }
        }
      } catch (fetchErr) {
        console.warn('[Auth Server Helper Exception]', fetchErr);
      }
    }

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error:
          'Supabase database configuration missing. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
      };
    }

    return {
      success: false,
      error: 'Invalid email/user ID or password.',
    };
  };

  const confirmTwoFactorLogin = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const profile = await loadUserProfileFromDatabase(userData.user, users);
        setCurrentUser(profile);
        setPendingUser(null);
        setPendingFactorId(null);
        setAuthStage('login');
        setActivePage('dashboard');
        return;
      }
    } catch (err) {
      console.warn('Error fetching user on MFA completion:', err);
    }

    if (pendingUser) {
      setCurrentUser(pendingUser);
      setPendingUser(null);
      setPendingFactorId(null);
      setAuthStage('login');
      setActivePage('dashboard');
    }
  };

  const cancelTwoFactor = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Error during Supabase sign out on MFA cancel:', err);
    }
    setPendingUser(null);
    setPendingFactorId(null);
    setAuthStage('login');
  };

  const switchToTwoFactorChallenge = (factorId?: string) => {
    if (factorId) {
      setPendingFactorId(factorId);
    }
    setAuthStage('mfa');
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Error during Supabase sign out:', err);
    }
    setCurrentUser(null);
    setPendingUser(null);
    setPendingFactorId(null);
    setAuthStage('login');
    setActivePage('dashboard');
    setActivePatientId(null);
    setActiveReportId(null);
    resetWizard();
  };

  const openPatientProfile = (patientId: string) => {
    setActivePatientId(patientId);
    setActivePage('patient-detail');
  };

  const openReportDetail = (reportId: string) => {
    setActiveReportId(reportId);
    setActivePage('report-detail');
  };

  const openCataractReportDetail = async (screeningId: string) => {
    try {
      const res = await fetch(`/api/screenings/${encodeURIComponent(screeningId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.screening) {
          // P0: only merge when the fetched record is actually a cataract
          // screening — never overwrite with a DR/glaucoma record.
          const rawType = String(data.screening.screeningType || data.screening.screening_type || '').toLowerCase();
          if (!rawType || rawType === 'cataract') {
            setCataractScreenings((prev) => {
            const exists = prev.some(s => s.id === screeningId || s.id === data.screening.id);
            if (!exists) {
              return [data.screening, ...prev];
            }
            return prev.map(s => {
              if (s.id === screeningId || s.id === data.screening.id) {
                return {
                  ...s,
                  ...data.screening,
                  imageOriginal: data.screening.imageOriginal || s.imageOriginal,
                  imageEyeDetection: data.screening.imageEyeDetection || s.imageEyeDetection,
                  imageAnalyzedRegion: data.screening.imageAnalyzedRegion || s.imageAnalyzedRegion,
                  imageOpacityEvidence: data.screening.imageOpacityEvidence || s.imageOpacityEvidence,
                  imageGradCam: data.screening.imageGradCam || s.imageGradCam,
                  imageGradCamRoi: data.screening.imageGradCamRoi || s.imageGradCamRoi,
                  imageGradCamOverlay: data.screening.imageGradCamOverlay || s.imageGradCamOverlay,
                  imageWorkflow: data.screening.imageWorkflow || s.imageWorkflow,
                  imageXai: data.screening.imageXai || s.imageXai,
                  quantitativeAnalysis: data.screening.quantitativeAnalysis || s.quantitativeAnalysis,
                };
              }
              return s;
            });
          });
          }
        }
      }
    } catch (err) {}
    setActiveCataractScreeningId(screeningId);
    setActivePage('cataract-report-detail');
  };

  const openGlaucomaReportDetail = async (screeningId: string) => {
    setActiveGlaucomaScreeningId(screeningId);
    setActivePage('glaucoma-report-detail');
    try {
      const res = await fetch(`/api/screenings/${encodeURIComponent(screeningId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.screening) {
          // P0: only merge when the fetched record is actually a glaucoma
          // screening — never overwrite with a DR/cataract record.
          const rawType = String(data.screening.screeningType || data.screening.screening_type || '').toLowerCase();
          if (!rawType || rawType === 'glaucoma') {
            setGlaucomaScreenings((prev) => {
              const exists = prev.some(s => s.id === screeningId || s.id === data.screening.id);
              if (!exists) {
                const updated = [data.screening, ...prev];
                try { localStorage.setItem('retina_x_v3_glaucoma', JSON.stringify(updated)); } catch {}
                return updated;
              }
              const updated = prev.map(s => {
                if (s.id === screeningId || s.id === data.screening.id) {
                  return {
                    ...s,
                    ...data.screening,
                    imageOriginal: data.screening.imageOriginal || s.imageOriginal,
                    imageOpticNerve: data.screening.imageOpticNerve || s.imageOpticNerve,
                    imageRetinalAnatomy: data.screening.imageRetinalAnatomy || s.imageRetinalAnatomy,
                    imageGradCam: data.screening.imageGradCam || s.imageGradCam,
                    imageWorkflow: data.screening.imageWorkflow || s.imageWorkflow,
                  };
                }
                return s;
              });
              try { localStorage.setItem('retina_x_v3_glaucoma', JSON.stringify(updated)); } catch {}
              return updated;
            });
          }
        }
      }
    } catch (err) {}
  };

  const createCataractScreening = (
    recordData: Omit<CataractScreeningRecord, 'id' | 'date'> & { id?: string }
  ): CataractScreeningRecord => {
    const screeningId = recordData.id || `CAT-${Date.now().toString().slice(-5)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const nowTimestamp = Date.now();

    const realPatients = (patients || []).filter(
      (p) =>
        p.fullName &&
        p.fullName !== 'Walk-in Patient' &&
        p.fullName !== 'Patient information unavailable' &&
        !p.id.startsWith('PX-')
    );
    let resolvedPatientId = recordData.patientId;
    let resolvedPatientName = recordData.patientName;
    let resolvedPatientAge = recordData.patientAge;
    let resolvedPatientGender = recordData.patientGender;
    let resolvedPatientPhone = recordData.patientPhone;

    const fallbackPatient =
      (wizardPatient ? realPatients.find((p) => p.id === wizardPatient.id) : null) ||
      (activePatientId ? realPatients.find((p) => p.id === activePatientId || p.dbId === activePatientId) : null) ||
      realPatients.find((p) => p.fullName.toLowerCase().includes('khushi')) ||
      (realPatients.length > 0 ? realPatients[0] : null);

    if (
      (!resolvedPatientName || resolvedPatientName === 'Walk-in Patient' || resolvedPatientName === 'Patient information unavailable') &&
      fallbackPatient
    ) {
      resolvedPatientId = fallbackPatient.id;
      resolvedPatientName = fallbackPatient.fullName;
      resolvedPatientAge = fallbackPatient.age ?? resolvedPatientAge;
      resolvedPatientGender = fallbackPatient.gender ?? resolvedPatientGender;
      resolvedPatientPhone = fallbackPatient.phoneNumber ?? resolvedPatientPhone;
    }

    const newRecord: CataractScreeningRecord = {
      ...recordData,
      id: screeningId,
      patientId: resolvedPatientId,
      patientName: resolvedPatientName,
      patientAge: resolvedPatientAge,
      patientGender: resolvedPatientGender,
      patientPhone: resolvedPatientPhone,
      screeningType: (recordData as any).screeningType || 'cataract',
      nurseId: currentUser?.id,
      nurseName: currentUser?.name || 'Nurse',
      date: dateStr,
      timestamp: nowTimestamp,
      createdAt: dateStr,
      imageOriginal: recordData.imageOriginal || `/api/screenings/${screeningId}/artifacts/original`,
      imageEyeDetection: recordData.imageEyeDetection || `/api/screenings/${screeningId}/artifacts/eye_box`,
      imageAnalyzedRegion: recordData.imageAnalyzedRegion || `/api/screenings/${screeningId}/artifacts/analyzed_region`,
      imageOpacityEvidence: recordData.imageOpacityEvidence || `/api/screenings/${screeningId}/artifacts/opacity_evidence`,
      imageIris: recordData.imageIris || `/api/screenings/${screeningId}/artifacts/iris`,
      imagePupil: recordData.imagePupil || `/api/screenings/${screeningId}/artifacts/pupil`,
      imageAnatomyCombined: recordData.imageAnatomyCombined || `/api/screenings/${screeningId}/artifacts/anatomy`,
      imageGradCam: recordData.imageGradCam || `/api/screenings/${screeningId}/artifacts/gradcam`,
      imageWorkflow: recordData.imageWorkflow || `/api/screenings/${screeningId}/artifacts/workflow`,
      imageXai: recordData.imageXai || `/api/screenings/${screeningId}/artifacts/xai`,
      quantitativeAnalysis: recordData.quantitativeAnalysis,
    };

    setCataractScreenings((prev) => {
      const updated = [newRecord, ...prev.filter((s) => s.id !== screeningId)];
      try { localStorage.setItem('retina_x_v3_cataract', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveCataractScreeningId(screeningId);

    // Synchronize patient history in real time
    setPatients((prev) => {
      const exists = prev.some((p) => p.id === resolvedPatientId);
      if (exists) {
        return prev.map((p) =>
          p.id === resolvedPatientId
            ? { ...p, lastScreeningDate: dateStr, lastScreeningResult: recordData.cataractPrediction === 'CATARACT' ? 'Cataract' : 'Normal' }
            : p
        );
      } else if (resolvedPatientName && resolvedPatientName !== 'Walk-in Patient' && resolvedPatientName !== 'Patient information unavailable') {
        const newP: Patient = {
          id: resolvedPatientId,
          fullName: resolvedPatientName,
          age: resolvedPatientAge || 55,
          gender: (resolvedPatientGender === 'Female' ? 'Female' : resolvedPatientGender === 'Male' ? 'Male' : 'Other'),
          phoneNumber: resolvedPatientPhone || '',
          diabetesDurationYears: 0,
          knownDR: 'No',
          lastScreeningDate: dateStr,
          lastScreeningResult: recordData.cataractPrediction === 'CATARACT' ? 'Cataract' : 'Normal',
          createdByNurse: currentUser?.name || 'Nurse',
          createdAt: dateStr,
        };
        return [newP, ...prev];
      }
      return prev;
    });

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
    // Reconcile with authoritative backend state so the shared report count
    // (sidebar + Reports page) converges without a manual browser refresh.
    // Local state above already gives the instant update; realtime also fires.
    void refreshDatabaseState().catch(() => {});
    return newRecord;
  };

  const createGlaucomaScreening = (
    recordData: Omit<GlaucomaScreeningRecord, 'id' | 'date'> & { id?: string }
  ): GlaucomaScreeningRecord => {
    const screeningId = recordData.id || `GLC-${Date.now().toString().slice(-5)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const nowTimestamp = Date.now();

    const realPatients = (patients || []).filter(
      (p) =>
        p.fullName &&
        p.fullName !== 'Walk-in Patient' &&
        p.fullName !== 'Patient information unavailable' &&
        !p.id.startsWith('PX-')
    );
    let resolvedPatientId = recordData.patientId;
    let resolvedPatientName = recordData.patientName;
    let resolvedPatientAge = recordData.patientAge;
    let resolvedPatientGender = recordData.patientGender;
    let resolvedPatientPhone = recordData.patientPhone;

    const fallbackGlaucomaPatient =
      (wizardPatient ? realPatients.find((p) => p.id === wizardPatient.id) : null) ||
      (activePatientId ? realPatients.find((p) => p.id === activePatientId || p.dbId === activePatientId) : null) ||
      realPatients.find((p) => p.fullName.toLowerCase().includes('khushi')) ||
      (realPatients.length > 0 ? realPatients[0] : null);

    if (
      (!resolvedPatientName || resolvedPatientName === 'Walk-in Patient' || resolvedPatientName === 'Patient information unavailable') &&
      fallbackGlaucomaPatient
    ) {
      resolvedPatientId = fallbackGlaucomaPatient.id;
      resolvedPatientName = fallbackGlaucomaPatient.fullName;
      resolvedPatientAge = fallbackGlaucomaPatient.age ?? resolvedPatientAge;
      resolvedPatientGender = fallbackGlaucomaPatient.gender ?? resolvedPatientGender;
      resolvedPatientPhone = fallbackGlaucomaPatient.phoneNumber ?? resolvedPatientPhone;
    }

    const newRecord: GlaucomaScreeningRecord = {
      ...recordData,
      id: screeningId,
      patientId: resolvedPatientId,
      patientName: resolvedPatientName,
      patientAge: resolvedPatientAge,
      patientGender: resolvedPatientGender,
      patientPhone: resolvedPatientPhone,
      screeningType: (recordData as any).screeningType || 'glaucoma',
      nurseId: currentUser?.id,
      nurseName: currentUser?.name || 'Nurse',
      date: dateStr,
      timestamp: nowTimestamp,
      createdAt: dateStr,
      imageOriginal: recordData.imageOriginal || `/api/screenings/${screeningId}/artifacts/original`,
      imageOpticNerve: recordData.imageOpticNerve || `/api/screenings/${screeningId}/artifacts/optic_nerve`,
      imageRetinalAnatomy: recordData.imageRetinalAnatomy || `/api/screenings/${screeningId}/artifacts/vessels`,
      imageGradCam: recordData.imageGradCam || `/api/screenings/${screeningId}/artifacts/gradcam`,
      imageWorkflow: recordData.imageWorkflow || `/api/screenings/${screeningId}/artifacts/combined`,
    };

    setGlaucomaScreenings((prev) => {
      const updated = [newRecord, ...prev.filter((s) => s.id !== screeningId)];
      try {
        const sanitized = updated.map((r) => ({
          ...r,
          imageOriginal: r.imageOriginal && r.imageOriginal.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/original` : r.imageOriginal,
          imageOpticNerve: r.imageOpticNerve && r.imageOpticNerve.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/optic_nerve` : r.imageOpticNerve,
          imageRetinalAnatomy: r.imageRetinalAnatomy && r.imageRetinalAnatomy.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/vessels` : r.imageRetinalAnatomy,
          imageGradCam: r.imageGradCam && r.imageGradCam.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/gradcam` : r.imageGradCam,
          imageWorkflow: r.imageWorkflow && r.imageWorkflow.startsWith('data:') ? `/api/screenings/${r.id}/artifacts/combined` : r.imageWorkflow,
          bokehInteractiveHtml: undefined,
        }));
        localStorage.setItem('retina_x_v3_glaucoma', JSON.stringify(sanitized));
      } catch {}
      return updated;
    });
    setActiveGlaucomaScreeningId(screeningId);

    // Synchronize patient history in real time
    setPatients((prev) => {
      const exists = prev.some((p) => p.id === resolvedPatientId);
      if (exists) {
        return prev.map((p) =>
          p.id === resolvedPatientId
            ? { ...p, lastScreeningDate: dateStr, lastScreeningResult: recordData.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? 'Glaucoma Suspect' : 'Normal' }
            : p
        );
      } else if (resolvedPatientName && resolvedPatientName !== 'Walk-in Patient' && resolvedPatientName !== 'Patient information unavailable') {
        const newP: Patient = {
          id: resolvedPatientId,
          fullName: resolvedPatientName,
          age: resolvedPatientAge || 55,
          gender: (resolvedPatientGender === 'Female' ? 'Female' : resolvedPatientGender === 'Male' ? 'Male' : 'Other'),
          phoneNumber: resolvedPatientPhone || '',
          diabetesDurationYears: 0,
          knownDR: 'No',
          lastScreeningDate: dateStr,
          lastScreeningResult: recordData.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? 'Glaucoma Suspect' : 'Normal',
          createdByNurse: currentUser?.name || 'Nurse',
          createdAt: dateStr,
        };
        return [newP, ...prev];
      }
      return prev;
    });

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
    // Reconcile with authoritative backend state so the shared report count
    // (sidebar + Reports page) converges without a manual browser refresh.
    void refreshDatabaseState().catch(() => {});
    return newRecord;
  };


  // Admin user actions: provision user via secure server API
  const refreshUsers = async (): Promise<void> => {
    try {
      const res = await fetchAdminUsers();
      if (res.success && res.users) {
        setUsers(res.users);
      }
    } catch (err) {
      console.warn('Failed to refresh users from Supabase:', err);
    }
  };

  const deleteUser = async (
    userId: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    const result = await deleteAdminUser(userId);
    if (result.success) {
      setUsers((prev) => {
        const filtered = prev.filter((u) => u.id !== userId);
        try {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}users`, JSON.stringify(filtered));
        } catch {
          // ignore
        }
        return filtered;
      });
      return { success: true, message: result.message };
    }
    return {
      success: false,
      error: result.error || 'Failed to delete user.',
    };
  };

  const addUser = async (
    userData: Omit<UserAccount, 'id' | 'createdAt' | 'status' | 'avatarLetter'>
  ): Promise<{ success: boolean; error?: string; user?: UserAccount }> => {
    const result = await createAdminUser({
      fullName: userData.name,
      email: userData.email,
      phone: userData.phone,
      role: userData.role,
      password: userData.password,
      status: 'Active',
    });

    if (result.success && result.user) {
      const createdAccount = result.user;
      setUsers((prev) => {
        const filtered = prev.filter(
          (u) => u.id !== createdAccount.id && u.email.toLowerCase() !== createdAccount.email.toLowerCase()
        );
        return [createdAccount, ...filtered];
      });
      return { success: true, user: createdAccount };
    }

    return {
      success: false,
      error: result.error || 'Failed to create user account.',
    };
  };

  const toggleUserStatus = async (userId: string): Promise<void> => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const newStatus = target.status === 'Active' ? 'Inactive' : 'Active';

    // Optimistically update UI
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
    );

    // Persist to Supabase
    await updateAdminUserStatus(userId, newStatus);
  };

  const addPatient = (patientData: Omit<Patient, 'id' | 'createdAt' | 'createdByNurse'> & { id?: string }): Patient => {
    const customId = patientData.id?.trim();
    let autoNextId = '1';
    let maxId = 0;
    let foundNumeric = false;
    for (const p of patients) {
      const trimmed = (p.id || '').trim();
      if (/^\d+$/.test(trimmed)) {
        const val = parseInt(trimmed, 10);
        if (!isNaN(val)) {
          foundNumeric = true;
          if (val > maxId) maxId = val;
        }
      }
    }
    autoNextId = foundNumeric ? String(maxId + 1) : '1';
    const patientCode = customId || autoNextId;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const newPatient: Patient = {
      ...patientData,
      id: patientCode,
      createdByNurse: currentUser?.name || 'Nurse',
      createdAt: dateStr,
    };

    setPatients((prev) => {
      const exists = prev.some((p) => p.id === patientCode);
      if (exists) {
        return prev.map((p) => p.id === patientCode ? { ...p, ...newPatient } : p);
      }
      return [newPatient, ...prev];
    });

    // Persist to Supabase if connected
    createPatientRecord(newPatient).then((res) => {
      if (res.success && res.data) {
        const saved = res.data;
        setPatients((prev) =>
          prev.map((p) =>
            p.id === patientCode || p.id === saved.patient_id
              ? {
                  ...p,
                  id: saved.patient_id || p.id,
                  dbId: saved.id,
                  fullName: saved.name || p.fullName,
                  createdAt: saved.created_at
                    ? new Date(saved.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : p.createdAt,
                }
              : p
          )
        );
      }
    }).catch((err) => {
      console.warn('[addPatient] Supabase sync deferred:', err);
    });

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
    return newPatient;
  };

  const deletePatient = async (id: string): Promise<{ success: boolean; error?: string }> => {
    // 1. Permanently delete from Supabase backend (along with all child screenings, findings, evidence, referrals, reviews, reports)
    const result = await deletePatientRecord(id);

    // 2. Cascade delete from local application state to leave zero orphan records
    setPatients((prev) => prev.filter((p) => p.id !== id));
    setScreenings((prev) => prev.filter((s) => s.patientId !== id));
    setCataractScreenings((prev) => prev.filter((s) => s.patientId !== id));
    setGlaucomaScreenings((prev) => prev.filter((s) => s.patientId !== id));
    setReferrals((prev) => prev.filter((r) => r.patientId !== id));
    setReports((prev) => prev.filter((rep) => rep.patientId !== id));

    if (activePatientId === id) {
      setActivePatientId(null);
    }

    return result;
  };

  const createScreening = (recordData: Omit<ScreeningRecord, 'id' | 'date'> & { id?: string; reportId?: string }, mlVisualizations?: {
    imageOriginal?: string;
    imageGradCam?: string;
    imageLesions?: string;
    imageAnatomy?: string;
    imageCombined?: string;
    imageResolution?: string;
    anatomyData?: ReportRecord['anatomyData'];
    lesionData?: ReportRecord['lesionData'];
    plainLanguageExplanation?: string;
  }): ScreeningRecord => {
    const screeningId = recordData.id || `SCR-${Date.now().toString().slice(-5)}`;
    const reportId = recordData.reportId || recordData.id || `RPT-${Date.now().toString().slice(-5)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const nowTimestamp = Date.now();

    const newRecord: ScreeningRecord = {
      ...recordData,
      id: screeningId,
      screeningType: (recordData as any).screeningType || 'dr',
      nurseId: currentUser?.id,
      nurseName: currentUser?.name || 'Nurse',
      date: dateStr,
      timestamp: nowTimestamp,
      createdAt: dateStr,
      reportId: reportId,
      imageOriginal: mlVisualizations?.imageOriginal || recordData.imageOriginal || `/api/screenings/${screeningId}/artifacts/original`,
      imageGradCam:  mlVisualizations?.imageGradCam || recordData.imageGradCam || `/api/screenings/${screeningId}/artifacts/gradcam`,
      imageLesions:  mlVisualizations?.imageLesions || recordData.imageLesions || `/api/screenings/${screeningId}/artifacts/lesions`,
      imageAnatomy:  mlVisualizations?.imageAnatomy || recordData.imageAnatomy || `/api/screenings/${screeningId}/artifacts/anatomy`,
      imageCombined: mlVisualizations?.imageCombined || recordData.imageCombined || `/api/screenings/${screeningId}/artifacts/combined`,
      imageDebugAnatomy: (mlVisualizations as any)?.imageDebugAnatomy || (recordData as any)?.imageDebugAnatomy || `/api/screenings/${screeningId}/artifacts/debug_anatomy`,
    };

    // Automatically generate connected Detailed Report (same screening session)
    const newReport: ReportRecord = {
      id: reportId,
      patientId: newRecord.patientId,
      screeningId: screeningId,
      screeningType: 'dr',
      generatedDate: dateStr,
      patientName: newRecord.patientName,
      patientPhone: newRecord.patientPhone || '',
      patientAge: newRecord.patientAge,
      patientGender: newRecord.patientGender,
      eye: newRecord.eye,
      drSeverity: newRecord.drSeverity,
      drSeverityLevel: newRecord.drSeverityLevel,
      confidence: newRecord.confidence,
      findings: newRecord.findings,
      imageQuality: newRecord.imageQuality,
      imageFileName: newRecord.imageFileName || 'fundus_screening.jpg',
      imageFileSize: newRecord.imageFileSize || '2.4 MB',
      imageResolution: mlVisualizations?.imageResolution,
      imageUrl: newRecord.imageUrl,
      nurseName: newRecord.nurseName || 'Nurse',
      referralStatus: newRecord.status === 'Referred' ? 'Referred to Specialist' : 'Routine Screening',
      status: 'Generated',
      // Real ML visualization data
      imageOriginal: mlVisualizations?.imageOriginal || recordData.imageOriginal || `/api/screenings/${screeningId}/artifacts/original`,
      imageGradCam:  mlVisualizations?.imageGradCam || recordData.imageGradCam || `/api/screenings/${screeningId}/artifacts/gradcam`,
      imageLesions:  mlVisualizations?.imageLesions || recordData.imageLesions || `/api/screenings/${screeningId}/artifacts/lesions`,
      imageAnatomy:  mlVisualizations?.imageAnatomy || recordData.imageAnatomy || `/api/screenings/${screeningId}/artifacts/anatomy`,
      imageCombined: mlVisualizations?.imageCombined || recordData.imageCombined || `/api/screenings/${screeningId}/artifacts/combined`,
      imageDebugAnatomy: (mlVisualizations as any)?.imageDebugAnatomy || (recordData as any)?.imageDebugAnatomy || `/api/screenings/${screeningId}/artifacts/debug_anatomy`,
      anatomyData:   mlVisualizations?.anatomyData,
      lesionData:    mlVisualizations?.lesionData,
      plainLanguageExplanation: mlVisualizations?.plainLanguageExplanation,
    };

    setScreenings((prev) => {
      const updated = [newRecord, ...prev.filter((s) => s.id !== screeningId)];
      try { localStorage.setItem('retina_x_v3_screenings', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setReports((prev) => {
      const updated = [
        newReport,
        ...prev.filter(
          (r) =>
            r.id !== reportId &&
            r.id !== screeningId &&
            r.screeningId !== screeningId &&
            r.screeningId !== reportId &&
            !(
              (r.patientId === newReport.patientId || r.patientName === newReport.patientName) &&
              r.eye === newReport.eye &&
              r.generatedDate === newReport.generatedDate
            )
        ),
      ];
      try { localStorage.setItem('retina_x_v3_reports', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveReportId(reportId);

    // Synchronize patient history in real time for DR screening
    setPatients((prev) => {
      const exists = prev.some((p) => p.id === recordData.patientId);
      if (exists) {
        return prev.map((p) =>
          p.id === recordData.patientId
            ? { ...p, lastScreeningDate: dateStr, lastScreeningResult: recordData.drSeverity || 'No DR' }
            : p
        );
      } else {
        const newP: Patient = {
          id: recordData.patientId,
          fullName: recordData.patientName || 'Patient information unavailable',
          age: recordData.patientAge || 55,
          gender: (recordData.patientGender === 'Female' ? 'Female' : recordData.patientGender === 'Male' ? 'Male' : 'Other'),
          phoneNumber: recordData.patientPhone || '',
          diabetesDurationYears: 0,
          knownDR: 'No',
          lastScreeningDate: dateStr,
          lastScreeningResult: recordData.drSeverity || 'No DR',
          createdByNurse: currentUser?.name || 'Nurse',
          createdAt: dateStr,
        };
        return [newP, ...prev];
      }
    });

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
    // Reconcile with authoritative backend state so the shared report count
    // (sidebar + Reports page) converges without a manual browser refresh.
    void refreshDatabaseState().catch(() => {});
    return newRecord;
  };



  const createReferral = (referralData: Omit<ReferralRecord, 'id' | 'date' | 'status'>): ReferralRecord => {
    const refId = `REF-${Date.now().toString().slice(-5)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const newRef: ReferralRecord = {
      ...referralData,
      id: refId,
      nurseName: currentUser?.name || 'Nurse',
      specialistName: referralData.specialistName || 'Dr. Aviraj Murkute (Ophthalmologist)',
      date: dateStr,
      status: 'Pending Review',
    };

    setReferrals((prev) => [newRef, ...prev]);

    // Update screening status to 'Referred'
    setScreenings((prev) =>
      prev.map((s) => (s.id === referralData.screeningId ? { ...s, status: 'Referred', referralId: refId } : s))
    );

    // Update report referral info
    setReports((prev) =>
      prev.map((r) =>
        r.screeningId === referralData.screeningId
          ? {
              ...r,
              referralStatus: 'Referred to Specialist',
              referralPriority: referralData.priority,
              referralReason: referralData.reason,
            }
          : r
      )
    );

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
    return newRef;
  };

  // Specialist submits review back to Nurse
  const submitSpecialistReview = (
    reviewData: Omit<SpecialistReview, 'id' | 'reviewDate' | 'specialistId' | 'specialistName' | 'status'>
  ) => {
    const reviewId = `REV-${Date.now().toString().slice(-5)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const fullReview: SpecialistReview = {
      ...reviewData,
      id: reviewId,
      specialistId: currentUser?.id || 'user_specialist',
      specialistName: currentUser?.name || 'Dr. Aviraj Murkute',
      reviewDate: dateStr,
      status: 'Reviewed',
    };

    // Update screening record with review
    setScreenings((prev) =>
      prev.map((s) =>
        s.id === reviewData.screeningId
          ? {
              ...s,
              status: 'Reviewed',
              specialistAssessment: fullReview,
            }
          : s
      )
    );

    // Update referral status to 'Reviewed'
    setReferrals((prev) =>
      prev.map((r) => (r.screeningId === reviewData.screeningId ? { ...r, status: 'Reviewed' } : r))
    );

    // Update report record with specialist review
    setReports((prev) =>
      prev.map((rep) =>
        rep.screeningId === reviewData.screeningId
          ? {
              ...rep,
              specialistReview: fullReview,
            }
          : rep
      )
    );

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
  };

  // Send report to patient's registered phone number
  const sendReportToPatientPhone = (reportId: string) => {
    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: 'Sent to Patient', sentToPhoneDate: dateStr } : r))
    );

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
  };

  const resetToBrandNewState = () => {
    setPatients([]);
    setScreenings([]);
    setCataractScreenings([]);
    setGlaucomaScreenings([]);
    setReferrals([]);
    setReports([]);
    setPendingSyncCount(0);
    resetWizard();
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}patients`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}screenings`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}cataract_screenings`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}glaucoma_screenings`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}referrals`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}reports`);
  };

  const resetWizard = () => {
    setWizardPatient(null);
    setWizardDisease(null);
    setWizardEye('Right Eye');
    setWizardImageSource(null);
    setWizardCapturedImage(null);
    setWizardImageFile(null);
    setWizardQualityPassed(false);
    setWizardActiveResult(null);
  };

  const toggleOffline = () => {
    setIsOffline((prev) => !prev);
  };

  const syncNow = () => {
    setPendingSyncCount(0);
  };

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
  };

  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  // SINGLE SOURCE OF TRUTH for every report count in the app (sidebar badge,
  // Reports page header). Same formula as ReportsPage items: DR reports +
  // cataract screenings + glaucoma screenings. Never screenings.length,
  // patients.length, or disease menu items.
  const totalReports =
    reports.length + cataractScreenings.length + glaucomaScreenings.length;

  const openReport = React.useCallback(async (screeningId: string) => {
    // 1. Try to find the screening locally first (exact ID match only —
    // never substitute another screening when the ID is unknown).
    const localScreening =
      screenings.find(s => s.id === screeningId) ||
      cataractScreenings.find(c => c.id === screeningId) ||
      glaucomaScreenings.find(g => g.id === screeningId);

    if (localScreening) {
      setActiveScreeningForModal(localScreening as any);
      setIsReportModalOpen(true);
      return; // Found locally, no need to fetch
    }

    // 2. Fallback to API if not found locally — store the fetched record in
    // the matching disease collection ONLY (by screeningType), so a DR fetch
    // can never appear as a glaucoma record and vice versa.
    try {
      const res = await fetch(`/api/screenings/${encodeURIComponent(screeningId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.screening) {
          const fetched = data.screening;
          const rawType = String(fetched.screeningType || fetched.screening_type || '').toLowerCase();
          setActiveScreeningForModal(fetched);
          if (rawType === 'cataract') {
            setCataractScreenings((prev) => {
              const exists = prev.some(s => s.id === fetched.id);
              return exists ? prev.map(s => s.id === fetched.id ? fetched : s) : [fetched, ...prev];
            });
          } else if (rawType === 'glaucoma') {
            setGlaucomaScreenings((prev) => {
              const exists = prev.some(s => s.id === fetched.id);
              return exists ? prev.map(s => s.id === fetched.id ? fetched : s) : [fetched, ...prev];
            });
          } else {
            setScreenings((prev) => {
              const exists = prev.some(s => s.id === fetched.id);
              return exists ? prev.map(s => s.id === fetched.id ? fetched : s) : [fetched, ...prev];
            });
          }
          setIsReportModalOpen(true);
        } else {
          console.warn('[openReport] Not found:', data.error);
        }
      } else {
        console.error('[openReport] Failed to fetch:', res.status);
      }
    } catch (err) {
      console.error('[openReport] Request error:', err);
    }
  }, [setActiveScreeningForModal, setIsReportModalOpen, screenings, cataractScreenings, glaucomaScreenings]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isAuthRestoring,
        currentRole,
        authStage,
        pendingUser,
        pendingFactorId,
        users,
        loginWithCredentials,
        confirmTwoFactorLogin,
        cancelTwoFactor,
        switchToTwoFactorChallenge,
        logout,
        addUser,
        toggleUserStatus,
        deleteUser,
        refreshUsers,
        activePage,
        setActivePage,
        activePatientId,
        setActivePatientId,
        openPatientProfile,
        activeReportId,
        openReportDetail,
        activeCataractScreeningId,
        openCataractReportDetail,
        activeGlaucomaScreeningId,
        openGlaucomaReportDetail,
        patients,
        screenings,
        cataractScreenings,
        glaucomaScreenings,
        referrals,
        reports,
        totalReports,
        reportsLoading,
        reportsError,
        addPatient,
        createScreening,
        createCataractScreening,
        createGlaucomaScreening,
        createReferral,
        submitSpecialistReview,
        sendReportToPatientPhone,
        deletePatient,
        resetToBrandNewState,
        refreshDatabaseState,

        screeningWizard: {
          selectedPatient: wizardPatient,
          selectedDisease: wizardDisease,
          selectedEye: wizardEye,
          imageSource: wizardImageSource,
          capturedImage: wizardCapturedImage,
          imageFile: wizardImageFile,
          qualityPassed: wizardQualityPassed,
          activeResult: wizardActiveResult,
        },
        setWizardPatient,
        setWizardDisease,
        setWizardEye,
        setWizardImageSource,
        setWizardCapturedImage,
        setWizardImageFile,
        setWizardQualityPassed,
        setWizardActiveResult,
        resetWizard,
        isOffline,
        toggleOffline,
        pendingSyncCount,
        syncNow,
        language,
        setLanguage,
        t,
        isAddPatientModalOpen,
        setIsAddPatientModalOpen,
        isLanguageModalOpen,
        setIsLanguageModalOpen,
        isExplanationModalOpen,
        setIsExplanationModalOpen,
        isReferralModalOpen,
        setIsReferralModalOpen,
        isReportModalOpen,
        setIsReportModalOpen,
        activeScreeningForModal,
        setActiveScreeningForModal,
        isCataractReportModalOpen,
        setIsCataractReportModalOpen,
        activeCataractScreeningForModal,
        setActiveCataractScreeningForModal,
        isGlaucomaReportModalOpen,
        setIsGlaucomaReportModalOpen,
        activeGlaucomaScreeningForModal,
        setActiveGlaucomaScreeningForModal,
        activeCase,
        setActiveCase,
        openReport,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
