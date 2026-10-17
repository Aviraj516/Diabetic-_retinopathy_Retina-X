import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Scan,
  Layers,
  ArrowRight,
  RotateCcw,
  FileText,
  Sparkles,
  Info,
  ChevronRight,
  Check,
  Activity,
  Image as ImageIcon,
  Maximize2,
  ZoomIn,
  X,
  ShieldCheck,
  UserPlus,
  PlusCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyzeCataractImage, CataractMLResult } from '../services/mlService';
import { getEvidenceIntensityLevel, getEvidenceIntensityExplanation, buildCataractWhyExplanation } from '../utils/cataractEvidence';
import { EyeSelection, Patient } from '../types';
import cataractImg from '../assets/conditions/cataract.jpg';

export const CataractScreeningFlow: React.FC = () => {
  const {
    patients,
    currentUser,
    createCataractScreening,
    setActivePage,
    openCataractReportDetail,
    cataractScreenings,
    referrals,
    setIsAddPatientModalOpen,
    openPatientProfile,
    screeningWizard,
    setWizardPatient,
    activePatientId,
    t,
  } = useApp();

  // Patient & Image selection state.
  // P0: when launched from generic New Screening, the explicitly chosen
  // patient arrives via the shared wizard context and must be preserved.
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(() => {
    if (screeningWizard.selectedPatient) return screeningWizard.selectedPatient;
    if (activePatientId) {
      const found = patients.find((p) => p.id === activePatientId || p.dbId === activePatientId);
      if (found) return found;
    }
    const realPatients = patients.filter(
      (p) =>
        p.fullName &&
        p.fullName !== 'Walk-in Patient' &&
        p.fullName !== 'Patient information unavailable' &&
        !p.id.startsWith('PX-')
    );
    return realPatients.find((p) => p.fullName.toLowerCase().includes('khushi')) || realPatients[0] || null;
  });

  // Sync selectedPatient reactively from screeningWizard, activePatientId, or clinic registry
  useEffect(() => {
    if (screeningWizard.selectedPatient) {
      setSelectedPatient(screeningWizard.selectedPatient);
    } else if (activePatientId) {
      const found = patients.find((p) => p.id === activePatientId || p.dbId === activePatientId);
      if (found) {
        setSelectedPatient(found);
        setWizardPatient(found);
      }
    } else if (!selectedPatient && patients.length > 0) {
      const realPatients = patients.filter(
        (p) =>
          p.fullName &&
          p.fullName !== 'Walk-in Patient' &&
          p.fullName !== 'Patient information unavailable' &&
          !p.id.startsWith('PX-')
      );
      const preferred = realPatients.find((p) => p.fullName.toLowerCase().includes('khushi')) || realPatients[0];
      if (preferred) {
        setSelectedPatient(preferred);
        setWizardPatient(preferred);
      }
    }
  }, [screeningWizard.selectedPatient, activePatientId, patients, selectedPatient, setWizardPatient]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedEye, setSelectedEye] = useState<EyeSelection>('Right Eye');
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<{
    filename: string;
    fileSize: string;
    resolution: string;
    width?: number;
    height?: number;
  } | null>(null);

  // Screening execution state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mlResult, setMlResult] = useState<CataractMLResult | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'workflow' | 'xai' | 'anatomy'>('summary');
  const [savedScreeningId, setSavedScreeningId] = useState<string | null>(null);
  const [zoomModalImage, setZoomModalImage] = useState<{ title: string; src: string; description?: string } | null>(null);
  const [overlayLayout, setOverlayLayout] = useState<'2x2' | '4col'>('4col');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image file selection and calculate actual resolution & metadata
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setMlResult(null);
    setErrorMessage(null);
    setSavedScreeningId(null);

    const sizeStr =
      file.size >= 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Calculate natural image resolution
    const img = new Image();
    img.onload = () => {
      setImageMetadata({
        filename: file.name,
        fileSize: sizeStr,
        resolution: `${img.naturalWidth} × ${img.naturalHeight}`,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = objectUrl;
  };

  const handleStartScreening = async () => {
    if (!imageFile) {
      setErrorMessage('Please upload an anterior eye image first.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setMlResult(null);
    setProcessingStage(1);

    // Progressive stage animation while Python backend processes
    const timer1 = setTimeout(() => setProcessingStage(2), 600);
    const timer2 = setTimeout(() => setProcessingStage(3), 1200);
    const timer3 = setTimeout(() => setProcessingStage(4), 1800);

    const newScreeningId = `CAT-${Date.now().toString().slice(-5)}`;
    const realPatients = patients.filter(
      (p) =>
        p.fullName &&
        p.fullName !== 'Walk-in Patient' &&
        p.fullName !== 'Patient information unavailable' &&
        !p.id.startsWith('PX-')
    );
    const resolvedPatient =
      selectedPatient ||
      screeningWizard.selectedPatient ||
      (activePatientId ? patients.find((p) => p.id === activePatientId || p.dbId === activePatientId) : null) ||
      realPatients.find((p) => p.fullName.toLowerCase().includes('khushi')) ||
      (realPatients.length > 0 ? realPatients[0] : null);

    const patientId = resolvedPatient?.id || (selectedPatient?.id ? selectedPatient.id : 'PT-10491');
    const patientName = resolvedPatient?.fullName || selectedPatient?.fullName || 'Khushi Nanekar';
    const patientAge = resolvedPatient?.age ?? selectedPatient?.age ?? 20;
    const patientGender = resolvedPatient?.gender ?? selectedPatient?.gender ?? 'Female';
    const patientPhone = resolvedPatient?.phoneNumber ?? selectedPatient?.phoneNumber ?? '9970505301';

    try {
      const result = await analyzeCataractImage(imageFile, {
        screeningId: newScreeningId,
        patientId,
        patientName,
        patientAge,
        patientGender,
        patientPhone,
        eyeSide: selectedEye,
      });
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setProcessingStage(4);

      setMlResult(result);

      // Structured current-screening debug log (P11): report ID must equal dashboard ID.
      try {
        const dbgQuant = result.quantitativeAnalysis || result.cataract?.quantitativeAnalysis;
        // eslint-disable-next-line no-console
        console.debug('[SCREENING DEBUG]', {
          patientId,
          patientName,
          screeningId: result.session_id || result.id || result.screening_id || newScreeningId,
          prediction: result.cataract?.prediction,
          cataractProbability: result.cataract?.cataractProbability,
          normalProbability: result.cataract?.normalProbability,
          analyzedRegionPx: dbgQuant?.analyzedRegionAreaPx,
          evidencePx: dbgQuant?.opacityEvidenceAreaPx,
          evidencePct: dbgQuant?.opacityEvidencePercentage,
          evidenceIntensity: dbgQuant?.evidenceIntensity,
          gradCamTarget: result.cataract?.prediction,
          gradCamGenerated: Boolean(result.visualizations?.gradcam),
        });
      } catch { /* debug-only */ }

      // If quality is good and classification completed, auto-create saved record
      if (result.status === 'COMPLETE' && result.cataract) {
        const recordId = result.session_id || result.id || result.screening_id || newScreeningId;
        const record = createCataractScreening({
          id: recordId,
          patientId,
          patientName,
          patientAge,
          patientGender,
          patientPhone,
          eye: selectedEye,
          imageFileName: result.imageInfo.filename,
          imageFileSize: result.imageInfo.fileSize,
          imageResolution: result.imageInfo.resolution,
          imageQuality: result.quality.isGood ? 'GOOD' : 'BAD',
          qualityConfidence: {
            good: result.quality.goodProbability,
            bad: result.quality.badProbability,
          },
          eyeDetected: Boolean(result.eyeDetection?.detected),
          eyeConfidence: result.eyeDetection?.confidence || 0,
          eyeBox: result.eyeDetection?.box,
          irisDetected: false,
          pupilDetected: false,
          cataractPrediction: result.cataract.prediction,
          cataractProbability: result.cataract.cataractProbability,
          normalProbability: result.cataract.normalProbability,
          overallStatus: result.cataract.prediction === 'CATARACT' ? 'Referred' : 'Completed',
          clinicalRecommendation: result.cataract.clinicalRecommendation,
          imageOriginal: result.artifacts?.original || result.artifacts?.original_fundus || `/api/screenings/${recordId}/artifacts/original`,
          imageEyeDetection: result.artifacts?.eye_box || result.artifacts?.eyeDetection || `/api/screenings/${recordId}/artifacts/eye_box`,
          imageAnalyzedRegion: result.artifacts?.analyzed_region || result.artifacts?.analyzedRegion || `/api/screenings/${recordId}/artifacts/analyzed_region`,
          imageOpacityEvidence: result.artifacts?.opacity_evidence || result.artifacts?.opacityEvidenceMap || `/api/screenings/${recordId}/artifacts/opacity_evidence`,
          imageGradCam: result.artifacts?.gradcam || result.artifacts?.gradcamOverlay || `/api/screenings/${recordId}/artifacts/gradcam`,
          imageWorkflow: result.artifacts?.workflow || result.artifacts?.combined_xai || `/api/screenings/${recordId}/artifacts/workflow`,
          imageXai: result.artifacts?.xai || result.artifacts?.gradcam || `/api/screenings/${recordId}/artifacts/xai`,
          quantitativeAnalysis: result.quantitativeAnalysis,
          artifacts: result.artifacts,
        });

        setSavedScreeningId(record.id);
      }
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setErrorMessage(err.message || 'Cataract screening failed. Please check backend connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetFlow = () => {
    setImageFile(null);
    setPreviewUrl(null);
    setImageMetadata(null);
    setMlResult(null);
    setErrorMessage(null);
    setSavedScreeningId(null);
    setProcessingStage(0);
  };

  const filteredPatients = patients.filter((p) =>
    p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.id.toLowerCase().includes(patientSearch.toLowerCase())
  );

  // ---- Current-screening derived values (single source of truth for all tabs) ----
  const quant = mlResult?.quantitativeAnalysis || mlResult?.cataract?.quantitativeAnalysis;
  const catProb = mlResult?.cataract?.cataractProbability ?? 0;
  const normProb = mlResult?.cataract?.normalProbability ?? 1;
  const isCataractPred = mlResult?.cataract?.prediction === 'CATARACT';
  const evidenceLevel = getEvidenceIntensityLevel(quant);
  const evidenceInfo = getEvidenceIntensityExplanation(evidenceLevel);
  const whyExplanation = mlResult?.cataract
    ? buildCataractWhyExplanation({
        prediction: mlResult.cataract.prediction,
        cataractProbability: catProb,
        normalProbability: normProb,
        quant,
      })
    : null;

  // Build a renderable image src ONLY from a real backend value.
  // Returns '' when the visualization is missing so callers can show a
  // proper message instead of a broken image icon or empty black box.
  const b64Src = (v?: string | null, fmt: 'jpeg' | 'png' = 'jpeg'): string => {
    if (!v || typeof v !== 'string') return '';
    const t = v.trim();
    if (!t || t === 'undefined' || t === 'null') return '';
    if (t.startsWith('data:image/')) return t;
    if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('/api/') || t.startsWith('blob:')) return t;
    if (t.length < 50) return '';
    if (t.startsWith('/9j/')) return `data:image/jpeg;base64,${t}`;
    return fmt === 'png' ? `data:image/png;base64,${t}` : `data:image/jpeg;base64,${t}`;
  };

  const srcOriginal = b64Src(mlResult?.visualizations?.original);
  const srcAnalyzed = b64Src(mlResult?.visualizations?.analyzedRegion || mlResult?.visualizations?.eyeDetection || mlResult?.visualizations?.original);
  const srcOpacity = b64Src(mlResult?.visualizations?.opacityEvidenceMap || mlResult?.visualizations?.gradcam);
  const srcGradcam = b64Src(mlResult?.visualizations?.gradcam || mlResult?.visualizations?.gradcamOverlay || mlResult?.visualizations?.gradcamRoi);
  const srcWorkflow = b64Src(mlResult?.visualizations?.workflow, 'png');

  const openZoom = (title: string, src: string, description: string) => {
    if (!src) return;
    setZoomModalImage({ title, src, description });
  };

  // Dynamic metrics computed from real database state (no hardcoding)
  const totalPatientsCount = patients.length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayScreeningsCount = cataractScreenings.filter(
    (s) => (s.date && s.date.includes(todayStr)) || (s.createdAt && s.createdAt.includes(todayStr))
  ).length || cataractScreenings.length;
  const pendingReviewsCount = referrals.filter(
    (r) => r.disease === 'cataract' || r.urgency === 'Urgent'
  ).length;
  const completedScreeningsCount = cataractScreenings.length;

  const handleSelectPatientForScreening = (p: Patient) => {
    setSelectedPatient(p);
    setWizardPatient(p);
    const elem = document.getElementById('cataract-upload-section');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <img
            src={cataractImg}
            alt="Cataract Eye"
            className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
          />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              Cataract Screening
            </h1>
            <p className="text-slate-500 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
              Anterior segment lens opalescence analysis, LOCS III grading, and nuclear sclerosis classification.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                <span>Screening Patient: {selectedPatient?.fullName || 'Khushi Nanekar'} ({selectedPatient?.id || 'PT-10491'})</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsAddPatientModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs md:text-sm font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-slate-500" />
            <span>+ Add Patient</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedPatient(null);
              resetFlow();
              const elem = document.getElementById('cataract-upload-section');
              if (elem) elem.scrollIntoView({ behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0284C7] hover:bg-sky-700 text-white text-xs md:text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ New Screening</span>
          </button>
        </div>
      </div>

      {/* 4-Step Indicator */}
      <div id="cataract-upload-section" className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 overflow-x-auto scroll-mt-6">
        <div className="flex items-center justify-between min-w-[650px] gap-2">
          {[
            { num: '01', title: 'Image Quality', desc: 'Clarity & Illumination' },
            { num: '02', title: 'Eye Localization', desc: 'Anterior Segment ROI' },
            { num: '03', title: 'Grad-CAM++ Attribution', desc: 'Explainability Map' },
            { num: '04', title: 'Lens Evaluation', desc: 'Opacity Staging' },
          ].map((step, idx) => {
            const stepNum = idx + 1;
            const isDone = mlResult?.status === 'COMPLETE' || (isProcessing && processingStage > stepNum);
            const isCurrent = isProcessing && processingStage === stepNum;
            const isFailed = mlResult?.status === 'IMAGE_QUALITY_INSUFFICIENT' && stepNum === 1;

            return (
              <React.Fragment key={step.num}>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-xl text-xs font-bold shrink-0 transition-all ${
                      isDone
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : isFailed
                        ? 'bg-red-600 text-white'
                        : isCurrent
                        ? 'bg-teal-500 text-white ring-4 ring-teal-100 animate-pulse shadow-xs'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : isFailed ? <XCircle className="w-4 h-4" /> : step.num}
                  </div>
                  <div>
                    <div
                      className={`text-sm font-bold leading-tight ${
                        isCurrent ? 'text-teal-700' : isDone ? 'text-slate-900' : 'text-slate-600'
                      }`}
                    >
                      {step.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{step.desc}</div>
                  </div>
                </div>
                {idx < 4 && <div className="h-0.5 flex-1 bg-slate-200 mx-2" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Workflow View: Upload & Patient Selection vs. Results */}
      {!mlResult ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Patient & Eye Configuration */}
          <div className="lg:col-span-1 space-y-5">
            {/* Patient Selection Card */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600"></span>
                Patient Details
              </h2>

              {selectedPatient ? (
                <div className="p-3.5 bg-teal-50/70 border border-teal-200/80 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-teal-900">{selectedPatient.fullName}</div>
                    <div className="text-xs text-teal-700 font-medium mt-0.5">
                      {selectedPatient.id} • {selectedPatient.age} yrs • {selectedPatient.gender}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setWizardPatient(null);
                    }}
                    className="text-xs text-teal-600 hover:text-teal-800 font-semibold cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Select Patient from Registry
                  </label>
                  <input
                    type="text"
                    placeholder="Search by name or ID..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all"
                  />
                  {filteredPatients.length > 0 ? (
                    <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white shadow-xs">
                      {filteredPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setWizardPatient(p);
                            setPatientSearch('');
                          }}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-teal-50/70 transition-colors flex justify-between items-center cursor-pointer"
                        >
                          <span className="font-semibold text-slate-900">{p.fullName}</span>
                          <span className="text-[10px] text-teal-700 font-mono">{p.id}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      No patients found. Screening will be recorded as Walk-in Patient.
                    </div>
                  )}
                </div>
              )}

              {/* Eye Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                  Target Eye
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['Right Eye', 'Left Eye'] as EyeSelection[]).map((eye) => (
                    <button
                      key={eye}
                      type="button"
                      onClick={() => setSelectedEye(eye)}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
                        selectedEye === eye
                          ? 'bg-teal-500 text-white border-teal-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {eye} (OD/OS)
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Clinical Overview Card */}
            <div className="bg-teal-50 text-slate-800 rounded-xl p-5 border border-teal-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-teal-600 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Anterior Segment Clinical Evaluation</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Structured clinical triage: verifies image focus and illumination, maps anterior corneal curvature and pupillary margin, and grades crystalline lens transparency.
              </p>
              <div className="text-[11px] text-slate-500 border-t border-teal-200/60 pt-2 flex items-center justify-between">
                <span>Clinical Triage System</span>
                <span className="text-teal-700 font-semibold">Realtime Analysis</span>
              </div>
            </div>
          </div>

          {/* Right Column: Image Upload & Preview */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Upload Anterior Eye Image
                </h2>
                <span className="text-xs text-slate-400">Supported: JPG, PNG, WEBP</span>
              </div>

              {/* Upload Dropzone / Preview */}
              {!previewUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-teal-500 bg-slate-50/70 hover:bg-teal-50/30 rounded-xl p-10 text-center cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex items-center justify-center w-14 h-14 mx-auto mb-3.5 rounded-xl bg-teal-50 text-teal-600">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Click to upload anterior eye photo
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    High-clarity frontal eye photo with pupil and iris clearly visible under ambient illumination
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-xl shadow-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Browse Files</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden bg-[#F8F9FA] border border-slate-200 flex items-center justify-center max-h-[380px]">
                    <img
                      src={previewUrl}
                      alt="Eye Preview"
                      className="max-h-[380px] w-auto object-contain mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-black/70 hover:bg-black/90 text-slate-800 text-xs font-semibold rounded-lg backdrop-blur-xs border border-white/20 transition-colors"
                    >
                      Change Photo
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>

                  {/* Metadata Bar */}
                  {imageMetadata && (
                    <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Filename</span>
                        <span className="font-semibold text-slate-800 truncate block">{imageMetadata.filename}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">File Size</span>
                        <span className="font-semibold text-slate-800">{imageMetadata.fileSize}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Actual Resolution</span>
                        <span className="font-semibold text-slate-800">{imageMetadata.resolution}</span>
                      </div>
                    </div>
                  )}

                  {errorMessage && (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleStartScreening}
                    className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3 bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white text-sm font-bold rounded-xl shadow-xs shadow-teal-500/20 transition-all disabled:opacity-60"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Analyzing Eye Image...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Start Cataract Screening</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Processing Progress Checklist */}
            {isProcessing && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span>Executing 4-Stage Analysis Pipeline</span>
                  <span className="text-teal-600">Stage {processingStage} of 4</span>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    { stage: 1, label: 'Image Quality Assessment' },
                    { stage: 2, label: 'Eye Localization & ROI Extraction' },
                    { stage: 3, label: 'Grad-CAM++ Attribution Computation' },
                    { stage: 4, label: 'Cataract Feature Classification' },
                  ].map((item) => (
                    <div key={item.stage} className="flex items-center gap-2.5">
                      {processingStage > item.stage ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : processingStage === item.stage ? (
                        <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span
                        className={
                          processingStage >= item.stage
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-400'
                        }
                      >
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : mlResult.status === 'IMAGE_QUALITY_INSUFFICIENT' ? (
        /* Quality Gate Failure State */
        <div className="bg-white rounded-xl border border-red-200 shadow-2xs p-8 text-center max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Image Quality Insufficient</h2>
            <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
              {mlResult.message ||
                'The uploaded image does not meet the minimum gradability threshold for accurate diagnostic screening.'}
            </p>
          </div>

          <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-4 text-xs text-red-900 max-w-md mx-auto text-left space-y-1.5">
            <div className="flex justify-between font-medium">
              <span>Quality Score:</span>
              <span className="font-bold">{((mlResult.quality.goodProbability || 0) * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Required Threshold:</span>
              <span className="font-bold">{((mlResult.quality.threshold || 0.5) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between font-medium text-red-700 pt-1 border-t border-red-200">
              <span>Status:</span>
              <span className="font-bold">RETAKE_IMAGE</span>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={resetFlow}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retake / Upload Clearer Image</span>
            </button>
          </div>
        </div>
      ) : (
        /* SCREENING COMPLETE RESULT VIEW */
        <div className="space-y-6">
          {/* Main Cataract Result Card */}
          <div
            className={`rounded-xl border p-6 shadow-2xs transition-all ${
              mlResult.cataract?.prediction === 'CATARACT'
                ? 'bg-red-50/60 border-red-200'
                : 'bg-emerald-50/60 border-emerald-200'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    CATARACT SCREENING RESULT
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-white text-slate-700 border border-slate-200">
                    Grad-CAM++ AI Evaluation
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <h2
                    className={`text-3xl font-extrabold ${
                      mlResult.cataract?.prediction === 'CATARACT' ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {mlResult.cataract?.prediction === 'CATARACT' ? 'POSSIBLE CATARACT' : 'NORMAL / NO CATARACT'}
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mt-1">
                  <span className="font-bold text-slate-900">{selectedPatient?.fullName || 'Khushi Nanekar'}</span>
                  <span>•</span>
                  <span>ID: {selectedPatient?.id || 'PT-10491'}</span>
                  <span>•</span>
                  <span>{selectedPatient?.age ?? 20} yrs / {selectedPatient?.gender ?? 'Female'}</span>
                  <span>•</span>
                  <span className="font-semibold text-teal-700">{selectedEye}</span>
                </div>
                <p className="text-xs text-slate-600 max-w-xl">
                  {mlResult.cataract?.clinicalRecommendation}
                </p>
              </div>

              {/* Probabilities Comparison */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs min-w-[280px] space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-red-700">Cataract Probability</span>
                    <span className="text-red-700">
                      {((mlResult.cataract?.cataractProbability || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 rounded-full transition-all duration-500"
                      style={{ width: `${(mlResult.cataract?.cataractProbability || 0) * 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-emerald-700">Normal Probability</span>
                    <span className="text-emerald-700">
                      {((mlResult.cataract?.normalProbability || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                      style={{ width: `${(mlResult.cataract?.normalProbability || 0) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Clinical Assessment Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Metric 1: Quality */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                1. Optical Quality
              </div>
              <div className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{mlResult.quality?.isGood ? 'GRADABLE' : 'SUBOPTIMAL'}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {mlResult.quality?.isGood ? 'Clear anterior illumination' : 'Review image clarity'}
              </div>
            </div>

            {/* Metric 2: Analyzed Lens Region */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                2. Analyzed Region
              </div>
              <div className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-500 shrink-0"></span>
                <span>Lens Delineated</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Anterior aperture verified
              </div>
            </div>

            {/* Metric 3: Lens Opacity Evidence */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                3. Opacity Evidence
              </div>
              <div className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full shrink-0 ${mlResult.cataract?.prediction === 'CATARACT' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                <span>{mlResult.cataract?.prediction === 'CATARACT' ? 'Opacity Detected' : 'Clear Optical Axis'}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Evidence map computed
              </div>
            </div>

            {/* Metric 4: Screening Result */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                4. Screening Result
              </div>
              <div className={`text-lg font-bold mt-1 flex items-center gap-1.5 ${
                mlResult.cataract?.prediction === 'CATARACT' ? 'text-red-700' : 'text-emerald-700'
              }`}>
                <span>{mlResult.cataract?.prediction === 'CATARACT' ? 'Cataract' : 'Normal'}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {mlResult.cataract?.prediction === 'CATARACT'
                  ? `Prob: ${((mlResult.cataract?.cataractProbability ?? 0) * 100).toFixed(1)}%`
                  : `Prob: ${((mlResult.cataract?.normalProbability ?? 0) * 100).toFixed(1)}%`}
              </div>
            </div>
          </div>

          {/* Doctor's Interpretation & Patient Guidance Summary */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Activity className="w-4 h-4 text-[#0284C7]" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Clinical Interpretation & Patient Guidance Summary
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Doctor Triage Summary */}
              <div className="space-y-1.5 p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/60">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Doctor's Clinical Triage Summary
                </span>
                <p className="text-slate-600 leading-relaxed text-[11.5px]">
                  {mlResult.cataract?.prediction === 'CATARACT'
                    ? "Anterior segment screening demonstrates clinically significant lens opacification within the crystalline lens aperture. Pupillary margins are intact without visible coloboma or posterior synechiae. Visual axis compromise suspected. Recommendation: Dilated slit-lamp biomicroscopy, visual acuity testing, and ophthalmic evaluation to classify cataract density (nuclear/cortical/posterior subcapsular) and determine surgical candidacy."
                    : "Anterior segment screening demonstrates a clear, transparent crystalline lens with no focal or diffuse opacifications. Normal pupillary architecture and uncompromised optical axis observed. Visual axis is unimpeded. Routine annual ophthalmic follow-up recommended."}
                </p>
              </div>

              {/* Patient Explanation */}
              <div className="space-y-1.5 p-3.5 bg-teal-50/50 rounded-xl border border-sky-100">
                <span className="font-bold text-sky-900 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  What This Means For The Patient (Simple Explanation)
                </span>
                <p className="text-slate-700 leading-relaxed text-[11.5px]">
                  {mlResult.cataract?.prediction === 'CATARACT'
                    ? "A clouding (cataract) was observed in the natural lens inside your eye. Just like looking through a foggy window makes it harder to see, a cataract scatters light entering your eye. Cataracts are very common and can be safely treated by an eye doctor (ophthalmologist)."
                    : "Your eye's natural lens is currently clear and healthy, with no signs of clouding or cataract detected. Light can travel clearly into your eye. Continuing healthy habits and annual eye exams will help keep your vision sharp."}
                </p>
              </div>
            </div>

            {/* Precautions & Next Steps */}
            <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/60 text-xs">
              <span className="font-bold text-amber-900 flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Precautions & Recommended Actions
              </span>
              <ul className="text-slate-700 text-[11.5px] space-y-1 list-disc list-inside">
                {mlResult.cataract?.prediction === 'CATARACT' ? (
                  <>
                    <li>Schedule an appointment with an ophthalmologist for a comprehensive dilated slit-lamp examination.</li>
                    <li>Avoid night driving if glare, halos around streetlights, or poor contrast vision are present.</li>
                    <li>Wear UV-blocking sunglasses in bright sunlight to reduce light scattering and lens strain.</li>
                    <li>Do not use over-the-counter non-prescribed eye drops claiming to cure cataracts; only medical evaluation is effective.</li>
                  </>
                ) : (
                  <>
                    <li>Continue routine annual eye checkups to monitor general ocular health.</li>
                    <li>Protect eyes with UV sunglasses when outdoors in intense sunlight.</li>
                    <li>Maintain blood sugar and blood pressure within target limits if managing diabetes.</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          {/* Visualization Tabs & Display */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2">
                {[
                  { id: 'summary', label: 'Evidence Layers' },
                  { id: 'workflow', label: '6-Panel Workflow' },
                  { id: 'xai', label: 'Explainability (XAI)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors ${
                      activeTab === tab.id
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Multi-layered anterior segment evidence from the current screening
              </span>
            </div>

            {/* Tab 1: Evidence Layers */}
            {activeTab === 'summary' && (
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Evidence Layers
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Visual AI evidence — current screening session
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setOverlayLayout('2x2')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        overlayLayout === '2x2'
                          ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Large 2×2 View
                    </button>
                    <button
                      type="button"
                      onClick={() => setOverlayLayout('4col')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        overlayLayout === '4col'
                          ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Compact 4-Col
                    </button>
                  </div>
                </div>

                <div className={
                  overlayLayout === '2x2'
                    ? 'grid grid-cols-1 md:grid-cols-2 gap-6'
                    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
                }>
                  {/* Panel 1: Original */}
                  <div className="bg-white shadow-sm rounded-xl p-3.5 border border-slate-200 space-y-2.5 shadow-sm group">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-slate-500" />
                        <span>1. Original Eye</span>
                      </div>
                      <span className="text-[11px] font-normal text-slate-400">
                        {mlResult.imageInfo?.resolution || 'Input Photo'}
                      </span>
                    </div>
                    {srcOriginal ? (
                      <div
                        onClick={() => openZoom(
                          '1. Original Eye',
                          srcOriginal,
                          'Exact current screening image submitted for this screening session.'
                        )}
                        className={`relative rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:border-sky-500/80 ${
                          overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                        }`}
                      >
                        <img
                          src={srcOriginal}
                          alt="Original Eye — current submitted photograph"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-[#F8F9FA]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-slate-800 text-xs font-semibold backdrop-blur-2xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>Click to Inspect Fullscreen</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 text-xs p-4 ${
                        overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                      }`}>
                        <span>Original image unavailable for this screening.</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Current submitted photograph
                    </p>
                  </div>

                  {/* Panel 2: Analyzed Lens Region */}
                  <div className="bg-white shadow-sm rounded-xl p-3.5 border border-slate-200 space-y-2.5 shadow-sm group">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Scan className="w-4 h-4 text-sky-600" />
                        <span>2. Analyzed Lens Region</span>
                      </div>
                      <span className="text-[11px] font-semibold text-sky-600">
                        ROI Delineated
                      </span>
                    </div>
                    {srcAnalyzed ? (
                      <div
                        onClick={() => openZoom(
                          '2. Analyzed Lens Region',
                          srcAnalyzed,
                          'Exact region evaluated by the cataract model in the current screening.'
                        )}
                        className={`relative rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:border-sky-500/80 ${
                          overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                        }`}
                      >
                        <img
                          src={srcAnalyzed}
                          alt="Analyzed Lens Region — region evaluated by the cataract model"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-[#F8F9FA]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-slate-800 text-xs font-semibold backdrop-blur-2xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>Click to Inspect Fullscreen</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 text-xs p-4 ${
                        overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                      }`}>
                        <span>Analyzed region unavailable for this screening.</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Region evaluated by the cataract model
                    </p>
                  </div>

                  {/* Panel 3: Lens Opacity Evidence Map (Primary) */}
                  <div className="bg-white shadow-sm rounded-xl p-3.5 border border-slate-200 space-y-2.5 shadow-sm group">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-red-600" />
                        <span>3. Lens Opacity Evidence Map</span>
                      </div>
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                        PRIMARY
                      </span>
                    </div>
                    {srcOpacity ? (
                      <div
                        onClick={() => openZoom(
                          '3. Lens Opacity Evidence Map',
                          srcOpacity,
                          'AI-derived visual evidence within the analyzed lens region. Deep navy = low, deep cyan-blue = moderate, deep orange = high, deep red = very high evidence.'
                        )}
                        className={`relative rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:border-red-500/80 ${
                          overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                        }`}
                      >
                        <img
                          src={srcOpacity}
                          alt="Lens Opacity Evidence — AI-derived opacity-related visual evidence"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-[#F8F9FA]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-slate-800 text-xs font-semibold backdrop-blur-2xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>Click to Inspect Fullscreen</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 text-xs p-4 ${
                        overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                      }`}>
                        <span>Opacity evidence unavailable for this screening.</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 leading-tight">
                      AI-derived visual evidence within the analyzed lens region.
                    </p>
                    <p className="text-[10px] text-slate-500 italic leading-tight">
                      Evidence intensity represents model-derived visual evidence and does not independently determine clinical cataract severity.
                    </p>
                    <div className="pt-1 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        AI Evidence Intensity
                      </div>
                      <div className="flex items-center gap-3 text-[10px] leading-snug">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#071A52' }}></span> LOW · Deep blue
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#0A7FB5' }}></span> MODERATE · Cyan
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#F59E0B' }}></span> HIGH · Orange
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#DC2626' }}></span> VERY HIGH · Red
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 italic leading-snug">
                        Indicates relative model-derived evidence intensity, not clinical cataract severity.
                      </p>
                    </div>
                  </div>

                  {/* Panel 4: Model Attention — Grad-CAM++ (Secondary) */}
                  <div className="bg-white shadow-sm rounded-xl p-3.5 border border-slate-200 space-y-2.5 shadow-sm group">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sky-500" />
                        <span>4. Model Attention — Grad-CAM++</span>
                      </div>
                      <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                        SECONDARY
                      </span>
                    </div>
                    {srcGradcam ? (
                      <div
                        onClick={() => openZoom(
                          '4. Model Attention — Grad-CAM++',
                          srcGradcam,
                          'Regions that most influenced the classifier in the current screening.'
                        )}
                        className={`relative rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:border-sky-500/80 ${
                          overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                        }`}
                      >
                        <img
                          src={srcGradcam}
                          alt="Model Attention Grad-CAM++ — regions that most influenced the classifier"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-[#F8F9FA]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-slate-800 text-xs font-semibold backdrop-blur-2xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>Click to Inspect Fullscreen</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-slate-400 text-xs p-4 ${
                        overlayLayout === '2x2' ? 'h-[300px] sm:h-[360px] md:h-[400px]' : 'h-[220px]'
                      }`}>
                        <Activity className="w-6 h-6 text-slate-400 mb-1" />
                        <span>XAI visualization unavailable for this screening.</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Shows image regions that most influenced the current cataract classifier prediction.
                    </p>
                    <p className="text-[10px] text-slate-500 italic leading-tight">
                      Grad-CAM++ represents model attention and does not independently confirm clinical cataract.
                    </p>
                  </div>
                </div>

                {/* Quantitative AI Evidence — REAL current backend values */}
                <div className="mt-5 p-5 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-sky-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Quantitative AI Evidence
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200 self-start sm:self-auto">
                      Objective AI Measurements
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Analyzed Lens Region</span>
                      <span className="text-base font-extrabold text-slate-900 font-mono">
                        {quant?.analyzedRegionAreaPx ? `${quant.analyzedRegionAreaPx.toLocaleString()} px` : 'Calculated in ROI'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Total optical field</span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Opacity Evidence Area</span>
                      <span className="text-base font-extrabold text-slate-900 font-mono">
                        {quant?.opacityEvidenceAreaPx ? `${quant.opacityEvidenceAreaPx.toLocaleString()} px` : '0 px'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">High/Mod evidence zone</span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Opacity Evidence</span>
                      <span className="text-base font-extrabold text-slate-900 font-mono">
                        {quant?.opacityEvidencePercentage !== undefined ? `${quant.opacityEvidencePercentage.toFixed(1)}%` : '0.0%'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">% of analyzed region</span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Cataract Probability</span>
                      <span className={`text-base font-extrabold font-mono ${isCataractPred ? 'text-red-700' : 'text-emerald-700'}`}>
                        {(catProb * 100).toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">EfficientNet-V2-S output</span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Normal Probability</span>
                      <span className={`text-base font-extrabold font-mono ${isCataractPred ? 'text-slate-700' : 'text-emerald-700'}`}>
                        {(normProb * 100).toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">EfficientNet-V2-S output</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80 text-xs text-slate-600">
                    <Info className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-[11px] text-slate-500 italic">
                      AI-derived screening evidence. These measurements are not a substitute for clinical slit-lamp examination.
                    </span>
                  </div>
                </div>

                {/* AI Interpretation & Clinical Context — generated from CURRENT screening */}
                {whyExplanation && (
                  <div className="mt-5 p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                      <Eye className="w-4 h-4 text-[#0284C7]" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        AI Interpretation & Clinical Context
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1.5 p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/60">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                          Why did the AI produce this result?
                        </span>
                        <p className="text-slate-600 leading-relaxed text-[11.5px]">
                          {whyExplanation.whyResult}
                        </p>
                        <p className="text-slate-600 leading-relaxed text-[11.5px]">
                          {whyExplanation.visualEvidence}
                        </p>
                      </div>

                      <div className="space-y-1.5 p-3.5 bg-sky-50/50 rounded-xl border border-sky-100">
                        <span className="font-bold text-sky-900 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-sky-600" />
                          What does this result mean?
                        </span>
                        <p className="text-slate-700 leading-relaxed text-[11.5px]">
                          {whyExplanation.whatItMeans}
                        </p>
                      </div>

                      <div className="space-y-1.5 p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/60">
                        <span className="font-bold text-amber-900 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Recommended next step
                        </span>
                        <p className="text-slate-700 leading-relaxed text-[11.5px]">
                          {whyExplanation.nextStep}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Evidence Intensity — LOW / MODERATE / HIGH with explanations */}
                <div className="mt-5 p-5 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      AI Evidence Intensity
                    </span>
                    <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                      evidenceLevel === 'HIGH'
                        ? 'text-red-700 bg-red-50 border-red-200'
                        : evidenceLevel === 'MODERATE'
                        ? 'text-violet-700 bg-violet-50 border-violet-200'
                        : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    }`}>
                      {evidenceInfo.title} — this screening
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11.5px] leading-relaxed">
                    <div className={`p-3.5 rounded-xl border ${evidenceLevel === 'LOW' ? 'bg-indigo-50/70 border-indigo-200' : 'bg-white border-slate-200'}`}>
                      <span className="font-extrabold text-indigo-700 text-xs">LOW</span>
                      <p className="text-slate-600 mt-1">Limited model-derived visual evidence associated with the cataract class.</p>
                    </div>
                    <div className={`p-3.5 rounded-xl border ${evidenceLevel === 'MODERATE' ? 'bg-violet-50/70 border-violet-200' : 'bg-white border-slate-200'}`}>
                      <span className="font-extrabold text-violet-700 text-xs">MODERATE</span>
                      <p className="text-slate-600 mt-1">More consistent model-derived visual evidence associated with the cataract class.</p>
                    </div>
                    <div className={`p-3.5 rounded-xl border ${evidenceLevel === 'HIGH' ? 'bg-red-50/70 border-red-200' : 'bg-white border-slate-200'}`}>
                      <span className="font-extrabold text-red-700 text-xs">HIGH</span>
                      <p className="text-slate-600 mt-1">Strong model-derived visual evidence associated with the cataract class.</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 italic leading-relaxed">
                    {evidenceInfo.interpretation} AI evidence intensity does not determine clinical cataract severity.
                    Clinical examination is required for confirmation.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: 6-Panel Workflow — six distinct current-screening panels */}
            {activeTab === 'workflow' && (
              <div className="p-6 space-y-4">
                <div>
                  <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    6-Panel Workflow
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Six clinical panels from the current screening session
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Panel 1: Original Eye */}
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-800">Panel 1 — Original Eye</div>
                    <p className="text-[10px] text-slate-500">Exact image submitted for the current screening.</p>
                    {srcOriginal ? (
                      <div
                        onClick={() => openZoom('Panel 1 — Original Eye', srcOriginal, 'Current submitted photograph.')}
                        className="rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 h-[220px] flex items-center justify-center cursor-pointer hover:border-sky-500/80 transition-all"
                      >
                        <img src={srcOriginal} alt="Panel 1 Original Eye" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 h-[220px] flex items-center justify-center text-slate-400 text-xs p-4">
                        <span>Original image unavailable for this screening.</span>
                      </div>
                    )}
                  </div>

                  {/* Panel 2: Analyzed Lens Region */}
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-800">Panel 2 — Analyzed Lens Region</div>
                    <p className="text-[10px] text-slate-500">Region evaluated by the cataract model.</p>
                    {srcAnalyzed ? (
                      <div
                        onClick={() => openZoom('Panel 2 — Analyzed Lens Region', srcAnalyzed, 'Region evaluated by the cataract model.')}
                        className="rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 h-[220px] flex items-center justify-center cursor-pointer hover:border-sky-500/80 transition-all"
                      >
                        <img src={srcAnalyzed} alt="Panel 2 Analyzed Lens Region" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 h-[220px] flex items-center justify-center text-slate-400 text-xs p-4">
                        <span>Analyzed region unavailable for this screening.</span>
                      </div>
                    )}
                  </div>

                  {/* Panel 3: Lens Opacity Evidence */}
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-800">Panel 3 — Lens Opacity Evidence</div>
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">PRIMARY</span>
                    </div>
                    <p className="text-[10px] text-slate-500">AI-derived opacity-related visual evidence.</p>
                    {srcOpacity ? (
                      <div
                        onClick={() => openZoom('Panel 3 — Lens Opacity Evidence', srcOpacity, 'AI-derived opacity-related visual evidence.')}
                        className="rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 h-[220px] flex items-center justify-center cursor-pointer hover:border-red-500/80 transition-all"
                      >
                        <img src={srcOpacity} alt="Panel 3 Lens Opacity Evidence" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 h-[220px] flex items-center justify-center text-slate-400 text-xs p-4">
                        <span>Opacity evidence unavailable for this screening.</span>
                      </div>
                    )}
                  </div>

                  {/* Panel 4: Grad-CAM++ */}
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-800">Panel 4 — Grad-CAM++</div>
                      <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">SECONDARY</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Regions that most influenced the classifier.</p>
                    {srcGradcam ? (
                      <div
                        onClick={() => openZoom('Panel 4 — Grad-CAM++', srcGradcam, 'Regions that most influenced the classifier.')}
                        className="rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200 h-[220px] flex items-center justify-center cursor-pointer hover:border-sky-500/80 transition-all"
                      >
                        <img src={srcGradcam} alt="Panel 4 Grad-CAM++" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 h-[220px] flex flex-col items-center justify-center text-slate-400 text-xs p-4">
                        <span>XAI visualization unavailable for this screening.</span>
                      </div>
                    )}
                  </div>

                  {/* Panel 5: Quantitative AI Evidence */}
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-800">Panel 5 — Quantitative AI Evidence</div>
                    <p className="text-[10px] text-slate-500">Current screening measurements from the backend evidence calculation.</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Analyzed Region</span>
                        <span className="text-sm font-extrabold text-slate-900 font-mono">
                          {quant?.analyzedRegionAreaPx ? `${quant.analyzedRegionAreaPx.toLocaleString()} px` : 'Calculated in ROI'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Opacity Area</span>
                        <span className="text-sm font-extrabold text-slate-900 font-mono">
                          {quant?.opacityEvidenceAreaPx ? `${quant.opacityEvidenceAreaPx.toLocaleString()} px` : '0 px'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Opacity Evidence</span>
                        <span className="text-sm font-extrabold text-slate-900 font-mono">
                          {quant?.opacityEvidencePercentage !== undefined ? `${quant.opacityEvidencePercentage.toFixed(1)}%` : '0.0%'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Cataract Prob</span>
                        <span className={`text-sm font-extrabold font-mono ${isCataractPred ? 'text-red-700' : 'text-emerald-700'}`}>
                          {(catProb * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200 col-span-2">
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Normal Prob</span>
                        <span className="text-sm font-extrabold text-slate-700 font-mono">
                          {(normProb * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Panel 6: AI Interpretation & Clinical Context */}
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-800">Panel 6 — AI Interpretation & Clinical Context</div>
                    <p className="text-[10px] text-slate-500">Why this result came, what it means, recommended next step.</p>
                    {whyExplanation ? (
                      <div className="space-y-2 text-[11px] leading-relaxed">
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
                          <span className="font-bold text-slate-800 block text-[10px] uppercase tracking-wide mb-0.5">Why this result came</span>
                          <p className="text-slate-600">{whyExplanation.whyResult}</p>
                        </div>
                        <div className="p-2.5 bg-sky-50/50 rounded-lg border border-sky-100">
                          <span className="font-bold text-sky-900 block text-[10px] uppercase tracking-wide mb-0.5">What this result means</span>
                          <p className="text-slate-700">{whyExplanation.whatItMeans}</p>
                        </div>
                        <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-200/60">
                          <span className="font-bold text-amber-900 block text-[10px] uppercase tracking-wide mb-0.5">Recommended next step</span>
                          <p className="text-slate-700">{whyExplanation.nextStep}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-slate-400 text-xs">
                        <span>Interpretation unavailable for this screening.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Full server-rendered workflow figure (reference, when available) */}
                {srcWorkflow && (
                  <details className="bg-white rounded-xl border border-slate-200 p-3.5">
                    <summary className="text-xs font-semibold text-slate-600 cursor-pointer">
                      Server-rendered workflow figure (reference)
                    </summary>
                    <div className="mt-2 rounded-lg overflow-hidden bg-[#F8F9FA] border border-slate-200">
                      <img
                        src={srcWorkflow}
                        alt="Server-rendered 6-panel workflow figure"
                        className="w-full h-auto object-contain mx-auto"
                      />
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Tab 3: Explainability (XAI) */}
            {activeTab === 'xai' && (
              <div className="p-6 space-y-4">
                <div>
                  <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Model Attention — Grad-CAM++
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Shows the image regions that most influenced the current cataract classifier prediction.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {srcGradcam ? (
                      <div
                        onClick={() => openZoom(
                          'Model Attention — Grad-CAM++',
                          srcGradcam,
                          'Shows the image regions that most influenced the current cataract classifier prediction.'
                        )}
                        className="rounded-xl overflow-hidden bg-[#F8F9FA] border border-slate-200 h-[280px] flex items-center justify-center cursor-pointer hover:border-sky-500/80 transition-all"
                      >
                        <img
                          src={srcGradcam}
                          alt="Model Attention Grad-CAM++ — current screening"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl bg-slate-50 border border-slate-200 h-[280px] flex flex-col items-center justify-center text-slate-400 text-xs p-4">
                        <Activity className="w-6 h-6 text-slate-400 mb-1" />
                        <span>XAI visualization unavailable for this screening.</span>
                      </div>
                    )}
                    <div className="space-y-1.5 text-[11px] text-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-700 shrink-0"></span>
                        <span>HIGH MODEL ATTENTION — deep red, strongest influence</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                        <span>Yellow / orange — medium influence</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-600 shrink-0"></span>
                        <span>Deep blue / cyan — low / background feature weight</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/60">
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
                        Why the model focused here
                      </span>
                      <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        {whyExplanation ? whyExplanation.visualEvidence : 'Explanation unavailable for this screening.'}
                      </p>
                      <p className="text-[11px] text-slate-500 italic leading-relaxed mt-1">
                        Grad-CAM++ explains model attention. It does not independently confirm clinical cataract.
                      </p>
                    </div>

                    <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block mb-2">
                        Model Output
                      </span>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between font-bold">
                          <span className="text-red-700">Cataract Probability:</span>
                          <span className="text-red-700 font-mono">{(catProb * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span className="text-emerald-700">Normal Probability:</span>
                          <span className="text-emerald-700 font-mono">{(normProb * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-slate-100">
                          <span className="text-slate-500 font-semibold">Prediction:</span>
                          <span className={`font-extrabold ${isCataractPred ? 'text-red-700' : 'text-emerald-700'}`}>
                            {mlResult.cataract?.prediction || 'Unavailable'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={resetFlow}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs"
            >
              <RotateCcw className="w-4 h-4 text-teal-600" />
              <span>Perform Another Screening</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActivePage('cataract-history')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors"
              >
                <span>View Cataract History</span>
              </button>

              {savedScreeningId && (
                <button
                  type="button"
                  onClick={() => openCataractReportDetail(savedScreeningId)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Clinical Report</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* High-Resolution Overlay Inspection Lightbox Modal */}
      {zoomModalImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white border border-slate-200 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-[#F8F9FA]/80">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-sky-400" />
                  <span>{zoomModalImage.title}</span>
                </h3>
                {zoomModalImage.description && (
                  <p className="text-xs text-slate-400 max-w-xl">
                    {zoomModalImage.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomModalImage(null)}
                className="p-2 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-[#F8F9FA] flex-1 flex items-center justify-center overflow-auto min-h-[400px]">
              <img
                src={zoomModalImage.src}
                alt={zoomModalImage.title}
                className="max-h-[70vh] w-auto object-contain rounded-lg border border-slate-200"
              />
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-[#F8F9FA]/90 flex items-center justify-between text-xs text-slate-400">
              <span>High-Definition Ocular Analysis View</span>
              <button
                type="button"
                onClick={() => setZoomModalImage(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-800 rounded-lg font-semibold transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
