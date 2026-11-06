import numpy as np
import pandas as pd
from sklearn.metrics import (
    confusion_matrix,
    classification_report,
    cohen_kappa_score,
    balanced_accuracy_score,
    roc_auc_score
)

def evaluate_dr_predictions(y_true, y_probs):
    """
    Args:
        y_true (np.ndarray): 1D array of ground truth integers [0..4]
        y_probs (np.ndarray): 2D array of predicted probabilities of shape (N, 5)
    """
    y_true = np.asarray(y_true, dtype=int)
    y_probs = np.asarray(y_probs, dtype=float)
    y_pred = y_probs.argmax(axis=1)
    
    classes = ["No DR", "Mild", "Moderate", "Severe", "PDR"]
    cm = confusion_matrix(y_true, y_pred, labels=list(range(5)))
    N = len(y_true)
    
    # Global Metrics
    acc = (y_pred == y_true).mean()
    bal_acc = balanced_accuracy_score(y_true, y_pred)
    qwk = cohen_kappa_score(y_true, y_pred, weights='quadratic')
    
    rep = classification_report(y_true, y_pred, target_names=classes, output_dict=True)
    macro_f1 = rep['macro avg']['f1-score']
    
    # Multiclass OvR ROC-AUC
    ovr_aucs = {}
    for i, cname in enumerate(classes):
        y_bin = (y_true == i).astype(int)
        ovr_aucs[cname] = roc_auc_score(y_bin, y_probs[:, i])
    macro_auc = roc_auc_score(y_true, y_probs, multi_class='ovr', average='macro')
    
    # Per-class summary
    records = []
    for i, cname in enumerate(classes):
        tp = cm[i, i]
        fp = cm[:, i].sum() - tp
        fn = cm[i, :].sum() - tp
        tn = N - (tp + fp + fn)
        records.append({
            "Class": cname,
            "Precision": tp / (tp + fp),
            "Recall (Sens)": tp / (tp + fn),
            "Specificity": tn / (tn + fp),
            "F1-Score": rep[cname]['f1-score'],
            "OvR ROC-AUC": ovr_aucs[cname],
            "Support": cm[i, :].sum()
        })
        
    df_metrics = pd.DataFrame(records)
    
    print("=== GLOBAL METRICS ===")
    print(f"Overall Accuracy : {acc*100:.2f}%")
    print(f"Balanced Accuracy: {bal_acc*100:.2f}%")
    print(f"QWK (Quadratic)  : {qwk:.4f}")
    print(f"Macro F1-Score   : {macro_f1:.4f}")
    print(f"Macro OvR ROC-AUC: {macro_auc:.4f}\n")
    print("=== PER-CLASS DIAGNOSTIC METRICS ===")
    print(df_metrics.to_string(index=False))
    print("\n=== CONFUSION MATRIX ===")
    print(pd.DataFrame(cm, index=classes, columns=classes))
    
    return {
        "accuracy": acc,
        "balanced_accuracy": bal_acc,
        "quadratic_weighted_kappa": qwk,
        "macro_f1": macro_f1,
        "macro_ovr_roc_auc": macro_auc,
        "per_class_table": df_metrics,
        "confusion_matrix": cm
    }

