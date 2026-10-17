/**
 * TRINAY Diabetic Retinopathy (DR) Clinical Knowledge & Explanation Engine
 * 
 * Strict Clinical Decision-Support Standards:
 * - Uses medically validated terminology ("AI-detected finding", "may indicate", "associated with", "clinical correlation recommended").
 * - Does NOT determine severity from pixel area alone; uses the validated classifier staging.
 * - Provides rich doctor-friendly explanations for MA, HE, EX, SE.
 * - Generates patient-specific dynamic AI clinical summaries from actual screening outputs.
 */

export interface LesionClinicalDefinition {
  code: 'MA' | 'HE' | 'EX' | 'SE';
  name: string;
  fullName: string;
  colorHex: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  whatIsIt: string;
  whyItMatters: string;
  clinicalInterpretation: string;
  clinicalConsideration: string;
}

export const DR_LESION_DEFINITIONS: Record<'MA' | 'HE' | 'EX' | 'SE', LesionClinicalDefinition> = {
  MA: {
    code: 'MA',
    name: 'Microaneurysm',
    fullName: 'Retinal Microaneurysm (MA)',
    colorHex: '#DC2626',
    badgeBg: 'bg-red-50',
    badgeBorder: 'border-red-200',
    badgeText: 'text-red-700',
    whatIsIt: 'A small localized outpouching of a retinal capillary wall where weakened pericytes allow dilation.',
    whyItMatters: 'Microaneurysms represent the earliest observable retinal microvascular finding associated with diabetic retinopathy.',
    clinicalInterpretation: 'The finding should be interpreted together with other retinal abnormalities and the patient’s clinical glycemic history.',
    clinicalConsideration: 'Optimization of glycemic control and scheduled periodic dilated fundus examinations.'
  },
  HE: {
    code: 'HE',
    name: 'Retinal Hemorrhage',
    fullName: 'Retinal Hemorrhage (HE)',
    colorHex: '#7C3AED',
    badgeBg: 'bg-purple-50',
    badgeBorder: 'border-purple-200',
    badgeText: 'text-purple-700',
    whatIsIt: 'Bleeding caused by leakage from damaged and ruptured retinal microvessels into intraretinal layers.',
    whyItMatters: 'Retinal hemorrhages can occur in diabetic retinopathy and other retinal vascular disorders, indicating microvascular compromise.',
    clinicalInterpretation: 'Requires clinical correlation and ophthalmologist assessment to evaluate the extent of vascular compromise.',
    clinicalConsideration: 'Comprehensive dilated slit-lamp examination with vitreo-retinal evaluation.'
  },
  EX: {
    code: 'EX',
    name: 'Hard Exudate',
    fullName: 'Hard Exudate (EX)',
    colorHex: '#EAB308',
    badgeBg: 'bg-amber-50',
    badgeBorder: 'border-amber-200',
    badgeText: 'text-amber-700',
    whatIsIt: 'Lipid and lipoprotein deposits precipitated in the retina from abnormal vascular permeability and serum leakage.',
    whyItMatters: 'They indicate chronic retinal vascular leakage and are important when assessing diabetic retinal disease and proximity to the fovea.',
    clinicalInterpretation: 'Evaluate spatial relationship to the foveal avascular zone to monitor risk of diabetic macular edema (DME).',
    clinicalConsideration: 'Slit-lamp biomicroscopy and optical coherence tomography (OCT) consideration.'
  },
  SE: {
    code: 'SE',
    name: 'Soft Exudate (Cotton-Wool Spot)',
    fullName: 'Soft Exudate / Cotton-Wool Spot (SE)',
    colorHex: '#10B981',
    badgeBg: 'bg-emerald-50',
    badgeBorder: 'border-emerald-200',
    badgeText: 'text-emerald-700',
    whatIsIt: 'A localized area of retinal nerve-fiber-layer ischemic injury with axoplasmic flow stasis.',
    whyItMatters: 'It represents focal retinal ischemic change and can occur in diabetic retinopathy as well as other systemic microvascular conditions.',
    clinicalInterpretation: 'Reflects localized precapillary arteriolar occlusion and localized retinal ischemia rather than true exudation.',
    clinicalConsideration: 'Ophthalmologist consultation and review of blood pressure and systemic vascular risk factors.'
  }
};

export interface ProcessedLesionItem {
  code: 'MA' | 'HE' | 'EX' | 'SE';
  def: LesionClinicalDefinition;
  detected: boolean;
  pixels: number;
  regions: number;
  isAssessed: boolean;
}

/**
 * Normalizes lesion findings from various pipeline data structures.
 * Explicitly tracks `isAssessed` so missing or unavailable outputs are
 * never falsely displayed as absent or 0.
 */
export function extractLesionItems(lesionsData?: Record<string, any> | null): ProcessedLesionItem[] {
  const codes: Array<'MA' | 'HE' | 'EX' | 'SE'> = ['MA', 'HE', 'EX', 'SE'];
  const hasData = lesionsData != null && typeof lesionsData === 'object';

  return codes.map(code => {
    if (!hasData) {
      return {
        code,
        def: DR_LESION_DEFINITIONS[code],
        detected: false,
        pixels: 0,
        regions: 0,
        isAssessed: false,
      };
    }

    // Check by short code or full name
    const raw = lesionsData[code] ??
      lesionsData[code.toLowerCase()] ??
      lesionsData[DR_LESION_DEFINITIONS[code].name] ??
      lesionsData[DR_LESION_DEFINITIONS[code].fullName] ??
      (code === 'MA' ? lesionsData['Microaneurysms'] ?? lesionsData['microaneurysm'] : undefined) ??
      (code === 'HE' ? lesionsData['Hemorrhages'] ?? lesionsData['hemorrhage'] : undefined) ??
      (code === 'EX' ? lesionsData['Hard Exudates'] ?? lesionsData['hard_exudate'] : undefined) ??
      (code === 'SE' ? lesionsData['Soft Exudates'] ?? lesionsData['cotton_wool_spots'] : undefined);

    if (raw == null) {
      return {
        code,
        def: DR_LESION_DEFINITIONS[code],
        detected: false,
        pixels: 0,
        regions: 0,
        isAssessed: false,
      };
    }

    const detected = Boolean(raw?.detected || (typeof raw?.pixels === 'number' && raw.pixels > 0));
    const pixels = typeof raw?.pixels === 'number' ? raw.pixels : 0;
    const regions = typeof raw?.regions === 'number' ? raw.regions : (detected ? 1 : 0);

    return {
      code,
      def: DR_LESION_DEFINITIONS[code],
      detected,
      pixels,
      regions,
      isAssessed: true,
    };
  });
}

export type DRConcordanceType =
  | 'concordant_negative'
  | 'concordant_positive'
  | 'discrepant_classifier_positive'
  | 'discrepant_classifier_negative'
  | 'insufficient_quality'
  | 'indeterminate';

export interface DRClinicalInterpretation {
  concordanceType: DRConcordanceType;
  concordanceTitle: string;
  summaryText: string;
  concordanceDetail: string;
  distinctionNote: string;
  requiresReview: boolean;
  detectedCount: number;
  detectedNames: string[];
  totalLesionPixels: number;
  classifierVerdict: string;
}

/**
 * Evaluates agreement/disagreement between the whole-image DR classifier staging
 * and the focal lesion segmentation findings based only on actual model outputs.
 */
export function generateDrClinicalInterpretation(params: {
  lesionData?: Record<string, any> | null;
  drSeverity?: string;
  drSeverityLevel?: string;
  confidence?: number;
  imageQuality?: string;
}): DRClinicalInterpretation {
  const items = extractLesionItems(params.lesionData);
  const assessedItems = items.filter(i => i.isAssessed);
  const detectedItems = items.filter(i => i.isAssessed && i.detected && i.pixels > 0);
  const detectedCount = detectedItems.length;
  const detectedNames = detectedItems.map(i => i.def.name);
  const totalLesionPixels = detectedItems.reduce((acc, curr) => acc + curr.pixels, 0);

  const classifierVerdict = params.drSeverityLevel || params.drSeverity || 'Indeterminate Staging';
  const isClassifierNoDR =
    classifierVerdict.toLowerCase().includes('no dr') ||
    classifierVerdict.toLowerCase().includes('level 0') ||
    (params.drSeverity || '').toLowerCase().includes('no dr');

  const distinctionNote =
    'All reported metrics reflect automated computer-vision model inferences and 2D segmentation masks. They do not constitute confirmed clinical diagnoses or replace in-person biomicroscopy.';

  const isUngradable =
    params.imageQuality === 'Poor' ||
    params.imageQuality === 'Ungradable' ||
    (params.imageQuality || '').toLowerCase().includes('poor');

  if (isUngradable) {
    return {
      concordanceType: 'insufficient_quality',
      concordanceTitle: 'Interpretation Limited — Inadequate Image Quality',
      summaryText:
        'Automated clinical interpretation cannot be reliably established due to degraded or ungradable retinal image quality. Small microaneurysms, hemorrhages, and fine retinal details cannot be ruled out.',
      concordanceDetail:
        'Optical media opacity or focus degradation prevents valid model inference. In-person clinical examination and repeat image acquisition are required.',
      distinctionNote,
      requiresReview: true,
      detectedCount,
      detectedNames,
      totalLesionPixels,
      classifierVerdict,
    };
  }

  if (assessedItems.length === 0) {
    return {
      concordanceType: 'indeterminate',
      concordanceTitle: 'Lesion Segmentation Findings Unavailable',
      summaryText: `Whole-image neural classifier staging indicates ${classifierVerdict}. Focal lesion segmentation was not evaluated or recorded for this image.`,
      concordanceDetail:
        'Direct concordance comparison between classification and lesion burden cannot be performed without segmentation outputs. Clinician review required.',
      distinctionNote,
      requiresReview: true,
      detectedCount: 0,
      detectedNames: [],
      totalLesionPixels: 0,
      classifierVerdict,
    };
  }

  if (isClassifierNoDR && detectedCount === 0) {
    return {
      concordanceType: 'concordant_negative',
      concordanceTitle: 'Concordant Negative Findings (No DR)',
      summaryText:
        'Whole-image neural classification (No DR) and focal lesion segmentation (0 detected lesion areas across microaneurysms, hemorrhages, hard exudates, and soft exudates) demonstrate mutual agreement. Retinal microvasculature displays no automated evidence of diabetic retinopathy lesions across the examined field.',
      concordanceDetail:
        'Neural classifier staging and focal lesion segmentation models are in full concordance.',
      distinctionNote,
      requiresReview: false,
      detectedCount: 0,
      detectedNames: [],
      totalLesionPixels: 0,
      classifierVerdict,
    };
  }

  if (!isClassifierNoDR && detectedCount > 0) {
    return {
      concordanceType: 'concordant_positive',
      concordanceTitle: `Concordant Findings (${classifierVerdict})`,
      summaryText: `Whole-image neural classification (${classifierVerdict}) is supported by focal lesion segmentation, which identified ${detectedNames.join(', ')} (total quantified footprint: ${totalLesionPixels.toLocaleString()} px detected area).`,
      concordanceDetail:
        'Whole-image classification severity is concordant with localized lesion segmentation outputs.',
      distinctionNote,
      requiresReview: true,
      detectedCount,
      detectedNames,
      totalLesionPixels,
      classifierVerdict,
    };
  }

  if (!isClassifierNoDR && detectedCount === 0) {
    return {
      concordanceType: 'discrepant_classifier_positive',
      concordanceTitle: 'Output Discrepancy — Classifier Positive without Segmented Lesions',
      summaryText: `Whole-image neural classifier predicted ${classifierVerdict}, but no discrete lesion masks (0 px detected area) were identified by the lesion segmentation network across the 4 evaluated lesion classes. This discrepancy may arise from subtle microvascular changes below segmentation threshold, non-focal diffuse features, or classifier false positive.`,
      concordanceDetail:
        'Disagreement between classification and segmentation outputs. Independent clinician review required to evaluate clinical significance.',
      distinctionNote,
      requiresReview: true,
      detectedCount: 0,
      detectedNames: [],
      totalLesionPixels: 0,
      classifierVerdict,
    };
  }

  // isClassifierNoDR but detectedCount > 0
  return {
    concordanceType: 'discrepant_classifier_negative',
    concordanceTitle: 'Output Discrepancy — Focal Lesions Detected with No-DR Staging',
    summaryText: `Focal lesion segmentation detected candidate regions for ${detectedNames.join(', ')} (${totalLesionPixels.toLocaleString()} px detected area), whereas the whole-image classifier predicted No DR. This discrepancy may represent isolated early microvascular changes, non-DR vascular anomalies, or segmentation artifact.`,
    concordanceDetail:
      'Disagreement between classification and segmentation outputs. Clinician review required to verify whether segmented regions represent true clinical pathology.',
    distinctionNote,
    requiresReview: true,
    detectedCount,
    detectedNames,
    totalLesionPixels,
    classifierVerdict,
  };
}

export interface DRRecommendedAction {
  actionTitle: string;
  actionSummary: string;
  timingGuideline: string;
  protocolBasis: string;
  isReferral: boolean;
  priorityBadge: string;
}

/**
 * Determines actionable next steps based strictly on image quality,
 * validated screening criteria, and approved clinical referral guidelines.
 */
export function getRecommendedAction(params: {
  imageQuality?: string;
  drSeverity?: string;
  drSeverityLevel?: string;
  referralStatus?: string;
  referralPriority?: 'High' | 'Medium' | 'Low';
  referralReason?: string;
  recommendation?: string;
}): DRRecommendedAction {
  const isUngradable =
    params.imageQuality === 'Poor' ||
    params.imageQuality === 'Ungradable' ||
    (params.imageQuality || '').toLowerCase().includes('poor');

  if (isUngradable) {
    return {
      actionTitle: 'Repeat Retinal Photography Indicated',
      actionSummary:
        'Acquire repeat fundus image with pharmacological pupillary dilation, or arrange direct slit-lamp examination due to ungradable capture quality.',
      timingGuideline: 'Rescreen at earliest clinical availability',
      protocolBasis: 'NHS / ICO Protocol: Ungradable images cannot be safely cleared for routine annual recall.',
      isReferral: true,
      priorityBadge: 'Repeat Capture Required',
    };
  }

  const severity = (params.drSeverityLevel || params.drSeverity || '').toLowerCase();
  const isSevereOrPDR =
    severity.includes('severe') ||
    (severity.includes('proliferative') && !severity.includes('non-proliferative')) ||
    severity.includes('level 3') ||
    severity.includes('level 4');
  const isModerate = severity.includes('moderate') || severity.includes('level 2');
  const isMild = severity.includes('mild') || severity.includes('level 1');
  const isExplicitlyReferred = params.referralStatus === 'Referred' || params.referralStatus === 'Referred to Specialist' || params.referralPriority != null;

  if (isSevereOrPDR || params.referralPriority === 'High') {
    return {
      actionTitle: 'Comprehensive Ophthalmology Referral (Prompt Evaluation)',
      actionSummary:
        params.referralReason ||
        params.recommendation ||
        'Refer to a vitreo-retinal specialist for comprehensive dilated fundus examination, slit-lamp biomicroscopy, and macular optical coherence tomography (OCT).',
      timingGuideline: 'Within 2 to 4 weeks (Prompt Specialist Review)',
      protocolBasis: 'International Council of Ophthalmology (ICO) Guidelines for Severe / Proliferative DR',
      isReferral: true,
      priorityBadge: 'Prompt Specialist Review',
    };
  }

  if (isModerate || params.referralPriority === 'Medium') {
    return {
      actionTitle: 'Specialist Eye Care Referral',
      actionSummary:
        params.referralReason ||
        params.recommendation ||
        'Referral to eye care specialist for dilated clinical staging, assessment of macular involvement, and baseline retinal documentation.',
      timingGuideline: 'Within 1 to 3 months',
      protocolBasis: 'ICO Guidelines for Moderate Non-Proliferative Diabetic Retinopathy',
      isReferral: true,
      priorityBadge: 'Specialist Referral Indicated',
    };
  }

  if (isMild) {
    return {
      actionTitle: 'Clinical Surveillance & Medical Glycemic Review',
      actionSummary:
        params.recommendation ||
        'Continue periodic surveillance. Coordinate with primary physician to optimize glycemic control (target HbA1c < 7.0%), lipid panel, and blood pressure.',
      timingGuideline: 'Follow-up eye examination in 6 to 12 months',
      protocolBasis: 'ICO Guidelines for Mild Non-Proliferative Diabetic Retinopathy',
      isReferral: isExplicitlyReferred,
      priorityBadge: 'Periodic Surveillance',
    };
  }

  // No DR
  return {
    actionTitle: 'Routine Annual Diabetic Eye Screening Cycle',
    actionSummary:
      params.recommendation ||
      'No referable retinopathy detected. Continue standard annual preventive diabetic eye screening and maintain strict systemic glycemic and blood pressure targets.',
    timingGuideline: 'Rescreen in 12 months (Annual Screening Cycle)',
    protocolBasis: 'Standard Annual Tele-Retinal Diabetic Eye Screening Protocol',
    isReferral: false,
    priorityBadge: 'Annual Screening',
  };
}

/**
 * Backward-compatible helper for legacy consumers.
 */
export function generateDrClinicalSummary(params: {
  lesionData?: Record<string, any> | null;
  drSeverity?: string;
  drSeverityLevel?: string;
  confidence?: number;
  imageQuality?: string;
  vesselDensity?: number;
  vesselPixels?: number;
}): {
  summaryParagraph: string;
  detectedCount: number;
  detectedNames: string[];
  totalLesionPixels: number;
  classifierVerdict: string;
} {
  const interp = generateDrClinicalInterpretation(params);
  return {
    summaryParagraph: interp.summaryText,
    detectedCount: interp.detectedCount,
    detectedNames: interp.detectedNames,
    totalLesionPixels: interp.totalLesionPixels,
    classifierVerdict: interp.classifierVerdict,
  };
}

/**
 * Concise 'What This Means' explanation for the predicted screening category.
 * Explicitly states that this is an AI prediction requiring clinical verification.
 */
export function getCategoryWhatThisMeans(params: {
  drSeverity?: string;
  drSeverityLevel?: string;
  imageQuality?: string;
} | string): {
  categoryTitle: string;
  clinicalMeaning: string;
  verificationNotice: string;
} {
  const normalizedParams = typeof params === 'string' ? { drSeverity: params } : (params || {});
  const isUngradable =
    normalizedParams.imageQuality === 'Poor' ||
    normalizedParams.imageQuality === 'Ungradable' ||
    (normalizedParams.imageQuality || '').toLowerCase().includes('poor');

  if (isUngradable) {
    return {
      categoryTitle: 'Ungradable Retinal Photography',
      clinicalMeaning:
        'Optical blur, inadequate illumination, or media opacity prevents reliable automated analysis. Subtle microvascular lesions cannot be evaluated or ruled out from this capture.',
      verificationNotice:
        'This image cannot safely exclude diabetic retinopathy. Clinical examination with pharmacological pupil dilation or repeat imaging is required.',
    };
  }

  const severity = (normalizedParams.drSeverityLevel || normalizedParams.drSeverity || '').toLowerCase();

  if ((severity.includes('proliferative') && !severity.includes('non-proliferative')) || severity.includes('level 4')) {
    return {
      categoryTitle: 'Proliferative Diabetic Retinopathy (PDR - Level 4)',
      clinicalMeaning:
        'The AI model identified high-risk microvascular features consistent with proliferative diabetic retinopathy (such as neovascularization or vitreous/preretinal hemorrhage risk).',
      verificationNotice:
        'This is an automated decision-support finding indicating high urgency, NOT a confirmed diagnosis. Prompt in-person vitreo-retinal evaluation is required.',
    };
  }

  if (severity.includes('severe') || severity.includes('level 3')) {
    return {
      categoryTitle: 'Severe Non-Proliferative DR (Level 3)',
      clinicalMeaning:
        'The AI model identified extensive intraretinal microvascular compromise consistent with Severe NPDR (high risk of progression to proliferative retinopathy).',
      verificationNotice:
        'This is an automated screening prediction. Comprehensive dilated examination by an ophthalmologist is required to establish clinical staging.',
    };
  }

  if (severity.includes('moderate') || severity.includes('level 2')) {
    return {
      categoryTitle: 'Moderate Non-Proliferative DR (Level 2)',
      clinicalMeaning:
        'The AI model identified microvascular lesions (such as microaneurysms, intraretinal hemorrhages, or exudates) exceeding mild disease but below severe thresholds.',
      verificationNotice:
        'This is an automated screening prediction and decision-support aid, not a confirmed clinical diagnosis. Slit-lamp biomicroscopy by an ophthalmologist is required to verify findings.',
    };
  }

  if (severity.includes('mild') || severity.includes('level 1')) {
    return {
      categoryTitle: 'Mild Non-Proliferative DR (Level 1)',
      clinicalMeaning:
        'The AI model identified early retinal microvascular changes (typically isolated microaneurysms) without widespread hemorrhages or exudative changes.',
      verificationNotice:
        'This is an automated screening prediction. Periodic surveillance and medical glycemic optimization are indicated upon clinical verification.',
    };
  }

  // Default: No DR
  return {
    categoryTitle: 'No Diabetic Retinopathy Detected (Level 0)',
    clinicalMeaning:
      'The AI model identified no observable microaneurysms, hemorrhages, hard exudates, or soft exudates across the examined retinal field.',
    verificationNotice:
      'This is an automated screening result and decision-support aid. Routine annual screening is appropriate unless clinical symptoms or systemic factors indicate otherwise.',
  };
}

/**
 * Explains the actual model score without presenting it as an uncalibrated disease probability.
 */
export function getModelScoreExplanation(score?: number | null): {
  scoreDisplay: string;
  explanation: string;
  safetyNote: string;
} {
  const scoreDisplay = score != null ? `${score}%` : 'Unavailable';
  const explanation =
    'Raw algorithmic confidence score (activation strength) produced by the neural network classifier for the selected category.';
  const safetyNote =
    'This is an uncalibrated algorithm output score, NOT a calibrated statistical probability that the patient has disease or of clinical progression.';

  return {
    scoreDisplay,
    explanation,
    safetyNote,
  };
}

/**
 * Clear clinical descriptions of the 5 standard model visualizations.
 */
export const VISUALIZATION_EXPLANATIONS = {
  original: {
    title: '1. Original Fundus Image',
    short: 'True-color reference image',
    description:
      'Unaltered color retinal photograph captured at the screening station. Serves as primary ground truth for clinical review.',
  },
  lesions: {
    title: '2. Lesion Visualization',
    short: 'Candidate microvascular lesions',
    description:
      'Multi-task neural network segmentation identifying candidate microvascular lesions: Red (MA), Purple (HE), Yellow (EX), and Green (SE).',
  },
  gradcam: {
    title: '3. Grad-CAM++ Attention',
    short: 'Model activation heatmap',
    description:
      'Visual explanation of neural network attention, showing which retinal regions most strongly influenced the whole-image severity prediction (warmer red/yellow indicates higher model focus).',
  },
  anatomy: {
    title: '4. Retinal Anatomy Map',
    short: 'Disc, fovea & vessel contours',
    description:
      'Automated anatomical localization of key landmarks including optic disc contour, fovea centralis, estimated macula ROI, and blood vessel network.',
  },
  combined: {
    title: '5. Combined AI Overlay',
    short: 'Integrated lesions & landmarks',
    description:
      'Multi-task neural network segmentation mask overlaying candidate lesion regions (Red: MA, Purple: HE, Yellow: EX, Green: SE) and anatomical contours.',
  },
};

/**
 * Generates plain-language limitation explanations when outputs are missing or degraded.
 */
export function getModelLimitations(params: {
  lesionData?: Record<string, any> | null;
  anatomyData?: Record<string, any> | null;
  imageQuality?: string;
  isUngradable?: boolean;
}): string[] {
  const limitations: string[] = [];
  const quality = (params.imageQuality || '').toLowerCase();

  if (params.isUngradable || quality === 'poor' || quality === 'ungradable') {
    limitations.push(
      'Image Quality Limitation: Degraded illumination or optical focus limits automated sensitivity. Small microaneurysms or fine peripheral lesions may be obscured.'
    );
  } else if (quality === 'borderline' || quality === 'moderate' || quality === 'review') {
    limitations.push(
      'Image Quality Limitation: Borderline capture clarity observed. Clinical correlation is recommended to verify fine microvascular details.'
    );
  }

  const items = extractLesionItems(params.lesionData);
  const assessed = items.filter(i => i.isAssessed);
  if (assessed.length === 0) {
    limitations.push(
      'Lesion Segmentation Limitation: Focal lesion segmentation data was not evaluated or recorded for this screening record. Whole-image classification is presented without localized lesion masks.'
    );
  }

  const anatomy = params.anatomyData;
  if (!anatomy || (!anatomy.fovea && !anatomy.optic_disc)) {
    limitations.push(
      'Anatomical Localization Limitation: Retinal landmarks (optic disc or fovea centralis) could not be localized or were not evaluated. Spatial proximity measurements are unavailable.'
    );
  }

  return limitations;
}

