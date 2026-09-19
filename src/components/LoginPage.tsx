import React, { useState } from 'react';
import { Eye, Lock, User, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LoginPage: React.FC = () => {
  const { loginWithCredentials } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const email = identifier.trim();
    if (!email) {
      setError('Please enter your Email or User ID.');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await loginWithCredentials(email, password);
      if (!res.success) {
        setError(res.error || 'Invalid email or password. Please check your credentials.');
      }
    } catch {
      setError('Authentication failed. Please check your credentials and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070D19] flex items-center justify-center p-4 selection:bg-blue-600 selection:text-white relative">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>

      {/* Centered Login Card */}
      <div className="relative w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden z-10">
        {/* Brand Header */}
        <div className="p-8 pb-6 text-center border-b border-slate-800/80">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 mb-3 shadow-lg shadow-blue-900/30">
            <Eye className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            RETINA<span className="text-blue-500">-X</span>
          </h1>
          <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
            Login
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 pt-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-start gap-2 animate-in fade-in duration-150">
              <span className="font-bold shrink-0">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* Email / User ID */}
          <div>
            <label
              htmlFor="login-identifier"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Email / User ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                id="login-identifier"
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError(null);
                }}
                placeholder="Enter Email or User ID"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Log In Button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1E60D5] hover:bg-blue-600 active:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-900/30 transition-all text-sm mt-2 disabled:opacity-70 cursor-pointer"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Log In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Quick Demo Credentials */}
          <div className="pt-4 border-t border-slate-800/80 space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
              Quick Fill Credentials
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="btn-quick-nurse"
                onClick={() => {
                  setIdentifier('sashvi@gmail.com');
                  setPassword('sashvi123');
                  setError(null);
                }}
                className="py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-[11px] font-medium rounded-lg border border-slate-700/60 transition-colors text-center cursor-pointer"
              >
                <span className="block font-semibold text-blue-400">Nurse</span>
                <span className="text-[10px] text-slate-400">sashvi</span>
              </button>

              <button
                type="button"
                id="btn-quick-admin"
                onClick={() => {
                  setIdentifier('admin@gmail.com');
                  setPassword('admin123');
                  setError(null);
                }}
                className="py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-[11px] font-medium rounded-lg border border-slate-700/60 transition-colors text-center cursor-pointer"
              >
                <span className="block font-semibold text-emerald-400">Admin</span>
                <span className="text-[10px] text-slate-400">admin</span>
              </button>

              <button
                type="button"
                id="btn-quick-specialist"
                onClick={() => {
                  setIdentifier('mahi@gmail.com');
                  setPassword('mahi123');
                  setError(null);
                }}
                className="py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-[11px] font-medium rounded-lg border border-slate-700/60 transition-colors text-center cursor-pointer"
              >
                <span className="block font-semibold text-purple-400">Specialist</span>
                <span className="text-[10px] text-slate-400">mahi</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
