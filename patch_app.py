import re

with open("app.py", "r") as f:
    content = f.read()

# Add the new endpoint right before get_screenings_endpoint
new_endpoint = """
@app.route("/api/screenings/<screening_id>", methods=["GET", "OPTIONS"])
def get_screening_by_id_endpoint(screening_id):
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200
    headers = get_supabase_headers()
    if headers and SUPABASE_URL:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/screening_sessions?id=eq.{screening_id}&select=id,doctor_id,patient_id,screening_type,eye_side,status,started_at,completed_at,created_at,patients(id,patient_id,name,age,gender,phone),screening_results(id,verdict,probability,severity,image_quality,measurements,model_output,model_name,model_version,clinical_summary,recommendations,review_status,created_at),screening_artifacts(id,artifact_type,bucket_id,storage_path,mime_type,file_size_bytes,created_at)&limit=1",
                headers=headers,
                timeout=5
            )
            if resp.status_code == 200:
                sessions = resp.json() or []
                if not sessions:
                    return jsonify({"success": False, "error": "Not found"}), 404
                
                s = sessions[0]
                pat_raw = s.get("patients")
                pat = pat_raw[0] if isinstance(pat_raw, list) and pat_raw else (pat_raw if isinstance(pat_raw, dict) else {})
                
                res_raw = s.get("screening_results")
                res = res_raw[0] if isinstance(res_raw, list) and res_raw else (res_raw if isinstance(res_raw, dict) else {})
                
                art_raw = s.get("screening_artifacts")
                art_list = art_raw if isinstance(art_raw, list) else ([art_raw] if isinstance(art_raw, dict) else [])

                created_at_dt = s.get("created_at") or ""
                date_str = ""
                if created_at_dt:
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(created_at_dt.replace("Z", "+00:00"))
                        date_str = dt.strftime("%d %b %Y")
                    except Exception:
                        date_str = created_at_dt[:10]

                prob_val = res.get("probability")
                conf = int(round(float(prob_val) * 100)) if prob_val is not None else 85

                artifacts_dict = {}
                for a in art_list:
                    art_type = a.get("artifact_type")
                    storage_path = a.get("storage_path")
                    if art_type and storage_path:
                        artifacts_dict[art_type] = f"{SUPABASE_URL}/storage/v1/object/public/medical-screenings/{storage_path}"

                model_out = res.get("model_output") or {}
                measurements = res.get("measurements") or {}

                rec = {
                    "id": s.get("id"),
                    "session_id": s.get("id"),
                    "patientId": pat.get("patient_id") or pat.get("id") or s.get("patient_id"),
                    "patientDbId": pat.get("id") or s.get("patient_id"),
                    "patientName": pat.get("name") or "Patient information unavailable",
                    "patientAge": pat.get("age") or 50,
                    "patientGender": pat.get("gender") or "Other",
                    "patientPhone": pat.get("phone") or "",
                    "eye": s.get("eye_side") or "Right Eye",
                    "eyeSide": s.get("eye_side") or "Right Eye",
                    "screeningType": s.get("screening_type") or "dr",
                    "screening_type": s.get("screening_type") or "dr",
                    "status": "Completed" if str(s.get("status")).upper() == "COMPLETED" else "Review",
                    "date": date_str,
                    "createdAt": date_str,
                    "created_at": s.get("created_at"),
                    "drSeverity": res.get("severity") or res.get("verdict") or "No DR",
                    "drSeverityLevel": res.get("severity") or "Normal",
                    "cataractPrediction": res.get("verdict") or "NORMAL",
                    "glaucomaPrediction": res.get("verdict") or "NORMAL",
                    "verdict": res.get("verdict") or "NORMAL",
                    "diagnosis": res.get("severity") or res.get("verdict") or "Normal",
                    "severity": res.get("severity") or "Normal",
                    "confidence": conf,
                    "confidenceScore": conf,
                    "probability": prob_val,
                    "recommendation": res.get("recommendations") or "",
                    "clinicalSummary": res.get("clinical_summary") or "",
                    "imageOriginal": artifacts_dict.get("original_fundus") or artifacts_dict.get("original"),
                    "imageEyeDetection": artifacts_dict.get("eye_box") or artifacts_dict.get("original_fundus") or artifacts_dict.get("original"),
                    "imageIris": artifacts_dict.get("iris") or artifacts_dict.get("anatomy_map") or artifacts_dict.get("anatomy"),
                    "imagePupil": artifacts_dict.get("pupil") or artifacts_dict.get("anatomy_map") or artifacts_dict.get("anatomy"),
                    "imageAnatomyCombined": artifacts_dict.get("anatomy_map") or artifacts_dict.get("anatomy") or artifacts_dict.get("iris"),
                    "imageGradCam": artifacts_dict.get("gradcam") or artifacts_dict.get("combined_xai"),
                    "imageWorkflow": artifacts_dict.get("combined_xai") or artifacts_dict.get("workflow"),
                    "imageXai": artifacts_dict.get("gradcam") or artifacts_dict.get("xai") or artifacts_dict.get("combined_xai"),
                    "imageLesions": artifacts_dict.get("lesion_segmentation") or artifacts_dict.get("lesions"),
                    "imageAnatomy": artifacts_dict.get("vessel_segmentation") or artifacts_dict.get("anatomy_map") or artifacts_dict.get("anatomy"),
                    "artifacts": artifacts_dict,
                    "measurements": measurements,
                    "model_output": model_out,
                    "doctorSummary": (
                        "Anterior segment screening demonstrates clinically significant lens opacification in the crystalline lens within the pupillary aperture. Pupillary margins are intact without visible coloboma or synechiae. Visual axis compromise suspected. Recommendation: Comprehensive slit-lamp biomicroscopy and visual acuity testing with dilated fundus examination to assess cataract density (nuclear/cortical/posterior subcapsular) and determine surgical/medical candidacy."
                        if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity")))
                        else (
                            "Retinal fundus screening reveals microvascular changes consistent with diabetic retinopathy. Lesion mapping indicates capillary abnormalities requiring specialized retinal evaluation."
                            if (res.get("screening_type") == "dr" and res.get("verdict") not in ["No DR", "Normal", None])
                            else "Screening demonstrates normal ocular structures with no focal pathological lesions or significant opacifications. Optical axis and neuroretinal architecture remain intact."
                        )
                    ),
                    "patientSummary": (
                        "A clouding (cataract) was observed in the lens of your eye that can blur or dim your vision, like looking through a foggy window. This is very common and treatable. Please consult an eye specialist for an in-person eye exam to evaluate your vision and discuss treatment options."
                        if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity")))
                        else "Your eye examination shows healthy structures with no critical disease markers detected. Continue routine preventive eye care."
                    ),
                    "precautions": [
                        "Avoid unassisted night driving, especially under bright oncoming headlights that cause glare.",
                        "Wear UV-blocking sunglasses during daylight hours to protect the eyes from solar radiation.",
                        "Ensure adequate lighting for reading and detailed tasks to reduce eye strain.",
                        "Do not rub your eyes and avoid self-prescribed over-the-counter eye drops without a doctor's consultation.",
                        "Schedule a complete slit-lamp examination with an ophthalmologist."
                    ] if (res.get("verdict") == "CATARACT" or "Cataract" in str(res.get("severity"))) else [
                        "Maintain regular annual comprehensive eye health checkups.",
                        "Protect your eyes from prolonged direct sun exposure by wearing UV-rated sunglasses.",
                        "Maintain healthy hydration, balanced nutrition, and good illumination when reading."
                    ],
                    "result": {
                        "diagnosis": res.get("severity") or res.get("verdict") or "Normal",
                        "severity": res.get("severity") or "Normal",
                        "confidence": prob_val if prob_val is not None else 0.85,
                        "verdict": res.get("verdict"),
                        "cataract": model_out.get("cataract"),
                        "glaucoma": model_out.get("glaucoma"),
                        "measurements": measurements,
                        "clinicalSummary": res.get("clinical_summary"),
                        "artifacts": artifacts_dict,
                        "imageEyeDetection": artifacts_dict.get("eye_box"),
                        "imageIris": artifacts_dict.get("iris"),
                        "imagePupil": artifacts_dict.get("pupil"),
                        "imageAnatomyCombined": artifacts_dict.get("anatomy_map") or artifacts_dict.get("anatomy"),
                        "imageGradCam": artifacts_dict.get("gradcam"),
                        "imageWorkflow": artifacts_dict.get("combined_xai") or artifacts_dict.get("workflow"),
                        "imageXai": artifacts_dict.get("gradcam") or artifacts_dict.get("xai")
                    }
                }
                return jsonify({"success": True, "screening": rec, "data": rec})
        except Exception as e:
            print(f"[Get Screening By ID Warning] {e}")
    return jsonify({"success": False, "error": "Internal error"}), 500

@app.route("/api/screenings", methods=["GET", "OPTIONS"])
"""

content = content.replace('@app.route("/api/screenings", methods=["GET", "OPTIONS"])', new_endpoint)

with open("app.py", "w") as f:
    f.write(content)
