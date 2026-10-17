"""
TRINAY — Cataract Screening Workflow Visualization (v2)
=========================================================

What's new vs. the original script
-----------------------------------
1. Grad-CAM overlay for the PyTorch U-Net-based cataract classifier (Model 5),
   showing WHERE the model is looking when it says "cataract" / "normal".
2. Iris + Pupil segmentation is now ONE clean panel instead of two redundant
   ones — softer glow-style boundaries, a small on-image legend, and measured
   diameters (in px) so a viewer instantly understands what they're seeing.
3. A dedicated "Result" panel — big colored verdict banner + probability
   bars — instead of burying the number in a caption.
4. 2x3 grid, 6 panels total (down from 6 confusing/overlapping ones):
      1. Original Eye Image
      2. Model 1 — Image Quality
      3. Model 2 — Eye Detection
      4. Models 3 & 4 — Iris & Pupil Segmentation
      5. Model 5 — Grad-CAM (explainability)
      6. Model 5 — Cataract Classification Result

GRAD-CAM WIRING — READ THIS
-----------------------------
Grad-CAM needs direct access to your PyTorch model + its preprocessing.
This script assumes:

    pipeline.cataract_model          -> torch.nn.Module (eval mode)
    pipeline.cataract_preprocess(roi_bgr) -> torch.Tensor of shape [1, C, H, W]

If your `TrinayPipeline` exposes these under different names, just edit
`get_cataract_model_and_input()` below — everything else works unchanged.
The Grad-CAM class auto-picks the LAST nn.Conv2d layer in the model as the
target layer (the usual choice for a classification head). If your U-Net's
classification head branches off an earlier encoder block, pass an explicit
`target_layer` to `GradCAM(...)` instead — see TARGET_LAYER_NAME below.
"""

from pathlib import Path
import argparse

import cv2
import numpy as np
import torch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec

from pipeline.trinay_pipeline_final import TrinayPipeline


# ============================================================
# CONFIG — edit these two if your pipeline's attribute names differ
# ============================================================

CATARACT_MODEL_ATTR = "cataract_model"
CATARACT_PREPROCESS_ATTR = "cataract_preprocess"

# Set to a specific nn.Module (e.g. pipeline.cataract_model.encoder.block4)
# if you don't want Grad-CAM auto-picking the last Conv2d layer.
TARGET_LAYER_NAME = None


# ============================================================
# COLORS — BGR (Green for Iris, Cyan for Pupil, Orange for Eye Box)
# ============================================================

IRIS_COLOR = (50, 205, 50)       # Green (Limbic Iris boundary)
PUPIL_COLOR = (255, 255, 0)      # Cyan (Pupil aperture boundary)
EYE_BOX_COLOR = (0, 140, 255)    # Orange (Eye detection box)
RESULT_BAD_COLOR = (70, 70, 235)    # Red (Cataract)
RESULT_GOOD_COLOR = (50, 205, 50)   # Green (Normal)

PANEL_BG = "#0f0f12"
CARD_BG = "#191922"
TEXT_MAIN = "#f2f2f2"
TEXT_SUB = "#a8a8b3"


# ============================================================
# IMAGE HELPERS
# ============================================================

def bgr_to_rgb(image):
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def overlay_mask(image_bgr, mask, color, alpha=0.20):
    output = image_bgr.copy()
    if mask is None:
        return output
    mask = mask.astype(bool)
    if not np.any(mask):
        return output
    color_arr = np.zeros_like(output)
    color_arr[:, :] = color
    output[mask] = (
        output[mask].astype(np.float32) * (1 - alpha)
        + color_arr[mask].astype(np.float32) * alpha
    ).astype(np.uint8)
    return output


def get_smooth_contour(mask, is_pupil=False):
    """
    Extracts the true segmented anatomical boundary from the model mask,
    cleans minor pixel artifacts, and returns the natural smoothed contour
    (without forcing synthetic geometric circles or ellipses).
    """
    if mask is None or mask.sum() == 0:
        return None, None, None
    
    mask_u8 = (mask.astype(np.uint8) * 255)
    
    # Clean small reflection glints / pinholes while preserving genuine boundary curvature
    kernel_size = 5 if is_pupil else 7
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, kernel)
    closed = cv2.morphologyEx(closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_L1)
    if not contours:
        return None, None, None
    
    c = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(c)
    if area <= 20:
        return None, None, None
    
    # Calculate moments for true anatomical center
    M = cv2.moments(c)
    if M["m00"] > 0:
        cx = int(round(M["m10"] / M["m00"]))
        cy = int(round(M["m01"] / M["m00"]))
    else:
        ys, xs = np.where(mask)
        cx, cy = int(xs.mean()), int(ys.mean())
    
    # Equivalent anatomical diameter based on segmented area: 2 * sqrt(area / pi)
    equivalent_diameter = 2.0 * np.sqrt(area / np.pi)
    
    # Smooth contour using mild polygon approximation to eliminate staircasing
    peri = cv2.arcLength(c, True)
    epsilon = 0.003 * peri
    smoothed_contour = cv2.approxPolyDP(c, epsilon, True)
    
    return smoothed_contour, (cx, cy), float(equivalent_diameter)


def largest_contour(mask):
    pts, _, _ = get_smooth_contour(mask)
    return pts


def draw_glow_boundary(image_bgr, mask, color, thickness=3, is_pupil=False):
    """
    Soft "glow" boundary: a faint wide pass underneath a crisp thin pass,
    using smooth anatomical contours without jagged pixel artifacts.
    """
    output = image_bgr.copy()
    contour, _, _ = get_smooth_contour(mask, is_pupil=is_pupil)
    if contour is None:
        return output

    glow = output.copy()
    cv2.drawContours(glow, [contour], -1, color, thickness + 4, cv2.LINE_AA)
    output = cv2.addWeighted(glow, 0.38, output, 0.62, 0)

    cv2.drawContours(output, [contour], -1, color, thickness, cv2.LINE_AA)
    return output


def mask_diameter_and_center(mask, is_pupil=False):
    _, center, diameter = get_smooth_contour(mask, is_pupil=is_pupil)
    return diameter, center


def draw_eye_box(image_bgr, box, confidence):
    output = image_bgr.copy()
    x1, y1, x2, y2 = [int(v) for v in box]

    cv2.rectangle(output, (x1, y1), (x2, y2), EYE_BOX_COLOR, 5)

    label = f"Eye  {confidence:.2f}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale, thick = 0.65, 2
    (tw, th), _ = cv2.getTextSize(label, font, font_scale, thick)

    label_y1 = max(0, y1 - th - 14)
    cv2.rectangle(output, (x1, label_y1), (x1 + tw + 12, y1), EYE_BOX_COLOR, -1)
    cv2.putText(output, label, (x1 + 6, y1 - 7), font, font_scale, (0, 0, 0), thick, cv2.LINE_AA)

    return output


def draw_anatomy_panel(image_bgr, iris_mask, pupil_mask):
    """
    ONE panel for iris + pupil — smooth glow boundaries, filled tint, on-image
    legend, and measured diameters so it's self-explanatory at a glance.
    """
    output = image_bgr.copy()
    output = overlay_mask(output, iris_mask, IRIS_COLOR, alpha=0.16)
    output = overlay_mask(output, pupil_mask, PUPIL_COLOR, alpha=0.24)
    output = draw_glow_boundary(output, iris_mask, IRIS_COLOR, thickness=3, is_pupil=False)
    output = draw_glow_boundary(output, pupil_mask, PUPIL_COLOR, thickness=3, is_pupil=True)

    iris_d, iris_c = mask_diameter_and_center(iris_mask, is_pupil=False)
    pupil_d, pupil_c = mask_diameter_and_center(pupil_mask, is_pupil=True)

    if pupil_c is not None:
        cv2.drawMarker(output, pupil_c, (255, 255, 255), cv2.MARKER_CROSS, 16, 2, cv2.LINE_AA)

    # --- on-image legend, top-left corner ---
    pad = 10
    swatch = 14
    line_h = 24
    rows = [
        ("Iris", IRIS_COLOR, f"Dia: {iris_d:.0f}px" if iris_d else "n/a"),
        ("Pupil", PUPIL_COLOR, f"Dia: {pupil_d:.0f}px" if pupil_d else "n/a"),
    ]
    box_w = 190
    box_h = pad * 2 + line_h * len(rows)
    legend_bg = output[pad:pad + box_h, pad:pad + box_w].copy()
    dark = (legend_bg.astype(np.float32) * 0.25).astype(np.uint8)
    output[pad:pad + box_h, pad:pad + box_w] = dark

    for i, (name, color, meas) in enumerate(rows):
        cy = pad + line_h * i + line_h // 2
        cv2.circle(output, (pad + 10, cy), swatch // 2, color, -1, cv2.LINE_AA)
        cv2.putText(output, f"{name}  {meas}", (pad + 26, cy + 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    if iris_d and pupil_d:
        ratio_txt = f"Pupil/Iris ratio: {pupil_d / iris_d:.2f}"
        cv2.putText(output, ratio_txt, (pad, box_h + pad + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1, cv2.LINE_AA)

    return output


# ============================================================
# GRAD-CAM (PyTorch)
# ============================================================

class GradCAM:
    """
    Standard Grad-CAM: hooks the target conv layer's forward activations
    and backward gradients, weights channels by their gradient-average
    ("how much did this channel push the predicted score"), and produces
    a coarse heatmap over the input.
    """

    def __init__(self, model, target_layer=None):
        self.model = model
        self.gradients = None
        self.activations = None
        self.target_layer = target_layer or self._find_last_conv(model)
        self._fwd_handle = self.target_layer.register_forward_hook(self._save_activation)
        self._bwd_handle = self.target_layer.register_full_backward_hook(self._save_gradient)

    @staticmethod
    def _find_last_conv(model):
        last = None
        for module in model.modules():
            if isinstance(module, torch.nn.Conv2d):
                last = module
        if last is None:
            raise ValueError(
                "No nn.Conv2d layer found for Grad-CAM. "
                "Pass target_layer=<your_module> explicitly."
            )
        return last

    def _save_activation(self, module, inp, out):
        self.activations = out.detach()

    def _save_gradient(self, module, grad_in, grad_out):
        self.gradients = grad_out[0].detach()

    def __call__(self, input_tensor, class_idx=None):
        self.model.zero_grad(set_to_none=True)
        output = self.model(input_tensor)

        if output.ndim == 1:
            output = output.unsqueeze(0)

        if output.shape[1] == 1:
            score = output[:, 0]          # single-logit / sigmoid head
        else:
            if class_idx is None:
                class_idx = int(torch.argmax(output, dim=1).item())
            score = output[:, class_idx]  # softmax head

        score.sum().backward(retain_graph=False)

        weights = self.gradients.mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((weights * self.activations).sum(dim=1, keepdim=True))
        cam = cam.squeeze().cpu().numpy().astype(np.float32)

        if cam.max() > 1e-8:
            cam = cam / cam.max()
        return cam

    def remove_hooks(self):
        self._fwd_handle.remove()
        self._bwd_handle.remove()


def make_gradcam_overlay(eye_roi_bgr, cam, alpha=0.48):
    """
    Renders a perceptual Turbo Grad-CAM heatmap with adaptive alpha attenuation
    so low activations remain crystal clear while high feature areas glow.
    """
    h, w = eye_roi_bgr.shape[:2]
    cam_resized = cv2.resize(cam, (w, h), interpolation=cv2.INTER_CUBIC)
    cam_resized = np.clip(cam_resized, 0, 1)
    
    # Smooth with Gaussian filter for continuous gradient
    cam_smoothed = cv2.GaussianBlur(cam_resized, (11, 11), 0)
    heatmap = cv2.applyColorMap((cam_smoothed * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    
    # Adaptive alpha mask: preserve background eye structure on low activation
    alpha_mask = np.clip((cam_smoothed - 0.10) / 0.90, 0, 1)[:, :, np.newaxis]
    blended = (heatmap.astype(np.float32) * (alpha * alpha_mask) + 
               eye_roi_bgr.astype(np.float32) * (1.0 - alpha * alpha_mask)).astype(np.uint8)
    return blended


def get_cataract_model_and_input(pipeline, eye_roi_bgr):
    """
    Pulls the PyTorch model + a ready input tensor out of the pipeline.
    Edit this if your TrinayPipeline names things differently.
    """
    model = getattr(pipeline, CATARACT_MODEL_ATTR, None)
    preprocess = getattr(pipeline, CATARACT_PREPROCESS_ATTR, None)

    if model is None or preprocess is None:
        raise AttributeError(
            f"Could not find `{CATARACT_MODEL_ATTR}` / `{CATARACT_PREPROCESS_ATTR}` "
            "on the pipeline object. Edit CATARACT_MODEL_ATTR / "
            "CATARACT_PREPROCESS_ATTR at the top of this file, or edit "
            "get_cataract_model_and_input() directly to match your class."
        )

    model.eval()
    input_tensor = preprocess(eye_roi_bgr)
    input_tensor.requires_grad_(True)
    return model, input_tensor


# ============================================================
# PANEL IMAGE NORMALIZATION
# ============================================================

def prepare_panel_image(image_bgr, target_width=900, target_height=620):
    if image_bgr is None:
        raise ValueError("Panel image is None.")
    h, w = image_bgr.shape[:2]
    if h == 0 or w == 0:
        raise ValueError("Invalid panel image dimensions.")

    scale = min(target_width / w, target_height / h)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))

    resized = cv2.resize(image_bgr, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    canvas = np.zeros((target_height, target_width, 3), dtype=np.uint8)
    x_off = (target_width - new_w) // 2
    y_off = (target_height - new_h) // 2
    canvas[y_off:y_off + new_h, x_off:x_off + new_w] = resized
    return canvas


def show_image_panel(ax, image_bgr, title, subtitle=None):
    prepared = prepare_panel_image(image_bgr)
    ax.imshow(bgr_to_rgb(prepared))
    ax.set_title(title, fontsize=15, fontweight="bold", color=TEXT_MAIN, pad=10)
    if subtitle:
        ax.text(0.5, -0.055, subtitle, transform=ax.transAxes, ha="center", va="top",
                 fontsize=10.5, color=TEXT_SUB)
    ax.axis("off")


def show_result_panel(ax, prediction, cataract_prob, normal_prob):
    """
    A clean verdict card instead of burying the result in a caption:
    big colored banner + two probability bars.
    """
    is_cataract = prediction.strip().lower().startswith("cataract")
    banner_color = RESULT_BAD_COLOR if is_cataract else RESULT_GOOD_COLOR
    banner_color_mpl = tuple(c / 255 for c in banner_color[::-1])  # BGR -> RGB

    ax.set_facecolor(CARD_BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    ax.add_patch(plt.Rectangle((0.04, 0.62), 0.92, 0.28, color=banner_color_mpl, ec="none"))
    ax.text(0.5, 0.76, prediction.upper(), ha="center", va="center",
             fontsize=22, fontweight="bold", color="white")

    bars = [("Cataract", cataract_prob, RESULT_BAD_COLOR),
            ("Normal", normal_prob, RESULT_GOOD_COLOR)]

    for i, (label, prob, color) in enumerate(bars):
        y = 0.42 - i * 0.20
        color_mpl = tuple(c / 255 for c in color[::-1])
        ax.text(0.06, y + 0.05, f"{label}", fontsize=12, color=TEXT_MAIN, fontweight="bold")
        ax.text(0.94, y + 0.05, f"{prob * 100:.1f}%", fontsize=12, color=TEXT_MAIN,
                 ha="right", fontweight="bold")
        ax.add_patch(plt.Rectangle((0.06, y), 0.88, 0.06, color="#2c2c36", ec="none"))
        ax.add_patch(plt.Rectangle((0.06, y), 0.88 * prob, 0.06, color=color_mpl, ec="none"))

    ax.set_title("6. Model 5 — Cataract Classification", fontsize=15,
                  fontweight="bold", color=TEXT_MAIN, pad=10)


# ============================================================
# MAIN VISUALIZATION
# ============================================================

def create_workflow_visualization(image_path: Path, output_path: Path, eye_index: int = 0):

    print("=" * 80)
    print("TRINAY — WORKFLOW VISUALIZATION (v2, with Grad-CAM)")
    print("=" * 80)
    print(f"Input: {image_path}")

    if not image_path.exists():
        raise FileNotFoundError(f"Image does not exist:\n{image_path}")

    original_bgr = cv2.imread(str(image_path))
    if original_bgr is None:
        raise ValueError(f"Could not read image:\n{image_path}")

    pipeline = TrinayPipeline()
    print("\nRunning complete TRINAY pipeline...")
    result = pipeline.predict(image_path)
    print("\nPipeline status:", result["status"])

    quality = result["quality"]
    quality_status = quality["status"]
    good_probability = quality.get("good_probability")
    bad_probability = quality.get("bad_probability")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # --------------------------------------------------------
    # NO EYE DETECTED
    # --------------------------------------------------------
    if not result["eyes"]:
        print("No eye detected.")
        fig = plt.figure(figsize=(14, 7), facecolor=PANEL_BG)
        ax1 = fig.add_subplot(1, 2, 1)
        ax2 = fig.add_subplot(1, 2, 2)
        show_image_panel(ax1, original_bgr, "1. Original Eye Image")
        show_image_panel(ax2, original_bgr,
                          "2. Model 1 — Image Quality",
                          f"{quality_status}  |  GOOD {good_probability:.3f}")
        plt.tight_layout()
        plt.savefig(output_path, dpi=180, facecolor=PANEL_BG, bbox_inches="tight")
        plt.close()
        return

    if eye_index >= len(result["eyes"]):
        raise IndexError(f"eye_index={eye_index}, but only {len(result['eyes'])} eye(s) detected.")

    eye = result["eyes"][eye_index]
    detection = eye["detection"]
    eye_roi = eye["_roi_bgr"]
    iris_mask = eye["_iris_mask"]
    pupil_mask = eye["_pupil_mask"]

    cataract = eye["cataract"]
    prediction = cataract["prediction"]
    cataract_probability = cataract["cataract_probability"]
    normal_probability = cataract["normal_probability"]

    # --------------------------------------------------------
    # PANEL IMAGES
    # --------------------------------------------------------
    eye_detection_panel = draw_eye_box(original_bgr, detection["box"], detection["confidence"])
    anatomy_panel = draw_anatomy_panel(eye_roi, iris_mask, pupil_mask)

    try:
        model, input_tensor = get_cataract_model_and_input(pipeline, eye_roi)
        gradcam = GradCAM(model, target_layer=TARGET_LAYER_NAME)
        cam = gradcam(input_tensor)
        gradcam.remove_hooks()
        gradcam_panel = make_gradcam_overlay(eye_roi, cam)
        gradcam_ok = True
    except Exception as exc:  # noqa: BLE001 — surface the reason on the panel itself
        print(f"[Grad-CAM] skipped: {exc}")
        gradcam_panel = eye_roi.copy()
        gradcam_ok = False

    # --------------------------------------------------------
    # FIGURE
    # --------------------------------------------------------
    fig = plt.figure(figsize=(18, 12), facecolor=PANEL_BG)
    grid = GridSpec(2, 3, figure=fig, hspace=0.26, wspace=0.05,
                     top=0.90, bottom=0.08, left=0.025, right=0.975)

    show_image_panel(fig.add_subplot(grid[0, 0]), original_bgr, "1. Original Eye Image")

    show_image_panel(fig.add_subplot(grid[0, 1]), original_bgr,
                      "2. Model 1 — Image Quality",
                      f"{quality_status}  •  GOOD {good_probability:.3f}  •  BAD {bad_probability:.3f}")

    show_image_panel(fig.add_subplot(grid[0, 2]), eye_detection_panel,
                      "3. Model 2 — Eye Detection",
                      f"Confidence: {detection['confidence']:.3f}")

    show_image_panel(fig.add_subplot(grid[1, 0]), anatomy_panel,
                      "4. Models 3 & 4 — Iris & Pupil Segmentation",
                      "Teal = iris   •   Amber = pupil")

    gradcam_subtitle = "Warmer = more influence on the model's decision" if gradcam_ok \
        else "Grad-CAM unavailable — see console for details"
    show_image_panel(fig.add_subplot(grid[1, 1]), gradcam_panel,
                      "5. Model 5 — Grad-CAM", gradcam_subtitle)

    show_result_panel(fig.add_subplot(grid[1, 2]), prediction, cataract_probability, normal_probability)

    fig.suptitle("TRINAY — AI Cataract Screening Workflow", fontsize=25,
                  fontweight="bold", color=TEXT_MAIN, y=0.965)

    fig.text(0.5, 0.035,
              "Grad-CAM highlights image regions that most influenced the cataract "
              "classification. Anatomical boundaries are visualization references.",
              ha="center", fontsize=9.5, color=TEXT_SUB)

    plt.savefig(output_path, dpi=200, facecolor=PANEL_BG, bbox_inches="tight")
    plt.close()

    print("\n" + "=" * 80)
    print("VISUALIZATION COMPLETE")
    print("=" * 80)
    print(f"Output: {output_path}")
    print(f"Prediction: {prediction}")
    print(f"Cataract probability: {cataract_probability:.4f}")
    print(f"Normal probability: {normal_probability:.4f}")
    print(f"Grad-CAM generated: {gradcam_ok}")


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="TRINAY workflow visualization (v2, Grad-CAM)")
    parser.add_argument("image", type=str, help="Path to input eye image")
    parser.add_argument("--output", type=str, default="outputs/trinay_workflow_v2.png",
                         help="Output visualization path")
    parser.add_argument("--eye-index", type=int, default=0,
                         help="Eye index when multiple eyes are detected")
    args = parser.parse_args()

    create_workflow_visualization(Path(args.image), Path(args.output), args.eye_index)


if __name__ == "__main__":
    main()