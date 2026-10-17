import cataractImg from '../assets/conditions/cataract.jpg';
import drImg from '../assets/conditions/diabetic_retinopathy.jpg';
import glaucomaImg from '../assets/conditions/glaucoma.jpg';
import amdImg from '../assets/conditions/amd.jpg';
import keratitisImg from '../assets/conditions/keratitis.jpg';

export const FALLBACK_IMAGES = {
  cataract: cataractImg,
  dr: drImg,
  glaucoma: glaucomaImg,
  amd: amdImg,
  keratitis: keratitisImg,
};

/**
 * TRINAY Image Resolution and Artifact URL Utilities
 * Ensures robust image loading across base64 data URLs, server-persisted artifact URLs,
 * and handles missing/loading/error states gracefully.
 */
export function resolveImageUrl(src?: string | null, fallback = ''): string {
  if (!src || typeof src !== 'string') {
    return fallback;
  }

  const trimmed = src.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return fallback;
  }

  // Already a complete Data URI
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // Raw base64 JPEG string (starts with /9j/ which MUST be checked before startsWith('/'))
  if (trimmed.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${trimmed}`;
  }

  // Raw base64 PNG string (starts with iVBORw0KGgo)
  if (trimmed.startsWith('iVBORw0KGgo')) {
    return `data:image/png;base64,${trimmed}`;
  }

  // HTTP, Relative API path, or Blob (valid URL paths are short and do not contain raw base64)
  if (
    (trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('blob:') ||
      (trimmed.startsWith('/') && !trimmed.startsWith('/9j/') && trimmed.length < 500))
  ) {
    return trimmed;
  }

  // Other raw base64 data without data: prefix
  if (trimmed.length > 50 && !trimmed.includes(' ') && !trimmed.includes('\n')) {
    if (trimmed.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${trimmed}`;
    }
    return `data:image/png;base64,${trimmed}`;
  }

  return fallback;
}

export function getArtifactUrl(screeningId?: string | null, artifactName?: string | null): string {
  if (!screeningId || !artifactName || typeof screeningId !== 'string' || typeof artifactName !== 'string') return '';
  // Sanitize: screening IDs must be concise identifiers (UUID or CAT-XXXXX / SCR-XXXXX), never base64
  const cleanId = screeningId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanName = artifactName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId || cleanId.length > 100 || !cleanName || cleanName.length > 50) {
    return '';
  }
  return `/api/screenings/${encodeURIComponent(cleanId)}/artifacts/${encodeURIComponent(cleanName)}`;
}


