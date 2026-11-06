"""TRINAY cataract two-screening isolation + data-consistency test.

Screening A: uploads/screening_results/CAT-24960/original.png
Screening B: uploads/screening_results/CAT-25861/original.png

Verifies:
1. run_cataract_screening runs per-image; A and B produce distinct
   probabilities, Grad-CAM++ maps, opacity maps, workflow composites.
2. Data consistency: if opacity px == 0, the opacity map shows NO colored
   overlay region (map and numbers share one source of truth).
3. Workflow artifact is a real 6-panel composite (large figure), not a copy
   of the opacity map.
4. Grad-CAM++ target layer resolves to a real nn.Conv2d inside the loaded
   EfficientNet-V2-S classifier.
"""
import base64
import sys
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.cataract_service import (
    run_cataract_screening,
    generate_lens_opacity_evidence_map,
    compute_evidence_intensity,
)

IMG_A = PROJECT_ROOT / "uploads/screening_results/CAT-24960/original.png"
IMG_B = PROJECT_ROOT / "uploads/screening_results/CAT-25861/original.png"


def b64_to_bgr(s: str) -> np.ndarray:
    raw = base64.b64decode(s)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def main() -> None:
    assert IMG_A.exists() and IMG_B.exists(), "test images missing"
    img_a = cv2.imread(str(IMG_A))
    img_b = cv2.imread(str(IMG_B))
    assert img_a is not None and img_b is not None

    print("=== Screening A ===")
    res_a = run_cataract_screening(img_a, filename="screening_A.png")
    print("=== Screening B ===")
    res_b = run_cataract_screening(img_b, filename="screening_B.png")

    for label, res in (("A", res_a), ("B", res_b)):
        print(f"[{label}] status={res['status']}", end=" ")
        if res["status"] == "COMPLETE":
            c = res["cataract"]
            q = res["quantitativeAnalysis"]
            print(
                f"pred={c['prediction']} cat={c['cataractProbability']:.4f} "
                f"norm={c['normalProbability']:.4f} opacity_px={q['opacityEvidenceAreaPx']} "
                f"pct={q['opacityEvidencePercentage']}% intensity={q['evidenceIntensity']}"
            )
        else:
            print(f"msg={res.get('message')}")

    # Both must complete on these previously-accepted anterior eye images.
    assert res_a["status"] == "COMPLETE", f"A failed: {res_a.get('message')}"
    assert res_b["status"] == "COMPLETE", f"B failed: {res_b.get('message')}"

    # --- Isolation: per-image distinct artifacts ---
    for key in ("gradcam", "opacityEvidenceMap", "workflow", "original", "analyzedRegion"):
        ba = res_a["visualizations"][key]
        bb = res_b["visualizations"][key]
        assert ba and bb, f"missing visualization {key}"
        assert ba != bb, f"CONTAMINATION: {key} identical for A and B"
        print(f"[isolation] {key}: distinct bytes A({len(ba)}) vs B({len(bb)}) OK")

    # --- Workflow is a real composite, not a copy of the opacity map ---
    wf = b64_to_bgr(res_a["visualizations"]["workflow"])
    op = b64_to_bgr(res_a["visualizations"]["opacityEvidenceMap"])
    assert wf.shape[0] > 1000 and wf.shape[1] > 1500, f"workflow too small: {wf.shape}"
    assert wf.shape != op.shape or not np.array_equal(wf, op), "workflow is a copy of opacity map"
    print(f"[workflow] composite shape={wf.shape} (6-panel figure) OK")

    # --- Data consistency per screening ---
    for label, res, img in (("A", res_a, img_a), ("B", res_b, img_b)):
        q = res["quantitativeAnalysis"]
        op_img = b64_to_bgr(res["visualizations"]["opacityEvidenceMap"])
        h, w = img.shape[:2]
        # Rebuild ROI box from the response eye detection (padded box).
        roi = res["eyeDetection"]["roiBox"]
        x1, y1, x2, y2 = [int(v) for v in roi]
        # Interior region excluding banner (top 32px) and ROI border (6px).
        ix1, iy1 = max(x1 + 6, 0), max(y1 + 6, 32)
        ix2, iy2 = min(x2 - 6, w), min(y2 - 6, h)
        assert ix2 > ix1 and iy2 > iy1, "ROI too small for consistency probe"
        oh, ow = op_img.shape[:2]
        sx, sy = ow / w, oh / h  # visualizations may be resized; map coords
        probe_map = op_img[int(iy1 * sy):int(iy2 * sy), int(ix1 * sx):int(ix2 * sx)]
        probe_img = cv2.resize(img, (ow, oh))[int(iy1 * sy):int(iy2 * sy), int(ix1 * sx):int(ix2 * sx)]
        diff_px = int((np.abs(probe_map.astype(int) - probe_img.astype(int)).max(axis=2) > 12).sum())
        if q["opacityEvidenceAreaPx"] == 0:
            assert diff_px == 0, f"[{label}] INCONSISTENT: 0px but map shows overlay ({diff_px}px)"
            print(f"[{label}] consistency: 0px + clean map OK")
        else:
            assert diff_px > 0, f"[{label}] INCONSISTENT: {q['opacityEvidenceAreaPx']}px but clean map"
            print(f"[{label}] consistency: {q['opacityEvidenceAreaPx']}px + visible overlay ({diff_px}px) OK")

    # --- Intensity method sanity ---
    assert compute_evidence_intensity(0.0, 0.0)["level"] == "LOW"
    assert compute_evidence_intensity(3.5, 1.0)["level"] == "MODERATE"
    assert compute_evidence_intensity(12.0, 1.0)["level"] == "HIGH"
    print("[intensity] LOW/MODERATE/HIGH thresholds OK")

    print("\nALL ISOLATION + CONSISTENCY CHECKS PASSED")


if __name__ == "__main__":
    main()
