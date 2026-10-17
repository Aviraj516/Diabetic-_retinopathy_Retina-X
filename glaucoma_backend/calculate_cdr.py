from pathlib import Path
import csv

import cv2
import numpy as np
import pandas as pd
import torch

from tqdm import tqdm

# Import the SAME Attention U-Net used for visualization
from visualize_disc_cup import (
    AttentionUNet,
    DEVICE,
    IMAGE_SIZE,
    NUM_CLASSES,
)


# ============================================================
# PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[1]

MANIFEST = (
    ROOT
    / "outputs"
    / "inspection"
    / "segmentation_manifest.csv"
)

MODEL_PATH = (
    ROOT
    / "models"
    / "best_attention_disc_cup_unet.pth"
)

OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "segmentation"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)

OUTPUT_CSV = (
    OUTPUT_DIR
    / "cdr_features.csv"
)


# ============================================================
# CONFIGURATION
# ============================================================

# Minimum disc size after segmentation.
# Prevents tiny false-positive regions from being treated
# as an optic disc.
MIN_DISC_AREA = 500

# Minimum cup size.
MIN_CUP_AREA = 50

# Minimum percentage of cup that must lie inside the disc.
MIN_CUP_INSIDE_RATIO = 0.90


# ============================================================
# HEADER
# ============================================================

print("=" * 80)
print("TRINAY CDR FEATURE EXTRACTION")
print("=" * 80)

print("Device :", DEVICE)
print("Model  :", MODEL_PATH)
print("Output :", OUTPUT_CSV)

print("=" * 80)


# ============================================================
# LOAD MODEL
# ============================================================

def load_model():

    print("\nLoading Attention U-Net...")

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=DEVICE
    )

    model = AttentionUNet(
        in_channels=3,
        num_classes=NUM_CLASSES
    )

    model.load_state_dict(
        checkpoint["model_state_dict"]
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

def preprocess_image(image):

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

    image = (
        image_rgb.astype(
            np.float32
        )
        / 255.0
    )

    mean = np.array(
        [0.485, 0.456, 0.406],
        dtype=np.float32
    )

    std = np.array(
        [0.229, 0.224, 0.225],
        dtype=np.float32
    )

    image = (
        image - mean
    ) / std

    image = np.transpose(
        image,
        (2, 0, 1)
    )

    tensor = torch.tensor(
        image,
        dtype=torch.float32
    )

    tensor = tensor.unsqueeze(
        0
    )

    return tensor


# ============================================================
# PREDICT MASK
# ============================================================

@torch.no_grad()
def predict(model, tensor):

    tensor = tensor.to(
        DEVICE
    )

    logits = model(
        tensor
    )

    prediction = torch.argmax(
        logits,
        dim=1
    )

    prediction = (
        prediction[0]
        .cpu()
        .numpy()
    )

    return prediction


# ============================================================
# LARGEST COMPONENT
# ============================================================

def largest_component(mask):

    mask = mask.astype(
        np.uint8
    )

    num_labels, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            mask,
            connectivity=8
        )
    )

    # No foreground
    if num_labels <= 1:

        return np.zeros_like(
            mask
        )

    largest_label = (
        1
        +
        np.argmax(
            stats[
                1:,
                cv2.CC_STAT_AREA
            ]
        )
    )

    result = (
        labels == largest_label
    ).astype(
        np.uint8
    )

    return result


# ============================================================
# CLEAN MASK
# ============================================================

def clean_mask(mask):

    mask = largest_component(
        mask
    )

    if np.sum(mask) == 0:

        return mask

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

def calculate_cdr(prediction):

    # --------------------------------------------------------
    # SEGMENTATION CLASSES
    #
    # 0 = background
    # 1 = optic disc
    # 2 = optic cup
    # --------------------------------------------------------

    disc_only = (
        prediction == 1
    ).astype(
        np.uint8
    )

    cup_mask = (
        prediction == 2
    ).astype(
        np.uint8
    )

    # --------------------------------------------------------
    # FULL OPTIC DISC
    #
    # The complete disc includes:
    #
    #   class 1 + class 2
    #
    # because the cup is inside the disc.
    # --------------------------------------------------------

    full_disc = (
        (prediction == 1)
        |
        (prediction == 2)
    ).astype(
        np.uint8
    )

    # --------------------------------------------------------
    # CLEAN
    # --------------------------------------------------------

    full_disc = clean_mask(
        full_disc
    )

    cup_mask = clean_mask(
        cup_mask
    )

    # --------------------------------------------------------
    # DISC AREA
    # --------------------------------------------------------

    disc_area = int(
        np.sum(full_disc)
    )

    cup_area = int(
        np.sum(cup_mask)
    )

    # --------------------------------------------------------
    # VALIDATE DISC
    # --------------------------------------------------------

    if disc_area < MIN_DISC_AREA:

        return {
            "status": "INVALID_DISC",
            "disc_detected": False,
            "cup_detected": False,
            "cup_inside_disc": False,

            "disc_area": disc_area,
            "cup_area": cup_area,

            "disc_width": None,
            "disc_height": None,

            "cup_width": None,
            "cup_height": None,

            "vertical_cdr": None,
            "horizontal_cdr": None,
            "area_cdr": None,
        }

    # --------------------------------------------------------
    # VALIDATE CUP
    # --------------------------------------------------------

    if cup_area < MIN_CUP_AREA:

        return {
            "status": "INVALID_CUP",
            "disc_detected": True,
            "cup_detected": False,
            "cup_inside_disc": False,

            "disc_area": disc_area,
            "cup_area": cup_area,

            "disc_width": None,
            "disc_height": None,

            "cup_width": None,
            "cup_height": None,

            "vertical_cdr": None,
            "horizontal_cdr": None,
            "area_cdr": None,
        }

    # --------------------------------------------------------
    # CUP INSIDE DISC CHECK
    # --------------------------------------------------------

    cup_pixels = (
        cup_mask > 0
    )

    cup_inside_pixels = (
        cup_pixels
        &
        (full_disc > 0)
    )

    inside_ratio = (
        np.sum(cup_inside_pixels)
        /
        max(
            np.sum(cup_pixels),
            1
        )
    )

    if inside_ratio < MIN_CUP_INSIDE_RATIO:

        return {
            "status": "INVALID_CUP_POSITION",
            "disc_detected": True,
            "cup_detected": True,
            "cup_inside_disc": False,

            "disc_area": disc_area,
            "cup_area": cup_area,

            "disc_width": None,
            "disc_height": None,

            "cup_width": None,
            "cup_height": None,

            "vertical_cdr": None,
            "horizontal_cdr": None,
            "area_cdr": None,
        }

    # --------------------------------------------------------
    # FORCE CUP TO REMAIN INSIDE DISC
    # --------------------------------------------------------

    cup_mask = (
        cup_mask
        &
        full_disc
    ).astype(
        np.uint8
    )

    cup_area = int(
        np.sum(cup_mask)
    )

    if cup_area < MIN_CUP_AREA:

        return {
            "status": "INVALID_CUP",
            "disc_detected": True,
            "cup_detected": False,
            "cup_inside_disc": False,

            "disc_area": disc_area,
            "cup_area": cup_area,

            "disc_width": None,
            "disc_height": None,

            "cup_width": None,
            "cup_height": None,

            "vertical_cdr": None,
            "horizontal_cdr": None,
            "area_cdr": None,
        }

    # --------------------------------------------------------
    # BOUNDING BOX
    # --------------------------------------------------------

    disc_points = cv2.findNonZero(
        full_disc
    )

    cup_points = cv2.findNonZero(
        cup_mask
    )

    if disc_points is None:

        return {
            "status": "INVALID_DISC",
            "disc_detected": False,
            "cup_detected": False,
            "cup_inside_disc": False,
        }

    if cup_points is None:

        return {
            "status": "INVALID_CUP",
            "disc_detected": True,
            "cup_detected": False,
            "cup_inside_disc": False,
        }

    disc_x, disc_y, disc_w, disc_h = (
        cv2.boundingRect(
            disc_points
        )
    )

    cup_x, cup_y, cup_w, cup_h = (
        cv2.boundingRect(
            cup_points
        )
    )

    # --------------------------------------------------------
    # SAFETY CHECK
    # --------------------------------------------------------

    if disc_w <= 0 or disc_h <= 0:

        return {
            "status": "INVALID_DISC_GEOMETRY",
            "disc_detected": False,
            "cup_detected": False,
            "cup_inside_disc": False,
        }

    if cup_w <= 0 or cup_h <= 0:

        return {
            "status": "INVALID_CUP_GEOMETRY",
            "disc_detected": True,
            "cup_detected": False,
            "cup_inside_disc": False,
        }

    # --------------------------------------------------------
    # VERTICAL CDR
    # --------------------------------------------------------

    vertical_cdr = (
        cup_h
        /
        disc_h
    )

    # --------------------------------------------------------
    # HORIZONTAL CDR
    # --------------------------------------------------------

    horizontal_cdr = (
        cup_w
        /
        disc_w
    )

    # --------------------------------------------------------
    # AREA CDR
    # --------------------------------------------------------

    area_cdr = (
        cup_area
        /
        disc_area
    )

    # --------------------------------------------------------
    # RETURN FEATURES
    # --------------------------------------------------------

    return {

        "status": "VALID",

        "disc_detected": True,

        "cup_detected": True,

        "cup_inside_disc": True,

        "disc_area": disc_area,

        "cup_area": cup_area,

        "disc_width": disc_w,

        "disc_height": disc_h,

        "cup_width": cup_w,

        "cup_height": cup_h,

        "vertical_cdr": float(
            vertical_cdr
        ),

        "horizontal_cdr": float(
            horizontal_cdr
        ),

        "area_cdr": float(
            area_cdr
        ),

        "disc_x": disc_x,

        "disc_y": disc_y,

        "cup_x": cup_x,

        "cup_y": cup_y,

        "cup_inside_ratio": float(
            inside_ratio
        ),
    }


# ============================================================
# LOAD TEST IMAGES
# ============================================================

def load_test_rows():

    rows = []

    with open(
        MANIFEST,
        "r",
        newline=""
    ) as f:

        reader = csv.DictReader(
            f
        )

        for row in reader:

            if row["split"] == "test":

                rows.append(
                    row
                )

    return rows


# ============================================================
# MAIN
# ============================================================

def main():

    # --------------------------------------------------------
    # MODEL
    # --------------------------------------------------------

    model = load_model()

    # --------------------------------------------------------
    # DATA
    # --------------------------------------------------------

    rows = load_test_rows()

    print(
        f"\nTest images: {len(rows)}"
    )

    print(
        "\nStarting CDR extraction..."
    )

    results = []

    valid_count = 0

    invalid_count = 0

    # --------------------------------------------------------
    # PROCESS
    # --------------------------------------------------------

    progress = tqdm(
        rows,
        desc="Calculating CDR",
        dynamic_ncols=True
    )

    for row in progress:

        image_path = (
            ROOT
            /
            row["image"]
        )

        image = cv2.imread(
            str(image_path),
            cv2.IMREAD_COLOR
        )

        # ----------------------------------------------------
        # IMAGE READ FAILURE
        # ----------------------------------------------------

        if image is None:

            results.append({

                "image":
                    row["image"],

                "status":
                    "IMAGE_READ_ERROR",

                "disc_detected":
                    False,

                "cup_detected":
                    False,

                "cup_inside_disc":
                    False,

                "disc_area":
                    None,

                "cup_area":
                    None,

                "disc_width":
                    None,

                "disc_height":
                    None,

                "cup_width":
                    None,

                "cup_height":
                    None,

                "vertical_cdr":
                    None,

                "horizontal_cdr":
                    None,

                "area_cdr":
                    None,
            })

            invalid_count += 1

            continue

        # ----------------------------------------------------
        # PREPROCESS
        # ----------------------------------------------------

        tensor = preprocess_image(
            image
        )

        # ----------------------------------------------------
        # PREDICT
        # ----------------------------------------------------

        prediction = predict(
            model,
            tensor
        )

        # ----------------------------------------------------
        # CDR
        # ----------------------------------------------------

        features = calculate_cdr(
            prediction
        )

        # ----------------------------------------------------
        # SAVE FEATURES
        # ----------------------------------------------------

        result = {
            "image":
                row["image"]
        }

        result.update(
            features
        )

        results.append(
            result
        )

        # ----------------------------------------------------
        # COUNTERS
        # ----------------------------------------------------

        if features["status"] == "VALID":

            valid_count += 1

            progress.set_postfix(
                valid=valid_count,
                invalid=invalid_count,
                cdr=(
                    f"{features['vertical_cdr']:.3f}"
                )
            )

        else:

            invalid_count += 1

            progress.set_postfix(
                valid=valid_count,
                invalid=invalid_count
            )

    # --------------------------------------------------------
    # DATAFRAME
    # --------------------------------------------------------

    df = pd.DataFrame(
        results
    )

    # --------------------------------------------------------
    # SAVE CSV
    # --------------------------------------------------------

    df.to_csv(
        OUTPUT_CSV,
        index=False
    )

    # --------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------

    print("\n" + "=" * 80)
    print("CDR EXTRACTION COMPLETE")
    print("=" * 80)

    print(
        f"Total images : {len(results)}"
    )

    print(
        f"Valid        : {valid_count}"
    )

    print(
        f"Invalid      : {invalid_count}"
    )

    if valid_count > 0:

        valid_df = df[
            df["status"] == "VALID"
        ]

        print("\nCDR SUMMARY")
        print("-" * 80)

        print(
            f"Mean Vertical CDR   : "
            f"{valid_df['vertical_cdr'].mean():.4f}"
        )

        print(
            f"Mean Horizontal CDR : "
            f"{valid_df['horizontal_cdr'].mean():.4f}"
        )

        print(
            f"Mean Area CDR       : "
            f"{valid_df['area_cdr'].mean():.4f}"
        )

        print(
            f"Min Vertical CDR    : "
            f"{valid_df['vertical_cdr'].min():.4f}"
        )

        print(
            f"Max Vertical CDR    : "
            f"{valid_df['vertical_cdr'].max():.4f}"
        )

    # --------------------------------------------------------
    # STATUS DISTRIBUTION
    # --------------------------------------------------------

    print("\nSTATUS")
    print("-" * 80)

    print(
        df["status"]
        .value_counts()
        .to_string()
    )

    print("\nOutput:")
    print(
        OUTPUT_CSV
    )

    print("=" * 80)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()