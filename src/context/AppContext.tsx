import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserRole,
  UserProfile,
  UserAccount,
  Patient,
  ScreeningRecord,
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
import { deletePatientRecord, createPatientRecord } from '../services/patientService';

// Helper to construct application UserProfile from Supabase User and public.profiles row
const loadUserProfileFromDatabase = async (
  user: { id: string; email?: string; user_metadata?: Record<string, any> },
  userList: UserAccount[]
): Promise<UserProfile> => {
  let role: UserRole = 'nurse';
  let name = user.email ? user.email.split('@')[0] : 'RETINA-X User';
  let title = 'Primary Healthcare Worker';

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
          : role === 'specialist'
          ? 'Consultant Ophthalmologist'
          : 'Primary Healthcare Worker');
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

  if (!title || title === 'Primary Healthcare Worker') {
    if (role === 'admin') title = 'Hospital System Administrator';
    else if (role === 'specialist') title = 'Consultant Ophthalmologist';
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

// Predefined Accounts (Preserving only the Sashvi account)
export const PREDEFINED_USERS: UserAccount[] = [
  {
    id: 'd752a388-7cc9-4113-a5e3-89ff880b4c68',
    name: 'sashvi',
    email: 'sashvi@gmail.com',
    role: 'nurse',
    title: 'Primary Healthcare Worker',
    phone: '1234567890',
    status: 'Active',
    createdAt: '13 Sept 2026',
    avatarLetter: 'S',
  },
];

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

  // Navigation
  activePage: NavigationPage;
  setActivePage: (page: NavigationPage) => void;
  activePatientId: string | null;
  openPatientProfile: (patientId: string) => void;
  activeReportId: string | null;
  openReportDetail: (reportId: string) => void;

  // Data collections (initially ALL EMPTY)
  patients: Patient[];
  screenings: ScreeningRecord[];
  referrals: ReferralRecord[];
  reports: ReportRecord[];

  // Data Actions
  addPatient: (patient: Omit<Patient, 'id' | 'createdAt' | 'createdByNurse'>) => Patient;
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

  // Active Screening Flow state
  screeningWizard: {
    selectedPatient: Patient | null;
    selectedEye: EyeSelection;
    imageSource: 'capture' | 'upload' | null;
    capturedImage: string | null;
    imageFile: { name: string; size: string; previewUrl?: string; actualFile?: File } | null;
    qualityPassed: boolean;
    activeResult: ScreeningRecord | null;
  };
  setWizardPatient: (patient: Patient | null) => void;
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
  activeCase: Record<string, any> | null;
  setActiveCase: (caseData: Record<string, any> | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// One-time cleanup of legacy patient/screening/report data from localStorage to ensure completely clean state
try {
  const legacyPrefixes = ['retina_x_', 'retina_x_v1_', 'retina_x_v2_'];
  legacyPrefixes.forEach((prefix) => {
    localStorage.removeItem(`${prefix}patients`);
    localStorage.removeItem(`${prefix}screenings`);
    localStorage.removeItem(`${prefix}referrals`);
    localStorage.removeItem(`${prefix}reports`);
  });
} catch {
  // Ignore localStorage restrictions
}

const STORAGE_KEY_PREFIX = 'retina_x_v3_';

// Each ML visualization is a ~400KB base64 PNG (5 per report = ~2MB+). Storing them
// all in localStorage blows the ~5MB browser quota and crashes the app with a
// QuotaExceededError. We keep the full images only in React state for the current
// session and strip them before persisting reports to localStorage.
const stripReportImages = (report: ReportRecord): ReportRecord => {
  const { imageOriginal, imageGradCam, imageLesions, imageAnatomy, imageCombined, ...meta } = report;
  return meta;
};

// Safe localStorage writer that never lets a quota error crash the app
const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[AppContext] Failed to persist "${key}" (storage quota exceeded):`, err);
  }
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
        return JSON.parse(saved);
      }
    } catch {
      // ignore parse error
    }
    return null;
  });
  const [isAuthRestoring, setIsAuthRestoring] = useState<boolean>(true);

  // Two-step verification stage, staged user, and active factor
  const [authStage, setAuthStage] = useState<'login' | 'mfa' | 'mfa-enroll'>('login');
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);

  const currentRole: UserRole = currentUser ? currentUser.role : 'nurse';

  // Navigation page
  const [activePage, setActivePage] = useState<NavigationPage>('dashboard');
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeCase, setActiveCase] = useState<Record<string, any> | null>(null);

  // BRAND NEW FIRST-TIME APPLICATION STATE:
  // Starts with EMPTY arrays! No pre-populated fake patients, screenings, referrals, or reports!
  const [patients, setPatients] = useState<Patient[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}patients`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [screenings, setScreenings] = useState<ScreeningRecord[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}screenings`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [referrals, setReferrals] = useState<ReferralRecord[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}referrals`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [reports, setReports] = useState<ReportRecord[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}reports`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.map(stripReportImages) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

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

  // Wizard state for New Screening flow
  const [wizardPatient, setWizardPatient] = useState<Patient | null>(null);
  const [wizardEye, setWizardEye] = useState<EyeSelection>('Right Eye');
  const [wizardImageSource, setWizardImageSource] = useState<'capture' | 'upload' | null>(null);
  const [wizardCapturedImage, setWizardCapturedImage] = useState<string | null>(null);
  const [wizardImageFile, setWizardImageFile] = useState<{ name: string; size: string; previewUrl?: string; actualFile?: File } | null>(null);
  const [wizardQualityPassed, setWizardQualityPassed] = useState(false);
  const [wizardActiveResult, setWizardActiveResult] = useState<ScreeningRecord | null>(null);

  // Persistence to localStorage
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

  useEffect(() => {
    safeSetItem(`${STORAGE_KEY_PREFIX}patients`, JSON.stringify(patients));
  }, [patients]);

  useEffect(() => {
    safeSetItem(`${STORAGE_KEY_PREFIX}screenings`, JSON.stringify(screenings));
  }, [screenings]);

  useEffect(() => {
    safeSetItem(`${STORAGE_KEY_PREFIX}referrals`, JSON.stringify(referrals));
  }, [referrals]);

  useEffect(() => {
    // Persist only report metadata — never the heavy base64 images
    safeSetItem(`${STORAGE_KEY_PREFIX}reports`, JSON.stringify(reports.map(stripReportImages)));
  }, [reports]);

  // Synchronize authenticated Supabase session on app initialization
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session?.user) {
          if (isMounted) {
            setCurrentUser(null);
            setPendingUser(null);
            setPendingFactorId(null);
            setAuthStage('login');
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
      } else if (targetEmail === 'sashvi') {
        targetEmail = 'sashvi@gmail.com';
      } else if (targetEmail === 'admin') {
        targetEmail = 'admin@gmail.com';
      } else if (targetEmail === 'mahi') {
        targetEmail = 'mahi@gmail.com';
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

        if (helperData.success && helperData.token_hash) {
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
        }
      } catch (fetchErr) {
        console.warn('[Auth Server Helper Exception]', fetchErr);
      }
    }

    // 3. Fallback for Pre-configured Demo Accounts & Quick Fill Credentials
    const demoAccounts: Record<string, { role: UserRole; title: string; name: string; passwords: string[] }> = {
      'sashvi@gmail.com': {
        role: 'nurse',
        title: 'Primary Healthcare Worker',
        name: 'Sashvi Patel',
        passwords: ['sashvi123', 'password', 'Password123!', 'admin123'],
      },
      'admin@gmail.com': {
        role: 'admin',
        title: 'Hospital System Administrator',
        name: 'System Admin',
        passwords: ['admin123', 'password', 'Password123!'],
      },
      'mahi@gmail.com': {
        role: 'specialist',
        title: 'Consultant Ophthalmologist',
        name: 'Dr. Mahi Sharma',
        passwords: ['mahi123', 'password', 'Password123!'],
      },
    };

    const demo = demoAccounts[targetEmail.toLowerCase()];
    if (demo && demo.passwords.includes(inputPass)) {
      const demoProfile: UserProfile = {
        id: `demo-${demo.role}-${Date.now()}`,
        name: demo.name,
        role: demo.role,
        title: demo.title,
        email: targetEmail,
        avatarLetter: demo.name.charAt(0).toUpperCase(),
      };
      setCurrentUser(demoProfile);
      setPendingUser(null);
      setPendingFactorId(null);
      setAuthStage('login');
      setActivePage('dashboard');
      return { success: true };
    }

    // 4. Fallback for locally managed users list
    const matchedLocal = users.find((u) => u.email.toLowerCase() === targetEmail.toLowerCase());
    if (matchedLocal) {
      const localProfile: UserProfile = {
        id: matchedLocal.id,
        name: matchedLocal.name,
        role: matchedLocal.role,
        title: matchedLocal.title,
        email: matchedLocal.email,
        avatarLetter: matchedLocal.avatarLetter,
      };
      setCurrentUser(localProfile);
      setPendingUser(null);
      setPendingFactorId(null);
      setAuthStage('login');
      setActivePage('dashboard');
      return { success: true };
    }

    // 5. Helpful feedback if Supabase credentials are placeholder vs incorrect
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error:
          'Supabase keys in .env are still set to placeholders (PASTE_YOUR_ANON_KEY_HERE). Update VITE_SUPABASE_ANON_KEY in .env with your real Supabase key to log in with database users.',
      };
    }

    return {
      success: false,
      error: 'Invalid email or password. Please check your credentials.',
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

  const addPatient = (patientData: Omit<Patient, 'id' | 'createdAt' | 'createdByNurse'>): Patient => {
    const nextNum = 1001 + patients.length;
    const newPatient: Patient = {
      ...patientData,
      id: `PX-${nextNum}`,
      createdByNurse: currentUser?.name || 'Nurse',
      createdAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    };

    setPatients((prev) => [newPatient, ...prev]);

    // Persist to Supabase if connected
    createPatientRecord(newPatient).catch((err) => {
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
    setReferrals((prev) => prev.filter((r) => r.patientId !== id));
    setReports((prev) => prev.filter((rep) => rep.patientId !== id));

    if (activePatientId === id) {
      setActivePatientId(null);
    }

    return result;
  };

  const createScreening = (recordData: Omit<ScreeningRecord, 'id' | 'date'>, mlVisualizations?: {
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
    const screeningId = `SCR-${Date.now().toString().slice(-5)}`;
    const reportId = `RPT-${Date.now().toString().slice(-5)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const newRecord: ScreeningRecord = {
      ...recordData,
      id: screeningId,
      nurseId: currentUser?.id,
      nurseName: currentUser?.name || 'Nurse',
      date: dateStr,
      reportId: reportId,
      imageOriginal: mlVisualizations?.imageOriginal,
      imageGradCam:  mlVisualizations?.imageGradCam,
      imageLesions:  mlVisualizations?.imageLesions,
      imageAnatomy:  mlVisualizations?.imageAnatomy,
      imageCombined: mlVisualizations?.imageCombined,
    };

    // Automatically generate connected Detailed Report
    const newReport: ReportRecord = {
      id: reportId,
      patientId: newRecord.patientId,
      screeningId: screeningId,
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
      imageOriginal: mlVisualizations?.imageOriginal,
      imageGradCam:  mlVisualizations?.imageGradCam,
      imageLesions:  mlVisualizations?.imageLesions,
      imageAnatomy:  mlVisualizations?.imageAnatomy,
      imageCombined: mlVisualizations?.imageCombined,
      anatomyData:   mlVisualizations?.anatomyData,
      lesionData:    mlVisualizations?.lesionData,
      plainLanguageExplanation: mlVisualizations?.plainLanguageExplanation,
    };

    setScreenings((prev) => [newRecord, ...prev]);
    setReports((prev) => [newReport, ...prev]);

    if (isOffline) {
      setPendingSyncCount((prev) => prev + 1);
    }
    return newRecord;
  };


  const createReferral = (referralData: Omit<ReferralRecord, 'id' | 'date' | 'status'>): ReferralRecord => {
    const refId = `REF-${Date.now().toString().slice(-5)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const newRef: ReferralRecord = {
      ...referralData,
      id: refId,
      nurseName: currentUser?.name || 'Nurse',
      specialistName: referralData.specialistName || 'Dr. A. Sharma (Ophthalmologist)',
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
      specialistName: currentUser?.name || 'Dr. A. Sharma',
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
    setReferrals([]);
    setReports([]);
    setPendingSyncCount(0);
    resetWizard();
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}patients`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}screenings`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}referrals`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}reports`);
  };

  const resetWizard = () => {
    setWizardPatient(null);
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
        openPatientProfile,
        activeReportId,
        openReportDetail,
        patients,
        screenings,
        referrals,
        reports,
        addPatient,
        createScreening,
        createReferral,
        submitSpecialistReview,
        sendReportToPatientPhone,
        deletePatient,
        resetToBrandNewState,
        screeningWizard: {
          selectedPatient: wizardPatient,
          selectedEye: wizardEye,
          imageSource: wizardImageSource,
          capturedImage: wizardCapturedImage,
          imageFile: wizardImageFile,
          qualityPassed: wizardQualityPassed,
          activeResult: wizardActiveResult,
        },
        setWizardPatient,
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
        activeCase,
        setActiveCase,
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
