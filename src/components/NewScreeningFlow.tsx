import React, { useState, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FundusRetinaCanvas } from './FundusRetinaCanvas';
import { EyeSelection, ScreeningRecord } from '../types';
import { XaiTab } from '../data/retinaImages';

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
    blood_vessels: { pixels: number; detected: boolean };
    optic_disc:    { pixels: number; detected: boolean };
    fovea:         { x: number; y: number };
    macula:        { detected: boolean };
    retinal_background: { detected: boolean };
  };
  lesions: Record<string, MLLesionInfo>;
  findings: string[];
  visualizations: {
    canonical: string;
    anatomy:   string;
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
}

// ============================================================
// ML API call
// ============================================================
async function callMLAnalyze(file: File): Promise<MLAnalysisResult> {
  const form = new FormData();
  form.append('image', file, file.name);

  const res = await fetch('/api/ml/analyze', { method: 'POST', body: form });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  return res.json() as Promise<MLAnalysisResult>;
}

// ============================================================
// Component
// ============================================================
export const NewScreeningFlow: React.FC = () => {
  const {
    patients,
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

  const [step, setStep] = useState<
    'select-patient' | 'image-source' | 'capture' | 'upload' | 'quality' | 'result'
  >(() => {
    if (!screeningWizard.selectedPatient) return 'select-patient';
    if (screeningWizard.activeResult)    return 'result';
    if (screeningWizard.imageSource === 'upload' && screeningWizard.imageFile)  return 'quality';
    if (screeningWizard.imageSource === 'capture' && screeningWizard.capturedImage) return 'quality';
    if (screeningWizard.imageSource)    return screeningWizard.imageSource;
    return 'image-source';
  });

  const [activeXaiTab, setActiveXaiTab]     = useState<XaiTab>('Original');
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(70);
  const [patientSearch, setPatientSearch]   = useState('');

  // ML state
  const [mlLoading, setMlLoading]         = useState(false);
  const [mlError, setMlError]             = useState<string | null>(null);
  const [mlResult, setMlResult]           = useState<MLAnalysisResult | null>(null);

  const imageFile = screeningWizard.imageFile;

  // Kick off ML analysis when we enter the quality step
  const runAnalysis = useCallback(async () => {
    if (!imageFile?.actualFile) {
      setMlError('No image file available for analysis. Please re-upload the image.');
      return;
    }
    setMlLoading(true);
    setMlError(null);
    setMlResult(null);
    try {
      const result = await callMLAnalyze(imageFile.actualFile);
      if (result.error) {
        setMlError(result.error);
      } else {
        setMlResult(result);
        setActiveCase(result);
      }
    } catch (err: any) {
      setMlError(err.message || 'ML server error. Make sure ml_server.py is running.');
    } finally {
      setMlLoading(false);
    }
  }, [imageFile, setActiveCase]);

  // Auto-run when reaching the quality step
  React.useEffect(() => {
    if (step === 'quality' && !mlResult && !mlLoading && !mlError) {
      runAnalysis();
    }
  }, [step, mlResult, mlLoading, mlError, runAnalysis]);

  // ============================================================
  // STEP 1: SELECT PATIENT
  // ============================================================
  if (step === 'select-patient' || !screeningWizard.selectedPatient) {
    const filtered = patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(patientSearch.toLowerCase()) ||
        p.phoneNumber.includes(patientSearch)
    );

    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.selectPatient}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t.selectPatientDesc}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddPatientModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addNewPatient}</span>
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {patients.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <div className="flex items-center justify-center w-16 h-16 mx-auto mb-3.5 rounded-full bg-slate-100 text-slate-400">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-800">{t.noPatientsYet}</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">{t.noPatientsDesc}</p>
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{t.addNewPatient}</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="p-4 bg-slate-50/50">
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder={t.searchPatientPlaceholder}
                  className="w-full max-w-md px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                />
              </div>
              {filtered.map((pt) => {
                const initials = pt.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => { setWizardPatient(pt); setStep('image-source'); }}
                    className="w-full flex items-center justify-between p-4 hover:bg-blue-50/40 text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200">
                        {initials}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600">{pt.fullName}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {pt.id} • {t.age} {pt.age} • {pt.gender} • {t.phone}: {pt.phoneNumber}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                      {t.selectPatient} →
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const patient = screeningWizard.selectedPatient;
  const initials = patient.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  // ============================================================
  // STEP 2: IMAGE SOURCE SELECTION
  // ============================================================
  if (step === 'image-source') {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.newScreening}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t.chooseImageSource}</p>
          </div>
          <button
            type="button"
            onClick={() => setStep('select-patient')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.backToPatients}</span>
          </button>
        </div>

        {/* Patient banner */}
        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 font-bold text-xs border border-blue-100">
              {initials}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{patient.fullName}</h3>
              <p className="text-xs text-slate-500">
                {patient.id} • {patient.age} {t.age} • {patient.gender} • {t.phone}: {patient.phoneNumber}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {t.selectPatient}
          </span>
        </div>

        {/* Eye selection */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">{t.selectEye}</label>
          <div className="grid grid-cols-2 gap-4">
            {(['Right Eye', 'Left Eye'] as EyeSelection[]).map((eye) => (
              <button
                key={eye}
                type="button"
                onClick={() => setWizardEye(eye)}
                className={`p-4 rounded-xl border text-center font-bold text-sm transition-all ${
                  screeningWizard.selectedEye === eye
                    ? 'border-blue-600 bg-blue-50/60 text-blue-700 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <Eye className="w-5 h-5 mx-auto mb-1.5 text-blue-600" />
                <span>{eye === 'Right Eye' ? t.rightEye : t.leftEye}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Source cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div
            onClick={() => { setWizardImageSource('capture'); setStep('capture'); }}
            className="p-6 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-4 group-hover:bg-[#1E60D5] group-hover:text-white transition-colors">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{t.captureWithCamera}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.captureDesc}</p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <span>{t.launchCamera}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div
            onClick={() => { setWizardImageSource('upload'); setStep('upload'); }}
            className="p-6 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-4 group-hover:bg-[#1E60D5] group-hover:text-white transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{t.uploadImage}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.uploadDesc}</p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <span>{t.chooseFile}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => setStep('select-patient')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.backToPatients}</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 3: CAPTURE
  // ============================================================
  if (step === 'capture') {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.captureWithCamera}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t.alignRetina}</p>
          </div>
          <button type="button" onClick={() => setStep('image-source')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" />
            <span>{t.back}</span>
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-5">
          <div className="relative aspect-4/3 w-full max-w-lg mx-auto bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-56 h-56 rounded-full border-2 border-dashed border-blue-400/50 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border border-blue-300/40 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                </div>
              </div>
            </div>
            <div className="text-center p-6 z-10">
              <Camera className="w-12 h-12 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-300">{t.alignRetina}</p>
              <p className="text-[11px] text-slate-500 mt-1">{t.retinaCentered}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => setStep('image-source')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4" />
              <span>{t.back}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setWizardCapturedImage('live_capture_ok');
                setWizardImageFile({
                  name: `capture_${screeningWizard.selectedEye.toLowerCase().replace(' ', '_')}.jpg`,
                  size: '3.1 MB',
                });
                setStep('quality');
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#1E60D5] hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span>{t.captureBtn}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 4: UPLOAD
  // ============================================================
  if (step === 'upload') {
    const handleFileSelect = (file: File) => {
      const previewUrl = URL.createObjectURL(file);
      const sizeFormatted =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(0)} KB`;

      setWizardImageFile({
        name: file.name,
        size: sizeFormatted,
        previewUrl,
        actualFile: file,   // ← REAL File object for ML upload
      });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    };

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.uploadImage}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t.uploadDesc}</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {screeningWizard.selectedEye === 'Right Eye' ? t.rightEye : t.leftEye}
          </span>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            className="hidden"
          />

          {!screeningWizard.imageFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-slate-50/60 rounded-xl p-10 text-center cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3.5 rounded-full bg-blue-50 text-blue-600">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">{t.dragDropImage}</p>
              <p className="text-xs text-slate-400 my-1.5">{t.none}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-2xs inline-block"
              >
                {t.chooseFile}
              </button>
              <p className="text-[11px] text-slate-400 mt-3">JPG, PNG</p>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Selected Image</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                    {t.chooseFile}
                  </button>
                  <span className="text-slate-300">|</span>
                  <button type="button" onClick={() => setWizardImageFile(null)} className="text-xs font-semibold text-red-600 hover:text-red-800">
                    {t.delete}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-black shrink-0 border border-slate-300">
                  {screeningWizard.imageFile.previewUrl ? (
                    <img src={screeningWizard.imageFile.previewUrl} alt="Selected fundus" className="w-full h-full object-cover" />
                  ) : (
                    <FundusRetinaCanvas mode="Original" className="w-full h-full" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900 truncate max-w-sm">{screeningWizard.imageFile.name}</p>
                  <p className="text-xs text-slate-500">{screeningWizard.imageFile.size}</p>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Ready to analyse</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <button type="button" onClick={() => setStep('image-source')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4" />
              <span>{t.back}</span>
            </button>
            <button
              type="button"
              disabled={!screeningWizard.imageFile}
              onClick={() => { setMlResult(null); setMlError(null); setStep('quality'); }}
              className={`inline-flex items-center gap-2 px-6 py-2.5 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors ${
                screeningWizard.imageFile ? 'bg-[#1E60D5] hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              <span>Analyse Image →</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 5: QUALITY ASSESSMENT — calls real ML pipeline
  // ============================================================
  if (step === 'quality') {
    const quality = mlResult?.quality;

    const isGood  = quality?.quality === 'Good';
    const isBad   = quality && !isGood;

    // Build a plain-language explanation dynamically from real pipeline data
    const buildExplanation = (sev: MLSeverityResult, trinayResult: MLTrinayResult): string => {
      const dr = sev.drSeverity;
      const level = sev.drSeverityLevel;
      const detectedLesions = Object.entries(trinayResult.lesions)
        .filter(([, info]) => info.detected)
        .map(([name]) => name.toLowerCase());

      const anatomy = trinayResult.anatomy;
      const foveaSpared = anatomy.macula?.detected !== false;

      let intro = '';
      if (dr === 'No DR') {
        intro = `The screening algorithm found no signs of diabetic retinopathy (${level}). The retinal vasculature, optic disc, and macular zone appear within normal limits for AI-assisted primary screening.`;
      } else if (dr === 'Mild') {
        intro = `The screening algorithm detected early signs consistent with Mild Non-Proliferative Diabetic Retinopathy (${level}).`;
      } else if (dr === 'Moderate') {
        intro = `The screening algorithm detected visual evidence consistent with Moderate Non-Proliferative Diabetic Retinopathy (${level}).`;
      } else if (dr === 'Severe') {
        intro = `The screening algorithm detected significant changes consistent with Severe Non-Proliferative Diabetic Retinopathy (${level}). Timely specialist evaluation is strongly recommended.`;
      } else {
        intro = `The screening algorithm detected changes consistent with Proliferative Diabetic Retinopathy (${level}). Urgent ophthalmology referral is advised.`;
      }

      let lesionSentence = '';
      if (detectedLesions.length > 0) {
        const formatted = detectedLesions.slice(0, -1).join(', ') + (detectedLesions.length > 1 ? ', and ' : '') + detectedLesions[detectedLesions.length - 1];
        lesionSentence = ` The AI identified the following lesion types: ${formatted}.`;
      }

      let anatomySentence = '';
      const detected: string[] = [];
      if (anatomy.blood_vessels?.detected) detected.push('retinal blood vessels');
      if (anatomy.optic_disc?.detected) detected.push('optic disc');
      if (detected.length > 0) {
        anatomySentence = ` Anatomical landmarks detected include the ${detected.join(' and ')}.`;
      }

      let foveaSentence = foveaSpared
        ? ' The central foveal zone appears to be identified by the model.'
        : '';

      let followUp = dr === 'No DR'
        ? ' Annual monitoring is recommended as per standard diabetic eye care guidelines.'
        : ' Timely specialist ophthalmology evaluation is recommended to prevent progression.';

      return intro + lesionSentence + anatomySentence + foveaSentence + followUp;
    };

    const handleContinueToResult = () => {
      if (!mlResult?.severity || !mlResult?.trinay) return;

      const severity  = mlResult.severity;
      const findings  = mlResult.trinay.findings || [];
      const trinay    = mlResult.trinay;
      const xai       = mlResult.xai;

      // Map DR severity to ScreeningRecord type
      const drSeverityMap: Record<string, any> = {
        'No DR':            'No DR',
        'Mild':             'Mild',
        'Moderate':         'Moderate',
        'Severe':           'Severe',
        'Proliferative DR': 'PDR',
      };

      // Build lesion data map from trinay results
      const lesionData: Record<string, { detected: boolean; regions?: number; pixels?: number }> = {};
      if (trinay.lesions) {
        for (const [name, info] of Object.entries(trinay.lesions) as [string, MLLesionInfo][]) {
          lesionData[name] = {
            detected: (info as MLLesionInfo).detected,
            regions: (info as MLLesionInfo).regions,
            pixels: (info as MLLesionInfo).pixels,
          };
        }
      }

      // Generate plain-language explanation from real data
      const explanation = buildExplanation(severity, trinay);

      const newScreeningRecord = createScreening(
        {
          patientId:      patient.id,
          patientName:    patient.fullName,
          patientAge:     patient.age,
          patientGender:  patient.gender,
          patientPhone:   patient.phoneNumber,
          eye:            screeningWizard.selectedEye,
          imageQuality:   'Good',
          imageFileName:  mlResult.imageInfo.filename,
          imageFileSize:  mlResult.imageInfo.fileSize,
          imageUrl:       imageFile?.previewUrl,
          drSeverity:     drSeverityMap[severity.drSeverity] || 'No DR',
          drSeverityLevel: severity.drSeverityLevel,
          confidence:     Math.round(severity.confidence),
          findings,
          recommendation: severity.recommendation,
          status:         'Review',
        },
        {
          // Canonical / original fundus
          imageOriginal: trinay.visualizations.canonical,
          // XAI heatmap (prefer combined XAI, fallback to trinay combined overlay)
          imageGradCam:  xai?.combined || trinay.visualizations.combined,
          // Lesion overlay
          imageLesions:  trinay.visualizations.lesion,
          // Anatomy overlay
          imageAnatomy:  trinay.visualizations.anatomy,
          // Combined anatomy+lesion overlay
          imageCombined: trinay.visualizations.combined,
          // Image metadata
          imageResolution: mlResult.imageInfo.resolution,
          // Anatomy detection results & measurements
          anatomyData: trinay.anatomy,
          // Lesion detection results
          lesionData,
          // Auto-generated explanation
          plainLanguageExplanation: explanation,
        }
      );

      setWizardActiveResult(newScreeningRecord);
      setWizardQualityPassed(true);
      setStep('result');
    };

    const featureRows = quality?.features
      ? [
          { label: 'Sharpness',    value: quality.features.sharpness.toFixed(1) },
          { label: 'Brightness',   value: quality.features.brightness.toFixed(1) },
          { label: 'Illumination', value: quality.features.illumination.toFixed(1) },
          { label: 'Contrast',     value: quality.features.contrast.toFixed(1) },
          { label: 'Noise',        value: quality.features.noise.toFixed(2) },
          { label: 'FOV',          value: (quality.features.fov * 100).toFixed(1) + '%' },
        ]
      : [];

    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.imageQualityAssessment}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t.checkingImage}</p>
          </div>
          <button type="button" onClick={() => setStep(screeningWizard.imageSource || 'upload')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" />
            <span>{t.back}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs items-start">
          {/* Image preview */}
          <div className="aspect-square rounded-xl overflow-hidden bg-black border border-slate-300">
            {imageFile?.previewUrl ? (
              <img src={imageFile.previewUrl} alt="Uploaded scan" className="w-full h-full object-cover" />
            ) : (
              <FundusRetinaCanvas mode="Original" className="w-full h-full" />
            )}
          </div>

          {/* Quality results panel */}
          <div className="space-y-4">
            {/* Loading state */}
            {mlLoading && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm font-semibold text-slate-700">Running quality analysis…</p>
                <p className="text-xs text-slate-400">This may take a few seconds</p>
              </div>
            )}

            {/* Error state */}
            {mlError && !mlLoading && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-900">ML Server Error</p>
                    <p className="text-[11px] text-red-700 mt-0.5 break-words">{mlError}</p>
                    <p className="text-[11px] text-red-500 mt-1">
                      Make sure <code className="bg-red-100 px-1 rounded">ml_server.py</code> is running:<br />
                      <code className="bg-red-100 px-1 rounded">.venv/bin/python ml_server.py</code>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={runAnalysis}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            )}

            {/* Real quality results */}
            {mlResult && !mlLoading && (
              <>
                {/* Image info */}
                {mlResult.imageInfo && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                    <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Image Info</p>
                    <p className="text-slate-600"><span className="font-medium">File:</span> {mlResult.imageInfo.filename}</p>
                    <p className="text-slate-600"><span className="font-medium">Size:</span> {mlResult.imageInfo.fileSize}</p>
                    <p className="text-slate-600"><span className="font-medium">Resolution:</span> {mlResult.imageInfo.resolution}</p>
                  </div>
                )}

                {/* Feature values */}
                {featureRows.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Quality Features</p>
                    {featureRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-100 text-xs">
                        <span className="font-medium text-slate-600">{row.label}</span>
                        <span className="font-mono text-slate-800">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quality verdict banner */}
                {isGood ? (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-emerald-900">
                        Quality: <span className="text-emerald-700">Good</span>
                        {quality?.confidence?.Good !== undefined && (
                          <span className="ml-2 font-normal text-emerald-600">
                            ({(quality.confidence.Good * 100).toFixed(0)}% confidence)
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Image quality is sufficient. Proceeding to full AI analysis.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-900">
                        Quality: <span className="text-red-700">{quality?.quality || 'Ungradable'}</span>
                      </p>
                      <p className="text-[11px] text-red-700 mt-0.5">
                        Image quality is insufficient. Please retake or upload a clearer retinal image.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setMlResult(null); setMlError(null); setWizardImageFile(null); setStep('upload'); }}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Upload a different image
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Action buttons */}
            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(screeningWizard.imageSource || 'upload')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t.back}</span>
              </button>

              {isGood && mlResult?.severity && (
                <button
                  type="button"
                  onClick={handleContinueToResult}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E60D5] hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
                >
                  <span>View Full Results →</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 6: SCREENING RESULT & XAI VIEWER
  // ============================================================
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
    if (result?.reportId) openReportDetail(result.reportId);
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

  const getXaiImage = (tab: XaiTab): string | undefined => {
    if (!trinay && !xai) return undefined;
    switch (tab) {
      case 'Original':   return trinay?.visualizations.canonical;
      case 'Grad-CAM++': return xai?.combined         || trinay?.visualizations.combined;
      case 'Lesions':    return trinay?.visualizations.lesion;
      case 'Anatomy':    return trinay?.visualizations.anatomy;
      case 'Combined':   return trinay?.visualizations.combined;
      default:           return trinay?.visualizations.canonical;
    }
  };

  const lesionItems: [string, MLLesionInfo][] = trinay?.lesions
    ? (Object.entries(trinay.lesions) as [string, MLLesionInfo][]).filter(([, info]) => info.detected)
    : result?.findings?.map((f) => [f, { detected: true }] as [string, MLLesionInfo]) || [];

  const confidenceValue = severity?.confidence ?? result?.confidence ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.aiScreeningResult}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {patient.fullName} ({patient.id}) •{' '}
            {screeningWizard.selectedEye === 'Right Eye' ? t.rightEye : t.leftEye} •{' '}
            {result?.date || t.date}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setStep('quality')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.back}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenReferral}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
          >
            <Send className="w-3.5 h-3.5 text-amber-500" />
            <span>{t.referrals}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenDetailedReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-xs shadow-blue-500/20 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t.viewReport}</span>
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: XAI Viewer */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t.aiDetectedFindings}</span>
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{activeXaiTab}</span>
          </div>

          {/* Mode tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-lg overflow-x-auto text-xs font-medium">
            {(['Original', 'Grad-CAM++', 'Lesions', 'Anatomy', 'Combined'] as XaiTab[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setActiveXaiTab(mode)}
                className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                  activeXaiTab === mode
                    ? 'bg-white text-blue-600 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Canvas — real ML images */}
          <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black border border-slate-200 shadow-inner">
            <FundusRetinaCanvas
              mode={activeXaiTab}
              opacity={heatmapOpacity}
              className="w-full h-full"
              imageOriginal={trinay?.visualizations.canonical}
              imageGradCam={xai?.combined}
              imageLesions={trinay?.visualizations.lesion}
              imageAnatomy={trinay?.visualizations.anatomy}
              imageCombined={trinay?.visualizations.combined}
            />
          </div>

          {/* Opacity slider for heatmap modes */}
          {(activeXaiTab === 'Grad-CAM++' || activeXaiTab === 'Combined') && (
            <div className="flex items-center justify-between gap-4 px-2 py-1 text-xs">
              <span className="text-slate-500 font-medium">{t.heatmapOpacity}:</span>
              <div className="flex items-center gap-2 flex-1 max-w-xs">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={heatmapOpacity}
                  onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="w-8 font-mono text-[11px] text-slate-600 text-right">{heatmapOpacity}%</span>
              </div>
            </div>
          )}

          {/* Clinical Lesion Legend (visible on Lesions & Combined modes) */}
          {(activeXaiTab === 'Lesions' || activeXaiTab === 'Combined') && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                <span>What do the markings mean?</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-start gap-1.5 p-1.5 bg-white rounded border border-slate-200/70 shadow-2xs">
                  <span className="w-3 h-3 rounded-xs bg-[#DC2626] shrink-0 mt-0.5 border border-red-700" />
                  <div>
                    <strong className="text-slate-900 block font-semibold">MA — Microaneurysm</strong>
                    <span className="text-slate-500 text-[10px]">Capillary outpouchings</span>
                  </div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 bg-white rounded border border-slate-200/70 shadow-2xs">
                  <span className="w-3 h-3 rounded-xs bg-[#7C3AED] shrink-0 mt-0.5 border border-purple-800" />
                  <div>
                    <strong className="text-slate-900 block font-semibold">HE — Haemorrhage</strong>
                    <span className="text-slate-500 text-[10px]">Retinal blood leakage</span>
                  </div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 bg-white rounded border border-slate-200/70 shadow-2xs">
                  <span className="w-3 h-3 rounded-xs bg-[#EAB308] shrink-0 mt-0.5 border border-amber-600" />
                  <div>
                    <strong className="text-slate-900 block font-semibold">EX — Hard Exudate</strong>
                    <span className="text-slate-500 text-[10px]">Lipid-protein deposits</span>
                  </div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 bg-white rounded border border-slate-200/70 shadow-2xs">
                  <span className="w-3 h-3 rounded-xs bg-[#10B981] shrink-0 mt-0.5 border border-emerald-600" />
                  <div>
                    <strong className="text-slate-900 block font-semibold">SE — Soft Exudate</strong>
                    <span className="text-slate-500 text-[10px]">Cotton-wool ischemia</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Real Quantitative Measurements Cards */}
          {trinay?.anatomy && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                <span>Real Model Measurements</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Vessel Density</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">
                    {trinay.anatomy.blood_vessels?.density ?? trinay.anatomy.measurements?.vessel_density_pct ?? '—'}%
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {trinay.anatomy.blood_vessels?.pixels?.toLocaleString()} px
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Macular Density</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">
                    {trinay.anatomy.blood_vessels?.macular_density ?? trinay.anatomy.measurements?.macular_vessel_density_pct ?? '—'}%
                  </span>
                  <span className="text-[10px] text-slate-500 block">ROI (11%)</span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Fovea (X, Y)</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">
                    ({Math.round(trinay.anatomy.fovea.x)}, {Math.round(trinay.anatomy.fovea.y)})
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    OD Dist: {trinay.anatomy.fovea.disc_distance ?? trinay.anatomy.measurements?.disc_fovea_distance_px ?? '—'} px
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Optic Disc Area</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">
                    {trinay.anatomy.optic_disc?.pixels?.toLocaleString()} px
                  </span>
                  <span className="text-[10px] text-emerald-700 block font-medium">
                    {trinay.anatomy.optic_disc?.detected ? 'Localized ✓' : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* XAI error notice */}
          {mlResult?.xaiError && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-700">XAI partially failed: {mlResult.xaiError}</p>
            </div>
          )}
        </div>

        {/* Right: Diagnosis & Findings */}
        <div className="lg:col-span-5 space-y-4">
          {/* Classification banner */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t.drSeverity}</span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {severity?.drSeverity || result?.drSeverity || 'No DR'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {severity?.drSeverityLevel || result?.drSeverityLevel}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-semibold">{t.confidence}</span>
                <span className="text-2xl font-black text-blue-700">{confidenceValue}%</span>
              </div>
            </div>

            {(severity?.recommendation || result?.recommendation) && (
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                {severity?.recommendation || result?.recommendation}
              </p>
            )}

            <button
              type="button"
              onClick={handleOpenExplanation}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
            >
              <Info className="w-4 h-4" />
              <span>{t.whyThisResult}</span>
            </button>
          </div>

          {/* Detected lesions */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">{t.aiDetectedFindings}</span>

            {/* Image info from ML */}
            {mlResult?.imageInfo && (
              <div className="pb-2 border-b border-slate-100 text-xs space-y-0.5">
                <p className="text-slate-500"><span className="font-medium text-slate-700">Resolution:</span> {mlResult.imageInfo.resolution}</p>
                <p className="text-slate-500"><span className="font-medium text-slate-700">File:</span> {mlResult.imageInfo.filename}</p>
              </div>
            )}

            {/* Anatomy results */}
            {trinay?.anatomy && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Anatomy</p>
                {[
                  { label: 'Blood Vessels', detected: trinay.anatomy.blood_vessels.detected, extra: `${trinay.anatomy.blood_vessels.pixels.toLocaleString()} px` },
                  { label: 'Optic Disc',    detected: trinay.anatomy.optic_disc.detected,    extra: `${trinay.anatomy.optic_disc.pixels.toLocaleString()} px` },
                  { label: 'Fovea',         detected: true, extra: `(${Math.round(trinay.anatomy.fovea.x)}, ${Math.round(trinay.anatomy.fovea.y)})` },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1 border-b border-slate-100 text-xs">
                    <span className="text-slate-600">{row.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">{row.extra}</span>
                      <span className={`font-semibold px-2 py-0.5 rounded border text-[11px] ${
                        row.detected ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'
                      }`}>
                        {row.detected ? t.yes : 'Not detected'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lesion findings */}
            {lesionItems.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Lesions</p>
                <ul className="space-y-1.5 text-xs">
                  {lesionItems.map(([name]) => (
                    <li key={name} className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-600">{name}</span>
                      <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {t.yes}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-2">No lesions detected</p>
            )}
          </div>

          {/* Quick actions */}
          <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
            <button
              type="button"
              onClick={handleOpenDetailedReport}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1E60D5] hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>{t.viewReport}</span>
            </button>
            <button
              type="button"
              onClick={handleFinishScreening}
              className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors text-center"
            >
              {t.returnToDashboard}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
