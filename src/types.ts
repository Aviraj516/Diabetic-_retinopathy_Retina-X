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
  avatarLetter?: string;
  institution?: string;
  mfaEnabled?: boolean;
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
  otherDiseases?: string;
  medicalDetails?: string;
  createdByNurse?: string;
  createdAt: string;
  lastScreeningDate?: string;
  lastScreeningResult?: string;
  dob?: string;
  primaryDiscipline?: 'cataract' | 'dr' | 'glaucoma';
  dbId?: string;
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
  /** Single source of truth for disease sync. Mirrors DB `screening_type`: 'dr' | 'cataract' | 'glaucoma'. */
  screeningType?: string;
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
  imageDebugAnatomy?: string;
  timestamp?: number;
  createdAt?: string;
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
  /** Single source of truth for disease sync. Mirrors DB `screening_type`: 'dr' | 'cataract' | 'glaucoma'. */
  screeningType?: string;
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
  imageDebugAnatomy?: string;
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
      pixels_orig?: number;
      detected: boolean;
      center?: [number, number];
      center_orig?: [number, number];
      diameter_model_px?: number;
      diameter_orig_px?: number;
    };
    fovea?: {
      x: number;
      y: number;
      x_orig?: number;
      y_orig?: number;
      disc_distance?: number;
      disc_distance_orig_px?: number;
      disc_distance_dd?: number;
      coordinate_system?: string;
      plausible?: boolean;
    };
    macula?: {
      detected: boolean;
      estimated?: boolean;
      is_segmented?: boolean;
      method?: string;
      radius_px?: number;
      radius_orig_px?: number;
    };
    retinal_background?: { detected: boolean };
    diagnostic?: Record<string, any>;
    measurements?: {
      vessel_pixels?: number;
      vessel_density_pct?: number;
      macular_vessel_density_pct?: number;
      vessel_branches?: number;
      optic_disc_pixels?: number;
      fovea_x?: number;
      fovea_y?: number;
      fovea_x_orig?: number;
      fovea_y_orig?: number;
      disc_fovea_distance_px?: number;
      disc_fovea_distance_orig_px?: number;
      disc_fovea_distance_dd?: number;
      [key: string]: any;
    };
  };
  // Lesion detection results: key = lesion name, value = detected/regions/pixels
  lesionData?: Record<string, { detected: boolean; regions?: number; pixels?: number }>;
  // Auto-generated plain-language explanation from the real pipeline
  plainLanguageExplanation?: string;
  recommendation?: string;
  nurseId?: string;
}

export type CataractPrediction = 'NORMAL' | 'CATARACT';

export interface CataractScreeningRecord {
  id: string; // e.g. CAT-1001
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientPhone: string;
  /** Single source of truth for disease sync. Always 'cataract' for this pipeline. */
  screeningType?: string;
  nurseId?: string;
  nurseName?: string;
  date: string;
  eye: EyeSelection;
  imageFileName: string;
  imageFileSize: string;
  imageResolution: string;
  imageQuality: 'GOOD' | 'BAD';
  qualityConfidence?: { good: number; bad: number };
  eyeDetected: boolean;
  eyeConfidence: number;
  eyeBox?: [number, number, number, number];
  irisDetected: boolean;
  irisAreaPixels?: number;
  irisDiameterPx?: number;
  pupilDetected: boolean;
  pupilAreaPixels?: number;
  pupilDiameterPx?: number;
  pupilIrisRatio?: number;
  cataractPrediction: CataractPrediction;
  cataractProbability: number; // 0.0 - 1.0
  normalProbability: number;   // 0.0 - 1.0
  overallStatus: 'Completed' | 'Review' | 'Referred';
  clinicalRecommendation: string;
  // Real ML pipeline visualizations (base64)
  imageOriginal?: string;
  imageEyeDetection?: string;
  imageAnalyzedRegion?: string;
  imageOpacityEvidence?: string;
  imageIris?: string;
  imagePupil?: string;
  imageAnatomyCombined?: string;
  imageGradCam?: string;
  imageWorkflow?: string;
  imageXai?: string;
  quantitativeAnalysis?: {
    analyzedRegionAreaPx?: number;
    opacityEvidenceAreaPx?: number;
    opacityEvidencePercentage?: number;
    cataractProbabilityPct?: number;
    normalProbabilityPct?: number;
    // AI Evidence Intensity from the CURRENT screening's evidence map.
    // Screening evidence only — not clinical cataract severity.
    evidenceIntensity?: 'LOW' | 'MODERATE' | 'HIGH';
    evidenceCoveragePct?: number;
    evidenceMethod?: string;
    highEvidencePx?: number;
    moderateEvidencePx?: number;
    lowEvidencePx?: number;
  };
  artifacts?: Record<string, string>;
  timestamp?: number;
  createdAt?: string;
}

export type GlaucomaPrediction = 'NORMAL' | 'GLAUCOMA_SUSPECT' | 'INCONCLUSIVE' | 'UNGRADABLE';

export interface GlaucomaScreeningRecord {
  id: string; // e.g. GLC-1001
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientPhone: string;
  /** Single source of truth for disease sync. Always 'glaucoma' for this pipeline. */
  screeningType?: string;
  nurseId?: string;
  nurseName?: string;
  date: string;
  eye: EyeSelection;
  imageFileName: string;
  imageFileSize: string;
  imageResolution: string;
  imageQuality: 'Good' | 'Borderline' | 'Ungradable';
  qualityConfidence?: { Good: number; Borderline: number; Ungradable: number };
  qualityFeatures?: {
    sharpness: number;
    brightness: number;
    illumination: number;
    contrast: number;
    noise: number;
    fov: number;
  };
  screeningStatus?: string;
  segmentationStatus?: string;
  discDetected: boolean;
  cupDetected: boolean;
  discPath?: string;
  cupPath?: string;
  verticalCDR: number;
  horizontalCDR: number;
  areaCDR: number;
  rimArea?: number;
  cdrFeatures?: {
    status?: string;
    vertical_cdr: number;
    horizontal_cdr: number;
    area_cdr: number;
    disc_area: number;
    cup_area: number;
    rim_area?: number;
    disc_width: number;
    disc_height: number;
    cup_width: number;
    cup_height: number;
    cup_inside_ratio: number;
    disc_x?: number;
    disc_y?: number;
    cup_x?: number;
    cup_y?: number;
  };
  vesselsDetected: boolean;
  vesselDensityPct?: number;
  glaucomaPrediction: GlaucomaPrediction;
  glaucomaProbability: number; // 0.0 - 1.0
  normalProbability: number;   // 0.0 - 1.0
  glaucomaFlag: boolean;
  shapImportance?: Record<string, number>;
  overallStatus: 'Completed' | 'Review' | 'Referred' | 'Inconclusive';
  clinicalRecommendation: string;
  clinicalNotes?: string;
  // Real ML pipeline visualizations (base64)
  imageOriginal?: string;
  imageOpticNerve?: string;
  imageRim?: string;
  imageRetinalAnatomy?: string;
  imageGradCam?: string;
  imageWorkflow?: string;
  bokehInteractiveHtml?: string;
  artifacts?: Record<string, string>;
  timestamp?: number;
  createdAt?: string;
}

export type NavigationPage = 
  | 'dashboard'
  | 'patients'
  | 'patient-detail'
  | 'new-screening'
  | 'dr-screening'
  | 'screening-history'
  | 'cataract-screening'
  | 'cataract-history'
  | 'cataract-report-detail'
  | 'glaucoma-screening'
  | 'glaucoma-history'
  | 'glaucoma-report-detail'
  | 'referrals'
  | 'cases-reviews'
  | 'reports'
  | 'reports-card'
  | 'report-detail'
  | 'screenings'
  | 'users'
  | 'settings'
  | 'analytics';

export type LanguageCode = 'en' | 'hi' | 'mr' | 'ta' | 'te' | 'bn';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
}

