/**
 * SINGLE SOURCE OF TRUTH for screening disease synchronization.
 *
 * Every page/component must derive disease/pipeline labels from the
 * screening record's `screeningType` (database `screening_type` field),
 * NEVER from route, array position, or presence of prediction fields.
 *
 * Canonical values (match backend `screening_type` enum):
 *   'dr' | 'cataract' | 'glaucoma'
 *
 * IMPORTANT: The backend enriches EVERY screening with ALL prediction
 * fields (drSeverity, cataractPrediction, glaucomaPrediction) regardless
 * of type. So `if (rec.glaucomaPrediction)` is ALWAYS truthy and must
 * NEVER be used to infer disease. Only `screeningType` decides.
 */

export type ScreeningDisease = 'dr' | 'cataract' | 'glaucoma';

export const DISEASE_CONFIG: Record<
  ScreeningDisease,
  { label: string; pipelineBadge: string; shortLabel: string }
> = {
  dr: {
    label: 'Diabetic Retinopathy',
    pipelineBadge: 'Diabetic Retinopathy',
    shortLabel: 'DR',
  },
  cataract: {
    label: 'Cataract',
    pipelineBadge: 'Cataract Pipeline',
    shortLabel: 'Cataract',
  },
  glaucoma: {
    label: 'Glaucoma',
    pipelineBadge: 'Glaucoma Pipeline',
    shortLabel: 'Glaucoma',
  },
};

/**
 * Normalize any raw disease string to the canonical ScreeningDisease.
 * Accepts: 'dr', 'diabetic_retinopathy', 'diabetic retinopathy', 'cataract', 'glaucoma',
 * case-insensitive. Returns null when unknown (caller must handle, never guess).
 */
export function normalizeDisease(raw: unknown): ScreeningDisease | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === 'dr' || v === 'diabetic_retinopathy' || v === 'diabetic retinopathy' || v === 'diabetic-retinopathy' || v.includes('retinopathy')) {
    return 'dr';
  }
  if (v === 'cataract') return 'cataract';
  if (v === 'glaucoma') return 'glaucoma';
  return null;
}

/**
 * Read the disease ONLY from the record's explicit screening-type field.
 * Checks (in order): screeningType, screening_type, pipeline, disease, type.
 * Returns null if the record carries no explicit type — callers must NOT
 * fall back to another record or route default.
 */
export function getScreeningDisease(rec: Record<string, any> | null | undefined): ScreeningDisease | null {
  if (!rec || typeof rec !== 'object') return null;
  const candidates = [
    (rec as any).screeningType,
    (rec as any).screening_type,
    (rec as any).pipeline,
    (rec as any).disease,
  ];
  for (const c of candidates) {
    const n = normalizeDisease(c);
    if (n) return n;
  }
  // `type` is used by analytics-normalized objects; only accept known values.
  const t = normalizeDisease((rec as any).type);
  if (t) return t;
  return null;
}

/**
 * Resolve disease for a screening record, using explicit screeningType first.
 * ID-prefix (CAT-/GLC-/SCR-) is used ONLY as a last resort for legacy
 * locally-created records that predate the screeningType field.
 */
export function resolveScreeningDisease(rec: Record<string, any> | null | undefined): ScreeningDisease | null {
  const explicit = getScreeningDisease(rec);
  if (explicit) return explicit;
  const id = typeof (rec as any)?.id === 'string' ? ((rec as any).id as string).toUpperCase() : '';
  if (id.startsWith('CAT-')) return 'cataract';
  if (id.startsWith('GLC-')) return 'glaucoma';
  if (id.startsWith('SCR-') || id.startsWith('DR-')) return 'dr';
  return null;
}

export function diseaseLabel(d: ScreeningDisease | null): string {
  if (!d) return 'Screening';
  return DISEASE_CONFIG[d].label;
}

export function pipelineBadgeLabel(d: ScreeningDisease | null): string {
  if (!d) return 'Screening';
  return DISEASE_CONFIG[d].pipelineBadge;
}
