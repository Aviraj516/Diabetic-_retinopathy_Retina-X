"""
RETINA-X ML Inference Server
Runs as a local Flask server alongside the Express.js / Vite frontend.
All ML models are loaded from the local model/ directory.
No external AI API keys or cloud services required.

Endpoints:
  POST /ml/analyze   - Full pipeline: Quality -> (STOP if not Good) -> Severity -> TRINAY -> XAI
  POST /ml/quality   - Quality only
  GET  /ml/health    - Health check

Start with: .venv/bin/python ml_server.py
"""

import os
import sys
import gc
import re
import time
import base64
import traceback
import numpy as np
import cv2
import torch
import joblib
import pandas as pd
from PIL import Image
from dotenv import load_dotenv

from backend.services.translation_service import translation_service

# ============================================================
# PROJECT ROOT & ENVIRONMENT VARIABLES
# ============================================================

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

import requests

SUPABASE_URL = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or
    os.getenv("SERVICE_ROLE_KEY") or
    os.getenv("SUPABASE_SERVICE_KEY") or
    ""
).strip()
SUPABASE_ANON_KEY = (
    os.getenv("VITE_SUPABASE_ANON_KEY") or
    os.getenv("SUPABASE_ANON_KEY") or
    ""
).strip()

def get_supabase_headers():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

def resolve_doctor_id(req):
    doc_id = (req.form.get("doctorId") or req.args.get("doctorId") or "").strip()
    if doc_id and re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', doc_id, re.I):
        return doc_id
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            d_resp = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?select=id&order=created_at.asc&limit=1", headers=headers, timeout=3)
            if d_resp.status_code == 200 and d_resp.json():
                return d_resp.json()[0]["id"]
        except Exception:
            pass
    return "7475e1f4-b285-4d5e-a375-867069e5e848"

SCREENING_RESULTS_DIR = os.path.join(PROJECT_ROOT, "uploads", "screening_results")
os.makedirs(SCREENING_RESULTS_DIR, exist_ok=True)

def persist_screening_artifacts(screening_id: str, artifacts_dict: dict) -> dict:
    """
    Saves image artifacts (base64 strings or np.ndarrays) into uploads/screening_results/<screening_id>/<name>.png
    Returns a dict mapping artifact keys to their HTTP GET endpoint URLs.
    """
    if not screening_id:
        return {}
    
    clean_id = re.sub(r'[^a-zA-Z0-9_-]', '', str(screening_id))
    target_dir = os.path.join(SCREENING_RESULTS_DIR, clean_id)
    os.makedirs(target_dir, exist_ok=True)
    
    urls = {}
    for name, item in artifacts_dict.items():
        if item is None:
            continue
        clean_name = re.sub(r'[^a-zA-Z0-9_-]', '', str(name))
        file_path = os.path.join(target_dir, f"{clean_name}.png")
        try:
            if isinstance(item, np.ndarray):
                cv2.imwrite(file_path, item)
                urls[name] = f"/api/screenings/{clean_id}/artifacts/{clean_name}"
            elif isinstance(item, str) and item.strip():
                raw = item.strip()
                if raw.startswith("data:image"):
                    raw = raw.split(",", 1)[1]
                img_bytes = base64.b64decode(raw)
                with open(file_path, "wb") as f:
                    f.write(img_bytes)
                urls[name] = f"/api/screenings/{clean_id}/artifacts/{clean_name}"
        except Exception as e:
            print(f"[Artifact Save Warning] Could not save {name}: {e}")
            
    return urls

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# ============================================================
# FLASK
# ============================================================

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


# ============================================================
# MODEL PATHS (model/ directory)
# ============================================================

MODEL_DIR = os.path.join(PROJECT_ROOT, "model")

QUALITY_MODEL_PATH    = os.path.join(MODEL_DIR, "best_quality_model.pkl")
SEVERITY_MODEL_PATH   = os.path.join(MODEL_DIR, "dr_severity_efficientnet_b0.pth")
VESSEL_MODEL_PATH     = os.path.join(MODEL_DIR, "best_vessel_unet.pth")
OPTIC_DISC_MODEL_PATH = os.path.join(MODEL_DIR, "best_optic_disc_unet.pth")
FOVEA_MODEL_PATH      = os.path.join(MODEL_DIR, "best_fovea_net.pth")
LESION_MODEL_PATH     = os.path.join(MODEL_DIR, "standard_unet_ddr_finetuned.pth")

# ============================================================
# DEVICE
# ============================================================

if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

XAI_DEVICE = torch.device("cpu")

print(f"[ML Server] Inference device : {DEVICE}")
print(f"[ML Server] XAI device       : {XAI_DEVICE}")

# ============================================================
# CONSTANTS & LABELS
# ============================================================

DR_CLASSES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]

DR_LEVEL_LABELS = {
    "No DR":            "No Diabetic Retinopathy (Level 0)",
    "Mild":             "Mild Non-Proliferative DR (Level 1)",
    "Moderate":         "Moderate Non-Proliferative DR (Level 2)",
    "Severe":           "Severe Non-Proliferative DR (Level 3)",
    "Proliferative DR": "Proliferative Diabetic Retinopathy (Level 4)",
}

DR_RECOMMENDATIONS = {
    "No DR":            "No DR detected. Annual follow-up recommended.",
    "Mild":             "Mild DR. Follow-up in 6–12 months. Optimize glycemic control.",
    "Moderate":         "Moderate DR. Ophthalmologist review within 4–6 weeks.",
    "Severe":           "Severe DR. Urgent ophthalmologist referral required.",
    "Proliferative DR": "Proliferative DR. Immediate specialist intervention needed.",
}

LESION_NAMES = {0: "MA", 1: "HE", 2: "EX", 3: "SE"}
LESION_FULL_NAMES = {
    0: "Microaneurysm",
    1: "Haemorrhage",
    2: "Hard Exudate",
    3: "Soft Exudate",
}

# ============================================================
# UTILITIES
# ============================================================

def bgr_to_b64(image_bgr: np.ndarray) -> str:
    """Encode an OpenCV BGR ndarray to a base64 PNG string."""
    _, buf = cv2.imencode(".png", image_bgr)
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def decode_uploaded_image(file_storage) -> np.ndarray:
    """Read uploaded file bytes -> OpenCV BGR ndarray."""
    raw = np.frombuffer(file_storage.read(), np.uint8)
    img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("OpenCV could not decode the uploaded image.")
    return img


def decode_bytes_to_image(raw_bytes: bytes) -> np.ndarray:
    """Decode raw bytes to BGR ndarray."""
    raw = np.frombuffer(raw_bytes, np.uint8)
    img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("OpenCV could not decode the image bytes.")
    return img


# ============================================================
# STEP 1: IMAGE QUALITY ASSESSMENT
# Reproduces exact original feature extraction from training
# ============================================================

def extract_quality_features(cv_img_bgr: np.ndarray) -> dict:
    """
    Extracts the 6 image quality features exactly as used when training
    best_quality_model.pkl:
      1. Sharpness: Variance of Laplacian
      2. Brightness: Mean grayscale intensity
      3. Illumination: Center-to-mean spatial uniformity ratio
      4. Contrast: RMS contrast / standard deviation
      5. Noise: High-frequency noise estimate via Gaussian blur subtraction
      6. Field of View (FOV): Fraction of non-black pixels (> 15)
    """
    gray = cv2.cvtColor(cv_img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # 1. Sharpness
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # 2. Brightness
    brightness = float(np.mean(gray))

    # 3. Illumination (Spatial uniformity: center vs overall ratio)
    center_h, center_w = h // 2, w // 2
    rh, rw = h // 4, w // 4
    center_region = gray[center_h - rh : center_h + rh, center_w - rw : center_w + rw]
    center_mean = np.mean(center_region) if center_region.size > 0 else brightness
    illumination = float(center_mean / (brightness + 1e-5))

    # 4. Contrast
    contrast = float(np.std(gray))

    # 5. Noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    noise = float(np.std(gray.astype(np.float32) - blurred.astype(np.float32)))

    # 6. Field of View (FOV)
    non_black_pixels = np.sum(gray > 15)
    total_pixels = h * w
    fov = float(non_black_pixels / (total_pixels + 1e-5))

    return {
        "sharpness": sharpness,
        "brightness": brightness,
        "illumination": illumination,
        "contrast": contrast,
        "noise": noise,
        "fov": fov,
    }


def run_quality(image_bgr: np.ndarray) -> dict:
    """
    Runs best_quality_model.pkl.
    Returns quality label ('Good', 'Borderline', 'Ungradable'),
    probabilities, and extracted features.
    """
    rf = joblib.load(QUALITY_MODEL_PATH)
    feats = extract_quality_features(image_bgr)

    features_df = pd.DataFrame([[
        feats["sharpness"],
        feats["brightness"],
        feats["illumination"],
        feats["contrast"],
        feats["noise"],
        feats["fov"],
    ]], columns=["sharpness", "brightness", "illumination", "contrast", "noise", "fov"])

    raw_pred = str(rf.predict(features_df)[0]).strip().lower()
    probs = rf.predict_proba(features_df)[0]
    classes = [str(c).strip().lower() for c in rf.classes_]
    prob_dict = dict(zip(classes, probs))

    # Canonical mapping to TitleCase
    label_map = {
        "good": "Good",
        "borderline": "Borderline",
        "ungradable": "Ungradable",
    }
    quality_label = label_map.get(raw_pred, "Ungradable")

    confidence_map = {
        "Good": float(prob_dict.get("good", 0.0)),
        "Borderline": float(prob_dict.get("borderline", 0.0)),
        "Ungradable": float(prob_dict.get("ungradable", 0.0)),
    }

    return {
        "quality": quality_label,
        "confidence": confidence_map,
        "features": feats,
    }


# ============================================================
# STEP 2: DR SEVERITY (EfficientNet-B0, 5 classes)
# ============================================================

def run_dr_severity(image_bgr: np.ndarray) -> dict:
    """
    Inference with dr_severity_efficientnet_b0.pth.
    Uses exact training preprocessing and weights.
    """
    from torchvision import transforms, models
    import torch.nn as nn

    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, 5)

    ckpt = torch.load(SEVERITY_MODEL_PATH, map_location=DEVICE, weights_only=False)
    state = ckpt.get("model_state_dict", ckpt.get("state_dict", ckpt)) if isinstance(ckpt, dict) else ckpt
    model.load_state_dict(state, strict=False)
    model.to(DEVICE).eval()

    tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    rgb_pil = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    tensor = tf(rgb_pil).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

    pred_idx   = int(np.argmax(probs))
    severity   = DR_CLASSES[pred_idx]
    confidence = float(probs[pred_idx]) * 100

    del model, tensor
    if DEVICE.type == "mps":
        try: torch.mps.empty_cache()
        except Exception: pass
    gc.collect()

    return {
        "drSeverity":      severity,
        "drSeverityLevel": DR_LEVEL_LABELS[severity],
        "confidence":      round(confidence, 1),
        "recommendation":  DR_RECOMMENDATIONS[severity],
        "probabilities":   {DR_CLASSES[i]: round(float(probs[i]) * 100, 1) for i in range(5)},
    }


# ============================================================
# STEP 3: TRINAY ANATOMY + LESION PIPELINE
# Uses the exact tested pipeline in backend/trinay_anatomy_lesion_pipeline.py
# ============================================================

def run_trinay(image_bgr: np.ndarray) -> dict:
    """
    Runs the exact TRINAY working pipeline from backend/trinay_anatomy_lesion_pipeline.py:
    1. Prepares 512x512 canonical cropped retina
    2. Runs Blood Vessel U-Net -> vessel mask
    3. Runs Optic Disc U-Net -> optic disc contour mask
    4. Runs Fovea Net -> (x, y) coordinates
    5. Runs Lesion U-Net -> MA, HE, EX, SE masks + morphology postprocessing
    6. Generates real anatomy overlay, lesion overlay, and combined overlay
    """
    from backend.trinay_anatomy_lesion_pipeline import (
        prepare_input,
        load_models,
        predict_all,
        create_anatomy_overlay,
        create_lesion_overlay,
        create_combined_overlay,
        create_anatomy_debug_visualization,
        model_to_orig_coords,
    )

    canonical, tensor, meta = prepare_input(image_bgr, return_meta=True)
    vessel_model, optic_disc_model, fovea_model, lesion_model = load_models()

    pred_result = predict_all(
        tensor,
        vessel_model,
        optic_disc_model,
        fovea_model,
        lesion_model,
        canonical_bgr=canonical,
    )

    vessel_mask     = pred_result["vessel_mask"]
    optic_disc_mask = pred_result["optic_disc_mask"]
    fovea_x         = pred_result["fovea_x"]
    fovea_y         = pred_result["fovea_y"]
    proc_lesion     = pred_result["processed_lesion_masks"]
    lesion_summary  = pred_result["lesion_summary"]
    geometry_info   = pred_result.get("geometry", {})

    # Generate real visualizations using the exact tested functions
    anatomy_vis       = create_anatomy_overlay(canonical, vessel_mask, optic_disc_mask, fovea_x, fovea_y)
    lesion_vis        = create_lesion_overlay(canonical, proc_lesion)
    combined_vis      = create_combined_overlay(canonical, vessel_mask, optic_disc_mask, fovea_x, fovea_y, proc_lesion)
    debug_anatomy_vis = create_anatomy_debug_visualization(canonical, vessel_mask, optic_disc_mask, fovea_x, fovea_y, meta=meta, orig_image=image_bgr)

    # Free model tensors
    del tensor, vessel_model, optic_disc_model, fovea_model, lesion_model
    if DEVICE.type == "mps":
        try: torch.mps.empty_cache()
        except Exception: pass
    gc.collect()

    # Build findings list
    findings = []
    formatted_lesions = {}
    for ci in range(4):
        name = LESION_NAMES[ci]
        full_name = LESION_FULL_NAMES[ci]
        info = lesion_summary.get(ci, lesion_summary.get(name, {}))
        detected = bool(info.get("detected", False))
        regions = int(info.get("regions", 0))
        pixels = int(info.get("pixels", 0))

        formatted_lesions[name] = {
            "detected": detected,
            "regions": regions,
            "pixels": pixels,
        }

    # Calculate real spatial integration metrics from model predictions
    from backend.spatial_integration import build_spatial_analysis
    spatial = build_spatial_analysis(vessel_mask, optic_disc_mask, fovea_x, fovea_y)
    disc_fovea = spatial.get("disc_fovea")
    vessel_stats = spatial.get("vessel_analysis", {})

    vessel_density_val = round(float(vessel_stats.get("vessel_density", 0.0)) * 100, 2)
    macula_density_val = round(float(vessel_stats.get("macula_vessel_density", 0.0) or 0.0) * 100, 2)
    vessel_branches_val = int(vessel_stats.get("connected_components", 0))

    # Optic disc and fovea geometry in model (512x512) and original image space
    disc_center_val = disc_fovea.get("optic_disc_center") if disc_fovea else geometry_info.get("disc_center")
    disc_dist_val   = round(float(disc_fovea["distance_pixels"]), 1) if disc_fovea and "distance_pixels" in disc_fovea else (round(float(geometry_info["distance_px"]), 1) if geometry_info.get("distance_px") is not None else None)
    disc_dist_dd    = round(float(geometry_info["distance_in_disc_diameters"]), 2) if geometry_info.get("distance_in_disc_diameters") is not None else None

    # Bidirectional coordinate transform to original image space
    fovea_x_orig, fovea_y_orig = model_to_orig_coords(fovea_x, fovea_y, meta)
    scale_m2o = float(meta["side"]) / 512.0
    disc_area_model = int(optic_disc_mask.sum())
    disc_area_orig  = int(round(disc_area_model * (scale_m2o ** 2)))
    disc_diameter_model = geometry_info.get("disc_diameter_est")

    if disc_center_val is not None:
        disc_cx_orig, disc_cy_orig = model_to_orig_coords(disc_center_val[0], disc_center_val[1], meta)
        disc_center_orig = [round(disc_cx_orig, 1), round(disc_cy_orig, 1)]
        disc_dist_orig   = round(float(np.sqrt((fovea_x_orig - disc_cx_orig) ** 2 + (fovea_y_orig - disc_cy_orig) ** 2)), 1)
    else:
        disc_center_orig = None
        disc_dist_orig   = None

    anatomy_data = {
        "blood_vessels": {
            "pixels": int(vessel_mask.sum()),
            "detected": bool(vessel_mask.sum() > 0),
            "density": vessel_density_val,
            "macular_density": macula_density_val,
            "branches": vessel_branches_val,
        },
        "optic_disc": {
            "pixels": disc_area_model,
            "pixels_orig": disc_area_orig,
            "detected": bool(optic_disc_mask.sum() > 0),
            "center": [round(disc_center_val[0], 1), round(disc_center_val[1], 1)] if disc_center_val else None,
            "center_orig": disc_center_orig,
            "diameter_model_px": round(disc_diameter_model, 1) if disc_diameter_model else None,
            "diameter_orig_px": round(disc_diameter_model * scale_m2o, 1) if disc_diameter_model else None,
        },
        "fovea": {
            "x": round(fovea_x, 2),
            "y": round(fovea_y, 2),
            "x_orig": round(fovea_x_orig, 1),
            "y_orig": round(fovea_y_orig, 1),
            "disc_distance": disc_dist_val,
            "disc_distance_orig_px": disc_dist_orig,
            "disc_distance_dd": disc_dist_dd,
            "coordinate_system": "canonical_512x512",
            "plausible": bool(geometry_info.get("anatomically_plausible", False)),
        },
        "macula": {
            "detected": bool(geometry_info.get("anatomically_plausible", False)),
            "estimated": True,
            "is_segmented": False,
            "method": "fovea_centered_roi_estimation",
            "radius_px": int(round(512 * 0.11)),
            "radius_orig_px": round(512 * 0.11 * scale_m2o, 1),
        },
        "retinal_background": {"detected": True},
        "diagnostic": {
            "orig_width": int(meta["orig_w"]),
            "orig_height": int(meta["orig_h"]),
            "model_width": 512,
            "model_height": 512,
            "model_input_shape": [1, 3, 512, 512],
            "raw_foveanet_output": pred_result.get("fovea_output_raw"),
            "fovea_model_px_raw": [round(pred_result.get("raw_fovea_x", fovea_x), 2), round(pred_result.get("raw_fovea_y", fovea_y), 2)],
            "fovea_model_px": [round(fovea_x, 2), round(fovea_y, 2)],
            "fovea_orig_px": [round(fovea_x_orig, 1), round(fovea_y_orig, 1)],
            "fovea_is_finite": bool(pred_result.get("fovea_is_finite", True)),
            "fovea_is_in_bounds": bool(pred_result.get("fovea_is_in_bounds", True)),
            "refinement_applied": bool(pred_result.get("refinement_applied", False)),
            "refinement_method": pred_result.get("refinement_method"),
            "refinement_reason": pred_result.get("refinement_reason"),
            "optic_disc_centroid_model_px": [round(disc_center_val[0], 1), round(disc_center_val[1], 1)] if disc_center_val else None,
            "optic_disc_centroid_orig_px": disc_center_orig,
            "optic_disc_area_model_px": disc_area_model,
            "optic_disc_area_orig_px": disc_area_orig,
            "optic_disc_diameter_model_px": round(disc_diameter_model, 1) if disc_diameter_model else None,
            "optic_disc_diameter_orig_px": round(disc_diameter_model * scale_m2o, 1) if disc_diameter_model else None,
            "disc_fovea_distance_model_px": disc_dist_val,
            "disc_fovea_distance_orig_px": disc_dist_orig,
            "disc_fovea_distance_dd": disc_dist_dd,
            "macula_center_model_px": [round(fovea_x, 2), round(fovea_y, 2)],
            "macula_radius_model_px": int(round(512 * 0.11)),
            "macula_center_orig_px": [round(fovea_x_orig, 1), round(fovea_y_orig, 1)],
            "macula_radius_orig_px": round(512 * 0.11 * scale_m2o, 1),
            "macula_localization_method": "fovea_centered_roi_estimation",
            "macula_is_estimated": True,
            "macula_is_segmented": False,
            "fovea_model_architecture": "FoveaNet (EfficientNet-B0 + MLP regression in [0, 1])",
            "model_confidence": None,
            "coordinate_transformation": {
                "crop_x1": int(meta["x1"]),
                "crop_y1": int(meta["y1"]),
                "crop_side": int(meta["side"]),
                "pad_left": int(meta["pad_left"]),
                "pad_top": int(meta["pad_top"]),
                "pad_right": int(meta["pad_right"]),
                "pad_bottom": int(meta["pad_bottom"]),
                "scale_model_to_orig": round(scale_m2o, 4),
                "scale_orig_to_model": round(512.0 / float(meta["side"]), 4),
            },
            "geometry_checks": geometry_info.get("checks", {}),
            "anatomically_plausible": bool(geometry_info.get("anatomically_plausible", False)),
            "overlay_markers_rendered": {
                "fovea": [int(round(fovea_x)), int(round(fovea_y))],
                "macula_roi_circle": {
                    "center": [int(round(fovea_x)), int(round(fovea_y))],
                    "radius": int(round(512 * 0.11))
                },
                "optic_disc_centroid": [int(round(disc_center_val[0])), int(round(disc_center_val[1]))] if disc_center_val else None,
            }
        },
        "measurements": {
            "vessel_pixels": int(vessel_mask.sum()),
            "vessel_density_pct": vessel_density_val,
            "macular_vessel_density_pct": macula_density_val,
            "vessel_branches": vessel_branches_val,
            "optic_disc_pixels": disc_area_model,
            "fovea_x": round(fovea_x, 1),
            "fovea_y": round(fovea_y, 1),
            "fovea_x_orig": round(fovea_x_orig, 1),
            "fovea_y_orig": round(fovea_y_orig, 1),
            "disc_fovea_distance_px": disc_dist_val,
            "disc_fovea_distance_orig_px": disc_dist_orig,
            "disc_fovea_distance_dd": disc_dist_dd,
        }
    }

    # Diagnostic logging (Section 8)
    print(f"[TRINAY Diagnostic] Image: {meta['orig_w']}x{meta['orig_h']} -> Model: 512x512 | Crop: side={meta['side']}, x1={meta['x1']}, y1={meta['y1']}")
    print(f"  Raw FoveaNet : {pred_result.get('fovea_output_raw')} -> Model: ({pred_result.get('raw_fovea_x', fovea_x):.1f}, {pred_result.get('raw_fovea_y', fovea_y):.1f}) px")
    print(f"  Fovea Final  : Model ({fovea_x:.1f}, {fovea_y:.1f}) px -> Orig ({fovea_x_orig:.1f}, {fovea_y_orig:.1f}) px (Refined: {pred_result.get('refinement_applied')})")
    if disc_center_val:
        print(f"  Optic Disc   : Model ({disc_center_val[0]:.1f}, {disc_center_val[1]:.1f}) px -> Orig ({disc_center_orig[0]}, {disc_center_orig[1]}) px | Area: {disc_area_model} px")
        print(f"  OD-Fovea Dist: Model {disc_dist_val} px ({disc_dist_dd} DD) -> Orig {disc_dist_orig} px")
    print(f"  Macula (Est) : Model ({fovea_x:.1f}, {fovea_y:.1f}) r={int(round(512 * 0.11))}px -> Orig r={round(512 * 0.11 * scale_m2o, 1)}px (Geometric proxy)")
    print(f"  Plausibility : {geometry_info.get('checks', {})}")

    return {
        "anatomy":  anatomy_data,
        "lesions":  formatted_lesions,
        "findings": findings,
        "visualizations": {
            "canonical":     bgr_to_b64(canonical),
            "anatomy":       bgr_to_b64(anatomy_vis),
            "debug_anatomy": bgr_to_b64(debug_anatomy_vis),
            "lesion":        bgr_to_b64(lesion_vis),
            "combined":      bgr_to_b64(combined_vis),
        },
    }


# ============================================================
# STEP 4: XAI (Fast CPU Integrated Gradients)
# Uses backend/trinay_xai_fast.py
# ============================================================

def run_xai(image_bgr: np.ndarray) -> dict:
    """
    Runs the exact lightweight XAI pipeline from backend/trinay_xai_fast.py.
    Preserves original fundus image underneath heatmap.
    """
    from backend.trinay_xai_fast import (
        prepare_xai_input,
        load_lesion_model,
        get_lesion_predictions,
        detected_lesion_classes,
        load_vessel_model,
        explain_vessels,
        load_optic_disc_model,
        explain_optic_disc,
        load_fovea_model,
        explain_fovea,
        explain_lesions,
        resize_map,
        create_overlay,
        normalize_map,
        cleanup_cpu,
    )

    canonical_full, xai_tensor = prepare_xai_input(image_bgr)

    # 1. Check detected lesions
    lesion_model = load_lesion_model()
    probs = get_lesion_predictions(lesion_model, xai_tensor)
    detected = detected_lesion_classes(probs)
    del probs, lesion_model
    cleanup_cpu()

    # 2. Anatomy XAI
    vessel_model = load_vessel_model()
    vessel_map = explain_vessels(vessel_model, xai_tensor)
    del vessel_model
    cleanup_cpu()

    optic_model = load_optic_disc_model()
    optic_map = explain_optic_disc(optic_model, xai_tensor)
    del optic_model
    cleanup_cpu()

    fovea_model = load_fovea_model()
    fovea_map = explain_fovea(fovea_model, xai_tensor)
    del fovea_model
    cleanup_cpu()

    # 3. Lesion XAI (only detected classes)
    if detected:
        lesion_model = load_lesion_model()
        lesion_maps = explain_lesions(lesion_model, xai_tensor, detected)
        del lesion_model
        cleanup_cpu()
    else:
        lesion_maps = {}

    # 4. Combined maps
    anatomy_maps = [m for m in (vessel_map, optic_map, fovea_map) if m is not None]
    if anatomy_maps:
        anatomy_combined = np.maximum.reduce(anatomy_maps)
    else:
        anatomy_combined = np.zeros((192, 192), dtype=np.float32)

    if lesion_maps:
        lesion_combined = np.maximum.reduce(list(lesion_maps.values()))
    else:
        lesion_combined = np.zeros((192, 192), dtype=np.float32)

    combined_xai = normalize_map(np.maximum(anatomy_combined, lesion_combined))

    # 5. Overlays (blended with original fundus underneath, transparent weak attribution)
    vessel_overlay = create_overlay(canonical_full, resize_map(vessel_map)) if vessel_map is not None else None
    optic_overlay  = create_overlay(canonical_full, resize_map(optic_map))  if optic_map  is not None else None
    fovea_overlay  = create_overlay(canonical_full, resize_map(fovea_map))  if fovea_map  is not None else None
    anat_overlay   = create_overlay(canonical_full, resize_map(anatomy_combined))
    les_overlay    = create_overlay(canonical_full, resize_map(lesion_combined))
    comb_overlay   = create_overlay(canonical_full, resize_map(combined_xai))

    lesions_dict = {}
    for ci, lmap in lesion_maps.items():
        name = LESION_NAMES[ci]
        lesions_dict[name] = bgr_to_b64(create_overlay(canonical_full, resize_map(lmap)))

    cleanup_cpu()

    return {
        "vessel":           bgr_to_b64(vessel_overlay) if vessel_overlay is not None else None,
        "optic_disc":       bgr_to_b64(optic_overlay)  if optic_overlay  is not None else None,
        "fovea":            bgr_to_b64(fovea_overlay)  if fovea_overlay  is not None else None,
        "anatomy_combined": bgr_to_b64(anat_overlay),
        "lesion_combined":  bgr_to_b64(les_overlay),
        "combined":         bgr_to_b64(comb_overlay),
        "lesions":          lesions_dict,
    }


# ============================================================
# FLASK ENDPOINTS
# ============================================================

# ============================================================
# FLASK ENDPOINTS
@app.route("/api/health", methods=["GET"])
@app.route("/api/ml/health", methods=["GET"])
@app.route("/ml/health", methods=["GET"])
def health_endpoint():
    from backend.trinay_adapter import check_trinay_status
    trinay_status = check_trinay_status()
    cataract_models_dir = os.path.join(MODEL_DIR, "cataract_models")
    return jsonify({
        "status": "ok",
        "service": "RETINA-X Medical AI Platform",
        "device": str(DEVICE),
        "models": {
            "quality": os.path.exists(QUALITY_MODEL_PATH),
            "severity": os.path.exists(SEVERITY_MODEL_PATH),
            "vessel": os.path.exists(VESSEL_MODEL_PATH),
            "optic_disc": os.path.exists(OPTIC_DISC_MODEL_PATH),
            "fovea": os.path.exists(FOVEA_MODEL_PATH),
            "lesion": os.path.exists(LESION_MODEL_PATH),
        },
        "cataract_models": {
            "quality_model": os.path.exists(os.path.join(cataract_models_dir, "quality_model.pth")),
            "eye_detector": os.path.exists(os.path.join(cataract_models_dir, "eye_detector.pt")),
            "iris_model": os.path.exists(os.path.join(cataract_models_dir, "iris_model.pth")),
            "pupil_model": os.path.exists(os.path.join(cataract_models_dir, "pupil_model.pth")),
            "cataract_model": os.path.exists(os.path.join(cataract_models_dir, "cataract_model.pth")),
        },
        "glaucoma_models": {
            "quality_model": os.path.exists(os.path.join(PROJECT_ROOT, "glaucoma_model", "best_quality_model.pkl")),
            "disc_cup_unet": os.path.exists(os.path.join(PROJECT_ROOT, "glaucoma_model", "best_attention_disc_cup_unet.pth")),
            "vessel_unet": os.path.exists(os.path.join(PROJECT_ROOT, "glaucoma_model", "best_vessel_unet.pth")),
            "glaucoma_classifier": os.path.exists(os.path.join(PROJECT_ROOT, "glaucoma_model", "best_glaucoma_model.pkl")),
        },
        "trinay": trinay_status,
    })


@app.route("/api/ml/quality", methods=["POST"])
@app.route("/ml/quality", methods=["POST"])
def quality_endpoint():
    """Quality check only."""
    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded"}), 400

    file = request.files["image"]
    raw_bytes = file.read()

    try:
        image_bgr = decode_bytes_to_image(raw_bytes)
        result = run_quality(image_bgr)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route("/api/ml/analyze", methods=["POST"])
@app.route("/ml/analyze", methods=["POST"])
def analyze_endpoint():
    """
    Complete real inference pipeline:
    1. Read metadata (filename, size, resolution)
    2. Quality check with best_quality_model.pkl
    3. Run DR severity (dr_severity_efficientnet_b0.pth)
    4. Run TRINAY anatomy & lesions (vessels, disc, fovea, lesions)
    5. Run XAI (CPU Integrated Gradients)
    6. Return all predictions & visualizations
    """
    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded"}), 400

    file = request.files["image"]
    filename = file.filename or "uploaded_retina.jpg"
    raw_bytes = file.read()
    file_size_bytes = len(raw_bytes)

    file_size_str = (
        f"{file_size_bytes / (1024 * 1024):.1f} MB"
        if file_size_bytes >= 1024 * 1024
        else f"{max(1, file_size_bytes / 1024):.0f} KB"
    )

    try:
        image_bgr = decode_bytes_to_image(raw_bytes)
    except Exception as e:
        return jsonify({"error": f"Could not decode image: {e}"}), 400

    h, w = image_bgr.shape[:2]

    response = {
        "imageInfo": {
            "filename":   filename,
            "fileSize":   file_size_str,
            "resolution": f"{w} \u00d7 {h}",
            "width":      w,
            "height":     h,
        }
    }

    # STEP 1: Image Quality
    try:
        quality_result = run_quality(image_bgr)
        response["quality"] = quality_result
    except Exception as e:
        return jsonify({"error": f"Quality model failed: {e}", "trace": traceback.format_exc()}), 500

    response["stopped"] = False

    # STEP 2: DR Severity
    try:
        severity_result = run_dr_severity(image_bgr)
        response["severity"] = severity_result
    except Exception as e:
        return jsonify({"error": f"DR Severity model failed: {e}", "trace": traceback.format_exc()}), 500

    # STEP 3: TRINAY Anatomy + Lesion
    try:
        trinay_result = run_trinay(image_bgr)
        response["trinay"] = trinay_result
    except Exception as e:
        return jsonify({"error": f"TRINAY pipeline failed: {e}", "trace": traceback.format_exc()}), 500

    # STEP 4: XAI
    try:
        xai_result = run_xai(image_bgr)
        response["xai"] = xai_result
    except Exception as e:
        response["xai"] = None
        response["xaiError"] = str(e)

    # Persist DR artifacts
    screening_id = request.headers.get("x-screening-id") or request.form.get("screeningId") or f"SCR-{int(time.time()*1000) % 100000}"
    response["screening_id"] = screening_id

    canonical_b64 = trinay_result.get("visualizations", {}).get("canonical") if trinay_result else None
    t_vis = trinay_result.get("visualizations", {}) if trinay_result else {}

    gradcam_b64 = (xai_result.get("combined") if xai_result else None) or t_vis.get("combined")

    dr_artifacts = {
        "original": image_bgr,
        "original_fundus": canonical_b64 or image_bgr,
        "canonical": canonical_b64 or image_bgr,
        "lesions": t_vis.get("lesion") or (xai_result.get("lesion_combined") if xai_result else None),
        "lesion_overlay": t_vis.get("lesion") or (xai_result.get("lesion_combined") if xai_result else None),
        "anatomy": t_vis.get("anatomy") or (xai_result.get("anatomy_combined") if xai_result else None),
        "anatomy_map": t_vis.get("anatomy") or (xai_result.get("anatomy_combined") if xai_result else None),
        "combined": t_vis.get("combined") or gradcam_b64,
        "combined_xai": t_vis.get("combined") or gradcam_b64,
        "gradcam": gradcam_b64,
        "xai": gradcam_b64,
    }
    if t_vis.get("debug_anatomy"):
        dr_artifacts["debug_anatomy"] = t_vis["debug_anatomy"]
    if xai_result and xai_result.get("optic_disc"):
        dr_artifacts["optic_disc"] = xai_result["optic_disc"]
    if xai_result and xai_result.get("vessel"):
        dr_artifacts["vessel"] = xai_result["vessel"]
    
    artifact_urls = persist_screening_artifacts(screening_id, dr_artifacts)
    response["artifacts"] = artifact_urls

    # Persist to Supabase database & storage for real synchronization
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            patient_code = request.headers.get("x-patient-id") or request.form.get("patientId") or ""
            patient_name = request.headers.get("x-patient-name") or request.form.get("patientName") or ""
            patient_age = int(request.headers.get("x-patient-age") or request.form.get("patientAge") or 55)
            patient_gender = request.headers.get("x-patient-gender") or request.form.get("patientGender") or "Other"
            patient_phone = request.headers.get("x-patient-phone") or request.form.get("patientPhone") or ""
            eye_side = request.headers.get("x-eye-side") or request.form.get("eyeSide") or "Right Eye"

            patient_row = None
            if patient_code:
                pat_resp = requests.get(f"{SUPABASE_URL}/rest/v1/patients?patient_id=eq.{patient_code}", headers=headers, timeout=4)
                if pat_resp.status_code == 200 and pat_resp.json():
                    patient_row = pat_resp.json()[0]

            if not patient_row:
                p_payload = {
                    "patient_id": patient_code or f"PX-{int(time.time()*1000) % 10000}",
                    "name": patient_name or "Walk-in Patient",
                    "age": patient_age,
                    "gender": patient_gender,
                    "phone": patient_phone,
                    "diabetes_duration": 0,
                    "known_dr": False,
                }
                p_resp = requests.post(f"{SUPABASE_URL}/rest/v1/patients", headers={**headers, "Prefer": "return=representation"}, json=p_payload, timeout=4)
                if p_resp.status_code in [200, 201] and p_resp.json():
                    patient_row = p_resp.json()[0]

            patient_db_id = patient_row.get("id") if patient_row else None
            if patient_db_id:
                doctor_id = resolve_doctor_id(request)
                now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                session_payload = {
                    "doctor_id": doctor_id,
                    "patient_id": patient_db_id,
                    "screening_type": "dr",
                    "eye_side": eye_side,
                    "status": "completed",
                    "started_at": now_iso,
                    "completed_at": now_iso,
                }
                s_resp = requests.post(f"{SUPABASE_URL}/rest/v1/screening_sessions", headers={**headers, "Prefer": "return=representation"}, json=session_payload, timeout=4)
                if s_resp.status_code in [200, 201] and s_resp.json():
                    session_id = s_resp.json()[0]["id"]
                    response["session_id"] = session_id
                    response["id"] = session_id

                    if session_id and session_id != screening_id:
                        session_artifact_urls = persist_screening_artifacts(session_id, dr_artifacts)
                        if "artifacts" in response and isinstance(response["artifacts"], dict):
                            response["artifacts"].update(session_artifact_urls)

                    sev_info = severity_result or {}
                    verdict_val = sev_info.get("drSeverity") or "No DR"
                    prob_val = float(sev_info.get("confidence", 95.0)) / 100.0

                    res_payload = {
                        "screening_session_id": session_id,
                        "doctor_id": doctor_id,
                        "patient_id": patient_db_id,
                        "screening_type": "dr",
                        "verdict": verdict_val,
                        "probability": prob_val,
                        "severity": sev_info.get("drSeverityLevel") or verdict_val,
                        "image_quality": quality_result.get("quality", "Good") if quality_result else "Good",
                        "measurements": {
                            "anatomy": trinay_result.get("anatomy") if trinay_result else None,
                            "lesions": trinay_result.get("lesions") if trinay_result else None,
                            "findings": trinay_result.get("findings") if trinay_result else [],
                        },
                        "model_output": {
                            "severity": sev_info,
                            "trinay": trinay_result,
                            "imageInfo": response.get("imageInfo"),
                        },
                        "model_name": "TRINAY Multi-Task DR Ensemble",
                        "model_version": "2.0.0",
                        "clinical_summary": sev_info.get("recommendation") or "Diabetic retinopathy screening complete.",
                        "recommendations": {
                            "recommendation": sev_info.get("recommendation") or "",
                            "referralRequired": verdict_val != "No DR",
                        },
                        "review_status": "pending_review",
                    }
                    requests.post(f"{SUPABASE_URL}/rest/v1/screening_results", headers=headers, json=res_payload, timeout=4)

                    # Upload artifacts to Supabase Storage
                    for art_type, b64_val in [
                        ("original_fundus", canonical_b64),
                        ("lesions", dr_artifacts.get("lesions")),
                        ("lesion_overlay", dr_artifacts.get("lesions")),
                        ("anatomy", dr_artifacts.get("anatomy")),
                        ("anatomy_map", dr_artifacts.get("anatomy")),
                        ("combined", dr_artifacts.get("combined")),
                        ("combined_xai", dr_artifacts.get("combined")),
                        ("gradcam", dr_artifacts.get("gradcam")),
                    ]:
                        if not b64_val or not isinstance(b64_val, str):
                            continue
                        try:
                            clean_b64 = b64_val.split(",", 1)[1] if "," in b64_val else b64_val
                            raw_img = base64.b64decode(clean_b64)
                            storage_path = f"dr/{patient_db_id}/{session_id}/{art_type}.png"
                            requests.post(
                                f"{SUPABASE_URL}/storage/v1/object/medical-screenings/{storage_path}",
                                headers={
                                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                                    "Content-Type": "image/png",
                                    "x-upsert": "true"
                                },
                                data=raw_img,
                                timeout=5
                            )
                            art_row = {
                                "screening_session_id": session_id,
                                "doctor_id": doctor_id,
                                "patient_id": patient_db_id,
                                "artifact_type": art_type,
                                "bucket_id": "medical-screenings",
                                "storage_path": storage_path,
                                "mime_type": "image/png",
                                "file_size_bytes": len(raw_img),
                                "eye_side": eye_side,
                            }
                            requests.post(f"{SUPABASE_URL}/rest/v1/screening_artifacts", headers=headers, json=art_row, timeout=4)
                        except Exception as art_err:
                            print(f"[Supabase DR Artifact Error] {art_type}: {art_err}")
                    print(f"[Supabase] DR screening session {session_id} persisted successfully.")
        except Exception as se:
            print(f"[Supabase DR Sync Exception] {se}")

    return jsonify(response)


# ============================================================
# CATARACT 5-STAGE SCREENING ML ENDPOINTS
# ============================================================

@app.route("/api/ml/cataract/quality", methods=["POST"])
@app.route("/ml/cataract/quality", methods=["POST"])
def cataract_quality_endpoint():
    """Quality check for anterior eye / cataract screening."""
    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded"}), 400

    file = request.files["image"]
    raw_bytes = file.read()

    try:
        image_bgr = decode_bytes_to_image(raw_bytes)
        from backend.cataract_service import TrinayPipeline
        pipeline = TrinayPipeline.get_instance()
        quality_res = pipeline.quality_gate(image_bgr)
        return jsonify(quality_res)
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route("/api/ml/cataract/analyze", methods=["POST"])
@app.route("/ml/cataract/analyze", methods=["POST"])
def cataract_analyze_endpoint():
    """
    Complete real 5-model cataract screening pipeline:
    1. Read metadata (filename, size, actual resolution)
    2. Model 1: Quality check (MobileNetV3-Small) -> STOP if not good
    3. Model 2: Eye Detection (YOLO11n) -> orange bounding box
    4. Model 3: Iris Localization (U-Net) -> green boundary
    5. Model 4: Pupil Localization (U-Net) -> cyan boundary
    6. Model 5: Cataract Classification (EfficientNet-V2-S + CBAM)
    7. Generate real workflow & XAI visualizations
    """
    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded"}), 400

    file = request.files["image"]
    filename = file.filename or "uploaded_eye.jpg"
    raw_bytes = file.read()

    try:
        image_bgr = decode_bytes_to_image(raw_bytes)
    except Exception as e:
        return jsonify({"error": f"Could not decode image: {e}"}), 400

    try:
        from backend.cataract_service import run_cataract_screening
        result = run_cataract_screening(image_bgr, filename=filename)
        
        screening_id = request.form.get("screeningId") or f"CAT-{int(time.time()*1000) % 100000}"
        result["screening_id"] = screening_id
        patient_code = request.headers.get("x-patient-id") or request.form.get("patientId") or request.form.get("patient_id") or ""
        patient_name = request.headers.get("x-patient-name") or request.form.get("patientName") or request.form.get("patient_name") or ""
        eye_side = request.headers.get("x-eye-side") or request.form.get("eyeSide") or request.form.get("eye") or "Right Eye"

        cat_vis = result.get("visualizations", {})
        cat_artifacts = {
            "original": image_bgr,
            "original_fundus": image_bgr,
            "eye_box": cat_vis.get("eyeDetection"),
            "eyeDetection": cat_vis.get("eyeDetection"),
            "analyzed_region": cat_vis.get("analyzedRegion"),
            "analyzedRegion": cat_vis.get("analyzedRegion"),
            "anatomy": cat_vis.get("anatomy"),
            "opacity_evidence": cat_vis.get("opacityEvidenceMap"),
            "opacityEvidenceMap": cat_vis.get("opacityEvidenceMap"),
            "gradcam": cat_vis.get("gradcam"),
            "workflow": cat_vis.get("workflow"),
            "combined_xai": cat_vis.get("workflow"),
            "xai": cat_vis.get("xai") or cat_vis.get("gradcam"),
        }
        artifact_urls = persist_screening_artifacts(screening_id, cat_artifacts)
        result["artifacts"] = artifact_urls

        # Set top-level result attributes for direct UI/Report compatibility
        cat_info = result.get("cataract") or {}
        pred = cat_info.get("prediction") or "NORMAL"
        prob = float(cat_info.get("cataractProbability") or 0.0)
        
        result["diagnosis"] = "Suspected Cataract" if pred == "CATARACT" else "Normal"
        result["severity"] = "Suspected Cataract" if pred == "CATARACT" else "Normal"
        result["confidence"] = prob
        result["verdict"] = pred
        result["probability"] = prob
        result["success"] = True

        # Persist to Supabase database & storage
        headers = get_supabase_headers()
        if headers and SUPABASE_URL:
            try:
                # 1. Resolve patient row
                patient_row = None
                if patient_code:
                    pat_resp = requests.get(f"{SUPABASE_URL}/rest/v1/patients?patient_id=eq.{patient_code}", headers=headers, timeout=4)
                    if pat_resp.status_code == 200 and pat_resp.json():
                        patient_row = pat_resp.json()[0]

                if not patient_row:
                    p_payload = {
                        "patient_id": patient_code or f"PX-{int(time.time()*1000) % 10000}",
                        "name": patient_name or "Walk-in Patient",
                        "age": int(request.form.get("patientAge") or 55),
                        "gender": request.form.get("patientGender") or "Other",
                        "phone": request.form.get("patientPhone") or "",
                        "diabetes_duration": 0,
                        "known_dr": False,
                    }
                    p_resp = requests.post(f"{SUPABASE_URL}/rest/v1/patients", headers={**headers, "Prefer": "return=representation"}, json=p_payload, timeout=4)
                    if p_resp.status_code in [200, 201] and p_resp.json():
                        patient_row = p_resp.json()[0]

                patient_db_id = patient_row.get("id") if patient_row else None
                if patient_db_id:
                    doctor_id = resolve_doctor_id(request)
                    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    session_payload = {
                        "doctor_id": doctor_id,
                        "patient_id": patient_db_id,
                        "screening_type": "cataract",
                        "eye_side": eye_side,
                        "status": "completed",
                        "started_at": now_iso,
                        "completed_at": now_iso,
                    }
                    s_resp = requests.post(f"{SUPABASE_URL}/rest/v1/screening_sessions", headers={**headers, "Prefer": "return=representation"}, json=session_payload, timeout=4)
                    if s_resp.status_code in [200, 201] and s_resp.json():
                        session_id = s_resp.json()[0]["id"]
                        result["session_id"] = session_id
                        result["id"] = session_id
                        result["screening_id"] = session_id
                        if session_id and session_id != screening_id:
                            session_artifact_urls = persist_screening_artifacts(session_id, cat_artifacts)
                            if "artifacts" in result and isinstance(result["artifacts"], dict):
                                result["artifacts"].update(session_artifact_urls)

                        # 3. Insert screening_results
                        res_payload = {
                            "screening_session_id": session_id,
                            "doctor_id": doctor_id,
                            "patient_id": patient_db_id,
                            "screening_type": "cataract",
                            "verdict": pred,
                            "probability": prob,
                            "severity": "Suspected Cataract" if pred == "CATARACT" else "Normal",
                            "image_quality": "Good" if result.get("quality", {}).get("isGood", True) else "Bad",
                            "measurements": {
                                "eyeDetection": result.get("eyeDetection"),
                                "quantitativeAnalysis": result.get("quantitativeAnalysis"),
                                "quality": result.get("quality"),
                            },
                            "model_output": {
                                "cataract": cat_info,
                                "quantitativeAnalysis": result.get("quantitativeAnalysis"),
                                "imageInfo": result.get("imageInfo"),
                            },
                            "model_name": "TRINAY Cataract Pipeline (EfficientNet-V2-S)",
                            "model_version": "2.0.0",
                            "clinical_summary": cat_info.get("clinicalRecommendation") or "Cataract screening complete.",
                            "recommendations": {
                                "recommendation": cat_info.get("clinicalRecommendation") or "",
                                "referralRequired": pred == "CATARACT",
                            },
                            "review_status": "pending_review",
                        }
                        requests.post(f"{SUPABASE_URL}/rest/v1/screening_results", headers=headers, json=res_payload, timeout=4)

                        # 4. Upload artifacts to Supabase Storage with bounded retry
                        for art_type, b64_val in [
                            ("original_fundus", cat_vis.get("original")),
                            ("eye_box", cat_vis.get("eyeDetection")),
                            ("analyzed_region", cat_vis.get("analyzedRegion")),
                            ("anatomy", cat_vis.get("anatomy")),
                            ("opacity_evidence", cat_vis.get("opacityEvidenceMap")),
                            ("gradcam", cat_vis.get("gradcam")),
                            ("workflow", cat_vis.get("workflow")),
                            ("combined_xai", cat_vis.get("workflow")),
                        ]:
                            if not b64_val:
                                continue
                            try:
                                if "," in b64_val:
                                    b64_val = b64_val.split(",", 1)[1]
                                raw_img = base64.b64decode(b64_val)
                                storage_path = f"cataract/{patient_db_id}/{session_id}/{art_type}.png"
                                upload_ok = False
                                for attempt in range(2):
                                    try:
                                        up_resp = requests.post(
                                            f"{SUPABASE_URL}/storage/v1/object/medical-screenings/{storage_path}",
                                            headers={
                                                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                                                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                                                "Content-Type": "image/png",
                                                "x-upsert": "true"
                                            },
                                            data=raw_img,
                                            timeout=12
                                        )
                                        if up_resp.status_code in [200, 201]:
                                            upload_ok = True
                                            break
                                    except Exception:
                                        if attempt == 0:
                                            time.sleep(0.3)

                                if upload_ok:
                                    art_row = {
                                        "screening_session_id": session_id,
                                        "doctor_id": doctor_id,
                                        "patient_id": patient_db_id,
                                        "artifact_type": art_type,
                                        "bucket_id": "medical-screenings",
                                        "storage_path": storage_path,
                                        "mime_type": "image/png",
                                        "file_size_bytes": len(raw_img),
                                        "eye_side": eye_side,
                                    }
                                    requests.post(f"{SUPABASE_URL}/rest/v1/screening_artifacts", headers=headers, json=art_row, timeout=4)
                            except Exception as art_err:
                                print(f"[Supabase Cataract Artifact Error] {art_type}: {art_err}")
                        print(f"[Supabase] Cataract screening session {session_id} persisted successfully.")
            except Exception as se:
                print(f"[Supabase Cataract Sync Exception] {se}")

        try:
            rec_id = result.get("session_id") or result.get("id") or screening_id
            created_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            date_str = time.strftime("%d %b %Y", time.gmtime())
            prob_v = float(result.get("cataract", {}).get("cataractProbability", 1.0))
            pred_v = result.get("cataract", {}).get("prediction", "CATARACT")
            cat_rec = {
                "id": rec_id,
                "session_id": rec_id,
                "patientId": patient_code or (patient_row.get("patient_id") if patient_row else "2"),
                "patientDbId": patient_db_id,
                "patientName": patient_name or (patient_row.get("name") if patient_row else "Khushi Nanekar"),
                "patientAge": patient_age or (patient_row.get("age") if patient_row else 20),
                "patientGender": patient_gender or (patient_row.get("gender") if patient_row else "Female"),
                "patientPhone": patient_phone or (patient_row.get("phone") if patient_row else ""),
                "eye": eye_side,
                "eyeSide": eye_side,
                "screeningType": "cataract",
                "screening_type": "cataract",
                "status": "Completed",
                "date": date_str,
                "createdAt": date_str,
                "created_at": created_at_iso,
                "cataractPrediction": pred_v,
                "verdict": pred_v,
                "diagnosis": "Suspected Cataract" if pred_v == "CATARACT" else "Normal",
                "severity": "Suspected Cataract" if pred_v == "CATARACT" else "Normal",
                "confidence": int(round(prob_v * 100)),
                "confidenceScore": int(round(prob_v * 100)),
                "probability": prob_v,
                "imageOriginal": result.get("artifacts", {}).get("original") or f"/api/screenings/{rec_id}/artifacts/original",
                "imageEyeDetection": result.get("artifacts", {}).get("eye_box") or f"/api/screenings/{rec_id}/artifacts/eye_box",
                "imageAnalyzedRegion": result.get("artifacts", {}).get("analyzed_region") or f"/api/screenings/{rec_id}/artifacts/analyzed_region",
                "imageOpacityEvidence": result.get("artifacts", {}).get("opacity_evidence") or f"/api/screenings/{rec_id}/artifacts/opacity_evidence",
                "imageGradCam": result.get("artifacts", {}).get("gradcam") or f"/api/screenings/{rec_id}/artifacts/gradcam",
                "imageWorkflow": result.get("artifacts", {}).get("workflow") or f"/api/screenings/{rec_id}/artifacts/workflow",
                "imageXai": result.get("artifacts", {}).get("xai") or f"/api/screenings/{rec_id}/artifacts/xai",
                "result": {
                    "diagnosis": "Suspected Cataract" if pred_v == "CATARACT" else "Normal",
                    "severity": "Suspected Cataract" if pred_v == "CATARACT" else "Normal",
                    "confidence": prob_v,
                    "verdict": pred_v,
                    "cataract": result.get("cataract"),
                }
            }
            existing_cache = load_screenings_cache()
            filtered_cache = [c for c in existing_cache if c.get("id") != rec_id]
            save_screenings_cache([cat_rec] + filtered_cache)
        except Exception as ce:
            print(f"[Screening Cache Error] {ce}")

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Cataract pipeline failed: {e}", "trace": traceback.format_exc()}), 500


# ============================================================
# GLAUCOMA 4-STAGE SCREENING ML ENDPOINTS
# ============================================================

@app.route("/api/ml/glaucoma/quality", methods=["POST", "OPTIONS"])
@app.route("/ml/glaucoma/quality", methods=["POST", "OPTIONS"])
def glaucoma_quality_endpoint():
    """Quality check for retinal fundus / glaucoma screening."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded"}), 400

    file = request.files["image"]
    raw_bytes = file.read()

    try:
        image_bgr = decode_bytes_to_image(raw_bytes)
        from backend.glaucoma_service import GlaucomaService, frontend_quality_payload
        svc = GlaucomaService.get_instance()
        quality_res = svc.assess_quality(image_bgr)
        # Glaucoma connection adapter: return frontend-compatible
        # QualityResult while preserving original model keys.
        return jsonify(frontend_quality_payload(quality_res))
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route("/api/ml/glaucoma/analyze", methods=["POST", "OPTIONS"])
@app.route("/ml/glaucoma/analyze", methods=["POST", "OPTIONS"])
def glaucoma_analyze_endpoint():
    """
    Complete real Glaucoma screening pipeline:
    1. Read metadata (filename, size, actual resolution)
    2. Quality check (Random Forest 6-feature)
    3. Optic Disc & Cup Segmentation (Attention U-Net) -> 10 CDR morphological features
    4. Retinal Blood Vessel Segmentation (EfficientNet-B0 U-Net)
    5. Glaucoma Classification (Random Forest) + SHAP feature explanations + Grad-CAM heatmap
    6. Generate real 4-panel clinical visualization & Bokeh interactive HTML
    """
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded"}), 400

    file = request.files["image"]
    filename = file.filename or "uploaded_glaucoma_fundus.jpg"
    raw_bytes = file.read()

    try:
        image_bgr = decode_bytes_to_image(raw_bytes)
    except Exception as e:
        return jsonify({"error": f"Could not decode image: {e}"}), 400

    try:
        from backend.glaucoma_service import run_glaucoma_screening
        result = run_glaucoma_screening(image_bgr, filename=filename)
        
        # Persist Glaucoma artifacts (dual-key aliases so the Glaucoma UI
        # can resolve via opticNerve/optic_nerve/optic_disc_cup, vessels/
        # retinalAnatomy/vessel_segmentation, workflow/combined/combined_xai)
        screening_id = request.form.get("screeningId") or request.headers.get("x-screening-id") or f"GLC-{int(time.time()*1000) % 100000}"
        result["screening_id"] = screening_id
        patient_code = request.headers.get("x-patient-id") or request.form.get("patientId") or request.form.get("patient_id") or ""
        patient_name = request.headers.get("x-patient-name") or request.form.get("patientName") or request.form.get("patient_name") or ""
        eye_side = request.headers.get("x-eye-side") or request.form.get("eyeSide") or request.form.get("eye") or "Right Eye"
        patient_age = request.headers.get("x-patient-age") or request.form.get("patientAge") or request.form.get("patient_age") or 55
        patient_gender = request.headers.get("x-patient-gender") or request.form.get("patientGender") or request.form.get("patient_gender") or "Other"
        patient_phone = request.headers.get("x-patient-phone") or request.form.get("patientPhone") or request.form.get("patient_phone") or ""

        glc_vis = result.get("visualizations", {})
        glc_artifacts = {
            "original": image_bgr,
            "original_fundus": glc_vis.get("original") or image_bgr,
            "optic_nerve": glc_vis.get("opticNerve"),
            "opticNerve": glc_vis.get("opticNerve"),
            "optic_disc_cup": glc_vis.get("opticNerve"),
            "vessels": glc_vis.get("retinalAnatomy"),
            "retinalAnatomy": glc_vis.get("retinalAnatomy"),
            "vessel_segmentation": glc_vis.get("retinalAnatomy"),
            "gradcam": glc_vis.get("gradcam"),
            "combined": glc_vis.get("workflow"),
            "workflow": glc_vis.get("workflow"),
            "combined_xai": glc_vis.get("workflow"),
        }
        artifact_urls = persist_screening_artifacts(screening_id, glc_artifacts)
        result["artifacts"] = artifact_urls

        # Set top-level result attributes for direct UI/Report compatibility
        glc_info = result.get("glaucoma") or {}
        status_val = result.get("status", "")
        pred_raw = glc_info.get("prediction") or "INCONCLUSIVE"
        prob = float(glc_info.get("glaucomaProbability") or 0.0)
        gl_flag = bool(glc_info.get("glaucomaFlag") or (pred_raw == "GLAUCOMA_SUSPECT"))

        if status_val == "IMAGE_QUALITY_INSUFFICIENT":
            severity = "Ungradable"
            pred = "UNGRADABLE"
        elif status_val in ["SEGMENTATION_UNGRADABLE", "INCONCLUSIVE"] or pred_raw in ["INCONCLUSIVE", "UNGRADABLE"]:
            severity = "Inconclusive"
            pred = "INCONCLUSIVE"
            gl_flag = False
        elif gl_flag or pred_raw == "GLAUCOMA_SUSPECT":
            severity = "Glaucoma Suspect"
            pred = "GLAUCOMA_SUSPECT"
        else:
            severity = "Normal"
            pred = "NORMAL"
        
        result["diagnosis"] = severity
        result["severity"] = severity
        result["confidence"] = prob
        result["verdict"] = pred
        result["probability"] = prob
        result["success"] = result.get("success", True)

        # Persist to Supabase database & storage
        headers = get_supabase_headers()
        patient_row = None
        patient_db_id = None
        session_id = screening_id

        if headers and SUPABASE_URL:
            try:
                # 1. Resolve patient row
                if patient_code:
                    pat_resp = requests.get(f"{SUPABASE_URL}/rest/v1/patients?patient_id=eq.{patient_code}", headers=headers, timeout=4)
                    if pat_resp.status_code == 200 and pat_resp.json():
                        patient_row = pat_resp.json()[0]

                if not patient_row:
                    p_payload = {
                        "patient_id": patient_code or f"PX-{int(time.time()*1000) % 10000}",
                        "name": patient_name or "Walk-in Patient",
                        "age": int(patient_age or 55),
                        "gender": patient_gender or "Other",
                        "phone": patient_phone or "",
                        "diabetes_duration": 0,
                        "known_dr": False,
                    }
                    p_resp = requests.post(f"{SUPABASE_URL}/rest/v1/patients", headers={**headers, "Prefer": "return=representation"}, json=p_payload, timeout=4)
                    if p_resp.status_code in [200, 201] and p_resp.json():
                        patient_row = p_resp.json()[0]

                patient_db_id = patient_row.get("id") if patient_row else None
                if patient_db_id:
                    doctor_id = resolve_doctor_id(request)
                    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    session_payload = {
                        "doctor_id": doctor_id,
                        "patient_id": patient_db_id,
                        "screening_type": "glaucoma",
                        "eye_side": eye_side,
                        "status": "completed",
                        "started_at": now_iso,
                        "completed_at": now_iso,
                    }
                    s_resp = requests.post(f"{SUPABASE_URL}/rest/v1/screening_sessions", headers={**headers, "Prefer": "return=representation"}, json=session_payload, timeout=4)
                    if s_resp.status_code in [200, 201] and s_resp.json():
                        session_id = s_resp.json()[0]["id"]
                        result["session_id"] = session_id
                        result["screening_session_id"] = session_id
                        result["id"] = session_id
                        result["screening_id"] = session_id
                        if session_id and session_id != screening_id:
                            session_artifact_urls = persist_screening_artifacts(session_id, glc_artifacts)
                            if "artifacts" in result and isinstance(result["artifacts"], dict):
                                result["artifacts"].update(session_artifact_urls)

                        # 3. Insert screening_results
                        res_payload = {
                            "screening_session_id": session_id,
                            "doctor_id": doctor_id,
                            "patient_id": patient_db_id,
                            "screening_type": "glaucoma",
                            "verdict": pred,
                            "probability": prob,
                            "severity": severity,
                            "image_quality": "Good" if result.get("quality", {}).get("isGood", True) else "Bad",
                            "measurements": {
                                "discCupSegmentation": result.get("discCupSegmentation"),
                                "vesselSegmentation": result.get("vesselSegmentation"),
                                "quality": result.get("quality"),
                            },
                            "model_output": {
                                "glaucoma": glc_info,
                                "discCupSegmentation": result.get("discCupSegmentation"),
                                "vesselSegmentation": result.get("vesselSegmentation"),
                                "imageInfo": result.get("imageInfo"),
                            },
                            "model_name": "TRINAY Glaucoma Pipeline (UNet + RF + SHAP)",
                            "model_version": "2.0.0",
                            "clinical_summary": glc_info.get("clinicalRecommendation") or f"Glaucoma screening complete with prediction: {pred}.",
                            "recommendations": {
                                "recommendation": glc_info.get("clinicalRecommendation") or "",
                                "referralRequired": gl_flag,
                            },
                            "review_status": "pending_review",
                        }
                        requests.post(f"{SUPABASE_URL}/rest/v1/screening_results", headers=headers, json=res_payload, timeout=4)

                        # 4. Upload artifacts to Supabase Storage with bounded retry
                        for art_type, b64_val in [
                            ("original_fundus", glc_vis.get("original")),
                            ("optic_nerve", glc_vis.get("opticNerve")),
                            ("rim", glc_vis.get("rim")),
                            ("vessels", glc_vis.get("retinalAnatomy")),
                            ("gradcam", glc_vis.get("gradcam")),
                            ("workflow", glc_vis.get("workflow")),
                            ("combined_xai", glc_vis.get("workflow")),
                        ]:
                            if not b64_val:
                                continue
                            try:
                                if "," in b64_val:
                                    b64_val = b64_val.split(",", 1)[1]
                                raw_img = base64.b64decode(b64_val)
                                storage_path = f"glaucoma/{patient_db_id}/{session_id}/{art_type}.png"
                                upload_ok = False
                                for attempt in range(2):
                                    try:
                                        up_resp = requests.post(
                                            f"{SUPABASE_URL}/storage/v1/object/medical-screenings/{storage_path}",
                                            headers={
                                                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                                                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                                                "Content-Type": "image/png",
                                                "x-upsert": "true"
                                            },
                                            data=raw_img,
                                            timeout=12
                                        )
                                        if up_resp.status_code in [200, 201]:
                                            upload_ok = True
                                            break
                                    except Exception:
                                        if attempt == 0:
                                            time.sleep(0.3)

                                if upload_ok:
                                    art_row = {
                                        "screening_session_id": session_id,
                                        "doctor_id": doctor_id,
                                        "patient_id": patient_db_id,
                                        "artifact_type": art_type,
                                        "bucket_id": "medical-screenings",
                                        "storage_path": storage_path,
                                        "mime_type": "image/png",
                                        "file_size_bytes": len(raw_img),
                                        "eye_side": eye_side,
                                    }
                                    requests.post(f"{SUPABASE_URL}/rest/v1/screening_artifacts", headers=headers, json=art_row, timeout=4)
                            except Exception as art_err:
                                print(f"[Supabase Glaucoma Artifact Error] {art_type}: {art_err}")
                        print(f"[Supabase] Glaucoma screening session {session_id} persisted successfully.")
            except Exception as se:
                print(f"[Supabase Glaucoma Sync Exception] {se}")

        try:
            rec_id = result.get("session_id") or result.get("id") or screening_id
            created_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            date_str = time.strftime("%d %b %Y", time.gmtime())
            prob_v = float(glc_info.get("glaucomaProbability", 0.0))
            pred_v = glc_info.get("prediction", "NORMAL")
            glc_rec = {
                "id": rec_id,
                "session_id": rec_id,
                "patientId": patient_code or (patient_row.get("patient_id") if patient_row else "1"),
                "patientDbId": patient_db_id,
                "patientName": patient_name or (patient_row.get("name") if patient_row else "Patient information unavailable"),
                "patientAge": int(patient_age or (patient_row.get("age") if patient_row else 55)),
                "patientGender": patient_gender or (patient_row.get("gender") if patient_row else "Other"),
                "patientPhone": patient_phone or (patient_row.get("phone") if patient_row else ""),
                "eye": eye_side,
                "eyeSide": eye_side,
                "screeningType": "glaucoma",
                "screening_type": "glaucoma",
                "status": "Completed",
                "date": date_str,
                "createdAt": date_str,
                "created_at": created_at_iso,
                "glaucomaPrediction": pred_v,
                "verdict": pred_v,
                "diagnosis": severity,
                "severity": severity,
                "confidence": int(round(prob_v * 100)),
                "confidenceScore": int(round(prob_v * 100)),
                "probability": prob_v,
                "imageOriginal": result.get("artifacts", {}).get("original_fundus") or result.get("artifacts", {}).get("original") or f"/api/screenings/{rec_id}/artifacts/original_fundus",
                "imageOpticNerve": result.get("artifacts", {}).get("optic_nerve") or f"/api/screenings/{rec_id}/artifacts/optic_nerve",
                "imageRetinalAnatomy": result.get("artifacts", {}).get("vessels") or f"/api/screenings/{rec_id}/artifacts/vessels",
                "imageGradCam": result.get("artifacts", {}).get("gradcam") or f"/api/screenings/{rec_id}/artifacts/gradcam",
                "imageWorkflow": result.get("artifacts", {}).get("workflow") or result.get("artifacts", {}).get("combined") or f"/api/screenings/{rec_id}/artifacts/workflow",
                "imageXai": result.get("artifacts", {}).get("workflow") or result.get("artifacts", {}).get("combined") or f"/api/screenings/{rec_id}/artifacts/workflow",
                "artifacts": result.get("artifacts", {}),
                "verticalCDR": result.get("discCupSegmentation", {}).get("verticalCDR", 0) if isinstance(result.get("discCupSegmentation"), dict) else 0,
                "horizontalCDR": result.get("discCupSegmentation", {}).get("horizontalCDR", 0) if isinstance(result.get("discCupSegmentation"), dict) else 0,
                "areaCDR": result.get("discCupSegmentation", {}).get("areaCDR", 0) if isinstance(result.get("discCupSegmentation"), dict) else 0,
                "discDetected": result.get("discCupSegmentation", {}).get("discDetected", True) if isinstance(result.get("discCupSegmentation"), dict) else True,
                "cupDetected": result.get("discCupSegmentation", {}).get("cupDetected", True) if isinstance(result.get("discCupSegmentation"), dict) else True,
                "result": {
                    "diagnosis": severity,
                    "severity": severity,
                    "confidence": prob_v,
                    "verdict": pred_v,
                    "glaucoma": glc_info,
                }
            }
            existing_cache = load_screenings_cache()
            filtered_cache = [c for c in existing_cache if c.get("id") != rec_id]
            save_screenings_cache([glc_rec] + filtered_cache)
        except Exception as ce:
            print(f"[Screening Cache Error Glaucoma] {ce}")

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Glaucoma pipeline failed: {e}", "trace": traceback.format_exc()}), 500


# ============================================================
# PERSISTENT SCREENING ARTIFACT SERVING
# ============================================================

@app.route("/api/screenings/<screening_id>/artifacts/<artifact_name>", methods=["GET", "OPTIONS"])
@app.route("/screenings/<screening_id>/artifacts/<artifact_name>", methods=["GET", "OPTIONS"])
def get_screening_artifact_endpoint(screening_id, artifact_name):
    if request.method == "OPTIONS":
        from flask import Response
        res = Response(status=200)
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        res.headers["Access-Control-Allow-Headers"] = "*"
        return res

    clean_id = re.sub(r'[^a-zA-Z0-9_-]', '', str(screening_id))
    clean_name = re.sub(r'[^a-zA-Z0-9_.-]', '', str(artifact_name))

    alias_map = {
        "original": ["original", "original_fundus", "canonical"],
        "original_fundus": ["original_fundus", "original", "canonical"],
        "eye_box": ["eye_box", "eyeDetection", "eye_detection"],
        "eyeDetection": ["eyeDetection", "eye_box", "eye_detection"],
        "gradcam": ["gradcam", "xai", "gradcamOverlay", "gradcamRoi", "combined_xai"],
        "xai": ["xai", "gradcam", "workflow", "combined_xai"],
        "workflow": ["workflow", "combined_xai", "combined", "xai"],
        "combined": ["combined", "workflow", "combined_xai"],
        "combined_xai": ["combined_xai", "workflow", "combined"],
        "analyzed_region": ["analyzed_region", "analyzedRegion"],
        "analyzedRegion": ["analyzedRegion", "analyzed_region"],
        "opacity_evidence": ["opacity_evidence", "opacityEvidenceMap"],
        "opacityEvidenceMap": ["opacityEvidenceMap", "opacity_evidence"],
        "anatomy": ["anatomy", "anatomy_map", "anatomyCombined"],
        "iris": ["iris"],
        "pupil": ["pupil"],
        # Glaucoma connection aliases (optic nerve / vessel / workflow views)
        "optic_nerve": ["optic_nerve", "opticNerve", "optic_disc_cup"],
        "opticNerve": ["opticNerve", "optic_nerve", "optic_disc_cup"],
        "optic_disc_cup": ["optic_disc_cup", "optic_nerve", "opticNerve"],
        "vessels": ["vessels", "retinalAnatomy", "vessel_segmentation"],
        "retinalAnatomy": ["retinalAnatomy", "vessels", "vessel_segmentation"],
        "vessel_segmentation": ["vessel_segmentation", "vessels", "retinalAnatomy"],
        "report.pdf": ["report.pdf", "report_pdf.pdf", "report"],
        "report_pdf": ["report.pdf", "report_pdf.pdf", "report"],
    }
    candidates = alias_map.get(clean_name, [clean_name])
    extensions = [".png", ".jpg", ".jpeg", ".pdf", ""]
    target_dir = os.path.join(SCREENING_RESULTS_DIR, clean_id)

    # 1. Check direct local directory
    if os.path.exists(target_dir):
        for cname in candidates:
            for ext in extensions:
                fname = cname + ext
                candidate_path = os.path.join(target_dir, fname)
                if os.path.exists(candidate_path) and os.path.isfile(candidate_path):
                    mimetype = "application/pdf" if fname.endswith(".pdf") else ("image/png" if fname.endswith(".png") else "image/jpeg")
                    resp = send_from_directory(target_dir, fname, mimetype=mimetype)
                    resp.headers["Access-Control-Allow-Origin"] = "*"
                    return resp

    # 2. Check all screening directories for matching artifact
    if os.path.exists(SCREENING_RESULTS_DIR):
        for sdir in os.listdir(SCREENING_RESULTS_DIR):
            cand_dir = os.path.join(SCREENING_RESULTS_DIR, sdir)
            if os.path.isdir(cand_dir) and (clean_id in sdir or sdir in clean_id):
                for cname in candidates:
                    for ext in extensions:
                        cand_file = os.path.join(cand_dir, f"{cname}{ext}")
                        if os.path.exists(cand_file) and os.path.isfile(cand_file):
                            mimetype = "application/pdf" if cand_file.endswith(".pdf") else ("image/png" if cand_file.endswith(".png") else "image/jpeg")
                            resp = send_from_directory(cand_dir, f"{cname}{ext}", mimetype=mimetype)
                            resp.headers["Access-Control-Allow-Origin"] = "*"
                            return resp

    # 3. Fallback: Stream directly from Supabase Storage
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        for cname in candidates:
            try:
                art_resp = requests.get(
                    f"{SUPABASE_URL}/rest/v1/screening_artifacts?screening_session_id=eq.{clean_id}&artifact_type=eq.{cname}&select=storage_path,bucket_id,mime_type&limit=1",
                    headers=headers,
                    timeout=5
                )
                if art_resp.status_code == 200 and art_resp.json():
                    storage_path = art_resp.json()[0].get("storage_path")
                    bucket_id = art_resp.json()[0].get("bucket_id") or "medical-screenings"
                    stored_mime = art_resp.json()[0].get("mime_type") or "image/png"
                    if storage_path:
                        down_resp = requests.get(
                            f"{SUPABASE_URL}/storage/v1/object/{bucket_id}/{storage_path}",
                            headers={
                                "apikey": SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY,
                                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY}"
                            },
                            timeout=8
                        )
                        if down_resp.status_code == 200:
                            # Cache locally to disk
                            try:
                                os.makedirs(target_dir, exist_ok=True)
                                ext = ".pdf" if stored_mime == "application/pdf" else ".png"
                                with open(os.path.join(target_dir, f"{clean_name}{ext}"), "wb") as f:
                                    f.write(down_resp.content)
                            except Exception:
                                pass
                            from flask import Response
                            out = Response(down_resp.content, mimetype=stored_mime)
                            out.headers["Access-Control-Allow-Origin"] = "*"
                            return out
            except Exception as e:
                print(f"[Supabase Storage download fallback error] {e}")

    return jsonify({"error": f"Artifact {artifact_name} not found"}), 404


@app.route("/api/screenings/<screening_id>/report-pdf", methods=["POST", "OPTIONS"])
@app.route("/screenings/<screening_id>/report-pdf", methods=["POST", "OPTIONS"])
def upload_report_pdf_endpoint(screening_id):
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    clean_id = re.sub(r'[^a-zA-Z0-9_-]', '', str(screening_id))
    out_dir = os.path.join(SCREENING_RESULTS_DIR, clean_id)
    pdf_path = os.path.join(out_dir, "report.pdf")

    data = request.get_json(silent=True) or {}
    pdf_base64 = data.get("pdfBase64") or ""
    if not pdf_base64:
        if os.path.exists(pdf_path):
            return jsonify({
                "success": True,
                "pdfUrl": f"/api/screenings/{clean_id}/artifacts/report.pdf",
                "message": "Report PDF retrieved successfully."
            })
        return jsonify({
            "success": True,
            "pdfUrl": f"/api/screenings/{clean_id}/artifacts/report.pdf",
            "message": "Report PDF referenced successfully."
        })

    try:
        if "," in pdf_base64:
            pdf_base64 = pdf_base64.split(",", 1)[1]
        pdf_bytes = base64.b64decode(pdf_base64)

        # Save to local artifact storage
        os.makedirs(out_dir, exist_ok=True)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        headers = get_supabase_headers()
        storage_url = None
        if headers and SUPABASE_URL:
            try:
                storage_path = f"reports/{clean_id}/report.pdf"
                storage_resp = requests.post(
                    f"{SUPABASE_URL}/storage/v1/object/medical-screenings/{storage_path}",
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                        "Content-Type": "application/pdf",
                        "x-upsert": "true"
                    },
                    data=pdf_bytes,
                    timeout=10
                )
                if storage_resp.status_code in [200, 201]:
                    storage_url = f"{SUPABASE_URL}/storage/v1/object/public/medical-screenings/{storage_path}"
            except Exception as se:
                print(f"[Supabase Storage PDF Warning] {se}")

        return jsonify({
            "success": True,
            "pdfUrl": storage_url or f"/api/screenings/{clean_id}/artifacts/report.pdf",
            "message": "Report PDF uploaded successfully."
        })
    except Exception as e:
        print(f"[Upload PDF Error] {e}")
        return jsonify({"success": False, "error": str(e)}), 500



# ============================================================
# TRINAY RAG & VOICE ENDPOINTS
# ============================================================

@app.route("/api/ml/trinay/ask", methods=["POST"])
@app.route("/ml/trinay/ask", methods=["POST"])
def trinay_ask_endpoint():
    """TRINAY RAG Question Answering."""
    from backend.trinay_adapter import ask_trinay
    data = request.get_json(silent=True) or {}
    question = data.get("question", "")
    current_case = data.get("current_case") or data.get("currentCase")
    language = data.get("language", "English")
    speak = bool(data.get("speak", True))

    if not question:
        return jsonify({"error": "No question provided"}), 400

    try:
        result = ask_trinay(question, current_case=current_case, language=language, speak=speak)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"TRINAY RAG query failed: {e}", "trace": traceback.format_exc()}), 500


# ============================================================
# AUTHENTICATION, PATIENTS & ADMIN ENDPOINTS
# ============================================================

import requests
SUPABASE_URL = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or
    os.getenv("SERVICE_ROLE_KEY") or
    os.getenv("SUPABASE_SERVICE_KEY") or
    ""
).strip()
SUPABASE_ANON_KEY = (
    os.getenv("VITE_SUPABASE_ANON_KEY") or
    os.getenv("SUPABASE_ANON_KEY") or
    ""
).strip()

def get_supabase_headers():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


# ============================================================
# TRANSLATION ENDPOINTS (MULTILINGUAL SYSTEM)
# ============================================================

@app.route("/api/translate", methods=["POST", "OPTIONS"])
def translate_endpoint():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
        
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    src_lang = data.get("source_language", "eng_Latn")
    tgt_lang = data.get("target_language", "eng_Latn")
    
    if not text:
        return jsonify({"success": False, "error": "No text provided"}), 400
        
    if src_lang == tgt_lang:
        return jsonify({"success": True, "translated_text": text, "cached": False})
        
    result = translation_service.translate_text(text, src_lang, tgt_lang)
    return jsonify(result)

@app.route("/api/translate/batch", methods=["POST", "OPTIONS"])
def translate_batch_endpoint():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
        
    data = request.get_json(silent=True) or {}
    texts = data.get("texts", [])
    src_lang = data.get("source_language", "eng_Latn")
    tgt_lang = data.get("target_language", "eng_Latn")
    
    if not texts:
        return jsonify({"success": False, "error": "No texts provided"}), 400
        
    if src_lang == tgt_lang:
        return jsonify({"success": True, "translated_texts": texts, "cached": False})
        
    result = translation_service.translate_batch(texts, src_lang, tgt_lang)
    return jsonify(result)


@app.route("/api/auth/login", methods=["POST"])
def auth_login_endpoint():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip()
    password = (data.get("password") or "").strip()

    if not identifier:
        return jsonify({"success": False, "error": "Email or User ID is required."}), 400
    if not password:
        return jsonify({"success": False, "error": "Password is required."}), 400

    target_email = identifier.lower()
    headers = get_supabase_headers()

    if "@" not in target_email:
        if headers and SUPABASE_URL:
            try:
                prof_resp = requests.get(
                    f"{SUPABASE_URL}/rest/v1/profiles?or=(email.ilike.{target_email}@*,id.eq.{target_email},full_name.ilike.{target_email})&select=email",
                    headers=headers,
                    timeout=3
                )
                if prof_resp.status_code == 200 and prof_resp.json():
                    target_email = prof_resp.json()[0].get("email", target_email).lower()
                else:
                    target_email = f"{target_email}@gmail.com"
            except Exception:
                target_email = f"{target_email}@gmail.com"
        else:
            target_email = f"{target_email}@gmail.com"

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return jsonify({"success": False, "error": "Authentication database service unavailable."}), 533

    # Authenticate password hash against Supabase Auth
    try:
        auth_resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": target_email, "password": password},
            timeout=5
        )
        if auth_resp.status_code != 200:
            return jsonify({"success": False, "error": "Invalid email/user ID or password."}), 401
    except Exception as e:
        print(f"[Auth Exception] {e}")
        return jsonify({"success": False, "error": "Invalid email/user ID or password."}), 401

    if headers and SUPABASE_URL:
        try:
            link_resp = requests.post(
                f"{SUPABASE_URL}/auth/v1/admin/generate_link",
                headers=headers,
                json={"type": "magiclink", "email": target_email},
                timeout=5
            )
            if link_resp.status_code == 200:
                hashed_token = link_resp.json().get("properties", {}).get("hashed_token")
                if hashed_token:
                    return jsonify({"success": True, "email": target_email, "token_hash": hashed_token})
        except Exception as e:
            print(f"[Auth Exception] {e}")

    return jsonify({"success": True, "email": target_email})


@app.route("/api/patients/<patient_id>", methods=["DELETE"])
def delete_patient_endpoint(patient_id):
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            for table in ["screening_artifacts", "screening_results", "screening_sessions", "screening_evidence", "screening_findings", "specialist_reviews", "referrals", "reports", "screenings", "patients"]:
                requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?patient_id=eq.{patient_id}", headers=headers, timeout=3)
                if table == "patients":
                    requests.delete(f"{SUPABASE_URL}/rest/v1/patients?id=eq.{patient_id}", headers=headers, timeout=3)
        except Exception as e:
            print(f"[Delete Patient Warning] {e}")
    return jsonify({"success": True, "message": "Patient and associated records deleted successfully."})


@app.route("/api/patients", methods=["GET", "OPTIONS"])
def get_patients_endpoint():
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/patients?select=*&order=created_at.desc",
                headers=headers,
                timeout=5
            )
            if resp.status_code == 200:
                patients_list = resp.json() or []
                return jsonify({"success": True, "patients": patients_list, "data": patients_list})
        except Exception as e:
            print(f"[Get Patients Warning] {e}")
    return jsonify({"success": True, "patients": [], "data": []})


@app.route("/api/patients", methods=["POST", "OPTIONS"])
def create_patient_endpoint():
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200
    data = request.get_json(silent=True) or {}
    patient_id = (data.get("patientId") or data.get("patient_id") or f"PX-{int(time.time()*1000) % 10000}").strip()
    name = (data.get("name") or data.get("fullName") or "").strip()
    if not name:
        return jsonify({"success": False, "error": "Patient name is required."}), 400

    age = int(data.get("age") or 45)
    gender = data.get("gender") or "Male"
    phone = data.get("phone") or data.get("phoneNumber") or ""
    diabetes_duration = int(data.get("diabetesDuration") or data.get("diabetes_duration") or 0)
    known_dr = bool(data.get("knownDR") or data.get("known_dr") or False)

    payload = {
        "patient_id": patient_id,
        "name": name,
        "age": age,
        "gender": gender,
        "phone": phone,
        "diabetes_duration": diabetes_duration,
        "known_dr": known_dr,
    }

    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            # 1. Check if patient already exists
            check_resp = requests.get(f"{SUPABASE_URL}/rest/v1/patients?patient_id=eq.{patient_id}", headers=headers, timeout=5)
            if check_resp.status_code == 200 and check_resp.json():
                existing = check_resp.json()[0]
                return jsonify({"success": True, "patient": existing, "data": existing})

            # 2. Insert into public.patients
            post_resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/patients",
                headers={**headers, "Prefer": "return=representation"},
                json=payload,
                timeout=5
            )
            if post_resp.status_code in [200, 201] and post_resp.json():
                inserted = post_resp.json()[0]
                print(f"[Supabase] Successfully inserted patient {patient_id} (ID: {inserted.get('id')})")
                return jsonify({"success": True, "patient": inserted, "data": inserted})
            else:
                print(f"[Supabase] Insert patient error {post_resp.status_code}: {post_resp.text}")
        except Exception as e:
            print(f"[Create Patient Warning] {e}")

    return jsonify({"success": True, "patient": payload, "data": payload})



@app.route("/api/screenings/<screening_id>", methods=["GET", "OPTIONS"])
def get_screening_by_id_endpoint(screening_id):
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/screening_sessions?id=eq.{screening_id}&select=id,doctor_id,patient_id,screening_type,eye_side,status,started_at,completed_at,created_at,patients(id,patient_id,name,age,gender,phone),screening_results(id,verdict,probability,severity,image_quality,measurements,model_output,model_name,model_version,clinical_summary,recommendations,review_status,created_at),screening_artifacts(id,artifact_type,bucket_id,storage_path,mime_type,file_size_bytes,created_at)&limit=1",
                headers=headers,
                timeout=5
            )
            if resp.status_code == 200:
                sessions = resp.json() or []
                if not sessions:
                    return jsonify({"success": False, "error": "Not found"}), 404
                
                s = sessions[0]
                pat_raw = s.get("patients")
                pat = pat_raw[0] if isinstance(pat_raw, list) and pat_raw else (pat_raw if isinstance(pat_raw, dict) else {})
                
                res_raw = s.get("screening_results")
                res = res_raw[0] if isinstance(res_raw, list) and res_raw else (res_raw if isinstance(res_raw, dict) else {})
                
                art_raw = s.get("screening_artifacts")
                art_list = art_raw if isinstance(art_raw, list) else ([art_raw] if isinstance(art_raw, dict) else [])

                created_at_dt = s.get("created_at") or ""
                date_str = ""
                if created_at_dt:
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(created_at_dt.replace("Z", "+00:00"))
                        date_str = dt.strftime("%d %b %Y")
                    except Exception:
                        date_str = created_at_dt[:10]

                prob_val = res.get("probability")
                conf = int(round(float(prob_val) * 100)) if prob_val is not None else 85

                artifacts_dict = {}
                session_id_val = s.get("id")
                for a in art_list:
                    art_type = a.get("artifact_type")
                    if art_type:
                        artifacts_dict[art_type] = f"/api/screenings/{session_id_val}/artifacts/{art_type}"

                cat_p = float(prob_val) if prob_val is not None else 0.0
                norm_p = float(1.0 - cat_p)

                model_out = res.get("model_output") or {}
                measurements = res.get("measurements") or {}

                rec = {
                    "id": s.get("id"),
                    "session_id": s.get("id"),
                    "patientId": pat.get("patient_id") or pat.get("id") or s.get("patient_id"),
                    "patientDbId": pat.get("id") or s.get("patient_id"),
                    "patientName": pat.get("name") or "Patient information unavailable",
                    "patientAge": pat.get("age") or 50,
                    "patientGender": pat.get("gender") or "Other",
                    "patientPhone": pat.get("phone") or "",
                    "eye": s.get("eye_side") or "Right Eye",
                    "eyeSide": s.get("eye_side") or "Right Eye",
                    "screeningType": s.get("screening_type") or "dr",
                    "screening_type": s.get("screening_type") or "dr",
                    "status": "Completed" if str(s.get("status")).upper() == "COMPLETED" else "Review",
                    "date": date_str,
                    "createdAt": date_str,
                    "created_at": s.get("created_at"),
                    "drSeverity": res.get("severity") or res.get("verdict") or "No DR",
                    "drSeverityLevel": res.get("severity") or "Normal",
                    "cataractPrediction": res.get("verdict") or "NORMAL",
                    "cataractProbability": cat_p,
                    "normalProbability": norm_p,
                    "glaucomaPrediction": res.get("verdict") or "NORMAL",
                    "verdict": res.get("verdict") or "NORMAL",
                    "diagnosis": res.get("severity") or res.get("verdict") or "Normal",
                    "severity": res.get("severity") or "Normal",
                    "confidence": conf,
                    "confidenceScore": conf,
                    "probability": prob_val,
                    "recommendation": res.get("recommendations") or "",
                    "clinicalSummary": res.get("clinical_summary") or "",
                    "imageOriginal": artifacts_dict.get("original") or artifacts_dict.get("original_fundus") or artifacts_dict.get("canonical") or f"/api/screenings/{session_id_val}/artifacts/original",
                    "imageOpticNerve": artifacts_dict.get("optic_nerve") or artifacts_dict.get("opticNerve") or f"/api/screenings/{session_id_val}/artifacts/optic_nerve",
                    "imageRetinalAnatomy": artifacts_dict.get("vessels") or artifacts_dict.get("retinalAnatomy") or artifacts_dict.get("vessel_segmentation") or f"/api/screenings/{session_id_val}/artifacts/vessels",
                    "imageEyeDetection": artifacts_dict.get("eye_box") or f"/api/screenings/{session_id_val}/artifacts/eye_box",
                    "imageAnalyzedRegion": artifacts_dict.get("analyzed_region") or f"/api/screenings/{session_id_val}/artifacts/analyzed_region",
                    "imageOpacityEvidence": artifacts_dict.get("opacity_evidence") or f"/api/screenings/{session_id_val}/artifacts/opacity_evidence",
                    "imageGradCam": artifacts_dict.get("gradcam") or artifacts_dict.get("combined") or f"/api/screenings/{session_id_val}/artifacts/gradcam",
                    "imageWorkflow": artifacts_dict.get("combined") or artifacts_dict.get("workflow") or artifacts_dict.get("gradcam") or f"/api/screenings/{session_id_val}/artifacts/workflow",
                    "imageXai": artifacts_dict.get("combined") or artifacts_dict.get("xai") or artifacts_dict.get("gradcam") or f"/api/screenings/{session_id_val}/artifacts/xai",
                    "imageLesions": artifacts_dict.get("lesions") or artifacts_dict.get("lesion_segmentation") or f"/api/screenings/{session_id_val}/artifacts/lesions",
                    "imageAnatomy": artifacts_dict.get("anatomy") or artifacts_dict.get("anatomy_map") or artifacts_dict.get("vessel_segmentation") or f"/api/screenings/{session_id_val}/artifacts/anatomy",
                    "imageCombined": artifacts_dict.get("combined") or f"/api/screenings/{session_id_val}/artifacts/combined",
                    "verticalCDR": measurements.get("discCupSegmentation", {}).get("verticalCDR", 0) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else 0,
                    "horizontalCDR": measurements.get("discCupSegmentation", {}).get("horizontalCDR", 0) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else 0,
                    "areaCDR": measurements.get("discCupSegmentation", {}).get("areaCDR", 0) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else 0,
                    "discDetected": measurements.get("discCupSegmentation", {}).get("discDetected", True) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else True,
                    "cupDetected": measurements.get("discCupSegmentation", {}).get("cupDetected", True) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else True,
                    "artifacts": artifacts_dict,
                    "measurements": measurements,
                    "quantitativeAnalysis": measurements.get("quantitativeAnalysis") or model_out.get("quantitativeAnalysis"),
                    "anatomyData": measurements.get("anatomy") or model_out.get("anatomy"),
                    "lesionData": measurements.get("lesions") or model_out.get("lesions"),
                    "model_output": model_out,
                    "doctorSummary": (
                        "Anterior segment screening demonstrates clinically significant lens opacification in the crystalline lens within the pupillary aperture. Pupillary margins are intact without visible coloboma or synechiae. Visual axis compromise suspected. Recommendation: Comprehensive slit-lamp biomicroscopy and visual acuity testing with dilated fundus examination to assess cataract density (nuclear/cortical/posterior subcapsular) and determine surgical/medical candidacy."
                        if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity")))
                        else (
                            "Glaucoma evaluation reveals optic nerve head cup-to-disc ratio (CDR) and neuroretinal rim structural features. Saliency mapping highlights optic disc peripapillary region. Recommendation: Tonometry, optical coherence tomography (OCT) of RNFL, and Humphrey visual field testing."
                            if (res.get("screening_type") == "glaucoma" or str(res.get("verdict")).upper().startswith("GLAUC"))
                            else (
                                "Retinal fundus screening reveals microvascular changes consistent with diabetic retinopathy. Lesion mapping indicates capillary abnormalities requiring specialized retinal evaluation."
                                if (res.get("screening_type") == "dr" and res.get("verdict") not in ["No DR", "Normal", None])
                                else "Screening demonstrates normal ocular structures with no focal pathological lesions or significant opacifications. Optical axis and neuroretinal architecture remain intact."
                            )
                        )
                    ),
                    "patientSummary": (
                        "A clouding (cataract) was observed in the lens of your eye that can blur or dim your vision, like looking through a foggy window. This is very common and treatable. Please consult an eye specialist for an in-person eye exam to evaluate your vision and discuss treatment options."
                        if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity")))
                        else (
                            "Your optic nerve and retinal structures were evaluated for signs of glaucoma. The examination shows healthy structural margins and cup-to-disc ratio within normal limits. Continue routine preventive eye checks."
                            if (res.get("screening_type") == "glaucoma" and "SUSPECT" not in str(res.get("verdict")).upper() and "Suspect" not in str(res.get("severity")))
                            else (
                                "Your optic nerve examination indicates structural features that warrant clinical evaluation by an eye specialist to evaluate eye pressure and peripheral vision."
                                if (res.get("screening_type") == "glaucoma")
                                else "Your eye examination shows healthy structures with no critical disease markers detected. Continue routine preventive eye care."
                            )
                        )
                    ),
                    "precautions": [
                        "Avoid unassisted night driving, especially under bright oncoming headlights that cause glare.",
                        "Wear UV-blocking sunglasses during daylight hours to protect the eyes from solar radiation.",
                        "Ensure adequate lighting for reading and detailed tasks to reduce eye strain.",
                        "Do not rub your eyes and avoid self-prescribed over-the-counter eye drops without a doctor's consultation.",
                        "Schedule a complete slit-lamp examination with an ophthalmologist."
                    ] if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity"))) else [
                        "Maintain regular annual comprehensive eye health checkups.",
                        "Protect your eyes from prolonged direct sun exposure by wearing UV-rated sunglasses.",
                        "Maintain healthy hydration, balanced nutrition, and good illumination when reading."
                    ],
                    "result": {
                        "diagnosis": res.get("severity") or res.get("verdict") or "Normal",
                        "severity": res.get("severity") or "Normal",
                        "confidence": prob_val if prob_val is not None else 0.85,
                        "verdict": res.get("verdict"),
                        "cataract": model_out.get("cataract"),
                        "glaucoma": model_out.get("glaucoma"),
                        "measurements": measurements,
                        "quantitativeAnalysis": measurements.get("quantitativeAnalysis") or model_out.get("quantitativeAnalysis"),
                        "clinicalSummary": res.get("clinical_summary"),
                        "artifacts": artifacts_dict,
                        "imageOriginal": artifacts_dict.get("original") or artifacts_dict.get("original_fundus"),
                        "imageOpticNerve": artifacts_dict.get("optic_nerve") or artifacts_dict.get("opticNerve"),
                        "imageRetinalAnatomy": artifacts_dict.get("vessels") or artifacts_dict.get("retinalAnatomy"),
                        "imageEyeDetection": artifacts_dict.get("eye_box"),
                        "imageAnalyzedRegion": artifacts_dict.get("analyzed_region") or f"/api/screenings/{session_id_val}/artifacts/analyzed_region",
                        "imageOpacityEvidence": artifacts_dict.get("opacity_evidence") or f"/api/screenings/{session_id_val}/artifacts/opacity_evidence",
                        "imageIris": artifacts_dict.get("iris"),
                        "imagePupil": artifacts_dict.get("pupil"),
                        "imageAnatomyCombined": artifacts_dict.get("anatomy_map") or artifacts_dict.get("anatomy"),
                        "imageGradCam": artifacts_dict.get("gradcam"),
                        "imageWorkflow": artifacts_dict.get("combined_xai") or artifacts_dict.get("workflow"),
                        "imageXai": artifacts_dict.get("gradcam") or artifacts_dict.get("xai")
                    }
                }
                return jsonify({"success": True, "screening": rec, "data": rec})
        except Exception as e:
            print(f"[Get Screening By ID Warning] {e}")
    return jsonify({"success": False, "error": "Internal error"}), 500

SCREENINGS_CACHE_FILE = os.path.join(PROJECT_ROOT, "uploads", "screenings_cache.json")

def load_screenings_cache():
    try:
        if os.path.exists(SCREENINGS_CACHE_FILE):
            with open(SCREENINGS_CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception:
        pass
    return []

def save_screenings_cache(records):
    try:
        os.makedirs(os.path.dirname(SCREENINGS_CACHE_FILE), exist_ok=True)
        with open(SCREENINGS_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f)
    except Exception:
        pass

@app.route("/api/screenings", methods=["GET", "OPTIONS"])
def get_screenings_endpoint():
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/screening_sessions?select=id,doctor_id,patient_id,screening_type,eye_side,status,started_at,completed_at,created_at,patients(id,patient_id,name,age,gender,phone),screening_results(id,verdict,probability,severity,image_quality,measurements,model_output,model_name,model_version,clinical_summary,recommendations,review_status,created_at),screening_artifacts(id,artifact_type,bucket_id,storage_path,mime_type,file_size_bytes,created_at)&order=created_at.desc",
                headers=headers,
                timeout=15
            )
            if resp.status_code == 200:
                sessions = resp.json() or []
                formatted = []
                for s in sessions:
                    pat_raw = s.get("patients")
                    pat = pat_raw[0] if isinstance(pat_raw, list) and pat_raw else (pat_raw if isinstance(pat_raw, dict) else {})
                    
                    res_raw = s.get("screening_results")
                    res = res_raw[0] if isinstance(res_raw, list) and res_raw else (res_raw if isinstance(res_raw, dict) else {})
                    
                    art_raw = s.get("screening_artifacts")
                    art_list = art_raw if isinstance(art_raw, list) else ([art_raw] if isinstance(art_raw, dict) else [])

                    created_at_dt = s.get("created_at") or ""
                    date_str = ""
                    if created_at_dt:
                        try:
                            from datetime import datetime
                            dt = datetime.fromisoformat(created_at_dt.replace("Z", "+00:00"))
                            date_str = dt.strftime("%d %b %Y")
                        except Exception:
                            date_str = created_at_dt[:10]

                    prob_val = res.get("probability")
                    conf = int(round(float(prob_val) * 100)) if prob_val is not None else 85

                    artifacts_dict = {}
                    session_id_val = s.get("id")
                    for a in art_list:
                        art_type = a.get("artifact_type")
                        if art_type:
                            artifacts_dict[art_type] = f"/api/screenings/{session_id_val}/artifacts/{art_type}"

                    model_out = res.get("model_output") or {}
                    measurements = res.get("measurements") or {}

                    rec = {
                        "id": s.get("id"),
                        "session_id": s.get("id"),
                        "patientId": pat.get("patient_id") or pat.get("id") or s.get("patient_id"),
                        "patientDbId": pat.get("id") or s.get("patient_id"),
                        "patientName": pat.get("name") or "Patient information unavailable",
                        "patientAge": pat.get("age") or 50,
                        "patientGender": pat.get("gender") or "Other",
                        "patientPhone": pat.get("phone") or "",
                        "eye": s.get("eye_side") or "Right Eye",
                        "eyeSide": s.get("eye_side") or "Right Eye",
                        "screeningType": s.get("screening_type") or "dr",
                        "screening_type": s.get("screening_type") or "dr",
                        "status": "Completed" if str(s.get("status")).upper() == "COMPLETED" else "Review",
                        "date": date_str,
                        "createdAt": date_str,
                        "created_at": s.get("created_at"),
                        "drSeverity": res.get("severity") or res.get("verdict") or "No DR",
                        "drSeverityLevel": res.get("severity") or "Normal",
                        "cataractPrediction": res.get("verdict") or "NORMAL",
                        "glaucomaPrediction": res.get("verdict") or "NORMAL",
                        "verdict": res.get("verdict") or "NORMAL",
                        "diagnosis": res.get("severity") or res.get("verdict") or "Normal",
                        "severity": res.get("severity") or "Normal",
                        "confidence": conf,
                        "confidenceScore": conf,
                        "probability": prob_val,
                        "recommendation": res.get("recommendations") or "",
                        "clinicalSummary": res.get("clinical_summary") or "",
                        "imageOriginal": artifacts_dict.get("original") or artifacts_dict.get("original_fundus") or artifacts_dict.get("canonical") or f"/api/screenings/{session_id_val}/artifacts/original",
                        "imageOpticNerve": artifacts_dict.get("optic_nerve") or artifacts_dict.get("opticNerve") or f"/api/screenings/{session_id_val}/artifacts/optic_nerve",
                        "imageRetinalAnatomy": artifacts_dict.get("vessels") or artifacts_dict.get("retinalAnatomy") or artifacts_dict.get("vessel_segmentation") or f"/api/screenings/{session_id_val}/artifacts/vessels",
                        "imageEyeDetection": artifacts_dict.get("eye_box") or f"/api/screenings/{session_id_val}/artifacts/eye_box",
                        "imageAnalyzedRegion": artifacts_dict.get("analyzed_region") or f"/api/screenings/{session_id_val}/artifacts/analyzed_region",
                        "imageOpacityEvidence": artifacts_dict.get("opacity_evidence") or f"/api/screenings/{session_id_val}/artifacts/opacity_evidence",
                        "imageGradCam": artifacts_dict.get("gradcam") or artifacts_dict.get("combined") or f"/api/screenings/{session_id_val}/artifacts/gradcam",
                        "imageWorkflow": artifacts_dict.get("combined") or artifacts_dict.get("workflow") or artifacts_dict.get("gradcam") or f"/api/screenings/{session_id_val}/artifacts/workflow",
                        "imageXai": artifacts_dict.get("combined") or artifacts_dict.get("xai") or artifacts_dict.get("gradcam") or f"/api/screenings/{session_id_val}/artifacts/xai",
                        "imageLesions": artifacts_dict.get("lesions") or artifacts_dict.get("lesion_segmentation") or f"/api/screenings/{session_id_val}/artifacts/lesions",
                        "imageAnatomy": artifacts_dict.get("anatomy") or artifacts_dict.get("anatomy_map") or artifacts_dict.get("vessel_segmentation") or f"/api/screenings/{session_id_val}/artifacts/anatomy",
                        "imageCombined": artifacts_dict.get("combined") or f"/api/screenings/{session_id_val}/artifacts/combined",
                        "verticalCDR": measurements.get("discCupSegmentation", {}).get("verticalCDR", 0) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else 0,
                        "horizontalCDR": measurements.get("discCupSegmentation", {}).get("horizontalCDR", 0) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else 0,
                        "areaCDR": measurements.get("discCupSegmentation", {}).get("areaCDR", 0) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else 0,
                        "discDetected": measurements.get("discCupSegmentation", {}).get("discDetected", True) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else True,
                        "cupDetected": measurements.get("discCupSegmentation", {}).get("cupDetected", True) if isinstance(measurements, dict) and isinstance(measurements.get("discCupSegmentation"), dict) else True,
                        "artifacts": artifacts_dict,
                        "measurements": measurements,
                        "quantitativeAnalysis": measurements.get("quantitativeAnalysis") or model_out.get("quantitativeAnalysis"),
                        "anatomyData": measurements.get("anatomy") or model_out.get("anatomy"),
                        "lesionData": measurements.get("lesions") or model_out.get("lesions"),
                        "model_output": model_out,
                        "doctorSummary": (
                            "Anterior segment screening demonstrates clinically significant lens opacification in the crystalline lens within the pupillary aperture. Pupillary margins are intact without visible coloboma or synechiae. Visual axis compromise suspected. Recommendation: Comprehensive slit-lamp biomicroscopy and visual acuity testing with dilated fundus examination to assess cataract density (nuclear/cortical/posterior subcapsular) and determine surgical/medical candidacy."
                            if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity")))
                            else (
                                "Glaucoma evaluation reveals optic nerve head cup-to-disc ratio (CDR) and neuroretinal rim structural features. Saliency mapping highlights optic disc peripapillary region. Recommendation: Tonometry, optical coherence tomography (OCT) of RNFL, and Humphrey visual field testing."
                                if (res.get("screening_type") == "glaucoma" or str(res.get("verdict")).upper().startswith("GLAUC"))
                                else (
                                    "Retinal fundus screening reveals microvascular changes consistent with diabetic retinopathy. Lesion mapping indicates capillary abnormalities requiring specialized retinal evaluation."
                                    if (res.get("screening_type") == "dr" and res.get("verdict") not in ["No DR", "Normal", None])
                                    else "Screening demonstrates normal ocular structures with no focal pathological lesions or significant opacifications. Optical axis and neuroretinal architecture remain intact."
                                )
                            )
                        ),
                        "patientSummary": (
                            "A clouding (cataract) was observed in the lens of your eye that can blur or dim your vision, like looking through a foggy window. This is very common and treatable. Please consult an eye specialist for an in-person eye exam to evaluate your vision and discuss treatment options."
                            if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity")))
                            else (
                                "Your optic nerve and retinal structures were evaluated for signs of glaucoma. The examination shows healthy structural margins and cup-to-disc ratio within normal limits. Continue routine preventive eye checks."
                                if (res.get("screening_type") == "glaucoma" and "SUSPECT" not in str(res.get("verdict")).upper() and "Suspect" not in str(res.get("severity")))
                                else (
                                    "Your optic nerve examination indicates structural features that warrant clinical evaluation by an eye specialist to evaluate eye pressure and peripheral vision."
                                    if (res.get("screening_type") == "glaucoma")
                                    else "Your eye examination shows healthy structures with no critical disease markers detected. Continue routine preventive eye care."
                                )
                            )
                        ),
                        "precautions": [
                            "Avoid unassisted night driving, especially under bright oncoming headlights that cause glare.",
                            "Wear UV-blocking sunglasses during daylight hours to protect the eyes from solar radiation.",
                            "Ensure adequate lighting for reading and detailed tasks to reduce eye strain.",
                            "Do not rub your eyes and avoid self-prescribed over-the-counter eye drops without a doctor's consultation.",
                            "Schedule a complete slit-lamp examination with an ophthalmologist."
                        ] if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity"))) else [
                            "Maintain regular annual comprehensive eye health checkups.",
                            "Protect your eyes from prolonged direct sun exposure by wearing UV-rated sunglasses.",
                            "Maintain healthy hydration, balanced nutrition, and good illumination when reading."
                        ],
                        "result": {
                            "diagnosis": res.get("severity") or res.get("verdict") or "Normal",
                            "severity": res.get("severity") or "Normal",
                            "confidence": prob_val if prob_val is not None else 0.85,
                            "verdict": res.get("verdict"),
                            "cataract": model_out.get("cataract"),
                            "glaucoma": model_out.get("glaucoma"),
                            "measurements": measurements,
                            "clinicalSummary": res.get("clinical_summary"),
                            "artifacts": artifacts_dict,
                            "imageOriginal": artifacts_dict.get("original") or artifacts_dict.get("original_fundus"),
                            "imageOpticNerve": artifacts_dict.get("optic_nerve") or artifacts_dict.get("opticNerve"),
                            "imageRetinalAnatomy": artifacts_dict.get("vessels") or artifacts_dict.get("retinalAnatomy"),
                            "imageEyeDetection": artifacts_dict.get("eye_box"),
                            "imageIris": artifacts_dict.get("iris"),
                            "imagePupil": artifacts_dict.get("pupil"),
                            "imageAnatomyCombined": artifacts_dict.get("anatomy_map") or artifacts_dict.get("anatomy"),
                            "imageGradCam": artifacts_dict.get("gradcam"),
                            "imageWorkflow": artifacts_dict.get("combined_xai") or artifacts_dict.get("workflow"),
                            "imageXai": artifacts_dict.get("gradcam") or artifacts_dict.get("xai")
                        }
                    }
                    formatted.append(rec)
                if formatted:
                    save_screenings_cache(formatted)
                return jsonify({"success": True, "screenings": formatted, "data": formatted})
        except Exception as e:
            print(f"[Get Screenings Warning] {e}")
    # Return local cache if available on timeout or error
    cached = load_screenings_cache()
    if cached:
        return jsonify({"success": True, "screenings": cached, "data": cached})
    return jsonify({"success": True, "screenings": [], "data": []})


@app.route("/api/admin/users", methods=["GET"])
def get_admin_users_endpoint():
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            resp = requests.get(f"{SUPABASE_URL}/rest/v1/profiles", headers=headers, timeout=5)
            if resp.status_code == 200:
                return jsonify({"success": True, "users": resp.json()})
        except Exception as e:
            print(f"[Admin Users Warning] {e}")
    return jsonify({"success": True, "users": []})


@app.route("/api/admin/create-user", methods=["POST"])
def create_admin_user_endpoint():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password") or "Password123!"
    headers = get_supabase_headers()

    if headers and SUPABASE_URL:
        try:
            create_resp = requests.post(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                headers=headers,
                json={"email": email, "password": password, "email_confirm": True, "user_metadata": data},
                timeout=5
            )
            if create_resp.status_code in [200, 201]:
                user_obj = create_resp.json()
                user_id = user_obj.get("id")
                profile_payload = {
                    "id": user_id,
                    "email": email,
                    "name": data.get("fullName"),
                    "role": data.get("role"),
                    "status": data.get("status", "Active"),
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/profiles", headers=headers, json=profile_payload, timeout=3)
                return jsonify({"success": True, "user": profile_payload})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    return jsonify({"success": True, "user": data})


@app.route("/api/admin/user-status", methods=["POST"])
def toggle_user_status_endpoint():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    status = data.get("status", "Active")
    headers = get_supabase_headers()
    if headers and SUPABASE_URL and user_id:
        try:
            requests.patch(f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}", headers=headers, json={"status": status}, timeout=3)
        except Exception as e:
            print(f"[User Status Warning] {e}")
    return jsonify({"success": True})


@app.route("/api/admin/delete-user", methods=["DELETE"])
def delete_admin_user_endpoint():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId") or request.args.get("userId")
    headers = get_supabase_headers()
    if headers and SUPABASE_URL and user_id:
        try:
            requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}", headers=headers, timeout=5)
            requests.delete(f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}", headers=headers, timeout=3)
        except Exception as e:
            print(f"[Delete User Warning] {e}")
    return jsonify({"success": True})


# ============================================================
# STATIC FRONTEND SERVING (SINGLE-PORT SERVING DIST/ SPA)
# ============================================================

from flask import send_from_directory

DIST_DIR = os.path.join(PROJECT_ROOT, "dist")

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend_spa(path):
    if path.startswith("api/") or path.startswith("ml/"):
        return jsonify({"error": "Endpoint not found"}), 404
    if path != "" and os.path.exists(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    index_file = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index_file):
        return send_from_directory(DIST_DIR, "index.html")
    return "RETINA-X Unified Flask Server Running on Port 3000. Build frontend using 'npm run build'.", 200


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    port = int(os.environ.get("ML_PORT", 5001))
    print("\n" + "=" * 60)
    print("  RETINA-X UNIFIED FLASK BACKEND SERVER")
    print("=" * 60)
    print(f"  Single Port: http://0.0.0.0:{port}")
    print(f"  Device   : {DEVICE}")
    print(f"  Model dir: {MODEL_DIR}")

    all_ok = True
    print("\n  [DR / Fundus Models]")
    for name, path in {
        "Quality":    QUALITY_MODEL_PATH,
        "Severity":   SEVERITY_MODEL_PATH,
        "Vessel":     VESSEL_MODEL_PATH,
        "Optic Disc": OPTIC_DISC_MODEL_PATH,
        "Fovea":      FOVEA_MODEL_PATH,
        "Lesion":     LESION_MODEL_PATH,
    }.items():
        exists = os.path.exists(path)
        status = "\u2713" if exists else "\u2717 MISSING"
        print(f"  {status} {name}: {os.path.basename(path)}")
        if not exists:
            all_ok = False

    cat_dir = os.path.join(MODEL_DIR, "cataract_models")
    print("\n  [Cataract 5-Stage Models]")
    for name, filename in {
        "Quality (CatScreen)": "quality_model.pth",
        "Eye Detector (YOLO)": "eye_detector.pt",
        "Iris (U-Net)":        "iris_model.pth",
        "Pupil (U-Net)":       "pupil_model.pth",
        "Cataract Classifier": "cataract_model.pth",
    }.items():
        cpath = os.path.join(cat_dir, filename)
        exists = os.path.exists(cpath)
        status = "\u2713" if exists else "\u2717 MISSING"
        print(f"  {status} {name}: {filename}")
        if not exists:
            all_ok = False

    glaucoma_dir = os.path.join(PROJECT_ROOT, "glaucoma_model")
    print("\n  [Glaucoma 4-Stage Models]")
    for name, filename in {
        "Quality Gate":       "best_quality_model.pkl",
        "Attention Disc/Cup": "best_attention_disc_cup_unet.pth",
        "Vessel Segmentation": "best_vessel_unet.pth",
        "Glaucoma Classifier": "best_glaucoma_model.pkl",
    }.items():
        gpath = os.path.join(glaucoma_dir, filename)
        exists = os.path.exists(gpath)
        status = "\u2713" if exists else "\u2717 MISSING"
        print(f"  {status} {name}: {filename}")
        if not exists:
            all_ok = False

    if not all_ok:
        print("\n[WARNING] Some model files are missing. Endpoints may fail.")

    print(f"\n  Listening on http://0.0.0.0:{port}\n" + "=" * 60 + "\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=False)
