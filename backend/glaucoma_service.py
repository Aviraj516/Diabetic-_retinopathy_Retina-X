"""
TRINAY Glaucoma Screening ML Service
Encapsulates real-time inference for:
1. Fundus Image Quality Assessment (best_quality_model.pkl)
2. Optic Disc & Cup Segmentation (best_attention_disc_cup_unet.pth)
3. Quantitative CDR & Structural Feature Extraction (exact 10 features in 512x512 space)
4. Retinal Vessel Segmentation (best_vessel_unet.pth)
5. Glaucoma Random Forest Screening (best_glaucoma_model.pkl)
6. SHAP TreeExplainer Feature Importance
7. Grad-CAM Spatial Focus on Optic Nerve
8. 4-Panel Clinical Evidence Gallery & Interactive Bokeh HTML Generation
9. Coordinate Scaling to Original Fundus Resolution
"""

from __future__ import annotations

import base64
import os
import sys
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import joblib
import numpy as np
try:
    import shap
except ImportError:
    shap = None

import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.pipeline import Pipeline
import segmentation_models_pytorch as smp

try:
    from bokeh.embed import file_html
    from bokeh.models import Arrow, Label, NormalHead, Range1d
    from bokeh.plotting import figure
    from bokeh.resources import CDN
except ImportError:
    file_html = None
    figure = None
    CDN = None
    Range1d = None

warnings.filterwarnings("ignore")

# ============================================================
# PATHS & CONFIGURATION
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

GLAUCOMA_MODEL_DIR = PROJECT_ROOT / "glaucoma_model"

QUALITY_MODEL_PATH = GLAUCOMA_MODEL_DIR / "best_quality_model.pkl"
SEGMENTATION_MODEL_PATH = GLAUCOMA_MODEL_DIR / "best_attention_disc_cup_unet.pth"
VESSEL_MODEL_PATH = GLAUCOMA_MODEL_DIR / "best_vessel_unet.pth"
GLAUCOMA_MODEL_PATH = GLAUCOMA_MODEL_DIR / "best_glaucoma_model.pkl"

IMAGE_SIZE = 512
VESSEL_THRESHOLD = 0.50
MIN_DISC_AREA = 500
MIN_CUP_AREA = 50
MIN_CUP_INSIDE_RATIO = 0.90
GLAUCOMA_FLAG_THRESHOLD = 0.50

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

# Device Selection
if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

print(f"[Glaucoma Service] Inference device: {DEVICE}")


# ============================================================
# ATTENTION U-NET ARCHITECTURE (Disc + Cup)
# ============================================================

class DoubleConv(nn.Module):
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class AttentionGate(nn.Module):
    def __init__(self, gating_channels: int, skip_channels: int, inter_channels: int):
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

    def forward(self, g: torch.Tensor, x: torch.Tensor) -> torch.Tensor:
        g1 = self.W_g(g)
        x1 = self.W_x(x)
        if g1.shape[-2:] != x1.shape[-2:]:
            g1 = F.interpolate(g1, size=x1.shape[-2:], mode="bilinear", align_corners=False)
        psi = self.relu(g1 + x1)
        psi = self.psi(psi)
        return x * psi


class AttentionUNet(nn.Module):
    def __init__(self, in_channels: int = 3, num_classes: int = 3):
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

    def forward(self, x: torch.Tensor) -> torch.Tensor:
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
# VESSEL U-NET ARCHITECTURE
# ============================================================

class VesselUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = smp.Unet(
            encoder_name="efficientnet-b0",
            encoder_weights=None,
            in_channels=3,
            classes=1,
            activation=None,
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)


# ============================================================
# GRAD-CAM IMPLEMENTATION
# ============================================================

class GradCAM:
    def __init__(self, model: nn.Module, target_layer: nn.Module):
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

    def generate(self, tensor: torch.Tensor, target_class: int, target_mask: Optional[np.ndarray] = None) -> np.ndarray:
        device = next(self.model.parameters()).device
        tensor = tensor.to(device)
        self.model.zero_grad(set_to_none=True)
        logits = self.model(tensor)
        target = logits[0, target_class]

        if target_mask is not None and np.sum(target_mask) > 0:
            mask_tensor = torch.from_numpy(target_mask).float().to(device)
            score = (target * mask_tensor).sum() / (mask_tensor.sum() + 1e-6)
        else:
            score = target.mean()

        score.backward()

        activations = self.activations.detach()
        gradients = self.gradients.detach()
        weights = gradients.mean(dim=(2, 3), keepdim=True)
        cam = (weights * activations).sum(dim=1)[0]
        cam = F.relu(cam).cpu().numpy()

        max_val = float(np.max(cam))
        if max_val > 0:
            cam = cam / max_val
        return cam


# ============================================================
# UTILITIES & IMAGE ENCODING
# ============================================================

def bgr_to_b64(image_bgr: np.ndarray, quality: int = 92) -> str:
    """Encode OpenCV BGR ndarray to Base64 PNG string."""
    if image_bgr is None:
        return ""
    success, buffer = cv2.imencode(".png", image_bgr)
    if not success:
        return ""
    return base64.b64encode(buffer).decode("utf-8")


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Retain only the largest connected component."""
    mask = mask.astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels <= 1:
        return np.zeros_like(mask)
    largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    return (labels == largest_label).astype(np.uint8)


def frontend_quality_payload(quality_res: Dict[str, Any]) -> Dict[str, Any]:
    """
    Glaucoma connection adapter (no model change):
    Normalize the internal quality result into the frontend QualityResult
    shape expected by src/services/mlService.ts:
      { quality: 'Good'|'Borderline'|'Ungradable',
        confidence: { Good, Borderline, Ungradable },
        features: {...} }
    Original model keys (status/probabilities/confidenceScore) are preserved
    for backward compatibility.
    """
    status = str(quality_res.get("status", "")).upper()
    probs = quality_res.get("probabilities", {}) or {}
    lowered = {str(k).lower(): float(v) for k, v in probs.items()}

    if status == "GOOD":
        label = "Good"
    elif status == "BORDERLINE":
        label = "Borderline"
    else:
        label = "Ungradable" if status == "UNGRADABLE" else str(quality_res.get("quality", "Good"))

    confidence_dict = {
        "Good": float(lowered.get("good", 1.0 if label == "Good" else 0.0)),
        "Borderline": float(lowered.get("borderline", 0.0)),
        "Ungradable": float(lowered.get("ungradable", 1.0 if label == "Ungradable" else 0.0)),
    }
    # If the classifier only emitted a single max-probability float, fall back
    # to placing it on the predicted label.
    try:
        conf_val = float(quality_res.get("confidence", 0.0))
    except Exception:
        conf_val = 0.0
    if not probs and conf_val:
        for k in confidence_dict:
            confidence_dict[k] = 0.0
        confidence_dict[label] = conf_val

    return {
        "quality": label,
        "confidence": confidence_dict,
        "features": quality_res.get("features", {}),
        # Backward-compatible originals (model output untouched)
        "status": quality_res.get("status", status),
        "probabilities": probs,
        "confidenceScore": conf_val,
    }


def clean_mask(mask: np.ndarray) -> np.ndarray:
    """Remove small components and close holes."""
    mask = largest_component(mask)
    if np.sum(mask) == 0:
        return mask
    kernel = np.ones((5, 5), dtype=np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def mask_to_svg_path(mask: np.ndarray) -> str:
    """Extract largest external contour from binary mask and format as SVG path data (M x y L x y ... Z)."""
    if mask is None or np.sum(mask) == 0:
        return ""
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return ""
    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < 10:
        return ""
    pts = largest.reshape(-1, 2)
    if len(pts) < 3:
        return ""
    return f"M {pts[0][0]} {pts[0][1]} " + " ".join(f"L {p[0]} {p[1]}" for p in pts[1:]) + " Z"


# ============================================================
# GLAUCOMA SINGLETON SERVICE
# ============================================================

class GlaucomaService:
    _instance: Optional[GlaucomaService] = None

    def __init__(self):
        print("\n" + "=" * 60)
        print("INITIALIZING TRINAY GLAUCOMA SCREENING PIPELINE")
        print("=" * 60)

        # 1. Quality Model
        print("[Glaucoma] Loading Quality Model...")
        if not QUALITY_MODEL_PATH.exists():
            raise FileNotFoundError(f"Missing quality model: {QUALITY_MODEL_PATH}")
        self.quality_model = joblib.load(QUALITY_MODEL_PATH)
        print("✓ Quality Model loaded")

        # 2. Attention U-Net (Disc + Cup Segmentation)
        print("[Glaucoma] Loading Attention U-Net...")
        if not SEGMENTATION_MODEL_PATH.exists():
            raise FileNotFoundError(f"Missing segmentation model: {SEGMENTATION_MODEL_PATH}")
        self.seg_model = AttentionUNet(in_channels=3, num_classes=3)
        checkpoint = torch.load(SEGMENTATION_MODEL_PATH, map_location="cpu", weights_only=False)
        state_dict = checkpoint["model_state_dict"] if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint else checkpoint
        self.seg_model.load_state_dict(state_dict, strict=True)
        self.seg_model.to(DEVICE)
        self.seg_model.eval()
        print("✓ Attention U-Net loaded")

        # 3. Vessel U-Net
        print("[Glaucoma] Loading Vessel U-Net...")
        if not VESSEL_MODEL_PATH.exists():
            raise FileNotFoundError(f"Missing vessel model: {VESSEL_MODEL_PATH}")
        self.vessel_model = VesselUNet()
        v_checkpoint = torch.load(VESSEL_MODEL_PATH, map_location="cpu", weights_only=False)
        v_state = v_checkpoint["model_state_dict"] if isinstance(v_checkpoint, dict) and "model_state_dict" in v_checkpoint else v_checkpoint
        cleaned_state = { (k[7:] if k.startswith("module.") else k): v for k, v in v_state.items() }
        self.vessel_model.load_state_dict(cleaned_state, strict=True)
        self.vessel_model.to(DEVICE)
        self.vessel_model.eval()
        print("✓ Vessel U-Net loaded")

        # 4. Glaucoma Random Forest Classifier
        print("[Glaucoma] Loading Glaucoma Classifier...")
        if not GLAUCOMA_MODEL_PATH.exists():
            raise FileNotFoundError(f"Missing glaucoma classifier: {GLAUCOMA_MODEL_PATH}")
        self.glaucoma_model = joblib.load(GLAUCOMA_MODEL_PATH)
        print("✓ Glaucoma Random Forest loaded")
        print("=" * 60)

    @classmethod
    def get_instance(cls) -> GlaucomaService:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------
    # QUALITY GATE
    # ------------------------------------------------------------
    def extract_quality_features(self, image_bgr: np.ndarray) -> Dict[str, float]:
        """Extract exact 6 quality features: sharpness, brightness, illumination, contrast, noise, fov."""
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # 1. Sharpness: Variance of Laplacian
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # 2. Brightness: Mean intensity
        brightness = float(np.mean(gray))

        # 3. Illumination: Center-to-mean spatial uniformity ratio
        cy, cx = h // 2, w // 2
        r = min(h, w) // 4
        center_crop = gray[max(0, cy - r):min(h, cy + r), max(0, cx - r):min(w, cx + r)]
        illumination = float(np.mean(center_crop) / (brightness + 1e-6))

        # 4. Contrast: RMS standard deviation
        contrast = float(np.std(gray))

        # 5. Noise: High-frequency residual
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        noise = float(np.std(gray.astype(np.float32) - blur.astype(np.float32)))

        # 6. Field of View (FOV): Fraction of valid non-black pixels
        fov = float(np.sum(gray > 15) / (h * w))

        return {
            "sharpness": sharpness,
            "brightness": brightness,
            "illumination": illumination,
            "contrast": contrast,
            "noise": noise,
            "fov": fov,
        }

    def assess_quality(self, image_bgr: np.ndarray) -> Dict[str, Any]:
        """Runs the trained quality Random Forest model."""
        feats = self.extract_quality_features(image_bgr)
        X = np.array([[
            feats["sharpness"],
            feats["brightness"],
            feats["illumination"],
            feats["contrast"],
            feats["noise"],
            feats["fov"],
        ]])

        prediction = self.quality_model.predict(X)[0]
        probabilities = self.quality_model.predict_proba(X)[0]

        if hasattr(self.quality_model, "classes_"):
            class_map = {str(c): float(p) for c, p in zip(self.quality_model.classes_, probabilities)}
        else:
            class_map = {"Good": float(probabilities[0]), "Ungradable": float(probabilities[-1])}

        status = "GOOD" if str(prediction).lower() in ["good", "1"] else "UNGRADABLE"
        if status != "GOOD" and (feats["fov"] < 0.25 or feats["sharpness"] < 10.0 or feats["brightness"] < 15.0):
            status = "UNGRADABLE"

        return {
            "status": status,
            "confidence": float(np.max(probabilities)),
            "probabilities": class_map,
            "features": feats,
        }

    # ------------------------------------------------------------
    # SEGMENTATION PREPROCESSING & INFERENCE
    # ------------------------------------------------------------
    def preprocess_for_segmentation(self, image_bgr: np.ndarray) -> torch.Tensor:
        """Resize to 512x512, BGR->RGB, /255, ImageNet norm."""
        resized = cv2.resize(image_bgr, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

        normed = (rgb - mean) / std
        transposed = np.transpose(normed, (2, 0, 1))
        tensor = torch.tensor(transposed, dtype=torch.float32).unsqueeze(0)
        return tensor

    @torch.no_grad()
    def segment_disc_cup(self, tensor: torch.Tensor) -> np.ndarray:
        tensor = tensor.to(DEVICE)
        logits = self.seg_model(tensor)
        pred = torch.argmax(logits, dim=1)[0].cpu().numpy()
        return pred

    # ------------------------------------------------------------
    # CDR & STRUCTURAL FEATURE EXTRACTION (512x512 space)
    # ------------------------------------------------------------
    def extract_cdr_features(self, prediction: np.ndarray) -> Dict[str, Any]:
        """
        Extract exact 10 features:
        - full optic disc: class 1 OR class 2
        - optic cup: class 2
        """
        full_disc = clean_mask(((prediction == 1) | (prediction == 2)).astype(np.uint8))
        cup_mask = clean_mask((prediction == 2).astype(np.uint8))

        disc_area = int(np.sum(full_disc))
        cup_area = int(np.sum(cup_mask))

        if disc_area < MIN_DISC_AREA:
            return {
                "status": "INVALID_DISC",
                "disc_detected": False,
                "cup_detected": False,
                "cup_inside_disc": False,
                "disc_area": disc_area,
                "cup_area": cup_area,
                "full_disc_mask": full_disc,
                "cup_mask": cup_mask,
            }

        if cup_area < MIN_CUP_AREA:
            return {
                "status": "INVALID_CUP",
                "disc_detected": True,
                "cup_detected": False,
                "cup_inside_disc": False,
                "disc_area": disc_area,
                "cup_area": cup_area,
                "full_disc_mask": full_disc,
                "cup_mask": cup_mask,
            }

        # Validate cup inside disc ratio
        cup_pixels = cup_mask > 0
        cup_inside_pixels = cup_pixels & (full_disc > 0)
        inside_ratio = float(np.sum(cup_inside_pixels) / max(np.sum(cup_pixels), 1))

        if inside_ratio < MIN_CUP_INSIDE_RATIO:
            return {
                "status": "INVALID_CUP_POSITION",
                "disc_detected": True,
                "cup_detected": True,
                "cup_inside_disc": False,
                "disc_area": disc_area,
                "cup_area": cup_area,
                "cup_inside_ratio": inside_ratio,
                "full_disc_mask": full_disc,
                "cup_mask": cup_mask,
            }

        # Constrain cup strictly inside full disc
        cup_mask = (cup_mask & full_disc).astype(np.uint8)
        cup_area = int(np.sum(cup_mask))

        disc_pts = cv2.findNonZero(full_disc)
        cup_pts = cv2.findNonZero(cup_mask)

        if disc_pts is None or cup_pts is None:
            return {
                "status": "INVALID_GEOMETRY",
                "disc_detected": False,
                "cup_detected": False,
                "cup_inside_disc": False,
                "full_disc_mask": full_disc,
                "cup_mask": cup_mask,
            }

        disc_x, disc_y, disc_w, disc_h = cv2.boundingRect(disc_pts)
        cup_x, cup_y, cup_w, cup_h = cv2.boundingRect(cup_pts)

        if disc_w <= 0 or disc_h <= 0 or cup_w <= 0 or cup_h <= 0:
            return {
                "status": "INVALID_GEOMETRY",
                "disc_detected": False,
                "cup_detected": False,
                "cup_inside_disc": False,
                "full_disc_mask": full_disc,
                "cup_mask": cup_mask,
            }

        vertical_cdr = float(cup_h / disc_h)
        horizontal_cdr = float(cup_w / disc_w)
        area_cdr = float(cup_area / disc_area)

        return {
            "status": "VALID",
            "disc_detected": True,
            "cup_detected": True,
            "cup_inside_disc": True,
            "disc_area": disc_area,
            "cup_area": cup_area,
            "disc_width": int(disc_w),
            "disc_height": int(disc_h),
            "cup_width": int(cup_w),
            "cup_height": int(cup_h),
            "vertical_cdr": vertical_cdr,
            "horizontal_cdr": horizontal_cdr,
            "area_cdr": area_cdr,
            "disc_x": int(disc_x),
            "disc_y": int(disc_y),
            "cup_x": int(cup_x),
            "cup_y": int(cup_y),
            "cup_inside_ratio": inside_ratio,
            "full_disc_mask": full_disc,
            "cup_mask": cup_mask,
        }

    # ------------------------------------------------------------
    # VESSEL SEGMENTATION
    # ------------------------------------------------------------
    @torch.no_grad()
    def segment_vessels(self, tensor: torch.Tensor) -> np.ndarray:
        tensor = tensor.to(DEVICE)
        logits = self.vessel_model(tensor)
        probs = torch.sigmoid(logits)[0, 0].cpu().numpy()
        binary = (probs >= VESSEL_THRESHOLD).astype(np.uint8)
        return binary

    # ------------------------------------------------------------
    # GLAUCOMA CLASSIFICATION & SHAP
    # ------------------------------------------------------------
    def classify_glaucoma(self, features: Dict[str, Any]) -> Dict[str, Any]:
        X = np.array([[features[col] for col in FEATURE_COLUMNS]], dtype=np.float64)
        prediction = int(self.glaucoma_model.predict(X)[0])
        probabilities = self.glaucoma_model.predict_proba(X)[0]
        glaucoma_prob = float(probabilities[1])
        normal_prob = float(probabilities[0])

        flagged = glaucoma_prob >= GLAUCOMA_FLAG_THRESHOLD

        # Recommendation in clinical decision support phrasing
        if flagged:
            recommendation = (
                "AI-assisted screening flag: Elevated Cup-to-Disc Ratio and structural changes detected. "
                "Urgent comprehensive ophthalmologist evaluation (gonioscopy, visual field Humphrey perimetry, OCT) recommended."
            )
        else:
            recommendation = (
                "AI-assisted screening: Normal optic nerve head parameters within physiological baseline limits. "
                "Routine annual eye care follow-up recommended."
            )

        return {
            "prediction": prediction,
            "probability": glaucoma_prob,
            "normal_probability": normal_prob,
            "confidence": float(max(glaucoma_prob, normal_prob) * 100),
            "flagged": flagged,
            "status": "FLAGGED" if flagged else "NOT FLAGGED",
            "clinicalRecommendation": recommendation,
        }

    def compute_shap(self, features: Dict[str, Any]) -> Dict[str, Any]:
        X = np.array([[features[col] for col in FEATURE_COLUMNS]], dtype=np.float64)
        rf = self.glaucoma_model.named_steps["classifier"] if isinstance(self.glaucoma_model, Pipeline) else self.glaucoma_model

        if shap is not None:
            try:
                explainer = shap.TreeExplainer(rf)
                values = explainer.shap_values(X)

                if isinstance(values, list):
                    val_arr = values[1] if len(values) > 1 else values[0]
                    val_arr = val_arr[0]
                else:
                    val_arr = np.asarray(values)
                    if val_arr.ndim == 3:
                        val_arr = val_arr[0, :, 1]
                    elif val_arr.ndim == 2:
                        val_arr = val_arr[0]

                shap_dict = {col: float(v) for col, v in zip(FEATURE_COLUMNS, np.asarray(val_arr).flatten())}
                base_val = float(explainer.expected_value[1]) if isinstance(explainer.expected_value, (list, np.ndarray)) else float(explainer.expected_value)
                return {
                    "features": FEATURE_COLUMNS,
                    "values": [float(features[c]) for c in FEATURE_COLUMNS],
                    "contributions": [shap_dict[c] for c in FEATURE_COLUMNS],
                    "base_value": base_val,
                    "method": "SHAP TreeExplainer",
                }
            except Exception as e:
                print("[Glaucoma SHAP warning]:", e)

        # Fallback to model feature importances
        try:
            importances = getattr(rf, "feature_importances_", None)
            if importances is not None:
                contribs = [float(imp) for imp in importances]
            else:
                contribs = [0.1] * len(FEATURE_COLUMNS)
        except Exception:
            contribs = [0.1] * len(FEATURE_COLUMNS)

        return {
            "features": FEATURE_COLUMNS,
            "values": [float(features[c]) for c in FEATURE_COLUMNS],
            "contributions": contribs,
            "base_value": 0.5,
            "method": "Feature Importances",
        }

    # ------------------------------------------------------------
    # GRAD-CAM GENERATION
    # ------------------------------------------------------------
    def compute_gradcam(self, tensor: torch.Tensor, prediction: np.ndarray) -> np.ndarray:
        target_layer = self.seg_model.bottleneck.block[3]
        gradcam = GradCAM(self.seg_model, target_layer)

        target_class = 2 if np.sum(prediction == 2) > 0 else 1
        target_mask = (prediction == target_class).astype(np.float32)

        try:
            cam = gradcam.generate(tensor, target_class, target_mask)
        except Exception as e:
            print("[Glaucoma Grad-CAM warning]:", e)
            cam = np.zeros((IMAGE_SIZE, IMAGE_SIZE), dtype=np.float32)
        finally:
            gradcam.remove()

        cam = cv2.resize(cam, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_LINEAR)
        return cam

    # ------------------------------------------------------------
    # COORDINATE SCALING & CLINICAL 4-PANEL VISUALIZATIONS
    # ------------------------------------------------------------
    def render_clinical_panels(
        self,
        orig_bgr: np.ndarray,
        disc_mask_512: np.ndarray,
        cup_mask_512: np.ndarray,
        vessel_mask_512: np.ndarray,
        gradcam_512: np.ndarray,
        cdr_features: Dict[str, Any],
    ) -> Dict[str, str]:
        """
        Generates 4 clinical panels:
        1. Original Fundus (Canonical 512x512 badge)
        2. Optic Nerve Analysis (Green disc contour, Red cup contour, pointer arrows, vertical/horizontal measurement lines, CDR card)
        3. Retinal Anatomy (Thin clean vessel contours, Disc & Cup boundaries)
        4. XAI / Combined Overlay (Vessels + Disc + Cup + Subtle Grad-CAM)
        """
        h_orig, w_orig = orig_bgr.shape[:2]
        canonical_512 = cv2.resize(orig_bgr, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_AREA)

        # Scale masks to original image resolution
        disc_mask_orig = cv2.resize(disc_mask_512, (w_orig, h_orig), interpolation=cv2.INTER_NEAREST)
        cup_mask_orig = cv2.resize(cup_mask_512, (w_orig, h_orig), interpolation=cv2.INTER_NEAREST)
        vessel_mask_orig = cv2.resize(vessel_mask_512, (w_orig, h_orig), interpolation=cv2.INTER_NEAREST)
        gradcam_orig = cv2.resize(gradcam_512, (w_orig, h_orig), interpolation=cv2.INTER_LINEAR)

        # --------------------------------------------------------
        # Panel 1: Original Fundus (Untouched)
        # --------------------------------------------------------
        panel1 = canonical_512.copy()
        # Add small metadata pill
        cv2.rectangle(panel1, (16, 16), (220, 52), (15, 23, 42), -1)
        cv2.putText(panel1, "Original Fundus", (28, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.rectangle(panel1, (IMAGE_SIZE - 170, 16), (IMAGE_SIZE - 16, 52), (15, 23, 42), -1)
        cv2.putText(panel1, "512x512 Canonical", (IMAGE_SIZE - 160, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (14, 165, 233), 1, cv2.LINE_AA)

        # --------------------------------------------------------
        # Panel 2: Optic Nerve Analysis
        # --------------------------------------------------------
        panel2 = canonical_512.copy()
        # Contours on 512
        disc_cnts, _ = cv2.findContours(disc_mask_512, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cup_cnts, _ = cv2.findContours(cup_mask_512, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Green for Optic Disc, Magenta/Red for Optic Cup
        cv2.drawContours(panel2, disc_cnts, -1, (50, 205, 50), 2, cv2.LINE_AA)
        cv2.drawContours(panel2, cup_cnts, -1, (255, 0, 255), 2, cv2.LINE_AA)

        # Measurement crosshairs & Center
        if cdr_features.get("status") == "VALID":
            dx, dy, dw, dh = cdr_features["disc_x"], cdr_features["disc_y"], cdr_features["disc_width"], cdr_features["disc_height"]
            cx, cy, cw, ch = cdr_features["cup_x"], cdr_features["cup_y"], cdr_features["cup_width"], cdr_features["cup_height"]

            disc_center_x, disc_center_y = dx + dw // 2, dy + dh // 2
            cup_center_x, cup_center_y = cx + cw // 2, cy + ch // 2

            # Center dots
            cv2.circle(panel2, (disc_center_x, disc_center_y), 4, (50, 205, 50), -1, cv2.LINE_AA)
            cv2.circle(panel2, (cup_center_x, cup_center_y), 4, (255, 0, 255), -1, cv2.LINE_AA)

            # Measurement lines: Vertical Disc & Cup
            cv2.line(panel2, (disc_center_x, dy), (disc_center_x, dy + dh), (50, 205, 50), 1, cv2.LINE_AA)
            cv2.line(panel2, (cup_center_x, cy), (cup_center_x, cy + ch), (255, 0, 255), 2, cv2.LINE_AA)

            # Pointer Arrows & Labels
            # Disc Arrow
            label_dx = min(IMAGE_SIZE - 120, max(20, disc_center_x + 60))
            label_dy = max(50, disc_center_y - 60)
            cv2.arrowedLine(panel2, (label_dx, label_dy), (disc_center_x, disc_center_y), (50, 205, 50), 2, tipLength=0.2)
            cv2.rectangle(panel2, (label_dx - 6, label_dy - 20), (label_dx + 110, label_dy + 6), (15, 23, 42), -1)
            cv2.putText(panel2, "OPTIC DISC", (label_dx, label_dy - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (50, 205, 50), 1, cv2.LINE_AA)

            # Cup Arrow
            label_cx = min(IMAGE_SIZE - 120, max(20, cup_center_x + 60))
            label_cy = min(IMAGE_SIZE - 40, cup_center_y + 60)
            cv2.arrowedLine(panel2, (label_cx, label_cy), (cup_center_x, cup_center_y), (255, 0, 255), 2, tipLength=0.2)
            cv2.rectangle(panel2, (label_cx - 6, label_cy - 20), (label_cx + 100, label_cy + 6), (15, 23, 42), -1)
            cv2.putText(panel2, "OPTIC CUP", (label_cx, label_cy - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 255), 1, cv2.LINE_AA)

            # Compact CDR Info Card at bottom
            v_cdr = cdr_features["vertical_cdr"]
            h_cdr = cdr_features["horizontal_cdr"]
            a_cdr = cdr_features["area_cdr"]
            cdr_text = f"V-CDR: {v_cdr:.3f} | H-CDR: {h_cdr:.3f} | Area-CDR: {a_cdr:.3f}"
            cv2.rectangle(panel2, (16, IMAGE_SIZE - 46), (IMAGE_SIZE - 16, IMAGE_SIZE - 14), (15, 23, 42), -1)
            cv2.putText(panel2, cdr_text, (26, IMAGE_SIZE - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)
        else:
            fail_text = f"SEGMENTATION UNGRADABLE ({cdr_features.get('status', 'INVALID')}) — CDR NOT COMPUTED"
            cv2.rectangle(panel2, (16, IMAGE_SIZE - 46), (IMAGE_SIZE - 16, IMAGE_SIZE - 14), (15, 23, 42), -1)
            cv2.putText(panel2, fail_text, (24, IMAGE_SIZE - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 165, 255), 1, cv2.LINE_AA)

        # --------------------------------------------------------
        # Panel 3: Retinal Anatomy (Thin clean vessel overlay + Disc/Cup)
        # --------------------------------------------------------
        panel3 = canonical_512.copy()
        # Thin vessel contours rather than solid fill
        vessel_cnts, _ = cv2.findContours(vessel_mask_512, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(panel3, vessel_cnts, -1, (0, 220, 255), 1, cv2.LINE_AA) # Yellow-Cyan fine lines
        cv2.drawContours(panel3, disc_cnts, -1, (50, 205, 50), 2, cv2.LINE_AA)
        cv2.drawContours(panel3, cup_cnts, -1, (255, 0, 255), 2, cv2.LINE_AA)

        # Top anatomy title
        cv2.rectangle(panel3, (16, 16), (200, 52), (15, 23, 42), -1)
        cv2.putText(panel3, "Retinal Anatomy", (26, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2, cv2.LINE_AA)

        # Anatomy legend
        leg_text = "YELLOW = VESSELS | GREEN = DISC | MAGENTA = CUP"
        cv2.rectangle(panel3, (16, IMAGE_SIZE - 46), (IMAGE_SIZE - 16, IMAGE_SIZE - 14), (15, 23, 42), -1)
        cv2.putText(panel3, leg_text, (24, IMAGE_SIZE - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 1, cv2.LINE_AA)

        # --------------------------------------------------------
        # Panel: Neuroretinal Rim Evidence (View C)
        # Tissue between outer disc boundary and inner cup boundary
        # --------------------------------------------------------
        panel_rim = canonical_512.copy()
        if cdr_features.get("status") == "VALID":
            rim_mask = cv2.bitwise_and(disc_mask_512, cv2.bitwise_not(cup_mask_512))
            rim_overlay = panel_rim.copy()
            # Highlight rim region in subtle sky-blue/cyan (235, 180, 50 in BGR)
            rim_overlay[rim_mask > 0] = (235, 180, 50)
            cv2.addWeighted(rim_overlay, 0.40, panel_rim, 0.60, 0, panel_rim)

            # Draw outer disc boundary in green, inner cup in magenta
            cv2.drawContours(panel_rim, disc_cnts, -1, (50, 205, 50), 2, cv2.LINE_AA)
            cv2.drawContours(panel_rim, cup_cnts, -1, (255, 0, 255), 2, cv2.LINE_AA)

            disc_a = int(cdr_features.get("disc_area", 0))
            cup_a = int(cdr_features.get("cup_area", 0))
            rim_a = max(0, disc_a - cup_a)
            rim_text = f"RIM AREA: {rim_a:,} px | DISC: {disc_a:,} px | CUP: {cup_a:,} px"
            cv2.rectangle(panel_rim, (16, IMAGE_SIZE - 46), (IMAGE_SIZE - 16, IMAGE_SIZE - 14), (15, 23, 42), -1)
            cv2.putText(panel_rim, rim_text, (24, IMAGE_SIZE - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
        else:
            fail_text = f"NEURORETINAL RIM UNGRADABLE ({cdr_features.get('status', 'INVALID')})"
            cv2.rectangle(panel_rim, (16, IMAGE_SIZE - 46), (IMAGE_SIZE - 16, IMAGE_SIZE - 14), (15, 23, 42), -1)
            cv2.putText(panel_rim, fail_text, (24, IMAGE_SIZE - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 165, 255), 1, cv2.LINE_AA)

        cv2.rectangle(panel_rim, (16, 16), (240, 52), (15, 23, 42), -1)
        cv2.putText(panel_rim, "Neuroretinal Rim", (26, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2, cv2.LINE_AA)

        # --------------------------------------------------------
        # Panel 4: XAI / Combined Overlay (Vessels + Disc + Cup + Subtle Grad-CAM)
        # --------------------------------------------------------
        panel4 = canonical_512.copy()
        heatmap = cv2.applyColorMap((np.clip(gradcam_512, 0, 1) * 255).astype(np.uint8), cv2.COLORMAP_JET)
        alpha = 0.28 * gradcam_512[..., None]
        panel4 = (panel4.astype(np.float32) * (1.0 - alpha) + heatmap.astype(np.float32) * alpha).astype(np.uint8)

        # Re-draw anatomy on top
        cv2.drawContours(panel4, vessel_cnts, -1, (0, 220, 255), 1, cv2.LINE_AA)
        cv2.drawContours(panel4, disc_cnts, -1, (50, 205, 50), 2, cv2.LINE_AA)
        cv2.drawContours(panel4, cup_cnts, -1, (255, 0, 255), 2, cv2.LINE_AA)

        cv2.rectangle(panel4, (16, 16), (230, 52), (15, 23, 42), -1)
        cv2.putText(panel4, "XAI / Grad-CAM Overlay", (26, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)

        cv2.rectangle(panel4, (16, IMAGE_SIZE - 46), (IMAGE_SIZE - 16, IMAGE_SIZE - 14), (15, 23, 42), -1)
        cv2.putText(panel4, "GRAD-CAM SALIENCY + SEGMENTATION CO-LOCALIZATION", (22, IMAGE_SIZE - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (14, 165, 233), 1, cv2.LINE_AA)

        return {
            "original": bgr_to_b64(panel1),
            "optic_nerve": bgr_to_b64(panel2),
            "rim": bgr_to_b64(panel_rim),
            "vessels": bgr_to_b64(panel3),
            "gradcam": bgr_to_b64(heatmap),
            "combined": bgr_to_b64(panel4),
        }

    # ------------------------------------------------------------
    # BOKEH INTERACTIVE OPTIC NERVE VISUALIZATION
    # ------------------------------------------------------------
    def generate_bokeh_optic_nerve(
        self,
        image_bgr: np.ndarray,
        disc_mask: np.ndarray,
        cup_mask: np.ndarray,
        cdr_features: Dict[str, Any],
    ) -> str:
        """
        Creates interactive Bokeh HTML figure with zoomed optic nerve viewport,
        disc/cup contours, measurement lines, and CDR readout.
        """
        if file_html is None or figure is None or Range1d is None or CDN is None:
            return ""

        try:
            h, w = image_bgr.shape[:2]
            image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

            # Zoom into the optic nerve region
            if cdr_features.get("status") == "VALID":
                dx, dy, dw, dh = cdr_features["disc_x"], cdr_features["disc_y"], cdr_features["disc_width"], cdr_features["disc_height"]
                padding = max(dw, dh) * 0.8
                x_min = max(0, int(dx - padding))
                x_max = min(w, int(dx + dw + padding))
                y_min = max(0, int(dy - padding))
                y_max = min(h, int(dy + dh + padding))
            else:
                x_min, x_max, y_min, y_max = 0, w, 0, h

            # Crop region
            crop_rgb = image_rgb[y_min:y_max, x_min:x_max]
            crop_h, crop_w = crop_rgb.shape[:2]

            # Convert RGB array to RGBA 32-bit uint for Bokeh ImageRGBA
            rgba = np.zeros((crop_h, crop_w), dtype=np.uint32)
            view = rgba.view(dtype=np.uint8).reshape((crop_h, crop_w, 4))
            view[:, :, 0] = crop_rgb[:, :, 0]
            view[:, :, 1] = crop_rgb[:, :, 1]
            view[:, :, 2] = crop_rgb[:, :, 2]
            view[:, :, 3] = 255
            rgba_flipped = np.ascontiguousarray(np.flipud(rgba))

            p = figure(
                title="TRINAY Clinical Optic Nerve Interactive Telemetry",
                x_range=Range1d(0, crop_w),
                y_range=Range1d(0, crop_h),
                width=650,
                height=500,
                tools="pan,wheel_zoom,box_zoom,reset,save",
                toolbar_location="above",
            )
            p.image_rgba(image=[rgba_flipped], x=0, y=0, dw=crop_w, dh=crop_h)

            # Draw disc and cup contours in crop space
            disc_crop = disc_mask[y_min:y_max, x_min:x_max]
            cup_crop = cup_mask[y_min:y_max, x_min:x_max]

            disc_cnts, _ = cv2.findContours(disc_crop, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cup_cnts, _ = cv2.findContours(cup_crop, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

            for cnt in disc_cnts:
                xs = cnt[:, 0, 0].tolist()
                ys = (crop_h - cnt[:, 0, 1]).tolist()  # flip Y for Bokeh
                p.line(xs, ys, line_color="#32CD32", line_width=3, legend_label="Optic Disc Boundary")

            for cnt in cup_cnts:
                xs = cnt[:, 0, 0].tolist()
                ys = (crop_h - cnt[:, 0, 1]).tolist()
                p.line(xs, ys, line_color="#FF00FF", line_width=3, legend_label="Optic Cup Boundary")

            p.legend.location = "top_left"
            p.legend.click_policy = "hide"
            p.legend.background_fill_alpha = 0.8
            p.axis.visible = False
            p.grid.visible = False

            return file_html(p, CDN, "Optic Nerve View")
        except Exception as e:
            print("[Bokeh HTML warning]:", e)
            return ""

    # ------------------------------------------------------------
    # MAIN INFERENCE PIPELINE RUNNER
    # ------------------------------------------------------------
    def run_screening(self, image_bgr: np.ndarray, filename: str = "fundus_image.jpg") -> Dict[str, Any]:
        h_orig, w_orig = image_bgr.shape[:2]
        file_size_kb = (h_orig * w_orig * 3) / 1024.0

        # Step 1: Quality Check
        quality_res = self.assess_quality(image_bgr)
        if quality_res["status"] == "UNGRADABLE":
            return {
                "success": False,
                "pipeline": "glaucoma",
                "status": "IMAGE_QUALITY_INSUFFICIENT",
                "message": "The fundus photograph quality is ungradable. Please acquire a clear, well-focused, non-occluded retinal image.",
                "imageInfo": {
                    "filename": filename,
                    "fileSize": f"{file_size_kb:.1f} KB",
                    "resolution": f"{w_orig}x{h_orig}",
                    "width": w_orig,
                    "height": h_orig,
                },
                # Frontend-compatible quality payload (original model
                # keys preserved inside for backward compatibility).
                "quality": frontend_quality_payload(quality_res),
            }

        # Step 2: Attention U-Net Segmentation (Disc + Cup)
        tensor = self.preprocess_for_segmentation(image_bgr)
        seg_pred = self.segment_disc_cup(tensor)

        # Step 3: Extract Exact 10 Structural & CDR Features (512x512 space)
        cdr_features = self.extract_cdr_features(seg_pred)
        is_segmentation_valid = (cdr_features.get("status") == "VALID")
        seg_status = str(cdr_features.get("status", "INVALID_GEOMETRY"))

        disc_mask_512 = cdr_features.get("full_disc_mask", np.zeros((IMAGE_SIZE, IMAGE_SIZE), dtype=np.uint8))
        cup_mask_512 = cdr_features.get("cup_mask", np.zeros((IMAGE_SIZE, IMAGE_SIZE), dtype=np.uint8))

        # Step 4: Vessel Segmentation
        vessel_mask_512 = self.segment_vessels(tensor)
        vessel_pixels = int(np.sum(vessel_mask_512 > 0))
        vessel_fraction = float(vessel_pixels / (IMAGE_SIZE * IMAGE_SIZE))

        # Step 5: Glaucoma Classification & Safety Check
        # CLINICAL SAFETY ENFORCEMENT: Never pass fabricated, placeholder, or synthetic
        # features to the Random Forest classifier. If disc or cup segmentation validation
        # failed, automated classification is inhibited and reported as INCONCLUSIVE.
        if is_segmentation_valid:
            features_for_clf = {col: cdr_features[col] for col in FEATURE_COLUMNS}
            clf_result = self.classify_glaucoma(features_for_clf)
            shap_res = self.compute_shap(features_for_clf)
        else:
            features_for_clf = None
            failure_reason_map = {
                "INVALID_DISC": "Optic disc boundary could not be delineated (area < 500 px or disc absent)",
                "INVALID_CUP": "Optic cup boundary could not be delineated (cup area < 50 px)",
                "INVALID_CUP_POSITION": "Optic cup boundary violates anatomical containment (< 90% inside optic disc)",
                "INVALID_GEOMETRY": "Optic nerve head geometry could not be established from detected contours",
            }
            failure_reason = failure_reason_map.get(
                seg_status, f"Optic nerve segmentation validation failed ({seg_status})"
            )

            clf_result = {
                "prediction": 0,
                "probability": 0.0,
                "normal_probability": 0.0,
                "confidence": 0.0,
                "flagged": False,
                "status": "INCONCLUSIVE",
                "clinicalRecommendation": (
                    f"Automated glaucoma screening inconclusive: {failure_reason}. "
                    "Automated Cup-to-Disc Ratio (CDR) and structural classification cannot be computed with clinical reliability. "
                    "Comprehensive stereoscopic ophthalmoscopy, Goldmann applanation tonometry, and OCT are required."
                ),
            }
            shap_res = {
                "features": FEATURE_COLUMNS,
                "values": [0.0] * len(FEATURE_COLUMNS),
                "contributions": [0.0] * len(FEATURE_COLUMNS),
                "base_value": 0.5,
                "method": "Inhibited (Segmentation Ungradable)",
            }

        # Step 7: Grad-CAM on Segmentation Network
        gradcam_512 = self.compute_gradcam(tensor, seg_pred)

        # Step 8: Render Clinical 4-Panel Views (Coordinate Scaled)
        visualizations = self.render_clinical_panels(
            image_bgr,
            disc_mask_512,
            cup_mask_512,
            vessel_mask_512,
            gradcam_512,
            cdr_features,
        )

        # Step 9: Bokeh Interactive Optic Nerve HTML
        bokeh_html = self.generate_bokeh_optic_nerve(
            cv2.resize(image_bgr, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_AREA),
            disc_mask_512,
            cup_mask_512,
            cdr_features,
        )
        visualizations["bokeh_html"] = bokeh_html

        return {
            "success": True,
            "pipeline": "glaucoma",
            "status": "COMPLETE" if is_segmentation_valid else "SEGMENTATION_UNGRADABLE",
            "screeningStatus": "VALID_SCREENING_RESULT" if is_segmentation_valid else "INCONCLUSIVE",
            "segmentationStatus": seg_status,
            "message": (
                "Glaucoma screening completed successfully."
                if is_segmentation_valid
                else f"Optic nerve segmentation ungradable ({seg_status}). Automated classification inhibited for clinical safety."
            ),
            "imageInfo": {
                "filename": filename,
                "fileSize": f"{file_size_kb:.1f} KB",
                "resolution": f"{w_orig} × {h_orig}",
                "width": w_orig,
                "height": h_orig,
            },
            "quality": frontend_quality_payload(quality_res),
            "discCupSegmentation": {
                "status": seg_status,
                "validationStatus": seg_status,
                "isValid": is_segmentation_valid,
                "discDetected": bool(cdr_features.get("disc_detected", False)),
                "cupDetected": bool(cdr_features.get("cup_detected", False)),
                "cupInsideDisc": bool(cdr_features.get("cup_inside_disc", False)),
                "discPath": mask_to_svg_path(disc_mask_512) if is_segmentation_valid else "",
                "cupPath": mask_to_svg_path(cup_mask_512) if is_segmentation_valid else "",
                "verticalCDR": float(cdr_features.get("vertical_cdr", 0.0)) if is_segmentation_valid else 0.0,
                "horizontalCDR": float(cdr_features.get("horizontal_cdr", 0.0)) if is_segmentation_valid else 0.0,
                "areaCDR": float(cdr_features.get("area_cdr", 0.0)) if is_segmentation_valid else 0.0,
                "rimArea": int(max(0, cdr_features.get("disc_area", 0) - cdr_features.get("cup_area", 0))) if is_segmentation_valid else 0,
                "cdrFeatures": {
                    "status": seg_status,
                    "vertical_cdr": float(cdr_features.get("vertical_cdr", 0.0)) if is_segmentation_valid else 0.0,
                    "horizontal_cdr": float(cdr_features.get("horizontal_cdr", 0.0)) if is_segmentation_valid else 0.0,
                    "area_cdr": float(cdr_features.get("area_cdr", 0.0)) if is_segmentation_valid else 0.0,
                    "disc_area": int(cdr_features.get("disc_area", 0)),
                    "cup_area": int(cdr_features.get("cup_area", 0)),
                    "rim_area": int(max(0, cdr_features.get("disc_area", 0) - cdr_features.get("cup_area", 0))) if is_segmentation_valid else 0,
                    "disc_width": int(cdr_features.get("disc_width", 0)) if is_segmentation_valid else 0,
                    "disc_height": int(cdr_features.get("disc_height", 0)) if is_segmentation_valid else 0,
                    "cup_width": int(cdr_features.get("cup_width", 0)) if is_segmentation_valid else 0,
                    "cup_height": int(cdr_features.get("cup_height", 0)) if is_segmentation_valid else 0,
                    "cup_inside_ratio": float(cdr_features.get("cup_inside_ratio", 0.0)),
                },
            },
            "vesselSegmentation": {
                "detected": bool(vessel_pixels > 0),
                "pixels": vessel_pixels,
                "density": float(vessel_fraction),
            },
            "glaucoma": {
                "prediction": ("GLAUCOMA_SUSPECT" if clf_result["flagged"] else "NORMAL") if is_segmentation_valid else "INCONCLUSIVE",
                "glaucomaProbability": float(clf_result["probability"]) if is_segmentation_valid else 0.0,
                "normalProbability": float(clf_result["normal_probability"]) if is_segmentation_valid else 0.0,
                "confidence": float(clf_result["confidence"]) if is_segmentation_valid else 0.0,
                "glaucomaFlag": bool(clf_result["flagged"]) if is_segmentation_valid else False,
                "status": ("FLAGGED" if clf_result["flagged"] else "NOT FLAGGED") if is_segmentation_valid else "INCONCLUSIVE",
                "clinicalRecommendation": clf_result["clinicalRecommendation"],
                "shapImportance": {
                    col: float(shap_res["contributions"][i])
                    for i, col in enumerate(shap_res["features"])
                } if (shap_res and "contributions" in shap_res) else {},
            },
            "visualizations": {
                "original": visualizations.get("original"),
                "opticNerve": visualizations.get("optic_nerve"),
                "rim": visualizations.get("rim"),
                "retinalAnatomy": visualizations.get("vessels"),
                "gradcam": visualizations.get("gradcam"),
                "workflow": visualizations.get("combined"),
            },
            "bokehInteractiveHtml": bokeh_html,
        }


def run_glaucoma_screening(image_bgr: np.ndarray, filename: str = "fundus_image.jpg") -> Dict[str, Any]:
    """Helper entry-point for Flask ML server."""
    service = GlaucomaService.get_instance()
    return service.run_screening(image_bgr, filename=filename)
