
"""
TRINAY
SEPARATE ANATOMY + LESION INFERENCE PIPELINE

Purpose:
    Prediction + visualization only.

Branches:
    Anatomy:
        - Blood vessels
        - Optic disc
        - Fovea
    Lesion:
        - MA
        - HE
        - EX
        - SE

This file intentionally does NOT run Integrated Gradients.
Keep XAI in trinay_xai_pipeline.py.

Run:
python src/anatomy/integrated/trinay_anatomy_lesion_pipeline.py \
"data/anatomy/IDRid/A. Segmentation/1. Original Images/a. Training Set/IDRiD_01.jpg"
"""

import os
import sys
import cv2
import numpy as np
import torch
import matplotlib.pyplot as plt

# ------------------------------------------------------------
# PROJECT PATHS
# ------------------------------------------------------------

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(
    os.path.join(CURRENT_DIR, "..")
)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# ------------------------------------------------------------
# DEVICE
# ------------------------------------------------------------

if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

# ------------------------------------------------------------
# IMPORTS
# ------------------------------------------------------------

from backend.model import UNet
from backend.postprocess import postprocess_masks, summarize_masks
from backend.unet_efficientnet import VesselUNet
from backend.optic_disc_unet import OpticDiscUNet
from backend.fovea_net import FoveaNet

# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------

IMAGE_SIZE = (512, 512)

LESION_NAMES = {
    0: "MA",
    1: "HE",
    2: "EX",
    3: "SE",
}

LESION_FULL_NAMES = {
    0: "Microaneurysm",
    1: "Haemorrhage",
    2: "Hard Exudate",
    3: "Soft Exudate",
}

LESION_THRESHOLDS = {
    0: 0.30,
    1: 0.10,
    2: 0.25,
    3: 0.10,
}

VESSEL_THRESHOLD = 0.50
OPTIC_DISC_THRESHOLD = 0.50

MODEL_DIR = os.path.join(PROJECT_ROOT, "model")

VESSEL_MODEL_PATH = os.path.join(MODEL_DIR, "best_vessel_unet.pth")
if not os.path.exists(VESSEL_MODEL_PATH):
    VESSEL_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "anatomy", "vessels", "best_vessel_unet.pth")

OPTIC_DISC_MODEL_PATH = os.path.join(MODEL_DIR, "best_optic_disc_unet.pth")
if not os.path.exists(OPTIC_DISC_MODEL_PATH):
    OPTIC_DISC_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "anatomy", "optic_disc", "best_optic_disc_unet.pth")

FOVEA_MODEL_PATH = os.path.join(MODEL_DIR, "best_fovea_net.pth")
if not os.path.exists(FOVEA_MODEL_PATH):
    FOVEA_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "anatomy", "fovea", "best_fovea_net.pth")

LESION_MODEL_PATH = os.path.join(MODEL_DIR, "standard_unet_ddr_finetuned.pth")
if not os.path.exists(LESION_MODEL_PATH):
    LESION_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "anatomy", "lesions", "standard_unet_ddr_finetuned.pth")

# ------------------------------------------------------------
# UTILS
# ------------------------------------------------------------

def check_checkpoint(path, name):
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"\n{name} checkpoint not found:\n{path}"
        )


def extract_state_dict(checkpoint):
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        return checkpoint["model_state_dict"]
    return checkpoint


def load_original_image(image_path):
    if not os.path.isabs(image_path):
        image_path = os.path.join(PROJECT_ROOT, image_path)

    image_path = os.path.abspath(image_path)

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"\nImage not found:\n{image_path}")

    image = cv2.imread(image_path)

    if image is None:
        raise ValueError(f"\nOpenCV could not read:\n{image_path}")

    return image, image_path


def crop_retina(image, return_meta: bool = False):
    """
    Crops the retinal fundus field with square padding.
    When return_meta=True, returns (cropped_image, meta_dict) containing
    exact bounding box and padding values for bidirectional coordinate transformation.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    mask = ((gray > 10).astype(np.uint8)) * 255

    kernel = np.ones((15, 15), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    img_h, img_w = image.shape[:2]

    if not contours:
        side = max(img_w, img_h)
        meta = {
            "orig_w": int(img_w),
            "orig_h": int(img_h),
            "x1": 0,
            "y1": 0,
            "side": int(side),
            "pad_left": 0,
            "pad_top": 0,
            "pad_right": 0,
            "pad_bottom": 0,
            "scale": 512.0 / float(side),
        }
        return (image, meta) if return_meta else image

    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)

    side = max(1, int(max(w, h) * 1.05))

    cx = x + w // 2
    cy = y + h // 2

    x1_orig = cx - side // 2
    y1_orig = cy - side // 2
    x2_orig = x1_orig + side
    y2_orig = y1_orig + side

    pad_left = max(0, -x1_orig)
    pad_top = max(0, -y1_orig)
    pad_right = max(0, x2_orig - img_w)
    pad_bottom = max(0, y2_orig - img_h)

    meta = {
        "orig_w": int(img_w),
        "orig_h": int(img_h),
        "x1": int(x1_orig),
        "y1": int(y1_orig),
        "side": int(side),
        "pad_left": int(pad_left),
        "pad_top": int(pad_top),
        "pad_right": int(pad_right),
        "pad_bottom": int(pad_bottom),
        "scale": 512.0 / float(side),
    }

    if any((pad_left, pad_top, pad_right, pad_bottom)):
        padded = cv2.copyMakeBorder(
            image,
            pad_top,
            pad_bottom,
            pad_left,
            pad_right,
            cv2.BORDER_CONSTANT,
            value=(0, 0, 0)
        )

        x1_pad = x1_orig + pad_left
        y1_pad = y1_orig + pad_top

        cropped = padded[y1_pad:y1_pad + side, x1_pad:x1_pad + side]
        return (cropped, meta) if return_meta else cropped

    cropped = image[y1_orig:y1_orig + side, x1_orig:x1_orig + side]
    return (cropped, meta) if return_meta else cropped


def model_to_orig_coords(x_model: float, y_model: float, meta: dict) -> tuple[float, float]:
    """Convert (x, y) from 512x512 model space to original-image pixel space."""
    side = float(meta["side"])
    x1 = float(meta["x1"])
    y1 = float(meta["y1"])
    x_orig = float(x_model) * (side / 512.0) + x1
    y_orig = float(y_model) * (side / 512.0) + y1
    return float(x_orig), float(y_orig)


def orig_to_model_coords(x_orig: float, y_orig: float, meta: dict) -> tuple[float, float]:
    """Convert (x, y) from original-image pixel space to 512x512 model space."""
    side = float(meta["side"])
    x1 = float(meta["x1"])
    y1 = float(meta["y1"])
    x_model = (float(x_orig) - x1) * (512.0 / side)
    y_model = (float(y_orig) - y1) * (512.0 / side)
    return float(x_model), float(y_model)


def untransform_mask(mask_model: np.ndarray, meta: dict) -> np.ndarray:
    """Map a 512x512 model segmentation mask back to original-image dimensions."""
    side = int(meta["side"])
    orig_w = int(meta["orig_w"])
    orig_h = int(meta["orig_h"])
    pad_left = int(meta["pad_left"])
    pad_top = int(meta["pad_top"])
    pad_right = int(meta["pad_right"])
    pad_bottom = int(meta["pad_bottom"])
    x1_orig = int(meta["x1"])
    y1_orig = int(meta["y1"])

    cropped_mask = cv2.resize(
        mask_model.astype(np.uint8),
        (side, side),
        interpolation=cv2.INTER_NEAREST
    )

    padded_h = orig_h + pad_top + pad_bottom
    padded_w = orig_w + pad_left + pad_right
    padded_mask = np.zeros((padded_h, padded_w), dtype=np.uint8)

    x1_pad = x1_orig + pad_left
    y1_pad = y1_orig + pad_top
    padded_mask[y1_pad:y1_pad + side, x1_pad:x1_pad + side] = cropped_mask

    orig_mask = padded_mask[pad_top:pad_top + orig_h, pad_left:pad_left + orig_w]
    return orig_mask


def prepare_input(image, return_meta: bool = False):
    crop_res = crop_retina(image, return_meta=return_meta)
    if return_meta:
        cropped, meta = crop_res
    else:
        cropped = crop_res
        meta = None

    canonical = cv2.resize(
        cropped,
        IMAGE_SIZE,
        interpolation=cv2.INTER_LINEAR
    )

    rgb = cv2.cvtColor(canonical, cv2.COLOR_BGR2RGB)

    tensor = torch.from_numpy(
        rgb
    ).float() / 255.0

    tensor = tensor.permute(2, 0, 1).unsqueeze(0)

    if return_meta:
        return canonical, tensor.to(DEVICE), meta
    return canonical, tensor.to(DEVICE)


# ------------------------------------------------------------
# MODEL LOADING
# ------------------------------------------------------------

def load_models():
    paths = [
        (VESSEL_MODEL_PATH, "Blood Vessel"),
        (OPTIC_DISC_MODEL_PATH, "Optic Disc"),
        (FOVEA_MODEL_PATH, "Fovea"),
        (LESION_MODEL_PATH, "Lesion"),
    ]

    for path, name in paths:
        check_checkpoint(path, name)

    vessel_model = VesselUNet()
    optic_disc_model = OpticDiscUNet()
    fovea_model = FoveaNet()
    lesion_model = UNet(
        in_channels=3,
        out_channels=4
    )

    checkpoints = [
        torch.load(
            VESSEL_MODEL_PATH,
            map_location=DEVICE,
            weights_only=False
        ),
        torch.load(
            OPTIC_DISC_MODEL_PATH,
            map_location=DEVICE,
            weights_only=False
        ),
        torch.load(
            FOVEA_MODEL_PATH,
            map_location=DEVICE,
            weights_only=False
        ),
        torch.load(
            LESION_MODEL_PATH,
            map_location=DEVICE,
            weights_only=False
        ),
    ]

    models = [
        vessel_model,
        optic_disc_model,
        fovea_model,
        lesion_model,
    ]

    names = [
        "Blood Vessel",
        "Optic Disc",
        "Fovea",
        "Lesion",
    ]

    for model, checkpoint, name in zip(
        models, checkpoints, names
    ):
        model.load_state_dict(
            extract_state_dict(checkpoint)
        )
        model.to(DEVICE)
        model.eval()
        print(f"✓ {name} model loaded")

    return tuple(models)


# ------------------------------------------------------------
# GEOMETRY VALIDATION & ANATOMICAL CHECKS
# ------------------------------------------------------------

def refine_fovea_faz(
    canonical: np.ndarray,
    vessel_mask: np.ndarray,
    disc_center: tuple[float, float],
    disc_diameter_est: float,
) -> tuple[float, float] | None:
    """
    Physiological refinement of fovea coordinates using the Foveal Avascular Zone (FAZ).
    
    When raw FoveaNet prediction exhibits severe vertical meridian misalignment or boundary
    saturation (e.g. from checkpoint bias on non-centered fundus images), this function locates
    the anatomical FAZ candidate within the temporal vascular sector:
    1. Bounds the physiological search window temporal to the optic disc along the horizontal meridian.
    2. Maximizes distance to segmented retinal blood vessels (avascular zone).
    3. Leverages macular xanthophyll pigment absorption (localized attenuation in the green channel).
    """
    h, w = canonical.shape[:2]
    dx, dy = disc_center
    cx, cy = w / 2.0, h / 2.0
    dd = float(disc_diameter_est) if disc_diameter_est and disc_diameter_est > 15.0 else 60.0

    # Temporal direction: fovea is temporal to the nasal optic disc
    if dx >= cx:  # Optic disc on right (left eye / nasal right) -> fovea is to the left
        x_min = int(max(20, dx - 3.8 * dd))
        x_max = int(min(w - 20, dx - 1.5 * dd))
    else:  # Optic disc on left (right eye / nasal left) -> fovea is to the right
        x_min = int(max(20, dx + 1.5 * dd))
        x_max = int(min(w - 20, dx + 3.8 * dd))

    # Physiological vertical corridor: within ±1.3 DD of optic disc horizontal meridian
    y_min = int(max(20, dy - 1.3 * dd))
    y_max = int(min(h - 20, dy + 1.3 * dd))

    if x_min >= x_max or y_min >= y_max:
        return None

    # 1. Distance transform from blood vessels (FAZ has no retinal blood vessels)
    vessel_inv = (1 - (vessel_mask > 0).astype(np.uint8)) * 255
    dist_map = cv2.distanceTransform(vessel_inv, cv2.DIST_L2, 5)

    # 2. Inverted green channel (macula is darker in green channel due to pigment absorption)
    green = canonical[:, :, 1].astype(np.float32)
    green_blur = cv2.GaussianBlur(green, (15, 15), 0)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    green_norm = clahe.apply(green_blur.astype(np.uint8)).astype(np.float32)

    roi_dist = dist_map[y_min:y_max, x_min:x_max]
    roi_dark = 255.0 - green_norm[y_min:y_max, x_min:x_max]

    max_dist = np.max(roi_dist)
    max_dark = np.max(roi_dark)
    if max_dist < 1e-3 or max_dark < 1e-3:
        return None

    score = (roi_dist / max_dist) * 0.6 + (roi_dark / max_dark) * 0.4
    best_y_sub, best_x_sub = np.unravel_index(np.argmax(score), score.shape)
    best_x = float(x_min + best_x_sub)
    best_y = float(y_min + best_y_sub)

    return best_x, best_y


def validate_disc_fovea_geometry(
    fovea_x: float,
    fovea_y: float,
    optic_disc_mask: np.ndarray,
    image_shape=(512, 512)
) -> dict:
    """
    Validates anatomical plausibility of optic disc and fovea positions
    in model space (or any matching coordinate system).
    """
    h, w = image_shape[:2]
    disc_mask_u8 = (optic_disc_mask > 0).astype(np.uint8)

    contours, _ = cv2.findContours(
        disc_mask_u8,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )
    disc_center = None
    disc_area = int(np.sum(disc_mask_u8 > 0))
    disc_diameter_est = None

    if contours:
        largest_c = max(contours, key=cv2.contourArea)
        M = cv2.moments(largest_c)
        if M["m00"] > 0:
            disc_center = (float(M["m10"] / M["m00"]), float(M["m01"] / M["m00"]))
            disc_diameter_est = float(2.0 * np.sqrt(M["m00"] / np.pi))

    dist_px = None
    checks = {
        "fovea_within_retina": False,
        "optic_disc_detected": False,
        "distance_within_range": False,
        "temporal_alignment": False,
        "vertical_alignment": False
    }

    cx, cy = w / 2.0, h / 2.0
    r_retina = min(w, h) * 0.47
    dist_to_center = np.sqrt((fovea_x - cx) ** 2 + (fovea_y - cy) ** 2)
    checks["fovea_within_retina"] = bool(dist_to_center <= r_retina)

    if disc_center is not None and disc_diameter_est is not None and disc_diameter_est > 10.0:
        checks["optic_disc_detected"] = True
        dx, dy = disc_center
        dist_px = float(np.sqrt((fovea_x - dx) ** 2 + (fovea_y - dy) ** 2))
        dd_dist = dist_px / disc_diameter_est

        # Anatomical distance in fundus photos: 1.4 to 4.5 disc diameters (~80px to ~290px in 512px space)
        dd_in_range = (1.4 <= dd_dist <= 4.5)
        px_in_range = (60.0 <= dist_px <= 290.0)
        checks["distance_within_range"] = bool(dd_in_range or (px_in_range and dist_px >= disc_diameter_est * 1.2))

        # Temporal alignment:
        # If disc is on nasal right (dx >= cx), fovea must be to the left (fx < dx)
        # If disc is on nasal left (dx < cx), fovea must be to the right (fx > dx)
        if dx >= cx:
            checks["temporal_alignment"] = bool(fovea_x < dx - (disc_diameter_est * 0.4))
        else:
            checks["temporal_alignment"] = bool(fovea_x > dx + (disc_diameter_est * 0.4))

        # Vertical alignment: fovea is near horizontal meridian (within ~1.8 disc diameters or ~80px)
        vert_thresh = max(60.0, disc_diameter_est * 1.8)
        checks["vertical_alignment"] = bool(abs(fovea_y - dy) <= vert_thresh)

        is_plausible = (
            checks["fovea_within_retina"] and
            checks["distance_within_range"] and
            checks["temporal_alignment"] and
            checks["vertical_alignment"]
        )
    else:
        is_plausible = checks["fovea_within_retina"]
        dd_dist = None

    return {
        "is_plausible": bool(is_plausible),
        "anatomically_plausible": bool(is_plausible),
        "optic_disc_center": disc_center,
        "disc_center": disc_center,
        "optic_disc_area_px": disc_area,
        "disc_area_px": disc_area,
        "optic_disc_diameter_est_px": disc_diameter_est,
        "disc_diameter_est": disc_diameter_est,
        "disc_fovea_distance_px": dist_px,
        "distance_px": dist_px,
        "disc_diameters_distance": dd_dist,
        "distance_in_disc_diameters": dd_dist,
        "checks": checks
    }


# ------------------------------------------------------------
# PREDICTION
# ------------------------------------------------------------

def predict_all(
    tensor,
    vessel_model,
    optic_disc_model,
    fovea_model,
    lesion_model,
    canonical_bgr=None
):
    with torch.no_grad():
        vessel_probability = torch.sigmoid(
            vessel_model(tensor)
        )[0, 0].cpu().numpy()

        optic_disc_probability = torch.sigmoid(
            optic_disc_model(tensor)
        )[0, 0].cpu().numpy()

        # FoveaNet was trained on [0, 1] RGB tensors directly.
        # Run in standard model.eval() mode without artificial ImageNet mean/std subtraction.
        fovea_model.eval()
        fovea_raw_tensor = fovea_model(tensor).squeeze(0)

        # Numerical validity and bounds checks
        is_finite = bool(torch.isfinite(fovea_raw_tensor).all().item())
        fovea_output = fovea_raw_tensor.cpu().numpy()

        is_in_bounds = bool(
            0.0 <= fovea_output[0] <= 1.0 and
            0.0 <= fovea_output[1] <= 1.0
        )

        lesion_probability = torch.sigmoid(
            lesion_model(tensor)
        )[0].cpu().numpy()

    vessel_mask = (
        vessel_probability >= VESSEL_THRESHOLD
    ).astype(np.uint8)

    optic_disc_mask = (
        optic_disc_probability >= OPTIC_DISC_THRESHOLD
    ).astype(np.uint8)

    # Subpixel float coordinates preserved
    raw_fovea_x = float(fovea_output[0] * float(IMAGE_SIZE[0]))
    raw_fovea_y = float(fovea_output[1] * float(IMAGE_SIZE[1]))
    fovea_x = float(np.clip(raw_fovea_x, 0.0, float(IMAGE_SIZE[0] - 1)))
    fovea_y = float(np.clip(raw_fovea_y, 0.0, float(IMAGE_SIZE[1] - 1)))

    # Initial anatomical geometry validation
    geometry_info = validate_disc_fovea_geometry(
        fovea_x=fovea_x,
        fovea_y=fovea_y,
        optic_disc_mask=optic_disc_mask,
        image_shape=IMAGE_SIZE
    )

    refinement_applied = False
    refinement_method = None
    refinement_reason = None
    faz_reference_point = None

    # Anatomical validation is a sanity check only (does not replace genuine model inference).
    # If the image is non-fundus or coordinates violate physiological bounds, the prediction is flagged.
    if canonical_bgr is not None:
        disc_ctr = geometry_info.get("disc_center")
        disc_dm = geometry_info.get("disc_diameter_est")
        if disc_ctr is not None and disc_dm is not None:
            faz_reference_point = refine_fovea_faz(canonical_bgr, vessel_mask, disc_ctr, disc_dm)

    raw_lesion_masks = {}

    for class_idx in range(4):
        raw_lesion_masks[class_idx] = (
            lesion_probability[class_idx]
            >= LESION_THRESHOLDS[class_idx]
        ).astype(np.uint8)

    processed_lesion_masks = postprocess_masks(
        raw_lesion_masks,
        num_classes=4
    )

    lesion_summary = summarize_masks(
        processed_lesion_masks
    )

    return {
        "vessel_probability": vessel_probability,
        "vessel_mask": vessel_mask,
        "optic_disc_probability": optic_disc_probability,
        "optic_disc_mask": optic_disc_mask,
        "fovea_x": fovea_x,
        "fovea_y": fovea_y,
        "fovea_output_raw": [float(fovea_output[0]), float(fovea_output[1])],
        "raw_fovea_x": raw_fovea_x,
        "raw_fovea_y": raw_fovea_y,
        "fovea_is_finite": is_finite,
        "fovea_is_in_bounds": is_in_bounds,
        "refinement_applied": refinement_applied,
        "refinement_method": refinement_method,
        "refinement_reason": refinement_reason,
        "diagnostic_faz_reference": faz_reference_point,
        "geometry": geometry_info,
        "lesion_probability": lesion_probability,
        "raw_lesion_masks": raw_lesion_masks,
        "processed_lesion_masks": processed_lesion_masks,
        "lesion_summary": lesion_summary,
    }


# ------------------------------------------------------------
# VISUALIZATION
# ------------------------------------------------------------

def mask_overlay(
    image,
    mask,
    color,
    alpha=0.55
):
    output = image.copy()
    mask_bool = mask > 0

    if not np.any(mask_bool):
        return output

    color_layer = np.zeros_like(output)
    color_layer[:, :] = color

    output[mask_bool] = (
        output[mask_bool].astype(np.float32) * (1 - alpha)
        + color_layer[mask_bool].astype(np.float32) * alpha
    ).astype(np.uint8)

    return output


def draw_anatomical_badge(img, text, pos, color, anchor_pt=None):
    """Draw a high-contrast medical callout badge with clean connector line and crisp text, strictly clamped within image bounds."""
    h, w = img.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.38
    thickness = 1
    (tw, th), baseline = cv2.getTextSize(text, font, scale, thickness)
    pad_x = 6
    pad_y = 4
    x, y = pos
    x = int(np.clip(x, pad_x + 4, w - tw - pad_x - 4))
    y = int(np.clip(y, th + pad_y + 4, h - baseline - pad_y - 4))

    # Clean connector line if anchor point is provided
    if anchor_pt is not None:
        ax = int(np.clip(anchor_pt[0], 2, w - 2))
        ay = int(np.clip(anchor_pt[1], 2, h - 2))
        target_x = x + tw // 2
        target_y = y - th // 2
        cv2.line(img, (ax, ay), (target_x, target_y), (220, 230, 240), 1, cv2.LINE_AA)
        cv2.circle(img, (ax, ay), 3, color, -1, cv2.LINE_AA)
        cv2.circle(img, (ax, ay), 5, (255, 255, 255), 1, cv2.LINE_AA)

    # Dark high-contrast solid badge background with color border
    x1, y1 = max(0, x - pad_x), max(0, y - th - pad_y)
    x2, y2 = min(w, x + tw + pad_x), min(h, y + baseline + pad_y)
    if y1 < y2 and x1 < x2:
        sub = img[y1:y2, x1:x2]
        badge_bg = np.zeros_like(sub)
        badge_bg[:] = (10, 14, 22)
        img[y1:y2, x1:x2] = cv2.addWeighted(sub, 0.15, badge_bg, 0.85, 0)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 1, cv2.LINE_AA)

    cv2.putText(img, text, (x, y), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def create_anatomy_overlay(
    canonical,
    vessel_mask,
    optic_disc_mask,
    fovea_x,
    fovea_y
):
    output = canonical.copy()
    h, w = output.shape[:2]

    # 1. Blood Vessels: Real trained VesselUNet mask with high-contrast emerald green overlay
    # Morphological bridge to ensure continuous vessel branches without altering positions
    v_u8 = vessel_mask.astype(np.uint8)
    if np.max(v_u8) <= 1:
        v_u8 = v_u8 * 255
    k_vessel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    vessel_continuous = cv2.morphologyEx(v_u8, cv2.MORPH_CLOSE, k_vessel)

    # High-contrast vivid green vessel overlay (BGR: 20, 245, 60)
    output = mask_overlay(
        output,
        vessel_continuous,
        (20, 245, 60),
        alpha=0.65
    )

    # 2. Optic Disc: Real trained OpticDiscUNet segmentation
    disc_mask_u8 = optic_disc_mask.astype(np.uint8)
    if np.max(disc_mask_u8) <= 1:
        disc_mask_u8 = disc_mask_u8 * 255

    contours, _ = cv2.findContours(
        disc_mask_u8,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    disc_center = None
    if contours:
        # Subtle semi-transparent amber fill
        disc_fill = np.zeros_like(output)
        cv2.drawContours(disc_fill, contours, -1, (0, 180, 255), -1)
        output = cv2.addWeighted(output, 1.0, disc_fill, 0.28, 0)

        # High-contrast double contour line (outer bright yellow, inner white)
        cv2.drawContours(output, contours, -1, (0, 215, 255), 2, cv2.LINE_AA)

        largest_c = max(contours, key=cv2.contourArea)
        M = cv2.moments(largest_c)
        if M["m00"] > 0:
            disc_center = (int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"]))

    # 3. Macula & Fovea: Real trained FoveaNet coordinates
    fx, fy = int(round(fovea_x)), int(round(fovea_y))
    fx = int(np.clip(fx, 15, w - 15))
    fy = int(np.clip(fy, 15, h - 15))

    # Macula ROI circular zone (approx 11% radius ~56px) with soft tint and sharp border
    macula_radius = int(min(h, w) * 0.11)
    macula_fill = np.zeros_like(output)
    cv2.circle(macula_fill, (fx, fy), macula_radius, (0, 165, 255), -1)
    output = cv2.addWeighted(output, 1.0, macula_fill, 0.12, 0)
    cv2.circle(output, (fx, fy), macula_radius, (0, 220, 255), 1, cv2.LINE_AA)

    # Fovea Centralis reticle marker (bullseye + crosshair)
    cv2.circle(output, (fx, fy), 4, (0, 255, 255), -1, cv2.LINE_AA)
    cv2.circle(output, (fx, fy), 11, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.drawMarker(output, (fx, fy), (0, 255, 255), cv2.MARKER_CROSS, 20, 1, cv2.LINE_AA)

    # 4. Clear anatomical callout badges anchored to real model predictions
    # Optic Disc label
    if disc_center:
        dx, dy = disc_center
        lbl_x = dx - 40 if dx < w // 2 else dx - 35
        lbl_y = dy - 32 if dy > 55 else dy + 42
        draw_anatomical_badge(output, "Optic Disc", (lbl_x, lbl_y), (0, 215, 255), anchor_pt=(dx, dy))

    # Fovea Centralis label
    lbl_fx = fx - 25 if fx < w // 2 else fx - 65
    lbl_fy = fy + 34 if fy < h - 55 else fy - 30
    draw_anatomical_badge(output, "Fovea", (lbl_fx, lbl_fy), (0, 255, 255), anchor_pt=(fx, fy))

    # Macula label near the ROI boundary - clearly labeled as Estimated ROI
    lbl_mx = fx + macula_radius - 10 if fx < w // 2 else fx - macula_radius - 50
    lbl_my = fy - macula_radius - 10 if fy > 70 else fy + macula_radius + 20
    draw_anatomical_badge(
        output,
        "Macula (Est. ROI)",
        (lbl_mx, lbl_my),
        (0, 180, 255),
        anchor_pt=(fx + int(macula_radius * 0.7), fy - int(macula_radius * 0.7))
    )

    # Blood Vessels label
    draw_anatomical_badge(output, "Blood Vessels", (14, 26), (20, 245, 60))

    return output


def create_anatomy_debug_visualization(
    canonical: np.ndarray,
    vessel_mask: np.ndarray,
    optic_disc_mask: np.ndarray,
    fovea_x: float,
    fovea_y: float,
    meta: dict = None,
    orig_image: np.ndarray = None,
) -> np.ndarray:
    """
    Creates a comprehensive 4-panel debug visualization figure:
    1. Optic Disc Mask & Centroid
    2. Fovea Point Localization (Reticle + model coords)
    3. Macula Estimated ROI (Circle + radius, clearly marked as Estimated)
    4. Combined Geometry Overlay with distance annotation and diagnostic banner.
    """
    h, w = canonical.shape[:2]
    fx, fy = float(fovea_x), float(fovea_y)
    macula_radius = int(min(h, w) * 0.11)

    # 1. Panel: Optic Disc Solo
    panel_disc = canonical.copy()
    disc_u8 = (optic_disc_mask > 0).astype(np.uint8) * 255
    contours, _ = cv2.findContours(disc_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    disc_center = None
    if contours:
        cv2.drawContours(panel_disc, contours, -1, (0, 215, 255), 2, cv2.LINE_AA)
        largest_c = max(contours, key=cv2.contourArea)
        M = cv2.moments(largest_c)
        if M["m00"] > 0:
            disc_center = (int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"]))
            cv2.drawMarker(panel_disc, disc_center, (0, 255, 255), cv2.MARKER_TILTED_CROSS, 16, 2, cv2.LINE_AA)
            cv2.circle(panel_disc, disc_center, 4, (255, 255, 255), -1, cv2.LINE_AA)
    draw_anatomical_badge(panel_disc, "Optic Disc Segmentation", (14, 26), (0, 215, 255))
    if disc_center:
        cv2.putText(panel_disc, f"Centroid: {disc_center}", (14, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

    # 2. Panel: Fovea Solo
    panel_fovea = canonical.copy()
    ifx, ify = int(round(fx)), int(round(fy))
    cv2.circle(panel_fovea, (ifx, ify), 4, (0, 255, 255), -1, cv2.LINE_AA)
    cv2.circle(panel_fovea, (ifx, ify), 12, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.drawMarker(panel_fovea, (ifx, ify), (0, 255, 255), cv2.MARKER_CROSS, 24, 1, cv2.LINE_AA)
    draw_anatomical_badge(panel_fovea, "Fovea Point Localization", (14, 26), (0, 255, 255))
    cv2.putText(panel_fovea, f"Model (X, Y): ({fx:.1f}, {fy:.1f})", (14, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

    # 3. Panel: Macula Estimated ROI
    panel_macula = canonical.copy()
    macula_fill = np.zeros_like(panel_macula)
    cv2.circle(macula_fill, (ifx, ify), macula_radius, (0, 165, 255), -1)
    panel_macula = cv2.addWeighted(panel_macula, 1.0, macula_fill, 0.18, 0)
    cv2.circle(panel_macula, (ifx, ify), macula_radius, (0, 220, 255), 2, cv2.LINE_AA)
    draw_anatomical_badge(panel_macula, "Macula (Estimated ROI, r=56px)", (14, 26), (0, 180, 255))
    cv2.putText(panel_macula, "Geometric proxy centered on fovea (not segmented)", (14, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 215, 255), 1, cv2.LINE_AA)

    # 4. Panel: Combined Full Overlay with Geometry line
    panel_combined = create_anatomy_overlay(canonical, vessel_mask, optic_disc_mask, fovea_x, fovea_y)
    if disc_center:
        cv2.line(panel_combined, disc_center, (ifx, ify), (255, 255, 0), 1, cv2.LINE_AA)
        dist_px = np.sqrt((fx - disc_center[0]) ** 2 + (fy - disc_center[1]) ** 2)
        mid_x, mid_y = (disc_center[0] + ifx) // 2, (disc_center[1] + ify) // 2
        cv2.putText(panel_combined, f"d={dist_px:.1f}px", (mid_x - 20, mid_y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 0), 1, cv2.LINE_AA)

    # Stack into 2x2 grid (1024 x 1024)
    top_row = np.hstack([panel_disc, panel_fovea])
    bot_row = np.hstack([panel_macula, panel_combined])
    grid = np.vstack([top_row, bot_row])

    # Add Diagnostic Header Banner (height 75px)
    banner = np.zeros((75, grid.shape[1], 3), dtype=np.uint8)
    banner[:] = (15, 20, 30)

    title_text = "TRINAY RETINAL ANATOMY DIAGNOSTIC LOCALIZATION"
    cv2.putText(banner, title_text, (20, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 220, 255), 2, cv2.LINE_AA)

    # Subtitle with coordinates
    if meta:
        orig_fx, orig_fy = model_to_orig_coords(fovea_x, fovea_y, meta)
        diag_line = (
            f"Orig ({meta['orig_w']}x{meta['orig_h']}) | Model (512x512) | "
            f"Fovea: Model ({fx:.1f}, {fy:.1f}) -> Orig ({orig_fx:.1f}, {orig_fy:.1f}) | "
            f"Macula: Estimated ROI (r={macula_radius}px)"
        )
    else:
        diag_line = (
            f"Model Space (512x512) | Fovea: ({fx:.1f}, {fy:.1f}) | "
            f"Macula: Estimated ROI (r={macula_radius}px)"
        )
    cv2.putText(banner, diag_line, (20, 56), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (200, 220, 240), 1, cv2.LINE_AA)

    return np.vstack([banner, grid])


def create_lesion_overlay(
    canonical,
    processed_lesion_masks
):
    lesion_colors = {
        0: (0, 0, 255),       # MA deep red
        1: (237, 58, 124),     # HE deep purple (#7C3AED)
        2: (0, 220, 255),     # EX golden yellow
        3: (129, 185, 16),     # SE teal/green (#10B981)
    }

    output = canonical.copy()

    for class_idx, mask in processed_lesion_masks.items():
        if mask is None or np.sum(mask) == 0:
            continue
        mask_u8 = mask.astype(np.uint8)
        color = lesion_colors[class_idx]

        # Stronger, higher-contrast overlay
        output = mask_overlay(
            output,
            mask_u8,
            color,
            alpha=0.75
        )

        # Draw crisp contour borders around lesion components
        contours, _ = cv2.findContours(
            mask_u8,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        if contours:
            cv2.drawContours(output, contours, -1, color, 1, cv2.LINE_AA)

    return output


def create_combined_overlay(
    canonical,
    vessel_mask,
    optic_disc_mask,
    fovea_x,
    fovea_y,
    processed_lesion_masks
):
    output = create_anatomy_overlay(
        canonical,
        vessel_mask,
        optic_disc_mask,
        fovea_x,
        fovea_y
    )

    lesion_colors = {
        0: (0, 0, 255),       # MA red
        1: (237, 58, 124),     # HE deep purple (#7C3AED)
        2: (0, 220, 255),     # EX golden yellow
        3: (129, 185, 16),     # SE teal/green (#10B981)
    }

    for class_idx, mask in processed_lesion_masks.items():
        if mask is None or np.sum(mask) == 0:
            continue
        mask_u8 = mask.astype(np.uint8)
        color = lesion_colors[class_idx]

        output = mask_overlay(
            output,
            mask_u8,
            color,
            alpha=0.70
        )

        contours, _ = cv2.findContours(
            mask_u8,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        if contours:
            cv2.drawContours(output, contours, -1, color, 1, cv2.LINE_AA)

    return output


def save_dashboard(
    original,
    anatomy_overlay,
    lesion_overlay,
    combined_overlay,
    result,
    path
):
    fig, axes = plt.subplots(
        2,
        2,
        figsize=(14, 12)
    )

    panels = [
        ("Original Fundus", original),
        ("Anatomy Model", anatomy_overlay),
        ("Lesion Model", lesion_overlay),
        ("Combined Anatomy + Lesions", combined_overlay),
    ]

    for ax, (title, image) in zip(
        axes.flat, panels
    ):
        ax.imshow(
            cv2.cvtColor(
                image,
                cv2.COLOR_BGR2RGB
            )
        )
        ax.set_title(title)
        ax.axis("off")

    detected = []

    for class_idx, info in result["lesion_summary"].items():
        if not info.get("detected", False):
            continue

        if isinstance(class_idx, str):
            lesion_name = class_idx
        else:
            lesion_name = LESION_NAMES.get(
                int(class_idx),
                str(class_idx)
            )

        detected.append(lesion_name)

    fig.suptitle(
        "TRINAY - ANATOMY + LESION ANALYSIS",
        fontsize=18,
        fontweight="bold"
    )

    geom = result.get("geometry", {})
    plausible_str = "Plausible" if geom.get("is_plausible", True) else "Review Required"

    fig.text(
        0.5,
        0.02,
        f"Fovea: ({result['fovea_x']:.1f}, {result['fovea_y']:.1f}) [{plausible_str}]"
        "    |    Macula: Estimated ROI (r=56px)"
        "    |    Lesions: "
        + (", ".join(detected) if detected else "None"),
        ha="center",
        fontsize=11
    )

    plt.tight_layout(rect=(0, 0.04, 1, 0.96))

    os.makedirs(
        os.path.dirname(path),
        exist_ok=True
    )

    fig.savefig(
        path,
        dpi=180,
        bbox_inches="tight"
    )
    plt.close(fig)


# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------

def run_pipeline(image_path):

    print("\n")
    print("=" * 78)
    print("                         TRINAY")
    print("             ANATOMY + LESION PIPELINE")
    print("=" * 78)
    print(f"\nDevice: {DEVICE}")

    # 1. Image
    print("\n" + "-" * 78)
    print("STEP 1 — FUNDUS IMAGE")
    print("-" * 78)

    original, absolute_path = load_original_image(image_path)

    print(f"✓ Image loaded")
    orig_h, orig_w = original.shape[:2]
    print(
        f"Original size: "
        f"{orig_w} x {orig_h}"
    )

    # 2. Canonical image with coordinate metadata
    print("\n" + "-" * 78)
    print("STEP 2 — CANONICAL RETINA & COORDINATE TRACKING")
    print("-" * 78)

    canonical, tensor, meta = prepare_input(original, return_meta=True)

    print("✓ Canonical retina: 512 x 512")
    print(f"  Crop box: ({meta['x1']}, {meta['y1']}), side={meta['side']}px, scale={meta['scale']:.4f}")

    # 3. Models
    print("\n" + "-" * 78)
    print("STEP 3 — LOAD MODELS")
    print("-" * 78)

    (
        vessel_model,
        optic_disc_model,
        fovea_model,
        lesion_model
    ) = load_models()

    # 4. Predictions
    print("\n" + "-" * 78)
    print("STEP 4 — PREDICT ANATOMY + LESIONS")
    print("-" * 78)

    result = predict_all(
        tensor,
        vessel_model,
        optic_disc_model,
        fovea_model,
        lesion_model
    )

    fovea_x = result["fovea_x"]
    fovea_y = result["fovea_y"]
    fovea_x_orig, fovea_y_orig = model_to_orig_coords(fovea_x, fovea_y, meta)

    geom = result.get("geometry", {})
    disc_center_model = geom.get("optic_disc_center")
    disc_center_orig = None
    dist_orig = None
    if disc_center_model:
        dx_orig, dy_orig = model_to_orig_coords(disc_center_model[0], disc_center_model[1], meta)
        disc_center_orig = (round(dx_orig, 1), round(dy_orig, 1))
        dist_orig = float(np.sqrt((fovea_x_orig - dx_orig) ** 2 + (fovea_y_orig - dy_orig) ** 2))

    scale_area = (meta["side"] / 512.0) ** 2
    disc_area_orig = int(round(geom.get("optic_disc_area_px", 0) * scale_area))

    print("✓ Anatomy prediction complete")
    print(f"  Vessel pixels (512x512): {int(result['vessel_mask'].sum())}")
    print(f"  Optic disc area (512x512): {geom.get('optic_disc_area_px')} px | Original: ~{disc_area_orig:,} px")
    print(f"  Fovea (Model Space 512x512): ({fovea_x:.2f}, {fovea_y:.2f})")
    print(f"  Fovea (Original Space {orig_w}x{orig_h}): ({fovea_x_orig:.2f}, {fovea_y_orig:.2f})")
    if disc_center_model:
        print(f"  Optic Disc Centroid: Model ({disc_center_model[0]:.1f}, {disc_center_model[1]:.1f}) | Orig ({disc_center_orig[0]}, {disc_center_orig[1]})")
        print(f"  OD-Fovea Distance: Model {geom.get('disc_fovea_distance_px', 0):.1f} px | Orig {dist_orig:.1f} px ({geom.get('disc_diameters_distance', 0):.2f} DD)")
    print(f"  Anatomical Plausibility: {'PASS (Plausible)' if geom.get('is_plausible') else 'FLAGGED'}")
    print(f"  Macula Localization: ESTIMATED ROI (r=56px model, {int(round(56 * meta['side']/512.0))}px orig) — Not Segmented")

    print("\n✓ Lesion prediction complete")
    for class_idx, info in result["lesion_summary"].items():
        if isinstance(class_idx, str):
            lesion_name = class_idx
        else:
            lesion_name = LESION_NAMES[int(class_idx)]

        print(
            f"  {lesion_name}: "
            f"{'DETECTED' if info.get('detected', False) else 'NOT DETECTED'}"
            f" | regions={info.get('regions', 0)}"
            f" | pixels={info.get('pixels', 0)}"
        )

    # 5. Visualizations
    print("\n" + "-" * 78)
    print("STEP 5 — CREATE VISUALIZATIONS")
    print("-" * 78)

    anatomy_overlay = create_anatomy_overlay(
        canonical,
        result["vessel_mask"],
        result["optic_disc_mask"],
        result["fovea_x"],
        result["fovea_y"]
    )

    lesion_overlay = create_lesion_overlay(
        canonical,
        result["processed_lesion_masks"]
    )

    combined_overlay = create_combined_overlay(
        canonical,
        result["vessel_mask"],
        result["optic_disc_mask"],
        result["fovea_x"],
        result["fovea_y"],
        result["processed_lesion_masks"]
    )

    debug_anatomy = create_anatomy_debug_visualization(
        canonical,
        result["vessel_mask"],
        result["optic_disc_mask"],
        result["fovea_x"],
        result["fovea_y"],
        meta=meta,
        orig_image=original
    )

    # 6. Save
    filename = os.path.splitext(
        os.path.basename(absolute_path)
    )[0]

    output_dir = os.path.join(
        PROJECT_ROOT,
        "outputs",
        "trinay_anatomy_lesion",
        filename
    )

    os.makedirs(
        output_dir,
        exist_ok=True
    )

    canonical_path = os.path.join(
        output_dir,
        "canonical_retina.png"
    )

    anatomy_path = os.path.join(
        output_dir,
        "anatomy_overlay.png"
    )

    lesion_path = os.path.join(
        output_dir,
        "lesion_overlay.png"
    )

    combined_path = os.path.join(
        output_dir,
        "combined_anatomy_lesion.png"
    )

    dashboard_path = os.path.join(
        output_dir,
        "TRINAY_ANATOMY_LESION_DASHBOARD.png"
    )

    debug_path = os.path.join(
        output_dir,
        "anatomy_debug_localization.png"
    )

    cv2.imwrite(canonical_path, canonical)
    cv2.imwrite(anatomy_path, anatomy_overlay)
    cv2.imwrite(lesion_path, lesion_overlay)
    cv2.imwrite(combined_path, combined_overlay)
    cv2.imwrite(debug_path, debug_anatomy)

    save_dashboard(
        original,
        anatomy_overlay,
        lesion_overlay,
        combined_overlay,
        result,
        dashboard_path
    )

    print("✓ Anatomy visualization saved")
    print("✓ Lesion visualization saved")
    print("✓ Combined visualization saved")
    print("✓ Diagnostic anatomy localization debug figure saved")
    print("✓ Dashboard saved")

    print("\n" + "=" * 78)
    print("        ANATOMY + LESION PIPELINE COMPLETE")
    print("=" * 78)

    print(f"\nOutput directory:\n{output_dir}")
    print(f"\nMain dashboard:\n{dashboard_path}")
    print(f"Debug localization:\n{debug_path}")

    # Add coordinates in original space to result for caller convenience
    result["fovea_x_orig"] = fovea_x_orig
    result["fovea_y_orig"] = fovea_y_orig
    result["meta"] = meta
    if disc_center_orig:
        result["optic_disc_center_orig"] = disc_center_orig
        result["disc_fovea_distance_orig_px"] = dist_orig
        result["optic_disc_area_orig_px"] = disc_area_orig

    del tensor
    del vessel_model
    del optic_disc_model
    del fovea_model
    del lesion_model

    if DEVICE.type == "mps":
        try:
            torch.mps.empty_cache()
        except Exception:
            pass

    return result


if __name__ == "__main__":

    if len(sys.argv) != 2:
        print(
            "\nUsage:\n"
            "python src/anatomy/integrated/"
            "trinay_anatomy_lesion_pipeline.py "
            '"path/to/image.jpg"'
        )
        sys.exit(1)

    run_pipeline(sys.argv[1])
