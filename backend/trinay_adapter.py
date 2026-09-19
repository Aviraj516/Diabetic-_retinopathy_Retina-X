"""
TRINAY Adapter Module
Connects local ChromaDB RAG, local SentenceTransformers embeddings,
local Ollama LLM inference, local Faster-Whisper Speech-to-Text,
and local Piper / macOS Text-to-Speech.
"""

import os
import re
import sys
import json
import base64
import tempfile
import subprocess
import traceback
import requests
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRINAY_DIR = os.path.join(PROJECT_ROOT, "rag", "TRINAY_INTEGRATION")
CHROMA_DB_DIR = os.path.join(TRINAY_DIR, "chroma_db")
EMBEDDING_MODEL_DIR = os.path.join(TRINAY_DIR, "models", "multilingual-e5-small")
WHISPER_MODEL_DIR = os.path.join(TRINAY_DIR, "models", "faster-whisper-small")
PIPER_MODEL_DIR = os.path.join(TRINAY_DIR, "models", "piper")

OLLAMA_URL = "http://127.0.0.1:11434"

# Global lazy singletons
_chroma_client = None
_chroma_collection = None
_embedder = None
_whisper_model = None

# ============================================================
# 1. EMBEDDINGS & CHROMADB INITIALIZATION
# ============================================================

def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        print("[TRINAY Adapter] Loading local SentenceTransformer model (multilingual-e5-small)")
        try:
            _embedder = SentenceTransformer("intfloat/multilingual-e5-small")
        except Exception as e:
            print(f"[TRINAY Adapter Warning] Could not load intfloat/multilingual-e5-small: {e}")
            if os.path.exists(EMBEDDING_MODEL_DIR):
                _embedder = SentenceTransformer(EMBEDDING_MODEL_DIR)
            else:
                raise e
    return _embedder


def get_chroma_collection():
    global _chroma_client, _chroma_collection
    if _chroma_collection is None:
        import chromadb
        print(f"[TRINAY Adapter] Connecting to ChromaDB at: {CHROMA_DB_DIR}")
        _chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
        collections = _chroma_client.list_collections()
        if collections:
            _chroma_collection = collections[0]
            print(f"[TRINAY Adapter] Connected to collection: {_chroma_collection.name} ({_chroma_collection.count()} items)")
        else:
            _chroma_collection = _chroma_client.get_or_create_collection(name="retina_knowledge")
    return _chroma_collection


def query_knowledge_base(query_text: str, top_k: int = 3) -> list:
    """
    Search ChromaDB using multilingual-e5-small query embeddings.
    """
    try:
        embedder = get_embedder()
        collection = get_chroma_collection()

        # E5 models expect 'query: ' prefix
        query_input = f"query: {query_text}"
        query_vec = embedder.encode(query_input).tolist()

        results = collection.query(
            query_embeddings=[query_vec],
            n_results=top_k
        )

        documents = results.get("documents", [[]])[0]
        return documents
    except Exception as e:
        print(f"[TRINAY RAG Warning] Knowledge search failed: {e}")
        return []

# ============================================================
# 2. OLLAMA LOCAL LLM INTERACTION
# ============================================================

def get_available_ollama_model() -> str:
    """Check running Ollama instance for preferred local models."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        if resp.status_code == 200:
            models_info = resp.json().get("models", [])
            model_names = [m.get("name", "") for m in models_info]
            # Preferred priority order for local LLM inference
            for target in ["gemma:2b", "qwen3:1.7b", "gemma3:1b", "qwen2.5:1.5b", "qwen:1.8b", "phi3:latest", "mistral:latest", "gemma:7b", "qwen2.5:7b", "llama3:latest"]:
                if target in model_names or any(target in name for name in model_names):
                    return target
            if model_names:
                return model_names[0]
    except Exception:
        pass
    return "phi3:latest"


def synthesize_rag_answer(question: str, knowledge_chunks: list, current_case: dict = None, language: str = "English") -> str:
    """
    Synthesize a real-time dynamic medical answer directly from retrieved ChromaDB RAG chunks
    if local LLM model call is unavailable or timed out.
    """
    if not knowledge_chunks:
        quality_val = current_case.get("quality", {}).get("quality", "Good") if current_case else "Good"
        sev_val = current_case.get("severity", {}).get("drSeverity", "No DR") if current_case else "No DR"
        rec_val = current_case.get("severity", {}).get("recommendation", "Annual follow-up recommended.") if current_case else "Annual follow-up recommended."
        return f"Retinal image analysis indicates quality is {quality_val} with diagnosis of {sev_val}. {rec_val}"

    import re
    raw_text = " ".join(knowledge_chunks)
    raw_text = re.sub(r'^[a-z0-9]{1,4}\s+', '', raw_text, flags=re.IGNORECASE)
    raw_text = re.sub(r'\s+', ' ', raw_text).strip()

    q_tokens = set(re.findall(r'\w+', question.lower())) - {
        'what', 'is', 'a', 'an', 'the', 'how', 'to', 'in', 'of', 'for', 'and', 'or', 'are', 'about', 'can', 'you', 'explain', 'tell', 'me', 'which', 'who', 'where'
    }
    sentences = re.split(r'(?<=[.!?])\s+', raw_text)
    matched_sentences = []

    for s in sentences:
        s_clean = s.strip()
        s_clean = re.sub(r'^[a-z0-9]{1,3}\s+', '', s_clean, flags=re.IGNORECASE)
        if len(s_clean) < 25 or s_clean.startswith('Figure') or s_clean.startswith('Table'):
            continue
        s_lower = s_clean.lower()
        if any(t in s_lower for t in q_tokens):
            if s_clean[0].islower():
                s_clean = s_clean[0].upper() + s_clean[1:]
            matched_sentences.append(s_clean)
            if len(matched_sentences) >= 2:
                break

    if not matched_sentences and sentences:
        for s in sentences:
            s_clean = s.strip()
            s_clean = re.sub(r'^[a-z0-9]{1,3}\s+', '', s_clean, flags=re.IGNORECASE)
            if len(s_clean) > 30 and not s_clean.startswith('Figure') and not s_clean.startswith('Table'):
                if s_clean[0].islower():
                    s_clean = s_clean[0].upper() + s_clean[1:]
                matched_sentences.append(s_clean)
                break

    rag_text = " ".join(matched_sentences).strip()
    if not rag_text:
        rag_text = raw_text[:250].strip()
        if rag_text and rag_text[0].islower():
            rag_text = rag_text[0].upper() + rag_text[1:]

    if current_case:
        sev = current_case.get("severity", {}).get("drSeverityLevel") or current_case.get("severity", {}).get("drSeverity")
        if sev and "screening" not in rag_text.lower():
            rag_text += f" (Patient Screening Diagnosis: {sev})."

    return rag_text


def format_case_context(current_case: dict) -> str:
    """Format current dashboard image analysis case into clean readable text."""
    if not current_case:
        return "No specific retinal image screening result currently loaded."

    quality = current_case.get("quality", {})
    quality_str = quality.get("quality") if isinstance(quality, dict) else str(quality)

    severity = current_case.get("severity", {})
    severity_label = severity.get("drSeverityLevel") or severity.get("drSeverity") or "Unknown"
    recommendation = severity.get("recommendation", "")

    trinay = current_case.get("trinay") or current_case.get("anatomy") or {}
    anatomy = trinay.get("anatomy") if isinstance(trinay, dict) and "anatomy" in trinay else trinay
    lesions = trinay.get("lesions") if isinstance(trinay, dict) and "lesions" in trinay else current_case.get("lesions", {})

    lesion_summary = []
    if isinstance(lesions, dict):
        for name, info in lesions.items():
            if isinstance(info, dict) and info.get("detected"):
                regs = info.get("regions", 0)
                pxs = info.get("pixels", 0)
                lesion_summary.append(f"{name} ({regs} regions, {pxs} px)")

    lesions_str = ", ".join(lesion_summary) if lesion_summary else "None detected"

    vessels = anatomy.get("blood_vessels", {}) if isinstance(anatomy, dict) else {}
    vessel_density = vessels.get("density", "—")
    fovea = anatomy.get("fovea", {}) if isinstance(anatomy, dict) else {}
    fovea_pos = f"({round(fovea.get('x', 0), 1)}, {round(fovea.get('y', 0), 1)})" if isinstance(fovea, dict) else "Localized"

    return f"""CURRENT PATIENT RETINAL SCREENING CASE RESULT:
- Image Quality: {quality_str}
- Diabetic Retinopathy Severity: {severity_label}
- Recommended Action: {recommendation}
- Detected Lesions: {lesions_str}
- Retinal Vessels Density: {vessel_density}%
- Fovea Location: {fovea_pos}
"""


def is_target_script(text: str, language: str) -> bool:
    """Check if the text contains script characters corresponding to target language."""
    lang_lower = (language or "english").lower()
    if lang_lower == "english":
        return True
    if lang_lower in ["hindi", "marathi"]:
        # Devanagari range \u0900-\u097F
        return any('\u0900' <= c <= '\u097F' for c in text)
    if lang_lower == "telugu":
        # Telugu range \u0C00-\u0C7F
        return any('\u0C00' <= c <= '\u0C7F' for c in text)
    return True


def translate_to_language(text: str, language: str, llm_model: str) -> str:
    """Translate or adapt English medical response into natural target language script."""
    lang_lower = (language or "english").lower()
    if lang_lower == "english" or not text.strip():
        return text

    script_name = "Devanagari script (हिंदी/मराठी)" if lang_lower in ["hindi", "marathi"] else "Telugu script (తెలుగు)"

    prompt = f"""You are a professional medical translator. Translate the following English medical explanation into fluent, natural {language} ({script_name}).
Keep technical terms like 'Diabetic Retinopathy', 'Retina', 'Blood Vessel', 'Microaneurysm', 'Hemorrhage', 'Lesion' in English where standard, but translate all surrounding text into proper {language}.
Preserve all medical facts, severity levels, numbers, and recommendations exactly.

English text:
{text}

Translation in natural {language}:"""

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": llm_model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 120,
                    "top_k": 20,
                }
            },
            timeout=10
        )
        if resp.status_code == 200:
            translated = resp.json().get("response", "").strip()
            if translated and is_target_script(translated, language):
                return translated
    except Exception as e:
        print(f"[TRINAY Adapter] Multilingual translation pass failed: {e}")

    return text


def ask_trinay(question: str, current_case: dict = None, language: str = "English", speak: bool = True) -> dict:
    """
    Main TRINAY RAG query entry point.
    Combines RAG ChromaDB knowledge + current dashboard screening case + local Ollama LLM.
    Adapts English RAG context into natural Hindi, Marathi, or Telugu output as selected.
    """
    lang_lower = (language or "english").lower()

    # 1. Fetch relevant medical knowledge from ChromaDB
    knowledge_chunks = query_knowledge_base(question, top_k=3)
    knowledge_str = "\n---\n".join(knowledge_chunks) if knowledge_chunks else "Standard clinical diabetic retinopathy guidelines."

    # 2. Format current image case context
    case_str = format_case_context(current_case)

    # 3. Construct language-specific system prompt
    if lang_lower == "hindi":
        lang_instruction = "CRITICAL MANDATE: Write your response in natural, proper Hindi (हिंदी, Devanagari script). Technical terms like 'Diabetic Retinopathy', 'Retina', 'Blood Vessel', 'Lesion' may remain in English, but all explanations must be written in natural Hindi."
        lang_header = "ANSWER IN HINDI:"
    elif lang_lower == "marathi":
        lang_instruction = "CRITICAL MANDATE: Write your response in natural, proper Marathi (मराठी, Devanagari script). Technical terms like 'Diabetic Retinopathy', 'Retina', 'Blood Vessel', 'Lesion' may remain in English, but all explanations must be written in natural Marathi."
        lang_header = "ANSWER IN MARATHI:"
    elif lang_lower == "telugu":
        lang_instruction = "CRITICAL MANDATE: Write your response in natural, proper Telugu (తెలుగు, Telugu script). Technical terms like 'Diabetic Retinopathy', 'Retina', 'Blood Vessel', 'Lesion' may remain in English, but all explanations must be written in natural Telugu."
        lang_header = "ANSWER IN TELUGU:"
    else:
        lang_instruction = "Respond clearly and concisely in English (2-3 sentences maximum)."
        lang_header = "ANSWER:"

    system_prompt = f"""You are TRINAY, an expert offline AI retinal specialist assistant integrated into the RETINA-X clinical dashboard.
{lang_instruction}

{case_str}

CLINICAL RETINAL KNOWLEDGE BASE:
{knowledge_str}

USER QUESTION: {question}

{lang_header}"""

    llm_model = get_available_ollama_model()
    answer_text = ""

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": llm_model,
                "prompt": system_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 90,
                    "top_k": 20,
                    "stop": ["\n\n\n", "###", "USER QUESTION:", "CLINICAL RETINAL KNOWLEDGE BASE:"],
                }
            },
            timeout=25
        )
        if resp.status_code == 200:
            raw_gen = resp.json().get("response", "").strip()
            # Clean up any residual markdown headers if present
            raw_gen = re.sub(r'^###\s+Instruction:.*?\n', '', raw_gen, flags=re.DOTALL)
            raw_gen = re.sub(r'^###\s+Solution:\s*', '', raw_gen, flags=re.DOTALL).strip()
            if raw_gen:
                answer_text = raw_gen
    except Exception as e:
        print(f"[TRINAY Adapter] Ollama call failed or timed out: {e}")

    # If LLM response is missing or empty, synthesize real-time answer directly from ChromaDB RAG chunks
    if not answer_text:
        answer_text = synthesize_rag_answer(question, knowledge_chunks, current_case, language)

    # If non-English language was selected, verify that output is in target script
    if lang_lower != "english" and answer_text:
        if not is_target_script(answer_text, language):
            print(f"[TRINAY Adapter] Ollama output was in English for {language}. Translating to target script...")
            answer_text = translate_to_language(answer_text, language, llm_model)

    audio_b64 = None
    if speak:
        audio_b64 = synthesize_speech(answer_text, language=language)

    return {
        "answer": answer_text,
        "sources": knowledge_chunks[:2],
        "modelUsed": llm_model,
        "audio_b64": audio_b64,
        "audio_format": "wav" if audio_b64 else None,
    }

# ============================================================
# 3. SPEECH-TO-TEXT (STT) - FASTER-WHISPER
# ============================================================

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        print(f"[TRINAY Adapter] Loading Faster-Whisper model from: {WHISPER_MODEL_DIR}")
        device = "cpu"
        compute_type = "int8"
        if os.path.exists(WHISPER_MODEL_DIR):
            _whisper_model = WhisperModel(WHISPER_MODEL_DIR, device=device, compute_type=compute_type)
        else:
            _whisper_model = WhisperModel("small", device=device, compute_type=compute_type)
    return _whisper_model


WHISPER_LANG_MAP = {
    "english": "en",
    "hindi": "hi",
    "marathi": "mr",
    "telugu": "te",
}

def transcribe_speech(audio_bytes: bytes, language: str = "English") -> str:
    """
    Transcribe uploaded audio bytes to text locally.
    Uses explicitly requested language code to avoid Hindi/Devanagari misclassification on English speech.
    """
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    lang_code = WHISPER_LANG_MAP.get((language or "english").lower(), "en")

    try:
        model = get_whisper_model()
        segments, _ = model.transcribe(
            tmp_path,
            language=lang_code,
            beam_size=3,
            vad_filter=True
        )
        text = " ".join([s.text for s in segments]).strip()
        return text
    except Exception as e:
        print(f"[TRINAY STT Error] {e}")
        return ""
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except Exception: pass

# ============================================================
# 4. TEXT-TO-SPEECH (TTS) - PIPER / MACOS SAY
# ============================================================

def synthesize_speech(text: str, language: str = "English") -> str:
    """
    Synthesize speech for given text into base64 WAV payload.
    Uses Piper ONNX models for Hindi/Marathi/Telugu, and macOS `say` for English.
    """
    lang_lower = (language or "english").lower()

    # 1. Indian languages -> Piper ONNX
    piper_models = {
        "hindi": os.path.join(PIPER_MODEL_DIR, "hindi", "hi_IN-pratham-medium.onnx"),
        "marathi": os.path.join(PIPER_MODEL_DIR, "marathi", "mr_IN-google-medium.onnx"),
        "telugu": os.path.join(PIPER_MODEL_DIR, "telugu", "te_IN-maya-medium.onnx"),
    }

    if lang_lower in piper_models and os.path.exists(piper_models[lang_lower]):
        model_path = piper_models[lang_lower]
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_out:
                out_wav = tmp_out.name

            # Run piper executable if present, or python onnx synthesis
            piper_cmd = f"piper --model '{model_path}' --output_file '{out_wav}'"
            p = subprocess.Popen(piper_cmd, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            p.communicate(input=text.encode("utf-8"))

            if os.path.exists(out_wav) and os.path.getsize(out_wav) > 0:
                with open(out_wav, "rb") as f:
                    data = f.read()
                os.remove(out_wav)
                return base64.b64encode(data).decode("utf-8")
        except Exception as e:
            print(f"[Piper TTS Warning] Piper execution failed: {e}")

    # 2. English (or fallback) -> macOS native 'say' command
    if sys.platform == "darwin":
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
                wav_path = tmp_wav.name

            # Generate WAV directly via macOS say with LEI16@22050 PCM data format
            subprocess.run(["say", "--data-format=LEI16@22050", "-o", wav_path, text], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            if os.path.exists(wav_path) and os.path.getsize(wav_path) > 0:
                with open(wav_path, "rb") as f:
                    data = f.read()
                try: os.remove(wav_path)
                except Exception: pass
                return base64.b64encode(data).decode("utf-8")
        except Exception as e:
            print(f"[macOS TTS Warning] macOS say synthesis failed: {e}")

    return None


def check_trinay_status() -> dict:
    """Return readiness metrics for TRINAY backend components."""
    ollama_ok = False
    ollama_models = []
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=1)
        if resp.status_code == 200:
            ollama_ok = True
            ollama_models = [m.get("name") for m in resp.json().get("models", [])]
    except Exception:
        pass

    return {
        "chroma_db": os.path.exists(CHROMA_DB_DIR),
        "embedding_model": os.path.exists(EMBEDDING_MODEL_DIR),
        "whisper_model": os.path.exists(WHISPER_MODEL_DIR),
        "piper_models": os.path.exists(PIPER_MODEL_DIR),
        "ollama": ollama_ok,
        "ollama_models": ollama_models,
    }
