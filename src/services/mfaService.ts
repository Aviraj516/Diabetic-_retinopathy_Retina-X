import { supabase } from '../lib/supabase';

export interface MfaVerificationResult {
  success: boolean;
  error?: string;
  currentLevel?: 'aal1' | 'aal2' | null;
}

export interface MfaFactorInfo {
  id: string;
  friendlyName?: string;
  factorType: string;
  status: 'verified' | 'unverified';
  createdAt: string;
  updatedAt: string;
}

export interface MfaEnrollResult {
  success: boolean;
  factorId?: string;
  qrCode?: string;
  secret?: string;
  uri?: string;
  isAlreadyVerified?: boolean;
  error?: string;
}

/**
 * Retrieves the Authenticator Assurance Level (AAL) for the current active session.
 */
export async function getMfaAssuranceLevel(): Promise<{
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) {
      return { currentLevel: null, nextLevel: null, error: error?.message };
    }
    return {
      currentLevel: data.currentLevel as 'aal1' | 'aal2' | null,
      nextLevel: data.nextLevel as 'aal1' | 'aal2' | null,
    };
  } catch (err: any) {
    return {
      currentLevel: null,
      nextLevel: null,
      error: err?.message || 'Failed to check assurance level.',
    };
  }
}

/**
 * Lists all MFA factors for the authenticated user and segments verified vs unverified.
 */
export async function listUserMfaFactors(): Promise<{
  all: MfaFactorInfo[];
  totp: MfaFactorInfo[];
  verifiedTotp: MfaFactorInfo[];
  unverifiedTotp: MfaFactorInfo[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) {
      return {
        all: [],
        totp: [],
        verifiedTotp: [],
        unverifiedTotp: [],
        error: error?.message,
      };
    }

    const all: MfaFactorInfo[] = (data.all || []).map((f: any) => ({
      id: f.id,
      friendlyName: f.friendly_name || f.friendlyName || '',
      factorType: f.factor_type || f.factorType || '',
      status: (f.status as 'verified' | 'unverified') || 'unverified',
      createdAt: f.created_at || f.createdAt || '',
      updatedAt: f.updated_at || f.updatedAt || '',
    }));

    const totp = all.filter((f) => f.factorType === 'totp');
    const verifiedTotp = totp.filter((f) => f.status === 'verified');
    const unverifiedTotp = totp.filter((f) => f.status === 'unverified');

    return { all, totp, verifiedTotp, unverifiedTotp };
  } catch (err: any) {
    return {
      all: [],
      totp: [],
      verifiedTotp: [],
      unverifiedTotp: [],
      error: err?.message || 'Failed to list factors.',
    };
  }
}

// In-flight enrollment lock to eliminate race conditions from concurrent mounts or double invocations
let activeEnrollmentPromise: Promise<MfaEnrollResult> | null = null;

/**
 * FLOW 1: First-time MFA Enrollment
 *
 * Robustly inspects factors before enrollment:
 * 1. If a verified TOTP factor already exists, reports isAlreadyVerified: true.
 * 2. If unverified TOTP factors exist from previous cancelled attempts, unenrolls them first
 *    to prevent "factor with friendly name already exists" errors.
 * 3. Enrolls the new TOTP factor with Supabase Auth MFA.
 * 4. Includes automatic self-healing recovery if a friendly name collision is encountered.
 */
export async function enrollTotpFactor(
  friendlyName = 'RETINA-X Google Authenticator'
): Promise<MfaEnrollResult> {
  if (activeEnrollmentPromise) {
    return activeEnrollmentPromise;
  }

  activeEnrollmentPromise = (async (): Promise<MfaEnrollResult> => {
    try {
      // Step 1: Inspect existing user factors from Supabase Auth
      const factorList = await listUserMfaFactors();

      // Case A: User already has an enrolled & verified factor
      if (factorList.verifiedTotp && factorList.verifiedTotp.length > 0) {
        return {
          success: false,
          isAlreadyVerified: true,
          factorId: factorList.verifiedTotp[0].id,
          error: 'Account already has a verified two-step verification factor.',
        };
      }

      // Case B: Clean up any stale unverified TOTP factors to avoid friendly-name collisions
      if (factorList.unverifiedTotp && factorList.unverifiedTotp.length > 0) {
        for (const unfactor of factorList.unverifiedTotp) {
          try {
            await supabase.auth.mfa.unenroll({ factorId: unfactor.id });
          } catch (unenrollErr) {
            console.warn('[enrollTotpFactor] Unenroll unverified factor notice:', unenrollErr);
          }
        }
      }

      // Step 2: Enroll new TOTP factor directly via Supabase Auth MFA
      let enrollRes = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      // Self-healing fallback: If Supabase returns a friendly-name collision error
      if (enrollRes.error) {
        const errMsg = (enrollRes.error.message || '').toLowerCase();
        if (errMsg.includes('already exists') || errMsg.includes('friendly name')) {
          console.warn('[enrollTotpFactor] Friendly name collision detected. Performing aggressive factor cleanup and retrying...');

          // Re-list and remove any remaining unverified factors
          const refreshList = await listUserMfaFactors();

          if (refreshList.verifiedTotp && refreshList.verifiedTotp.length > 0) {
            return {
              success: false,
              isAlreadyVerified: true,
              factorId: refreshList.verifiedTotp[0].id,
              error: 'Account already has a verified two-step verification factor.',
            };
          }

          if (refreshList.unverifiedTotp && refreshList.unverifiedTotp.length > 0) {
            for (const unfactor of refreshList.unverifiedTotp) {
              try {
                await supabase.auth.mfa.unenroll({ factorId: unfactor.id });
              } catch {
                // Ignore cleanup errors
              }
            }
          }

          // Retry enrollment cleanly
          enrollRes = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName,
          });
        }
      }

      const { data, error } = enrollRes;

      if (error || !data || !data.totp) {
        return {
          success: false,
          error: error?.message || 'Failed to initialize TOTP enrollment with Supabase.',
        };
      }

      return {
        success: true,
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unexpected error during TOTP enrollment.',
      };
    } finally {
      activeEnrollmentPromise = null;
    }
  })();

  return activeEnrollmentPromise;
}

/**
 * FLOW 1: Verifies first-time MFA Enrollment code.
 * 1. Creates challenge: supabase.auth.mfa.challenge({ factorId })
 * 2. Verifies code: supabase.auth.mfa.verify({ factorId, challengeId, code })
 * 3. Confirms session upgrade to AAL2
 */
export async function verifyTotpEnrollment(
  factorId: string,
  code: string
): Promise<MfaVerificationResult> {
  const cleanCode = code.trim().replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    return {
      success: false,
      error: 'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.',
    };
  }

  try {
    // 1. Create a challenge
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError || !challengeData?.id) {
      return {
        success: false,
        error: challengeError?.message || 'Failed to initialize verification challenge.',
      };
    }

    const challengeId = challengeData.id;

    // 2. Verify using Supabase Auth MFA API
    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: cleanCode,
    });

    if (verifyError || !verifyData) {
      return {
        success: false,
        error: 'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.',
      };
    }

    // 3. Confirm upgraded to AAL2
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== 'aal2') {
      await supabase.auth.refreshSession();
    }

    return {
      success: true,
      currentLevel: (aalData?.currentLevel as 'aal1' | 'aal2' | null) || 'aal2',
    };
  } catch {
    return {
      success: false,
      error: 'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.',
    };
  }
}

/**
 * FLOW 2: Verifies code for an already enrolled and verified TOTP factor.
 * 1. Resolves factorId from verified factors if not explicitly provided
 * 2. Creates challenge: supabase.auth.mfa.challenge({ factorId })
 * 3. Verifies code: supabase.auth.mfa.verify({ factorId, challengeId, code })
 * 4. Confirms session upgrade to AAL2
 */
export async function verifyMfaChallenge(
  code: string,
  factorId?: string
): Promise<MfaVerificationResult> {
  const cleanCode = code.trim().replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    return {
      success: false,
      error: 'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.',
    };
  }

  try {
    let targetFactorId = factorId;

    if (!targetFactorId) {
      const factors = await listUserMfaFactors();
      if (factors.verifiedTotp.length === 0) {
        return {
          success: false,
          error: 'No verified TOTP factor found on this account.',
        };
      }
      targetFactorId = factors.verifiedTotp[0].id;
    }

    // 1. Create challenge
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: targetFactorId,
    });

    if (challengeError || !challengeData?.id) {
      return {
        success: false,
        error: challengeError?.message || 'Failed to initialize verification challenge.',
      };
    }

    const challengeId = challengeData.id;

    // 2. Verify code
    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId: targetFactorId,
      challengeId,
      code: cleanCode,
    });

    if (verifyError || !verifyData) {
      return {
        success: false,
        error: 'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.',
      };
    }

    // 3. Confirm upgraded to AAL2
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== 'aal2') {
      await supabase.auth.refreshSession();
    }

    return {
      success: true,
      currentLevel: (aalData?.currentLevel as 'aal1' | 'aal2' | null) || 'aal2',
    };
  } catch {
    return {
      success: false,
      error: 'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.',
    };
  }
}

/**
 * Direct drop-in function used by existing TwoStepVerificationPage.
 * Centralizes verification via real Supabase MFA APIs.
 */
export async function verifyMfaCode(
  code: string,
  factorId?: string
): Promise<MfaVerificationResult> {
  return verifyMfaChallenge(code, factorId);
}
