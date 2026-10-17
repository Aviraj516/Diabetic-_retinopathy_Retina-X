import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { TRANSLATIONS } from './data/translations';
import { diseaseReferenceTranslations } from './data/diseaseReferenceTranslations';

// Global Language Configuration
export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', nativeName: 'English', indicCode: 'eng_Latn' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', indicCode: 'hin_Deva' },
  mr: { name: 'Marathi', nativeName: 'मराठी', indicCode: 'mar_Deva' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்', indicCode: 'tam_Taml' },
  te: { name: 'Telugu', nativeName: 'తెలుగు', indicCode: 'tel_Telu' },
  bn: { name: 'Bengali', nativeName: 'বাংলা', indicCode: 'ben_Beng' },
};

// TRINAY is English-only: the former sidebar language selector was removed,
// so any previously saved Hindi/Marathi preference must never be restored.
try {
  localStorage.removeItem('trinay_language');
  localStorage.removeItem('i18nextLng');
} catch {
  /* storage unavailable — ignore */
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: 'en',
    resources: {
      en: { translation: { ...TRANSLATIONS.en, ...diseaseReferenceTranslations.en } },
      hi: { translation: { ...TRANSLATIONS.hi, ...diseaseReferenceTranslations.hi } },
      mr: { translation: { ...TRANSLATIONS.mr, ...diseaseReferenceTranslations.mr } },
      ta: { translation: { ...TRANSLATIONS.ta, ...diseaseReferenceTranslations.ta } },
      te: { translation: { ...TRANSLATIONS.te, ...diseaseReferenceTranslations.te } },
      bn: { translation: { ...TRANSLATIONS.bn, ...diseaseReferenceTranslations.bn } },
    },
    fallbackLng: 'en',
    supportedLngs: Object.keys(SUPPORTED_LANGUAGES),
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'trinay_language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
