// src/utils/translationUtils.ts
import i18n from '../i18n';

// Dictionary of strict medical terms that we shouldn't pass to open translation APIs
// if we already know the exact localized equivalent, ensuring clinical safety.
const CLINICAL_DICTIONARY: Record<string, Record<string, string>> = {
  CATARACT: {
    en: 'Cataract',
    hi: 'मोतियाबिंद',
    mr: 'मोतीबिंदू',
    ta: 'கண்புரை',
    te: 'శుక్లం',
  },
  GLAUCOMA: {
    en: 'Glaucoma',
    hi: 'ग्लूकोमा',
    mr: 'काचबिंदू',
    ta: 'கண் அழுத்த நோய்',
    te: 'గ్లకోమా',
  },
  NORMAL: {
    en: 'Normal',
    hi: 'सामान्य',
    mr: 'सामान्य',
    ta: 'இயல்பான',
    te: 'సాధారణం',
  },
  DR: {
    en: 'Diabetic Retinopathy',
    hi: 'डायबिटिक रेटिनोपैथी',
    mr: 'डायबेटिक रेटिनोपॅथी',
    ta: 'டயபெட்டிக் ரெட்டினோபதி',
    te: 'డయాబెటిక్ రెటినోపతి',
  },
  REFER: {
    en: 'Refer to ophthalmologist',
    hi: 'नेत्र रोग विशेषज्ञ के पास भेजें',
    mr: 'नेत्ररोग तज्ञाकडे पाठवा',
    ta: 'கண் மருத்துவரிடம் பரிந்துரைக்கவும்',
    te: 'కంటి వైద్యుడికి సూచించండి',
  }
};

/**
 * Translates a dynamic string using the backend translation service.
 * Respects local dictionary for clinical terms to prevent bad ML translation.
 */
export const translateDynamicText = async (text: string, targetLanguage?: string): Promise<string> => {
  if (!text) return '';
  
  const targetLng = targetLanguage || i18n.language || 'en';
  if (targetLng === 'en' || targetLng === 'eng_Latn') return text;

  // Check clinical dictionary first (exact match)
  const normalizedText = text.trim().toUpperCase();
  if (CLINICAL_DICTIONARY[normalizedText] && CLINICAL_DICTIONARY[normalizedText][targetLng]) {
    return CLINICAL_DICTIONARY[normalizedText][targetLng];
  }

  // Fallback to backend translation API for sentences/paragraphs
  try {
    const response = await fetch('http://localhost:5001/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        source_language: 'eng_Latn',
        target_language: getIndicCode(targetLng)
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.translated_text) {
        return data.translated_text;
      }
    }
    return text; // Fallback to original text on failure
  } catch (error) {
    console.error('Translation error:', error);
    return text; // Fallback to original text on failure
  }
};

const getIndicCode = (langCode: string): string => {
  const map: Record<string, string> = {
    en: 'eng_Latn',
    hi: 'hin_Deva',
    mr: 'mar_Deva',
    ta: 'tam_Taml',
    te: 'tel_Telu',
  };
  return map[langCode] || 'eng_Latn';
};
