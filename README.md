RETINA-X — Explainable AI-Assisted Diabetic Retinopathy Screening
RETINA-X is an AI-assisted retinal screening system that takes a fundus image and moves it through a sequence of real machine-learning models.

The main idea is simple:

Check the image → predict DR severity → analyze retinal anatomy and lesions → visualize the findings → explain the AI output.

Important: RETINA-X is a screening/research system. AI results should not be treated as a final medical diagnosis without appropriate clinical review.

1. Complete System Flow
                         ┌───────────────────────┐
                         │     FUNDUS IMAGE      │
                         │      USER UPLOAD      │
                         └───────────┬───────────┘
                                     │
                                     ▼
                       ┌──────────────────────────┐
                       │ 1. IMAGE QUALITY MODEL   │
                       │      Random Forest       │
                       │                          │
                       │ Sharpness                 │
                       │ Brightness                │
                       │ Illumination              │
                       │ Contrast                  │
                       │ Noise                     │
                       │ FOV                       │
                       └────────────┬─────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                   BAD / UNSUITABLE         GOOD
                         │                     │
                         ▼                     ▼
                 ┌───────────────┐   ┌──────────────────────┐
                 │ ASK USER TO   │   │ 2. DR SEVERITY MODEL │
                 │ RETAKE IMAGE  │   │     EfficientNet-B0  │
                 └───────────────┘   │                      │
                                     │ No DR                │
                                     │ Mild                 │
                                     │ Moderate             │
                                     │ Severe               │
                                     │ Proliferative DR     │
                                     └───────────┬──────────┘
                                                 │
                                                 ▼
                              ┌─────────────────────────────────┐
                              │ 3. TRINAY ANATOMY + LESION      │
                              │                                 │
                              │ ANATOMY                         │
                              │ ├─ Blood Vessels                │
                              │ ├─ Optic Disc                   │
                              │ └─ Fovea                        │
                              │                                 │
                              │ LESIONS                         │
                              │ ├─ MA                           │
                              │ ├─ HE                           │
                              │ ├─ EX                           │
                              │ └─ SE                           │
                              └──────────────┬──────────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────────┐
                              │ 4. SPATIAL + VISUAL ANALYSIS    │
                              │                                 │
                              │ • Vessel measurements           │
                              │ • Disc–fovea relationship       │
                              │ • Macular region                │
                              │ • Lesion measurements            │
                              │ • Anatomy overlay               │
                              │ • Lesion overlay                │
                              │ • Combined overlay              │
                              └──────────────┬──────────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────────┐
                              │ 5. XAI                          │
                              │     Integrated Gradients        │
                              │                                 │
                              │ Anatomy XAI                      │
                              │ Lesion XAI                       │
                              │ Combined XAI                     │
                              └──────────────┬──────────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────────┐
                              │       RETINA-X DASHBOARD        │
                              │                                 │
                              │ Real-time results +             │
                              │ visual evidence + XAI           │
                              └─────────────────────────────────┘
2. What Happens After Image Upload?
When a user uploads a retinal image, RETINA-X first reads basic file information:

Filename
File size
Image width
Image height
Resolution
The original retinal image is preserved for display and analysis.

3. Step 1 — Image Quality Assessment
The first model answers one question:

Is this retinal image good enough for AI analysis?

The existing model is:

model/best_quality_model.pkl
It is a Random Forest model.

Features used
The image-quality pipeline uses six features:

Feature	Simple meaning
Sharpness	How focused or blurry the image is
Brightness	How dark or bright the image is
Illumination	How evenly the retina is illuminated
Contrast	How clearly structures can be separated
Noise	How much unwanted image variation exists
FOV	How much of the retinal field is visible
Output
The quality model classifies an image as:

Good
Borderline
Ungradable
Quality gate
The workflow should behave like this:

Image
  ↓
Quality Model
  ↓
Good?
 ├── NO → ask for clearer/re-taken image
 └── YES → continue
A poor-quality image should not be passed to the later diagnostic stages because doing so can make the downstream output less reliable.

4. Step 2 — DR Severity Classification
If the image passes the quality stage, it is sent to:

model/dr_severity_efficientnet_b0.pth
The model is based on EfficientNet-B0.

It predicts five DR severity classes:

0 → No DR
1 → Mild
2 → Moderate
3 → Severe
4 → Proliferative DR
The dashboard can display:

Predicted Severity
Severity Level
Model Confidence
Simple flow:

Good Fundus Image
       ↓
EfficientNet-B0
       ↓
DR Severity
5. Step 3 — TRINAY
TRINAY is the main anatomy and retinal-lesion analysis system.

It contains two major parts:

                 TRINAY
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
      ANATOMY               LESIONS
          │                   │
      ┌───┼───┐           ┌───┼───┬───┐
      │   │   │           │   │   │   │
    Vessels Disc Fovea   MA  HE  EX  SE
6. Anatomy Analysis
6.1 Blood Vessels
The blood-vessel model identifies retinal vessels at the pixel level.

Architecture:

EfficientNet-B0 Encoder
          +
      U-Net Decoder
          ↓
   Vessel Segmentation
The result is a real binary vessel mask.

The dashboard can calculate:

Vessel pixels
Vessel density
Connected components
Largest connected component
Macular vessel density
The visualization must use the real predicted vessel mask rather than manually drawn vessel lines.

6.2 Optic Disc
The optic-disc model identifies the optic disc.

The output gives the predicted optic-disc region.

From that mask the system can calculate information such as:

Detected / not detected
Optic disc area
Area ratio
Centroid
Circularity
Bounding box
The dashboard can draw the detected boundary directly on the fundus image.

6.3 Fovea
The fovea model predicts a location rather than a segmentation mask.

The main output is:

X coordinate
Y coordinate
That location is used for:

Fovea marker
Macular ROI
Disc–fovea distance
Macular spatial analysis
7. Macula
The current TRINAY pipeline uses the predicted fovea location to create a fovea-centered region representing the macular area for computational analysis.

Predicted Fovea
      ↓
Fovea-centered ROI
      ↓
Macular Analysis
This can be used for:

macular vessel density

lesion overlap with the macular region

The current ROI is a computational approximation; it is not a separately trained macula segmentation model.

8. Retinal Lesion Analysis
The lesion model is a four-class U-Net.

Fundus Image
      ↓
     U-Net
      ↓
 ┌────┬────┬────┬────┐
 MA   HE   EX   SE
MA — Microaneurysm
Small retinal abnormalities associated with tiny blood vessels. In fundus images they can appear as very small dark/red spots.

HE — Haemorrhage
Areas of retinal bleeding.

EX — Hard Exudate
Bright or yellowish deposits visible on the retina.

SE — Soft Exudate
Pale retinal lesions commonly described as cotton-wool type lesions.

9. MA / HE / EX / SE Legend
For users, the short legend is:

MA → Microaneurysm
HE → Haemorrhage
EX → Hard Exudate
SE → Soft Exudate
The visualization colors should match the legend colors.

Image marking
     =
Legend color
     =
Lesion card color
This makes the dashboard easier to understand.

10. Existing Lesion Thresholds
The current lesion inference pipeline uses:

MA = 0.30
HE = 0.10
EX = 0.25
SE = 0.10
These values belong to the current inference configuration.

Changing them changes which pixels are considered detected, so they should only be changed intentionally and documented.

11. Post-Processing
Raw neural-network predictions can contain very small unwanted regions.

The post-processing stage:

Raw lesion mask
      ↓
Remove tiny components
      ↓
Clean / smooth regions
      ↓
Final visualization mask
The processed masks are then used for:

Region counting
Pixel counting
Visualization
Spatial analysis
12. Spatial Integration
An important part of TRINAY is understanding where anatomy and lesions are located relative to one another.

For example:

Optic Disc
     │
     │ distance
     ▼
   Fovea
The pipeline can calculate:

Vessel measurements
Global vessel density
Macular vessel density
Connected components
Largest vessel component
Optic disc measurements
Area
Centroid
Circularity
Area ratio
Fovea measurements
X coordinate
Y coordinate
Spatial relationship
Disc-to-fovea distance
Lesion/macula relationship
Total lesion pixels
Lesion pixels in macular ROI
Macular overlap ratio
This converts segmentation results into measurable information.

13. Visualization
The visualization layer should always preserve the original fundus image.

The concept is:

                 REAL FUNDUS
                      │
       ┌──────────────┼──────────────┐
       │              │              │
       ▼              ▼              ▼
    ANATOMY         LESIONS          XAI
       │              │              │
       ▼              ▼              ▼
   vessels        MA/HE/EX/SE    attribution
   optic disc                     heatmaps
   fovea
       │              │              │
       └──────────────┼──────────────┘
                      ▼
             COMBINED VISUALIZATION
Anatomy visualization
The real fundus should show:

Blood vessels
Optic disc
Fovea
Macular region
Lesion visualization
The real fundus should show:

MA
HE
EX
SE
Combined visualization
The combined image shows:

Real fundus
+
Real anatomy predictions
+
Real lesion predictions
14. Anatomical Labels
For easier understanding, the visualization can include callouts such as:

Optic Disc
      │
      ▼
   [real predicted disc]

Fovea
  │
  ▼
[real predicted fovea]

Macula
  │
  ▼
[real fovea-centered ROI]

Blood Vessels
  │
  ▼
[real vessel mask]
The marker locations must come from the model outputs.

The system should never draw fixed or hardcoded anatomy locations.

15. Explainable AI
RETINA-X uses Integrated Gradients to provide model explainability.

The simple question XAI tries to answer is:

Which areas of the retinal image contributed to the model output?

Anatomy XAI
The anatomy branch can produce:

Blood Vessel XAI
Optic Disc XAI
Fovea XAI
These can then be combined into:

Combined Anatomy XAI
Lesion XAI
The lesion model can produce explanations for detected lesions:

MA XAI
HE XAI
EX XAI
SE XAI
Only detected classes need to be explained in the lightweight workflow.

Combined XAI
The final visualization combines:

Anatomy attribution
          +
Lesion attribution
          ↓
Combined Anatomy + Lesion XAI
This is a visualization-level fusion of attribution maps from the separate models. It is not a new trained model.

16. Fast XAI
Integrated Gradients can require substantial memory because it needs repeated forward/backward computation.

The fast XAI version therefore uses a smaller workload:

XAI input       192 × 192
IG steps        2
Target pixels   limited
Lesions         detected classes only
Device          CPU
Normal model inference and XAI are separate concerns:

Normal inference
    ↓
regular model input

XAI
    ↓
smaller input
    ↓
lighter computation
This design is intended to reduce memory pressure on a laptop.

17. Final Dashboard Flow
The user experience is:

┌────────────────────────────────────────┐
│            RETINA-X DASHBOARD          │
└────────────────────────────────────────┘
                     │
                     ▼
              Upload Fundus Image
                     │
                     ▼
              Image Information
                     │
                     ▼
               Image Quality
                     │
          ┌──────────┴──────────┐
          │                     │
       Not Good                Good
          │                     │
          ▼                     ▼
     Retake image          DR Severity
                                │
                                ▼
                         TRINAY Analysis
                                │
                   ┌────────────┴────────────┐
                   │                         │
                Anatomy                  Lesions
                   │                         │
                   └────────────┬────────────┘
                                │
                                ▼
                         Visualization
                                │
                                ▼
                                XAI
                                │
                                ▼
                           View Report
18. Final Project Structure
retina-x/
│
├── model/
│   ├── best_quality_model.pkl
│   ├── dr_severity_efficientnet_b0.pth
│   │
│   └── trinay/
│       ├── best_vessel_unet.pth
│       ├── best_optic_disc_unet.pth
│       ├── best_fovea_net.pth
│       └── standard_unet_ddr_finetuned.pth
│
├── backend/
│   ├── anatomy_assessment.py
│   ├── fovea_net.py
│   ├── model.py
│   ├── optic_disc_unet.py
│   ├── postprocess.py
│   ├── spatial_integration.py
│   ├── trinay_anatomy_lesion_pipeline.py
│   ├── trinay_xai_fast.py
│   └── unet_efficientnet.py
│
├── src/
│   └── React / TypeScript dashboard
│
├── server/
│   └── Existing project server code
│
├── server.ts
├── package.json
└── README.md
19. What Each Important Backend File Does
File	Purpose
model.py	Lesion U-Net architecture
unet_efficientnet.py	Blood vessel segmentation model
optic_disc_unet.py	Optic disc segmentation model
fovea_net.py	Fovea localization model
postprocess.py	Cleans predicted lesion masks
spatial_integration.py	Calculates spatial relationships and measurements
anatomy_assessment.py	Calculates anatomy-related features/status information used by the current pipeline
trinay_anatomy_lesion_pipeline.py	Main TRINAY anatomy + lesion inference and visualization
trinay_xai_fast.py	Lightweight Integrated Gradients XAI
20. Models and Their Jobs
best_quality_model.pkl
        ↓
Image Quality

dr_severity_efficientnet_b0.pth
        ↓
DR Severity

best_vessel_unet.pth
        ↓
Blood Vessel Segmentation

best_optic_disc_unet.pth
        ↓
Optic Disc Segmentation

best_fovea_net.pth
        ↓
Fovea Localization

standard_unet_ddr_finetuned.pth
        ↓
MA / HE / EX / SE Segmentation
21. Why Multiple Models?
Each model has a specialized job.

Quality Model
   ↓
Is the image usable?

Severity Model
   ↓
How severe is DR?

Vessel Model
   ↓
Where are blood vessels?

Optic Disc Model
   ↓
Where is the optic disc?

Fovea Model
   ↓
Where is the fovea?

Lesion Model
   ↓
Where are retinal lesions?

XAI
   ↓
Which image areas contributed to the output?
This makes the complete system modular and easier to develop and debug.

22. Running the Project
From the project root:

npm install
npm run dev
For standalone TRINAY testing:

python backend/trinay_anatomy_lesion_pipeline.py "path/to/fundus_image.jpg"
For standalone XAI testing:

python backend/trinay_xai_fast.py "path/to/fundus_image.jpg"
Required Python packages include:

pip install torch torchvision
pip install segmentation-models-pytorch
pip install opencv-python numpy pillow
pip install matplotlib scikit-learn pandas tqdm
pip install captum
23. Example End-to-End Case
Suppose a nurse uploads:

patient_eye.jpg
RETINA-X first displays:

Filename
File Size
Resolution
Then:

Image Quality
      ↓
Good
Then:

DR Severity
      ↓
Moderate
Then TRINAY analyzes:

Blood Vessels
Optic Disc
Fovea
MA
HE
EX
SE
Then:

Spatial Measurements
Then:

Anatomy Visualization
Lesion Visualization
Combined Visualization
Then:

Anatomy XAI
Lesion XAI
Combined XAI
Finally the report page displays all results for that specific uploaded image.

24. Poor-Quality Image Example
A poor image should stop the workflow early:

Upload
  ↓
Quality Model
  ↓
Borderline / Ungradable
  ↓
STOP
  ↓
Please retake or upload a clearer retinal image.
The system should not continue to:

DR Severity
Anatomy
Lesions
XAI
for a rejected image.

25. Real-Time Requirement
Every result must belong to the current uploaded image.

Image A
   ↓
Results A

New Image B
   ↓
Results B
There must be no stale results from Image A remaining when Image B is analyzed.

The report page must also update to the newly generated result.

26. Important Implementation Rules
The final project should never use:

Hardcoded severity
Hardcoded confidence
Hardcoded lesion counts
Hardcoded anatomy coordinates
Hardcoded vessel paths
Static sample report values
Static sample visualization
Fake XAI
Only definitions such as:

MA = Microaneurysm
HE = Haemorrhage
EX = Hard Exudate
SE = Soft Exudate
can remain static.

27. Final Objective
RETINA-X combines several specialized AI components into one workflow:

                RETINA-X
                    │
                    ▼
              CHECK QUALITY
                    │
                    ▼
              DETECT DR STAGE
                    │
                    ▼
            ANALYZE RETINA
                    │
           ┌────────┴────────┐
           │                 │
        ANATOMY            LESIONS
           │                 │
           └────────┬────────┘
                    │
                    ▼
              MEASURE + MAP
                    │
                    ▼
               EXPLAIN AI
                    │
                    ▼
             SHOW TO USER
In simple words:

RETINA-X checks whether the retinal image is usable, estimates diabetic retinopathy severity, analyzes retinal anatomy and lesions, shows the findings directly on the fundus image, and explains the model output with XAI.

28. Development Principle
The project should always follow:

REAL IMAGE
    ↓
REAL MODEL
    ↓
REAL RESULT
    ↓
REAL VISUALIZATION
    ↓
REAL EXPLANATION
This keeps the dashboard connected to the actual trained machine-learning models rather than demo or placeholder data.

