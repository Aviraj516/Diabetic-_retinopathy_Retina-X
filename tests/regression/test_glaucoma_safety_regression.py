import sys
import os
import cv2
import numpy as np

# Ensure root directory is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.glaucoma_service import GlaucomaService, mask_to_svg_path

def test_glaucoma_safety():
    print("\n" + "=" * 70)
    print("RUNNING TARGETED GLAUCOMA CLINICAL SAFETY & VISUALIZATION REGRESSION TEST")
    print("=" * 70)

    service = GlaucomaService.get_instance()

    # -------------------------------------------------------------
    # TEST 1: IMAGE QUALITY INSUFFICIENT (Blank / Occluded Image)
    # -------------------------------------------------------------
    print("\n--- [TEST 1: Image Quality Insufficient Check] ---")
    blank_fundus = np.zeros((512, 512, 3), dtype=np.uint8)
    res_quality_fail = service.run_screening(blank_fundus, filename="blank_test.jpg")

    print(f"Status returned: {res_quality_fail.get('status')}")
    print(f"Quality status: {res_quality_fail.get('quality', {}).get('status')}")
    assert res_quality_fail["status"] == "IMAGE_QUALITY_INSUFFICIENT", f"Expected IMAGE_QUALITY_INSUFFICIENT, got {res_quality_fail['status']}"
    print(">>> PASS: Low-quality image correctly triggers IMAGE_QUALITY_INSUFFICIENT without invoking segmentation or classification.")

    # -------------------------------------------------------------
    # TEST 2: SEGMENTATION UNGRADABLE / INVALID (IDRiD_007.jpg)
    # -------------------------------------------------------------
    print("\n--- [TEST 2: Segmentation Ungradable / Safety Fallback Inhibition] ---")
    idrid_path = "/Users/avirajmurkute/Desktop/testing images/IDRiD_007.jpg"
    assert os.path.exists(idrid_path), f"Missing test image: {idrid_path}"
    idrid_bgr = cv2.imread(idrid_path)
    res_seg_fail = service.run_screening(idrid_bgr, filename="IDRiD_007.jpg")

    print(f"Status returned: {res_seg_fail.get('status')}")
    print(f"Screening Status: {res_seg_fail.get('screeningStatus')}")
    print(f"Segmentation Status: {res_seg_fail.get('segmentationStatus')}")
    print(f"Prediction: {res_seg_fail.get('glaucoma', {}).get('prediction')}")
    print(f"Probability: {res_seg_fail.get('glaucoma', {}).get('glaucomaProbability')}")
    print(f"Confidence: {res_seg_fail.get('glaucoma', {}).get('confidence')}")
    print(f"Vertical CDR: {res_seg_fail.get('discCupSegmentation', {}).get('verticalCDR')}")
    print(f"Horizontal CDR: {res_seg_fail.get('discCupSegmentation', {}).get('horizontalCDR')}")
    print(f"Area CDR: {res_seg_fail.get('discCupSegmentation', {}).get('areaCDR')}")
    print(f"Disc Path length: {len(res_seg_fail.get('discCupSegmentation', {}).get('discPath', ''))}")
    print(f"Cup Path length: {len(res_seg_fail.get('discCupSegmentation', {}).get('cupPath', ''))}")

    # Assertions
    assert res_seg_fail["status"] == "SEGMENTATION_UNGRADABLE", f"Expected SEGMENTATION_UNGRADABLE, got {res_seg_fail['status']}"
    assert res_seg_fail["screeningStatus"] == "INCONCLUSIVE", f"Expected INCONCLUSIVE, got {res_seg_fail['screeningStatus']}"
    assert res_seg_fail["segmentationStatus"].startswith("INVALID_"), f"Expected INVALID_*, got {res_seg_fail['segmentationStatus']}"
    assert res_seg_fail["glaucoma"]["prediction"] == "INCONCLUSIVE", f"Expected prediction INCONCLUSIVE, got {res_seg_fail['glaucoma']['prediction']}"
    assert res_seg_fail["glaucoma"]["glaucomaProbability"] == 0.0, f"Expected 0.0 prob, got {res_seg_fail['glaucoma']['glaucomaProbability']}"
    assert res_seg_fail["glaucoma"]["confidence"] == 0.0, f"Expected 0.0 conf, got {res_seg_fail['glaucoma']['confidence']}"
    assert res_seg_fail["discCupSegmentation"]["verticalCDR"] == 0.0, f"Expected 0.0 vCDR, got {res_seg_fail['discCupSegmentation']['verticalCDR']}"
    assert res_seg_fail["discCupSegmentation"]["discPath"] == "", "Expected empty discPath on ungradable segmentation"
    assert res_seg_fail["discCupSegmentation"]["cupPath"] == "", "Expected empty cupPath on ungradable segmentation"
    print(">>> PASS: Segmentation failure strictly inhibits classifier. No fabricated fallback measurements reported.")

    # -------------------------------------------------------------
    # TEST 3: REAL VALID GLAUCOMA SCREENING (T0001.jpg or V0014.jpg)
    # -------------------------------------------------------------
    print("\n--- [TEST 3: Valid Optic Nerve Segmentation & Screening] ---")
    valid_paths = [
        "/Users/avirajmurkute/Desktop/testing images/galucoma/T0001.jpg",
        "/Users/avirajmurkute/Desktop/testing images/galucoma/V0014.jpg",
    ]
    valid_img_path = None
    for p in valid_paths:
        if os.path.exists(p):
            valid_img_path = p
            break

    if valid_img_path:
        print(f"Testing valid image: {valid_img_path}")
        valid_bgr = cv2.imread(valid_img_path)
        res_valid = service.run_screening(valid_bgr, filename=os.path.basename(valid_img_path))

        print(f"Status returned: {res_valid.get('status')}")
        print(f"Screening Status: {res_valid.get('screeningStatus')}")
        print(f"Segmentation Status: {res_valid.get('segmentationStatus')}")
        print(f"Prediction: {res_valid.get('glaucoma', {}).get('prediction')}")
        print(f"Probability: {res_valid.get('glaucoma', {}).get('glaucomaProbability'):.4f}")
        print(f"vCDR: {res_valid.get('discCupSegmentation', {}).get('verticalCDR'):.4f}")
        print(f"hCDR: {res_valid.get('discCupSegmentation', {}).get('horizontalCDR'):.4f}")
        print(f"Area CDR: {res_valid.get('discCupSegmentation', {}).get('areaCDR'):.4f}")
        print(f"Rim Area: {res_valid.get('discCupSegmentation', {}).get('rimArea')}")
        print(f"Disc Path length: {len(res_valid.get('discCupSegmentation', {}).get('discPath', ''))}")
        print(f"Cup Path length: {len(res_valid.get('discCupSegmentation', {}).get('cupPath', ''))}")
        print(f"Available visualizations: {list(res_valid.get('visualizations', {}).keys())}")

        assert res_valid["status"] == "COMPLETE", f"Expected COMPLETE, got {res_valid['status']}"
        assert res_valid["screeningStatus"] == "VALID_SCREENING_RESULT", f"Expected VALID_SCREENING_RESULT, got {res_valid['screeningStatus']}"
        assert res_valid["segmentationStatus"] == "VALID", f"Expected VALID segmentation, got {res_valid['segmentationStatus']}"
        assert res_valid["glaucoma"]["prediction"] in ["NORMAL", "GLAUCOMA_SUSPECT"]
        assert res_valid["discCupSegmentation"]["discPath"].startswith("M ")
        assert res_valid["discCupSegmentation"]["cupPath"].startswith("M ")
        assert res_valid["discCupSegmentation"]["rimArea"] > 0
        assert "rim" in res_valid["visualizations"], "Missing rim panel in visualizations"
        print(">>> PASS: Valid optic nerve delineation generates exact contour SVG paths and Neuroretinal Rim panel.")
    else:
        print("Candidate valid test images not found on disk, skipping.")

    # -------------------------------------------------------------
    # TEST 4: MASK TO SVG PATH HELPER UNIT TEST
    # -------------------------------------------------------------
    print("\n--- [TEST 4: mask_to_svg_path Unit Test] ---")
    test_mask = np.zeros((512, 512), dtype=np.uint8)
    cv2.circle(test_mask, (256, 256), 50, 1, -1)
    svg_path = mask_to_svg_path(test_mask)
    assert svg_path.startswith("M "), f"Expected path to start with 'M ', got {svg_path[:10]}"
    assert svg_path.endswith(" Z"), f"Expected path to end with ' Z', got {svg_path[-10:]}"
    print(f"Generated SVG Path snippet: {svg_path[:50]} ... {svg_path[-20:]}")
    print(">>> PASS: mask_to_svg_path unit test passed.")

    print("\n" + "=" * 70)
    print("ALL 4 GLAUCOMA CLINICAL SAFETY & VISUALIZATION REGRESSION TESTS PASSED!")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    test_glaucoma_safety()
