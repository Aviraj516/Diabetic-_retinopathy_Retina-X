import os
import hashlib
import json
from pathlib import Path

# Caching directory
CACHE_DIR = Path("translation_cache")
CACHE_DIR.mkdir(exist_ok=True)

class TranslationService:
    def __init__(self):
        self.model = None
        self.translator = None
        self.tokenizer = None
        self.is_loaded = False
        
        # We'll load the model lazily on first translation request to avoid blocking startup
    
    def _get_cache_key(self, text: str, src_lang: str, tgt_lang: str) -> str:
        key_str = f"{text}|{src_lang}|{tgt_lang}"
        return hashlib.sha256(key_str.encode("utf-8")).hexdigest()
    
    def _get_cached_translation(self, text: str, src_lang: str, tgt_lang: str):
        cache_file = CACHE_DIR / f"{self._get_cache_key(text, src_lang, tgt_lang)}.json"
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("translated_text")
            except Exception:
                return None
        return None
    
    def _save_to_cache(self, text: str, src_lang: str, tgt_lang: str, translated_text: str):
        cache_file = CACHE_DIR / f"{self._get_cache_key(text, src_lang, tgt_lang)}.json"
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump({"translated_text": translated_text}, f, ensure_ascii=False)
        except Exception as e:
            print(f"[Translation Cache Error] Could not save cache: {e}")

    def load_model(self):
        if self.is_loaded:
            return True
        
        print("[TranslationService] Initializing IndicTrans2 (Distilled CT2)...")
        try:
            import ctranslate2
            # Here you would initialize your CTranslate2 model and tokenizers.
            # For demonstration, we'll assume the model is loaded here.
            # self.translator = ctranslate2.Translator("models/indictrans2-en-indic-dist-200M-ct2", device="cpu")
            self.is_loaded = True
            print("[TranslationService] Model loaded successfully.")
            return True
        except ImportError:
            print("[TranslationService] Error: ctranslate2 not installed. Falling back to English.")
            return False
        except Exception as e:
            print(f"[TranslationService] Error loading model: {e}")
            return False

    def translate_text(self, text: str, src_lang: str, tgt_lang: str) -> dict:
        if not text or not text.strip():
            return {"success": True, "translated_text": text, "cached": False, "fallback": False}

        # 1. Check cache
        cached = self._get_cached_translation(text, src_lang, tgt_lang)
        if cached:
            return {"success": True, "translated_text": cached, "cached": True, "fallback": False}
        
        # 2. Lazy load model
        if not self.is_loaded:
            success = self.load_model()
            if not success:
                # Offline Fallback to English
                return {"success": False, "translated_text": text, "cached": False, "fallback": True}
        
        # 3. Translate
        try:
            # TODO: Add actual IndicTrans2 inference logic here when model is available
            # translated_text = self._run_inference(text, src_lang, tgt_lang)
            
            # For now, we mock the translation by appending a language tag if we don't have the real model hooked up yet
            # In a real scenario, this is where CTranslate2 does its job
            translated_text = f"[{tgt_lang}] {text}"
            
            self._save_to_cache(text, src_lang, tgt_lang, translated_text)
            return {"success": True, "translated_text": translated_text, "cached": False, "fallback": False}
        except Exception as e:
            print(f"[TranslationService] Inference Error: {e}")
            # Fallback to English on error
            return {"success": False, "translated_text": text, "cached": False, "fallback": True}

    def translate_batch(self, texts: list, src_lang: str, tgt_lang: str) -> dict:
        results = []
        for text in texts:
            # A real implementation would batch the ctranslate2 inferences together
            res = self.translate_text(text, src_lang, tgt_lang)
            results.append(res["translated_text"])
        
        return {"success": True, "translated_texts": results, "fallback": False}

# Singleton instance
translation_service = TranslationService()
