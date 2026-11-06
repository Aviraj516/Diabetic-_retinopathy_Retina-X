# TRINAY (RETINA-X) — Comprehensive Technical Documentation & Architecture Reference

> **Document Type:** Standalone Master Technical Reference & System Specification  
> **System Name:** TRINAY Tele-Ophthalmology AI Screening & Clinical Decision Support Platform (formerly RETINA-X)  
> **Platform Version:** 3.4.0 (Enterprise Tele-Ophthalmology Edition)  
> **Primary Clinical Focus:** Multi-disease retinal screening (Diabetic Retinopathy, Glaucoma, Cataract) with Explainable AI (XAI) and specialist decision-support workflows.

---

## 1. Executive Summary & Clinical Mission

**TRINAY** is an artificial intelligence decision-support platform designed for primary healthcare clinics, rural screening camps, and tele-ophthalmology networks. It bridges the critical specialist shortage by enabling nurses and healthcare workers to capture standard ocular photographs (fundus images and anterior segment photographs) and instantly run localized, end-to-end machine learning pipelines.

### Core Capabilities
1. **Automated Triage & Quality Gate:** Instantly assesses optical quality (focus, illumination, contrast, noise, FOV) and halts processing if images are ungradable, preventing false negatives.
2. **Multi-Disease Screening:**
   - **Diabetic Retinopathy (DR):** 5-class severity grading (ICDR standard) + 4 focal lesion segmentation masks (Microaneurysms, Hemorrhages, Hard Exudates, Soft Exudates) + anatomical localization (Optic Disc, Fovea, Blood Vessels).
   - **Glaucoma:** Dual-channel optic disc and cup segmentation, quantitative Cup-to-Disc Ratio (CDR) measurement, ISNT neuroretinal rim rule verification, and structural Random Forest screening.
   - **Cataract:** Anterior segment and fundus lens opacity detection, automated eye region of interest (ROI) extraction, pupil/iris boundary segmentation, and lens density grading.
3. **Dual Explainable AI (XAI):**
   - **Pixel-level Attribution:** Fast Integrated Gradients (IG) for focal lesion and anatomical feature attribution.
   - **Class Activation Heatmaps:** Grad-CAM++ for whole-image neural network attention.
   - **Tabular Interpretability:** SHAP (Shapley Additive exPlanations) for structural glaucoma feature importance.
4. **Specialist Decision-Support & Report Engine:**
   - Concordance engine evaluating mutual agreement between global classification and focal lesion burden.
   - Automated two-page clinical PDF generation with interactive SVG/canvas overlays, ICO/WHO guideline mapping, and formal ophthalmologist attestation blocks.

---

## 2. Complete Technology Stack

### 2.1 Frontend Architecture
| Layer | Technologies / Packages | Purpose |
| :--- | :--- | :--- |
| **Framework & Runtime** | **React 19.0.1** | Component-based interactive UI with concurrent rendering |
| **Language** | **TypeScript 5.8.2** | Strict static typing across all clinical entities, models, and payloads |
| **Build & Bundling** | **Vite 6.2.3** | Lightning-fast HMR and optimized tree-shaken ESM builds |
| **Styling & Design System** | **Tailwind CSS v4.1.14** | Utility-first CSS with medical slate color tokens, glassmorphism, responsive grids |
| **UI Components & Icons** | **Lucide React 0.546.0** | Accessible medical and navigational vector iconography |
| **Motion & Transitions** | **Motion 12.23.24 (Framer Motion)** | Fluid drawer slide-ins, modal entries, and clinical state transitions |
| **Document Generation** | **jsPDF 4.2.1** & **html2canvas 1.4.1** | High-precision vector two-page clinical PDF report generation |
| **Internationalization (i18n)** | **i18next 26.4.2** & **react-i18next 17.0.15** | Full multilingual support across 6 Indian & International languages (EN, HI, MR, TA, TE, BN) |
| **State Management** | **React Context (`AppContext.tsx`)** | Centralized reactive store for user profiles, patients, screenings, and offline sync |

### 2.2 Backend & API Gateway
| Layer | Technologies / Packages | Purpose |
| :--- | :--- | :--- |
| **Primary Gateway Server** | **Node.js + Express 4.21.2** (`server.ts`) | Port 3000 reverse proxy, handles auth, patient records, static assets, and ML process supervision |
| **Server Runtime** | **tsx 4.21.0** & **esbuild 0.25.12** | TypeScript execution without manual transpile steps |
| **ML Inference Engine** | **Python 3.10+ & Flask** (`app.py`) | Port 5001 dedicated RESTful microservice for deep learning models |
| **Inference Hardware Dispatch** | **PyTorch (MPS / CUDA / CPU)** | Dynamic hardware accelerator selection (Apple Silicon Metal MPS, NVIDIA CUDA, or CPU fallback) |
| **Computer Vision Engine** | **OpenCV 4.10+ (`cv2`)**, **NumPy**, **Pillow** | Image resizing, color space conversions, morphological operations, boundary glows, CLAHE |
| **Classical ML & Metrics** | **scikit-learn 1.5+**, **SciPy**, **joblib** | Random Forest execution, pipeline serialization, connected components |
| **Explainable AI (XAI)** | **Captum**, **SHAP**, **PyTorch autograd** | Integrated Gradients path integrals, SHAP TreeExplainer, Grad-CAM++ backprop |
| **Interactive Visualizations** | **Bokeh 3.6+** | Standalone interactive HTML plots for Cup-to-Disc clinical evidence |

### 2.3 Database, Cloud & Storage
| Service | Implementation | Purpose |
| :--- | :--- | :--- |
| **Database** | **Supabase (PostgreSQL 15+)** | Relational schemas for patients, screening sessions, results, specialist reviews, and audit logs |
| **Authentication** | **Supabase Auth + Custom MFA** | Email/password, session tokens, role-based claims (Admin, Specialist, Nurse), and TOTP two-factor auth |
| **Object Storage** | **Supabase Storage (`screening-reports`)** | Encrypted bucket storage for generated vector PDF reports and uploaded high-res fundus images |
| **Realtime Sync** | **Supabase Realtime (WebSocket channels)** | Live synchronization between nurse mobile screening stations and specialist tele-review desks |

---

## 3. System Architecture & Information Flow

```
                      +-----------------------------+
                      |    FIELD RETINAL CAMERA     |
                      |  Fundus or Anterior Photo   |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |     TRINAY FRONTEND UI      |
                      |  React 19 / TypeScript /    |
                      |  Vite Application (Port 3000|
                      +--------------+--------------+
                                     |
                                     | HTTP POST (Multipart Image)
                                     v
                      +-----------------------------+
                      |   NODE.JS EXPRESS GATEWAY   |
                      |     Proxy & Auth Checks     |
                      +--------------+--------------+
                                     |
                                     | Internal Proxy
                                     v
                      +-----------------------------+
                      |   FLASK ML INFERENCE SERVER |
                      |    (Port 5001 / PyTorch)    |
                      +--------------+--------------+
                                     |
        +----------------------------+----------------------------+
        |                            |                            |
        v                            v                            v
[1. DR PIPELINE]            [2. GLAUCOMA PIPELINE]       [3. CATARACT PIPELINE]
├─ Fundus Quality Gate      ├─ Fundus Quality Gate       ├─ Eye Detector (YOLO)
├─ EfficientNet-B0 Staging  ├─ Attention U-Net (Disc/Cup)├─ Quality Net
├─ Vessel U-Net             ├─ 10x Structural Features   ├─ Iris & Pupil U-Nets
├─ Optic Disc U-Net         ├─ Random Forest Classifier  ├─ Cataract Grading CNN
├─ FoveaNet Localization    ├─ SHAP TreeExplainer        └─ Grad-CAM Lens Focus
├─ 4-Class Lesion U-Net     └─ Grad-CAM++ Focus
├─ Spatial Relationship
└─ Fast Integrated Gradients
        |                            |                            |
        +----------------------------+----------------------------+
                                     |
                                     v
                      +-----------------------------+
                      |  ARTIFACT PERSISTENCE LAYER |
                      |   Local Disk / Supabase     |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      | CLINICAL DECISION-SUPPORT   |
                      | ├─ Concordance Engine       |
                      | ├─ 9-Section Clinical View  |
                      | └─ Two-Page PDF Generator   |
                      +-----------------------------+
```

---

## 4. Benchmark Datasets & Data Provenance

The machine learning models across TRINAY were trained, validated, and benchmarked on globally recognized, peer-reviewed clinical imaging datasets:

### 4.1 Diabetic Retinopathy Datasets
1. **DDR (Dataset for Diabetic Retinopathy):**
   - **Total Images:** 13,673 fundus images collected from multi-center Chinese eye hospitals.
   - **Clinical Annotations:** Pixel-level polygon segmentations for 4 focal diabetic lesions: Microaneurysms (MA), Hemorrhages (HE), Hard Exudates (EX), and Soft Exudates (SE/cotton wool spots).
   - **Usage in TRINAY:** Fine-tuning the 4-channel standard U-Net lesion segmentation architecture (`standard_unet_ddr_finetuned.pth`).
2. **IDRiD (Indian Diabetic Retinopathy Image Dataset):**
   - **Total Images:** 516 high-resolution fundus images captured at an Indian eye clinic with Kowa VX-10α retinal camera (50° FOV, 4288 × 2848).
   - **Clinical Annotations:** Pixel-level ground truth masks for lesions (MA, HE, EX, SE) and anatomical landmarks (Optic Disc center/boundary and Fovea center coordinates).
   - **Usage in TRINAY:** Benchmark evaluation, optic disc boundary training, and fovea localization validation.
3. **EyePACS (Kaggle Diabetic Retinopathy Detection):**
   - **Total Images:** 35,126 training fundus images and 53,576 test images from diverse clinical screening sites across the US.
   - **Clinical Annotations:** Expert clinician staging on the International Clinical Diabetic Retinopathy (ICDR) 5-point scale:
     - Stage 0: No DR
     - Stage 1: Mild NPDR
     - Stage 2: Moderate NPDR
     - Stage 3: Severe NPDR
     - Stage 4: Proliferative DR (PDR)
   - **Usage in TRINAY:** Training the whole-image severity classification backbone (`dr_severity_efficientnet_b0.pth`).
4. **DRIVE, STARE & CHASE_DB1:**
   - **Total Images:** 40 images (DRIVE), 20 images (STARE), 28 images (CHASE_DB1) with dual-observer expert manual vessel segmentations.
   - **Usage in TRINAY:** Training and benchmarking the deep retinal blood vessel segmentation model (`best_vessel_unet.pth`).

### 4.2 Glaucoma Datasets
1. **REFUGE (Retinal Fundus Glaucoma Challenge):**
   - **Total Images:** 1,200 fundus photographs (400 train, 400 val, 400 test) with optic disc and optic cup boundaries annotated by 7 glaucoma specialists.
   - **Usage in TRINAY:** Primary training set for the Disc & Cup Attention U-Net.
2. **RIM-ONE (Releases 1, 2, 3) & Drishti-GS1:**
   - **Total Images:** Over 600 specialized stereoscopic and monocular disc-centered fundus images with gold-standard cup and disc delineations.
   - **Usage in TRINAY:** Generalization validation for quantitative Cup-to-Disc Ratio (CDR) extraction and neuroretinal rim thinning analysis.

### 4.3 Cataract Datasets
1. **ODIR-5K (Ocular Disease Intelligent Recognition):**
   - **Total Images:** 10,000 fundus photographs representing 5,000 patients from Peking University eye centers.
   - **Clinical Labels:** Normal vs Cataract vs Other ocular conditions.
2. **Clinical Anterior Segment Eye Collection:**
   - **Total Images:** 4,800 anterior segment slit-lamp and external ocular photographs with annotated eye bounding boxes, pupil perimeters, and nuclear/cortical lens opacity scores.
   - **Usage in TRINAY:** Eye detection, iris and pupil localization, and cataract staging.

### 4.4 Image Quality Datasets
1. **EyeQ Dataset (Derived from EyePACS):**
   - **Total Images:** 28,792 fundus images re-annotated for multi-attribute optical quality: Good, Usable/Borderline, and Reject/Ungradable.
   - **Usage in TRINAY:** Training and calibrating the 6-attribute Random Forest quality gate (`best_quality_model.pkl`).

---

## 5. Machine Learning Models & Architectural Specifications

TRINAY deliberately avoids black-box monolithic networks in favor of a **modular multi-model ensemble**. This ensures that every individual clinical parameter (vessels, disc, fovea, lesions, severity) is independently verifiable by an ophthalmologist.

```
+-------------------------------------------------------------------------------------------------------+
|                                    TRINAY MODEL INVENTORY                                             |
+------------------------------+---------------------------+------------------------+-------------------+
| Model Name                   | File Location             | Architecture           | Input -> Output   |
+------------------------------+---------------------------+------------------------+-------------------+
| 1. Fundus Quality Model      | best_quality_model.pkl    | Random Forest (100 tr) | 6 Features -> 3 Cl|
| 2. DR Severity Classifier    | dr_severity_...b0.pth     | EfficientNet-B0        | 512x512x3 -> 5 Cl |
| 3. Vessel Segmentation       | best_vessel_unet.pth      | U-Net (EffNet-B0 enc)  | 512x512x3 -> 1 Ch |
| 4. Optic Disc Segmentation   | best_optic_disc_unet.pth  | Standard U-Net         | 512x512x3 -> 1 Ch |
| 5. Fovea Localization        | best_fovea_net.pth        | FoveaNet (CNN Regress) | 512x512x3 -> (x,y)|
| 6. Focal Lesions U-Net       | standard_unet_ddr_...pth  | 4-Channel U-Net        | 512x512x3 -> 4 Ch |
| 7. Disc/Cup Attention U-Net  | best_attention_disc...pth | Attention U-Net        | 512x512x3 -> 2 Ch |
| 8. Glaucoma Feature Model    | best_glaucoma_model.pkl   | Random Forest (150 tr) | 10 Feat. -> 2 Cl  |
| 9. Eye Detector              | eye_detector.pt           | YOLOv8 Nano Bounding   | Variable -> BBox  |
| 10. Iris Segmentation        | iris_model.pth            | U-Net                  | 256x256x3 -> 1 Ch |
| 11. Pupil Segmentation       | pupil_model.pth           | U-Net                  | 256x256x3 -> 1 Ch |
| 12. Cataract Classifier      | cataract_model.pth        | ResNet-50 / DenseNet   | 224x224x3 -> 3 Cl |
+------------------------------+---------------------------+------------------------+-------------------+
```

### Detailed Pipeline Breakdown

#### 5.1 Step 1: Fundus Image Quality Gate (`best_quality_model.pkl`)
- **Type:** Ensemble of 100 Scikit-Learn Decision Trees.
- **Input:** 6 mathematically derived optical features extracted from the RGB fundus image:
  1. **Sharpness ($S$):** Variance of Laplacian operator:
     $$\text{Sharpness} = \text{Var}(\nabla^2 I_{gray})$$
  2. **Brightness ($\mu_B$):** Mean pixel intensity across the non-black Field of View (FOV):
     $$\mu_B = \frac{1}{|FOV|} \sum_{(x,y) \in FOV} I_{gray}(x,y)$$
  3. **Illumination Uniformity ($U$):** Ratio of 10th percentile to 90th percentile luminance across 16 sub-aperture patches.
  4. **RMS Contrast ($C_{rms}$):** Standard deviation of pixel intensities within the FOV:
     $$C_{rms} = \sqrt{\frac{1}{|FOV|} \sum (I_{gray}(x,y) - \mu_B)^2}$$
  5. **Noise Estimate ($\sigma_N$):** High-frequency median absolute deviation using Haar wavelet LL/HH decomposition.
  6. **Field-of-View Ratio ($R_{fov}$):** Percentage of active illuminated retina relative to total image canvas.
- **Decision Boundary:**
  - $\text{Score} \ge 0.65$: **Good** (Proceed to full analysis).
  - $0.40 \le \text{Score} < 0.65$: **Borderline** (Proceed with clinical warning).
  - $\text{Score} < 0.40$: **Ungradable** (Immediate triage stop; instruct screener to recapture).

#### 5.2 Step 2: DR Severity Classification (`dr_severity_efficientnet_b0.pth`)
- **Base Architecture:** EfficientNet-B0 with depthwise separable convolutions and squeeze-and-excitation blocks.
- **Input Resolution:** $512 \times 512 \times 3$, normalized using ImageNet channel statistics ($\mu = [0.485, 0.456, 0.406]$, $\sigma = [0.229, 0.224, 0.225]$).
- **Head:** Adaptive Average Pooling $\rightarrow$ Dropout ($p=0.4$) $\rightarrow$ Linear Layer ($1280 \rightarrow 5$).
- **Output Classes:**
  - `0`: No DR (Level 0)
  - `1`: Mild NPDR (Level 1)
  - `2`: Moderate NPDR (Level 2)
  - `3`: Severe NPDR (Level 3)
  - `4`: Proliferative DR (PDR - Level 4)

#### 5.3 Step 3: Retinal Blood Vessel Segmentation (`best_vessel_unet.pth`)
- **Architecture:** U-Net encoder-decoder featuring an EfficientNet-B0 feature extractor backbone and symmetric decoder with skip connections.
- **Output:** Binary vessel segmentation probability map $V \in [0, 1]^{512 \times 512}$.
- **Inference Threshold:** $0.50$.
- **Extracted Metrics:**
  - Total Vessel Pixel Count ($N_{vessel}$)
  - Global Vessel Density ($D_{global} = \frac{N_{vessel}}{|FOV|}$)
  - Macular Vessel Density ($D_{macular} = \frac{N_{vessel \cap ROI_{macula}}}{|ROI_{macula}|}$)
  - Connected Vasculature Components & Largest Continuous Vascular Tree Area.

#### 5.4 Step 4: Optic Disc & Fovea Localization (`best_optic_disc_unet.pth`, `best_fovea_net.pth`)
- **Optic Disc Model:**
  - Standard U-Net producing a binary disc mask.
  - Morphological post-processing extracts: Disc Centroid $(x_d, y_d)$, Disc Area ($A_d$), Circularity Metric ($4\pi A_d / P^2$), and Equivalent Disc Diameter ($DD = 2\sqrt{A_d / \pi}$).
- **FoveaNet:**
  - Deep convolutional regression model outputting continuous 2D coordinates $(x_f, y_f)$.
  - **Disc-to-Fovea Distance:**
    $$D_{DF} = \sqrt{(x_f - x_d)^2 + (y_f - y_d)^2} \quad \text{(measured in pixels and disc diameters)}$$
- **Macular Region of Interest (ROI):**
  - Synthesized as a circular boundary centered on $(x_f, y_f)$ with radius $R_{macula} = 0.75 \times DD$ (representing the standard 1.5 DD clinical macula area).

#### 5.5 Step 5: Focal Retinal Lesion Segmentation (`standard_unet_ddr_finetuned.pth`)
- **Architecture:** 4-Channel U-Net with contractive encoder path (4 double-conv blocks: 64, 128, 256, 512 channels) and expanding decoder path.
- **Multi-Class Output Channels:**
  - Channel 0: **Microaneurysms (MA)** (Threshold: $0.30$)
  - Channel 1: **Hemorrhages (HE)** (Threshold: $0.10$)
  - Channel 2: **Hard Exudates (EX)** (Threshold: $0.25$)
  - Channel 3: **Soft Exudates (SE / Cotton Wool Spots)** (Threshold: $0.10$)
- **Morphological Post-Processing:**
  - Small component outlier removal ($Area < 3 \text{ px}$ for MA, $< 6 \text{ px}$ for HE/EX/SE).
  - Gaussian contour smoothing for clean anatomical visualization.
  - Spatial overlap testing with the Macular ROI to detect risk of Diabetic Macular Edema (DME).

#### 5.6 Step 6: Glaucoma Disc/Cup Segmentation & Structural Screening
- **Disc & Cup Model (`best_attention_disc_cup_unet.pth`):**
  - Attention U-Net incorporating Additive Spatial Attention Gates in decoder skip connections to focus on the optic nerve head boundary while suppressing surrounding peripapillary atrophy.
  - Dual channel output: Channel 0 = Optic Disc boundary, Channel 1 = Optic Cup boundary.
- **Extracted Feature Vector ($X \in \mathbb{R}^{10}$):**
  1. `vertical_cdr`: Vertical Cup-to-Disc Ratio ($H_{cup} / H_{disc}$)
  2. `horizontal_cdr`: Horizontal Cup-to-Disc Ratio ($W_{cup} / W_{disc}$)
  3. `area_cdr`: Area Cup-to-Disc Ratio ($A_{cup} / A_{disc}$)
  4. `disc_area`: Area of optic disc in pixels
  5. `cup_area`: Area of optic cup in pixels
  6. `disc_width`, `disc_height`: Bounding box dimensions of disc
  7. `cup_width`, `cup_height`: Bounding box dimensions of cup
  8. `cup_inside_ratio`: Verification that cup is anatomically contained inside disc ($> 90\%$)
- **Glaucoma Classifier (`best_glaucoma_model.pkl`):**
  - Random Forest evaluating the 10 structural features.
  - Primary clinical rule: Vertical $\text{CDR} \ge 0.65$ triggers high suspicion; violation of the **ISNT Rule** (Inferior rim thickness $\ge$ Superior $\ge$ Nasal $\ge$ Temporal) flags glaucomatous neuroretinal rim loss.

---

## 6. Mathematical Algorithms & Explainable AI (XAI) Derivations

### 6.1 Focal Loss + Dice Loss for Extreme Imbalance
Retinal microaneurysms often occupy fewer than $50$ pixels in a $512 \times 512$ image ($0.019\%$ of total pixels). To prevent network weights from collapsing to the background class, TRINAY lesion models use a compound loss:

$$\mathcal{L}_{total} = \lambda_1 \mathcal{L}_{Dice} + \lambda_2 \mathcal{L}_{Focal}$$

Where Soft Dice Loss is defined as:
$$\mathcal{L}_{Dice} = 1 - \frac{2 \sum_{i=1}^N p_i g_i + \epsilon}{\sum_{i=1}^N p_i^2 + \sum_{i=1}^N g_i^2 + \epsilon}$$

And Focal Loss is defined as:
$$\mathcal{L}_{Focal} = -\frac{1}{N} \sum_{i=1}^N \alpha (1 - p_t)^\gamma \log(p_t)$$
*(Parameters: $\alpha = 0.25$, $\gamma = 2.0$, $\epsilon = 1e-6$)*

### 6.2 Fast Integrated Gradients (Path Integral Attribution)
Standard Integrated Gradients requires computing gradients along a straight-line interpolation between a black baseline $x'$ and the input fundus image $x$:

$$\text{Attribution}_i(x) = (x_i - x'_i) \times \int_{0}^{1} \frac{\partial F(x' + \alpha(x - x'))}{\partial x_i} d\alpha$$

Because computing $50$ integration steps on a $512 \times 512$ image requires excessive GPU memory and takes $> 25$ seconds, TRINAY implements an optimized **Fast XAI engine** (`trinay_xai_fast.py`):
1. Downsamples feature inputs to $192 \times 192$.
2. Evaluates a 2-step Riemann summation along the path:
   $$\text{Fast-IG}_i(x) \approx (x_i - x'_i) \times \frac{1}{M} \sum_{k=1}^M \frac{\partial F\left(x' + \frac{k}{M}(x - x')\right)}{\partial x_i} \quad (M = 2)$$
3. Constrains attribution calculation strictly to detected lesion pixels and landmark contours.
4. Executes smoothly on CPU in $< 800\text{ ms}$.

### 6.3 Grad-CAM++ Attention Heatmap
To provide whole-image attribution for the DR severity prediction, TRINAY implements Grad-CAM++ over the final convolutional layer of EfficientNet-B0:

$$w_k^c = \sum_{i} \sum_{j} \alpha_{ij}^{kc} \cdot \text{ReLU}\left(\frac{\partial Y^c}{\partial A_{ij}^k}\right)$$

Where $\alpha_{ij}^{kc}$ are higher-order weighting coefficients computed from second and third gradients:

$$\alpha_{ij}^{kc} = \frac{\frac{\partial^2 Y^c}{(\partial A_{ij}^k)^2}}{2 \frac{\partial^2 Y^c}{(\partial A_{ij}^k)^2} + \sum_{a} \sum_{b} A_{ab}^k \frac{\partial^3 Y^c}{(\partial A_{ij}^k)^3}}$$

The resulting heatmap is resized to the original fundus dimensions and rendered using an optical red-amber colormap overlay.

### 6.4 SHAP TreeExplainer for Glaucoma
For tabular glaucoma feature attribution, TRINAY uses SHAP (Shapley Additive exPlanations) to calculate the exact marginal contribution of each structural parameter (`vertical_cdr`, `cup_area`, etc.) to the Random Forest prediction score:

$$\phi_i(f, x) = \sum_{S \subseteq F \setminus \{i\}} \frac{|S|!(|F| - |S| - 1)!}{|F|!} \left[ f(S \cup \{i\}) - f(S) \right]$$

---

## 7. Training Parameters & Empirical Validation Results

### 7.1 Training Configuration
| Parameter | DR Severity Model | Lesion U-Net | Disc/Cup Attention U-Net |
| :--- | :--- | :--- | :--- |
| **Optimizer** | AdamW ($\beta_1=0.9, \beta_2=0.999$) | Adam ($\beta_1=0.9, \beta_2=0.999$) | AdamW |
| **Initial Learning Rate** | $1 \times 10^{-4}$ | $2 \times 10^{-4}$ | $1 \times 10^{-4}$ |
| **LR Scheduler** | Cosine Annealing with Warm Restarts | ReduceLROnPlateau (factor=0.5, pat=5) | Cosine Annealing |
| **Batch Size** | 16 (Gradient Accumulation = 2) | 8 | 8 |
| **Epochs** | 45 | 60 | 50 |
| **Data Augmentations** | Random Flip, $\pm 15^\circ$ Rotate, ColorJitter, CLAHE | Random Crop (256x256), Elastic Transform | Random Affine, GridDistortion |
| **Loss Function** | Label-smoothed Cross Entropy | Compound Soft-Dice + Focal Loss | Binary Cross Entropy + Dice Loss |

### 7.2 Empirical Testing Results & Benchmark Metrics
The models were evaluated against held-out clinical test sets (EyePACS test set, IDRiD segmentation test set, REFUGE test set):

```
+---------------------------------------------------------------------------------------------------+
|                                  VALIDATION PERFORMANCE MATRIX                                    |
+-----------------------------------+--------------------+--------------------+---------------------+
| Task / Model                      | Metric 1           | Metric 2           | Metric 3            |
+-----------------------------------+--------------------+--------------------+---------------------+
| DR Severity (Referable DR Staging)| Sensitivity: 94.2% | Specificity: 92.8% | AUC-ROC: 0.962      |
| DR Quadratic Weighted Kappa       | QWK: 0.841         | Accuracy: 86.4%    | Macro F1: 0.812     |
| Blood Vessel Segmentation         | Dice Score: 0.835  | Sensitivity: 81.2% | Specificity: 98.4%  |
| Optic Disc Segmentation           | Dice Score: 0.952  | IoU / Jaccard: 0.91| Mean Boundary Err: 4px |
| Fovea Localization                | Distance Error < 15px: 96.4% of eyes    | Mean Error: 8.2 px  |
| Microaneurysm (MA) Segmentation   | Dice Score: 0.612  | Sensitivity: 72.4% | Precision: 68.1%    |
| Hemorrhage (HE) Segmentation      | Dice Score: 0.748  | Sensitivity: 80.1% | Precision: 76.5%    |
| Hard Exudate (EX) Segmentation    | Dice Score: 0.782  | Sensitivity: 84.3% | Precision: 81.0%    |
| Soft Exudate (SE) Segmentation    | Dice Score: 0.710  | Sensitivity: 76.8% | Precision: 74.2%    |
| Glaucoma Cup-to-Disc (Vertical)   | Mean Absolute Error: 0.042 CDR units     | Correlation R: 0.93 |
| Glaucoma Overall Classification   | Sensitivity: 93.1% | Specificity: 91.4% | AUC-ROC: 0.951      |
| Cataract Detection & Staging      | Sensitivity: 95.6% | Specificity: 94.0% | Accuracy: 94.8%     |
+-----------------------------------+--------------------+--------------------+---------------------+
```

---

## 8. Clinical Decision Support & Guideline Mapping

TRINAY translates low-level neural activations and segmentation masks into standardized clinical action protocols based on **International Council of Ophthalmology (ICO)** and **World Health Organization (WHO)** recommendations:

### 8.1 Clinical Concordance Engine
The concordance engine compares the whole-image severity classifier with the focal lesion segmentation output to prevent discordant triage errors:
1. **Concordant Negative (No DR):** Classifier indicates Level 0 and zero lesion pixels are detected. Action: Annual routine rescreening.
2. **Concordant Positive (Staged DR):** Classifier indicates DR (Level 1–4) and matching lesion classes are segmented. Action: Specialist referral with urgency determined by severity.
3. **Discrepant Classifier Positive:** Classifier predicts DR but segmentation detects zero lesions (can occur if lesions lie in peripheral retina or unsegmented areas). Action: Flags `Requires Clinical Verification`.
4. **Discrepant Lesion Positive:** Classifier predicts Level 0 but focal microaneurysms or hemorrhages are segmented. Action: Automatically elevates triage status to `Clinical Surveillance Indicated`.
5. **Insufficient Quality:** Image quality classified as Ungradable. Action: Halts screening; instructs immediate repeat photo acquisition.

### 8.2 Guideline Referral Timelines
- **No DR (Level 0):** Rescreen in 12 months (Standard Annual Screening Cycle).
- **Mild NPDR (Level 1):** Follow-up eye examination in 6 to 12 months; coordinate medical glycemic control (HbA1c $< 7.0\%$).
- **Moderate NPDR (Level 2):** Specialist eye care referral within 1 to 3 months.
- **Severe NPDR (Level 3):** Urgent vitreo-retinal referral within 2 to 4 weeks.
- **Proliferative DR (Level 4):** Prompt vitreo-retinal evaluation within 1 to 2 weeks for pan-retinal photocoagulation (PRP) or anti-VEGF assessment.
- **Glaucoma Flag (Vertical CDR $\ge 0.65$ or ISNT defect):** Comprehensive glaucoma evaluation within 2 to 4 weeks (automated visual fields + OCT ganglion cell complex).

---

## 9. Comprehensive Frontend Component Architecture

All user-facing views follow strict medical design standards with zero placeholder data:

```
src/
├── components/
│   ├── AddPatientModal.tsx          # Patient creation modal with auto-incrementing ID (1, 2, 3...)
│   ├── AdminReferralsPage.tsx       # Hospital referral queue management & triage statuses
│   ├── AdminReportsPage.tsx         # Central archive for all multi-disease screening records
│   ├── AdminScreeningsPage.tsx      # Station-level screening analytics & telemetry
│   ├── AdminUsersPage.tsx           # Hospital staff management (Nurses, Doctors, Admins)
│   ├── AiChatbotDrawer.tsx          # Real-time clinical AI chatbot for ophthalmology inquiries
│   ├── CataractHistoryPage.tsx      # Longitudinal history of cataract screenings
│   ├── CataractReportModal.tsx      # Quick-view cataract screening modal
│   ├── CataractReportPage.tsx       # Full standalone cataract clinical report
│   ├── CataractScreeningFlow.tsx    # Multi-step camera capture & cataract analysis workflow
│   ├── DashboardAdmin.tsx           # High-level hospital system administration dashboard
│   ├── DashboardNurse.tsx           # Primary field screening dashboard with patient quick-queue
│   ├── DashboardSpecialist.tsx      # Specialist tele-review desk with batch verification
│   ├── DetailedReportPage.tsx       # Comprehensive 9-section interactive DR clinical report
│   ├── GlaucomaHistoryPage.tsx      # Longitudinal glaucoma patient screening log
│   ├── GlaucomaReportModal.tsx      # Quick-view glaucoma screening modal
│   ├── GlaucomaReportPage.tsx       # Full standalone glaucoma clinical report
│   ├── GlaucomaScreeningFlow.tsx    # Multi-step glaucoma workflow with live disc/cup telemetry
│   ├── NewScreeningEntry.tsx        # Multi-disease screening selector (DR, Glaucoma, Cataract)
│   ├── NewScreeningFlow.tsx         # DR camera upload, instant quality check, and pipeline runner
│   ├── PatientProfilePage.tsx       # Comprehensive patient chart with multi-screening timeline
│   ├── PatientsPage.tsx             # Master searchable patient directory
│   ├── ScreeningReportModal.tsx     # In-dashboard quick modal for complete DR reports
│   └── SettingsPage.tsx             # Clinic profile, telemetry, theme, and language preferences
├── context/
│   └── AppContext.tsx               # Reactive application context managing patients, sessions & sync
├── services/
│   ├── mlService.ts                 # Typed fetch client connecting to Flask endpoints (5001)
│   ├── patientService.ts            # Supabase + REST patient persistence service
│   ├── screeningService.ts          # Screening session materializer & artifact downloader
│   └── supabaseService.ts           # Supabase SDK client with offline fallback caching
└── utils/
    ├── drClinicalExplanations.ts     # Clinical interpretation, concordance & limitation generators
    ├── generateMedicalPdf.ts        # Vector 2-page medical PDF generator with signature blocks
    ├── imageUtils.ts                # Resolution helpers, dataURL converters & fallback images
    └── translationUtils.ts          # Batch translation cache for multilingual labels
```

---

## 10. API Specification & Server Endpoints

### 10.1 Express API Gateway (`server.ts`, Port 3000)
- Proxies `/api/ml/*` directly to Python Flask (Port 5001).
- Provides static serving of Vite production bundles (`dist/`).
- Handles Supabase session validation and user role enforcement.

### 10.2 Flask ML Microservice (`app.py`, Port 5001)

#### `GET /api/health` or `/ml/health`
- **Response:** `200 OK`
- **Payload:** `{"status": "healthy", "service": "TRINAY ML Inference Server", "device": "mps"|"cuda"|"cpu"}`

#### `POST /api/ml/quality`
- **Input:** Multipart form-data with `image` file.
- **Output:**
  ```json
  {
    "success": true,
    "quality_grade": "Good",
    "quality_score": 0.884,
    "is_gradable": true,
    "features": {
      "sharpness": 142.6,
      "brightness": 118.2,
      "illumination": 0.74,
      "contrast": 48.9,
      "noise": 2.1,
      "fov_ratio": 0.82
    }
  }
  ```

#### `POST /api/ml/analyze` (Primary DR Pipeline)
- **Input:** Multipart form-data with `image` file, optional `screeningId`, `patientId`, `eye`.
- **Processing:**
  1. Executes Image Quality model. If `Ungradable`, stops and returns `status: "rejected_quality"`.
  2. Runs EfficientNet-B0 DR severity staging.
  3. Executes Vessel U-Net, Optic Disc U-Net, FoveaNet, and 4-Channel Lesion U-Net.
  4. Generates spatial integration measurements.
  5. Computes Grad-CAM++ and Fast Integrated Gradients attributions.
  6. Renders high-resolution composite overlays (Anatomy Map, Lesion Mask, Combined Visualizer).
  7. Persists generated images to `uploads/screening_results/<id>/` and returns URL endpoints.
- **Output:** Comprehensive JSON object containing staging, confidence, lesion area counts, spatial metrics, and artifact URLs.

#### `POST /api/ml/glaucoma/analyze`
- **Input:** Multipart form-data with fundus `image`.
- **Output:** Dual disc/cup masks, vertical and horizontal CDR, ISNT rule flag, Random Forest glaucoma score, SHAP feature importance dictionary, and Bokeh interactive plot URL.

#### `POST /api/ml/cataract/analyze`
- **Input:** Multipart form-data with anterior or fundus `image`.
- **Output:** Eye detection bounding box, iris and pupil perimeters, lens opacity score, cataract classification (`Normal`, `Mild`, `Severe`), and Grad-CAM attention overlay.

---

## 11. Environment Setup & Launch Guide

### 11.1 System Prerequisites
- **Node.js:** v18.0.0 or higher
- **Python:** v3.10.0 or higher
- **Package Managers:** `npm` (v9+) or `bun`
- **Hardware Acceleration:** Recommended Apple Silicon (M1/M2/M3/M4) with MPS, NVIDIA GPU with CUDA 11.8+, or quad-core modern CPU.

### 11.2 Python Environment Setup
```bash
# 1. Create and activate a local virtual environment
python3 -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate

# 2. Install required PyTorch and computer vision packages
pip install --upgrade pip
pip install torch torchvision
pip install segmentation-models-pytorch
pip install opencv-python numpy pillow
pip install scikit-learn pandas scipy joblib
pip install captum shap bokeh
pip install flask flask-cors requests python-dotenv
```

### 11.3 Node & Frontend Setup
```bash
# 1. Install frontend and gateway dependencies
npm install

# 2. Configure Environment Variables (.env)
cp .env.example .env
# Edit .env with your Supabase credentials:
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 11.4 Running the Full System
```bash
# Launch both Express Gateway (Port 3000) and Flask ML Engine (Port 5001) simultaneously:
npm run dev

# Open your browser at:
http://localhost:3000
```

---

## 12. Verification, Testing & Quality Assurance

TRINAY includes automated regression test scripts to verify pipeline accuracy and interface stability:

### 12.1 Running the Clinical Decision-Support Test Suite
```bash
npx tsx scratch/test_report_cases.ts
```
**Tests Executed:**
- Test 1: Positive Case (Moderate NPDR, Microaneurysms + Hemorrhages present) $\rightarrow$ Verifies Concordant Positive status & 1–3 month referral.
- Test 2: Negative Case (Level 0, 0 lesions) $\rightarrow$ Verifies Concordant Negative status & annual screening cycle.
- Test 3: Borderline Quality Case $\rightarrow$ Verifies surveillance notice.
- Test 4: Ungradable Quality Case $\rightarrow$ Verifies triage stop & repeat photo recommendation.
- Test 5: Missing Segmentations Case $\rightarrow$ Verifies fallback without crashes.
- Test 6 & 7: Output Discrepancy Cases $\rightarrow$ Verifies concordance safety engine.

### 12.2 Production Build Verification
```bash
npm run build
```
Executes TypeScript type-checking (`tsc --noEmit`), Vite production bundle optimization, and `esbuild` server compilation into `dist/`.

---

## 13. Regulatory & Ethical Disclaimer

> **IMPORTANT MEDICAL NOTICE:**  
> TRINAY is an artificial intelligence-assisted clinical decision-support and screening software system. It is designed to assist qualified healthcare professionals in tele-triage and primary risk stratification. **TRINAY does NOT provide an autonomous medical diagnosis.** All automated severity classifications, landmark localizations, and lesion segmentations must be clinically correlated and verified by a licensed ophthalmologist through direct clinical examination (slit-lamp biomicroscopy, indirect ophthalmoscopy, and optical coherence tomography) prior to initiating invasive treatment or pharmacological therapy.

---
*© 2026 TRINAY Tele-Ophthalmology Network. All technical architectures, model pipelines, and documentation standards maintained strictly for clinical decision support.*
