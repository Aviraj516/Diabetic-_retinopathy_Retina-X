"""
TRINAY - UPDATED FINAL GLAUCOMA SCREENING PIPELINE

Main pipeline
-------------
Fundus image
    -> Image quality assessment
    -> Optic disc + optic cup segmentation
    -> CDR + structural measurements
    -> Retinal vessel segmentation
    -> Glaucoma Random Forest screening
    -> SHAP explanation
    -> Grad-CAM for disc/cup segmentation
    -> Clean 2x2 visual report
    -> Detailed Bokeh optic nerve visualization
    -> Doctor review when screening is flagged

Usage
-----
python python/final_glaucoma_pipeline.py "data/G1020/Images/image_0.jpg"

Outputs
-------
outputs/final_glaucoma/
    final_glaucoma_report.html
    final_glaucoma_report.png
    optic_nerve_bokeh.html
    optic_nerve_bokeh.png              # when Bokeh PNG export is available
    vessel_overlay.png
    gradcam.png
    screening_result.json
    original_fundus.png
    optic_nerve_analysis.png
    retinal_anatomy.png
    xai_combined_overlay.png
"""

from pathlib import Path
import json
import sys
import warnings

import cv2
import joblib
import numpy as np
import shap
import torch
import torch.nn as nn
import torch.nn.functional as F

from sklearn.pipeline import Pipeline
try:
    from skimage.morphology import skeletonize
except ImportError:
    skeletonize = None

import segmentation_models_pytorch as smp

from bokeh.io import export_png
from bokeh.embed import file_html
from bokeh.models import Arrow, Label, NormalHead, Range1d
from bokeh.plotting import figure
from bokeh.resources import CDN

import plotly.graph_objects as go
from plotly.subplots import make_subplots

warnings.filterwarnings("ignore")


# ============================================================
# PROJECT PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"
OUTPUT_DIR = ROOT / "outputs" / "final_glaucoma"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

QUALITY_MODEL_PATH = MODEL_DIR / "best_quality_model.pkl"
SEGMENTATION_MODEL_PATH = MODEL_DIR / "best_attention_disc_cup_unet.pth"
VESSEL_MODEL_PATH = MODEL_DIR / "best_vessel_unet.pth"
GLAUCOMA_MODEL_PATH = MODEL_DIR / "best_glaucoma_model.pkl"


# ============================================================
# CONFIGURATION
# ============================================================

IMAGE_SIZE = 512
VESSEL_THRESHOLD = 0.50
MIN_DISC_AREA = 500
MIN_CUP_AREA = 50
MIN_CUP_INSIDE_RATIO = 0.90
GLAUCOMA_FLAG_THRESHOLD = 0.50
RANDOM_STATE = 42

FEATURE_COLUMNS = [
    "vertical_cdr",
    "horizontal_cdr",
    "area_cdr",
    "disc_area",
    "cup_area",
    "disc_width",
    "disc_height",
    "cup_width",
    "cup_height",
    "cup_inside_ratio",
]


# ============================================================
# DEVICE
# ============================================================

if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

np.random.seed(RANDOM_STATE)
torch.manual_seed(RANDOM_STATE)


# ============================================================
# ATTENTION U-NET - EXACT ARCHITECTURE USED FOR TRAINING
# ============================================================

class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.block(x)


class AttentionGate(nn.Module):
    def __init__(self, gating_channels, skip_channels, inter_channels):
        super().__init__()
        self.W_g = nn.Sequential(
            nn.Conv2d(gating_channels, inter_channels, 1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(inter_channels),
        )
        self.W_x = nn.Sequential(
            nn.Conv2d(skip_channels, inter_channels, 1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(inter_channels),
        )
        self.psi = nn.Sequential(
            nn.Conv2d(inter_channels, 1, 1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(1),
            nn.Sigmoid(),
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, g, x):
        g1 = self.W_g(g)
        x1 = self.W_x(x)
        if g1.shape[-2:] != x1.shape[-2:]:
            g1 = F.interpolate(g1, size=x1.shape[-2:], mode="bilinear", align_corners=False)
        psi = self.relu(g1 + x1)
        psi = self.psi(psi)
        return x * psi


class AttentionUNet(nn.Module):
    def __init__(self, in_channels=3, num_classes=3):
        super().__init__()
        self.pool = nn.MaxPool2d(2)

        self.enc1 = DoubleConv(in_channels, 32)
        self.enc2 = DoubleConv(32, 64)
        self.enc3 = DoubleConv(64, 128)
        self.enc4 = DoubleConv(128, 256)
        self.bottleneck = DoubleConv(256, 512)

        self.up4 = nn.ConvTranspose2d(512, 256, 2, stride=2)
        self.att4 = AttentionGate(256, 256, 128)
        self.dec4 = DoubleConv(512, 256)

        self.up3 = nn.ConvTranspose2d(256, 128, 2, stride=2)
        self.att3 = AttentionGate(128, 128, 64)
        self.dec3 = DoubleConv(256, 128)

        self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.att2 = AttentionGate(64, 64, 32)
        self.dec2 = DoubleConv(128, 64)

        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.att1 = AttentionGate(32, 32, 16)
        self.dec1 = DoubleConv(64, 32)

        self.output = nn.Conv2d(32, num_classes, 1)

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        b = self.bottleneck(self.pool(e4))

        d4 = self.up4(b)
        if d4.shape[-2:] != e4.shape[-2:]:
            d4 = F.interpolate(d4, size=e4.shape[-2:], mode="bilinear", align_corners=False)
        e4_att = self.att4(d4, e4)
        d4 = self.dec4(torch.cat([d4, e4_att], dim=1))

        d3 = self.up3(d4)
        if d3.shape[-2:] != e3.shape[-2:]:
            d3 = F.interpolate(d3, size=e3.shape[-2:], mode="bilinear", align_corners=False)
        e3_att = self.att3(d3, e3)
        d3 = self.dec3(torch.cat([d3, e3_att], dim=1))

        d2 = self.up2(d3)
        if d2.shape[-2:] != e2.shape[-2:]:
            d2 = F.interpolate(d2, size=e2.shape[-2:], mode="bilinear", align_corners=False)
        e2_att = self.att2(d2, e2)
        d2 = self.dec2(torch.cat([d2, e2_att], dim=1))

        d1 = self.up1(d2)
        if d1.shape[-2:] != e1.shape[-2:]:
            d1 = F.interpolate(d1, size=e1.shape[-2:], mode="bilinear", align_corners=False)
        e1_att = self.att1(d1, e1)
        d1 = self.dec1(torch.cat([d1, e1_att], dim=1))

        return self.output(d1)


# ============================================================
# VESSEL U-NET - EXACT MODEL DEFINITION
# ============================================================

class VesselUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = smp.Unet(
            encoder_name="efficientnet-b0",
            encoder_weights="imagenet",
            in_channels=3,
            classes=1,
            activation=None,
        )

    def forward(self, x):
        return self.model(x)


# ============================================================
# MODEL LOADING
# ============================================================

def load_segmentation_model():
    print("\nLoading Attention U-Net...")
    model = AttentionUNet(in_channels=3, num_classes=3)
    checkpoint = torch.load(SEGMENTATION_MODEL_PATH, map_location="cpu", weights_only=False)

    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
    else:
        state_dict = checkpoint

    model.load_state_dict(state_dict, strict=True)
    model.to(DEVICE)
    model.eval()
    print("Attention U-Net loaded.")
    return model


def load_vessel_model():
    print("\nLoading Vessel U-Net...")
    model = VesselUNet()
    checkpoint = torch.load(VESSEL_MODEL_PATH, map_location="cpu", weights_only=False)

    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
    elif isinstance(checkpoint, dict) and "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]
    else:
        state_dict = checkpoint

    cleaned = {}
    for key, value in state_dict.items():
        if key.startswith("module."):
            key = key[7:]
        cleaned[key] = value

    model.load_state_dict(cleaned, strict=True)
    model.to(DEVICE)
    model.eval()
    print("Vessel U-Net loaded.")
    return model


def load_quality_model():
    print("\nLoading Image Quality Model...")
    model = joblib.load(QUALITY_MODEL_PATH)
    print("Quality model loaded.")
    if hasattr(model, "feature_names_in_"):
        print("Quality features:", list(model.feature_names_in_))
    return model


def load_glaucoma_model():
    print("\nLoading Glaucoma Classifier...")
    model = joblib.load(GLAUCOMA_MODEL_PATH)
    print("Glaucoma classifier loaded.")
    return model


# ============================================================
# IMAGE QUALITY
# ============================================================

def extract_quality_features(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    retina_mask = gray > 10

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    gx = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3)
    tenengrad = gx ** 2 + gy ** 2

    sharpness = float(np.mean(tenengrad[retina_mask])) if np.any(retina_mask) else 0.0
    brightness = float(np.mean(gray))
    gray_mean = float(np.mean(gray))
    gray_std = float(np.std(gray))
    illumination = float(1.0 - gray_std / gray_mean) if gray_mean > 0 else 0.0
    contrast = float(np.std(gray))

    smooth = cv2.GaussianBlur(gray, (5, 5), 0)
    noise = float(np.std(gray.astype(np.float32) - smooth.astype(np.float32)))
    fov = float(np.mean(retina_mask))

    return {
        "sharpness": sharpness,
        "brightness": brightness,
        "illumination": illumination,
        "contrast": contrast,
        "noise": noise,
        "fov": fov,
    }


def predict_quality(model, features):
    names = ["sharpness", "brightness", "illumination", "contrast", "noise", "fov"]
    X = np.array([features[name] for name in names], dtype=np.float32).reshape(1, -1)

    prediction = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0] if hasattr(model, "predict_proba") else None
    classes = getattr(model, "classes_", [])
    label = str(prediction).lower()

    if label in {"good", "acceptable"}:
        normalized = "GOOD"
    elif label in {"borderline", "fair"}:
        normalized = "BORDERLINE"
    elif label in {"ungradable", "bad", "poor"}:
        normalized = "UNGRADABLE"
    else:
        normalized = str(prediction).upper()

    confidence = float(np.max(probabilities)) if probabilities is not None else 0.0
    return {
        "raw_prediction": str(prediction),
        "label": normalized,
        "confidence": confidence,
        "classes": [str(c) for c in classes],
        "probabilities": probabilities.tolist() if probabilities is not None else None,
    }


# ============================================================
# SEGMENTATION PREPROCESSING
# ============================================================

def prepare_segmentation_tensor(image):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_AREA)
    normalized = resized.astype(np.float32) / 255.0

    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    normalized = (normalized - mean) / std
    normalized = np.transpose(normalized, (2, 0, 1))

    tensor = torch.from_numpy(normalized).float().unsqueeze(0).to(DEVICE)
    return tensor


def predict_disc_cup(model, image):
    tensor = prepare_segmentation_tensor(image)

    with torch.no_grad():
        logits = model(tensor)
        prediction = torch.argmax(logits, dim=1)[0].cpu().numpy()

    # IMPORTANT:
    # 0 = background
    # 1 = optic disc
    # 2 = optic cup
    # The COMPLETE optic disc is classes 1 + 2 because the cup is inside it.
    disc_mask = ((prediction == 1) | (prediction == 2)).astype(np.uint8)
    cup_mask = (prediction == 2).astype(np.uint8)

    return prediction, disc_mask, cup_mask, tensor


# ============================================================
# MASK CLEANING
# ============================================================

def largest_component(mask):
    mask = (mask > 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)

    if count <= 1:
        return mask

    largest_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (labels == largest_label).astype(np.uint8)


def clean_mask(mask):
    mask = largest_component(mask)
    if np.sum(mask) == 0:
        return mask

    kernel = np.ones((5, 5), dtype=np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def resize_mask_to_original(mask, image_shape):
    height, width = image_shape[:2]
    return cv2.resize(
        mask.astype(np.uint8),
        (width, height),
        interpolation=cv2.INTER_NEAREST,
    )


# ============================================================
# CDR + STRUCTURAL FEATURES
# ============================================================

def calculate_features(disc_mask, cup_mask):
    # Keep the full disc separate from the cup.
    disc_mask = clean_mask(disc_mask)
    cup_mask = clean_mask(cup_mask)

    disc_area = int(np.sum(disc_mask))
    cup_area = int(np.sum(cup_mask))

    if disc_area < MIN_DISC_AREA:
        return {"status": "INVALID_DISC", "disc_area": disc_area, "cup_area": cup_area}

    if cup_area < MIN_CUP_AREA:
        return {"status": "INVALID_CUP", "disc_area": disc_area, "cup_area": cup_area}

    cup_inside = cup_mask & disc_mask
    inside_ratio = float(np.sum(cup_inside) / max(cup_area, 1))

    # The cup must physically lie inside the complete optic disc.
    if inside_ratio < MIN_CUP_INSIDE_RATIO:
        print(f"\nWarning: cup-inside-disc ratio is {inside_ratio:.3f}")
        print("Constraining cup mask to the detected optic disc.")

    cup_mask = cup_inside.astype(np.uint8)
    cup_area = int(np.sum(cup_mask))

    if cup_area < MIN_CUP_AREA:
        return {"status": "INVALID_CUP", "disc_area": disc_area, "cup_area": cup_area}

    inside_ratio = 1.0

    disc_points = np.column_stack(np.where(disc_mask > 0))
    cup_points = np.column_stack(np.where(cup_mask > 0))

    disc_y1 = int(disc_points[:, 0].min())
    disc_y2 = int(disc_points[:, 0].max())
    disc_x1 = int(disc_points[:, 1].min())
    disc_x2 = int(disc_points[:, 1].max())

    cup_y1 = int(cup_points[:, 0].min())
    cup_y2 = int(cup_points[:, 0].max())
    cup_x1 = int(cup_points[:, 1].min())
    cup_x2 = int(cup_points[:, 1].max())

    disc_width = disc_x2 - disc_x1 + 1
    disc_height = disc_y2 - disc_y1 + 1
    cup_width = cup_x2 - cup_x1 + 1
    cup_height = cup_y2 - cup_y1 + 1

    vertical_cdr = cup_height / max(disc_height, 1)
    horizontal_cdr = cup_width / max(disc_width, 1)
    area_cdr = cup_area / max(disc_area, 1)

    disc_y, disc_x = np.where(disc_mask > 0)
    cup_y, cup_x = np.where(cup_mask > 0)

    return {
        "status": "VALID",
        "disc_detected": True,
        "cup_detected": True,
        "cup_inside_disc": True,
        "disc_area": disc_area,
        "cup_area": cup_area,
        "disc_width": int(disc_width),
        "disc_height": int(disc_height),
        "cup_width": int(cup_width),
        "cup_height": int(cup_height),
        "vertical_cdr": float(vertical_cdr),
        "horizontal_cdr": float(horizontal_cdr),
        "area_cdr": float(area_cdr),
        "cup_inside_ratio": float(inside_ratio),
        "disc_x": float(np.mean(disc_x)),
        "disc_y": float(np.mean(disc_y)),
        "cup_x": float(np.mean(cup_x)),
        "cup_y": float(np.mean(cup_y)),
    }


def scale_features_to_original(features, original_shape):
    original_h, original_w = original_shape[:2]
    sx = original_w / IMAGE_SIZE
    sy = original_h / IMAGE_SIZE

    scaled = dict(features)
    scaled["disc_x"] = features["disc_x"] * sx
    scaled["disc_y"] = features["disc_y"] * sy
    scaled["cup_x"] = features["cup_x"] * sx
    scaled["cup_y"] = features["cup_y"] * sy
    scaled["disc_width"] = features["disc_width"] * sx
    scaled["disc_height"] = features["disc_height"] * sy
    scaled["cup_width"] = features["cup_width"] * sx
    scaled["cup_height"] = features["cup_height"] * sy
    scaled["disc_area"] = features["disc_area"] * sx * sy
    scaled["cup_area"] = features["cup_area"] * sx * sy
    return scaled


# ============================================================
# RETINAL VESSELS
# ============================================================

def predict_vessels(model, image):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_AREA)
    tensor_np = resized.astype(np.float32) / 255.0
    tensor_np = np.transpose(tensor_np, (2, 0, 1))
    tensor = torch.from_numpy(tensor_np).float().unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits = model(tensor)
        probabilities_512 = torch.sigmoid(logits)[0, 0].cpu().numpy()

    vessel_mask_512 = (probabilities_512 >= VESSEL_THRESHOLD).astype(np.uint8)
    height, width = image.shape[:2]

    vessel_mask = cv2.resize(
        vessel_mask_512,
        (width, height),
        interpolation=cv2.INTER_NEAREST,
    )

    vessel_probability = cv2.resize(
        probabilities_512,
        (width, height),
        interpolation=cv2.INTER_LINEAR,
    )

    return vessel_mask, vessel_probability


def skeleton_vessels(vessel_mask):
    if skeletonize is not None:
        skeleton = skeletonize(vessel_mask > 0)
        return skeleton.astype(np.uint8)

    # Lightweight fallback when scikit-image is unavailable.
    mask = (vessel_mask > 0).astype(np.uint8)
    return mask


# ============================================================
# VISUAL UTILITIES
# ============================================================

def add_panel_header(image, title, badge=None):
    result = image.copy()
    h, w = result.shape[:2]

    cv2.rectangle(result, (20, 20), (420, 70), (0, 0, 0), -1)
    cv2.putText(
        result,
        title,
        (38, 54),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.85,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    if badge:
        badge_width = min(350, 14 * len(badge) + 35)
        x1 = w - badge_width - 20
        cv2.rectangle(result, (x1, 20), (w - 20, 70), (25, 25, 25), -1)
        cv2.rectangle(result, (x1, 20), (w - 20, 70), (220, 220, 220), 2)
        cv2.putText(
            result,
            badge,
            (x1 + 15, 53),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.68,
            (240, 240, 240),
            2,
            cv2.LINE_AA,
        )
    return result


def draw_label_with_arrow(image, point, text, color, position):
    result = image
    px, py = int(point[0]), int(point[1])
    tx, ty = int(position[0]), int(position[1])

    # Clamp text position.
    tx = max(20, min(tx, image.shape[1] - 220))
    ty = max(55, min(ty, image.shape[0] - 20))

    cv2.arrowedLine(
        result,
        (tx, ty),
        (px, py),
        color,
        4,
        tipLength=0.12,
    )

    text_size, _ = cv2.getTextSize(
        text,
        cv2.FONT_HERSHEY_SIMPLEX,
        0.88,
        3,
    )

    box_w = text_size[0] + 22
    box_h = text_size[1] + 24

    cv2.rectangle(
        result,
        (tx - 10, ty - box_h + 8),
        (tx + box_w, ty + 8),
        (0, 0, 0),
        -1,
    )

    cv2.rectangle(
        result,
        (tx - 10, ty - box_h + 8),
        (tx + box_w, ty + 8),
        color,
        2,
    )

    cv2.putText(
        result,
        text,
        (tx + 1, ty),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.88,
        color,
        3,
        cv2.LINE_AA,
    )


def draw_contour(result, mask, color, thickness=5):
    contours, _ = cv2.findContours(
        (mask > 0).astype(np.uint8),
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    cv2.drawContours(result, contours, -1, color, thickness)
    return result


def center_from_mask(mask, fallback):
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return fallback
    return float(np.mean(xs)), float(np.mean(ys))


def bbox_center(mask, fallback):
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return fallback
    return (
        float((xs.min() + xs.max()) / 2),
        float((ys.min() + ys.max()) / 2),
    )


# ============================================================
# OPTIC NERVE ANALYSIS IMAGE
# ============================================================

def create_optic_nerve_overlay(image, disc_mask, cup_mask, features):
    result = image.copy()
    h, w = result.shape[:2]

    # Disc = yellow/cyan boundary; cup = magenta boundary.
    draw_contour(result, disc_mask, (0, 255, 255), 6)
    draw_contour(result, cup_mask, (255, 0, 255), 6)

    disc_center = center_from_mask(disc_mask, (w * 0.5, h * 0.5))
    cup_center = center_from_mask(cup_mask, disc_center)

    # --------------------------------------------------------
    # DISC LABEL
    # --------------------------------------------------------
    disc_label = (
        min(w - 380, disc_center[0] + 180),
        max(130, disc_center[1] - 170),
    )
    draw_label_with_arrow(
        result,
        disc_center,
        "OPTIC DISC",
        (0, 255, 255),
        disc_label,
    )

    # --------------------------------------------------------
    # CUP LABEL
    # --------------------------------------------------------
    cup_label = (
        min(w - 340, cup_center[0] + 190),
        min(h - 100, cup_center[1] + 170),
    )
    draw_label_with_arrow(
        result,
        cup_center,
        "OPTIC CUP",
        (255, 0, 255),
        cup_label,
    )

    # --------------------------------------------------------
    # CDR LINES
    # Use scaled original-image dimensions.
    # --------------------------------------------------------
    disc_height = float(features["disc_height"])
    cup_height = float(features["cup_height"])
    disc_width = float(features["disc_width"])
    cup_width = float(features["cup_width"])

    cx = float(features["disc_x"])
    cy = float(features["disc_y"])
    cup_cx = float(features["cup_x"])
    cup_cy = float(features["cup_y"])

    # Slightly offset the measurement lines from the exact center to keep them visible.
    vertical_x = cx
    disc_top = cy - disc_height / 2
    disc_bottom = cy + disc_height / 2
    cup_top = cup_cy - cup_height / 2
    cup_bottom = cup_cy + cup_height / 2

    cv2.line(
        result,
        (int(vertical_x - 12), int(disc_top)),
        (int(vertical_x - 12), int(disc_bottom)),
        (255, 255, 255),
        4,
        cv2.LINE_AA,
    )

    cv2.line(
        result,
        (int(vertical_x + 12), int(cup_top)),
        (int(vertical_x + 12), int(cup_bottom)),
        (0, 255, 255),
        6,
        cv2.LINE_AA,
    )

    horizontal_y = cy
    disc_left = cx - disc_width / 2
    disc_right = cx + disc_width / 2
    cup_left = cup_cx - cup_width / 2
    cup_right = cup_cx + cup_width / 2

    cv2.line(
        result,
        (int(disc_left), int(horizontal_y - 12)),
        (int(disc_right), int(horizontal_y - 12)),
        (255, 255, 255),
        4,
        cv2.LINE_AA,
    )

    cv2.line(
        result,
        (int(cup_left), int(horizontal_y + 12)),
        (int(cup_right), int(horizontal_y + 12)),
        (0, 255, 255),
        6,
        cv2.LINE_AA,
    )

    # --------------------------------------------------------
    # CDR CARD
    # --------------------------------------------------------
    card_w = min(390, w - 40)
    card_h = 140
    x1 = 25
    y1 = h - card_h - 25
    x2 = x1 + card_w
    y2 = h - 25

    overlay = result.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.78, result, 0.22, 0, result)
    cv2.rectangle(result, (x1, y1), (x2, y2), (255, 255, 255), 2)

    cdr_lines = [
        f"Vertical CDR   {features['vertical_cdr']:.3f}",
        f"Horizontal CDR {features['horizontal_cdr']:.3f}",
        f"Area CDR       {features['area_cdr']:.3f}",
    ]

    for i, line in enumerate(cdr_lines):
        cv2.putText(
            result,
            line,
            (x1 + 22, y1 + 38 + i * 34),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.88,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    # Legend
    cv2.putText(
        result,
        "CYAN = DISC    MAGENTA = CUP    WHITE/YELLOW = CDR",
        (25, h - 15),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.58,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    return result


# ============================================================
# RETINAL ANATOMY IMAGE
# ============================================================

def create_retinal_anatomy_overlay(image, vessel_mask, disc_mask, cup_mask):
    result = image.copy()
    h, w = result.shape[:2]

    # Thin vessel visualization.
    vessel_skeleton = skeleton_vessels(vessel_mask)
    result[vessel_skeleton > 0] = (0, 255, 0)

    # Disc / cup boundaries.
    draw_contour(result, disc_mask, (0, 255, 255), 5)
    draw_contour(result, cup_mask, (255, 0, 255), 5)

    disc_center = center_from_mask(disc_mask, (w * 0.5, h * 0.5))
    cup_center = center_from_mask(cup_mask, disc_center)

    # Vessel label.
    cv2.rectangle(result, (25, 85), (230, 130), (0, 0, 0), -1)
    cv2.rectangle(result, (25, 85), (230, 130), (0, 255, 0), 2)
    cv2.putText(
        result,
        "Blood Vessels",
        (40, 116),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.78,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    # Disc label.
    draw_label_with_arrow(
        result,
        disc_center,
        "OPTIC DISC",
        (0, 255, 255),
        (disc_center[0] + 170, max(150, disc_center[1] - 150)),
    )

    # Cup label.
    draw_label_with_arrow(
        result,
        cup_center,
        "OPTIC CUP",
        (255, 0, 255),
        (cup_center[0] + 160, min(h - 90, cup_center[1] + 150)),
    )

    return result


# ============================================================
# GRAD-CAM
# ============================================================

class GradCAM:
    def __init__(self, model, target_layer):
        self.model = model
        self.target_layer = target_layer
        self.activations = None
        self.gradients = None

        self.forward_handle = target_layer.register_forward_hook(self._forward_hook)
        self.backward_handle = target_layer.register_full_backward_hook(self._backward_hook)

    def _forward_hook(self, module, inputs, output):
        self.activations = output

    def _backward_hook(self, module, grad_input, grad_output):
        self.gradients = grad_output[0]

    def remove(self):
        self.forward_handle.remove()
        self.backward_handle.remove()

    def generate(self, tensor, target_class, target_mask=None):
        self.model.zero_grad(set_to_none=True)
        logits = self.model(tensor)
        target = logits[0, target_class]

        if target_mask is not None and np.sum(target_mask) > 0:
            mask_tensor = torch.from_numpy(target_mask).float().to(target.device)
            score = (target * mask_tensor).sum() / (mask_tensor.sum() + 1e-6)
        else:
            score = target.mean()

        score.backward()

        activations = self.activations.detach()
        gradients = self.gradients.detach()
        weights = gradients.mean(dim=(2, 3), keepdim=True)
        cam = (weights * activations).sum(dim=1)[0]
        cam = F.relu(cam).cpu().numpy()

        max_value = float(np.max(cam))
        if max_value > 0:
            cam = cam / max_value

        return cam


def create_gradcam(model, tensor, prediction):
    target_layer = model.bottleneck.block[3]
    gradcam = GradCAM(model, target_layer)

    if np.sum(prediction == 2) > 0:
        target_class = 2
        target_mask = (prediction == 2).astype(np.float32)
    else:
        target_class = 1
        target_mask = (prediction == 1).astype(np.float32)

    try:
        cam = gradcam.generate(tensor, target_class, target_mask)
    except Exception as exc:
        print("Grad-CAM warning:", exc)
        cam = np.zeros((32, 32), dtype=np.float32)
    finally:
        gradcam.remove()

    cam = cv2.resize(
        cam,
        (tensor.shape[-1], tensor.shape[-2]),
        interpolation=cv2.INTER_LINEAR,
    )
    return cam


def create_gradcam_overlay(image, cam):
    h, w = image.shape[:2]
    cam = cv2.resize(cam, (w, h), interpolation=cv2.INTER_LINEAR)
    cam = np.clip(cam, 0, 1)

    heatmap = cv2.applyColorMap(
        (cam * 255).astype(np.uint8),
        cv2.COLORMAP_JET,
    )

    # Subtle XAI overlay rather than a fully saturated heatmap.
    alpha = 0.38 * cam[..., None]
    result = (
        image.astype(np.float32) * (1.0 - alpha)
        + heatmap.astype(np.float32) * alpha
    )

    return np.clip(result, 0, 255).astype(np.uint8)


# ============================================================
# COMBINED / XAI IMAGE
# ============================================================

def create_combined_overlay(
    image,
    vessel_mask,
    disc_mask,
    cup_mask,
    gradcam,
):
    result = image.copy()
    h, w = result.shape[:2]

    # Subtle Grad-CAM first.
    cam = cv2.resize(gradcam, (w, h), interpolation=cv2.INTER_LINEAR)
    cam = np.clip(cam, 0, 1)
    heatmap = cv2.applyColorMap((cam * 255).astype(np.uint8), cv2.COLORMAP_JET)
    alpha = 0.22 * cam[..., None]
    result = (
        result.astype(np.float32) * (1.0 - alpha)
        + heatmap.astype(np.float32) * alpha
    ).astype(np.uint8)

    # Thin vessel lines.
    vessel_skeleton = skeleton_vessels(vessel_mask)
    result[vessel_skeleton > 0] = (0, 255, 0)

    # Disc and cup.
    draw_contour(result, disc_mask, (0, 255, 255), 5)
    draw_contour(result, cup_mask, (255, 0, 255), 5)

    disc_center = center_from_mask(disc_mask, (w * 0.5, h * 0.5))
    cup_center = center_from_mask(cup_mask, disc_center)

    draw_label_with_arrow(
        result,
        disc_center,
        "OPTIC DISC",
        (0, 255, 255),
        (disc_center[0] + 175, max(150, disc_center[1] - 150)),
    )

    draw_label_with_arrow(
        result,
        cup_center,
        "OPTIC CUP",
        (255, 0, 255),
        (cup_center[0] + 170, min(h - 90, cup_center[1] + 155)),
    )

    # Legend.
    legend = "GREEN = VESSELS   CYAN = DISC   MAGENTA = CUP   HEATMAP = XAI"
    cv2.rectangle(result, (25, h - 58), (min(w - 25, 760), h - 18), (0, 0, 0), -1)
    cv2.putText(
        result,
        legend,
        (38, h - 31),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.57,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    return result


# ============================================================
# SHAP
# ============================================================

def calculate_shap(classifier, features):
    X = np.array([features[col] for col in FEATURE_COLUMNS], dtype=np.float64).reshape(1, -1)

    if isinstance(classifier, Pipeline):
        transformed = classifier.named_steps["imputer"].transform(X)
        rf = classifier.named_steps["classifier"]
    else:
        transformed = X
        rf = classifier

    try:
        explainer = shap.TreeExplainer(rf)
        values = explainer.shap_values(transformed)

        if isinstance(values, list):
            values = values[1] if len(values) > 1 else values[0]
            values = values[0]
        else:
            values = np.asarray(values)
            if values.ndim == 3:
                values = values[0, :, 1]
            elif values.ndim == 2:
                values = values[0]

        values = np.asarray(values).flatten()
        return {
            col: float(value)
            for col, value in zip(FEATURE_COLUMNS, values)
        }, "SHAP TreeExplainer"

    except Exception as exc:
        print("SHAP warning:", exc)

        base_probability = float(classifier.predict_proba(X)[0, 1])
        contributions = {}

        for index, column in enumerate(FEATURE_COLUMNS):
            X_modified = X.copy()
            value = X_modified[0, index]
            X_modified[0, index] = value * 0.90 if value != 0 else 1e-6
            modified_probability = float(classifier.predict_proba(X_modified)[0, 1])
            contributions[column] = base_probability - modified_probability

        return contributions, "Local feature sensitivity"


# ============================================================
# GLAUCOMA SCREENING
# ============================================================

def predict_glaucoma(model, features):
    X = np.array([features[col] for col in FEATURE_COLUMNS], dtype=np.float64).reshape(1, -1)
    prediction = int(model.predict(X)[0])
    probabilities = model.predict_proba(X)[0]
    glaucoma_probability = float(probabilities[1])

    return {
        "prediction": prediction,
        "normal_probability": float(probabilities[0]),
        "glaucoma_probability": glaucoma_probability,
        "flagged": bool(glaucoma_probability >= GLAUCOMA_FLAG_THRESHOLD),
    }


# ============================================================
# 2x2 STATIC REPORT PANELS
# ============================================================

def fit_image_to_panel(image, panel_w=820, panel_h=520):
    background = np.zeros((panel_h, panel_w, 3), dtype=np.uint8)
    h, w = image.shape[:2]
    scale = min(panel_w / w, panel_h / h)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))

    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    x = (panel_w - new_w) // 2
    y = (panel_h - new_h) // 2
    background[y:y + new_h, x:x + new_w] = resized
    return background


def make_titled_panel(image, title, badge=None, panel_w=820, panel_h=590):
    image_area_h = panel_h - 70
    panel = np.full((panel_h, panel_w, 3), 248, dtype=np.uint8)

    cv2.putText(
        panel,
        title,
        (22, 43),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.90,
        (40, 50, 65),
        2,
        cv2.LINE_AA,
    )

    if badge:
        badge_w = min(340, 14 * len(badge) + 35)
        x1 = panel_w - badge_w - 22
        cv2.rectangle(panel, (x1, 16), (panel_w - 22, 53), (224, 230, 238), -1)
        cv2.putText(
            panel,
            badge,
            (x1 + 13, 42),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (60, 75, 95),
            2,
            cv2.LINE_AA,
        )

    fitted = fit_image_to_panel(image, panel_w - 38, image_area_h - 10)
    panel[60:, 19:19 + fitted.shape[1]] = fitted

    cv2.rectangle(
        panel,
        (19, 60),
        (panel_w - 20, panel_h - 12),
        (215, 220, 228),
        2,
    )

    return panel


def create_static_report(
    original,
    optic,
    anatomy,
    combined,
    features,
    quality,
    screening,
):
    panel_w = 820
    panel_h = 590
    gap = 18
    footer_h = 145

    p1 = make_titled_panel(original, "Original Fundus", "Canonical 512x512", panel_w, panel_h)
    p2 = make_titled_panel(optic, "Optic Nerve Analysis", "Disc + Cup • CDR", panel_w, panel_h)
    p3 = make_titled_panel(anatomy, "Retinal Anatomy", "Vessels • Disc • Cup", panel_w, panel_h)
    p4 = make_titled_panel(combined, "XAI / Combined Overlay", "Multi-Task Fusion", panel_w, panel_h)

    canvas_w = panel_w * 2 + gap
    canvas_h = panel_h * 2 + gap + footer_h
    canvas = np.full((canvas_h, canvas_w, 3), 242, dtype=np.uint8)

    canvas[0:panel_h, 0:panel_w] = p1
    canvas[0:panel_h, panel_w + gap:2 * panel_w + gap] = p2
    y2 = panel_h + gap
    canvas[y2:y2 + panel_h, 0:panel_w] = p3
    canvas[y2:y2 + panel_h, panel_w + gap:2 * panel_w + gap] = p4

    footer_y = y2 + panel_h
    cv2.rectangle(canvas, (0, footer_y), (canvas_w, canvas_h), (255, 255, 255), -1)

    # Footer title.
    cv2.putText(
        canvas,
        "TRINAY — AI-Assisted Glaucoma Screening Summary",
        (25, footer_y + 32),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.76,
        (45, 55, 70),
        2,
        cv2.LINE_AA,
    )

    q_text = f"Image Quality: {quality['label']} ({quality['confidence'] * 100:.1f}%)"
    cdr_text = (
        f"CDR  V:{features['vertical_cdr']:.3f}  "
        f"H:{features['horizontal_cdr']:.3f}  "
        f"A:{features['area_cdr']:.3f}"
    )
    screening_text = (
        "Screening: FLAGGED"
        if screening["flagged"]
        else "Screening: NOT FLAGGED"
    )
    probability_text = f"Glaucoma probability: {screening['glaucoma_probability'] * 100:.2f}%"
    doctor_text = "Doctor review: REQUIRED when flagged"

    lines = [q_text, cdr_text, screening_text, probability_text, doctor_text]
    for i, line in enumerate(lines):
        cv2.putText(
            canvas,
            line,
            (25 + (i // 3) * 550, footer_y + 65 + (i % 3) * 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.62,
            (75, 85, 100),
            2,
            cv2.LINE_AA,
        )

    return canvas


# ============================================================
# BOKEH DETAILED OPTIC NERVE VISUALIZATION
# ============================================================

def mask_contours(mask):
    contours, _ = cv2.findContours(
        mask.astype(np.uint8),
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    xs = []
    ys = []
    for contour in contours:
        if len(contour) < 3:
            continue
        pts = contour.reshape(-1, 2)
        xs.append(pts[:, 0].tolist())
        ys.append(pts[:, 1].tolist())

    return xs, ys


def rgba_from_bgr(image):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([
        rgb,
        np.full(rgb.shape[:2], 255, dtype=np.uint8),
    ])
    return rgba


def create_bokeh_optic_nerve(image, disc_mask, cup_mask, features):
    height, width = image.shape[:2]

    p = figure(
        title="TRINAY — Optic Nerve Head Analysis",
        width=1100,
        height=820,
        x_range=Range1d(0, width),
        y_range=Range1d(0, height),
        tools="pan,wheel_zoom,box_zoom,reset,save",
        match_aspect=True,
    )

    rgba = rgba_from_bgr(image)
    rgba32 = np.flipud(rgba.view(dtype=np.uint32).reshape(rgba.shape[:2]))
    p.image_rgba(image=[rgba32], x=0, y=0, dw=width, dh=height)

    disc_xs, disc_ys = mask_contours(disc_mask)
    cup_xs, cup_ys = mask_contours(cup_mask)

    disc_ys = [[height - y for y in ys] for ys in disc_ys]
    cup_ys = [[height - y for y in ys] for ys in cup_ys]

    if disc_xs:
        p.multi_line(
            xs=disc_xs,
            ys=disc_ys,
            line_color="#00FFFF",
            line_width=5,
        )

    if cup_xs:
        p.multi_line(
            xs=cup_xs,
            ys=cup_ys,
            line_color="#FF00FF",
            line_width=5,
        )

    disc_cx = float(features["disc_x"])
    disc_cy = height - float(features["disc_y"])
    cup_cx = float(features["cup_x"])
    cup_cy = height - float(features["cup_y"])

    # Disc arrow.
    disc_label_x = min(width * 0.86, disc_cx + width * 0.14)
    disc_label_y = min(height * 0.87, disc_cy + height * 0.18)

    p.add_layout(
        Arrow(
            end=NormalHead(size=14, fill_color="#00FFFF", line_color="#00FFFF"),
            x_start=disc_label_x,
            y_start=disc_label_y,
            x_end=disc_cx,
            y_end=disc_cy,
            line_color="#00FFFF",
            line_width=4,
        )
    )

    p.add_layout(
        Label(
            x=disc_label_x,
            y=disc_label_y,
            text="OPTIC DISC",
            text_color="#00FFFF",
            text_font_size="16px",
            text_font_style="bold",
            background_fill_color="black",
            background_fill_alpha=0.78,
        )
    )

    # Cup arrow.
    cup_label_x = min(width * 0.86, cup_cx + width * 0.12)
    cup_label_y = max(height * 0.14, cup_cy - height * 0.18)

    p.add_layout(
        Arrow(
            end=NormalHead(size=14, fill_color="#FF00FF", line_color="#FF00FF"),
            x_start=cup_label_x,
            y_start=cup_label_y,
            x_end=cup_cx,
            y_end=cup_cy,
            line_color="#FF00FF",
            line_width=4,
        )
    )

    p.add_layout(
        Label(
            x=cup_label_x,
            y=cup_label_y,
            text="OPTIC CUP",
            text_color="#FF00FF",
            text_font_size="16px",
            text_font_style="bold",
            background_fill_color="black",
            background_fill_alpha=0.78,
        )
    )

    # Measurement lines.
    disc_h = float(features["disc_height"])
    cup_h = float(features["cup_height"])
    disc_w = float(features["disc_width"])
    cup_w = float(features["cup_width"])

    vertical_x = disc_cx
    disc_top = disc_cy + disc_h / 2
    disc_bottom = disc_cy - disc_h / 2
    cup_top = cup_cy + cup_h / 2
    cup_bottom = cup_cy - cup_h / 2

    p.line(
        [vertical_x - 12, vertical_x - 12],
        [disc_bottom, disc_top],
        line_color="white",
        line_width=4,
        line_dash="dashed",
    )
    p.line(
        [vertical_x + 12, vertical_x + 12],
        [cup_bottom, cup_top],
        line_color="#FFFF00",
        line_width=6,
    )

    horizontal_y = disc_cy
    p.line(
        [disc_cx - disc_w / 2, disc_cx + disc_w / 2],
        [horizontal_y - 12, horizontal_y - 12],
        line_color="white",
        line_width=4,
        line_dash="dashed",
    )
    p.line(
        [cup_cx - cup_w / 2, cup_cx + cup_w / 2],
        [horizontal_y + 12, horizontal_y + 12],
        line_color="#FFFF00",
        line_width=6,
    )

    cdr_text = (
        f"Vertical CDR : {features['vertical_cdr']:.3f}\n"
        f"Horizontal CDR : {features['horizontal_cdr']:.3f}\n"
        f"Area CDR : {features['area_cdr']:.3f}"
    )

    p.add_layout(
        Label(
            x=25,
            y=height - 55,
            text=cdr_text,
            text_color="white",
            text_font_size="14px",
            text_font_style="bold",
            background_fill_color="black",
            background_fill_alpha=0.78,
            border_line_color="white",
            border_line_alpha=0.65,
        )
    )

    p.add_layout(
        Label(
            x=25,
            y=25,
            text="CYAN = OPTIC DISC    MAGENTA = OPTIC CUP    YELLOW = CDR",
            text_color="white",
            text_font_size="12px",
            background_fill_color="black",
            background_fill_alpha=0.78,
        )
    )

    p.axis.visible = False
    p.grid.visible = False

    html_path = OUTPUT_DIR / "optic_nerve_bokeh.html"
    html = file_html(p, CDN, "TRINAY Optic Nerve Head Analysis")
    html_path.write_text(html, encoding="utf-8")
    print("Bokeh HTML saved:", html_path)

    png_path = OUTPUT_DIR / "optic_nerve_bokeh.png"
    try:
        export_png(p, filename=str(png_path))
        print("Bokeh PNG saved:", png_path)
    except Exception as exc:
        print("Bokeh PNG export skipped:", exc)
        print("The Bokeh HTML visualization was created successfully.")

    return p


# ============================================================
# MAIN
# ============================================================

def main():
    if len(sys.argv) < 2:
        print(
            '\nUsage:\n'
            'python python/final_glaucoma_pipeline.py "data/G1020/Images/image_0.jpg"'
        )
        sys.exit(1)

    image_path = Path(sys.argv[1])
    if not image_path.is_absolute():
        image_path = ROOT / image_path

    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Could not read image:\n{image_path}")

    print("\n" + "=" * 80)
    print("TRINAY FINAL GLAUCOMA SCREENING PIPELINE")
    print("=" * 80)
    print("Device:", DEVICE)
    print("Image:", image_path)
    print("Original image size:", image.shape[1], "x", image.shape[0])

    # --------------------------------------------------------
    # QUALITY
    # --------------------------------------------------------
    quality_model = load_quality_model()
    quality_features = extract_quality_features(image)
    quality = predict_quality(quality_model, quality_features)

    print("\nImage Quality:")
    print("Result:", quality["label"])
    print("Confidence:", f"{quality['confidence']:.4f}")
    for key, value in quality_features.items():
        print(f"{key:15s}: {value:.6f}")

    original_panel = add_panel_header(
        image.copy(),
        "Original Fundus",
        "Canonical 512x512",
    )
    original_path = OUTPUT_DIR / "original_fundus.png"
    cv2.imwrite(str(original_path), original_panel)

    if quality["label"] == "UNGRADABLE":
        result = {
            "image": str(image_path),
            "quality": {**quality, "features": quality_features},
            "screening_status": "UNGRADABLE",
            "message": "Please provide a better-quality fundus image.",
        }
        result_path = OUTPUT_DIR / "screening_result.json"
        result_path.write_text(json.dumps(result, indent=4), encoding="utf-8")
        print("\nImage quality is insufficient. Screening stopped.")
        return

    # --------------------------------------------------------
    # MODELS
    # --------------------------------------------------------
    segmentation_model = load_segmentation_model()
    vessel_model = load_vessel_model()
    glaucoma_model = load_glaucoma_model()

    # --------------------------------------------------------
    # DISC / CUP
    # --------------------------------------------------------
    print("\nRunning optic disc/cup segmentation...")
    prediction, disc_mask_512, cup_mask_512, segmentation_tensor = predict_disc_cup(
        segmentation_model,
        image,
    )

    print("Disc pixels:", int(np.sum(disc_mask_512)))
    print("Cup pixels:", int(np.sum(cup_mask_512)))

    features = calculate_features(disc_mask_512, cup_mask_512)

    if features.get("status") != "VALID":
        print("\nSegmentation result invalid:")
        print(features.get("status"))

        result = {
            "image": str(image_path),
            "quality": {**quality, "features": quality_features},
            "anatomy": features,
            "screening_status": "ANATOMY_INVALID",
            "message": "Optic disc/cup measurements could not be completed reliably.",
        }
        result_path = OUTPUT_DIR / "screening_result.json"
        result_path.write_text(json.dumps(result, indent=4), encoding="utf-8")
        return

    print("\nCDR:")
    print("Vertical:", f"{features['vertical_cdr']:.4f}")
    print("Horizontal:", f"{features['horizontal_cdr']:.4f}")
    print("Area:", f"{features['area_cdr']:.4f}")
    print("Cup inside ratio:", f"{features['cup_inside_ratio']:.4f}")

    # Original-size masks.
    disc_mask_original = resize_mask_to_original(disc_mask_512, image.shape)
    cup_mask_original = resize_mask_to_original(cup_mask_512, image.shape)

    # IMPORTANT: scaled geometry is ONLY for visualization.
    # Classifier features remain in 512x512 space.
    bokeh_features = scale_features_to_original(features, image.shape)

    # --------------------------------------------------------
    # OPTIC NERVE IMAGE
    # --------------------------------------------------------
    optic_nerve_image = create_optic_nerve_overlay(
        image.copy(),
        disc_mask_original,
        cup_mask_original,
        bokeh_features,
    )
    optic_path = OUTPUT_DIR / "optic_nerve_analysis.png"
    cv2.imwrite(str(optic_path), optic_nerve_image)

    # --------------------------------------------------------
    # VESSELS
    # --------------------------------------------------------
    print("\nRunning retinal vessel segmentation...")
    vessel_mask, vessel_probability = predict_vessels(vessel_model, image)

    vessel_overlay = create_retinal_anatomy_overlay(
        image.copy(),
        vessel_mask,
        disc_mask_original,
        cup_mask_original,
    )
    vessel_path = OUTPUT_DIR / "vessel_overlay.png"
    cv2.imwrite(str(vessel_path), vessel_overlay)

    # --------------------------------------------------------
    # GRAD-CAM
    # --------------------------------------------------------
    print("\nGenerating Grad-CAM...")
    segmentation_model.eval()
    gradcam = create_gradcam(segmentation_model, segmentation_tensor, prediction)
    gradcam_overlay = create_gradcam_overlay(image, gradcam)
    gradcam_path = OUTPUT_DIR / "gradcam.png"
    cv2.imwrite(str(gradcam_path), gradcam_overlay)

    # --------------------------------------------------------
    # COMBINED XAI
    # --------------------------------------------------------
    combined_overlay = create_combined_overlay(
        image.copy(),
        vessel_mask,
        disc_mask_original,
        cup_mask_original,
        gradcam,
    )
    combined_path = OUTPUT_DIR / "xai_combined_overlay.png"
    cv2.imwrite(str(combined_path), combined_overlay)

    # --------------------------------------------------------
    # BOKEH
    # --------------------------------------------------------
    print("\nCreating Bokeh optic nerve visualization...")
    create_bokeh_optic_nerve(
        image,
        disc_mask_original,
        cup_mask_original,
        bokeh_features,
    )

    # --------------------------------------------------------
    # GLAUCOMA CLASSIFIER
    # --------------------------------------------------------
    print("\nRunning glaucoma screening classifier...")
    screening = predict_glaucoma(glaucoma_model, features)

    print("Glaucoma probability:", f"{screening['glaucoma_probability'] * 100:.2f}%")
    print("Prediction:", screening["prediction"])
    print("Screening flag:", "YES" if screening["flagged"] else "NO")

    # --------------------------------------------------------
    # SHAP
    # --------------------------------------------------------
    print("\nGenerating SHAP explanation...")
    shap_values, shap_method = calculate_shap(glaucoma_model, features)
    print("XAI method:", shap_method)
    for feature, value in shap_values.items():
        print(f"{feature:22s}: {value:+.6f}")

    # --------------------------------------------------------
    # FINAL 2x2 STATIC REPORT
    # --------------------------------------------------------
    static_report = create_static_report(
        image,
        optic_nerve_image,
        vessel_overlay,
        combined_overlay,
        features,
        quality,
        screening,
    )
    report_png = OUTPUT_DIR / "final_glaucoma_report.png"
    cv2.imwrite(str(report_png), static_report)
    print("\nFinal static report saved:", report_png)

    # --------------------------------------------------------
    # PLOTLY HTML REPORT - 2x2 VISUAL LAYOUT
    # --------------------------------------------------------
    print("Creating final Plotly report...")

    images = [
        (original_panel, "Original Fundus"),
        (optic_nerve_image, "Optic Nerve Analysis"),
        (vessel_overlay, "Retinal Anatomy"),
        (combined_overlay, "XAI / Combined Overlay"),
    ]

    fig = make_subplots(
        rows=2,
        cols=2,
        specs=[[{"type": "image"}, {"type": "image"}],
               [{"type": "image"}, {"type": "image"}]],
        subplot_titles=[title for _, title in images],
        vertical_spacing=0.05,
        horizontal_spacing=0.03,
    )

    for idx, (panel, _) in enumerate(images):
        row = 1 if idx < 2 else 2
        col = 1 if idx % 2 == 0 else 2
        fig.add_trace(
            go.Image(z=cv2.cvtColor(panel, cv2.COLOR_BGR2RGB)),
            row=row,
            col=col,
        )

    footer = (
        f"Image Quality: {quality['label']} | "
        f"Vertical CDR: {features['vertical_cdr']:.3f} | "
        f"Horizontal CDR: {features['horizontal_cdr']:.3f} | "
        f"Area CDR: {features['area_cdr']:.3f} | "
        f"Glaucoma probability: {screening['glaucoma_probability'] * 100:.2f}% | "
        f"Screening: {'FLAGGED' if screening['flagged'] else 'NOT FLAGGED'}"
    )

    fig.update_layout(
        title=dict(
            text="TRINAY — AI-Assisted Glaucoma Screening",
            x=0.5,
            xanchor="center",
        ),
        width=1700,
        height=1350,
        template="plotly_white",
        margin=dict(l=30, r=30, t=90, b=90),
        showlegend=False,
    )

    fig.add_annotation(
        text=footer,
        x=0.5,
        y=-0.055,
        xref="paper",
        yref="paper",
        showarrow=False,
        font=dict(size=13),
    )

    report_html = OUTPUT_DIR / "final_glaucoma_report.html"
    fig.write_html(str(report_html), include_plotlyjs=True)

    # --------------------------------------------------------
    # JSON
    # --------------------------------------------------------
    result = {
        "pipeline": "TRINAY AI-Assisted Glaucoma Screening",
        "image": str(image_path),
        "device": str(DEVICE),
        "quality": {
            **quality,
            "features": quality_features,
        },
        "anatomy": {
            "disc_detected": True,
            "cup_detected": True,
            "cup_inside_disc": True,
            "disc_area": features["disc_area"],
            "cup_area": features["cup_area"],
            "vertical_cdr": features["vertical_cdr"],
            "horizontal_cdr": features["horizontal_cdr"],
            "area_cdr": features["area_cdr"],
            "cup_inside_ratio": features["cup_inside_ratio"],
        },
        "retinal_vessels": {
            "threshold": VESSEL_THRESHOLD,
            "vessel_pixels": int(np.sum(vessel_mask)),
            "vessel_fraction": float(np.mean(vessel_mask)),
        },
        "glaucoma_screening": screening,
        "xai": {
            "shap_method": shap_method,
            "shap_values": shap_values,
            "gradcam_target": "optic_cup" if np.sum(prediction == 2) > 0 else "optic_disc",
        },
        "outputs": {
            "final_report_html": str(report_html),
            "final_report_png": str(report_png),
            "optic_nerve_bokeh_html": str(OUTPUT_DIR / "optic_nerve_bokeh.html"),
            "optic_nerve_bokeh_png": str(OUTPUT_DIR / "optic_nerve_bokeh.png"),
            "vessel_overlay": str(vessel_path),
            "gradcam": str(gradcam_path),
            "original_fundus": str(original_path),
            "optic_nerve_analysis": str(optic_path),
            "retinal_anatomy": str(vessel_path),
            "xai_combined_overlay": str(combined_path),
        },
        "clinical_workflow": {
            "screening_flagged": screening["flagged"],
            "doctor_review": bool(screening["flagged"]),
            "statement": (
                "AI-assisted glaucoma screening result requiring clinical review when flagged."
            ),
        },
    }

    result_path = OUTPUT_DIR / "screening_result.json"
    result_path.write_text(json.dumps(result, indent=4), encoding="utf-8")

    # --------------------------------------------------------
    # FINAL SUMMARY
    # --------------------------------------------------------
    print("\n" + "=" * 80)
    print("FINAL SCREENING RESULT")
    print("=" * 80)

    if screening["flagged"]:
        print("GLAUCOMA SCREENING: FLAGGED")
        print("Further clinical evaluation is recommended.")
        print("Doctor review: REQUIRED")
    else:
        print("GLAUCOMA SCREENING: NOT FLAGGED")
        print("The current AI screening model did not generate a glaucoma flag.")
        print("Doctor review: Continue according to clinical workflow.")

    print("\nGlaucoma probability:", f"{screening['glaucoma_probability'] * 100:.2f}%")
    print("\nFinal Plotly report:", report_html)
    print("Final PNG report:", report_png)
    print("Bokeh optic nerve analysis:", OUTPUT_DIR / "optic_nerve_bokeh.html")
    print("\n" + "=" * 80)
    print("PIPELINE COMPLETED")
    print("=" * 80)


if __name__ == "__main__":
    main()
