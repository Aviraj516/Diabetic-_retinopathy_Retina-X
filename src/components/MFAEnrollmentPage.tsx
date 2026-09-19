import React, { useState, useRef, useEffect } from 'react';
import { Eye, ArrowRight, Loader2, ShieldCheck, Copy, Check, QrCode, KeyRound, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { enrollTotpFactor, verifyTotpEnrollment } from '../services/mfaService';

export const MFAEnrollmentPage: React.FC = () => {
  const { pendingUser, confirmTwoFactorLogin, cancelTwoFactor, switchToTwoFactorChallenge } = useApp();

  // Enrollment data state from Supabase
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState<boolean>(true);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Manual key fallback toggle
  const [showManualKey, setShowManualKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // 6-digit OTP verification state
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isMountedRef = useRef<boolean>(true);

  // Fetch real TOTP enrollment factor from Supabase on mount
  const loadEnrollment = async () => {
    setIsEnrolling(true);
    setEnrollError(null);
    setVerifyError(null);
    setOtp(['', '', '', '', '', '']);

    try {
      const res = await enrollTotpFactor('RETINA-X Google Authenticator');
      if (!isMountedRef.current) return;

      if (res.isAlreadyVerified) {
        // User already has an enrolled & verified factor; seamlessly route to standard verification challenge
        switchToTwoFactorChallenge(res.factorId);
        return;
      }

      if (res.success && res.factorId && res.qrCode) {
        setFactorId(res.factorId);
        setQrCodeData(res.qrCode);
        setSecret(res.secret || null);
      } else {
        setEnrollError(res.error || 'Failed to generate two-step verification factor. Please try again.');
      }
    } catch {
      if (isMountedRef.current) {
        setEnrollError('Failed to generate two-step verification factor. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsEnrolling(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadEnrollment();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isComplete = otp.every((digit) => digit !== '');

  const handleOtpChange = (index: number, value: string) => {
    const numericChar = value.replace(/\D/g, '').slice(-1);

    if (!numericChar && value !== '') {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = numericChar;
    setOtp(newOtp);
    setVerifyError(null);

    // Auto-advance to next input if digit entered
    if (numericChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newOtp = [...otp];

      if (otp[index]) {
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      }
      setVerifyError(null);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const numericDigits = pasteData.replace(/\D/g, '').slice(0, 6);

    if (!numericDigits) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = numericDigits[i] || '';
    }
    setOtp(newOtp);
    setVerifyError(null);

    const nextEmptyIndex = newOtp.findIndex((d) => d === '');
    const focusTarget = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[focusTarget]?.focus();
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } catch {
      // Fallback
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError(null);

    if (!isComplete || !factorId) {
      return;
    }

    const code = otp.join('');
    setIsVerifying(true);

    try {
      const res = await verifyTotpEnrollment(factorId, code);

      if (res.success) {
        setIsSuccess(true);
        // Supabase session has been upgraded to AAL2
        // Transition to user role-based dashboard
        await confirmTwoFactorLogin();
      } else {
        setVerifyError(
          res.error || 'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.'
        );
        setIsVerifying(false);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setVerifyError('Invalid verification code. Please enter the current 6-digit code from Google Authenticator.');
      setIsVerifying(false);
    }
  };

  // Convert SVG string or data URL for rendering in img tag
  const getQrSrc = (raw: string | null): string => {
    if (!raw) return '';
    if (raw.startsWith('data:image/')) return raw;
    if (raw.trim().startsWith('<svg')) {
      return `data:image/svg+xml;utf-8,${encodeURIComponent(raw)}`;
    }
    return raw;
  };

  // Format secret with spacing for readability
  const formattedSecret = secret ? secret.replace(/(.{4})/g, '$1 ').trim() : '';

  return (
    <div className="min-h-screen bg-[#070D19] flex items-center justify-center p-4 selection:bg-blue-600 selection:text-white relative">
      {/* Background ambient lighting matching LoginPage */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>

      {/* Centered Enrollment Card */}
      <div className="relative w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden z-10">
        {/* Brand Header */}
        <div className="p-8 pb-5 text-center border-b border-slate-800/80">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 mb-3 shadow-lg shadow-blue-900/30">
            <Eye className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            RETINA<span className="text-blue-500">-X</span>
          </h1>

          <div className="mt-3 space-y-1">
            <h2 className="text-lg font-bold text-slate-100 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Set Up Two-Step Verification</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Scan this QR code using Google Authenticator.
            </p>
          </div>

          {pendingUser && (
            <div className="mt-3 inline-block px-3 py-1 bg-slate-800/60 border border-slate-700/60 rounded-full text-[11px] text-slate-400 font-medium">
              Signing in as <span className="text-blue-400 font-semibold">{pendingUser.email || pendingUser.id}</span>
            </div>
          )}
        </div>

        {/* Enrollment Body */}
        <div className="p-8 pt-6 space-y-5">
          {enrollError ? (
            <div className="p-4 bg-red-950/70 border border-red-800/80 rounded-xl text-xs text-red-300 space-y-3 text-center">
              <p>{enrollError}</p>
              <button
                type="button"
                onClick={loadEnrollment}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-900/60 hover:bg-red-900 text-red-100 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Setup</span>
              </button>
            </div>
          ) : isEnrolling ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <p className="text-xs font-medium">Generating Authenticator QR Code...</p>
            </div>
          ) : (
            <>
              {/* QR Code Presentation */}
              <div className="flex flex-col items-center justify-center">
                {qrCodeData && (
                  <div className="bg-white p-3.5 rounded-2xl shadow-lg border border-slate-300 inline-flex items-center justify-center">
                    <img
                      src={getQrSrc(qrCodeData)}
                      alt="Google Authenticator QR Code"
                      className="w-44 h-44 sm:w-48 sm:h-48 object-contain"
                    />
                  </div>
                )}

                {/* Fallback Option */}
                <div className="mt-3 text-center w-full">
                  <button
                    type="button"
                    onClick={() => setShowManualKey(!showManualKey)}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer py-1"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Can't scan? Enter this setup key manually.</span>
                  </button>

                  {showManualKey && secret && (
                    <div className="mt-2 p-3 bg-slate-800/90 border border-slate-700/80 rounded-xl text-left space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                          Account Key (Base32)
                        </span>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                        >
                          {copiedKey ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Key</span>
                            </>
                          )}
                        </button>
                      </div>
                      <code className="block text-xs font-mono font-bold text-amber-300 select-all tracking-wider break-all bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                        {formattedSecret}
                      </code>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        In Google Authenticator, tap <strong className="text-slate-300">+</strong> → <strong className="text-slate-300">Enter a setup key</strong>, enter "RETINA-X" as Account name, paste this key, and select Time-based.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Verification Form */}
              <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                <div className="text-center">
                  <label className="block text-xs font-medium text-slate-300">
                    Enter the 6-digit code from your Google Authenticator app.
                  </label>
                </div>

                {verifyError && (
                  <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-start gap-2 animate-in fade-in duration-150">
                    <span className="font-bold shrink-0">!</span>
                    <span>{verifyError}</span>
                  </div>
                )}

                {/* 6 OTP Boxes */}
                <div className="flex items-center justify-between gap-2 sm:gap-2.5 my-1">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (inputRefs.current[idx] = el)}
                      id={`enroll-otp-input-${idx}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      disabled={isVerifying || isSuccess}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={handlePaste}
                      aria-label={`Enrollment Digit ${idx + 1}`}
                      className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold font-mono rounded-xl transition-colors focus:outline-hidden ${
                        verifyError
                          ? 'bg-red-950/20 border border-red-800/80 text-red-200 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                          : 'bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    />
                  ))}
                </div>

                {/* Verify & Continue Button */}
                <button
                  id="enroll-verify-btn"
                  type="submit"
                  disabled={!isComplete || isVerifying || isSuccess}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1E60D5] hover:bg-blue-600 active:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-900/30 transition-all text-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isVerifying ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : isSuccess ? (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Enrolled! Loading Dashboard...</span>
                    </div>
                  ) : (
                    <>
                      <span>Verify &amp; Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Secondary Action: Back to Login */}
          <div className="text-center pt-1 border-t border-slate-800/60">
            <button
              type="button"
              id="enroll-back-to-login-btn"
              onClick={cancelTwoFactor}
              disabled={isVerifying}
              className="inline-flex items-center text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer py-1 disabled:opacity-50"
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
