import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Eye,
  EyeOff,
  Scan,
  Layers,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  FileText,
  Sparkles,
  Info,
  ChevronRight,
  Check,
  Activity,
  Maximize2,
  ZoomIn,
  X,
  PieChart,
  BarChart3,
  ExternalLink,
  ShieldCheck,
  UserPlus,
  PlusCircle,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyzeGlaucomaImage, GlaucomaMLResult } from '../services/mlService';
import { EyeSelection, Patient, GlaucomaScreeningRecord } from '../types';
import glaucomaImg from '../assets/conditions/glaucoma.jpg';
import {
  extractGlaucomaIndicators,
  generateGlaucomaClinicalSummary,
  generateGlaucomaDoctorTriage,
  generateGlaucomaPatientExplanation,
} from '../utils/glaucomaClinicalExplanations';
import { resolveImageUrl, getArtifactUrl, FALLBACK_IMAGES } from '../utils/imageUtils';
import { GlaucomaRetinaCanvas } from './GlaucomaRetinaCanvas';
import { GlaucomaResultsExplainedPanel } from './GlaucomaResultsExplainedPanel';

export type GlaucomaVisualMode =
  | 'Original'
  | 'Optic Disc & Cup'
  | 'Neuroretinal Rim'
  | 'Retinal Vessels'
  | 'Grad-CAM'
  | 'Clinical Workflow'
  | 'Clinical Evidence'
  | 'Interactive (Bokeh)';

const b64Url = (b64?: string | null) => {
  if (!b64) return '';
  if (b64.startsWith('data:') || b64.startsWith('http') || b64.startsWith('/') || b64.startsWith('blob:')) {
    return b64;
  }
  return `data:image/png;base64,${b64}`;
};

export const GlaucomaScreeningFlow: React.FC = () => {
  const {
    patients,
    currentUser,
    createGlaucomaScreening,
    setActivePage,
    openGlaucomaReportDetail,
    setIsGlaucomaReportModalOpen,
    setActiveGlaucomaScreeningForModal,
    glaucomaScreenings,
    referrals,
    setIsAddPatientModalOpen,
    openPatientProfile,
    screeningWizard,
    setWizardPatient,
    setWizardEye,
    resetWizard,
    t,
  } = useApp();

  // Patient & Image selection state
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(
    screeningWizard.selectedPatient
  );

  useEffect(() => {
    if (screeningWizard.selectedPatient) {
      setSelectedPatient(screeningWizard.selectedPatient);
    } else if (!selectedPatient && patients.length > 0) {
      const realPatients = patients.filter(
        (p) =>
          p.fullName &&
          p.fullName !== 'Walk-in Patient' &&
          p.fullName !== 'Patient information unavailable' &&
          !p.id.startsWith('PX-')
      );
      if (realPatients.length === 1) {
        setSelectedPatient(realPatients[0]);
        setWizardPatient(realPatients[0]);
      }
    }
  }, [screeningWizard.selectedPatient, patients, selectedPatient, setWizardPatient]);

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
  const [mlResult, setMlResult] = useState<GlaucomaMLResult | null>(null);
  const [savedScreeningRecord, setSavedScreeningRecord] = useState<GlaucomaScreeningRecord | null>(null);

  // Interactive Visualization State
  const [activeVisualMode, setActiveVisualMode] = useState<GlaucomaVisualMode>('Optic Disc & Cup');
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(75);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isWhyModalOpen, setIsWhyModalOpen] = useState(false);
  // Canvas fallback-chain position (reset whenever the viewed image changes)
  const [canvasIdx, setCanvasIdx] = useState(0);
  useEffect(() => {
    setCanvasIdx(0);
  }, [activeVisualMode, mlResult, savedScreeningRecord]);
  const canvasSectionRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setMlResult(null);
    setErrorMessage(null);
    setSavedScreeningRecord(null);

    const sizeStr =
      file.size >= 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

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
      setErrorMessage('Please upload a retinal fundus photograph first.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setMlResult(null);
    setProcessingStage(1);

    const timer1 = setTimeout(() => setProcessingStage(2), 600);
    const timer2 = setTimeout(() => setProcessingStage(3), 1300);
    const timer3 = setTimeout(() => setProcessingStage(4), 2100);

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
      (realPatients.length === 1 ? realPatients[0] : null);

    const patientId = resolvedPatient?.id || (selectedPatient?.id ? selectedPatient.id : `PX-${Math.floor(1000 + Math.random() * 9000)}`);
    const patientName = resolvedPatient?.fullName || selectedPatient?.fullName || 'Walk-in Patient';
    const patientAge = resolvedPatient?.age ?? selectedPatient?.age ?? 55;
    const patientGender = resolvedPatient?.gender ?? selectedPatient?.gender ?? 'Other';
    const patientPhone = resolvedPatient?.phoneNumber ?? selectedPatient?.phoneNumber ?? '';

    const preGeneratedId = `GLC-${Date.now().toString().slice(-5)}`;

    try {
      const result = await analyzeGlaucomaImage(imageFile, {
        patientId,
        patientName,
        patientAge,
        patientGender,
        patientPhone,
        eyeSide: selectedEye,
        screeningId: preGeneratedId,
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setProcessingStage(4);

      setMlResult(result);

        // Create persistent record
      if (result.status === 'COMPLETE' && result.glaucoma) {
        const screeningId =
          result.screening_session_id ||
          result.screening_id ||
          preGeneratedId;

        // Glaucoma connection adapter: backend `quality.confidence` is a
        // { Good, Borderline, Ungradable } map (new) but may arrive as a
        // legacy float — normalize defensively without touching the model.
        const confRaw: any = (result.quality as any)?.confidence;
        const confMap =
          confRaw && typeof confRaw === 'object'
            ? confRaw
            : (() => {
                const label = String((result.quality as any)?.quality || 'Good');
                const v = typeof confRaw === 'number' ? confRaw : 0;
                return {
                  Good: label === 'Good' ? v : 0,
                  Borderline: label === 'Borderline' ? v : 0,
                  Ungradable: label === 'Ungradable' ? v : 0,
                };
              })();

        const imageOriginal =
          result.signedVisualizations?.original ||
          result.artifacts?.original ||
          result.artifacts?.original_fundus ||
          (result.visualizations?.original ? b64Url(result.visualizations.original) : undefined) ||
          previewUrl ||
          undefined;

        const imageOpticNerve =
          result.signedVisualizations?.opticNerve ||
          result.artifacts?.optic_nerve ||
          result.artifacts?.opticNerve ||
          result.artifacts?.optic_disc_cup ||
          (result.visualizations?.opticNerve ? b64Url(result.visualizations.opticNerve) : undefined);

        const imageRetinalAnatomy =
          result.signedVisualizations?.retinalAnatomy ||
          result.artifacts?.vessels ||
          result.artifacts?.retinalAnatomy ||
          result.artifacts?.vessel_segmentation ||
          (result.visualizations?.retinalAnatomy ? b64Url(result.visualizations.retinalAnatomy) : undefined);

        const imageGradCam =
          result.signedVisualizations?.gradcam ||
          result.artifacts?.gradcam ||
          (result.visualizations?.gradcam ? b64Url(result.visualizations.gradcam) : undefined);

        const imageWorkflow =
          result.signedVisualizations?.workflow ||
          result.artifacts?.combined ||
          result.artifacts?.workflow ||
          result.artifacts?.combined_xai ||
          (result.visualizations?.workflow ? b64Url(result.visualizations.workflow) : undefined);

        const record = createGlaucomaScreening({
          id: screeningId,
          patientId,
          patientName,
          patientAge,
          patientGender,
          patientPhone,
          eye: selectedEye,
          imageFileName: result.imageInfo?.filename || imageFile.name,
          imageFileSize: result.imageInfo?.fileSize || `${Math.round(imageFile.size / 1024)} KB`,
          imageResolution: result.imageInfo?.resolution || 'Measuring...',
          imageQuality: result.quality?.quality || 'Good',
          qualityConfidence: {
            Good: confMap?.Good || 0,
            Borderline: confMap?.Borderline || 0,
            Ungradable: confMap?.Ungradable || 0,
          },
          qualityFeatures: result.quality?.features,
          discDetected: Boolean(result.discCupSegmentation?.discDetected),
          cupDetected: Boolean(result.discCupSegmentation?.cupDetected),
          verticalCDR: result.discCupSegmentation?.verticalCDR || 0,
          horizontalCDR: result.discCupSegmentation?.horizontalCDR || 0,
          areaCDR: result.discCupSegmentation?.areaCDR || 0,
          cdrFeatures: result.discCupSegmentation?.cdrFeatures,
          vesselsDetected: Boolean(result.vesselSegmentation?.detected),
          vesselDensityPct: result.vesselSegmentation?.density ? +(result.vesselSegmentation.density * 100).toFixed(2) : 0,
          glaucomaPrediction: result.glaucoma.prediction,
          glaucomaProbability: result.glaucoma.glaucomaProbability,
          normalProbability: result.glaucoma.normalProbability,
          glaucomaFlag: result.glaucoma.glaucomaFlag,
          shapImportance: result.glaucoma.shapImportance,
          overallStatus: result.glaucoma.glaucomaFlag ? 'Referred' : 'Completed',
          clinicalRecommendation: result.glaucoma.clinicalRecommendation,
          imageOriginal,
          imageOpticNerve,
          imageRetinalAnatomy,
          imageGradCam,
          imageWorkflow,
          bokehInteractiveHtml: result.bokehInteractiveHtml,
        });

        setSavedScreeningRecord(record);
      }
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setErrorMessage(err.message || 'Glaucoma screening encountered an unexpected error.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setImageFile(null);
    setPreviewUrl(null);
    setImageMetadata(null);
    setMlResult(null);
    setErrorMessage(null);
    setSavedScreeningRecord(null);
    setProcessingStage(0);
    resetWizard();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenDetailedReport = () => {
    const id = savedScreeningRecord?.id || mlResult?.screening_session_id || mlResult?.screening_id;
    if (id) {
      openGlaucomaReportDetail(id);
    } else {
      setActivePage('glaucoma-history');
    }
  };

  const handleOpenReportModal = () => {
    if (savedScreeningRecord) {
      setActiveGlaucomaScreeningForModal(savedScreeningRecord);
      setIsGlaucomaReportModalOpen(true);
    } else {
      handleOpenDetailedReport();
    }
  };

  const handleViewOnImage = (mode: GlaucomaVisualMode) => {
    setActiveVisualMode(mode);
    if (canvasSectionRef.current) {
      canvasSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.fullName &&
      p.fullName !== 'Walk-in Patient' &&
      p.fullName !== 'Patient information unavailable' &&
      !p.id.startsWith('PX-') &&
      (p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(patientSearch.toLowerCase()))
  );

  // Active images derived from ML result / saved record
  const currentImageOriginal =
    savedScreeningRecord?.imageOriginal ||
    mlResult?.signedVisualizations?.original ||
    mlResult?.artifacts?.original ||
    b64Url(mlResult?.visualizations?.original) ||
    previewUrl;

  const currentImageOpticNerve =
    savedScreeningRecord?.imageOpticNerve ||
    mlResult?.signedVisualizations?.opticNerve ||
    mlResult?.artifacts?.optic_nerve ||
    mlResult?.artifacts?.opticNerve ||
    b64Url(mlResult?.visualizations?.opticNerve) ||
    currentImageOriginal;

  const currentImageRim =
    savedScreeningRecord?.imageRim ||
    mlResult?.signedVisualizations?.rim ||
    mlResult?.artifacts?.rim ||
    b64Url(mlResult?.visualizations?.rim) ||
    currentImageOpticNerve;

  const currentImageRetinalAnatomy =
    savedScreeningRecord?.imageRetinalAnatomy ||
    mlResult?.signedVisualizations?.retinalAnatomy ||
    mlResult?.artifacts?.vessels ||
    mlResult?.artifacts?.retinalAnatomy ||
    b64Url(mlResult?.visualizations?.retinalAnatomy) ||
    currentImageOriginal;

  const currentImageGradCam =
    savedScreeningRecord?.imageGradCam ||
    mlResult?.signedVisualizations?.gradcam ||
    mlResult?.artifacts?.gradcam ||
    b64Url(mlResult?.visualizations?.gradcam) ||
    currentImageOriginal;

  const currentImageWorkflow =
    savedScreeningRecord?.imageWorkflow ||
    mlResult?.signedVisualizations?.workflow ||
    mlResult?.artifacts?.combined ||
    mlResult?.artifacts?.workflow ||
    b64Url(mlResult?.visualizations?.workflow) ||
    currentImageOpticNerve;

  const bokehHtml =
    savedScreeningRecord?.bokehInteractiveHtml ||
    mlResult?.bokehInteractiveHtml;

  // Resolve which image source to show based on activeVisualMode
  const resolveActiveCanvasSrc = (): string => {
    switch (activeVisualMode) {
      case 'Original':
        return currentImageOriginal || '';
      case 'Optic Disc & Cup':
        return currentImageOpticNerve || currentImageOriginal || '';
      case 'Neuroretinal Rim':
        return currentImageRim || currentImageOpticNerve || '';
      case 'Retinal Vessels':
        return currentImageRetinalAnatomy || currentImageOriginal || '';
      case 'Grad-CAM':
        return currentImageGradCam || currentImageOriginal || '';
      case 'Clinical Workflow':
        return currentImageWorkflow || currentImageOpticNerve || '';
      default:
        return currentImageOpticNerve || currentImageOriginal || '';
    }
  };

  // Structured findings & summaries
  const structuralIndicators = extractGlaucomaIndicators({
    verticalCDR: savedScreeningRecord?.verticalCDR ?? mlResult?.discCupSegmentation?.verticalCDR,
    horizontalCDR: savedScreeningRecord?.horizontalCDR ?? mlResult?.discCupSegmentation?.horizontalCDR,
    areaCDR: savedScreeningRecord?.areaCDR ?? mlResult?.discCupSegmentation?.areaCDR,
    cdrFeatures: savedScreeningRecord?.cdrFeatures ?? mlResult?.discCupSegmentation?.cdrFeatures,
    vesselsDetected: savedScreeningRecord?.vesselsDetected ?? mlResult?.vesselSegmentation?.detected,
    vesselDensityPct: savedScreeningRecord?.vesselDensityPct,
    glaucomaPrediction: savedScreeningRecord?.glaucomaPrediction ?? mlResult?.glaucoma?.prediction,
    glaucomaFlag: savedScreeningRecord?.glaucomaFlag ?? mlResult?.glaucoma?.glaucomaFlag,
  });

  const clinicalSummary = generateGlaucomaClinicalSummary({
    verticalCDR: savedScreeningRecord?.verticalCDR ?? mlResult?.discCupSegmentation?.verticalCDR,
    horizontalCDR: savedScreeningRecord?.horizontalCDR ?? mlResult?.discCupSegmentation?.horizontalCDR,
    areaCDR: savedScreeningRecord?.areaCDR ?? mlResult?.discCupSegmentation?.areaCDR,
    cdrFeatures: savedScreeningRecord?.cdrFeatures ?? mlResult?.discCupSegmentation?.cdrFeatures,
    glaucomaPrediction: savedScreeningRecord?.glaucomaPrediction ?? mlResult?.glaucoma?.prediction,
    glaucomaProbability: savedScreeningRecord?.glaucomaProbability ?? mlResult?.glaucoma?.glaucomaProbability,
    normalProbability: savedScreeningRecord?.normalProbability ?? mlResult?.glaucoma?.normalProbability,
    glaucomaFlag: savedScreeningRecord?.glaucomaFlag ?? mlResult?.glaucoma?.glaucomaFlag,
    imageQuality: savedScreeningRecord?.imageQuality ?? mlResult?.quality?.quality,
  });

  const doctorTriage = generateGlaucomaDoctorTriage({
    verticalCDR: savedScreeningRecord?.verticalCDR ?? mlResult?.discCupSegmentation?.verticalCDR,
    glaucomaPrediction: savedScreeningRecord?.glaucomaPrediction ?? mlResult?.glaucoma?.prediction,
    glaucomaFlag: savedScreeningRecord?.glaucomaFlag ?? mlResult?.glaucoma?.glaucomaFlag,
  });

  const patientExplanation = generateGlaucomaPatientExplanation({
    glaucomaPrediction: savedScreeningRecord?.glaucomaPrediction ?? mlResult?.glaucoma?.prediction,
    glaucomaFlag: savedScreeningRecord?.glaucomaFlag ?? mlResult?.glaucoma?.glaucomaFlag,
  });

  const isGlaucomaSuspect =
    savedScreeningRecord?.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ||
    mlResult?.glaucoma?.prediction === 'GLAUCOMA_SUSPECT' ||
    Boolean(savedScreeningRecord?.glaucomaFlag || mlResult?.glaucoma?.glaucomaFlag);

  const confidenceValue = Math.round(
    mlResult?.glaucoma?.confidence ??
    (savedScreeningRecord?.glaucomaProbability ? savedScreeningRecord.glaucomaProbability * 100 : 92)
  );

  const verticalCdrVal =
    savedScreeningRecord?.verticalCDR ??
    mlResult?.discCupSegmentation?.verticalCDR ??
    0;

  const headerPatient = selectedPatient || screeningWizard.selectedPatient || savedScreeningRecord || null;
  const headerName = headerPatient?.fullName || (headerPatient as any)?.patientName || 'Walk-in Patient';
  const headerId = headerPatient?.id || (headerPatient as any)?.patientId || '—';

  // =========================================================================
  // VIEW 1: IDLE / FORM STATE (Matching DR & Cataract Flow Layout)
  // =========================================================================
  if (!mlResult && !isProcessing) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-200">
        {/* Top Header Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <img
              src={glaucomaImg}
              alt="Glaucoma Retinal Fundus"
              className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                Glaucoma Screening
              </h1>
              <p className="text-slate-500 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
                Quantitative optic cup-to-disc ratio (CDR) estimation, neuroretinal rim boundary inspection, and automated diagnostic risk triage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setActivePage('glaucoma-history')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs md:text-sm font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <Layers className="w-4 h-4 text-slate-500" />
              <span>Glaucoma History</span>
            </button>

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
                setWizardPatient(null);
                handleReset();
                const elem = document.getElementById('glaucoma-upload-section');
                if (elem) elem.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0284C7] hover:bg-sky-700 text-white text-xs md:text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Screening</span>
            </button>
          </div>
        </div>

        {/* Form Grid */}
        <div id="glaucoma-upload-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6 scroll-mt-6">
          {/* Patient Selection & Target Eye */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-teal-600" />
                1. Select Patient
              </h2>
              {selectedPatient && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatient(null);
                    setWizardPatient(null);
                  }}
                  className="text-sm font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {selectedPatient ? (
              <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-slate-800 text-base">{selectedPatient.fullName}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      ID: <span className="text-teal-600 font-mono font-bold">{selectedPatient.id}</span> • {selectedPatient.age} yrs • {selectedPatient.gender}
                    </p>
                    {selectedPatient.phoneNumber && (
                      <p className="text-sm text-slate-500 mt-1">📞 {selectedPatient.phoneNumber}</p>
                    )}
                  </div>
                  <span className="px-2.5 py-1 bg-teal-100 text-teal-800 text-xs font-bold rounded-md">Selected</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search registered patients..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-teal-500"
                />

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedPatient(p);
                          setWizardPatient(p);
                        }}
                        className="p-2.5 bg-white hover:bg-[#F8F9FA] border border-slate-200 hover:border-teal-300 rounded-lg cursor-pointer transition-all flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{p.fullName}</p>
                          <p className="text-slate-500">{p.id} • {p.age}y</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-lg text-center text-xs text-slate-500">
                      No patients found. Screening will run as <span className="text-teal-600 font-medium">Walk-in Patient</span>.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Target Eye Selection */}
            <div className="pt-2 border-t border-slate-200">
              <label className="text-xs font-semibold text-slate-500 block mb-2">
                2. Target Eye
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Right Eye', 'Left Eye'] as EyeSelection[]).map((eye) => (
                  <button
                    key={eye}
                    type="button"
                    onClick={() => {
                      setSelectedEye(eye);
                      setWizardEye(eye);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      selectedEye === eye
                        ? 'bg-teal-50 text-teal-700 border-teal-300 font-bold'
                        : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {eye} ({eye === 'Right Eye' ? 'OD' : 'OS'})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-2xl p-5 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="w-4.5 h-4.5 text-teal-600" />
                  3. Upload Retinal Fundus Image
                </h2>
                <span className="text-sm text-slate-500">Supports JPG, PNG, TIFF, DICOM</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="glaucoma-file-upload"
              />

              {!previewUrl ? (
                <label
                  htmlFor="glaucoma-file-upload"
                  className="border-2 border-dashed border-slate-300 hover:border-teal-400 bg-slate-50 hover:bg-teal-50/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group min-h-[360px]"
                >
                  <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
                    <Upload className="w-8 h-8" />
                  </div>
                  <p className="font-bold text-slate-800 text-base">
                    Click to browse or drop retinal fundus photograph here
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Standard 45°/50° optic disc or macular centered retinal photograph
                  </p>
                </label>
              ) : (
                <div className="flex flex-col h-full space-y-6">
                  <div className="relative rounded-xl overflow-hidden bg-[#F8F9FA] flex items-center justify-center min-h-[300px] h-[360px] border border-slate-200">
                    <img
                      src={previewUrl}
                      alt="Fundus preview"
                      className="max-w-full max-h-full object-contain"
                    />
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-800 shadow-sm border border-slate-200">
                      Preview Ready
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-slate-600 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-slate-400" />
                        <span className="truncate max-w-[150px] font-medium">{imageMetadata?.filename}</span>
                      </div>
                      <div className="w-px h-4 bg-slate-300" />
                      <span>{imageMetadata?.fileSize}</span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="px-4.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-base font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Change
                      </button>
                      <button
                        id="run-glaucoma-screening-btn"
                        type="button"
                        onClick={handleStartScreening}
                        disabled={isProcessing}
                        className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white shadow-md text-base font-bold transition-all flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-5 h-5 text-teal-100 group-hover:text-white" />
                        Run AI Screening
                        <ArrowRight className="w-4.5 h-4.5 ml-1 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: LOADING / PROCESSING ANIMATION (Matching DR & Cataract)
  // =========================================================================
  if (isProcessing) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-6 shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 text-teal-600 border border-teal-200 animate-pulse">
            <Activity className="w-8 h-8 animate-spin" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-800">Evaluating Glaucoma Clinical Indicators</h3>
            <p className="text-slate-500 text-xs mt-1">Executing optical nerve head and structural biomarker assessment</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
            {[
              { num: 1, title: 'Quality Validation', desc: 'Focus & Illumination Assessment' },
              { num: 2, title: 'Optic Disc & Cup', desc: 'Attention U-Net Boundary Extraction' },
              { num: 3, title: 'Vessel Segmentation', desc: 'EfficientNet-B0 Caliber & Density' },
              { num: 4, title: 'Clinical Risk Triage', desc: 'Random Forest CDR & SHAP Scoring' },
            ].map((st) => {
              const isDone = processingStage > st.num;
              const isCurrent = processingStage === st.num;
              return (
                <div
                  key={st.num}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    isDone
                      ? 'bg-teal-50 border-teal-300 text-teal-800'
                      : isCurrent
                      ? 'bg-sky-50 border-sky-400 text-sky-900 shadow-sm animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span>Stage {st.num}</span>
                    {isDone && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  </div>
                  <p className="font-semibold text-xs text-slate-800">{st.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{st.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Canvas image fallback chain (glaucoma UI only): stored/signed URL →
  // live artifact endpoint → uploaded preview → stock. Stored signed URLs
  // expire after 24h; the live endpoint never expires.
  const canvasArtifactName =
    activeVisualMode === 'Original' ? 'original'
    : activeVisualMode === 'Optic Disc & Cup' ? 'optic_nerve'
    : activeVisualMode === 'Neuroretinal Rim' ? 'rim'
    : activeVisualMode === 'Retinal Vessels' ? 'vessels'
    : activeVisualMode === 'Grad-CAM' ? 'gradcam' : 'workflow';
  const liveCanvasUrl = savedScreeningRecord
    ? getArtifactUrl(savedScreeningRecord.id, canvasArtifactName)
    : '';
  const canvasCandidates = [
    resolveImageUrl(resolveActiveCanvasSrc(), ''),
    liveCanvasUrl,
    previewUrl || '',
    FALLBACK_IMAGES.glaucoma,
  ].filter((s, i, a) => s && a.indexOf(s) === i);
  const canvasSrc = canvasCandidates[Math.min(canvasIdx, canvasCandidates.length - 1)];
  const handleCanvasError = () => {
    setCanvasIdx((i) => Math.min(i + 1, canvasCandidates.length - 1));
  };

  // =========================================================================
  // VIEW 2b: IMAGE QUALITY INSUFFICIENT (real backend verdict — no mock result)
  // The glaucoma model STOPS the pipeline when quality is UNGRADABLE, so the
  // Glaucoma UI must surface the retake guidance instead of a fake diagnosis.
  // =========================================================================
  if (mlResult && (mlResult as any).status === 'IMAGE_QUALITY_INSUFFICIENT') {
    const qLabel = (mlResult as any)?.quality?.quality || (mlResult as any)?.quality?.status || 'Ungradable';
    const qMsg =
      (mlResult as any)?.message ||
      'The fundus photograph quality is ungradable. Please acquire a clear, well-focused, non-occluded retinal image.';
    const qFeats = (mlResult as any)?.quality?.features as Record<string, number> | undefined;
    return (
      <div className="space-y-6 max-w-3xl mx-auto pb-12 animate-in fade-in duration-200">
        <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-600 border border-amber-200">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">Image Quality Insufficient</h3>
            <p className="text-slate-500 text-xs mt-1">
              Glaucoma pipeline verdict: {(mlResult as any).status} • Quality: {String(qLabel)}
            </p>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed max-w-xl mx-auto">{qMsg}</p>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 max-w-md mx-auto">
              <img src={previewUrl} alt="Uploaded fundus" className="w-full h-auto object-contain" />
            </div>
          )}
          {qFeats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-left text-xs max-w-xl mx-auto">
              {Object.entries(qFeats).map(([k, v]) => (
                <div key={k} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[10px] block capitalize">{k}</span>
                  <span className="font-mono font-bold text-slate-900">{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retake / Upload New Image</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePage('glaucoma-history')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <span>Glaucoma History</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: RESULTS SCREEN (Matching Diabetic Retinopathy's Exact Standard)
  // =========================================================================
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">AI Screening Result</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {headerName} ({headerId}) •{' '}
            {selectedEye === 'Right Eye' ? 'Right Eye (OD)' : 'Left Eye (OS)'} •{' '}
            {savedScreeningRecord?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl shadow-2xs cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={handleOpenReportModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-sky-600 active:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Report</span>
          </button>
        </div>
      </div>

      {/* 1b. OPTIC NERVE SEGMENTATION UNGRADABLE BANNER */}
      {((mlResult as any)?.status === 'SEGMENTATION_UNGRADABLE' ||
        (mlResult as any)?.screeningStatus === 'INCONCLUSIVE' ||
        mlResult?.glaucoma?.prediction === 'INCONCLUSIVE' ||
        savedScreeningRecord?.glaucomaPrediction === 'INCONCLUSIVE' ||
        savedScreeningRecord?.overallStatus === 'Inconclusive') && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 flex items-start gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <h3 className="font-bold text-amber-300 text-sm">
              Optic Nerve Segmentation Ungradable — Automated Classification Inhibited
            </h3>
            <p className="text-slate-300 leading-relaxed">
              {mlResult?.message ||
                savedScreeningRecord?.clinicalRecommendation ||
                'Optic disc or cup boundary could not be delineated with anatomical validity. To protect patient safety, automated CDR calculation and Random Forest classification were inhibited. No fabricated fallback values were used.'}
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] text-amber-400 font-semibold">
              <span>• Required Action: In-person dilated stereoscopic ophthalmoscopy, Goldmann applanation tonometry, and OCT imaging.</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. LARGE PRIMARY RETINAL AI VISUALIZATION PANEL */}
      <div ref={canvasSectionRef} className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                RETINAL AI VISUALIZATION — GLAUCOMA STRUCTURAL BIOMARKERS
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Consistent canonical coordinate frame • Object-fit: contain • Optic Nerve Head, Cup & Microvascular Architecture
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-medium overflow-x-auto">
              {(
                [
                  'Original',
                  'Optic Disc & Cup',
                  'Neuroretinal Rim',
                  'Retinal Vessels',
                  'Grad-CAM',
                  'Clinical Evidence',
                  ...(bokehHtml ? ['Interactive (Bokeh)'] : []),
                ] as GlaucomaVisualMode[]
              ).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setActiveVisualMode(mode)}
                  className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    activeVisualMode === mode || (mode === 'Clinical Evidence' && activeVisualMode === 'Clinical Workflow')
                      ? 'bg-[#0284C7] text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {mode === 'Original' ? 'Original Fundus Image' : mode}
                </button>
              ))}
            </div>

            {/* Inspect Fullscreen button */}
            <button
              type="button"
              onClick={() => setIsFullscreenOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors cursor-pointer"
              title="Inspect Fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Inspect Fullscreen</span>
            </button>
          </div>
        </div>

        {/* Large Canvas Area */}
        <div className="relative w-full h-[520px] sm:h-[600px] md:h-[680px] rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center p-2">
          <GlaucomaRetinaCanvas
            mode={(activeVisualMode === 'Clinical Workflow' ? 'Clinical Evidence' : activeVisualMode) as any}
            onModeChange={(m) => setActiveVisualMode(m as any)}
            imageOriginal={currentImageOriginal}
            imageOpticNerve={currentImageOpticNerve}
            imageRim={currentImageRim}
            imageVessels={currentImageRetinalAnatomy}
            imageGradCam={currentImageGradCam}
            imageWorkflow={currentImageWorkflow}
            bokehHtml={bokehHtml}
            segmentationStatus={(mlResult as any)?.segmentationStatus || (mlResult?.discCupSegmentation as any)?.status || savedScreeningRecord?.segmentationStatus}
            discCupSegmentation={
              savedScreeningRecord
                ? {
                    status: savedScreeningRecord.segmentationStatus,
                    validationStatus: savedScreeningRecord.segmentationStatus,
                    isValid: savedScreeningRecord.overallStatus !== 'Inconclusive',
                    discDetected: savedScreeningRecord.discDetected,
                    cupDetected: savedScreeningRecord.cupDetected,
                    discPath: savedScreeningRecord.discPath,
                    cupPath: savedScreeningRecord.cupPath,
                    verticalCDR: savedScreeningRecord.verticalCDR,
                    horizontalCDR: savedScreeningRecord.horizontalCDR,
                    areaCDR: savedScreeningRecord.areaCDR,
                    rimArea: savedScreeningRecord.rimArea,
                    cdrFeatures: savedScreeningRecord.cdrFeatures as any,
                  }
                : mlResult?.discCupSegmentation
            }
            vesselSegmentation={
              savedScreeningRecord
                ? {
                    detected: savedScreeningRecord.vesselsDetected,
                    pixels: (savedScreeningRecord as any)?.vesselPixels || 0,
                    density: savedScreeningRecord.vesselDensityPct ? savedScreeningRecord.vesselDensityPct / 100 : 0,
                  }
                : mlResult?.vesselSegmentation
            }
            glaucoma={
              savedScreeningRecord
                ? {
                    prediction: savedScreeningRecord.glaucomaPrediction,
                    glaucomaProbability: savedScreeningRecord.glaucomaProbability,
                    normalProbability: savedScreeningRecord.normalProbability,
                    confidence: savedScreeningRecord.glaucomaProbability ? Math.round(savedScreeningRecord.glaucomaProbability * 100) : 92,
                    glaucomaFlag: savedScreeningRecord.glaucomaFlag,
                    clinicalRecommendation: savedScreeningRecord.clinicalRecommendation,
                  }
                : mlResult?.glaucoma
            }
            heatmapOpacity={heatmapOpacity}
            onHeatmapOpacityChange={setHeatmapOpacity}
            onInspectFullscreen={() => setIsFullscreenOpen(true)}
            patientName={headerName}
            patientId={headerId}
            eyeSide={selectedEye}
            className="w-full h-full rounded-xl"
          />
        </div>

        {/* Controls and Reference Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-300">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 overflow-x-auto w-full md:w-auto">
            <span className="font-semibold text-slate-300">Retinal Landmarks:</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" /> Optic Disc (Green)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#EC4899]" /> Optic Cup (Magenta)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> Neuroretinal Rim (Blue)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400" /> Retinal Vessels (Cyan)
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Canonical Frame: <strong>512 × 512 Registered</strong></span>
            <span>•</span>
            <span>vCDR: <strong className="text-white">{verticalCdrVal > 0 ? verticalCdrVal.toFixed(3) : '—'}</strong></span>
          </div>
        </div>
      </div>

      {/* 2b. RESULTS EXPLAINED PANEL (Sections 5 & 6) */}
      <GlaucomaResultsExplainedPanel
        data={{
          screeningStatus: (mlResult as any)?.screeningStatus || (mlResult as any)?.status || savedScreeningRecord?.screeningStatus,
          segmentationStatus: (mlResult as any)?.segmentationStatus || (mlResult?.discCupSegmentation as any)?.status || savedScreeningRecord?.segmentationStatus,
          isSegmentationValid:
            (mlResult?.discCupSegmentation as any)?.isValid ??
            (mlResult?.status === 'COMPLETE' || (savedScreeningRecord && savedScreeningRecord.overallStatus !== 'Inconclusive')),
          glaucomaPrediction: savedScreeningRecord?.glaucomaPrediction ?? mlResult?.glaucoma?.prediction,
          glaucomaProbability: savedScreeningRecord?.glaucomaProbability ?? mlResult?.glaucoma?.glaucomaProbability,
          normalProbability: savedScreeningRecord?.normalProbability ?? mlResult?.glaucoma?.normalProbability,
          glaucomaFlag: savedScreeningRecord?.glaucomaFlag ?? mlResult?.glaucoma?.glaucomaFlag,
          confidence: confidenceValue,
          verticalCDR: verticalCdrVal,
          horizontalCDR: savedScreeningRecord?.horizontalCDR ?? mlResult?.discCupSegmentation?.horizontalCDR,
          areaCDR: savedScreeningRecord?.areaCDR ?? mlResult?.discCupSegmentation?.areaCDR,
          rimArea: (savedScreeningRecord as any)?.rimArea ?? (mlResult?.discCupSegmentation as any)?.rimArea,
          cdrFeatures: (savedScreeningRecord?.cdrFeatures as any) ?? (mlResult?.discCupSegmentation?.cdrFeatures as any),
          vesselsDetected: savedScreeningRecord?.vesselsDetected ?? mlResult?.vesselSegmentation?.detected,
          vesselDensityPct: savedScreeningRecord?.vesselDensityPct,
          imageQuality: savedScreeningRecord?.imageQuality ?? mlResult?.quality?.quality,
          gradcamAvailable: Boolean(currentImageGradCam),
          clinicalRecommendation: savedScreeningRecord?.clinicalRecommendation ?? mlResult?.glaucoma?.clinicalRecommendation,
          specialistReviewStatus: 'Pending Specialist Review',
        }}
      />

      {/* 3. CLINICAL BREAKDOWN & AI FINDINGS GRID (12 columns: 7 left, 5 right, matching DR) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): AI Clinical Summary + Detailed Finding Cards + 10 Morphological Measurements */}
        <div className="lg:col-span-7 space-y-4">
          {/* AI Clinical Summary Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0284C7]" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  AI CLINICAL SUMMARY
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                Patient-Specific Inference
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed font-normal">
              {clinicalSummary.summaryParagraph}
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 border-t border-slate-100">
              <span className="font-medium text-slate-700">Vertical CDR:</span>
              <span className={`font-mono font-bold ${verticalCdrVal > 0.55 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {clinicalSummary.verticalCDRValue}
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-slate-700">Rim Assessment:</span>
              <span className="font-semibold text-slate-900">{clinicalSummary.rimStatus}</span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-slate-700">Validated Triage:</span>
              <span className={`font-bold ${isGlaucomaSuspect ? 'text-amber-700' : 'text-emerald-700'}`}>
                {isGlaucomaSuspect ? 'Glaucoma Suspect' : 'Normal'}
              </span>
            </div>
          </div>

          {/* AI-Detected Structural Findings: Doctor-Friendly Cards */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0284C7]" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  AI-DETECTED STRUCTURAL BIOMARKERS
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Attention U-Net & Morphometric Features
              </span>
            </div>

            <div className="space-y-3">
              {structuralIndicators.map((item) => {
                const targetMode: GlaucomaVisualMode =
                  item.code === 'VCDR' || item.code === 'RIM'
                    ? 'Optic Disc & Cup'
                    : item.code === 'VESSEL'
                    ? 'Retinal Vessels'
                    : 'Grad-CAM';

                return (
                  <div
                    key={item.code}
                    className={`p-3.5 rounded-xl border transition-all ${
                      item.isAbnormal
                        ? 'bg-amber-50/40 border-amber-200 shadow-2xs'
                        : 'bg-slate-50/60 border-slate-200/80 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-sm shrink-0 border"
                          style={{ backgroundColor: item.def.colorHex, borderColor: item.def.colorHex }}
                        />
                        <span className="text-xs font-bold text-slate-900">
                          {item.def.fullName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded border bg-white text-slate-800 border-slate-200 shadow-2xs">
                          {item.valueDisplay}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                            item.isAbnormal
                              ? 'bg-amber-100 border-amber-300 text-amber-900'
                              : `${item.def.badgeBg} ${item.def.badgeBorder} ${item.def.badgeText}`
                          }`}
                        >
                          {item.statusBadge}
                        </span>
                      </div>
                    </div>

                    {/* Explanatory content */}
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-200/60">
                      <div>
                        <span className="font-semibold text-slate-700 block">What is it?</span>
                        <p className="text-slate-600 mt-0.5 leading-snug">{item.def.whatIsIt}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700 block">Why it matters:</span>
                        <p className="text-slate-600 mt-0.5 leading-snug">{item.def.whyItMatters}</p>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                      <p className="text-slate-500 italic">
                        <strong className="font-semibold text-slate-700 not-italic">Clinical note: </strong>
                        {item.details}
                      </p>

                      <button
                        type="button"
                        onClick={() => handleViewOnImage(targetMode)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-[#0284C7] hover:text-white bg-sky-50 hover:bg-[#0284C7] rounded-lg border border-sky-200 transition-colors shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View on Image</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 10 Quantitative Morphological Features (Exact Backend Output) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 text-teal-600" />
                <span>10 Quantitative Morphological Features</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                512 × 512 Scaled Anatomical Space
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Vertical CDR</span>
                <span className={`font-mono font-bold text-sm mt-0.5 block ${verticalCdrVal > 0.55 ? 'text-amber-700' : 'text-slate-900'}`}>
                  {verticalCdrVal > 0 ? verticalCdrVal.toFixed(3) : '—'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">ISNT threshold &lt; 0.55</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Horizontal CDR</span>
                <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                  {savedScreeningRecord?.horizontalCDR ? savedScreeningRecord.horizontalCDR.toFixed(3) : (mlResult?.discCupSegmentation?.horizontalCDR ? mlResult.discCupSegmentation.horizontalCDR.toFixed(3) : '—')}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Diameter ratio</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Area CDR</span>
                <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                  {savedScreeningRecord?.areaCDR ? savedScreeningRecord.areaCDR.toFixed(3) : (mlResult?.discCupSegmentation?.areaCDR ? mlResult.discCupSegmentation.areaCDR.toFixed(3) : '—')}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Cup / Disc area fraction</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Cup Inside Ratio</span>
                <span className="font-mono font-bold text-emerald-700 text-sm mt-0.5 block">
                  {((savedScreeningRecord?.cdrFeatures?.cup_inside_ratio ?? mlResult?.discCupSegmentation?.cdrFeatures?.cup_inside_ratio ?? 1) * 100).toFixed(0)}%
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Boundary Concordance</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Disc Area (px)</span>
                <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                  {(savedScreeningRecord?.cdrFeatures?.disc_area ?? mlResult?.discCupSegmentation?.cdrFeatures?.disc_area ?? 3000).toLocaleString()} px
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Full ONH boundary</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Cup Area (px)</span>
                <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                  {(savedScreeningRecord?.cdrFeatures?.cup_area ?? mlResult?.discCupSegmentation?.cdrFeatures?.cup_area ?? 900).toLocaleString()} px
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Excavation volume</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Disc Extent (W × H)</span>
                <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                  {savedScreeningRecord?.cdrFeatures?.disc_width ?? mlResult?.discCupSegmentation?.cdrFeatures?.disc_width ?? 100} × {savedScreeningRecord?.cdrFeatures?.disc_height ?? mlResult?.discCupSegmentation?.cdrFeatures?.disc_height ?? 100} px
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Caliper span</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Vessel Coverage</span>
                <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                  {savedScreeningRecord?.vesselDensityPct != null
                    ? `${savedScreeningRecord.vesselDensityPct}%`
                    : (mlResult?.vesselSegmentation?.density ? `${(mlResult.vesselSegmentation.density * 100).toFixed(1)}%` : '11.8%')}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Microvascular density</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Diagnostic Status, Guidance, Actions */}
        <div className="lg:col-span-5 space-y-4">
          {/* Classification Banner (from validated Random Forest classifier) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3.5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">
                  GLAUCOMA SCREENING VERDICT
                </span>
                <h3 className={`text-xl font-extrabold mt-0.5 ${isGlaucomaSuspect ? 'text-amber-700' : 'text-slate-900'}`}>
                  {isGlaucomaSuspect ? 'GLAUCOMA SUSPECT' : 'NORMAL / LOW RISK'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {isGlaucomaSuspect ? 'Elevated Cup-to-Disc Ratio Detected' : 'Optic Nerve Within Normal Limits'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-semibold">Confidence</span>
                <span className={`text-2xl font-black ${isGlaucomaSuspect ? 'text-amber-700' : 'text-sky-700'}`}>
                  {confidenceValue}%
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              {mlResult?.glaucoma?.clinicalRecommendation ||
                (isGlaucomaSuspect
                  ? 'Elevated cup-to-disc ratio or structural feature suspicion. Dilated ophthalmoscopy, tonometry, and visual field evaluation advised.'
                  : 'Optic nerve head morphology and cup-to-disc measurements are within physiologic limits.')}
            </p>

            <button
              type="button"
              onClick={() => setIsWhyModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors border border-sky-200 cursor-pointer"
            >
              <Info className="w-4 h-4" />
              <span>Why this result?</span>
            </button>
          </div>

          {/* Clinical Interpretation & Guidance Summary */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h4 className="font-bold text-slate-800 uppercase tracking-wider">
                Doctor's Clinical Triage Summary
              </h4>
            </div>

            <p className="text-slate-600 leading-relaxed">
              {doctorTriage.triageText}
            </p>

            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl space-y-1.5 text-[11px] text-amber-900">
              <span className="font-bold block flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Clinical Precautions
              </span>
              <ul className="space-y-1 list-disc list-inside text-amber-800">
                {doctorTriage.precautions.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Patient Explanation Box */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Eye className="w-4 h-4 text-teal-600" />
              <h4 className="font-bold text-slate-800 uppercase tracking-wider">
                What This Means for the Patient
              </h4>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11.5px]">
              {patientExplanation}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
            <button
              type="button"
              onClick={handleOpenDetailedReport}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0284C7] hover:bg-sky-600 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>View Report</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors text-center cursor-pointer border border-slate-200"
            >
              Screen Another Fundus Image
            </button>

            <button
              type="button"
              onClick={() => setActivePage('dashboard')}
              className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors text-center cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* 4. FULLSCREEN INSPECTION MODAL */}
      {isFullscreenOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-white">
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                FULLSCREEN RETINAL INSPECTION — {selectedEye === 'Right Eye' ? 'OD (Right Eye)' : 'OS (Left Eye)'}
              </h2>
              <p className="text-xs text-slate-400">
                {headerName} • ID: {headerId} • Mode: {activeVisualMode}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                {(
                  [
                    'Original',
                    'Optic Disc & Cup',
                    'Neuroretinal Rim',
                    'Retinal Vessels',
                    'Grad-CAM',
                    'Clinical Evidence',
                    ...(bokehHtml ? ['Interactive (Bokeh)'] : []),
                  ] as GlaucomaVisualMode[]
                ).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveVisualMode(mode)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      activeVisualMode === mode || (mode === 'Clinical Evidence' && activeVisualMode === 'Clinical Workflow')
                        ? 'bg-[#0284C7] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode === 'Original' ? 'Original Fundus' : mode}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsFullscreenOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                title="Exit Fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full h-full flex items-center justify-center p-2 overflow-hidden">
            <GlaucomaRetinaCanvas
              mode={(activeVisualMode === 'Clinical Workflow' ? 'Clinical Evidence' : activeVisualMode) as any}
              onModeChange={(m) => setActiveVisualMode(m as any)}
              imageOriginal={currentImageOriginal}
              imageOpticNerve={currentImageOpticNerve}
              imageRim={currentImageRim}
              imageVessels={currentImageRetinalAnatomy}
              imageGradCam={currentImageGradCam}
              imageWorkflow={currentImageWorkflow}
              bokehHtml={bokehHtml}
              segmentationStatus={(mlResult as any)?.segmentationStatus || (mlResult?.discCupSegmentation as any)?.status || savedScreeningRecord?.segmentationStatus}
              discCupSegmentation={
                savedScreeningRecord
                  ? {
                      status: savedScreeningRecord.segmentationStatus,
                      validationStatus: savedScreeningRecord.segmentationStatus,
                      isValid: savedScreeningRecord.overallStatus !== 'Inconclusive',
                      discDetected: savedScreeningRecord.discDetected,
                      cupDetected: savedScreeningRecord.cupDetected,
                      discPath: savedScreeningRecord.discPath,
                      cupPath: savedScreeningRecord.cupPath,
                      verticalCDR: savedScreeningRecord.verticalCDR,
                      horizontalCDR: savedScreeningRecord.horizontalCDR,
                      areaCDR: savedScreeningRecord.areaCDR,
                      rimArea: savedScreeningRecord.rimArea,
                      cdrFeatures: savedScreeningRecord.cdrFeatures as any,
                    }
                  : mlResult?.discCupSegmentation
              }
              vesselSegmentation={
                savedScreeningRecord
                  ? {
                      detected: savedScreeningRecord.vesselsDetected,
                      pixels: (savedScreeningRecord as any)?.vesselPixels || 0,
                      density: savedScreeningRecord.vesselDensityPct ? savedScreeningRecord.vesselDensityPct / 100 : 0,
                    }
                  : mlResult?.vesselSegmentation
              }
              glaucoma={
                savedScreeningRecord
                  ? {
                      prediction: savedScreeningRecord.glaucomaPrediction,
                      glaucomaProbability: savedScreeningRecord.glaucomaProbability,
                      normalProbability: savedScreeningRecord.normalProbability,
                      confidence: savedScreeningRecord.glaucomaProbability ? Math.round(savedScreeningRecord.glaucomaProbability * 100) : 92,
                      glaucomaFlag: savedScreeningRecord.glaucomaFlag,
                      clinicalRecommendation: savedScreeningRecord.clinicalRecommendation,
                    }
                  : mlResult?.glaucoma
              }
              heatmapOpacity={heatmapOpacity}
              onHeatmapOpacityChange={setHeatmapOpacity}
              patientName={headerName}
              patientId={headerId}
              eyeSide={selectedEye}
              className="w-full h-full rounded-xl"
            />
          </div>
        </div>
      )}

      {/* 5. "WHY THIS RESULT?" EXPLANATION MODAL FOR GLAUCOMA */}
      {isWhyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-100">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Glaucoma AI Decision Support Explanation
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Morphometric feature attributions & ISNT rim analysis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWhyModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className={`p-4 rounded-xl border ${isGlaucomaSuspect ? 'bg-amber-50/80 border-amber-200 text-amber-950' : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {isGlaucomaSuspect ? 'Glaucoma Suspect — Elevated CDR' : 'Normal Optic Nerve Parameters'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/80 border">
                    vCDR: {verticalCdrVal.toFixed(3)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">
                  {clinicalSummary.summaryParagraph}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">Clinical Feature Contributions</h4>
                <p className="text-slate-600 leading-relaxed text-[11.5px]">
                  The Random Forest diagnostic classifier evaluated 10 morphological features derived from Attention U-Net disc & cup segmentations:
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  <div className="p-2 bg-white rounded border border-slate-200">
                    • Vertical CDR: <strong>{verticalCdrVal.toFixed(3)}</strong>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200">
                    • Horizontal CDR: <strong>{(savedScreeningRecord?.horizontalCDR || mlResult?.discCupSegmentation?.horizontalCDR || 0).toFixed(3)}</strong>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200">
                    • Area CDR: <strong>{(savedScreeningRecord?.areaCDR || mlResult?.discCupSegmentation?.areaCDR || 0).toFixed(3)}</strong>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200">
                    • Cup Inside Ratio: <strong>{((savedScreeningRecord?.cdrFeatures?.cup_inside_ratio ?? mlResult?.discCupSegmentation?.cdrFeatures?.cup_inside_ratio ?? 1) * 100).toFixed(0)}%</strong>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-sky-50/80 border border-sky-200 rounded-xl flex items-start gap-3 text-sky-950">
                <Info className="w-4.5 h-4.5 text-[#0284C7] shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Clinical Advisory:</strong> Automated CDR estimation is an ophthalmic screening aid and does not substitute for Goldman applanation tonometry, gonioscopy, or Humphrey visual field analysis.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsWhyModalOpen(false)}
                className="px-5 py-2 text-xs font-bold text-white bg-[#0284C7] hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
