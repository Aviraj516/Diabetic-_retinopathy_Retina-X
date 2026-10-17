# RETINA-X: Deep Learning for Diabetic Retinopathy Screening

RETINA-X is a research and software project for analyzing retinal fundus images. The repository contains code for a five-class diabetic retinopathy (DR) severity workflow as well as additional retinal image-analysis components. This README focuses on the DR-related scope and distinguishes model code from experimental evidence.

> **Research-use notice:** This software is not a medical device and must not be used as the sole basis for diagnosis or treatment. Outputs require assessment by a qualified eye-care professional.

## Contents

- [Project Scope](#project-scope)
- [DR Severity Classification](#dr-severity-classification)
- [Related Retinal Analysis Components](#related-retinal-analysis-components)
- [Repository Structure](#repository-structure)
- [Environment and Installation](#environment-and-installation)
- [Running the Application](#running-the-application)
- [Datasets and Training](#datasets-and-training)
- [Evaluation and Reporting](#evaluation-and-reporting)
- [Limitations](#limitations)
- [Security and Data Handling](#security-and-data-handling)

## Project Scope

The DR component is intended to classify a retinal fundus image into one of five severity categories. The repository also contains code for retinal image quality handling, vessel segmentation, optic-disc segmentation, fovea localization, and lesion segmentation. These tasks are related, but they are not interchangeable: a severity classifier produces an image-level category, whereas segmentation models produce pixel-level masks and a localization model produces coordinates.

## DR Severity Classification

The repository includes a checkpoint path named `model/dr_severity_efficientnet_b0.pth` and README-level documentation describing an EfficientNet-B0 classifier with the following label mapping:

| Label | Category |
|---:|---|
| 0 | No DR |
| 1 | Mild DR |
| 2 | Moderate DR |
| 3 | Severe DR |
| 4 | Proliferative DR |

### Inference implementation currently documented in the repository

The current `app.py` contains a `run_dr_severity` function that:

- Instantiates `torchvision.models.efficientnet_b0(weights=None)` and replaces its final classifier layer with a five-output linear layer.
- Loads `model/dr_severity_efficientnet_b0.pth` and accepts a checkpoint dictionary containing `model_state_dict`, `state_dict`, or a raw state dictionary.
- Converts the uploaded image from OpenCV BGR to RGB.
- Resizes it to 224 × 224 pixels, converts it to a tensor, and normalizes channels using means `[0.485, 0.456, 0.406]` and standard deviations `[0.229, 0.224, 0.225]`.
- Applies softmax to the five logits and returns the predicted class, its confidence-like score, and class-wise scores.

The implementation calls `load_state_dict(..., strict=False)`. For reproducible experiments, inspect the returned missing/unexpected-key information and verify that the checkpoint really matches the instantiated architecture. The value called confidence is the top softmax score; it should not be described as a calibrated probability unless calibration has been evaluated.

**Training evidence gap:** the repository files reviewed for this README did not establish a complete DR training script, a locked split manifest, or a reproducible test-evaluation script. Therefore, the training dataset, training hyperparameters and held-out model performance remain unverified. The current inference preprocessing is visible in code, but its identity with the original training preprocessing cannot be independently confirmed from the training artifacts reviewed.

### Suggested inference workflow

1. Provide a retinal fundus image.
2. Convert it to RGB, resize it to 224 × 224, and apply the normalization used in `app.py`.
3. Load the EfficientNet-B0 architecture and the corresponding checkpoint.
4. Apply softmax and map the winning output index to the five labels above.
5. Display the prediction as a research screening output, with clinical review and appropriate limitations.

## Related Retinal Analysis Components

The repository contains these additional model definitions or model references:

| Component | What the code is intended to produce | Repository evidence |
|---|---|---|
| Image quality | Image-quality classification/gating | Quality-model definitions and quality checkpoint references exist; verify label scheme and the active implementation before use |
| Blood-vessel segmentation | A binary vessel mask | `backend/unet_efficientnet.py` defines a U-Net using an EfficientNet-B0 encoder, 3-channel input and one output channel |
| Optic-disc segmentation | A binary optic-disc mask | `backend/optic_disc_unet.py` defines a U-Net using an EfficientNet-B0 encoder and one output channel |
| Fovea localization | Two normalized coordinates (x, y) | `backend/fovea_net.py` defines an EfficientNet-B0-based regressor with a two-value output |
| Retinal lesion segmentation | Four lesion channels | `backend/model.py` defines a standard U-Net with output channels mapped to MA, HE, EX and SE |

Lesion abbreviations used in the current code/documentation:

- **MA:** Microaneurysm
- **HE:** Haemorrhage
- **EX:** Hard exudate
- **SE:** Soft exudate

These components are supplemental retinal-analysis tasks; their presence does not prove that all outputs have been clinically validated or that every model checkpoint is available and usable in a fresh installation.

## Repository Structure

A selected overview of relevant files and directories:

```text
.
├── app.py                         # Flask ML inference service, including DR severity inference
├── backend/
│   ├── fovea_net.py
│   ├── model.py
│   ├── optic_disc_unet.py
│   ├── postprocess.py
│   ├── spatial_integration.py
│   ├── trinay_anatomy_lesion_pipeline.py
│   ├── trinay_xai_fast.py
│   └── unet_efficientnet.py
├── model/
│   ├── best_fovea_net.pth
│   ├── best_optic_disc_unet.pth
│   ├── best_quality_model.pkl
│   ├── best_vessel_unet.pth
│   ├── dr_severity_efficientnet_b0.pth
│   └── standard_unet_ddr_finetuned.pth
├── pipeline/
├── trinay/
├── src/
├── server.ts
├── package.json
└── requirements.txt
```

This tree is illustrative, not a guarantee that all listed weight files are valid distributable checkpoints. Verify file contents, paths, and runtime compatibility locally before use. Some Git-hosted weight files may be placeholders or Git LFS pointer files rather than usable weights.

## Environment and Installation

The repository has both JavaScript/TypeScript application dependencies and Python machine-learning dependencies.

### Prerequisites

- Git
- Node.js compatible with the versions required by the project's package dependencies
- Python 3.10 or another version compatible with the installed PyTorch and project libraries
- Sufficient memory and storage for computer-vision dependencies and model files

The Python dependency list is maintained in `requirements.txt`; the frontend/server dependency list is maintained in `package.json`.

### Clone the repository

```bash
git clone https://github.com/Aviraj516/Diabetic-_retinopathy_Retina-X.git
cd Diabetic-_retinopathy_Retina-X
```

### Install JavaScript dependencies

```bash
npm install
```

### Create a Python environment

Windows PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Dependency versions and hardware support can affect reproducibility. For research, record the operating system, Python version, PyTorch/torchvision versions, device type, and exact dependency versions used in the experiment.

## Running the Application

The package manifest defines the following scripts:

```bash
npm run dev
npm run build
npm start
npm run lint
```

- `npm run dev` starts the configured TypeScript server entry point.
- `npm run build` builds the frontend and bundles the server.
- `npm start` starts the built server.
- `npm run lint` runs the TypeScript compiler without emitting files.

Application environment variables may be required. Create a local `.env` file using the variable names listed in `.env.example`, and supply your own values privately. Do not commit credentials or private keys.

These commands describe the scripts declared in the repository; they do not guarantee that every service is configured on a new machine. The Python DR inference function is defined in `app.py`; there is no verified standalone DR training command documented here.

## Datasets and Training

A research-quality description must document, at minimum:

- Dataset name, release/version, access source, and permitted usage
- Number of images used per split and per class
- Patient-level or image-level split strategy, including seed
- Label definitions and any label aggregation
- Image decoding, resizing, normalization and augmentation
- Model initialization and pretrained weights
- Loss function, optimizer, learning rate, batch size, epochs and early-stopping rule
- Checkpoint-selection rule
- Exact independent test set and exclusion criteria

The repository overview alone is not sufficient to confirm the complete DR model training procedure, exact dataset counts or split, or the validity of any performance figures. Do not infer these from filenames or from a separate project summary. Add them here after checking the original scripts and logs.

## Evaluation and Reporting

For five-class DR grading, report more than overall accuracy. Recommended reporting includes:

- Per-class precision, recall/sensitivity and F1-score
- Macro-F1 and balanced accuracy
- Confusion matrix
- Quadratic weighted kappa (QWK), when appropriate for ordinal grades
- ROC-AUC with a clearly defined multiclass or referable-DR protocol, if calculated
- Sensitivity and specificity for a precisely defined referable-DR threshold
- Confidence intervals and the number of test images

All metrics should be computed on an independent held-out set that was not used for training, model selection, threshold tuning or repeated experimentation. Clearly state whether the unit of separation is patient or image, and avoid leakage across splits. Report only values that can be reproduced from code, saved predictions/labels, or experiment logs.

### Results table template

Replace the placeholders only after validating the experiments.

| Evaluation item | Result |
|---|---|
| Test dataset/version | To be verified |
| Number of independent test images/patients | To be verified |
| Accuracy | To be measured/reproduced |
| Macro-F1 | To be measured/reproduced |
| Quadratic weighted kappa | To be measured/reproduced |
| Confusion matrix | To be generated |
| Referable-DR sensitivity/specificity | To be measured using a stated threshold |
| Confidence intervals | To be calculated |

## Limitations

- A stored model file and an architectural definition do not prove that training completed successfully or that the model generalizes.
- Results may be affected by camera type, image quality, class imbalance, dataset source and population differences.
- Confidence values are not necessarily calibrated probabilities.
- Research performance does not establish clinical safety, regulatory approval or suitability for unsupervised diagnosis.
- Reproducibility requires versioned datasets or manifests, recorded splits, training configuration, checkpoint hashes and saved test predictions.

## Security and Data Handling

- Never commit API keys, Supabase service-role keys, passwords, access tokens, patient data or other secrets.
- Store local credentials in an ignored `.env` file and keep `.env.example` limited to non-secret placeholders.
- If a real credential has ever been pushed to a public repository, rotate/revoke it; deleting it from the latest commit alone does not remove it from history.
- Do not upload patient-identifiable retinal images or records without appropriate authorization and privacy safeguards.
- Check model-weight licensing and dataset terms before redistributing data or checkpoints.

## Citation

If you use this code or its models in a paper, cite the repository with the actual access date and commit identifier, and cite each dataset and base architecture using its original publication. Do not describe the implementation as novel or clinically validated unless a supported comparison and appropriate validation have been completed.

---

**Repository:** https://github.com/Aviraj516/Diabetic-_retinopathy_Retina-X
