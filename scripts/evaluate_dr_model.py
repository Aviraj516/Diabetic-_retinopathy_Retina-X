#!/usr/bin/env python3
"""
Empirical Evaluation and ROC / AUC Calculation Engine for Diabetic Retinopathy
Model: dr_severity_efficientnet_b0.pth (PyTorch EfficientNet-B0)

Usage:
    # 1. Run inference & compute ROC/AUC from a dataset with CSV labels:
    python scripts/evaluate_dr_model.py --image_dir /path/to/images --labels_csv /path/to/labels.csv

    # 2. Run diagnostic validation on existing test images:
    python scripts/evaluate_dr_model.py --self_test
"""

import os
import sys
import glob
import json
import argparse
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torchvision import models, transforms
from sklearn.metrics import (
    roc_curve,
    auc,
    roc_auc_score,
    confusion_matrix,
    classification_report,
    cohen_kappa_score
)
import matplotlib.pyplot as plt

# DR Severity definitions (5-stage International Clinical Diabetic Retinopathy scale)
DR_CLASSES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]

def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")

def load_severity_model(model_path="model/dr_severity_efficientnet_b0.pth", device=None):
    if device is None:
        device = get_device()
        
    print(f"[Model Loader] Initializing EfficientNet-B0 on device: {device}")
    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, 5)

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model checkpoint not found at: {model_path}")

    ckpt = torch.load(model_path, map_location=device, weights_only=False)
    state = ckpt.get("model_state_dict", ckpt.get("state_dict", ckpt)) if isinstance(ckpt, dict) else ckpt
    model.load_state_dict(state, strict=False)
    model.to(device).eval()
    print(f"[Model Loader] Successfully loaded weights from {model_path}")
    return model, device

def get_preprocessing_pipeline():
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

def evaluate_dataset(model, device, image_dir, labels_csv, out_dir="outputs/evaluation"):
    os.makedirs(out_dir, exist_ok=True)
    df = pd.read_csv(labels_csv)
    tf = get_preprocessing_pipeline()
    
    # Expect columns 'image_id' (or 'image_name') and 'label' (or 'dr_grade')
    id_col = [c for c in df.columns if c.lower() in ['image_id', 'id', 'filename', 'image_name', 'name']][0]
    label_col = [c for c in df.columns if c.lower() in ['label', 'dr_grade', 'severity', 'grade', 'class']][0]
    
    y_true = []
    y_probs = []
    
    print(f"[Evaluation] Processing {len(df)} images from {image_dir}...")
    for idx, row in df.iterrows():
        img_name = str(row[id_col])
        if not (img_name.endswith('.jpg') or img_name.endswith('.png') or img_name.endswith('.jpeg')):
            candidates = glob.glob(os.path.join(image_dir, f"{img_name}.*"))
            if candidates:
                img_path = candidates[0]
            else:
                continue
        else:
            img_path = os.path.join(image_dir, img_name)
            
        if not os.path.exists(img_path):
            continue
            
        try:
            pil_img = Image.open(img_path).convert("RGB")
            tensor = tf(pil_img).unsqueeze(0).to(device)
            with torch.no_grad():
                logits = model(tensor)
                probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
            
            y_true.append(int(row[label_col]))
            y_probs.append(probs)
        except Exception as e:
            print(f"Error processing {img_path}: {e}")
            
    y_true = np.array(y_true)
    y_probs = np.array(y_probs)
    
    compute_and_save_metrics(y_true, y_probs, out_dir)

def compute_and_save_metrics(y_true, y_probs, out_dir="outputs/evaluation"):
    os.makedirs(out_dir, exist_ok=True)
    trapz = getattr(np, 'trapezoid', getattr(np, 'trapz', None))
    
    # 1. Multi-class OvR ROC
    ovr_aucs = {}
    plt.figure(figsize=(9, 8), dpi=300)
    for i, c_name in enumerate(DR_CLASSES):
        y_binary = (y_true == i).astype(int)
        if len(np.unique(y_binary)) > 1:
            fpr, tpr, _ = roc_curve(y_binary, y_probs[:, i])
            roc_auc = trapz(tpr, fpr)
            ovr_aucs[c_name] = float(roc_auc)
            plt.plot(fpr, tpr, lw=2.2, label=f'{c_name} (AUC = {roc_auc:.3f})')
            
    plt.plot([0, 1], [0, 1], color='#94A3B8', linestyle='--')
    plt.xlabel('False Positive Rate (1 – Specificity)')
    plt.ylabel('True Positive Rate (Sensitivity)')
    plt.title('Empirical Multi-Class One-vs-Rest ROC Curves')
    plt.legend(loc='lower right')
    plt.grid(True)
    plt.savefig(os.path.join(out_dir, "empirical_multiclass_roc.png"), bbox_inches='tight')
    plt.close()
    
    # 2. Binary Referable DR (Stage >= 2 vs Stage < 2)
    y_ref_true = (y_true >= 2).astype(int)
    # Referable prob = sum of probs for moderate, severe, pdr
    y_ref_prob = y_probs[:, 2:].sum(axis=1)
    
    if len(np.unique(y_ref_true)) > 1:
        fpr_ref, tpr_ref, thresholds = roc_curve(y_ref_true, y_ref_prob)
        auc_ref = trapz(tpr_ref, fpr_ref)
        
        plt.figure(figsize=(8.5, 7.5), dpi=300)
        plt.plot(fpr_ref, tpr_ref, color='#0D9488', lw=2.8, label=f'Referable DR ROC (AUC = {auc_ref:.3f})')
        plt.plot([0, 1], [0, 1], color='#94A3B8', linestyle='--')
        plt.xlabel('False Positive Rate')
        plt.ylabel('True Positive Rate')
        plt.title('Empirical Referable DR Screening ROC Curve')
        plt.legend(loc='lower right')
        plt.grid(True)
        plt.savefig(os.path.join(out_dir, "empirical_referable_roc.png"), bbox_inches='tight')
        plt.close()
        
        # Best operating point
        youden = tpr_ref - fpr_ref
        best_idx = np.argmax(youden)
        best_thresh = thresholds[best_idx]
        best_sens = tpr_ref[best_idx]
        best_spec = 1.0 - fpr_ref[best_idx]
    else:
        auc_ref = None
        best_thresh = None
        best_sens = None
        best_spec = None

    # Summary metrics
    preds = y_probs.argmax(axis=1)
    acc = float((preds == y_true).mean())
    qwk = float(cohen_kappa_score(y_true, preds, weights='quadratic'))
    
    metrics = {
        "accuracy": acc,
        "quadratic_weighted_kappa": qwk,
        "referable_dr_auc": auc_ref,
        "optimal_threshold": float(best_thresh) if best_thresh is not None else None,
        "optimal_sensitivity": float(best_sens) if best_sens is not None else None,
        "optimal_specificity": float(best_spec) if best_spec is not None else None,
        "per_class_ovr_auc": ovr_aucs
    }
    
    json_path = os.path.join(out_dir, "evaluation_metrics.json")
    with open(json_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"\n[Evaluation Complete] Metrics exported to {json_path}")
    print(json.dumps(metrics, indent=2))

def run_self_test(model, device):
    print("\n--- Running Diagnostic Self-Test on Available Retinal Images ---")
    tf = get_preprocessing_pipeline()
    
    sample_files = glob.glob("test_images/*.jpg") + glob.glob("test_images/*.png")
    if not sample_files:
        sample_files = glob.glob("uploads/screening_results/SCR-*/original.png")[:5]
        
    for path in sample_files:
        try:
            img = Image.open(path).convert("RGB")
            tensor = tf(img).unsqueeze(0).to(device)
            with torch.no_grad():
                probs = torch.softmax(model(tensor), dim=1)[0].cpu().numpy()
            pred = probs.argmax()
            ref_prob = float(probs[2:].sum())
            print(f"\nFile: {path}")
            print(f"Predicted Grade : {DR_CLASSES[pred]} (Level {pred})")
            print(f"Confidence      : {probs[pred]*100:.2f}%")
            print(f"Referable DR Prob: {ref_prob*100:.2f}% (Threshold ≥ 38% triggers referral)")
            print(f"Class Probs     : {[round(float(p), 4) for p in probs]}")
        except Exception as e:
            print(f"Could not process {path}: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Evaluate Diabetic Retinopathy Model")
    parser.add_argument("--image_dir", type=str, help="Directory containing fundus test images")
    parser.add_argument("--labels_csv", type=str, help="Path to ground-truth CSV")
    parser.add_argument("--self_test", action="store_true", help="Run self-test on available sample images")
    parser.add_argument("--out_dir", type=str, default="outputs/evaluation", help="Output directory")
    args = parser.parse_args()

    model, device = load_severity_model()
    
    if args.self_test or (not args.image_dir and not args.labels_csv):
        run_self_test(model, device)
    elif args.image_dir and args.labels_csv:
        evaluate_dataset(model, device, args.image_dir, args.labels_csv, args.out_dir)
    else:
        print("Please provide both --image_dir and --labels_csv, or use --self_test.")
