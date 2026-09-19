
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


def crop_retina(image):
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

    if not contours:
        return image

    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)

    side = max(1, int(max(w, h) * 1.05))

    cx = x + w // 2
    cy = y + h // 2

    x1 = cx - side // 2
    y1 = cy - side // 2
    x2 = x1 + side
    y2 = y1 + side

    img_h, img_w = image.shape[:2]

    pad_left = max(0, -x1)
    pad_top = max(0, -y1)
    pad_right = max(0, x2 - img_w)
    pad_bottom = max(0, y2 - img_h)

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

        x1 += pad_left
        x2 += pad_left
        y1 += pad_top
        y2 += pad_top

        return padded[y1:y2, x1:x2]

    return image[y1:y2, x1:x2]


def prepare_input(image):
    cropped = crop_retina(image)

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
# PREDICTION
# ------------------------------------------------------------

def predict_all(
    tensor,
    vessel_model,
    optic_disc_model,
    fovea_model,
    lesion_model
):
    with torch.no_grad():

        vessel_probability = torch.sigmoid(
            vessel_model(tensor)
        )[0, 0].cpu().numpy()

        optic_disc_probability = torch.sigmoid(
            optic_disc_model(tensor)
        )[0, 0].cpu().numpy()

        fovea_output = (
            fovea_model(tensor)
            .squeeze(0)
            .cpu()
            .numpy()
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

    fovea_x = float(
        np.clip(
            fovea_output[0] * IMAGE_SIZE[0],
            0,
            IMAGE_SIZE[0] - 1
        )
    )

    fovea_y = float(
        np.clip(
            fovea_output[1] * IMAGE_SIZE[1],
            0,
            IMAGE_SIZE[1] - 1
        )
    )

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
    """Draw a high-contrast medical callout badge with clean connector line and crisp text."""
    h, w = img.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.38
    thickness = 1
    (tw, th), baseline = cv2.getTextSize(text, font, scale, thickness)
    pad_x = 6
    pad_y = 4
    x, y = pos
    x = int(np.clip(x, pad_x + 2, w - tw - pad_x - 6))
    y = int(np.clip(y, th + pad_y + 4, h - pad_y - 6))

    # Clean connector line if anchor point is provided
    if anchor_pt is not None:
        ax, ay = int(anchor_pt[0]), int(anchor_pt[1])
        cv2.line(img, (ax, ay), (x + tw // 2, y - th // 2), (220, 230, 240), 1, cv2.LINE_AA)
        cv2.circle(img, (ax, ay), 3, color, -1, cv2.LINE_AA)
        cv2.circle(img, (ax, ay), 5, (255, 255, 255), 1, cv2.LINE_AA)

    # Dark high-contrast solid badge background with color border
    x1, y1 = x - pad_x, y - th - pad_y
    x2, y2 = x + tw + pad_x, y + baseline + pad_y
    if 0 <= y1 < y2 <= h and 0 <= x1 < x2 <= w:
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

    # Macula ROI circular zone (approx 11% radius) with soft tint and sharp border
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
        lbl_x = dx - 45 if dx < w // 2 else dx - 35
        lbl_y = dy - 34 if dy > 55 else dy + 45
        draw_anatomical_badge(output, "Optic Disc", (lbl_x, lbl_y), (0, 215, 255), anchor_pt=(dx, dy))

    # Fovea Centralis label
    lbl_fx = fx - 25 if fx < w // 2 else fx - 70
    lbl_fy = fy + 38 if fy < h - 55 else fy - 34
    draw_anatomical_badge(output, "Fovea", (lbl_fx, lbl_fy), (0, 255, 255), anchor_pt=(fx, fy))

    # Macula label near the ROI boundary
    lbl_mx = fx + macula_radius - 15 if fx < w // 2 else fx - macula_radius - 35
    lbl_my = fy - macula_radius - 8 if fy > 60 else fy + macula_radius + 15
    draw_anatomical_badge(output, "Macula", (lbl_mx, lbl_my), (0, 180, 255), anchor_pt=(fx + int(macula_radius * 0.7), fy - int(macula_radius * 0.7)))

    # Blood Vessels label
    draw_anatomical_badge(output, "Blood Vessels", (14, 26), (20, 245, 60))

    return output


def create_lesion_overlay(
    canonical,
    processed_lesion_masks
):
    # Darker, stronger, rich clinical lesion colors (BGR)
    # MA: Intense Deep Red (0, 0, 255)
    # HE: Deep Purple (237, 58, 124) -> #7C3AED
    # EX: Pure Intense Golden Yellow (0, 220, 255)
    # SE: Teal / Green (129, 185, 16) -> #10B981
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

    fig.text(
        0.5,
        0.02,
        "Fovea: "
        f"({result['fovea_x']:.1f}, {result['fovea_y']:.1f})"
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
    print(
        f"Original size: "
        f"{original.shape[1]} x {original.shape[0]}"
    )

    # 2. Canonical image
    print("\n" + "-" * 78)
    print("STEP 2 — CANONICAL RETINA")
    print("-" * 78)

    canonical, tensor = prepare_input(original)

    print("✓ Canonical retina: 512 x 512")

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

    print("✓ Anatomy prediction complete")
    print(
        f"  Vessel pixels: "
        f"{int(result['vessel_mask'].sum())}"
    )
    print(
        f"  Optic disc pixels: "
        f"{int(result['optic_disc_mask'].sum())}"
    )
    print(
        f"  Fovea: "
        f"({result['fovea_x']:.2f}, "
        f"{result['fovea_y']:.2f})"
    )

    print("✓ Lesion prediction complete")

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

    cv2.imwrite(canonical_path, canonical)
    cv2.imwrite(anatomy_path, anatomy_overlay)
    cv2.imwrite(lesion_path, lesion_overlay)
    cv2.imwrite(combined_path, combined_overlay)

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
    print("✓ Dashboard saved")

    print("\n" + "=" * 78)
    print("        ANATOMY + LESION PIPELINE COMPLETE")
    print("=" * 78)

    print(f"\nOutput directory:\n{output_dir}")
    print(f"\nMain dashboard:\n{dashboard_path}")

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
