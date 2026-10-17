/**
 * TRINAY Cataract — shared AI-evidence explanation helpers.
 *
 * SINGLE SOURCE OF TRUTH: dashboard, clinical report page, and PDF all derive
 * their evidence-intensity label and "why this result" text from the CURRENT
 * screening's own values (prediction, probabilities, quantitativeAnalysis).
 * No hardcoded results, no clinical severity claims.
 */

export type EvidenceIntensityLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface EvidenceQuant {
  analyzedRegionAreaPx?: number;
  opacityEvidenceAreaPx?: number;
  opacityEvidencePercentage?: number;
  evidenceIntensity?: string;
  evidenceCoveragePct?: number;
  evidenceMethod?: string;
  highEvidencePx?: number;
  moderateEvidencePx?: number;
  lowEvidencePx?: number;
}

export function getEvidenceIntensityLevel(quant?: EvidenceQuant | null): EvidenceIntensityLevel {
  const raw = (quant?.evidenceIntensity || '').toUpperCase();
  if (raw === 'HIGH' || raw === 'MODERATE' || raw === 'LOW') return raw;
  // Fallback derives from the same coverage number the backend computed.
  const coverage = quant?.evidenceCoveragePct ?? quant?.opacityEvidencePercentage ?? 0;
  if (coverage >= 8) return 'HIGH';
  if (coverage >= 2) return 'MODERATE';
  return 'LOW';
}

export function getEvidenceIntensityExplanation(level: EvidenceIntensityLevel): {
  title: string;
  meaning: string;
  interpretation: string;
  clinicalNote: string;
  action: string;
} {
  switch (level) {
    case 'HIGH':
      return {
        title: 'HIGH AI EVIDENCE',
        meaning:
          'A strong concentration of model-derived features associated with the cataract class is present in the analyzed lens region.',
        interpretation:
          'The classifier found strong visual evidence supporting its cataract prediction.',
        clinicalNote:
          'This is AI screening evidence, NOT a definitive clinical diagnosis or severity grade.',
        action: 'Recommend ophthalmologist evaluation and clinical confirmation.',
      };
    case 'MODERATE':
      return {
        title: 'MODERATE AI EVIDENCE',
        meaning:
          'A larger or stronger region contains model-derived features associated with the cataract class.',
        interpretation:
          'The classifier found more consistent cataract-associated visual features.',
        clinicalNote:
          'This does NOT automatically establish cataract severity.',
        action: 'Review the original image and consider ophthalmic examination.',
      };
    default:
      return {
        title: 'LOW AI EVIDENCE',
        meaning:
          'The analyzed region contains relatively little model-derived visual evidence associated with the cataract class.',
        interpretation:
          'The classifier has limited visual evidence supporting cataract.',
        clinicalNote:
          'This does NOT automatically mean "mild cataract" or "no disease".',
        action: 'Interpret together with the original image and clinical examination.',
      };
  }
}

export interface WhyExplanationInput {
  prediction: string;
  cataractProbability: number; // 0..1
  normalProbability: number; // 0..1
  quant?: EvidenceQuant | null;
}

export function buildCataractWhyExplanation(input: WhyExplanationInput): {
  whyResult: string;
  visualEvidence: string;
  whatItMeans: string;
  nextStep: string;
} {
  const isCataract = String(input.prediction || '').toUpperCase().includes('CATARACT');
  const catPct = (input.cataractProbability * 100).toFixed(2);
  const normPct = (input.normalProbability * 100).toFixed(2);
  const level = getEvidenceIntensityLevel(input.quant);
  const intensity = getEvidenceIntensityExplanation(level);
  const coverage =
    input.quant?.evidenceCoveragePct ?? input.quant?.opacityEvidencePercentage ?? 0;

  if (isCataract) {
    return {
      whyResult:
        `The cataract classifier identified visual features in the analyzed lens region that were more ` +
        `consistent with the cataract class than the normal class. The current model probability is ${catPct}% ` +
        `cataract versus ${normPct}% normal.`,
      visualEvidence:
        `The evidence map highlights the regions that contributed most strongly to the AI-derived cataract ` +
        `evidence (${intensity.title.toLowerCase()} — ${coverage.toFixed(1)}% of the analyzed region). ` +
        `Grad-CAM++ independently marks the image regions that most influenced this prediction.`,
      whatItMeans:
        `The result indicates AI screening evidence associated with cataract (${intensity.interpretation.toLowerCase()}). ` +
        `It does not establish clinical cataract severity or replace a slit-lamp examination.`,
      nextStep:
        `For a positive AI screening result, ophthalmologist evaluation and clinical examination are recommended.`,
    };
  }
  return {
    whyResult:
      `The current model found stronger evidence for the normal class (${normPct}%) than for the cataract ` +
      `class (${catPct}%). ${intensity.title} cataract-associated evidence was detected ` +
      `(${coverage.toFixed(1)}% of the analyzed region).`,
    visualEvidence:
      `The evidence map shows little or no cataract-associated activation in the analyzed lens region, and ` +
      `Grad-CAM++ marks the regions that most influenced the normal prediction.`,
    whatItMeans:
      `This is a screening result indicating a clear lens pattern today. It does not exclude clinical ` +
      `abnormalities that may require examination if visual symptoms exist.`,
    nextStep:
      `Continue routine annual eye examinations, and seek care promptly if vision changes occur.`,
  };
}
