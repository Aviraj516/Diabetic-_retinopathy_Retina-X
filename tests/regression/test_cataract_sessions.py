import os
import json
import base64
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:5001"

def run_test():
    print("=== TRINAY CATARACT 2-PATIENT ISOLATION TEST ===")
    
    # 1. Prepare images
    img1_path = "dist/assets/cataract-CFHSiLt_.jpg"
    img2_path = "uploads/screening_results/CAT-TEST-99/original.png"
    
    if not os.path.exists(img1_path):
        print(f"Error: {img1_path} not found")
        return
    if not os.path.exists(img2_path):
        # Fallback to another image if CAT-TEST-99/original.png not found
        img2_path = "uploads/screening_results/CAT-60268/eye_box.png"
        
    print(f"Patient A Image: {img1_path}")
    print(f"Patient B Image: {img2_path}")
    
    def post_multipart(url, fields, file_field, file_path):
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        body = bytearray()
        
        for k, v in fields.items():
            body.extend(f"--{boundary}\r\n".encode())
            body.extend(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode())
            body.extend(f"{v}\r\n".encode())
            
        filename = os.path.basename(file_path)
        content_type = "image/jpeg" if file_path.endswith(".jpg") else "image/png"
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode())
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
        with open(file_path, "rb") as f:
            body.extend(f.read())
        body.extend(b"\r\n")
        body.extend(f"--{boundary}--\r\n".encode())
        
        req = urllib.request.Request(url, data=bytes(body))
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())

    # Patient A
    print("\n--- Running Screening for Patient A: Anjali Sharma (PX-CAT-001) ---")
    fields_a = {
        "patientId": "PX-CAT-001",
        "patientName": "Anjali Sharma",
        "eyeSide": "Right Eye",
        "modality": "cataract"
    }
    res_a = post_multipart(f"{BASE_URL}/api/ml/cataract/analyze", fields_a, "image", img1_path)
    session_id_a = res_a.get("screening_id")
    prob_a = res_a.get("cataract_probability")
    result_a = res_a.get("cataract_prediction")
    quant_a = res_a.get("quantitativeAnalysis", {})
    vis_a = res_a.get("visualizations", {})
    
    print(f"Session A ID: {session_id_a}")
    print(f"Prediction: {result_a}")
    print(f"Cataract Probability: {prob_a * 100:.2f}%")
    print(f"Normal Probability: {res_a.get('normal_probability', 0) * 100:.2f}%")
    print(f"Visualizations present: {list(vis_a.keys())}")
    print(f"Quantitative Analysis: {quant_a}")
    
    assert session_id_a is not None, "Session ID for Patient A must not be None"
    assert "analyzedRegion" in vis_a, "Analyzed Region visualization missing in Patient A"
    assert "opacityEvidenceMap" in vis_a, "Opacity Evidence Map missing in Patient A"
    assert "gradcam" in vis_a, "Grad-CAM++ missing in Patient A"
    assert quant_a.get("analyzedRegionAreaPx", 0) > 0, "Analyzed Region Area must be > 0"
    
    # Patient B
    print("\n--- Running Screening for Patient B: Ramesh Patel (PX-CAT-002) ---")
    fields_b = {
        "patientId": "PX-CAT-002",
        "patientName": "Ramesh Patel",
        "eyeSide": "Left Eye",
        "modality": "cataract"
    }
    res_b = post_multipart(f"{BASE_URL}/api/ml/cataract/analyze", fields_b, "image", img2_path)
    session_id_b = res_b.get("screening_id")
    prob_b = res_b.get("cataract_probability")
    result_b = res_b.get("cataract_prediction")
    quant_b = res_b.get("quantitativeAnalysis", {})
    vis_b = res_b.get("visualizations", {})
    
    print(f"Session B ID: {session_id_b}")
    print(f"Prediction: {result_b}")
    print(f"Cataract Probability: {prob_b * 100:.2f}%")
    print(f"Normal Probability: {res_b.get('normal_probability', 0) * 100:.2f}%")
    print(f"Visualizations present: {list(vis_b.keys())}")
    print(f"Quantitative Analysis: {quant_b}")
    
    assert session_id_b is not None, "Session ID for Patient B must not be None"
    assert session_id_b != session_id_a, "Session IDs must be distinct"
    assert "analyzedRegion" in vis_b, "Analyzed Region visualization missing in Patient B"
    assert "opacityEvidenceMap" in vis_b, "Opacity Evidence Map missing in Patient B"
    
    # Verify GET /api/screenings/<id> for each session
    print("\n--- Verifying GET /api/screenings/<id> for isolation ---")
    req_get_a = urllib.request.Request(f"{BASE_URL}/api/screenings/{session_id_a}")
    with urllib.request.urlopen(req_get_a) as resp:
        resp_a = json.loads(resp.read().decode())
        record_a = resp_a.get("data") or resp_a.get("screening") or resp_a
        
    print(f"Fetched Record A Patient ID: {record_a.get('patientId')}")
    print(f"Fetched Record A Patient Name: {record_a.get('patientName')}")
    print(f"Fetched Record A Cataract Prob: {record_a.get('cataractProbability')}")
    print(f"Fetched Record A Has Analyzed Region: {bool(record_a.get('imageAnalyzedRegion'))}")
    print(f"Fetched Record A Has Opacity Evidence: {bool(record_a.get('imageOpacityEvidence'))}")
    print(f"Fetched Record A Quantitative: {record_a.get('quantitativeAnalysis')}")
    
    assert "Anjali Sharma" in str(record_a.get("patientName")), f"Expected Anjali Sharma, got {record_a.get('patientName')}"
    assert record_a.get("patientId") == "PX-CAT-001", f"Expected PX-CAT-001, got {record_a.get('patientId')}"
    
    req_get_b = urllib.request.Request(f"{BASE_URL}/api/screenings/{session_id_b}")
    with urllib.request.urlopen(req_get_b) as resp:
        resp_b = json.loads(resp.read().decode())
        record_b = resp_b.get("data") or resp_b.get("screening") or resp_b
        
    print(f"\nFetched Record B Patient ID: {record_b.get('patientId')}")
    print(f"Fetched Record B Patient Name: {record_b.get('patientName')}")
    print(f"Fetched Record B Cataract Prob: {record_b.get('cataractProbability')}")
    print(f"Fetched Record B Has Analyzed Region: {bool(record_b.get('imageAnalyzedRegion'))}")
    print(f"Fetched Record B Has Opacity Evidence: {bool(record_b.get('imageOpacityEvidence'))}")
    print(f"Fetched Record B Quantitative: {record_b.get('quantitativeAnalysis')}")
    
    assert "Ramesh Patel" in str(record_b.get("patientName")), f"Expected Ramesh Patel, got {record_b.get('patientName')}"
    assert record_b.get("patientId") == "PX-CAT-002", f"Expected PX-CAT-002, got {record_b.get('patientId')}"
    
    # Cross leakage checks
    assert record_a.get("patientId") != record_b.get("patientId"), "Cross leakage detected: patient IDs match"
    assert record_a.get("id") != record_b.get("id"), "Cross leakage detected: screening IDs match"
    
    print("\n>>> ALL TESTS PASSED: 100% ISOLATION CONFIRMED, ZERO LEAKAGE <<<")

if __name__ == "__main__":
    run_test()
