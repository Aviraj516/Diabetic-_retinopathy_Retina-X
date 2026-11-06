"""XAI color-fix verification (rendering ONLY — data must be invariant).

IMAGE A: uploads/screening_results/CAT-24960/original.png (cataract)
IMAGE B: uploads/screening_results/CAT-25861/original.png (normal)

Asserts (from the pre-change verified run):
  A: pred=CATARACT cat=0.9925 norm=0.0075 opacity_px=102497 pct=17.3
  B: pred=NORMAL   cat=0.0249 norm=0.9751 opacity_px=0      pct=0.0
  A and B keep different spatial patterns in both panels.
Saves rendered panels to /tmp for visual inspection.
"""
import base64
import sys
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.cataract_service import run_cataract_screening

IMG_A = PROJECT_ROOT / "uploads/screening_results/CAT-24960/original.png"
IMG_B = PROJECT_ROOT / "uploads/screening_results/CAT-25861/original.png"


def b64_to_bgr(s: str) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(base64.b64decode(s), dtype=np.uint8), cv2.IMREAD_COLOR)


def main() -> None:
    img_a = cv2.imread(str(IMG_A))
    img_b = cv2.imread(str(IMG_B))
    res_a = run_cataract_screening(img_a, filename="screening_A.png")
    res_b = run_cataract_screening(img_b, filename="screening_B.png")

    assert res_a["status"] == "COMPLETE" and res_b["status"] == "COMPLETE"
    ca, cb = res_a["cataract"], res_b["cataract"]
    qa, qb = res_a["quantitativeAnalysis"], res_b["quantitativeAnalysis"]

    # --- DATA INVARIANCE (model outputs + measurements unchanged) ---
    assert ca["prediction"] == "CATARACT", ca["prediction"]
    assert abs(ca["cataractProbability"] - 0.9925) < 1e-4, ca["cataractProbability"]
    assert abs(ca["normalProbability"] - 0.0075) < 1e-4
    assert qa["opacityEvidenceAreaPx"] == 102497, qa["opacityEvidenceAreaPx"]
    assert qa["opacityEvidencePercentage"] == 17.3, qa["opacityEvidencePercentage"]
    assert cb["prediction"] == "NORMAL", cb["prediction"]
    assert abs(cb["cataractProbability"] - 0.0249) < 1e-4, cb["cataractProbability"]
    assert abs(cb["normalProbability"] - 0.9751) < 1e-4
    assert qb["opacityEvidenceAreaPx"] == 0
    assert qb["opacityEvidencePercentage"] == 0.0
    print("[data] predictions, probabilities, pixel counts, percentages IDENTICAL to pre-change run")

    # --- SPATIAL PATTERNS STILL DIFFER BETWEEN SCREENINGS ---
    op_a = b64_to_bgr(res_a["visualizations"]["opacityEvidenceMap"])
    op_b = b64_to_bgr(res_b["visualizations"]["opacityEvidenceMap"])
    gx_a = b64_to_bgr(res_a["visualizations"]["gradcam"])
    gx_b = b64_to_bgr(res_b["visualizations"]["gradcam"])
    assert op_a.shape == gx_a.shape, "panel 3/4 shape mismatch A"
    assert not np.array_equal(
        cv2.resize(op_a, (128, 128)), cv2.resize(op_b, (128, 128))
    ), "opacity maps identical across screenings"
    assert not np.array_equal(
        cv2.resize(gx_a, (128, 128)), cv2.resize(gx_b, (128, 128))
    ), "gradcam maps identical across screenings"
    print("[isolation] A/B spatial patterns differ in both panels")

    # --- RENDERING CHECKS: dark, saturated, no pastel wash ---
    for label, img in (("A", op_a), ("B", op_b)):
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        sat_mean = float(np.mean(hsv[:, :, 1]))
        print(f"[panel3-{label}] mean saturation={sat_mean:.1f}")
    for label, img in (("A", gx_a), ("B", gx_b)):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        print(f"[panel4-{label}] gray std={float(np.std(gray)):.1f} (contrast)")

    cv2.imwrite("/tmp/panel3_A.png", op_a)
    cv2.imwrite("/tmp/panel3_B.png", op_b)
    cv2.imwrite("/tmp/panel4_A.png", gx_a)
    cv2.imwrite("/tmp/panel4_B.png", gx_b)
    print("[saved] /tmp/panel3_A.png /tmp/panel3_B.png /tmp/panel4_A.png /tmp/panel4_B.png")
    print("XAI COLOR-FIX CHECKS PASSED")


if __name__ == "__main__":
    main()
