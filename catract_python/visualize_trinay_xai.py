from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image

import torch


# ============================================================
# IMPORT FINAL TRINAY PIPELINE
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


from pipeline.trinay_pipeline_final import (
    TrinayPipeline,
    DEVICE,
    CLS_TRANSFORM,
)


# ============================================================
# GRAD-CAM
# ============================================================

class GradCAM:

    def __init__(
        self,
        model,
        target_layer,
    ):

        self.model = model
        self.target_layer = target_layer

        self.activations = None
        self.gradients = None

        self.forward_handle = (
            target_layer.register_forward_hook(
                self._save_activation
            )
        )

        self.backward_handle = (
            target_layer.register_full_backward_hook(
                self._save_gradient
            )
        )

    def _save_activation(
        self,
        module,
        inputs,
        output,
    ):

        self.activations = output

    def _save_gradient(
        self,
        module,
        grad_input,
        grad_output,
    ):

        self.gradients = grad_output[0]

    def remove(self):

        self.forward_handle.remove()
        self.backward_handle.remove()

    def generate(
        self,
        input_tensor,
    ):

        self.model.zero_grad(
            set_to_none=True
        )

        output = self.model(
            input_tensor
        )

        if isinstance(
            output,
            (tuple, list),
        ):
            output = output[0]

        score = output.squeeze()

        score.backward()

        activations = self.activations
        gradients = self.gradients

        if activations is None or gradients is None:
            raise RuntimeError(
                "Grad-CAM hooks did not capture "
                "activations/gradients."
            )

        weights = gradients.mean(
            dim=(2, 3),
            keepdim=True,
        )

        cam = (
            weights * activations
        ).sum(
            dim=1,
            keepdim=True,
        )

        cam = torch.relu(cam)

        cam = torch.nn.functional.interpolate(
            cam,
            size=input_tensor.shape[-2:],
            mode="bilinear",
            align_corners=False,
        )

        cam = cam[0, 0].detach().cpu().numpy()

        cam -= cam.min()

        max_value = cam.max()

        if max_value > 1e-8:
            cam /= max_value

        return cam


# ============================================================
# IMAGE HELPERS
# ============================================================

def bgr_to_rgb(image):
    return cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB,
    )


def overlay_mask(
    image_bgr,
    mask,
    color,
    alpha=0.35,
):

    result = image_bgr.copy()

    if mask.sum() == 0:
        return result

    color_array = np.zeros_like(
        image_bgr
    )

    color_array[:, :] = color

    result[mask] = (
        (1 - alpha) * result[mask]
        + alpha * color_array[mask]
    ).astype(np.uint8)

    return result


def overlay_heatmap(
    image_bgr,
    cam,
    alpha=0.42,
):

    cam_uint8 = np.uint8(
        np.clip(cam, 0, 1) * 255
    )

    heatmap = cv2.applyColorMap(
        cam_uint8,
        cv2.COLORMAP_JET,
    )

    heatmap = cv2.resize(
        heatmap,
        (
            image_bgr.shape[1],
            image_bgr.shape[0],
        ),
    )

    return cv2.addWeighted(
        image_bgr,
        1 - alpha,
        heatmap,
        alpha,
        0,
    )


def draw_box(
    image_bgr,
    box,
    label,
):

    output = image_bgr.copy()

    x1, y1, x2, y2 = box

    cv2.rectangle(
        output,
        (x1, y1),
        (x2, y2),
        (255, 180, 0),
        3,
    )

    cv2.rectangle(
        output,
        (x1, max(0, y1 - 32)),
        (x1 + max(150, len(label) * 9), y1),
        (255, 180, 0),
        -1,
    )

    cv2.putText(
        output,
        label,
        (x1 + 7, max(20, y1 - 9)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 0, 0),
        2,
        cv2.LINE_AA,
    )

    return output


def contour_overlay(
    image_bgr,
    mask,
    color,
    thickness=3,
):

    output = image_bgr.copy()

    contours, _ = cv2.findContours(
        mask.astype(np.uint8),
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    cv2.drawContours(
        output,
        contours,
        -1,
        color,
        thickness,
    )

    if mask.sum() > 0:

        moments = cv2.moments(
            mask.astype(np.uint8)
        )

        if moments["m00"] > 0:

            cx = int(
                moments["m10"]
                / moments["m00"]
            )

            cy = int(
                moments["m01"]
                / moments["m00"]
            )

            cv2.circle(
                output,
                (cx, cy),
                5,
                color,
                -1,
            )

    return output


# ============================================================
# MAIN VISUALIZATION
# ============================================================

def create_visualization(
    image_path: Path,
    output_path: Path,
    eye_index: int = 0,
):

    pipeline = TrinayPipeline()

    result = pipeline.predict(
        image_path
    )

    original_bgr = cv2.imread(
        str(image_path)
    )

    if original_bgr is None:
        raise ValueError(
            f"Could not read image: {image_path}"
        )

    original_rgb = bgr_to_rgb(
        original_bgr
    )

    # --------------------------------------------------------
    # Figure
    # --------------------------------------------------------

    fig, axes = plt.subplots(
        2,
        2,
        figsize=(16, 13),
        facecolor="#0b0b0b",
    )

    fig.suptitle(
        "TRINAY — AI Cataract Screening & XAI",
        fontsize=22,
        fontweight="bold",
        color="white",
        y=0.98,
    )


    # --------------------------------------------------------
    # PANEL 1 — ORIGINAL
    # --------------------------------------------------------

    ax = axes[0, 0]

    ax.imshow(original_rgb)

    ax.set_title(
        "Original Eye Image",
        fontsize=17,
        fontweight="bold",
        color="white",
        loc="left",
    )

    quality = result["quality"]

    quality_text = (
        f"Quality: {quality['status']}\n"
        f"GOOD: {quality['good_probability']:.3f}  "
        f"BAD: {quality['bad_probability']:.3f}"
    )

    ax.text(
        0.02,
        0.97,
        quality_text,
        transform=ax.transAxes,
        va="top",
        fontsize=11,
        color="white",
        bbox=dict(
            boxstyle="round,pad=0.4",
            facecolor="#252525",
            edgecolor="#777777",
            alpha=0.90,
        ),
    )

    ax.axis("off")


    # --------------------------------------------------------
    # QUALITY FAILURE
    # --------------------------------------------------------

    if result["status"] != "COMPLETE":

        axes[0, 1].imshow(
            original_rgb
        )

        axes[0, 1].set_title(
            "Quality / Detection Result",
            fontsize=17,
            fontweight="bold",
            color="white",
            loc="left",
        )

        axes[0, 1].text(
            0.5,
            0.5,
            result.get(
                "message",
                result["status"],
            ),
            transform=axes[0, 1].transAxes,
            ha="center",
            va="center",
            fontsize=18,
            color="white",
            bbox=dict(
                boxstyle="round,pad=0.6",
                facecolor="#7f1d1d",
                alpha=0.9,
            ),
        )

        axes[0, 1].axis("off")

        axes[1, 0].axis("off")
        axes[1, 1].axis("off")

        plt.tight_layout(
            rect=[0, 0, 1, 0.95]
        )

        output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        plt.savefig(
            output_path,
            dpi=180,
            bbox_inches="tight",
            facecolor=fig.get_facecolor(),
        )

        plt.close(fig)

        print(
            f"Visualization saved: {output_path}"
        )

        return


    # --------------------------------------------------------
    # SELECT EYE
    # --------------------------------------------------------

    if eye_index >= len(result["eyes"]):
        raise IndexError(
            f"eye_index={eye_index} but "
            f"{len(result['eyes'])} eye(s) detected."
        )

    eye = result["eyes"][eye_index]

    eye_bgr = eye["_roi_bgr"]
    iris_mask = eye["_iris_mask"]
    pupil_mask = eye["_pupil_mask"]

    detection_box = eye["roi_box"]

    cataract = eye["cataract"]

    # --------------------------------------------------------
    # PANEL 2 — EYE DETECTION
    # --------------------------------------------------------

    detection_img = draw_box(
        original_bgr,
        detection_box,
        (
            f"Eye {eye_index + 1}  "
            f"Conf {eye['detection']['confidence']:.2f}"
        ),
    )

    axes[0, 1].imshow(
        bgr_to_rgb(
            detection_img
        )
    )

    axes[0, 1].set_title(
        "Eye Detection / ROI",
        fontsize=17,
        fontweight="bold",
        color="white",
        loc="left",
    )

    axes[0, 1].axis("off")


    # --------------------------------------------------------
    # PANEL 3 — ANATOMICAL LOCALIZATION
    # --------------------------------------------------------

    anatomy = eye_bgr.copy()

    # Iris = cyan
    anatomy = contour_overlay(
        anatomy,
        iris_mask,
        (255, 255, 0),
        thickness=4,
    )

    # Pupil = yellow
    anatomy = contour_overlay(
        anatomy,
        pupil_mask,
        (0, 255, 255),
        thickness=4,
    )

    iris_area = int(
        iris_mask.sum()
    )

    pupil_area = int(
        pupil_mask.sum()
    )

    axes[1, 0].imshow(
        bgr_to_rgb(
            anatomy
        )
    )

    axes[1, 0].set_title(
        "Iris + Pupil Anatomical Localization",
        fontsize=17,
        fontweight="bold",
        color="white",
        loc="left",
    )

    axes[1, 0].text(
        0.02,
        0.97,
        (
            f"Iris pixels: {iris_area:,}\n"
            f"Pupil pixels: {pupil_area:,}"
        ),
        transform=axes[1, 0].transAxes,
        va="top",
        fontsize=11,
        color="white",
        bbox=dict(
            boxstyle="round,pad=0.4",
            facecolor="#252525",
            edgecolor="#777777",
            alpha=0.90,
        ),
    )

    axes[1, 0].axis("off")


    # --------------------------------------------------------
    # PANEL 4 — GRAD-CAM + COMBINED
    # --------------------------------------------------------

    # Grad-CAM target layer from the existing
    # EfficientNet-V2-S + CBAM implementation.
    target_layer = (
        pipeline.cataract_model
        .backbone
        .features[-1]
    )

    gradcam = GradCAM(
        pipeline.cataract_model,
        target_layer,
    )

    input_tensor = CLS_TRANSFORM(
        Image.fromarray(
            cv2.cvtColor(
                eye_bgr,
                cv2.COLOR_BGR2RGB,
            )
        )
    ).unsqueeze(0).to(DEVICE)

    input_tensor.requires_grad_(True)

    cam = gradcam.generate(
        input_tensor
    )

    gradcam.remove()

    # Heatmap on eye ROI.
    combined = overlay_heatmap(
        eye_bgr,
        cam,
        alpha=0.40,
    )

    # Add anatomical contours.
    combined = contour_overlay(
        combined,
        iris_mask,
        (255, 255, 0),
        thickness=3,
    )

    combined = contour_overlay(
        combined,
        pupil_mask,
        (0, 255, 255),
        thickness=3,
    )

    prediction = cataract[
        "prediction"
    ]

    cataract_prob = (
        cataract[
            "cataract_probability"
        ]
    )

    normal_prob = (
        cataract[
            "normal_probability"
        ]
    )

    axes[1, 1].imshow(
        bgr_to_rgb(
            combined
        )
    )

    axes[1, 1].set_title(
        "XAI / Combined Overlay",
        fontsize=17,
        fontweight="bold",
        color="white",
        loc="left",
    )

    axes[1, 1].text(
        0.02,
        0.97,
        (
            f"Prediction: {prediction}\n"
            f"Cataract: {cataract_prob:.3f}\n"
            f"Normal: {normal_prob:.3f}\n"
            f"Grad-CAM: cataract evidence"
        ),
        transform=axes[1, 1].transAxes,
        va="top",
        fontsize=11,
        color="white",
        bbox=dict(
            boxstyle="round,pad=0.4",
            facecolor="#252525",
            edgecolor="#777777",
            alpha=0.92,
        ),
    )

    axes[1, 1].axis("off")


    # --------------------------------------------------------
    # FOOTNOTE
    # --------------------------------------------------------

    fig.text(
        0.5,
        0.015,
        (
            "Grad-CAM highlights image regions contributing "
            "to the classifier score; it is an explanatory "
            "visualization, not a medical proof of causality."
        ),
        ha="center",
        fontsize=10,
        color="#dddddd",
    )


    plt.tight_layout(
        rect=[0, 0.035, 1, 0.95]
    )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    plt.savefig(
        output_path,
        dpi=180,
        bbox_inches="tight",
        facecolor=fig.get_facecolor(),
    )

    plt.close(fig)

    print(
        f"Visualization saved: {output_path}"
    )

    print(
        f"Prediction: {prediction}"
    )

    print(
        f"Cataract probability: "
        f"{cataract_prob:.4f}"
    )


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description=(
            "Generate TRINAY 2x2 "
            "XAI visualization"
        )
    )

    parser.add_argument(
        "image",
        help="Input eye image",
    )

    parser.add_argument(
        "--output",
        default="outputs/trinay_xai.png",
        help="Output PNG path",
    )

    parser.add_argument(
        "--eye-index",
        type=int,
        default=0,
        help="Eye to visualize when multiple eyes are detected",
    )

    args = parser.parse_args()

    create_visualization(
        Path(args.image),
        Path(args.output),
        args.eye_index,
    )
