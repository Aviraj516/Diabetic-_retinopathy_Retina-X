import React, { useState, useRef, useEffect } from 'react';
import { Eye, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { verifyMfaCode } from '../services/mfaService';

export const TwoStepVerificationPage: React.FC = () => {
  const { pendingUser, pendingFactorId, confirmTwoFactorLogin, cancelTwoFactor } = useApp();

  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
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
    setError(null);

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
      setError(null);
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
    setError(null);

    const nextEmptyIndex = newOtp.findIndex((d) => d === '');
    const focusTarget = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[focusTarget]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isComplete) {
      return;
    }

    const code = otp.join('');
    setIsLoading(true);

    try {
      const res = await verifyMfaCode(code, pendingFactorId || undefined);

      if (res.success) {
        await confirmTwoFactorLogin();
      } else {
        setError(
          res.error ||
            'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.'
        );
        setIsLoading(false);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError(
        'Invalid verification code. Please enter the current 6-digit code from Google Authenticator.'
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070D19] flex items-center justify-center p-4 selection:bg-[#0284C7] selection:text-white relative">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#0284C7]/15 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      {/* Centered Card */}
      <div className="relative w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden z-10">
        {/* Brand Header */}
        <div className="p-8 pb-6 text-center border-b border-slate-800/80">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0284C7]/20 text-[#0284C7] border border-[#0284C7]/30 mb-3.5 shadow-lg shadow-sky-950/50">
            <Eye className="w-7 h-7 text-[#0284C7]" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            TRINAY<span className="text-[#0284C7] font-extrabold">-X</span>
          </h1>

          <div className="mt-4 space-y-1">
            <h2 className="text-base font-bold text-slate-100 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4.5 h-4.5 text-[#0284C7]" />
              <span>Two-Step Verification</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Enter the 6-digit code from your Google Authenticator app.
            </p>
          </div>

          {pendingUser && (
            <div className="mt-3.5 inline-block px-3.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded-full text-[11px] text-slate-300 font-medium">
              Signing in as <span className="text-sky-400 font-bold">{pendingUser.email || pendingUser.id}</span>
            </div>
          )}
        </div>

        {/* Verification Form */}
        <form onSubmit={handleSubmit} className="p-8 pt-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-start gap-2 animate-in fade-in duration-150">
              <span className="font-bold shrink-0">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* 6 OTP Input Boxes */}
          <div>
            <div className="flex items-center justify-between gap-2 sm:gap-2.5 my-1">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  id={`otp-input-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={isLoading}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  aria-label={`Digit ${idx + 1}`}
                  className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold font-mono rounded-xl transition-colors focus:outline-hidden ${
                    error
                      ? 'bg-red-950/20 border border-red-800/80 text-red-200 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                      : 'bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-600 focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7]'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Verify Primary Button */}
          <button
            id="otp-verify-btn"
            type="submit"
            disabled={!isComplete || isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#0284C7] hover:bg-sky-600 active:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-950/50 transition-all text-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Security Code...</span>
              </div>
            ) : (
              <>
                <span>Verify &amp; Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Secondary Action: Back to Login */}
          <div className="text-center pt-1 border-t border-slate-800/60">
            <button
              type="button"
              id="otp-back-to-login-btn"
              onClick={cancelTwoFactor}
              disabled={isLoading}
              className="inline-flex items-center text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer py-1 disabled:opacity-50"
            >
              ← Back to Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

