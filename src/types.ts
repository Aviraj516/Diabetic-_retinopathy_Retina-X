export type UserRole = 'admin' | 'nurse' | 'specialist';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  title: string;
  phone?: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
  avatarLetter: string;
}

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  email: string;
  avatarLetter: string;
}

export type EyeSelection = 'Right Eye' | 'Left Eye';

export type DRSeverity = 'No DR' | 'Mild' | 'Moderate' | 'Severe' | 'PDR';

export interface Patient {
  id: string; // e.g. PX-1025
  fullName: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  phoneNumber: string;
  diabetesDurationYears: number;
  knownDR: 'No' | 'Yes' | 'Uncertain';
  createdByNurse?: string;
  createdAt: string;
}

export interface SpecialistReview {
  id: string;
  screeningId: string;
  patientId: string;
  specialistId: string;
  specialistName: string;
  reviewDate: string;
  assessment: DRSeverity;
  notes: string;
  recommendation: 'Follow-up' | 'Specialist monitoring' | 'Further evaluation' | 'No further action';
  status: 'Reviewed';
}

export interface ScreeningRecord {
  id: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientPhone: string;
  nurseId?: string;
  nurseName?: string;
  date: string;
  eye: EyeSelection;
  imageQuality: 'Good' | 'Borderline' | 'Unsuitable';
  imageFileName?: string;
  imageFileSize?: string;
  imageUrl?: string;
  drSeverity: DRSeverity;
  drSeverityLevel: string; // e.g. "Moderate DR (Level 2)"
  confidence: number; // e.g. 87
  findings: string[]; // ["Microaneurysms", "Hemorrhages", "Hard Exudates"]
  recommendation: string;
  status: 'Completed' | 'Review' | 'Referred' | 'Reviewed';
  referralId?: string;
  reportId?: string;
  specialistAssessment?: SpecialistReview;
  // Real ML pipeline visualizations (base64, no prefix)
  imageOriginal?: string;
  imageGradCam?: string;
  imageLesions?: string;
  imageAnatomy?: string;
  imageCombined?: string;
}

export interface ReferralRecord {
  id: string;
  screeningId: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientPhone?: string;
  nurseName?: string;
  specialistId?: string;
  specialistName?: string;
  date: string;
  priority: 'High' | 'Medium' | 'Low';
  drSeverity: string;
  keyFindings: string[];
  reason: string;
  notes?: string;
  status: 'Pending Review' | 'Reviewed' | 'Closed';
}

export interface ReportRecord {
  id: string;
  patientId: string;
  screeningId: string;
  generatedDate: string;
  patientName: string;
  patientPhone: string;
  patientAge: number;
  patientGender: string;
  eye: EyeSelection;
  drSeverity: DRSeverity;
  drSeverityLevel: string;
  confidence: number;
  findings: string[];
  imageQuality: string;
  imageFileName: string;
  imageFileSize: string;
  imageResolution?: string;
  imageUrl?: string;
  nurseName: string;
  referralStatus: string;
  referralPriority?: 'High' | 'Medium' | 'Low';
  referralReason?: string;
  specialistReview?: SpecialistReview;
  status: 'Generated' | 'Sent to Patient';
  sentToPhoneDate?: string;
  // Real ML pipeline visualizations (base64, no prefix)
  imageOriginal?: string;
  imageGradCam?: string;
  imageLesions?: string;
  imageAnatomy?: string;
  imageCombined?: string;
  // Anatomy detection results
  anatomyData?: {
    blood_vessels?: {
      pixels: number;
      detected: boolean;
      density?: number;
      macular_density?: number;
      branches?: number;
    };
    optic_disc?: {
      pixels: number;
      detected: boolean;
      center?: [number, number];
    };
    fovea?: {
      x: number;
      y: number;
      disc_distance?: number;
    };
    macula?: { detected: boolean };
    retinal_background?: { detected: boolean };
    measurements?: {
      vessel_pixels?: number;
      vessel_density_pct?: number;
      macular_vessel_density_pct?: number;
      vessel_branches?: number;
      optic_disc_pixels?: number;
      fovea_x?: number;
      fovea_y?: number;
      disc_fovea_distance_px?: number;
      [key: string]: any;
    };
  };
  // Lesion detection results: key = lesion name, value = detected/regions/pixels
  lesionData?: Record<string, { detected: boolean; regions?: number; pixels?: number }>;
  // Auto-generated plain-language explanation from the real pipeline
  plainLanguageExplanation?: string;
}


export type NavigationPage = 
  | 'dashboard'
  | 'patients'
  | 'patient-detail'
  | 'new-screening'
  | 'screening-history'
  | 'referrals'
  | 'cases-reviews'
  | 'reports'
  | 'report-detail'
  | 'screenings'
  | 'users'
  | 'settings';

export type LanguageCode = 'en' | 'hi' | 'mr' | 'ta' | 'te' | 'bn';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
}

