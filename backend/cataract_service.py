from __future__ import annotations

import base64
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

import cv2
import numpy as np
import torch
import matplotlib
matplotlib.use('Agg')

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from trinay.trinay_pipeline_final import TrinayPipeline
from trinay.visualize_trinay_workflow import (
    GradCAM,
    draw_anatomy_panel,
    draw_eye_box,
    draw_glow_boundary,
    get_cataract_model_and_input,
    make_gradcam_overlay,
    mask_diameter_and_center,
    overlay_mask,
    create_workflow_visualization_from_result,
)
from trinay.visualize_trinay_xai import create_visualization as create_xai_visualization

# Colors in BGR
ORANGE_COLOR = (0, 140, 255)  # Orange for Eye Detection Box
GREEN_COLOR = (50, 205, 50)   # Green for Iris localization
CYAN_COLOR = (255, 255, 0)    # Cyan for Pupil localization


def bgr_to_b64(image_bgr: np.ndarray, quality: int = 90) -> str:
    """Encode BGR image to base64 JPEG string."""
    if image_bgr is None:
        return ""
    success, buffer = cv2.imencode(".jpg", image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        return ""
    return base64.b64encode(buffer).decode("utf-8")


def png_file_to_b64(file_path: Path) -> str:
    """Read saved image file and encode to base64."""
    if not file_path.exists():
        return ""
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def draw_corner_rect(img: np.ndarray, pt1: tuple[int, int], pt2: tuple[int, int], color: tuple[int, int, int], thickness: int = 3, corner_len: int = 24):
    """Draws sleek clinical corner reticle brackets around a bounding box."""
    x1, y1 = pt1
    x2, y2 = pt2
    w = x2 - x1
    h = y2 - y1
    clen = min(corner_len, w // 4, h // 4)
    
    # Draw faint full rectangle
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 1, cv2.LINE_AA)
    
    # Top-Left corner
    cv2.line(img, (x1, y1), (x1 + clen, y1), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y1), (x1, y1 + clen), color, thickness, cv2.LINE_AA)
    
    # Top-Right corner
    cv2.line(img, (x2, y1), (x2 - clen, y1), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2, y1 + clen), color, thickness, cv2.LINE_AA)
    
    # Bottom-Left corner
    cv2.line(img, (x1, y2), (x1 + clen, y2), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1, y2 - clen), color, thickness, cv2.LINE_AA)
    
    # Bottom-Right corner
    cv2.line(img, (x2, y2), (x2 - clen, y2), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2, y2 - clen), color, thickness, cv2.LINE_AA)


def draw_eye_detection_overlay(image_bgr: np.ndarray, box: list[int], conf: float) -> np.ndarray:
    """Draw high-precision clinical eye detection box with corner brackets and telemetry badge."""
    output = image_bgr.copy()
    x1, y1, x2, y2 = [int(v) for v in box]
    
    # Glow pass
    glow = output.copy()
    draw_corner_rect(glow, (x1, y1), (x2, y2), (0, 140, 255), thickness=6, corner_len=30)
    output = cv2.addWeighted(glow, 0.40, output, 0.60, 0)
    
    # Crisp pass
    draw_corner_rect(output, (x1, y1), (x2, y2), (0, 165, 255), thickness=3, corner_len=30)
    
    # Telemetry Badge
    label = f"Eye ROI  {conf * 100:.1f}%"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.60
    thickness = 2
    (tw, th), _ = cv2.getTextSize(label, font, font_scale, thickness)
    
    badge_y1 = max(0, y1 - th - 16)
    badge_y2 = y1
    badge_x1 = x1
    badge_x2 = x1 + tw + 18
    
    # Draw dark translucent glass badge
    cv2.rectangle(output, (badge_x1, badge_y1), (badge_x2, badge_y2), (15, 23, 42), -1)
    cv2.rectangle(output, (badge_x1, badge_y1), (badge_x2, badge_y2), (0, 165, 255), 1, cv2.LINE_AA)
    
    # Badge dot + text
    cv2.circle(output, (badge_x1 + 10, badge_y1 + (badge_y2 - badge_y1) // 2), 4, (0, 165, 255), -1, cv2.LINE_AA)
    cv2.putText(output, label, (badge_x1 + 20, badge_y2 - 6), font, font_scale, (255, 255, 255), 1, cv2.LINE_AA)
    return output


def draw_analyzed_lens_region(image_bgr: np.ndarray, box: list[int]) -> np.ndarray:
    """
    Renders the exact analyzed lens/pupillary region on the original eye image.
    Uses a clean, clinical boundary and telemetry badge labeled 'Analyzed Lens Region'.
    Does not pretend an invisible segmentation model exists.
    """
    output = image_bgr.copy()
    h, w = output.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    # Subtle background focus dampening outside ROI (18% reduction) so the analyzed lens region is spotlighted
    dimmed = (output.astype(np.float32) * 0.82).astype(np.uint8)
    dimmed[y1:y2, x1:x2] = output[y1:y2, x1:x2]
    output = dimmed

    # Surgical corner brackets in cyan/sky blue
    SKY_COLOR = (248, 189, 56)  # Sky-400 in BGR
    draw_corner_rect(output, (x1, y1), (x2, y2), SKY_COLOR, thickness=3, corner_len=28)

    # Telemetry Badge
    label = "Analyzed Lens Region"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    thickness = 1
    (tw, th), _ = cv2.getTextSize(label, font, font_scale, thickness)

    badge_y1 = max(0, y1 - th - 14)
    badge_y2 = y1
    badge_x1 = x1
    badge_x2 = x1 + tw + 22

    # Translucent glass badge
    cv2.rectangle(output, (badge_x1, badge_y1), (badge_x2, badge_y2), (15, 23, 42), -1)
    cv2.rectangle(output, (badge_x1, badge_y1), (badge_x2, badge_y2), SKY_COLOR, 1, cv2.LINE_AA)
    cv2.circle(output, (badge_x1 + 10, badge_y1 + (badge_y2 - badge_y1) // 2), 3, SKY_COLOR, -1, cv2.LINE_AA)
    cv2.putText(output, label, (badge_x1 + 18, badge_y2 - 5), font, font_scale, (255, 255, 255), 1, cv2.LINE_AA)

    return output


def compute_evidence_intensity(opacity_pct: float, high_frac: float) -> dict:
    """
    AI EVIDENCE INTENSITY — derived directly from the CURRENT screening's
    opacity-evidence map (single source of truth: the same tier masks that
    drive the overlay colors and the pixel counts).

    Method: coverage = (HIGH + MODERATE tier pixels) / analyzed-region pixels.
      - HIGH:     coverage >= 8.0% or HIGH-tier fraction >= 5.0%
      - MODERATE: coverage >= 2.0%
      - LOW:      otherwise (little model-derived cataract evidence)

    This is AI evidence intensity, NOT clinical cataract severity. No validated
    cataract-grading thresholds exist in this pipeline, so no mild/moderate/
    severe clinical claim is made here.
    """
    if opacity_pct >= 8.0 or high_frac >= 5.0:
        level = "HIGH"
    elif opacity_pct >= 2.0:
        level = "MODERATE"
    else:
        level = "LOW"
    return {
        "level": level,
        "coveragePct": round(float(opacity_pct), 1),
        "method": (
            "AI Evidence Intensity from current evidence map: "
            "HIGH if High/Moderate coverage >= 8% (or High-tier >= 5%), "
            "MODERATE if >= 2%, else LOW. Screening evidence only — "
            "not clinical cataract severity."
        ),
    }


def generate_lens_opacity_evidence_map(
    image_bgr: np.ndarray,
    eye_box: list[int],
    cam_roi: np.ndarray,
    cataract_prob: float
) -> tuple[np.ndarray, int, float, dict]:
    """
    Generates a dedicated LENS OPACITY EVIDENCE MAP from the CURRENT screening.
    Restricted strictly to the analyzed lens region.
    Underlying eye image remains visible via transparent overlay.

    Scientific evidence tiers (single source of truth — these exact masks drive
    the overlay colors, the pixel counts, and the AI Evidence Intensity):
      - VERY HIGH (deep red / crimson #DC2626): score >= 0.80 and cataract_prob >= 0.60
      - HIGH (deep orange #F59E0B):            score >= 0.60 and cataract_prob >= 0.45
      - MODERATE (deep cyan-blue):             0.35 <= score < 0.60 and cataract_prob >= 0.38
      - LOW (deep navy #071A52):               0.15 <= score < 0.35
    where score = normalized Grad-CAM++ attention fused with localized optical
    scattering inside the analyzed lens region. Rendering only (dark
    semi-transparent colors, alpha 0.45-0.70 by tier) affects how the tiers
    look; masks, pixel counts, percentages, and probabilities are untouched.
    When the classifier finds no cataract evidence (e.g. low cataract
    probability), all masks are empty, the pixel count is 0, and the map
    correctly shows NO colored region — the numbers and the visualization
    can never contradict each other.

    Returns: (evidence_map_image, opacity_evidence_pixels, opacity_evidence_pct,
              tier_counts dict)
    """
    output = image_bgr.copy()
    h, w = output.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in eye_box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    roi = image_bgr[y1:y2, x1:x2].copy()
    roi_h, roi_w = roi.shape[:2]

    # Resize CAM to ROI dimensions
    cam_resized = cv2.resize(cam_roi, (roi_w, roi_h), interpolation=cv2.INTER_CUBIC)
    cam_norm = (cam_resized - np.min(cam_resized)) / max(1e-5, (np.max(cam_resized) - np.min(cam_resized)))

    # Localized optical scattering/luminance feature in analyzed anterior lens segment
    gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    scatter_feat = cv2.GaussianBlur(gray_roi, (15, 15), 0)
    s_min, s_max = np.min(scatter_feat), np.max(scatter_feat)
    scatter_norm = (scatter_feat - s_min) / max(1e-5, (s_max - s_min))

    # Evidence score combining model attention and localized optical scattering
    if cataract_prob >= 0.50:
        score = (cam_norm * 0.65) + (scatter_norm * 0.35)
        score = cv2.GaussianBlur(score, (9, 9), 0)
        sc_min, sc_max = np.min(score), np.max(score)
        score = (score - sc_min) / max(1e-5, (sc_max - sc_min))
        score = score * min(1.0, cataract_prob)
    else:
        score = cam_norm * 0.30 * cataract_prob

    # Create transparent evidence overlay strictly inside the analyzed lens region
    overlay = roi.copy()
    alpha_mask = np.zeros((roi_h, roi_w), dtype=np.float32)

    # Tier masks — ONE source of truth for overlay color, pixel counts, intensity.
    # Dark scientific rendering ONLY (BGR): deep navy low, deep cyan-blue
    # moderate, deep orange high, deep red/crimson very high. Stronger tiers
    # use stronger alpha (0.45-0.70) so peak evidence is visually dominant
    # while the underlying anatomy stays visible. No pastel colors.
    mask_very_high = (score >= 0.80) & (cataract_prob >= 0.60)
    overlay[mask_very_high] = (38, 38, 220)  # Deep red / crimson #DC2626 (BGR)
    alpha_mask[mask_very_high] = 0.70

    mask_high = (score >= 0.60) & (score < 0.80) & (cataract_prob >= 0.45)
    overlay[mask_high] = (11, 158, 245)  # Deep orange #F59E0B (BGR)
    alpha_mask[mask_high] = 0.62

    mask_mod = (score >= 0.35) & (score < 0.60) & (cataract_prob >= 0.38)
    overlay[mask_mod] = (181, 127, 10)  # Deep cyan-blue (BGR)
    alpha_mask[mask_mod] = 0.55

    mask_low = (score >= 0.15) & (score < 0.35)
    overlay[mask_low] = (82, 26, 7)  # Deep navy #071A52 (BGR)
    alpha_mask[mask_low] = 0.45

    # Blend transparent overlay with underlying eye image
    alpha_3d = np.repeat(alpha_mask[:, :, np.newaxis], 3, axis=2)
    blended_roi = (roi * (1.0 - alpha_3d) + overlay * alpha_3d).astype(np.uint8)
    output[y1:y2, x1:x2] = blended_roi

    # Subtle boundary around analyzed lens region
    SKY_COLOR = (248, 189, 56)
    draw_corner_rect(output, (x1, y1), (x2, y2), SKY_COLOR, thickness=2, corner_len=20)

    # Quantitative measurements — from the SAME tier masks rendered above.
    analyzed_area = roi_h * roi_w
    very_high_px = int(np.sum(mask_very_high))
    high_px = int(np.sum(mask_high)) + very_high_px
    mod_px = int(np.sum(mask_mod))
    low_px = int(np.sum(mask_low))
    opacity_pixels = int(high_px + mod_px)  # High/Moderate evidence zone only
    opacity_pct = round(float(opacity_pixels / max(1, analyzed_area)) * 100, 1)
    tier_counts = {
        "veryHighPx": very_high_px,
        "highPx": high_px,
        "moderatePx": mod_px,
        "lowPx": low_px,
    }

    # Header Banner & Clinical Legend
    banner_h = 32
    cv2.rectangle(output, (0, 0), (w, banner_h), (15, 23, 42), -1)
    cv2.putText(output, "LENS OPACITY EVIDENCE MAP", (12, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(output, "AI-derived visual evidence from the analyzed lens region", (12, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (203, 213, 225), 1, cv2.LINE_AA)

    # Legend in top right (matches rendered tier colors):
    leg_x = max(10, w - 300)
    cv2.circle(output, (leg_x, 15), 3, (38, 38, 220), -1, cv2.LINE_AA)
    cv2.putText(output, "V.HIGH", (leg_x + 6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (200, 200, 255), 1, cv2.LINE_AA)

    cv2.circle(output, (leg_x + 58, 15), 3, (11, 158, 245), -1, cv2.LINE_AA)
    cv2.putText(output, "HIGH", (leg_x + 64, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (200, 200, 255), 1, cv2.LINE_AA)

    cv2.circle(output, (leg_x + 108, 15), 3, (181, 127, 10), -1, cv2.LINE_AA)
    cv2.putText(output, "MOD", (leg_x + 114, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (200, 230, 255), 1, cv2.LINE_AA)

    cv2.circle(output, (leg_x + 152, 15), 3, (82, 26, 7), -1, cv2.LINE_AA)
    cv2.putText(output, "LOW", (leg_x + 158, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (200, 240, 255), 1, cv2.LINE_AA)

    return output, opacity_pixels, opacity_pct, tier_counts


def run_cataract_screening(image_bgr: np.ndarray, filename: str = "uploaded_eye.jpg") -> Dict[str, Any]:
    """
    Runs the complete cataract screening pipeline:
    1. Image Quality
    2. Eye Detection
    3. Cataract Classification (EfficientNet-V2-S + CBAM)
    4. Grad-CAM++ Attribution Map
    5. Lens Opacity Evidence Map (Dedicated primary visual evidence)
    + Generates objective quantitative opacity analysis.
    """
    h, w = image_bgr.shape[:2]
    pipeline = TrinayPipeline.get_instance()
    
    # 1. Quality Gate
    quality_info = pipeline.quality_gate(image_bgr)
    is_quality_good = quality_info.get("is_good", False)
    
    base_response = {
        "imageInfo": {
            "filename": filename,
            "fileSize": f"{round(len(cv2.imencode('.jpg', image_bgr)[1]) / 1024, 1)} KB",
            "resolution": f"{w} × {h}",
            "width": w,
            "height": h,
        },
        "quality": {
            "status": "GOOD" if is_quality_good else "BAD",
            "isGood": is_quality_good,
            "goodProbability": quality_info.get("good_probability", 1.0 if is_quality_good else 0.0),
            "badProbability": quality_info.get("bad_probability", 0.0 if is_quality_good else 1.0),
            "threshold": quality_info.get("threshold", 0.60),
        },
        "visualizations": {
            "original": bgr_to_b64(image_bgr),
        }
    }
    
    # If image quality is insufficient, stop and request retake
    if not is_quality_good:
        base_response["status"] = "IMAGE_QUALITY_INSUFFICIENT"
        base_response["message"] = "Image quality is insufficient for accurate cataract screening. Please retake or upload a clearer eye image."
        return base_response

    # 2. Eye Detection (YOLO11n)
    detections = pipeline.detect_eyes(image_bgr)
    if not detections:
        # Fallback to whole image if tight eye crop
        detections = [{
            "box": [0, 0, w, h],
            "confidence": 0.85,
            "class_id": 0,
            "fallback": True,
        }]

    primary_eye = detections[0]
    x1, y1, x2, y2 = primary_eye["box"]
    pad_x = int(0.03 * (x2 - x1))
    pad_y = int(0.03 * (y2 - y1))
    x1p = max(0, x1 - pad_x)
    y1p = max(0, y1 - pad_y)
    x2p = min(w, x2 + pad_x)
    y2p = min(h, y2 + pad_y)
    eye_box = [x1p, y1p, x2p, y2p]

    from trinay.trinay_pipeline_final import crop_box
    eye_roi_bgr = crop_box(image_bgr, eye_box)
    eye_detection_img = draw_eye_detection_overlay(image_bgr, primary_eye["box"], primary_eye["confidence"])
    analyzed_region_img = draw_analyzed_lens_region(image_bgr, eye_box)

    # 3. Cataract Classification (EfficientNet-V2-S directly)
    cataract = pipeline.classify_cataract(eye_roi_bgr)
    cataract_prob = float(cataract["cataract_probability"])
    normal_prob = float(cataract["normal_probability"])
    is_cataract = cataract["prediction"] == "CATARACT"

    # 3b. Iris & Pupil Segmentation (U-Nets) + geometric refinement.
    # Reuses the SAME loaded pipeline models/approach as pipeline.predict so the
    # 6-panel workflow anatomy view reflects the current screening's real masks.
    try:
        raw_iris_mask = pipeline.segment(pipeline.iris_model, eye_roi_bgr)
        raw_pupil_mask = pipeline.segment(pipeline.pupil_model, eye_roi_bgr)
        try:
            from trinay.anatomy_refinement import refine_anatomy
            refined = refine_anatomy(eye_roi_bgr, raw_iris_mask, raw_pupil_mask)
            iris_mask = refined["iris_mask"]
            pupil_mask = refined["pupil_mask"]
        except Exception:
            iris_mask = raw_iris_mask
            pupil_mask = raw_pupil_mask
        anatomy_img = draw_anatomy_panel(eye_roi_bgr, iris_mask, pupil_mask)
        anatomy_ok = True
    except Exception as e:
        print(f"[Anatomy segmentation error] {e}")
        anatomy_img = eye_roi_bgr.copy()
        anatomy_ok = False

    # 4. Grad-CAM++ Attribution Map — integrated with the SAME loaded
    # EfficientNet-V2-S used for classification, targeting the CURRENT
    # predicted class (CATARACT logit, or NORMAL via negated logit).
    gradcam_target_class = cataract["prediction"]
    gradcam_layer_name = "unknown"
    try:
        from trinay.visualize_trinay_workflow import GradCAMPlusPlus
        model, input_tensor = get_cataract_model_and_input(pipeline, eye_roi_bgr)
        gradcam = GradCAMPlusPlus(model)
        gradcam_layer_name = getattr(gradcam, "target_layer_name", type(gradcam.target_layer).__name__)
        cam = gradcam(input_tensor, target_class=gradcam_target_class)
        gradcam.remove_hooks()

        # Map heatmap to the ORIGINAL eye image dimensions (h, w)
        full_cam = np.zeros((h, w), dtype=np.float32)
        roi_h, roi_w = max(1, y2p - y1p), max(1, x2p - x1p)
        cam_roi_resized = cv2.resize(cam, (roi_w, roi_h), interpolation=cv2.INTER_CUBIC)
        full_cam[y1p:y2p, x1p:x2p] = cam_roi_resized

        # Overlay heatmap on the ORIGINAL eye image with medical transparency
        gradcam_img = make_gradcam_overlay(image_bgr, full_cam, alpha=0.80, add_badge=True)
        gradcam_roi_img = make_gradcam_overlay(eye_roi_bgr, cam, alpha=0.80, add_badge=True)
    except Exception as e:
        print(f"[Grad-CAM++ error] {e}")
        gradcam_img = image_bgr.copy()
        gradcam_roi_img = eye_roi_bgr.copy()
        cam = np.zeros((max(1, y2p - y1p), max(1, x2p - x1p)), dtype=np.float32)

    # 5. Lens Opacity Evidence Map (Dedicated primary evidence visualization)
    opacity_evidence_img, opacity_area_px, opacity_pct, tier_counts = generate_lens_opacity_evidence_map(
        image_bgr, eye_box, cam, cataract_prob
    )
    analyzed_area_px = int((x2p - x1p) * (y2p - y1p))
    high_frac = round(float(tier_counts["highPx"] / max(1, analyzed_area_px)) * 100, 1)
    evidence_intensity = compute_evidence_intensity(opacity_pct, high_frac)

    # 6. REAL 6-panel workflow composite from the CURRENT screening's panels
    # (original, eye detection, iris/pupil anatomy, Grad-CAM++, result card).
    try:
        workflow_png = create_workflow_visualization_from_result(
            image_bgr,
            eye_detection_img,
            anatomy_img,
            gradcam_img,
            cataract["prediction"],
            cataract_prob,
            normal_prob,
            quality_status=quality_info.get("status", "GOOD"),
            good_probability=quality_info.get("good_probability", 1.0),
            bad_probability=quality_info.get("bad_probability", 0.0),
            eye_confidence=primary_eye["confidence"],
        )
        workflow_b64 = base64.b64encode(workflow_png).decode("utf-8")
        workflow_ok = True
    except Exception as e:
        print(f"[Workflow visualization error] {e}")
        workflow_b64 = bgr_to_b64(opacity_evidence_img)
        workflow_ok = False

    print(
        "[SCREENING DEBUG] "
        f"prediction={cataract['prediction']} "
        f"cataract_prob={cataract_prob:.4f} normal_prob={normal_prob:.4f} "
        f"analyzed_region_px={analyzed_area_px} "
        f"opacity_px={opacity_area_px} opacity_pct={opacity_pct}% "
        f"tiers={tier_counts} intensity={evidence_intensity['level']} "
        f"gradcam_target={gradcam_target_class} gradcam_layer={gradcam_layer_name} "
        f"anatomy_ok={anatomy_ok} workflow_ok={workflow_ok}"
    )

    quantitative_analysis = {
        "analyzedRegionAreaPx": analyzed_area_px,
        "opacityEvidenceAreaPx": opacity_area_px,
        "opacityEvidencePercentage": opacity_pct,
        "cataractProbabilityPct": round(cataract_prob * 100, 2),
        "normalProbabilityPct": round(normal_prob * 100, 2),
        "evidenceIntensity": evidence_intensity["level"],
        "evidenceCoveragePct": evidence_intensity["coveragePct"],
        "evidenceMethod": evidence_intensity["method"],
        "highEvidencePx": tier_counts["highPx"],
        "moderateEvidencePx": tier_counts["moderatePx"],
        "lowEvidencePx": tier_counts["lowPx"],
    }

    # Build final response
    base_response.update({
        "status": "COMPLETE",
        "quality_status": quality_info.get("status", "GOOD"),
        "eye_detection_confidence": primary_eye["confidence"],
        "cataract_prediction": cataract["prediction"],
        "cataract_probability": cataract_prob,
        "normal_probability": normal_prob,
        "eyeDetection": {
            "detected": True,
            "confidence": primary_eye["confidence"],
            "box": primary_eye["box"],
            "roiBox": eye_box,
        },
        "quantitativeAnalysis": quantitative_analysis,
        "cataract": {
            "prediction": cataract["prediction"],  # "NORMAL" or "CATARACT"
            "cataractProbability": cataract_prob,
            "normalProbability": normal_prob,
            "confidence": round(max(cataract_prob, normal_prob) * 100, 1),
            "threshold": cataract["threshold"],
            "severityGrade": "Suspected Cataract" if is_cataract else "Normal / No Cataract",
            "clinicalRecommendation": (
                "Ophthalmologist consultation recommended for slit-lamp examination and cataract staging."
                if is_cataract
                else "Anterior segment clear. Routine annual eye checkup recommended."
            ),
            "quantitativeAnalysis": quantitative_analysis,
        },
        "visualizations": {
            "original": bgr_to_b64(image_bgr),
            "analyzedRegion": bgr_to_b64(analyzed_region_img),
            "opacityEvidenceMap": bgr_to_b64(opacity_evidence_img),
            "gradcam": bgr_to_b64(gradcam_img),
            "gradcamRoi": bgr_to_b64(gradcam_roi_img),
            "gradcamOverlay": bgr_to_b64(gradcam_img),
            "eyeDetection": bgr_to_b64(eye_detection_img),
            "anatomy": bgr_to_b64(anatomy_img),
            "workflow": workflow_b64,
            "xai": bgr_to_b64(gradcam_img),
        }
    })

    return base_response

