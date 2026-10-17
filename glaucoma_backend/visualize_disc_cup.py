from pathlib import Path
import csv

import cv2
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F

import matplotlib.pyplot as plt


# ============================================================
# PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[1]

MANIFEST = ROOT / "outputs/inspection/segmentation_manifest.csv"

MODEL_PATH = (
    ROOT
    / "models"
    / "best_attention_disc_cup_unet.pth"
)

OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "segmentation"
    / "visualizations"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)

CSV_PATH = (
    ROOT
    / "outputs"
    / "segmentation"
    / "cdr_results.csv"
)


# ============================================================
# CONFIG
# ============================================================

IMAGE_SIZE = 512

NUM_CLASSES = 3

NUM_VISUALIZATIONS = 20

# Set to None to process all test images
# Example:
# NUM_VISUALIZATIONS = 20

# Device
if torch.backends.mps.is_available():

    DEVICE = torch.device("mps")

elif torch.cuda.is_available():

    DEVICE = torch.device("cuda")

else:

    DEVICE = torch.device("cpu")


# ============================================================
# PRINT INFO
# ============================================================

print("=" * 80)
print("TRINAY DISC + CUP VISUALIZATION")
print("=" * 80)

print(
    "Device:",
    DEVICE
)

print(
    "Model:",
    MODEL_PATH
)

print(
    "Output:",
    OUTPUT_DIR
)

print("=" * 80)


# ============================================================
# ATTENTION GATE
# ============================================================

class AttentionGate(nn.Module):

    def __init__(
        self,
        gate_channels,
        skip_channels,
        inter_channels
    ):

        super().__init__()

        self.W_g = nn.Sequential(

            nn.Conv2d(
                gate_channels,
                inter_channels,
                kernel_size=1,
                stride=1,
                padding=0,
                bias=True
            ),

            nn.BatchNorm2d(
                inter_channels
            )
        )

        self.W_x = nn.Sequential(

            nn.Conv2d(
                skip_channels,
                inter_channels,
                kernel_size=1,
                stride=1,
                padding=0,
                bias=True
            ),

            nn.BatchNorm2d(
                inter_channels
            )
        )

        self.psi = nn.Sequential(

            nn.Conv2d(
                inter_channels,
                1,
                kernel_size=1,
                stride=1,
                padding=0,
                bias=True
            ),

            nn.BatchNorm2d(1),

            nn.Sigmoid()
        )

        self.relu = nn.ReLU(
            inplace=True
        )

    def forward(
        self,
        gate,
        skip
    ):

        gate_projection = self.W_g(
            gate
        )

        skip_projection = self.W_x(
            skip
        )

        if (
            gate_projection.shape[-2:]
            !=
            skip_projection.shape[-2:]
        ):

            gate_projection = F.interpolate(
                gate_projection,
                size=skip_projection.shape[-2:],
                mode="bilinear",
                align_corners=False
            )

        attention = self.relu(
            gate_projection
            +
            skip_projection
        )

        attention = self.psi(
            attention
        )

        return skip * attention


# ============================================================
# DOUBLE CONV
# ============================================================

class DoubleConv(nn.Module):

    def __init__(
        self,
        in_channels,
        out_channels
    ):

        super().__init__()

        self.block = nn.Sequential(

            nn.Conv2d(
                in_channels,
                out_channels,
                kernel_size=3,
                padding=1,
                bias=False
            ),

            nn.BatchNorm2d(
                out_channels
            ),

            nn.ReLU(
                inplace=True
            ),

            nn.Conv2d(
                out_channels,
                out_channels,
                kernel_size=3,
                padding=1,
                bias=False
            ),

            nn.BatchNorm2d(
                out_channels
            ),

            nn.ReLU(
                inplace=True
            )
        )

    def forward(self, x):

        return self.block(x)


# ============================================================
# ATTENTION U-NET
# ============================================================

class AttentionUNet(nn.Module):

    def __init__(
        self,
        in_channels=3,
        num_classes=3
    ):

        super().__init__()

        # Encoder

        self.enc1 = DoubleConv(
            in_channels,
            32
        )

        self.enc2 = DoubleConv(
            32,
            64
        )

        self.enc3 = DoubleConv(
            64,
            128
        )

        self.enc4 = DoubleConv(
            128,
            256
        )

        # Bottleneck

        self.bottleneck = DoubleConv(
            256,
            512
        )

        self.pool = nn.MaxPool2d(
            2,
            2
        )

        # Decoder 4

        self.up4 = nn.ConvTranspose2d(
            512,
            256,
            kernel_size=2,
            stride=2
        )

        self.att4 = AttentionGate(
            256,
            256,
            128
        )

        self.dec4 = DoubleConv(
            512,
            256
        )

        # Decoder 3

        self.up3 = nn.ConvTranspose2d(
            256,
            128,
            kernel_size=2,
            stride=2
        )

        self.att3 = AttentionGate(
            128,
            128,
            64
        )

        self.dec3 = DoubleConv(
            256,
            128
        )

        # Decoder 2

        self.up2 = nn.ConvTranspose2d(
            128,
            64,
            kernel_size=2,
            stride=2
        )

        self.att2 = AttentionGate(
            64,
            64,
            32
        )

        self.dec2 = DoubleConv(
            128,
            64
        )

        # Decoder 1

        self.up1 = nn.ConvTranspose2d(
            64,
            32,
            kernel_size=2,
            stride=2
        )

        self.att1 = AttentionGate(
            32,
            32,
            16
        )

        self.dec1 = DoubleConv(
            64,
            32
        )

        # Output

        self.output = nn.Conv2d(
            32,
            num_classes,
            kernel_size=1
        )

    def forward(self, x):

        # Encoder

        e1 = self.enc1(x)

        p1 = self.pool(e1)

        e2 = self.enc2(p1)

        p2 = self.pool(e2)

        e3 = self.enc3(p2)

        p3 = self.pool(e3)

        e4 = self.enc4(p3)

        p4 = self.pool(e4)

        # Bottleneck

        b = self.bottleneck(p4)

        # Decoder 4

        d4 = self.up4(b)

        if d4.shape[-2:] != e4.shape[-2:]:

            d4 = F.interpolate(
                d4,
                size=e4.shape[-2:],
                mode="bilinear",
                align_corners=False
            )

        a4 = self.att4(
            d4,
            e4
        )

        d4 = torch.cat(
            [d4, a4],
            dim=1
        )

        d4 = self.dec4(d4)

        # Decoder 3

        d3 = self.up3(d4)

        if d3.shape[-2:] != e3.shape[-2:]:

            d3 = F.interpolate(
                d3,
                size=e3.shape[-2:],
                mode="bilinear",
                align_corners=False
            )

        a3 = self.att3(
            d3,
            e3
        )

        d3 = torch.cat(
            [d3, a3],
            dim=1
        )

        d3 = self.dec3(d3)

        # Decoder 2

        d2 = self.up2(d3)

        if d2.shape[-2:] != e2.shape[-2:]:

            d2 = F.interpolate(
                d2,
                size=e2.shape[-2:],
                mode="bilinear",
                align_corners=False
            )

        a2 = self.att2(
            d2,
            e2
        )

        d2 = torch.cat(
            [d2, a2],
            dim=1
        )

        d2 = self.dec2(d2)

        # Decoder 1

        d1 = self.up1(d2)

        if d1.shape[-2:] != e1.shape[-2:]:

            d1 = F.interpolate(
                d1,
                size=e1.shape[-2:],
                mode="bilinear",
                align_corners=False
            )

        a1 = self.att1(
            d1,
            e1
        )

        d1 = torch.cat(
            [d1, a1],
            dim=1
        )

        d1 = self.dec1(d1)

        return self.output(d1)


# ============================================================
# LOAD MODEL
# ============================================================

def load_model():

    print("\nLoading model...")

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=DEVICE
    )

    model = AttentionUNet(
        in_channels=3,
        num_classes=NUM_CLASSES
    )

    model.load_state_dict(
        checkpoint[
            "model_state_dict"
        ]
    )

    model = model.to(
        DEVICE
    )

    model.eval()

    print("✓ Model loaded")

    return model


# ============================================================
# PREPROCESS IMAGE
# ============================================================

def preprocess_image(
    image
):

    image = cv2.resize(
        image,
        (
            IMAGE_SIZE,
            IMAGE_SIZE
        ),
        interpolation=cv2.INTER_AREA
    )

    image_rgb = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )

    image_float = (
        image_rgb.astype(
            np.float32
        )
        /
        255.0
    )

    mean = np.array(
        [0.485, 0.456, 0.406],
        dtype=np.float32
    )

    std = np.array(
        [0.229, 0.224, 0.225],
        dtype=np.float32
    )

    image_normalized = (
        image_float - mean
    ) / std

    image_tensor = np.transpose(
        image_normalized,
        (2, 0, 1)
    )

    image_tensor = torch.tensor(
        image_tensor,
        dtype=torch.float32
    )

    image_tensor = image_tensor.unsqueeze(
        0
    )

    return (
        image_rgb,
        image_tensor
    )


# ============================================================
# PREDICT
# ============================================================

@torch.no_grad()
def predict(
    model,
    image_tensor
):

    image_tensor = image_tensor.to(
        DEVICE
    )

    logits = model(
        image_tensor
    )

    prediction = torch.argmax(
        logits,
        dim=1
    )

    prediction = prediction[
        0
    ].cpu().numpy()

    return prediction


# ============================================================
# MASK → BINARY
# ============================================================

def get_disc_mask(
    prediction
):

    return (
        prediction == 1
    ).astype(
        np.uint8
    )


def get_cup_mask(
    prediction
):

    return (
        prediction == 2
    ).astype(
        np.uint8
    )


# ============================================================
# FIND LARGEST CONNECTED COMPONENT
# ============================================================

def largest_component(
    mask
):

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask,
        connectivity=8
    )

    if num_labels <= 1:

        return mask

    largest_label = 1 + np.argmax(
        stats[1:, cv2.CC_STAT_AREA]
    )

    return (
        labels == largest_label
    ).astype(
        np.uint8
    )


# ============================================================
# CLEAN MASK
# ============================================================

def clean_mask(
    mask
):

    # Remove small disconnected regions

    mask = largest_component(
        mask
    )

    # Small morphological closing

    kernel = np.ones(
        (5, 5),
        dtype=np.uint8
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        kernel
    )

    return mask


# ============================================================
# CALCULATE CDR
# ============================================================

def calculate_cdr(
    disc_mask,
    cup_mask
):

    disc_mask = clean_mask(
        disc_mask
    )

    cup_mask = clean_mask(
        cup_mask
    )

    # --------------------------------------------------------
    # DISC BOUNDING BOX
    # --------------------------------------------------------

    disc_points = cv2.findNonZero(
        disc_mask
    )

    cup_points = cv2.findNonZero(
        cup_mask
    )

    if disc_points is None:

        return None

    if cup_points is None:

        return None

    disc_x, disc_y, disc_w, disc_h = cv2.boundingRect(
        disc_points
    )

    cup_x, cup_y, cup_w, cup_h = cv2.boundingRect(
        cup_points
    )

    # --------------------------------------------------------
    # VERTICAL CDR
    # --------------------------------------------------------

    if disc_h <= 0:

        return None

    vertical_cdr = (
        cup_h
        /
        disc_h
    )

    # --------------------------------------------------------
    # HORIZONTAL CDR
    # --------------------------------------------------------

    if disc_w > 0:

        horizontal_cdr = (
            cup_w
            /
            disc_w
        )

    else:

        horizontal_cdr = None

    # --------------------------------------------------------
    # AREA CDR
    # --------------------------------------------------------

    disc_area = np.sum(
        disc_mask
    )

    cup_area = np.sum(
        cup_mask
    )

    if disc_area > 0:

        area_cdr = (
            cup_area
            /
            disc_area
        )

    else:

        area_cdr = None

    return {
        "disc_x": int(disc_x),
        "disc_y": int(disc_y),
        "disc_w": int(disc_w),
        "disc_h": int(disc_h),

        "cup_x": int(cup_x),
        "cup_y": int(cup_y),
        "cup_w": int(cup_w),
        "cup_h": int(cup_h),

        "vertical_cdr": float(
            vertical_cdr
        ),

        "horizontal_cdr": (
            float(horizontal_cdr)
            if horizontal_cdr is not None
            else None
        ),

        "area_cdr": (
            float(area_cdr)
            if area_cdr is not None
            else None
        ),

        "disc_area": int(
            disc_area
        ),

        "cup_area": int(
            cup_area
        )
    }


# ============================================================
# CREATE COLOR SEGMENTATION
# ============================================================

def create_segmentation_visual(
    prediction
):

    h, w = prediction.shape

    visual = np.zeros(
        (
            h,
            w,
            3
        ),
        dtype=np.uint8
    )

    # Background = black

    # Optic disc

    visual[
        prediction == 1
    ] = [
        255,
        255,
        0
    ]

    # Optic cup

    visual[
        prediction == 2
    ] = [
        255,
        0,
        255
    ]

    return visual


# ============================================================
# CREATE OVERLAY
# ============================================================

def create_overlay(
    image,
    prediction
):

    overlay = image.copy()

    # --------------------------------------------------------
    # DISC
    # --------------------------------------------------------

    disc_mask = (
        prediction == 1
    )

    # --------------------------------------------------------
    # CUP
    # --------------------------------------------------------

    cup_mask = (
        prediction == 2
    )

    # Blend disc

    overlay[
        disc_mask
    ] = (
        0.55
        *
        overlay[disc_mask]
        +
        0.45
        *
        np.array(
            [255, 255, 0]
        )
    ).astype(
        np.uint8
    )

    # Blend cup

    overlay[
        cup_mask
    ] = (
        0.55
        *
        overlay[cup_mask]
        +
        0.45
        *
        np.array(
            [255, 0, 255]
        )
    ).astype(
        np.uint8
    )

    # --------------------------------------------------------
    # CONTOURS
    # --------------------------------------------------------

    disc_uint8 = (
        disc_mask.astype(
            np.uint8
        )
        *
        255
    )

    cup_uint8 = (
        cup_mask.astype(
            np.uint8
        )
        *
        255
    )

    disc_contours, _ = cv2.findContours(
        disc_uint8,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    cup_contours, _ = cv2.findContours(
        cup_uint8,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    cv2.drawContours(
        overlay,
        disc_contours,
        -1,
        (255, 255, 0),
        2
    )

    cv2.drawContours(
        overlay,
        cup_contours,
        -1,
        (255, 0, 255),
        2
    )

    return overlay


# ============================================================
# GROUND TRUTH VISUAL
# ============================================================

def create_ground_truth_visual(
    mask
):

    visual = np.zeros(
        (
            mask.shape[0],
            mask.shape[1],
            3
        ),
        dtype=np.uint8
    )

    visual[
        mask == 1
    ] = [
        255,
        255,
        0
    ]

    visual[
        mask == 2
    ] = [
        255,
        0,
        255
    ]

    return visual


# ============================================================
# DRAW CDR INFORMATION
# ============================================================

def add_cdr_text(
    image,
    cdr
):

    result = image.copy()

    if cdr is None:

        text = "CDR: Unable to calculate"

        cv2.putText(
            result,
            text,
            (15, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA
        )

        return result

    lines = [
        f"V-CDR: {cdr['vertical_cdr']:.3f}",
        f"H-CDR: {cdr['horizontal_cdr']:.3f}",
        f"Area-CDR: {cdr['area_cdr']:.3f}"
    ]

    y = 30

    for line in lines:

        cv2.putText(
            result,
            line,
            (15, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA
        )

        y += 28

    return result


# ============================================================
# SAVE VISUALIZATION
# ============================================================

def save_visualization(
    image,
    ground_truth,
    prediction,
    overlay,
    cdr,
    output_path
):

    fig, axes = plt.subplots(
        1,
        4,
        figsize=(20, 5)
    )

    # --------------------------------------------------------
    # ORIGINAL
    # --------------------------------------------------------

    axes[0].imshow(
        image
    )

    axes[0].set_title(
        "Original Fundus"
    )

    axes[0].axis(
        "off"
    )

    # --------------------------------------------------------
    # GROUND TRUTH
    # --------------------------------------------------------

    axes[1].imshow(
        ground_truth
    )

    axes[1].set_title(
        "Ground Truth"
    )

    axes[1].axis(
        "off"
    )

    # --------------------------------------------------------
    # PREDICTION
    # --------------------------------------------------------

    axes[2].imshow(
        prediction
    )

    axes[2].set_title(
        "Predicted Disc + Cup"
    )

    axes[2].axis(
        "off"
    )

    # --------------------------------------------------------
    # OVERLAY
    # --------------------------------------------------------

    axes[3].imshow(
        overlay
    )

    if cdr is not None:

        title = (
            f"Prediction Overlay\n"
            f"V-CDR: {cdr['vertical_cdr']:.3f}"
        )

    else:

        title = (
            "Prediction Overlay\n"
            "CDR unavailable"
        )

    axes[3].set_title(
        title
    )

    axes[3].axis(
        "off"
    )

    plt.tight_layout()

    plt.savefig(
        output_path,
        dpi=150,
        bbox_inches="tight"
    )

    plt.close(
        fig
    )


# ============================================================
# MAIN
# ============================================================

def main():

    # --------------------------------------------------------
    # LOAD MODEL
    # --------------------------------------------------------

    model = load_model()

    # --------------------------------------------------------
    # LOAD MANIFEST
    # --------------------------------------------------------

    rows = []

    with open(
        MANIFEST,
        "r",
        newline=""
    ) as f:

        reader = csv.DictReader(f)

        for row in reader:

            if row["split"] == "test":

                rows.append(
                    row
                )

    print(
        f"\nTest images available: {len(rows)}"
    )

    if NUM_VISUALIZATIONS is not None:

        rows = rows[
            :NUM_VISUALIZATIONS
        ]

    print(
        f"Visualizing: {len(rows)} images"
    )

    # --------------------------------------------------------
    # RESULTS
    # --------------------------------------------------------

    results = []

    # --------------------------------------------------------
    # PROCESS
    # --------------------------------------------------------

    for index, row in enumerate(
        rows,
        start=1
    ):

        image_path = (
            ROOT
            /
            row["image"]
        )

        mask_path = (
            ROOT
            /
            row["mask"]
        )

        print(
            f"\n[{index}/{len(rows)}]"
        )

        print(
            "Image:",
            image_path.name
        )

        # ----------------------------------------------------
        # READ IMAGE
        # ----------------------------------------------------

        image_bgr = cv2.imread(
            str(image_path)
        )

        if image_bgr is None:

            print(
                "WARNING: Could not read image"
            )

            continue

        # ----------------------------------------------------
        # READ MASK
        # ----------------------------------------------------

        ground_truth = cv2.imread(
            str(mask_path),
            cv2.IMREAD_GRAYSCALE
        )

        if ground_truth is None:

            print(
                "WARNING: Could not read mask"
            )

            continue

        # ----------------------------------------------------
        # PREPROCESS
        # ----------------------------------------------------

        image_rgb, tensor = preprocess_image(
            image_bgr
        )

        # Resize GT

        ground_truth = cv2.resize(
            ground_truth,
            (
                IMAGE_SIZE,
                IMAGE_SIZE
            ),
            interpolation=cv2.INTER_NEAREST
        )

        # ----------------------------------------------------
        # PREDICTION
        # ----------------------------------------------------

        prediction = predict(
            model,
            tensor
        )

        # ----------------------------------------------------
        # MASK CLEANING
        # ----------------------------------------------------

        disc_mask = get_disc_mask(
            prediction
        )

        cup_mask = get_cup_mask(
            prediction
        )

        disc_mask = clean_mask(
            disc_mask
        )

        cup_mask = clean_mask(
            cup_mask
        )

        # Reconstruct prediction

        cleaned_prediction = np.zeros_like(
            prediction
        )

        cleaned_prediction[
            disc_mask == 1
        ] = 1

        cleaned_prediction[
            cup_mask == 1
        ] = 2

        # ----------------------------------------------------
        # CDR
        # ----------------------------------------------------

        cdr = calculate_cdr(
            disc_mask,
            cup_mask
        )

        # ----------------------------------------------------
        # VISUALS
        # ----------------------------------------------------

        ground_truth_visual = create_ground_truth_visual(
            ground_truth
        )

        prediction_visual = create_segmentation_visual(
            cleaned_prediction
        )

        overlay = create_overlay(
            image_rgb,
            cleaned_prediction
        )

        # ----------------------------------------------------
        # CDR TEXT
        # ----------------------------------------------------

        overlay = add_cdr_text(
            overlay,
            cdr
        )

        # ----------------------------------------------------
        # OUTPUT NAME
        # ----------------------------------------------------

        image_name = Path(
            row["image"]
        ).stem

        output_path = (
            OUTPUT_DIR
            /
            f"{image_name}_disc_cup.png"
        )

        # ----------------------------------------------------
        # SAVE
        # ----------------------------------------------------

        save_visualization(
            image_rgb,
            ground_truth_visual,
            prediction_visual,
            overlay,
            cdr,
            output_path
        )

        # ----------------------------------------------------
        # RESULTS
        # ----------------------------------------------------

        result = {

            "image":
                str(
                    row["image"]
                ),

            "visualization":
                str(
                    output_path.relative_to(
                        ROOT
                    )
                )
        }

        if cdr is not None:

            result.update({

                "vertical_cdr":
                    cdr[
                        "vertical_cdr"
                    ],

                "horizontal_cdr":
                    cdr[
                        "horizontal_cdr"
                    ],

                "area_cdr":
                    cdr[
                        "area_cdr"
                    ],

                "disc_area":
                    cdr[
                        "disc_area"
                    ],

                "cup_area":
                    cdr[
                        "cup_area"
                    ]
            })

            print(
                f"Vertical CDR : "
                f"{cdr['vertical_cdr']:.3f}"
            )

            print(
                f"Horizontal CDR: "
                f"{cdr['horizontal_cdr']:.3f}"
            )

            print(
                f"Area CDR     : "
                f"{cdr['area_cdr']:.3f}"
            )

        else:

            result.update({

                "vertical_cdr":
                    None,

                "horizontal_cdr":
                    None,

                "area_cdr":
                    None,

                "disc_area":
                    None,

                "cup_area":
                    None
            })

            print(
                "CDR: Unable to calculate"
            )

        results.append(
            result
        )

        print(
            "Saved:",
            output_path
        )

    # --------------------------------------------------------
    # SAVE CSV
    # --------------------------------------------------------

    if results:

        df = pd.DataFrame(
            results
        )

        df.to_csv(
            CSV_PATH,
            index=False
        )

    # --------------------------------------------------------
    # COMPLETE
    # --------------------------------------------------------

    print("\n" + "=" * 80)

    print(
        "VISUALIZATION COMPLETE"
    )

    print("=" * 80)

    print(
        "Visualizations:"
    )

    print(
        OUTPUT_DIR
    )

    print(
        "\nCDR results:"
    )

    print(
        CSV_PATH
    )

    print("=" * 80)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()