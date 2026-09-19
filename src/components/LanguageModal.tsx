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
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
              <Globe className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              {t.selectLanguage}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsLanguageModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Options List */}
        <div className="p-4 space-y-1.5 max-h-80 overflow-y-auto">
          {LANGUAGES.map((lang) => {
            const isSelected = language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelectLanguage(lang.code)}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                  isSelected
                    ? 'bg-blue-50/80 border border-blue-200 text-blue-900 font-semibold'
                    : 'hover:bg-slate-50 border border-transparent text-slate-700'
                }`}
              >
                <div>
                  <div className="text-sm">{lang.name}</div>
                  <div className="text-xs text-slate-500 font-normal">
                    {lang.nativeName}
                  </div>
                </div>

                {isSelected && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white">
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
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
