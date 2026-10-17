import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  FileText,
  Send,
  Plus,
  Info,
  Check,
  X,
  Users,
  Eye,
  Loader2,
  RefreshCw,
  Activity,
  Maximize2,
  ShieldCheck,
  Sparkles,
  Layers,
  UserPlus,
  PlusCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FundusRetinaCanvas } from './FundusRetinaCanvas';
import { EyeSelection, ScreeningRecord, Patient } from '../types';
import drImg from '../assets/conditions/diabetic_retinopathy.jpg';
import { XaiTab } from '../data/retinaImages';
import {
  extractLesionItems,
  generateDrClinicalSummary,
  DR_LESION_DEFINITIONS,
  ProcessedLesionItem,
} from '../utils/drClinicalExplanations';

// ============================================================
// Types for ML API response
// ============================================================
interface MLImageInfo {
  filename: string;
  fileSize: string;
  resolution: string;
  width: number;
  height: number;
}

interface MLQualityResult {
  quality: 'Good' | 'Borderline' | 'Ungradable';
  confidence: Record<string, number>;
  features: {
    sharpness: number;
    brightness: number;
    illumination: number;
    contrast: number;
    noise: number;
    fov: number;
  };
}

interface MLSeverityResult {
  drSeverity: string;
  drSeverityLevel: string;
  confidence: number;
  recommendation: string;
  probabilities: Record<string, number>;
}

interface MLLesionInfo {
  detected: boolean;
  regions?: number;
  pixels?: number;
}

interface MLTrinayResult {
  anatomy: {
    blood_vessels: { pixels: number; detected: boolean; density?: number; macular_density?: number };
    optic_disc:    { pixels: number; detected: boolean };
    fovea:         { x: number; y: number; disc_distance?: number };
    macula:        { detected: boolean };
    retinal_background: { detected: boolean };
    measurements?: {
      vessel_density_pct?: number;
      macular_vessel_density_pct?: number;
      disc_fovea_distance_px?: number;
    };
  };
  lesions: Record<string, MLLesionInfo>;
  findings: string[];
  visualizations: {
    canonical: string;
    anatomy:   string;
    debug_anatomy?: string;
    lesion:    string;
    combined:  string;
  };
}

interface MLXaiResult {
  vessel:           string | null;
  optic_disc:       string | null;
  fovea:            string | null;
  anatomy_combined: string;
  lesion_combined:  string;
  combined:         string;
  lesions: Record<string, string>;
}

interface MLAnalysisResult {
  imageInfo: MLImageInfo;
  quality:   MLQualityResult;
  stopped:   boolean;
  stopReason?: string;
  severity?: MLSeverityResult;
  trinay?:   MLTrinayResult;
  xai?:      MLXaiResult | null;
  xaiError?: string;
  error?:    string;
  reportId?: string;
}

// ============================================================
import { analyzeRetinalImage, b64ToPngUrl } from '../services/mlService';

// ============================================================
// Component
// ============================================================
export const NewScreeningFlow: React.FC = () => {
  const {
    patients,
    screenings,
    referrals,
    openPatientProfile,
    createScreening,
    setActivePage,
    setIsAddPatientModalOpen,
    setIsExplanationModalOpen,
    setIsReferralModalOpen,
    setActiveScreeningForModal,
    openReportDetail,
    screeningWizard,
    setWizardPatient,
    setWizardEye,
    setWizardImageSource,
    setWizardCapturedImage,
    setWizardImageFile,
    setWizardQualityPassed,
    setWizardActiveResult,
    resetWizard,
    setActiveCase,
    t,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  
  // Patient & Image selection state.
  // P0: when launched from generic New Screening, the explicitly chosen
  // patient arrives via the shared wizard context and must be preserved.
  const [selectedPatient, setSelectedPatient] = useState<any | null>(
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

  const [selectedEye, setSelectedEye] = useState<EyeSelection>('Right Eye');
  const [patientSearchStr, setPatientSearchStr] = useState('');
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<any | null>(null);
  
  
  // Processing state (maps to existing mlLoading)
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState<string | null>(null);
  const [mlResult, setMlResult] = useState<MLAnalysisResult | null>(null);
  const [activeXaiTab, setActiveXaiTab] = useState<XaiTab>('Original');
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(70);
  const [highlightedLesion, setHighlightedLesion] = useState<'MA' | 'HE' | 'EX' | 'SE' | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const canvasSectionRef = useRef<HTMLDivElement>(null);

  const handleViewOnImage = (code: 'MA' | 'HE' | 'EX' | 'SE') => {
    setActiveXaiTab('Lesions');
    setHighlightedLesion(code);
    if (canvasSectionRef.current) {
      canvasSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const runAnalysis = useCallback(async () => {
    if (!screeningWizard.imageFile?.actualFile) {
      setMlError('No image file available for analysis. Please re-upload the image.');
      return;
    }
    setMlLoading(true);
    setMlError(null);
    setMlResult(null);
    try {
      // P0: screening must be attributed to the EXPLICITLY selected patient.
      // Never silently substitute patients[0] — that mixes Patient A/B data.
      const patient = selectedPatient || null;
      const result = await analyzeRetinalImage(screeningWizard.imageFile.actualFile, {
        patientId: patient?.id,
        patientName: patient?.fullName,
        patientAge: patient?.age,
        patientGender: patient?.gender,
        patientPhone: patient?.phoneNumber,
        eyeSide: selectedEye,
      });
      if (result.error) {
        setMlError(result.error);
      } else {
        const severityStr = result.severity?.drSeverity || 'No DR';
        // Use the backend-persisted session id when available (from session_id, id, screening_id, or screening_session_id)
        // so refetch/realtime dedups by id and only one unified report is created.
        const backendSessionId =
          (result as any).session_id ||
          (result as any).id ||
          result.screening_id ||
          result.screening_session_id ||
          undefined;
        const screeningRecord = createScreening({
          ...(backendSessionId ? { id: backendSessionId, reportId: backendSessionId } : {}),
          patientId: patient?.id || 'Walk-in',
          patientName: patient?.fullName || 'Walk-in Patient',
          patientAge: patient?.age || 55,
          patientGender: patient?.gender || 'Other',
          patientPhone: patient?.phoneNumber || '',
          eye: selectedEye,
          imageQuality: result.quality?.quality === 'Good' ? 'Good' : 'Unsuitable',
          drSeverity: severityStr as any,
          drSeverityLevel: result.severity?.drSeverityLevel || 'No DR (Level 0)',
          confidence: result.severity?.confidence || 95,
          findings: result.trinay?.lesions 
             ? Object.entries(result.trinay.lesions).filter(([, info]) => info.detected).map(([name]) => name)
             : [],
          recommendation: result.severity?.recommendation || 'Routine annual screening.',
          status: severityStr === 'No DR' ? 'Completed' : 'Referred',
          imageFileName: result.imageInfo?.filename,
          imageFileSize: result.imageInfo?.fileSize,
        }, {
          imageOriginal: result.trinay?.visualizations?.canonical ? b64ToPngUrl(result.trinay.visualizations.canonical) : undefined,
          imageGradCam: result.xai?.combined ? b64ToPngUrl(result.xai.combined) : undefined,
          imageLesions: result.trinay?.visualizations?.lesion ? b64ToPngUrl(result.trinay.visualizations.lesion) : undefined,
          imageAnatomy: result.trinay?.visualizations?.anatomy ? b64ToPngUrl(result.trinay.visualizations.anatomy) : undefined,
          imageCombined: result.trinay?.visualizations?.combined ? b64ToPngUrl(result.trinay.visualizations.combined) : undefined,
          imageDebugAnatomy: result.trinay?.visualizations?.debug_anatomy ? b64ToPngUrl(result.trinay.visualizations.debug_anatomy) : undefined,
          anatomyData: result.trinay?.anatomy,
          lesionData: result.trinay?.lesions,
          imageResolution: result.imageInfo?.resolution,
        });

        result.reportId = screeningRecord.reportId;
        
        setMlResult(result);
        // Link the wizard result so header, View Report, and explanation
        // modals operate on the CURRENT screening (previously stayed null,
        // which sent View Report to the generic list and left date blank).
        setWizardActiveResult(screeningRecord);
        setWizardQualityPassed(true);
        setActiveCase(result);
      }
    } catch (err: any) {
      setMlError(err.message || 'ML server error. Make sure ml_server.py is running.');
    } finally {
      setMlLoading(false);
    }
  }, [screeningWizard.imageFile, selectedPatient, selectedEye, setActiveCase, setWizardActiveResult, setWizardQualityPassed, createScreening]);



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setWizardImageFile({
      name: file.name,
      size: `${(file.size / 1024).toFixed(0)} KB`,
      previewUrl: URL.createObjectURL(file),
      actualFile: file,
    });
    
    setPreviewUrl(URL.createObjectURL(file));
    setImageMetadata({
      filename: file.name,
      fileSize: file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`,
      resolution: '... Measuring'
    });

    setMlResult(null);
    setMlError(null);
  };

  const handleReset = () => {
    setWizardImageFile(null);
    setPreviewUrl(null);
    setImageMetadata(null);
    setMlResult(null);
    setMlError(null);
    resetWizard();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.fullName &&
      p.fullName !== 'Walk-in Patient' &&
      p.fullName !== 'Patient information unavailable' &&
      !p.id.startsWith('PX-') &&
      (p.fullName.toLowerCase().includes(patientSearchStr.toLowerCase()) ||
       p.id.toLowerCase().includes(patientSearchStr.toLowerCase()))
  );

  const handleStartScreening = async () => {
    if (!screeningWizard.imageFile?.actualFile) {
      setMlError('Please upload a retinal fundus image first.');
      return;
    }

    // P0: preserve the explicitly selected patient (or null for walk-in).
    setWizardPatient(selectedPatient);
    setWizardEye(selectedEye);

    await runAnalysis();
    // Note: runAnalysis sets wizard active result + quality-passed on success.
  };

  // Dynamic metrics computed from real database state (no hardcoding)
  const totalPatientsCount = patients.length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayScreeningsCount = screenings.filter(
    (s) => (s.date && s.date.includes(todayStr)) || (s.createdAt && s.createdAt.includes(todayStr))
  ).length || screenings.length;
  const pendingReviewsCount = referrals.filter(
    (r) => !r.disease || r.disease === 'dr' || r.urgency === 'Urgent'
  ).length;
  const completedScreeningsCount = screenings.filter(
    (s) => s.status === 'Completed' || s.drSeverity === 'No DR'
  ).length || screenings.length;

  const handleSelectPatientForScreening = (p: Patient) => {
    setSelectedPatient(p);
    setWizardPatient(p);
    const elem = document.getElementById('dr-upload-section');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Build the Single Page Layout replacing the wizard
  if (!mlResult && !mlLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-200">
        {/* Top Header Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <img
              src={drImg}
              alt="Diabetic Retinopathy Retina"
              className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                Diabetic Retinopathy Screening
              </h1>
              <p className="text-slate-500 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
                Automated lesion detection, severity grading, and comprehensive anatomical analysis for early DR intervention.
              </p>
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
                setWizardPatient(null);
                handleReset();
                const elem = document.getElementById('dr-upload-section');
                if (elem) elem.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0284C7] hover:bg-sky-700 text-white text-xs md:text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Screening</span>
            </button>
          </div>
        </div>

        <div id="dr-upload-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6 scroll-mt-6">
          {/* Patient Selection & Eye selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-teal-600" />
                1. Select Patient
              </h2>
              {selectedPatient && (
                <button
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
                      ID: <span className="text-teal-600 font-mono font-bold">{selectedPatient.id}</span>
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-teal-100 text-teal-800 text-xs font-bold rounded-md">Selected</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search registered patients..."
                  value={patientSearchStr}
                  onChange={(e) => setPatientSearchStr(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-teal-500"
                />

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedPatient(p);
                          setWizardPatient(p);
                        }}
                        className="p-3 bg-white hover:bg-[#F8F9FA] border border-slate-200 hover:border-teal-300 rounded-xl cursor-pointer transition-all flex justify-between items-center text-sm"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">{p.fullName}</p>
                          <p className="text-xs text-slate-500 font-mono">{p.id}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3.5 bg-slate-50 rounded-xl text-center text-sm text-slate-500">
                      No patients found. Screening will run as <span className="text-teal-600 font-bold">Walk-in Patient</span>.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Eye Selection */}
            <div className="pt-2 border-t border-slate-200">
              <label className="text-sm font-bold text-slate-700 block mb-2">
                2. Target Eye
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Right Eye', 'Left Eye'] as EyeSelection[]).map((eye) => (
                  <button
                    key={eye}
                    type="button"
                    onClick={() => setSelectedEye(eye)}
                    className={`py-2.5 px-3 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      selectedEye === eye
                        ? 'bg-teal-50 text-teal-800 border-teal-300 font-bold shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
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
                id="dr-file-upload"
              />

              {!previewUrl ? (
                <label
                  htmlFor="dr-file-upload"
                  className="border-2 border-dashed border-slate-300 hover:border-teal-400 bg-slate-50 hover:bg-teal-50/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group min-h-[360px]"
                >
                  <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
                    <Upload className="w-8 h-8" />
                  </div>
                  <p className="font-bold text-slate-800 text-base">
                    Click to browse or drop retinal fundus photograph here
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Standard 45°/50° macular or optic disc centered fundus photograph
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
                        onClick={handleReset}
                        className="px-4.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-base font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Change
                      </button>
                      <button
                        onClick={handleStartScreening}
                        className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white shadow-md text-base font-bold transition-all flex items-center justify-center gap-2 group cursor-pointer"
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
            {mlError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 mt-4">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{mlError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mlLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-6 shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 text-teal-600 border border-teal-200 animate-pulse">
            <Activity className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">Evaluating Retinal Clinical Indicators</h3>
            <p className="text-slate-500 text-xs mt-1">Executing lesion detection and anatomical validation</p>
          </div>
        </div>
      </div>
    );
  }


  // Wizard record for header/modals; fall back to the ML-derived record
  // held in local state so actions keep working even if wizard sync lags.
  const result = screeningWizard.activeResult;

  const handleOpenExplanation = () => {
    if (result) setActiveScreeningForModal(result);
    setIsExplanationModalOpen(true);
  };

  const handleOpenReferral = () => {
    if (result) setActiveScreeningForModal(result);
    setIsReferralModalOpen(true);
  };

  const handleOpenDetailedReport = () => {
    const targetReportId = result?.reportId || mlResult?.reportId;
    if (targetReportId) openReportDetail(targetReportId);
    else setActivePage('reports');
  };

  const handleFinishScreening = () => {
    resetWizard();
    setActivePage('dashboard');
  };

  // Pull real visualisations from ML result
  const trinay    = mlResult?.trinay;
  const xai       = mlResult?.xai;
  const severity  = mlResult?.severity;

  const confidenceValue = severity?.confidence ?? result?.confidence ?? 0;

  // Extract structured findings with medical explanations
  const structuredLesions = extractLesionItems(trinay?.lesions);

  // Generate dynamic patient-specific AI clinical summary from current screening findings
  const clinicalSummary = generateDrClinicalSummary({
    lesionData: trinay?.lesions,
    drSeverity: severity?.drSeverity || result?.drSeverity,
    drSeverityLevel: severity?.drSeverityLevel || result?.drSeverityLevel,
    confidence: confidenceValue,
    vesselDensity: trinay?.anatomy?.blood_vessels?.density ?? trinay?.anatomy?.measurements?.vessel_density_pct,
    vesselPixels: trinay?.anatomy?.blood_vessels?.pixels,
  });

  // P0: header reflects the CURRENT screening's patient only.
  const headerPatient = selectedPatient || screeningWizard.selectedPatient || result || null;
  const headerName = (headerPatient as any)?.fullName || (headerPatient as any)?.patientName || 'Walk-in Patient';
  const headerId = (headerPatient as any)?.id || (headerPatient as any)?.patientId || '—';
  const headerDate =
    result?.date ||
    result?.createdAt ||
    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{t.aiScreeningResult}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {headerName} ({headerId}) •{' '}
            {screeningWizard.selectedEye === 'Right Eye' ? t.rightEye : t.leftEye} •{' '}
            {headerDate}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.back}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenDetailedReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-sky-600 active:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t.viewReport}</span>
          </button>
        </div>
      </div>

      {/* 1. LARGE PRIMARY RETINAL AI VISUALIZATION PANEL */}
      <div ref={canvasSectionRef} className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                RETINAL AI VISUALIZATION
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Complete fundus field • Object-fit: contain • Optical axis & microvascular layers aligned
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-medium">
              {(['Original', 'Grad-CAM++', 'Lesions', 'Anatomy', 'Combined'] as XaiTab[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setActiveXaiTab(mode);
                    if (mode !== 'Lesions') setHighlightedLesion(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    activeXaiTab === mode
                      ? 'bg-[#0284C7] text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {mode}
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
          <FundusRetinaCanvas
            mode={activeXaiTab}
            opacity={heatmapOpacity}
            className="w-full h-full"
            imageOriginal={trinay?.visualizations.canonical}
            imageGradCam={xai?.combined}
            imageLesions={trinay?.visualizations.lesion}
            imageAnatomy={trinay?.visualizations.anatomy}
            imageCombined={trinay?.visualizations.combined}
            imageDebugAnatomy={trinay?.visualizations.debug_anatomy}
            highlightLesion={highlightedLesion}
            onInspectFullscreen={() => setIsFullscreenOpen(true)}
          />
        </div>

        {/* Controls and Reference Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-300">
          {(activeXaiTab === 'Grad-CAM++' || activeXaiTab === 'Combined') ? (
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="text-slate-400 text-xs font-medium shrink-0">{t.heatmapOpacity}:</span>
              <div className="flex items-center gap-2 flex-1 md:w-60">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={heatmapOpacity}
                  onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
                <span className="w-8 font-mono text-[11px] text-slate-400 text-right">{heatmapOpacity}%</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[11px] text-slate-400 overflow-x-auto w-full md:w-auto">
              <span className="font-semibold text-slate-300">Retinal Landmarks:</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Optic Disc Localized
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400" /> Macula & Fovea Centered
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Microvascular Architecture
              </span>
            </div>
          )}

          {/* Lesion legend color pills */}
          <div className="flex items-center gap-2 text-[10px] overflow-x-auto w-full md:w-auto justify-start md:justify-end">
            <span className="font-semibold text-slate-400 mr-1">Overlays:</span>
            <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/80 font-mono">MA (Red)</span>
            <span className="px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/80 font-mono">HE (Purple)</span>
            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 font-mono">EX (Yellow)</span>
            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-mono">SE (Green)</span>
          </div>
        </div>
      </div>

      {/* 2. CLINICAL BREAKDOWN & AI FINDINGS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): AI Clinical Summary + Detailed Finding Cards + Quantitative Measurements */}
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
              <span className="font-medium text-slate-700">Quantified Lesion Load:</span>
              <span className="font-mono font-bold text-slate-900">{clinicalSummary.totalLesionPixels.toLocaleString()} px</span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-slate-700">Validated Staging:</span>
              <span className="font-semibold text-slate-900">{clinicalSummary.classifierVerdict}</span>
            </div>
          </div>

          {/* AI-Detected Findings: Doctor-Friendly Cards */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0284C7]" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  AI-DETECTED RETINAL FINDINGS
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {structuredLesions.filter(l => l.detected).length} of 4 lesion types observed
              </span>
            </div>

            <div className="space-y-3">
              {structuredLesions.map((item) => {
                const isDet = item.detected && item.pixels > 0;
                return (
                  <div
                    key={item.code}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isDet
                        ? 'bg-slate-50/70 border-slate-200 shadow-2xs'
                        : 'bg-white border-slate-100 opacity-75'
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
                        {isDet ? (
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded border bg-white text-slate-800 border-slate-200 shadow-2xs">
                            {item.pixels.toLocaleString()} px
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400">
                            Not observed
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                            isDet
                              ? `${item.def.badgeBg} ${item.def.badgeBorder} ${item.def.badgeText}`
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                        >
                          {isDet ? 'DETECTED' : 'NOT OBSERVED'}
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
                        {item.def.clinicalInterpretation}
                      </p>

                      {isDet && (
                        <button
                          type="button"
                          onClick={() => handleViewOnImage(item.code)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-[#0284C7] hover:text-white bg-sky-50 hover:bg-[#0284C7] rounded-lg border border-sky-200 transition-colors shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View on Image</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real Quantitative Anatomical Measurements */}
          {trinay?.anatomy && (
            <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 text-sky-600" />
                <span>Quantitative Anatomical Localization</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Vessel Density</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {trinay.anatomy.blood_vessels?.density ?? trinay.anatomy.measurements?.vessel_density_pct ?? '—'}%
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {trinay.anatomy.blood_vessels?.pixels?.toLocaleString()} px
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Macular Density</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {trinay.anatomy.blood_vessels?.macular_density ?? trinay.anatomy.measurements?.macular_vessel_density_pct ?? '—'}%
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">ROI (11%)</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Fovea (X, Y)</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    ({Math.round(trinay.anatomy.fovea.x)}, {Math.round(trinay.anatomy.fovea.y)})
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    OD Dist: {trinay.anatomy.fovea.disc_distance ?? trinay.anatomy.measurements?.disc_fovea_distance_px ?? '—'} px
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Optic Disc Area</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {trinay.anatomy.optic_disc?.pixels?.toLocaleString()} px
                  </span>
                  <span className="text-[10px] text-emerald-700 block font-semibold mt-0.5">
                    {trinay.anatomy.optic_disc?.detected ? 'Localized ✓' : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Diagnostic Status, Guidance, Actions */}
        <div className="lg:col-span-5 space-y-4">
          {/* Classification Banner (from validated severity classifier) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3.5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">{t.drSeverity}</span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {severity?.drSeverity || result?.drSeverity || 'No DR'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {severity?.drSeverityLevel || result?.drSeverityLevel || 'No DR (Level 0)'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-semibold">{t.confidence}</span>
                <span className="text-2xl font-black text-sky-700">{confidenceValue}%</span>
              </div>
            </div>

            {(severity?.recommendation || result?.recommendation) && (
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                {severity?.recommendation || result?.recommendation}
              </p>
            )}

            <button
              type="button"
              onClick={handleOpenExplanation}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors border border-sky-200 cursor-pointer"
            >
              <Info className="w-4 h-4" />
              <span>{t.whyThisResult}</span>
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
              {severity?.drSeverity === 'No DR'
                ? 'Retinal microvasculature demonstrates normal caliber and uniform perfusion across the posterior pole. No microaneurysms, hemorrhages, or exudates observed. Continue routine annual preventive screening.'
                : `Retinal screening findings demonstrate features consistent with ${severity?.drSeverity || 'Diabetic Retinopathy'}. Capillary abnormalities present. Vitreo-retinal specialist consultation recommended for dilated biomicroscopy and optical coherence tomography (OCT).`}
            </p>

            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl space-y-1.5 text-[11px] text-amber-900">
              <span className="font-bold block flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                Clinical Precautions
              </span>
              <ul className="space-y-1 list-disc list-inside text-amber-800">
                <li>Correlate findings with clinical slit-lamp examination.</li>
                <li>Review patient glycemic and blood pressure records.</li>
                <li>Promptly refer for comprehensive specialist examination.</li>
              </ul>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
            <button
              type="button"
              onClick={handleOpenDetailedReport}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0284C7] hover:bg-sky-600 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>{t.viewReport}</span>
            </button>
            <button
              type="button"
              onClick={handleFinishScreening}
              className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors text-center cursor-pointer"
            >
              {t.returnToDashboard}
            </button>
          </div>
        </div>
      </div>

      {/* 3. FULLSCREEN INSPECTION MODAL */}
      {isFullscreenOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 backdrop-blur-md">
          {/* Fullscreen header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-white">
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                FULLSCREEN RETINAL INSPECTION — {screeningWizard.selectedEye === 'Right Eye' ? 'OD (Right Eye)' : 'OS (Left Eye)'}
              </h2>
              <p className="text-xs text-slate-400">
                {headerName} • ID: {headerId}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Mode switch */}
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                {(['Original', 'Grad-CAM++', 'Lesions', 'Anatomy', 'Combined'] as XaiTab[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveXaiTab(mode)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      activeXaiTab === mode ? 'bg-[#0284C7] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode}
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

          {/* Fullscreen Image Container with object-contain */}
          <div className="flex-1 w-full h-full flex items-center justify-center p-2 overflow-hidden">
            <FundusRetinaCanvas
              mode={activeXaiTab}
              opacity={heatmapOpacity}
              className="w-full h-full"
              imageOriginal={trinay?.visualizations.canonical}
              imageGradCam={xai?.combined}
              imageLesions={trinay?.visualizations.lesion}
              imageAnatomy={trinay?.visualizations.anatomy}
              imageCombined={trinay?.visualizations.combined}
              imageDebugAnatomy={trinay?.visualizations.debug_anatomy}
              highlightLesion={highlightedLesion}
            />
          </div>
        </div>
      )}
    </div>
  );
};
