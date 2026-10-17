import React from 'react';
import { X, Check, Globe } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LANGUAGES } from '../data/translations';
import { LanguageCode } from '../types';

export const LanguageModal: React.FC = () => {
  const { language, setLanguage, isLanguageModalOpen, setIsLanguageModalOpen, t } = useApp();

  if (!isLanguageModalOpen) return null;

  const handleSelectLanguage = (code: LanguageCode) => {
    setLanguage(code);
    setIsLanguageModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-50 text-[#0284C7] border border-sky-100">
              <Globe className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {t.selectLanguage}
              </h2>
              <p className="text-[11px] text-slate-500">TRINAY Multi-lingual Diagnostic Interface</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsLanguageModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Options List */}
        <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
          {LANGUAGES.map((lang) => {
            const isSelected = language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelectLanguage(lang.code)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-sky-50/80 border border-sky-300 text-sky-950 font-bold shadow-2xs'
                    : 'hover:bg-slate-50 border border-slate-100 text-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">{lang.name}</div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {lang.nativeName}
                  </div>
                </div>

                {isSelected && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#0284C7] text-white shadow-2xs">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={() => setIsLanguageModalOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};

