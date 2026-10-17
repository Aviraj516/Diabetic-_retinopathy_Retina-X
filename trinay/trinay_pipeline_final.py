from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms
from ultralytics import YOLO

# ============================================================
# TRINAY FINAL CATARACT PIPELINE
#
# Model 1 : Cataract-image quality / gradability (MobileNetV3-Small)
# Model 2 : Eye detection (YOLO11n)
# Model 3 : Iris segmentation (U-Net)
# Model 4 : Pupil segmentation (U-Net)
# Model 5 : Cataract classification (EfficientNet-V2-S + CBAM)
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

TRINAY_DIR = Path(__file__).resolve().parent
if str(TRINAY_DIR) not in sys.path:
    sys.path.insert(0, str(TRINAY_DIR))

# Import CataractModel from model.py
try:
    from trinay.model import CataractModel
except ImportError:
    try:
        from model import CataractModel
    except ImportError:
        from catract_python.model import CataractModel

# ============================================================
# MODEL PATH RESOLUTION
# ============================================================

def resolve_model_path(*candidates: Path) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]

MODEL_DIR = PROJECT_ROOT / "model" / "cataract_models"
BACKUP_MODEL_DIR = PROJECT_ROOT / "catract_models"

QUALITY_MODEL_PATH = resolve_model_path(
    MODEL_DIR / "quality_model.pth",
    BACKUP_MODEL_DIR / "quality_model.pth",
    PROJECT_ROOT / "models" / "quality_model_catscreen_final.pth",
)

EYE_MODEL_PATH = resolve_model_path(
    MODEL_DIR / "eye_detector.pt",
    BACKUP_MODEL_DIR / "eye_detector.pt",
    PROJECT_ROOT / "outputs" / "eye_detection" / "yolo11n_eye-2" / "weights" / "best.pt",
)

IRIS_MODEL_PATH = resolve_model_path(
    MODEL_DIR / "iris_model.pth",
    BACKUP_MODEL_DIR / "iris_model.pth",
    PROJECT_ROOT / "models" / "iris_segmentation" / "best_iris_model_cataract.pth",
)

PUPIL_MODEL_PATH = resolve_model_path(
    MODEL_DIR / "pupil_model.pth",
    BACKUP_MODEL_DIR / "pupil_model.pth",
    PROJECT_ROOT / "models" / "pupil_segmentation" / "best_pupil_model_cataract1k.pth",
)

CATARACT_MODEL_PATH = resolve_model_path(
    MODEL_DIR / "cataract_model.pth",
    BACKUP_MODEL_DIR / "cataract_model.pth",
    PROJECT_ROOT / "models" / "best_model.pth",
)

# ============================================================
# SETTINGS & DEVICE
# ============================================================

QUALITY_THRESHOLD = 0.50
CATARACT_THRESHOLD = 0.50

EYE_CONFIDENCE = 0.45
EYE_IOU = 0.45
MAX_EYES = 2

SEG_SIZE = 224
CLS_SIZE = 224
MASK_THRESHOLD = 0.50

if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

SEG_TRANSFORM = transforms.Compose([
    transforms.Resize((SEG_SIZE, SEG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

CLS_TRANSFORM = transforms.Compose([
    transforms.Resize((CLS_SIZE, CLS_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

QUALITY_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

# ============================================================
# MODEL ARCHITECTURES
# ============================================================

class QualityFeatureModel(nn.Module):
    """
    MobileNetV3-Small feature extractor + CatScreen linear classifier.
    """
    def __init__(self, checkpoint: Dict[str, Any]):
        super().__init__()
        self.backbone = models.mobilenet_v3_small(weights=None)
        self.backbone.classifier = nn.Identity()
        self.backbone.load_state_dict(checkpoint["backbone_state_dict"])
        self.classifier_weight = nn.Parameter(
            checkpoint["classifier_weight"], requires_grad=False
        )
        self.classifier_bias = nn.Parameter(
            checkpoint["classifier_bias"], requires_grad=False
        )

    def forward(self, x):
        features = self.backbone(x)
        return F.linear(features, self.classifier_weight, self.classifier_bias)


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

    def forward(self, x):
        return self.block(x)


class UNet(nn.Module):
    def __init__(self, in_channels: int = 3, out_channels: int = 1):
        super().__init__()
        self.enc1 = DoubleConv(in_channels, 64)
        self.enc2 = DoubleConv(64, 128)
        self.enc3 = DoubleConv(128, 256)
        self.enc4 = DoubleConv(256, 512)
        self.bottleneck = DoubleConv(512, 1024)
        self.pool = nn.MaxPool2d(2, 2)
        self.up4 = nn.ConvTranspose2d(1024, 512, 2, stride=2)
        self.dec4 = DoubleConv(1024, 512)
        self.up3 = nn.ConvTranspose2d(512, 256, 2, stride=2)
        self.dec3 = DoubleConv(512, 256)
        self.up2 = nn.ConvTranspose2d(256, 128, 2, stride=2)
        self.dec2 = DoubleConv(256, 128)
        self.up1 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.dec1 = DoubleConv(128, 64)
        self.final = nn.Conv2d(64, out_channels, 1)

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        b = self.bottleneck(self.pool(e4))
        d4 = self.dec4(torch.cat([self.up4(b), e4], dim=1))
        d3 = self.dec3(torch.cat([self.up3(d4), e3], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))
        return self.final(d1)

# ============================================================
# HELPERS
# ============================================================

def load_checkpoint_state(path: Path) -> Dict[str, Any]:
    checkpoint = torch.load(path, map_location="cpu")
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        return checkpoint["model_state_dict"]
    return checkpoint


def largest_component(mask: np.ndarray) -> np.ndarray:
    mask_u8 = (mask > 0).astype(np.uint8)
    if mask_u8.sum() == 0:
        return mask_u8.astype(bool)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask_u8, connectivity=8
    )
    if num_labels <= 1:
        return mask_u8.astype(bool)

    largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    return labels == largest_label


def crop_box(image: np.ndarray, box: List[int]) -> np.ndarray:
    x1, y1, x2, y2 = box
    h, w = image.shape[:2]
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(x1 + 1, min(x2, w))
    y2 = max(y1 + 1, min(y2, h))
    return image[y1:y2, x1:x2].copy()

# ============================================================
# MAIN TRINAY PIPELINE CLASS
# ============================================================

class TrinayPipeline:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = TrinayPipeline()
        return cls._instance

    def __init__(self):
        print(f"[TRINAY Pipeline] Device: {DEVICE}")

        # 1. Quality Model
        print(f"[TRINAY] Loading Model 1: Quality from {QUALITY_MODEL_PATH.name}...")
        q_ckpt = torch.load(QUALITY_MODEL_PATH, map_location="cpu")
        self.quality_model = QualityFeatureModel(q_ckpt).to(DEVICE)
        self.quality_model.eval()

        # 2. Eye Detector
        print(f"[TRINAY] Loading Model 2: Eye Detector from {EYE_MODEL_PATH.name}...")
        self.eye_detector = YOLO(str(EYE_MODEL_PATH))

        # 3. Iris Model
        print(f"[TRINAY] Loading Model 3: Iris UNet from {IRIS_MODEL_PATH.name}...")
        self.iris_model = UNet(in_channels=3, out_channels=1).to(DEVICE)
        iris_ckpt = torch.load(IRIS_MODEL_PATH, map_location="cpu")
        self.iris_model.load_state_dict(
            iris_ckpt["model_state_dict"] if isinstance(iris_ckpt, dict) and "model_state_dict" in iris_ckpt else iris_ckpt
        )
        self.iris_model.eval()

        # 4. Pupil Model
        print(f"[TRINAY] Loading Model 4: Pupil UNet from {PUPIL_MODEL_PATH.name}...")
        self.pupil_model = UNet(in_channels=3, out_channels=1).to(DEVICE)
        pupil_ckpt = torch.load(PUPIL_MODEL_PATH, map_location="cpu")
        self.pupil_model.load_state_dict(
            pupil_ckpt["model_state_dict"] if isinstance(pupil_ckpt, dict) and "model_state_dict" in pupil_ckpt else pupil_ckpt
        )
        self.pupil_model.eval()

        # 5. Cataract Classifier
        print(f"[TRINAY] Loading Model 5: Cataract Classifier from {CATARACT_MODEL_PATH.name}...")
        self.cataract_model = CataractModel().to(DEVICE)
        cat_ckpt = torch.load(CATARACT_MODEL_PATH, map_location="cpu")
        self.cataract_model.load_state_dict(
            cat_ckpt["model_state_dict"] if isinstance(cat_ckpt, dict) and "model_state_dict" in cat_ckpt else cat_ckpt
        )
        self.cataract_model.eval()

        print("[TRINAY Pipeline] All 5 models initialized successfully.")

    # Expose cataract_preprocess for Grad-CAM compatibility
    def cataract_preprocess(self, eye_bgr: np.ndarray) -> torch.Tensor:
        rgb = cv2.cvtColor(eye_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        return CLS_TRANSFORM(pil).unsqueeze(0).to(DEVICE)

    # --------------------------------------------------------
    # 1. QUALITY CHECK
    # --------------------------------------------------------
    def quality_gate(self, image_bgr: np.ndarray) -> Dict[str, Any]:
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(image_rgb)
        tensor = QUALITY_TRANSFORM(pil).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            logit = self.quality_model(tensor)
            good_probability = float(torch.sigmoid(logit).item())

        bad_probability = float(1.0 - good_probability)
        is_good = good_probability >= QUALITY_THRESHOLD

        return {
            "status": "GOOD" if is_good else "RETAKE_IMAGE",
            "is_good": is_good,
            "good_probability": good_probability,
            "bad_probability": bad_probability,
            "threshold": QUALITY_THRESHOLD,
        }

    # --------------------------------------------------------
    # 2. EYE DETECTION
    # --------------------------------------------------------
    def detect_eyes(self, image_bgr: np.ndarray) -> List[Dict[str, Any]]:
        results = self.eye_detector.predict(
            source=image_bgr,
            imgsz=640,
            conf=EYE_CONFIDENCE,
            iou=EYE_IOU,
            max_det=MAX_EYES,
            device=str(DEVICE),
            verbose=False,
        )

        if not results:
            return []

        result = results[0]
        if result.boxes is None or len(result.boxes) == 0:
            return []

        boxes = result.boxes.xyxy.detach().cpu().numpy()
        confidences = result.boxes.conf.detach().cpu().numpy()
        class_ids = result.boxes.cls.detach().cpu().numpy().astype(int)

        detections = []
        for box, conf, cls_id in zip(boxes, confidences, class_ids):
            x1, y1, x2, y2 = np.round(box).astype(int).tolist()
            detections.append({
                "box": [x1, y1, x2, y2],
                "confidence": float(conf),
                "class_id": int(cls_id),
            })

        return detections

    # --------------------------------------------------------
    # 3 & 4. SEGMENTATION (IRIS & PUPIL)
    # --------------------------------------------------------
    def segment(self, model: nn.Module, eye_bgr: np.ndarray) -> np.ndarray:
        rgb = cv2.cvtColor(eye_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        tensor = SEG_TRANSFORM(pil).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            output = model(tensor)
            if isinstance(output, (tuple, list)):
                output = output[0]
            if output.ndim == 3:
                output = output.unsqueeze(1)

            probability = torch.sigmoid(output[:, 0:1])
            probability = F.interpolate(
                probability,
                size=eye_bgr.shape[:2],
                mode="bilinear",
                align_corners=False,
            )
            mask = (probability[0, 0].cpu().numpy() >= MASK_THRESHOLD)

        return largest_component(mask)

    # --------------------------------------------------------
    # 5. CATARACT CLASSIFICATION
    # --------------------------------------------------------
    def classify_cataract(self, eye_bgr: np.ndarray) -> Dict[str, Any]:
        rgb = cv2.cvtColor(eye_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        tensor = CLS_TRANSFORM(pil).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            output = self.cataract_model(tensor)
            if isinstance(output, (tuple, list)):
                output = output[0]
            logit = output.squeeze()
            cataract_probability = float(torch.sigmoid(logit).item())

        prediction = (
            "CATARACT" if cataract_probability >= CATARACT_THRESHOLD else "NORMAL"
        )

        return {
            "prediction": prediction,
            "cataract_probability": cataract_probability,
            "normal_probability": float(1.0 - cataract_probability),
            "threshold": CATARACT_THRESHOLD,
        }

    # --------------------------------------------------------
    # COMPLETE END-TO-END PIPELINE
    # --------------------------------------------------------
    def predict(self, image_input: str | Path | np.ndarray) -> Dict[str, Any]:
        if isinstance(image_input, (str, Path)):
            image_path = Path(image_input)
            if not image_path.exists():
                raise FileNotFoundError(f"Image not found: {image_path}")
            image_bgr = cv2.imread(str(image_path))
            if image_bgr is None:
                raise ValueError(f"Could not read image: {image_path}")
            image_name = str(image_path.name)
        else:
            image_bgr = image_input
            image_name = "uploaded_eye.jpg"

        h, w = image_bgr.shape[:2]

        # Stage 1: Quality Gate
        quality = self.quality_gate(image_bgr)
        result: Dict[str, Any] = {
            "imageName": image_name,
            "resolution": f"{w} × {h}",
            "width": w,
            "height": h,
            "device": str(DEVICE),
            "status": quality["status"],
            "quality": quality,
            "eyes": [],
        }

        if not quality["is_good"]:
            result["status"] = "IMAGE_QUALITY_INSUFFICIENT"
            result["message"] = "Image quality is insufficient. Please retake or upload a clearer eye image."
            return result

        # Stage 2: Eye Detection
        detections = self.detect_eyes(image_bgr)
        if not detections:
            # Fallback: if YOLO misses on a tightly cropped eye image, treat whole image as eye ROI
            detections = [{
                "box": [0, 0, w, h],
                "confidence": 0.85,
                "class_id": 0,
                "fallback": True,
            }]

        for eye_index, detection in enumerate(detections):
            x1, y1, x2, y2 = detection["box"]
            pad_x = int(0.03 * (x2 - x1))
            pad_y = int(0.03 * (y2 - y1))

            x1p = max(0, x1 - pad_x)
            y1p = max(0, y1 - pad_y)
            x2p = min(w, x2 + pad_x)
            y2p = min(h, y2 + pad_y)

            eye_box = [x1p, y1p, x2p, y2p]
            eye_roi = crop_box(image_bgr, eye_box)

            # Stage 3: Iris Segmentation
            raw_iris_mask = self.segment(self.iris_model, eye_roi)

            # Stage 4: Pupil Segmentation
            raw_pupil_mask = self.segment(self.pupil_model, eye_roi)

            # Refine anatomical boundaries with geometric constraints & dark-pupil fallback
            try:
                from trinay.anatomy_refinement import refine_anatomy
                refined = refine_anatomy(eye_roi, raw_iris_mask, raw_pupil_mask)
                iris_mask = refined["iris_mask"]
                pupil_mask = refined["pupil_mask"]
                iris_source = refined.get("iris_source", "MODEL")
                pupil_source = refined.get("pupil_source", "MODEL")
            except Exception:
                iris_mask = raw_iris_mask
                pupil_mask = raw_pupil_mask
                iris_source = "MODEL"
                pupil_source = "MODEL"

            # Stage 5: Cataract Classification
            cataract = self.classify_cataract(eye_roi)

            result["eyes"].append({
                "index": eye_index,
                "detection": detection,
                "roi_box": eye_box,
                "roi_width": int(eye_roi.shape[1]),
                "roi_height": int(eye_roi.shape[0]),
                "iris_area": int(iris_mask.sum()),
                "pupil_area": int(pupil_mask.sum()),
                "iris_source": iris_source,
                "pupil_source": pupil_source,
                "cataract": cataract,
                "_roi_bgr": eye_roi,
                "_iris_mask": iris_mask,
                "_pupil_mask": pupil_mask,
            })

        result["status"] = "COMPLETE"
        return result
