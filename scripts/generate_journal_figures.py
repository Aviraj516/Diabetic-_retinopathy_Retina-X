#!/usr/bin/env python3
"""
Generate 8 High-Resolution Academic Vector Diagrams for the TRINAY Academic Journal.
These diagrams represent the verified AI/ML system architecture, model workflows,
U-Net mechanics, and clinical decision support integration.
"""

import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Headless backend
plt.switch_backend('Agg')

OUT_DIR = "docs/figures/diagrams"
os.makedirs(OUT_DIR, exist_ok=True)

# Common styling constants
NAVY = "#1E3A8A"
DARK_SLATE = "#1E293B"
LIGHT_SLATE = "#F8FAFC"
BORDER_SLATE = "#64748B"
BLUE = "#2563EB"
SKY = "#0284C7"
EMERALD = "#059669"
AMBER = "#D97706"
ROSE = "#E11D48"
PURPLE = "#7C3AED"
WHITE = "#FFFFFF"

def draw_box(ax, x, y, w, h, title, subtitle="", color=WHITE, border=BORDER_SLATE, text_color=DARK_SLATE, title_size=10, sub_size=8, lw=1.5, radius=0.02):
    fancy = patches.FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.01,rounding_size={radius}",
        facecolor=color,
        edgecolor=border,
        linewidth=lw,
        mutation_aspect=1.0,
        zorder=2
    )
    ax.add_patch(fancy)
    
    if subtitle:
        ax.text(x + w/2, y + h*0.62, title, ha='center', va='center', fontsize=title_size, fontweight='bold', color=text_color, zorder=3)
        ax.text(x + w/2, y + h*0.32, subtitle, ha='center', va='center', fontsize=sub_size, color=text_color, zorder=3)
    else:
        ax.text(x + w/2, y + h/2, title, ha='center', va='center', fontsize=title_size, fontweight='bold', color=text_color, zorder=3)

def draw_arrow(ax, x1, y1, x2, y2, color=BORDER_SLATE, lw=1.5, style='->'):
    ax.annotate(
        '', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle=style, color=color, lw=lw, shrinkA=4, shrinkB=4, mutation_scale=12),
        zorder=1
    )

# -------------------------------------------------------------
# Figure 1: Overall Conceptual System Architecture
# -------------------------------------------------------------
def generate_figure1():
    fig, ax = plt.subplots(figsize=(11, 6), dpi=300)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6)
    ax.axis('off')

    # Background canvas card
    ax.add_patch(patches.Rectangle((0.1, 0.1), 10.8, 5.8, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))

    # Header title inside plot
    ax.text(5.5, 5.55, "TRINAY Conceptual Multi-Disease AI Screening Architecture", ha='center', va='center', fontsize=12, fontweight='bold', color=NAVY)
    ax.text(5.5, 5.30, "Modular Inference, Feature Extraction, Explainable AI, and Clinical Decision Support Workflow", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # 1. Image Acquisition
    draw_box(ax, 0.4, 3.2, 1.6, 1.2, "Ocular Image\nAcquisition", "Fundus & Anterior\nDigital Cameras", color="#EFF6FF", border=BLUE)

    # Arrow to Quality Triage Gate
    draw_arrow(ax, 2.0, 3.8, 2.5, 3.8, color=BLUE)

    # 2. Quality Triage Gate
    draw_box(ax, 2.5, 3.1, 1.8, 1.4, "Optical Quality Gate", "Random Forest (6 Feats)\n& MobileNetV3-Small", color="#FEF3C7", border=AMBER)

    # Branch: Ungradable Reject
    draw_arrow(ax, 3.4, 3.1, 3.4, 1.6, color=ROSE)
    draw_box(ax, 2.5, 0.6, 1.8, 0.9, "Ungradable / Reject", "Immediate Recapture Alert\n(Quality Score < 0.40)", color="#FFE4E6", border=ROSE, text_color=ROSE)

    # Branch: Disease Screening Routing
    draw_arrow(ax, 4.3, 4.2, 4.9, 4.6, color=BLUE) # DR
    draw_arrow(ax, 4.3, 3.8, 4.9, 3.8, color=EMERALD) # Glaucoma
    draw_arrow(ax, 4.3, 3.4, 4.9, 2.8, color=PURPLE) # Cataract

    # 3. Disease Modules
    # Diabetic Retinopathy
    draw_box(ax, 4.9, 4.3, 2.2, 0.9, "Diabetic Retinopathy", "EffNet-B0 + 4 U-Nets\nLesions, Vessels, Anatomy", color="#EFF6FF", border=BLUE)
    # Glaucoma
    draw_box(ax, 4.9, 3.3, 2.2, 0.9, "Glaucoma Screening", "Attention U-Net (Disc/Cup)\n+ RF (10 Morphometrics)", color="#ECFDF5", border=EMERALD)
    # Cataract
    draw_box(ax, 4.9, 2.3, 2.2, 0.9, "Cataract Pipeline", "YOLO + Iris/Pupil U-Nets\n+ EffNet-V2-S (CBAM)", color="#FAF5FF", border=PURPLE)

    # Merging Arrows to Explainable AI
    draw_arrow(ax, 7.1, 4.75, 7.6, 4.2, color=BLUE)
    draw_arrow(ax, 7.1, 3.75, 7.6, 3.75, color=EMERALD)
    draw_arrow(ax, 7.1, 2.75, 7.6, 3.3, color=PURPLE)

    # 4. Explainable AI & Feature Extraction
    draw_box(ax, 7.6, 2.8, 1.6, 1.8, "Explainable AI (XAI)\n& Biomarkers", "• Fast Integrated Gradients\n• Grad-CAM & Grad-CAM++\n• SHAP TreeExplainer\n• Morphometric Telemetry", color="#FFFBEB", border=AMBER, sub_size=7)

    # Arrow to Decision Support
    draw_arrow(ax, 9.2, 3.7, 9.5, 3.7, color=NAVY)

    # 5. Clinical Knowledge & Decision Support
    draw_box(ax, 9.5, 2.5, 1.2, 2.4, "Clinical\nDecision\nSupport", "Concordance\nEngine\n+ Guidelines\n(ICO / WHO)\n+ Multilingual\nReport", color="#F1F5F9", border=NAVY, sub_size=7)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure1_system_architecture.png"), bbox_inches='tight')
    plt.close(fig)

# -------------------------------------------------------------
# Figure 2: Image Quality Assessment Workflow
# -------------------------------------------------------------
def generate_figure2():
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')

    ax.add_patch(patches.Rectangle((0.1, 0.1), 9.8, 5.3, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))
    ax.text(5.0, 5.1, "Fundus Image Quality Gate & Feature Extraction Workflow", ha='center', va='center', fontsize=11, fontweight='bold', color=NAVY)
    ax.text(5.0, 4.85, "Six Objective Optical Biomarkers Evaluated via Random Forest Triage Classifier", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # Input Fundus Image
    draw_box(ax, 0.4, 2.2, 1.5, 1.5, "Input Retinal\nPhotograph", "Color Fundus\n(RGB BGR Array)", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 1.9, 2.95, 2.4, 2.95, color=BLUE)

    # Optical Feature Extraction Box
    ax.add_patch(patches.FancyBboxPatch((2.4, 0.6), 2.8, 4.0, boxstyle="round,pad=0.01,rounding_size=0.02", facecolor="#FFFFFF", edgecolor=BORDER_SLATE, lw=1.2, zorder=1))
    ax.text(3.8, 4.35, "Mathematical Feature Extraction", ha='center', va='center', fontsize=9.5, fontweight='bold', color=NAVY)

    feats = [
        ("1. Sharpness (S)", "Var(Laplacian(I_gray))"),
        ("2. Brightness (μ_B)", "Mean pixel intensity across FOV"),
        ("3. Uniformity (U)", "Ratio of center to mean luminance"),
        ("4. RMS Contrast (C_rms)", "Standard deviation within FOV"),
        ("5. Noise Estimate (σ_N)", "High-freq Gaussian residual std"),
        ("6. Field of View (R_fov)", "Illuminated retinal pixel fraction")
    ]
    for idx, (ftit, fsub) in enumerate(feats):
        fy = 3.8 - idx * 0.58
        draw_box(ax, 2.55, fy, 2.5, 0.48, ftit, fsub, color="#F8FAFC", border="#94A3B8", title_size=8, sub_size=6.8, lw=0.8)

    draw_arrow(ax, 5.2, 2.95, 5.7, 2.95, color=DARK_SLATE)

    # Random Forest Classifier
    draw_box(ax, 5.7, 2.1, 1.7, 1.7, "Random Forest\nClassifier", "300 Decision Trees\nMax Depth: 12\nMulticlass Scoring", color="#FEF3C7", border=AMBER)

    # Arrows to 3 Tiers
    draw_arrow(ax, 7.4, 3.2, 7.9, 4.0, color=EMERALD)
    draw_arrow(ax, 7.4, 2.95, 7.9, 2.95, color=AMBER)
    draw_arrow(ax, 7.4, 2.7, 7.9, 1.9, color=ROSE)

    # 3-Tier Categorization
    draw_box(ax, 7.9, 3.65, 1.7, 0.8, "Good Quality", "Score ≥ 0.65\nProceed to Screening", color="#ECFDF5", border=EMERALD, text_color=EMERALD)
    draw_box(ax, 7.9, 2.55, 1.7, 0.8, "Borderline Quality", "0.40 ≤ Score < 0.65\nSurveillance Warning", color="#FFFBEB", border=AMBER, text_color=AMBER)
    draw_box(ax, 7.9, 1.45, 1.7, 0.8, "Ungradable Quality", "Score < 0.40\nScreening Inhibited / Retake", color="#FFE4E6", border=ROSE, text_color=ROSE)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure2_quality_assessment_workflow.png"), bbox_inches='tight')
    plt.close(fig)

# -------------------------------------------------------------
# Figure 3: Diabetic Retinopathy Multi-Model Workflow
# -------------------------------------------------------------
def generate_figure3():
    fig, ax = plt.subplots(figsize=(11, 6), dpi=300)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6)
    ax.axis('off')

    ax.add_patch(patches.Rectangle((0.1, 0.1), 10.8, 5.8, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))
    ax.text(5.5, 5.6, "Diabetic Retinopathy Multi-Model Diagnostic Pipeline", ha='center', va='center', fontsize=11.5, fontweight='bold', color=NAVY)
    ax.text(5.5, 5.32, "Parallel Severity Staging, Anatomical Landmark Extraction, 4-Channel Lesion Segmentation, and XAI", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # Input image
    draw_box(ax, 0.3, 2.3, 1.5, 1.4, "Gradable Fundus\nPhotograph", "512 × 512 & 224 × 224\nNormalized Arrays", color="#EFF6FF", border=BLUE)

    # Split to 5 parallel paths
    draw_arrow(ax, 1.8, 3.3, 2.3, 4.6, color=BLUE)
    draw_arrow(ax, 1.8, 3.1, 2.3, 3.6, color=EMERALD)
    draw_arrow(ax, 1.8, 2.9, 2.3, 2.6, color=AMBER)
    draw_arrow(ax, 1.8, 2.7, 2.3, 1.6, color=PURPLE)
    draw_arrow(ax, 1.8, 2.5, 2.3, 0.6, color=ROSE)

    # Models
    draw_box(ax, 2.3, 4.3, 2.2, 0.8, "DR Severity Staging", "EfficientNet-B0 (224×224)\n5 ICDR Clinical Classes", color="#EFF6FF", border=BLUE)
    draw_box(ax, 2.3, 3.3, 2.2, 0.8, "Vessel Segmentation", "smp U-Net (EffNet-B0 enc)\nBinary Vasculature Mask", color="#ECFDF5", border=EMERALD)
    draw_box(ax, 2.3, 2.3, 2.2, 0.8, "Optic Disc Segmentation", "smp U-Net (EffNet-B0 enc)\nNerve Head Boundary", color="#FFFBEB", border=AMBER)
    draw_box(ax, 2.3, 1.3, 2.2, 0.8, "Fovea Localization", "FoveaNet (EffNet-B0)\nCoordinate Pair (x, y)", color="#FAF5FF", border=PURPLE)
    draw_box(ax, 2.3, 0.3, 2.2, 0.8, "Focal Lesions U-Net", "4-Channel Standard U-Net\n[MA, HE, EX, SE]", color="#FFE4E6", border=ROSE)

    # Convergence to Spatial Integration & XAI
    draw_arrow(ax, 4.5, 4.7, 5.0, 3.8, color=BLUE)
    draw_arrow(ax, 4.5, 3.7, 5.0, 3.5, color=EMERALD)
    draw_arrow(ax, 4.5, 2.7, 5.0, 3.2, color=AMBER)
    draw_arrow(ax, 4.5, 1.7, 5.0, 2.9, color=PURPLE)
    draw_arrow(ax, 4.5, 0.7, 5.0, 2.6, color=ROSE)

    # Spatial Integration
    draw_box(ax, 5.0, 2.2, 2.2, 1.8, "Spatial Integration &\nBiomarker Extraction", "• Vessel Density (Global & Macula)\n• Disc-to-Fovea Distance (D_DF)\n• Macular Edema Risk (EX in ROI)\n• Lesion Counts & Surface Areas", color="#FFFFFF", border=BORDER_SLATE, sub_size=7)

    # Fast Integrated Gradients
    draw_arrow(ax, 4.5, 4.7, 7.6, 4.6, color=BLUE)
    draw_box(ax, 7.6, 4.1, 1.6, 1.1, "Fast Integrated\nGradients (XAI)", "Captum IG (192×192)\n2-step Riemann Integral", color="#FFFBEB", border=AMBER, sub_size=7)

    draw_arrow(ax, 7.2, 3.1, 7.6, 3.1, color=DARK_SLATE)
    draw_arrow(ax, 8.4, 4.1, 8.8, 3.6, color=AMBER)

    # Decision-Support & Concordance
    draw_box(ax, 7.6, 2.2, 1.6, 1.6, "Clinical Concordance\nEngine", "Classifier vs Lesions\n• Concordant Negative\n• Concordant Positive\n• Discrepant Review", color="#F1F5F9", border=NAVY, sub_size=7)

    draw_arrow(ax, 9.2, 3.0, 9.5, 3.0, color=NAVY)

    # Final Clinical Report
    draw_box(ax, 9.5, 2.0, 1.2, 2.0, "Clinical\nReport\n& Review", "Structured\nOphthalmology\nSummary &\nReferral Tier", color="#EFF6FF", border=BLUE, sub_size=7)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure3_dr_pipeline_workflow.png"), bbox_inches='tight')
    plt.close(fig)

# -------------------------------------------------------------
# Figure 4: U-Net Encoder-Decoder Architecture
# -------------------------------------------------------------
def generate_figure4():
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')

    ax.add_patch(patches.Rectangle((0.1, 0.1), 9.8, 5.3, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))
    ax.text(5.0, 5.15, "U-Net Encoder-Decoder Architecture for Medical Image Segmentation", ha='center', va='center', fontsize=11.5, fontweight='bold', color=NAVY)
    ax.text(5.0, 4.90, "Contracting Encoder, Spatial Bottleneck, Skip Connections, and Expanding Decoder", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # Encoder Blocks (Left)
    draw_box(ax, 0.4, 3.9, 1.4, 0.7, "Input 512×512", "3 Channels (RGB)", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 1.1, 3.9, 1.1, 3.4, color=BLUE)

    draw_box(ax, 0.4, 2.8, 1.4, 0.6, "Conv Block 1", "64 Channels (512²)", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 1.1, 2.8, 1.1, 2.3, color=BLUE)

    draw_box(ax, 0.5, 1.8, 1.2, 0.5, "Conv Block 2", "128 Ch (256²)", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 1.1, 1.8, 1.8, 1.4, color=BLUE)

    draw_box(ax, 1.8, 1.0, 1.2, 0.5, "Conv Block 3", "256 Ch (128²)", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 2.4, 1.0, 3.2, 0.8, color=BLUE)

    draw_box(ax, 3.2, 0.4, 1.4, 0.5, "Conv Block 4", "512 Ch (64²)", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 4.6, 0.65, 5.2, 0.65, color=DARK_SLATE)

    # Bottleneck
    draw_box(ax, 5.2, 0.35, 1.5, 0.6, "Bottleneck", "1024 Channels (32²)\nLatent Embedding", color="#FEF3C7", border=AMBER)
    draw_arrow(ax, 6.7, 0.65, 7.3, 0.8, color=EMERALD)

    # Decoder Blocks (Right)
    draw_box(ax, 7.3, 0.8, 1.4, 0.5, "Up-Block 4", "512 Ch (64²)", color="#ECFDF5", border=EMERALD)
    draw_arrow(ax, 8.0, 1.3, 8.0, 1.7, color=EMERALD)

    draw_box(ax, 7.3, 1.7, 1.4, 0.5, "Up-Block 3", "256 Ch (128²)", color="#ECFDF5", border=EMERALD)
    draw_arrow(ax, 8.0, 2.2, 8.0, 2.6, color=EMERALD)

    draw_box(ax, 7.3, 2.6, 1.4, 0.5, "Up-Block 2", "128 Ch (256²)", color="#ECFDF5", border=EMERALD)
    draw_arrow(ax, 8.0, 3.1, 8.0, 3.5, color=EMERALD)

    draw_box(ax, 7.3, 3.5, 1.4, 0.5, "Up-Block 1", "64 Ch (512²)", color="#ECFDF5", border=EMERALD)
    draw_arrow(ax, 8.0, 4.0, 8.0, 4.4, color=EMERALD)

    draw_box(ax, 7.1, 4.4, 1.8, 0.6, "1×1 Conv Head", "Sigmoid [MA, HE, EX, SE]\nor Binary Mask", color="#FFE4E6", border=ROSE)

    # Horizontal Skip Connections (Dotted Arrows)
    ax.annotate('', xy=(7.3, 3.75), xytext=(1.8, 3.1), arrowprops=dict(arrowstyle='->', color='#94A3B8', lw=1.2, ls='--'))
    ax.text(4.5, 3.6, "Skip Connection: Spatial Edge Details (512²)", ha='center', va='center', fontsize=7, color='#64748B')

    ax.annotate('', xy=(7.3, 2.85), xytext=(1.7, 2.05), arrowprops=dict(arrowstyle='->', color='#94A3B8', lw=1.2, ls='--'))
    ax.text(4.5, 2.65, "Skip Connection: Texture & Contour (256²)", ha='center', va='center', fontsize=7, color='#64748B')

    ax.annotate('', xy=(7.3, 1.95), xytext=(3.0, 1.25), arrowprops=dict(arrowstyle='->', color='#94A3B8', lw=1.2, ls='--'))
    ax.text(5.0, 1.75, "Skip Connection: Regional Semantics (128²)", ha='center', va='center', fontsize=7, color='#64748B')

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure4_unet_architecture.png"), bbox_inches='tight')
    plt.close(fig)

# -------------------------------------------------------------
# Figure 5: Glaucoma Screening Pipeline Workflow
# -------------------------------------------------------------
def generate_figure5():
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')

    ax.add_patch(patches.Rectangle((0.1, 0.1), 9.8, 5.3, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))
    ax.text(5.0, 5.15, "Glaucoma Screening & Structural Morphometry Pipeline", ha='center', va='center', fontsize=11.5, fontweight='bold', color=NAVY)
    ax.text(5.0, 4.90, "Attention U-Net Disc/Cup Segmentation, 10-Feature Vector, RF Classification & Safety Fallback", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # 1. Input
    draw_box(ax, 0.3, 2.3, 1.5, 1.3, "Retinal Fundus\nImage", "512 × 512 RGB\nImageNet Norm", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 1.8, 2.95, 2.3, 2.95, color=BLUE)

    # 2. Attention U-Net
    draw_box(ax, 2.3, 2.1, 1.8, 1.7, "Attention U-Net\nDisc & Cup", "Additive Spatial Gates\n3-Class Segmentation\n{0: BG, 1: Disc, 2: Cup}", color="#ECFDF5", border=EMERALD)
    draw_arrow(ax, 4.1, 2.95, 4.6, 2.95, color=EMERALD)

    # 3. Geometric Validation & Extraction
    draw_box(ax, 4.6, 2.0, 1.9, 1.9, "Geometric Validation\n& Feature Extraction", "• MIN_DISC: 500 px\n• MIN_CUP: 50 px\n• Inside Ratio ≥ 90%\n• Bounding Boxes", color="#FFFFFF", border=BORDER_SLATE, sub_size=7)

    # Branch: Failure Safety Fallback
    draw_arrow(ax, 5.55, 2.0, 5.55, 1.1, color=ROSE)
    draw_box(ax, 4.4, 0.3, 2.3, 0.8, "Segmentation Inconclusive", "Inhibits Classifier; Triggers Human\nOphthalmologist Review (Not Normal)", color="#FFE4E6", border=ROSE, text_color=ROSE, sub_size=7)

    # Branch: Valid 10 Morphometrics
    draw_arrow(ax, 6.5, 2.95, 7.0, 2.95, color=EMERALD)

    # 4. 10 Features
    draw_box(ax, 7.0, 2.2, 1.4, 1.5, "10-Feature Vector", "vCDR, hCDR, AreaCDR,\nDisc & Cup W/H,\nAreas & Inside Ratio", color="#FFFBEB", border=AMBER, sub_size=7)
    draw_arrow(ax, 8.4, 2.95, 8.7, 2.95, color=AMBER)

    # 5. Random Forest & SHAP
    draw_box(ax, 8.7, 1.8, 1.1, 2.3, "Random\nForest\nClassifier", "150 Trees\nThreshold: 0.50\n+ SHAP\nTreeExplainer\nAttribution", color="#F1F5F9", border=NAVY, sub_size=7)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure5_glaucoma_pipeline_workflow.png"), bbox_inches='tight')
    plt.close(fig)

# -------------------------------------------------------------
# Figure 6: Cataract Pipeline Workflow
# -------------------------------------------------------------
def generate_figure6():
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')

    ax.add_patch(patches.Rectangle((0.1, 0.1), 9.8, 5.3, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))
    ax.text(5.0, 5.15, "Cataract Screening & Lens Opacity Localization Pipeline", ha='center', va='center', fontsize=11.5, fontweight='bold', color=NAVY)
    ax.text(5.0, 4.90, "MobileNetV3 Quality, YOLO Eye Localization, Iris/Pupil U-Nets, EffNet-V2-S (CBAM), and Opacity Map", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # 1. Input
    draw_box(ax, 0.3, 2.3, 1.3, 1.3, "Anterior Eye\nPhotograph", "External Camera\nor Slit-Lamp Image", color="#EFF6FF", border=BLUE)
    draw_arrow(ax, 1.6, 2.95, 2.0, 2.95, color=BLUE)

    # 2. Quality Gate
    draw_box(ax, 2.0, 2.2, 1.4, 1.5, "Quality Gate", "MobileNetV3-S\nBinary Classifier\nThreshold: 0.50", color="#FEF3C7", border=AMBER)
    draw_arrow(ax, 3.4, 2.95, 3.8, 2.95, color=AMBER)

    # 3. YOLO Eye Detection
    draw_box(ax, 3.8, 2.2, 1.4, 1.5, "YOLO Eye\nDetector", "YOLO11n Architecture\n640×640 (Conf: 0.45)\n3% Bounding Box Pad", color="#ECFDF5", border=EMERALD)
    draw_arrow(ax, 5.2, 2.95, 5.6, 2.95, color=EMERALD)

    # 4. Anatomical Segmentation
    draw_box(ax, 5.6, 2.0, 1.6, 1.9, "Pupil & Iris\nSegmentation", "Dual U-Nets (224×224)\nThreshold = 0.50\n+ Geometric Refinement\n(Limbus Circularity)", color="#FAF5FF", border=PURPLE, sub_size=7)
    draw_arrow(ax, 7.2, 2.95, 7.6, 2.95, color=PURPLE)

    # 5. Cataract Classifier
    draw_box(ax, 7.6, 2.0, 1.2, 1.9, "Cataract\nClassifier", "EfficientNet-V2-S\n+ CBAM Attention\nBinary Staging\n(Normal/Cataract)", color="#EFF6FF", border=BLUE, sub_size=7)
    draw_arrow(ax, 8.8, 2.95, 9.1, 2.95, color=BLUE)

    # 6. Opacity Evidence Map
    draw_box(ax, 9.1, 1.8, 0.75, 2.3, "Opacity\nEvidence\nMap", "Grad-CAM++\n+\nScatter Density\nTiering", color="#FFE4E6", border=ROSE, sub_size=6.5)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure6_cataract_pipeline_workflow.png"), bbox_inches='tight')
    plt.close(fig)

# -------------------------------------------------------------
# Figure 7: Explainable AI Framework
# -------------------------------------------------------------
def generate_figure7():
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')

    ax.add_patch(patches.Rectangle((0.1, 0.1), 9.8, 5.3, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))
    ax.text(5.0, 5.15, "TRINAY Multi-Method Explainable AI (XAI) Framework", ha='center', va='center', fontsize=11.5, fontweight='bold', color=NAVY)
    ax.text(5.0, 4.90, "Complementary Attribution Techniques Mapped to Distinct Clinical Decision Modalities", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # Left: Fast Integrated Gradients
    draw_box(ax, 0.4, 1.0, 2.8, 3.6, "Fast Integrated Gradients\n(Pixel-Level Path Integral)", "Task: Diabetic Retinopathy Lesions\n\n• Baseline: Zero/Black Image (x')\n• Resolution: 192 × 192\n• Riemann Steps: M = 2\n• Attribution Formula:\n  Attr_i = (x_i - x'_i) × Avg(∂F/∂x)\n• Focused strictly on detected\n  microaneurysms and exudates", color="#EFF6FF", border=BLUE, sub_size=7.5)

    # Center: Grad-CAM / Grad-CAM++
    draw_box(ax, 3.6, 1.0, 2.8, 3.6, "Class Activation Mapping\n(Grad-CAM & Grad-CAM++)", "Task: Glaucoma & Cataract Focus\n\n• Target: Final Conv2d Activations\n• Glaucoma: Standard Grad-CAM on\n  Attention U-Net bottleneck\n• Cataract: Grad-CAM++ using\n  second & third partial derivatives\n• Output: Optical Heatmap Overlay\n  highlighting lens opacity focus", color="#ECFDF5", border=EMERALD, sub_size=7.5)

    # Right: SHAP TreeExplainer
    draw_box(ax, 6.8, 1.0, 2.8, 3.6, "SHAP TreeExplainer\n(Tabular Game Theory)", "Task: Structural Glaucoma Features\n\n• Features: 10 CDR morphometrics\n• Method: Exact Shapley values\n• Explains: Individual feature\n  contributions (positive/negative)\n  relative to expected base value\n• Identifies whether vCDR, cup area,\n  or rim loss drove suspicion", color="#FFFBEB", border=AMBER, sub_size=7.5)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure7_xai_framework.png"), bbox_inches='tight')
    plt.close(fig)

# -------------------------------------------------------------
# Figure 8: Clinical Knowledge & Decision Support Workflow
# -------------------------------------------------------------
def generate_figure8():
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')

    ax.add_patch(patches.Rectangle((0.1, 0.1), 9.8, 5.3, facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.2, zorder=0))
    ax.text(5.0, 5.15, "Clinical Decision Support & Evidence-Based Knowledge Layer", ha='center', va='center', fontsize=11.5, fontweight='bold', color=NAVY)
    ax.text(5.0, 4.90, "Synthesizing AI Predictions, Guideline RAG Retrieval, Concordance Verification, and Specialist Attestation", ha='center', va='center', fontsize=8.5, color=DARK_SLATE)

    # 1. AI Findings
    draw_box(ax, 0.4, 2.7, 1.8, 1.8, "AI Screening\nFindings", "• DR Severity Grade\n• Lesion Pixel Areas\n• vCDR & Glaucoma Score\n• Lens Opacity Tier\n• XAI Heatmaps", color="#EFF6FF", border=BLUE, sub_size=7.5)

    # 2. Knowledge Retrieval (RAG)
    draw_box(ax, 0.4, 0.5, 1.8, 1.8, "Clinical Knowledge\nBase (ChromaDB)", "• 34 Guideline Documents\n• 1,563 Text Chunks\n• multilingual-e5-small\n• Vector Dimension: 384\n• ICO / WHO Consensus", color="#FAF5FF", border=PURPLE, sub_size=7.5)

    draw_arrow(ax, 2.2, 3.6, 2.7, 3.6, color=BLUE)
    draw_arrow(ax, 2.2, 1.4, 2.7, 2.2, color=PURPLE)

    # 3. Concordance & Clinical Reasoning Engine
    draw_box(ax, 2.7, 1.8, 2.5, 2.4, "Concordance & Clinical\nReasoning Engine", "Evaluates Mutual Consistency:\n1. Concordant Negative (No DR, 0 Lesions)\n2. Concordant Positive (DR Staged + Lesions)\n3. Discrepant Classifier (DR Staged, 0 Lesions)\n4. Discrepant Lesion (No DR Staged, Lesions > 0)\n→ Flags Clinical Verification when Discordant", color="#FEF3C7", border=AMBER, sub_size=7)

    draw_arrow(ax, 5.2, 3.0, 5.7, 3.0, color=DARK_SLATE)

    # 4. Referral Timeline & Protocol Mapping
    draw_box(ax, 5.7, 1.8, 2.2, 2.4, "Evidence-Based Referral\nProtocol Mapping", "• No DR: Annual (12 mo) Rescreen\n• Mild NPDR: 6–12 mo Review & HbA1c\n• Moderate NPDR: 1–3 mo Specialist\n• Severe NPDR: 2–4 wk Vitreoretinal\n• Proliferative: 1–2 wk Urgent PRP\n• Glaucoma Suspect: 2–4 wk VF / OCT\n• Cataract: Elective Surgical Consult", color="#ECFDF5", border=EMERALD, sub_size=7)

    draw_arrow(ax, 7.9, 3.0, 8.4, 3.0, color=EMERALD)

    # 5. Attestation & Tele-Review Desk
    draw_box(ax, 8.4, 1.8, 1.2, 2.4, "Specialist\nAttestation &\nTele-Review", "Ophthalmologist\nDirect Review\n• Verification\n• Electronic Sign\n• Referral Action\n• Patient Chart", color="#F1F5F9", border=NAVY, sub_size=7)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "figure8_clinical_decision_support_workflow.png"), bbox_inches='tight')
    plt.close(fig)

if __name__ == "__main__":
    print("Generating Academic Journal Figures...")
    generate_figure1()
    generate_figure2()
    generate_figure3()
    generate_figure4()
    generate_figure5()
    generate_figure6()
    generate_figure7()
    generate_figure8()
    print("✓ Successfully generated all 8 academic diagrams in docs/figures/diagrams/")
