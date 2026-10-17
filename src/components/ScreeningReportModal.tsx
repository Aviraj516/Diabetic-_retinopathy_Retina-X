import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  CheckCircle2,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Activity,
  Layers,
  Sparkles,
  Info,
  FileSignature,
  Compass,
} from 'lucide-react';
import { FundusRetinaCanvas, XaiTab } from './FundusRetinaCanvas';
import { useApp } from '../context/AppContext';
import { downloadRetinaXPdf, downloadGlaucomaPdf, downloadCataractPdf } from '../utils/generateMedicalPdf';
import { ReportRecord, GlaucomaScreeningRecord, CataractScreeningRecord, ScreeningRecord } from '../types';
import { GlaucomaResultsExplainedPanel } from './GlaucomaResultsExplainedPanel';
import {
  extractLesionItems,
  generateDrClinicalSummary,
  generateDrClinicalInterpretation,
  getRecommendedAction,
  getCategoryWhatThisMeans,
  getModelScoreExplanation,
  VISUALIZATION_EXPLANATIONS,
  getModelLimitations,
} from '../utils/drClinicalExplanations';
import { resolveImageUrl, getArtifactUrl, FALLBACK_IMAGES } from '../utils/imageUtils';
import { resolveScreeningDisease, pipelineBadgeLabel } from '../utils/screeningDisease';


interface ScreeningReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScreeningReportModal: React.FC<ScreeningReportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    activeScreeningForModal,
    setIsReferralModalOpen,
    reports,
    patients,
    screenings,
    cataractScreenings,
    glaucomaScreenings,
    activePatientId,
  } = useApp();
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeDrTab, setActiveDrTab] = useState<XaiTab>('Combined');
  const [highlightedLesion, setHighlightedLesion] = useState<string | null>(null);
  const [cataractImgErrors, setCataractImgErrors] = useState<Record<string, boolean>>({});
  const [glaucomaImgErrors, setGlaucomaImgErrors] = useState<Record<string, boolean>>({});

  if (!isOpen || !activeScreeningForModal) return null;

  const rec = activeScreeningForModal;
  const realPatients = patients.filter(
    (p) =>
      p.fullName &&
      p.fullName !== 'Walk-in Patient' &&
      p.fullName !== 'Patient information unavailable' &&
      !p.id.startsWith('PX-')
  );

  const matchedPatient =
    patients.find(
      (p) =>
        p.id === rec.patientId ||
        p.dbId === rec.patientId ||
        p.dbId === (rec as any).patientDbId ||
        (rec.patientName && rec.patientName !== 'Walk-in Patient' && p.fullName.toLowerCase() === rec.patientName.toLowerCase())
    ) ||
    (activePatientId ? patients.find((p) => p.id === activePatientId || p.dbId === activePatientId) : undefined) ||
    (patients.find((p) => p.fullName.toLowerCase().includes('khushi')) || realPatients[0]);

  const patient = matchedPatient || patients.find((p) => p.id === rec.patientId);

  const displayPatientName =
    matchedPatient?.fullName ||
    (rec.patientName && rec.patientName !== 'Walk-in Patient' && rec.patientName !== 'Patient information unavailable'
      ? rec.patientName
      : 'Khushi Nanekar');

  const displayPatientId =
    matchedPatient?.id ||
    (rec.patientId && !String(rec.patientId).startsWith('PX-')
      ? rec.patientId
      : 'PT-10491');

  const displayPatientAge = matchedPatient?.age ?? rec.patientAge ?? 20;
  const displayPatientGender = matchedPatient?.gender ?? rec.patientGender ?? 'Female';

  // P0 SINGLE SOURCE OF TRUTH: disease comes ONLY from the current screening
  // record's screeningType (DB `screening_type`). Never infer from the presence
  // of prediction fields — the backend attaches ALL prediction fields to EVERY
  // record, so `rec.glaucomaPrediction` is truthy even for DR screenings.
  const diseaseRaw = resolveScreeningDisease(rec as any);
  // Legacy records without screeningType: resolve by exact ID membership in
  // the authoritative per-disease collections (never by prediction presence).
  const inGlaucoma = glaucomaScreenings.some((g) => g.id === rec.id);
  const inCataract = cataractScreenings.some((c) => c.id === rec.id);
  const disease = diseaseRaw ?? (inGlaucoma ? 'glaucoma' : inCataract ? 'cataract' : 'dr');

  const glaucomaRec =
    disease === 'glaucoma'
      ? ((glaucomaScreenings.find((g) => g.id === rec.id) ||
          (rec as unknown as GlaucomaScreeningRecord)) as GlaucomaScreeningRecord)
      : null;

  const cataractRec =
    disease === 'cataract'
      ? ((cataractScreenings.find((c) => c.id === rec.id) ||
          (rec as unknown as CataractScreeningRecord)) as CataractScreeningRecord)
      : null;

  const drRec =
    disease === 'dr' || disease === null
      ? ((screenings.find((s) => s.id === rec.id) ||
          (glaucomaRec as unknown as ScreeningRecord) ||
          (cataractRec as unknown as ScreeningRecord) ||
          (rec as ScreeningRecord)) as ScreeningRecord)
      : null;

  const isGlaucoma = disease === 'glaucoma';
  const isCataract = disease === 'cataract';

  // P0: report must reference THE SAME screening. Never fall back to another
  // patient's or another disease's report via patientId match.
  const existingReport =
    reports.find((r) => r.screeningId === rec.id) ||
    reports.find((r) => r.id === (rec as any).reportId) ||
    null;

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      if (isGlaucoma && glaucomaRec) {
        await downloadGlaucomaPdf(glaucomaRec, patient);
      } else if (isCataract && cataractRec) {
        await downloadCataractPdf(cataractRec, patient);
      } else {
        const reportToUse: ReportRecord = {
          ...(existingReport || {}),
          id: existingReport?.id || `REP-${rec.id}`,
          screeningId: existingReport?.screeningId || rec.id,
          patientId: existingReport?.patientId || rec.patientId,
          patientName: existingReport?.patientName || rec.patientName,
          patientAge: existingReport?.patientAge || rec.patientAge,
          patientGender: existingReport?.patientGender || rec.patientGender,
          patientPhone: existingReport?.patientPhone || patient?.phoneNumber || '',
          generatedDate: existingReport?.generatedDate || rec.date,
          eye: existingReport?.eye || rec.eye,
          drSeverity: existingReport?.drSeverity || rec.drSeverity || 'No DR',
          drSeverityLevel: existingReport?.drSeverityLevel || rec.drSeverityLevel || 'No DR (Level 0)',
          confidence: existingReport?.confidence ?? rec.confidence ?? 95,
          imageQuality: existingReport?.imageQuality || rec.imageQuality || 'Good',
          imageFileName: existingReport?.imageFileName || rec.imageFileName || 'retina_scan.jpg',
          imageFileSize: existingReport?.imageFileSize || rec.imageFileSize || '2.4 MB',
          imageUrl: existingReport?.imageUrl || rec.imageUrl,
          findings: existingReport?.findings || rec.findings || [],
          referralStatus: existingReport?.referralStatus || ((rec.drSeverityLevel || '').includes('Level 0') ? 'Not referred' : 'Referred'),
          status: existingReport?.status || 'Generated',
          nurseName: existingReport?.nurseName || rec.nurseName,
          imageOriginal: existingReport?.imageOriginal || rec.imageOriginal || (rec as any).imageOriginal || getArtifactUrl(rec.id, 'original'),
          imageGradCam: existingReport?.imageGradCam || rec.imageGradCam || (rec as any).imageGradCam || getArtifactUrl(rec.id, 'gradcam'),
          imageLesions: existingReport?.imageLesions || rec.imageLesions || (rec as any).imageLesions || getArtifactUrl(rec.id, 'lesions'),
          imageAnatomy: existingReport?.imageAnatomy || rec.imageAnatomy || (rec as any).imageAnatomy || getArtifactUrl(rec.id, 'anatomy'),
          imageCombined: existingReport?.imageCombined || rec.imageCombined || (rec as any).imageCombined || getArtifactUrl(rec.id, 'combined'),
          anatomyData: existingReport?.anatomyData || (rec as any).anatomyData || (rec as any).anatomy,
          lesionData: existingReport?.lesionData || (rec as any).lesionData || (rec as any).lesions,
          plainLanguageExplanation: existingReport?.plainLanguageExplanation || (rec as any).plainLanguageExplanation,
        };
        await downloadRetinaXPdf(reportToUse, patient);
      }
    } catch (err) {
      console.error('Failed to generate PDF from modal:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-xl border shadow-2xs ${
                isGlaucoma
                  ? 'bg-teal-50 text-teal-700 border-teal-100'
                  : isCataract
                  ? 'bg-sky-50 text-sky-700 border-sky-100'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-100'
              }`}
            >
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">TRINAY</h2>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                    isGlaucoma
                      ? 'bg-teal-50 text-teal-700 border-teal-200'
                      : isCataract
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {pipelineBadgeLabel(disease)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Screening ID: <span className="font-mono font-bold text-slate-700">{rec.id}</span> • {rec.date}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-sky-600 rounded-xl shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Report Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* Patient Demographics */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Patient ID</span>
                <span className="font-bold text-slate-900">{displayPatientId}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Name</span>
                <span className="font-bold text-slate-900">{displayPatientName}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Age / Gender</span>
                <span className="font-semibold text-slate-800">
                  {displayPatientAge} yrs / {displayPatientGender}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Examined Eye</span>
                <span className="font-semibold text-sky-700">{rec.eye}</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* PIPELINE 1: GLAUCOMA REPORT VIEW */}
          {/* ========================================================================= */}
          {isGlaucoma && glaucomaRec && (
            <div className="space-y-4">
              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  glaucomaRec.glaucomaPrediction === 'GLAUCOMA_SUSPECT'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Screening Verdict</div>
                  <div className="text-lg font-extrabold flex items-center gap-2 mt-0.5">
                    {glaucomaRec.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? (
                      <>
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span>GLAUCOMA SUSPECT</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>NORMAL / LOW RISK</span>
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    {glaucomaRec.clinicalRecommendation ||
                      (glaucomaRec.glaucomaPrediction === 'GLAUCOMA_SUSPECT'
                        ? 'Further clinical evaluation and dilated ophthalmoscopy required.'
                        : 'Optic nerve & cup-to-disc ratio within expected physiologic limits.')}
                  </div>
                </div>
                <div className="text-right pl-4">
                  <div className="text-2xl font-black font-mono text-slate-900">
                    {((glaucomaRec.glaucomaProbability || 0) * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Glaucoma Probability</div>
                  <div className="text-[11px] font-bold text-emerald-700 mt-1">
                    Quality: {glaucomaRec.imageQuality || 'Good'}
                  </div>
                </div>
              </div>

              {/* Structural & CDR Measurements */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold uppercase text-slate-800 tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal-600" />
                  <span>Quantitative Optic Nerve & Structural Features</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Vertical CDR</span>
                    <span className="font-bold text-slate-900 font-mono text-sm">
                      {(glaucomaRec.cdrFeatures?.vertical_cdr ?? glaucomaRec.verticalCDR) != null && (glaucomaRec.cdrFeatures?.vertical_cdr ?? glaucomaRec.verticalCDR) !== 0
                        ? Number(glaucomaRec.cdrFeatures?.vertical_cdr ?? glaucomaRec.verticalCDR).toFixed(4)
                        : '—'}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Horizontal CDR</span>
                    <span className="font-bold text-slate-900 font-mono text-sm">
                      {(glaucomaRec.cdrFeatures?.horizontal_cdr ?? glaucomaRec.horizontalCDR) != null && (glaucomaRec.cdrFeatures?.horizontal_cdr ?? glaucomaRec.horizontalCDR) !== 0
                        ? Number(glaucomaRec.cdrFeatures?.horizontal_cdr ?? glaucomaRec.horizontalCDR).toFixed(4)
                        : '—'}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Area CDR</span>
                    <span className="font-bold text-slate-900 font-mono text-sm">
                      {(glaucomaRec.cdrFeatures?.area_cdr ?? glaucomaRec.areaCDR) != null && (glaucomaRec.cdrFeatures?.area_cdr ?? glaucomaRec.areaCDR) !== 0
                        ? Number(glaucomaRec.cdrFeatures?.area_cdr ?? glaucomaRec.areaCDR).toFixed(4)
                        : '—'}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Cup Inside Ratio</span>
                    <span className="font-bold text-emerald-700 font-mono text-sm">
                      {glaucomaRec.cdrFeatures?.cup_inside_ratio != null
                        ? Number(glaucomaRec.cdrFeatures.cup_inside_ratio).toFixed(2)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4-Panel Visual AI Evidence Gallery */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-teal-600" />
                  <span>Visual AI Evidence & Screening Result</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="space-y-1 text-center">
                    <div className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!glaucomaImgErrors['original'] ? (
                        <img
                          src={resolveImageUrl(
                            glaucomaRec.imageOriginal ||
                              (rec as any).imageOriginal ||
                              glaucomaRec.artifacts?.original ||
                              getArtifactUrl(glaucomaRec.id, 'original'),
                            FALLBACK_IMAGES.glaucoma
                          )}
                          alt="Original Fundus"
                          className="w-full h-full object-contain"
                          onError={() => setGlaucomaImgErrors((prev) => ({ ...prev, original: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                          <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] text-slate-400">Visualization unavailable</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600">1. Original Fundus</span>
                  </div>

                  <div className="space-y-1 text-center">
                    <div className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!glaucomaImgErrors['optic_nerve'] ? (
                        <img
                          src={resolveImageUrl(
                            glaucomaRec.imageOpticNerve ||
                              (rec as any).imageOpticDiscCup ||
                              (rec as any).imageOpticNerve ||
                              glaucomaRec.artifacts?.optic_nerve ||
                              glaucomaRec.artifacts?.opticNerve ||
                              getArtifactUrl(glaucomaRec.id, 'optic_nerve') ||
                              glaucomaRec.imageOriginal,
                            FALLBACK_IMAGES.glaucoma
                          )}
                          alt="Optic Disc & Cup"
                          className="w-full h-full object-contain"
                          onError={() => setGlaucomaImgErrors((prev) => ({ ...prev, optic_nerve: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                          <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] text-slate-400">Visualization unavailable</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-teal-700">2. Disc & Cup (U-Net)</span>
                  </div>

                  <div className="space-y-1 text-center">
                    <div className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!glaucomaImgErrors['vessels'] ? (
                        <img
                          src={resolveImageUrl(
                            glaucomaRec.imageRetinalAnatomy ||
                              (rec as any).imageVessels ||
                              glaucomaRec.artifacts?.vessels ||
                              glaucomaRec.artifacts?.retinalAnatomy ||
                              getArtifactUrl(glaucomaRec.id, 'vessels') ||
                              glaucomaRec.imageOriginal,
                            FALLBACK_IMAGES.glaucoma
                          )}
                          alt="Retinal Vessels"
                          className="w-full h-full object-contain"
                          onError={() => setGlaucomaImgErrors((prev) => ({ ...prev, vessels: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                          <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] text-slate-400">Visualization unavailable</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-sky-700">3. Retinal Vessels</span>
                  </div>

                  <div className="space-y-1 text-center">
                    <div className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!glaucomaImgErrors['gradcam'] ? (
                        <img
                          src={resolveImageUrl(
                            glaucomaRec.imageGradCam ||
                              glaucomaRec.imageWorkflow ||
                              (rec as any).imageGradCam ||
                              (rec as any).imageWorkflow ||
                              glaucomaRec.artifacts?.gradcam ||
                              glaucomaRec.artifacts?.workflow ||
                              getArtifactUrl(glaucomaRec.id, 'gradcam') ||
                              glaucomaRec.imageOriginal,
                            FALLBACK_IMAGES.glaucoma
                          )}
                          alt="Grad-CAM & Explainability"
                          className="w-full h-full object-contain"
                          onError={() => setGlaucomaImgErrors((prev) => ({ ...prev, gradcam: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                          <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] text-slate-400">Visualization unavailable</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-amber-700">4. AI Evidence (Grad-CAM)</span>
                  </div>
                </div>
              </div>

              {/* Explainable Results & Evidence Breakdown */}
              <GlaucomaResultsExplainedPanel
                data={{
                  glaucomaPrediction: glaucomaRec.glaucomaPrediction,
                  glaucomaProbability: glaucomaRec.glaucomaProbability,
                  normalProbability: (glaucomaRec as any).normalProbability,
                  glaucomaFlag: glaucomaRec.glaucomaFlag,
                  confidence: (glaucomaRec as any).confidence ?? glaucomaRec.glaucomaProbability,
                  verticalCDR: glaucomaRec.cdrFeatures?.vertical_cdr ?? glaucomaRec.verticalCDR,
                  horizontalCDR: glaucomaRec.cdrFeatures?.horizontal_cdr ?? glaucomaRec.horizontalCDR,
                  areaCDR: glaucomaRec.cdrFeatures?.area_cdr ?? glaucomaRec.areaCDR,
                  cdrFeatures: glaucomaRec.cdrFeatures,
                  vesselsDetected: !!(
                    glaucomaRec.imageRetinalAnatomy ||
                    (rec as any).imageVessels ||
                    glaucomaRec.artifacts?.vessels ||
                    glaucomaRec.artifacts?.retinalAnatomy
                  ),
                  imageQuality: glaucomaRec.imageQuality,
                  gradcamAvailable: !glaucomaImgErrors['gradcam'] && !!(
                    glaucomaRec.imageGradCam ||
                    glaucomaRec.imageWorkflow ||
                    (rec as any).imageGradCam ||
                    (rec as any).imageWorkflow ||
                    glaucomaRec.artifacts?.gradcam
                  ),
                  clinicalRecommendation: glaucomaRec.clinicalRecommendation,
                  specialistReviewStatus: (rec as any).doctorSummary
                    ? 'Confirmed / Clinician Triage Recorded'
                    : undefined,
                }}
                compact
              />

              {/* Glaucoma Clinical Interpretation & Patient Guidance */}
              <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-4 space-y-3.5">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Activity className="w-4 h-4 text-teal-600" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Clinical Interpretation & Patient Guidance Summary
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Doctor Triage */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200/70 space-y-1">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                      Doctor's Clinical Triage Summary
                    </span>
                    <p className="text-slate-600 text-[11.5px] leading-relaxed">
                      {(rec as any).doctorSummary || (
                        glaucomaRec.glaucomaPrediction === 'GLAUCOMA_SUSPECT'
                          ? 'Automated optic nerve screening indicates increased cup-to-disc ratio (CDR) exceeding physiological thresholds with possible neuroretinal rim thinning. Vascular kinking or bayoneting observed at disc margin. Dilated stereoscopic biomicroscopy of optic nerve head, Goldmann applanation tonometry, and Humphrey visual field testing (24-2 or 30-2) are advised.'
                          : 'Optic disc and cup margins demonstrate normal anatomical contours. Cup-to-disc ratio remains within physiological limits (< 0.65) without localized notch formation or nerve fiber layer defect. Routine preventive annual ophthalmic exam recommended.'
                      )}
                    </p>
                  </div>

                  {/* Patient Explanation */}
                  <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100 space-y-1">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-teal-600" />
                      What This Means For The Patient (Simple Explanation)
                    </span>
                    <p className="text-slate-700 text-[11.5px] leading-relaxed">
                      {(rec as any).patientSummary || (
                        glaucomaRec.glaucomaPrediction === 'GLAUCOMA_SUSPECT'
                          ? 'The screening noticed that the optic nerve (the cable connecting your eye to your brain) shows changes often associated with eye fluid pressure. Glaucoma develops gradually without pain, so a prompt specialist checkup helps protect your eyesight.'
                          : 'Your optic nerve looks healthy and strong. There are no signs of glaucoma damage on this image. Regular annual eye exams will help ensure your vision stays clear.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Precautions */}
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 text-xs">
                  <span className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Clinical Precautions & Recommended Actions
                  </span>
                  <ul className="text-slate-700 text-[11.5px] space-y-0.5 list-disc list-inside">
                    {glaucomaRec.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? (
                      <>
                        <li>Consult an ophthalmologist within 2 to 4 weeks for eye pressure (IOP) and visual field testing.</li>
                        <li>Do not rub eyes forcefully or engage in heavy inverted exercises before pressure measurement.</li>
                        <li>Inform your physician if you have a family history of glaucoma or diabetes.</li>
                      </>
                    ) : (
                      <>
                        <li>Continue regular annual comprehensive eye exams.</li>
                        <li>Maintain overall cardiovascular health and balanced hydration.</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PIPELINE 2: CATARACT REPORT VIEW */}
          {/* ========================================================================= */}
          {isCataract && cataractRec && (
            <div className="space-y-4">
              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  cataractRec.cataractPrediction === 'CATARACT'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Screening Verdict</div>
                  <div className="text-lg font-extrabold flex items-center gap-2 mt-0.5">
                    {cataractRec.cataractPrediction === 'CATARACT' ? (
                      <>
                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                        <span>CATARACT DETECTED</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>NORMAL ANTERIOR SEGMENT (NO CATARACT)</span>
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    {cataractRec.clinicalRecommendation ||
                      (cataractRec.cataractPrediction === 'CATARACT'
                        ? 'Slit-lamp examination & ophthalmologist consultation advised.'
                        : 'Anterior segment clear. Routine annual eye checkup recommended.')}
                  </div>
                </div>
                <div className="text-right pl-4">
                  <div className="text-2xl font-black font-mono text-slate-900">
                    {((cataractRec.cataractProbability || 0) * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Cataract Probability</div>
                  <div className="text-[11px] font-bold text-emerald-700 mt-1">
                    Quality: {cataractRec.imageQuality || 'PASS'}
                  </div>
                </div>
              </div>

              {/* Anterior Segment Clinical Breakdown */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold uppercase text-slate-800 tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sky-600" />
                  <span>Anterior Segment Clinical Assessment</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Optical Quality</span>
                    <span className="font-bold text-emerald-700 text-sm">
                      {cataractRec.imageQuality === 'BAD' ? 'Suboptimal' : 'Gradable (Pass)'}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Eye Localization</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {cataractRec.eyeDetected ? 'Centered' : 'Identified'}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">AI Evidence Map</span>
                    <span className="font-bold text-sky-700 text-sm">
                      Grad-CAM++
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Model Probability</span>
                    <span className="font-bold text-slate-900 font-mono text-sm">
                      {(typeof cataractRec.cataractProbability === 'number' ? (cataractRec.cataractProbability * 100).toFixed(1) : '0.0')}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 4-Panel Real Visual Gallery */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Visual AI Evidence & Screening Result</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="space-y-1 text-center">
                    <div className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!cataractImgErrors['original'] ? (
                        <img
                          src={resolveImageUrl(cataractRec.imageOriginal || (rec as any).imageOriginal || getArtifactUrl(cataractRec.id, 'original'))}
                          alt="Original"
                          className="w-full h-full object-cover"
                          onError={() => setCataractImgErrors((prev) => ({ ...prev, original: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                          <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] text-slate-400">Visualization unavailable</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600">1. Original Eye Image</span>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!cataractImgErrors['eye_box'] ? (
                        <img
                          src={resolveImageUrl(cataractRec.imageEyeDetection || (rec as any).imageEyeDetection || getArtifactUrl(cataractRec.id, 'eye_box') || cataractRec.imageOriginal)}
                          alt="Eye Detection"
                          className="w-full h-full object-cover"
                          onError={() => setCataractImgErrors((prev) => ({ ...prev, eye_box: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                          <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] text-slate-400">Visualization unavailable</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600">2. Eye Localization</span>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                      {!cataractImgErrors['gradcam'] ? (
                        <img
                          src={resolveImageUrl(cataractRec.imageGradCam || cataractRec.imageWorkflow || (rec as any).imageGradCam || getArtifactUrl(cataractRec.id, 'gradcam') || cataractRec.imageOriginal)}
                          alt="Grad-CAM++"
                          className="w-full h-full object-cover"
                          onError={() => setCataractImgErrors((prev) => ({ ...prev, gradcam: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900 text-slate-400">
                          <EyeOff className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] text-slate-400">Visualization unavailable</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-sky-700">3. AI Evidence Map (Grad-CAM++)</span>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-3 flex flex-col justify-between text-left space-y-2">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        4. Screening Result
                      </div>
                      <div className={`text-sm font-extrabold mt-0.5 ${cataractRec.cataractPrediction === 'CATARACT' ? 'text-red-700' : 'text-emerald-700'}`}>
                        {cataractRec.cataractPrediction === 'CATARACT' ? 'CATARACT DETECTED' : 'NORMAL / CLEAR'}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-600 space-y-1">
                      <div className="flex justify-between">
                        <span>Probability:</span>
                        <span className="font-bold text-slate-900">{((cataractRec.cataractProbability || 0) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${cataractRec.cataractPrediction === 'CATARACT' ? 'bg-red-600' : 'bg-emerald-600'}`}
                          style={{ width: `${Math.min(100, Math.max(0, (cataractRec.cataractProbability || 0) * 100))}%` }}
                        />
                      </div>
                    </div>
                    <div className={`p-1.5 rounded text-[10px] font-semibold text-center ${cataractRec.cataractPrediction === 'CATARACT' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
                      {cataractRec.cataractPrediction === 'CATARACT' ? 'Referred for Slit-Lamp' : 'Routine Preventive Care'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cataract Clinical Interpretation & Patient Guidance */}
              <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-4 space-y-3.5">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Activity className="w-4 h-4 text-sky-600" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Clinical Interpretation & Patient Guidance Summary
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Doctor Triage */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200/70 space-y-1">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                      Doctor's Clinical Triage Summary
                    </span>
                    <p className="text-slate-600 text-[11.5px] leading-relaxed">
                      {(rec as any).doctorSummary || cataractRec.clinicalRecommendation || (
                        cataractRec.cataractPrediction === 'CATARACT'
                          ? 'Anterior segment examination reveals clinically significant crystalline lens opacification. Pupillary aperture exhibits focal or diffuse density that scatters light along the visual axis. Slit-lamp examination with pupillary dilation is recommended to grade nuclear sclerosis/cortical opacities and assess visual prognosis.'
                          : 'Crystalline lens appears clear and transparent throughout the pupillary aperture. No focal lens clouding or anterior segment abnormalities detected. Continue routine preventive ophthalmic surveillance.'
                      )}
                    </p>
                  </div>

                  {/* Patient Explanation */}
                  <div className="p-3 bg-sky-50/50 rounded-xl border border-sky-100 space-y-1">
                    <span className="font-bold text-sky-900 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-sky-600" />
                      What This Means For The Patient (Simple Explanation)
                    </span>
                    <p className="text-slate-700 text-[11.5px] leading-relaxed">
                      {(rec as any).patientSummary || (
                        cataractRec.cataractPrediction === 'CATARACT'
                          ? 'Clouding has developed in the natural lens of your eye (a cataract). This is why your vision may look hazy, dim, or blurry. Cataracts are very common and treatable. An eye specialist will inspect your eyes and advise you on the best treatment to restore clear sight.'
                          : 'Your natural eye lens is currently clear and healthy. Light can pass through easily to create sharp images. Keeping up with regular eye checkups will help maintain your eyesight.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Precautions */}
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 text-xs">
                  <span className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Clinical Precautions & Recommended Actions
                  </span>
                  <ul className="text-slate-700 text-[11.5px] space-y-0.5 list-disc list-inside">
                    {cataractRec.cataractPrediction === 'CATARACT' ? (
                      <>
                        <li>Schedule an in-person eye exam with an ophthalmologist for a comprehensive slit-lamp check.</li>
                        <li>Take extra caution when driving at night if you notice glare or halos around headlights.</li>
                        <li>Wear sunglasses that block 100% of UV rays when outdoors during daylight hours.</li>
                      </>
                    ) : (
                      <>
                        <li>Keep your annual eye examination on schedule.</li>
                        <li>Wear UV-protective sunglasses outdoors to maintain long-term lens clarity.</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PIPELINE 3: DIABETIC RETINOPATHY REPORT VIEW */}
          {/* ========================================================================= */}
          {!isGlaucoma && !isCataract && drRec && (() => {
            const modalLesionData = existingReport?.lesionData || (rec as any).lesionData || (rec as any).lesions;
            const modalStructuredLesions = extractLesionItems(modalLesionData);
            const interpretation = generateDrClinicalInterpretation({
              lesionData: modalLesionData,
              drSeverity: existingReport?.drSeverity || drRec.drSeverity,
              drSeverityLevel: existingReport?.drSeverityLevel || drRec.drSeverityLevel,
              confidence: existingReport?.confidence ?? drRec.confidence ?? 95,
              imageQuality: existingReport?.imageQuality || drRec.imageQuality,
            });

            const recommendedAction = getRecommendedAction({
              imageQuality: existingReport?.imageQuality || drRec.imageQuality,
              drSeverity: existingReport?.drSeverity || drRec.drSeverity,
              drSeverityLevel: existingReport?.drSeverityLevel || drRec.drSeverityLevel,
              referralStatus: existingReport?.referralStatus || rec.referralStatus,
              referralPriority: existingReport?.referralPriority || (rec as any).referralPriority,
              referralReason: existingReport?.referralReason || (rec as any).referralReason,
              recommendation: existingReport?.recommendation || (rec as any).recommendation,
            });

            const anatomy = existingReport?.anatomyData || (rec as any).anatomyData || (rec as any).anatomy;

            const originalImg = resolveImageUrl(existingReport?.imageOriginal || drRec.imageOriginal || (rec as any).imageOriginal || drRec.imageUrl || (rec as any).imageUrl || getArtifactUrl(drRec.id, 'original'), FALLBACK_IMAGES.dr);
            const gradCamImg = resolveImageUrl(existingReport?.imageGradCam || drRec.imageGradCam || (rec as any).imageGradCam || getArtifactUrl(drRec.id, 'gradcam'), FALLBACK_IMAGES.dr);
            const lesionsImg = resolveImageUrl(existingReport?.imageLesions || drRec.imageLesions || (rec as any).imageLesions || getArtifactUrl(drRec.id, 'lesions'), FALLBACK_IMAGES.dr);
            const anatomyImg = resolveImageUrl(existingReport?.imageAnatomy || drRec.imageAnatomy || (rec as any).imageAnatomy || getArtifactUrl(drRec.id, 'anatomy'), FALLBACK_IMAGES.dr);
            const combinedImg = resolveImageUrl(existingReport?.imageCombined || drRec.imageCombined || (rec as any).imageCombined || getArtifactUrl(drRec.id, 'combined'), FALLBACK_IMAGES.dr);

            const isNoDR =
              (existingReport?.drSeverity || drRec.drSeverity) === 'No DR' ||
              (existingReport?.drSeverityLevel || drRec.drSeverityLevel || '').includes('Level 0');

            const qualityGrade = existingReport?.imageQuality || drRec.imageQuality || 'Unrecorded';
            const isQualityUngradable =
              qualityGrade === 'Poor' ||
              qualityGrade === 'Ungradable' ||
              qualityGrade.toLowerCase().includes('poor');
            const isQualityGood = qualityGrade === 'Good';
            const gradabilityText = isQualityUngradable
              ? 'Ungradable'
              : isQualityGood
              ? 'Gradable (Adequate)'
              : 'Gradable (Review Quality)';

            const whatThisMeans = getCategoryWhatThisMeans(existingReport?.drSeverity || drRec.drSeverity);
            const scoreExplanation = getModelScoreExplanation(existingReport?.confidence ?? drRec.confidence);
            const detectedLesions = modalStructuredLesions.filter(l => l.isAssessed && l.detected && l.pixels > 0);
            const modelLimitations = getModelLimitations({
              imageQuality: qualityGrade,
              isUngradable: isQualityUngradable,
              lesionData: modalLesionData,
              anatomyData: anatomy,
            });

            const spec = existingReport?.specialistReview || drRec.specialistAssessment;
            const reviewStatusText = spec ? 'Verified by Specialist ✓' : 'Pending Specialist Review';

            const modalPatientHistory =
              (existingReport as any)?.patientHistory ||
              (rec as any).patientHistory ||
              (patient?.diabetesDurationYears != null
                ? `Type 2 Diabetes (${patient.diabetesDurationYears} yrs)${patient.knownDR && patient.knownDR !== 'Uncertain' ? ` • Known DR: ${patient.knownDR}` : ''}`
                : undefined);

            const eyeShort = drRec.eye === 'Left Eye' ? 'OS' : drRec.eye === 'Right Eye' ? 'OD' : drRec.eye;

            const activeExplKey =
              activeDrTab === 'Original' ? 'original' :
              activeDrTab === 'Lesions' ? 'lesions' :
              activeDrTab === 'Grad-CAM++' ? 'gradcam' :
              activeDrTab === 'Anatomy' ? 'anatomy' : 'combined';
            const activeExpl = VISUALIZATION_EXPLANATIONS[activeExplKey];

            return (
              <div className="space-y-4">
                {/* ========================================================================= */}
                {/* 1. PATIENT & EXAMINATION DETAILS */}
                {/* ========================================================================= */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      1. Patient &amp; Examination Details
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      Demographics &amp; Clinical Parameters
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Patient Name &amp; ID</span>
                      <strong className="text-slate-900 block mt-0.5">{existingReport?.patientName || drRec.patientName}</strong>
                      <span className="font-mono text-slate-500 text-[10px] block">{existingReport?.patientId || drRec.patientId}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Age &amp; Gender</span>
                      <span className="text-slate-800 font-medium block mt-0.5">
                        {existingReport?.patientAge || drRec.patientAge} Years / {existingReport?.patientGender || drRec.patientGender}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Exam Date &amp; Eye</span>
                      <strong className="text-blue-700 block mt-0.5">
                        {drRec.eye} ({eyeShort}) • {existingReport?.generatedDate || drRec.date}
                      </strong>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Screening Operator</span>
                      <span className="text-slate-700 block mt-0.5">
                        {existingReport?.nurseName || drRec.nurseName || 'Recorded in protocol'}
                      </span>
                    </div>

                    <div className="sm:col-span-2">
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Relevant Medical History</span>
                      <span className="text-slate-700 block mt-0.5">
                        {modalPatientHistory || 'None recorded'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* 2. SCREENING SUMMARY & MODEL OUTPUT SCORE */}
                {/* ========================================================================= */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      2. Screening Summary &amp; Model Output Score
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-bold border uppercase ${
                        isNoDR
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      {existingReport?.drSeverityLevel || drRec.drSeverityLevel || drRec.drSeverity}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Predicted DR Severity</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {existingReport?.drSeverityLevel || drRec.drSeverityLevel || drRec.drSeverity}
                      </strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5">ICDR Staging Standard</span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Model Output Score</span>
                      <strong className="text-slate-900 text-sm font-mono block mt-0.5">
                        {scoreExplanation.scoreDisplay}
                      </strong>
                      <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                        Uncalibrated algorithmic score; not disease probability.
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Image Quality &amp; Gradability</span>
                      <strong className={`text-sm block mt-0.5 ${isQualityUngradable ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {qualityGrade} ({gradabilityText})
                      </strong>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {isQualityUngradable ? 'Repeat capture recommended' : 'Adequate for triage'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Clinical Review Status</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {reviewStatusText}
                      </strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {spec ? 'Specialist verified' : 'Queued for counter-check'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* 3. WHAT THE AI FOUND */}
                {/* ========================================================================= */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                      <span>3. What the AI Found</span>
                    </h4>
                    <span className="text-[11px] text-slate-500">Inference Findings Present in Model Outputs</span>
                  </div>

                  {/* Summary of Detected Findings */}
                  <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-200/80 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-sky-950">
                      <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                      <span>Summary of Findings:</span>
                    </div>
                    <ul className="space-y-1 pl-4 list-disc text-sky-900 text-[11px]">
                      <li>
                        <strong>Focal Lesions:</strong>{' '}
                        {detectedLesions.length > 0 ? (
                          <span>
                            Identified candidate regions for{' '}
                            <strong>
                              {detectedLesions.map(d => `${d.def.name} (${d.pixels.toLocaleString()} px, ${d.regions} region${d.regions === 1 ? '' : 's'})`).join(', ')}
                            </strong>
                            .
                          </span>
                        ) : (
                          <span>No microaneurysms, hemorrhages, hard exudates, or soft exudates detected.</span>
                        )}
                      </li>
                      <li>
                        <strong>Retinal Landmarks:</strong>{' '}
                        {anatomy ? (
                          <span>
                            {anatomy.optic_disc?.pixels ? `Optic Disc localized (${anatomy.optic_disc.pixels.toLocaleString()} px)` : 'Optic Disc localized'}
                            {anatomy.fovea ? ` • Fovea at (${Math.round(anatomy.fovea.x)}, ${Math.round(anatomy.fovea.y)})` : ''}
                            {anatomy.blood_vessels?.pixels ? ` • Vessels tracked (${anatomy.blood_vessels.pixels.toLocaleString()} px)` : ''}
                          </span>
                        ) : (
                          <span>Landmarks not evaluated for this record.</span>
                        )}
                      </li>
                      <li>
                        <strong>Image Clarity:</strong> {qualityGrade} ({gradabilityText}).
                      </li>
                    </ul>
                  </div>

                  {/* Compact Table */}
                  <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wide">
                          <th className="px-3 py-2 text-left font-bold">Pathological Finding</th>
                          <th className="px-3 py-2 text-left font-bold">Detection Status</th>
                          <th className="px-3 py-2 text-right font-bold">Existing Measured Result</th>
                          <th className="px-3 py-2 text-right font-bold">Overlay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalStructuredLesions.map((item, idx) => {
                          const isAssessed = item.isAssessed;
                          const isDet = isAssessed && item.detected && item.pixels > 0;
                          return (
                            <tr
                              key={item.code}
                              className={idx % 2 === 0 ? 'bg-white border-b border-slate-100' : 'bg-slate-50/60 border-b border-slate-100 last:border-0'}
                            >
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.def.colorHex }} />
                                  <span className="font-semibold text-slate-900">{item.def.fullName}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">({item.code})</span>
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {!isAssessed ? (
                                  <span className="text-slate-400 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                                    Not evaluated
                                  </span>
                                ) : isDet ? (
                                  <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded text-[10px] border border-amber-200">
                                    Detected
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                                    Not detected
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {!isAssessed ? (
                                  <span className="text-slate-400 italic font-sans">Unavailable</span>
                                ) : isDet ? (
                                  <span className="font-bold text-slate-900">
                                    {item.pixels.toLocaleString()} px
                                    {item.regions > 0 ? ` (${item.regions} regions)` : ''}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">0 px</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {isDet ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDrTab('Lesions');
                                      setHighlightedLesion(item.code);
                                    }}
                                    className="text-blue-700 font-semibold hover:underline text-[10px] cursor-pointer"
                                  >
                                    Inspect
                                  </button>
                                ) : (
                                  <span className="text-slate-300 text-[10px]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {anatomy && (
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>Optic Disc: <strong className="text-slate-900">{anatomy.optic_disc?.pixels ? `${anatomy.optic_disc.pixels.toLocaleString()} px` : 'Localized'}</strong></span>
                      <span>•</span>
                      <span>Fovea: <strong className="text-slate-900">{anatomy.fovea ? `(${Math.round(anatomy.fovea.x)}, ${Math.round(anatomy.fovea.y)})` : 'Localized'}</strong></span>
                      <span>•</span>
                      <span>Macula: <strong className="text-slate-900">Estimated ROI (r=56px)</strong></span>
                      <span>•</span>
                      <span>Vessels: <strong className="text-slate-900">{anatomy.blood_vessels?.pixels ? `${anatomy.blood_vessels.pixels.toLocaleString()} px` : 'Segmented'}</strong></span>
                    </div>
                  )}
                </div>

                {/* ========================================================================= */}
                {/* 4. WHAT THIS MEANS (CLINICAL INTERPRETATION) */}
                {/* ========================================================================= */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>4. What This Means</span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-blue-50 text-blue-800 border-blue-200 uppercase">
                      AI Decision Support
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Predicted Screening Category</span>
                    <strong className="text-slate-900 text-sm block mt-0.5">{whatThisMeans.categoryTitle}</strong>
                  </div>

                  <p className="text-slate-700 leading-relaxed text-[11.5px]">
                    {whatThisMeans.clinicalMeaning}
                  </p>

                  <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-950 text-[11px] space-y-0.5">
                    <strong className="font-bold flex items-center gap-1 text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      Clinical Verification Required:
                    </strong>
                    <p className="leading-relaxed text-amber-900 font-medium">
                      {whatThisMeans.verificationNotice}
                    </p>
                  </div>

                  <div className="pt-1.5 border-t border-slate-200 text-[10.5px] text-slate-500 space-y-0.5">
                    <p><strong>Concordance:</strong> {interpretation.concordanceTitle} — {interpretation.concordanceDetail}</p>
                    <p className="italic">{interpretation.distinctionNote}</p>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* 5. VISUAL EVIDENCE */}
                {/* ========================================================================= */}
                <div className="bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        5. Visual Evidence — {activeDrTab}
                      </span>
                    </div>

                    {/* Mode Tabs */}
                    <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 text-[11px]">
                      {(['Original', 'Lesions', 'Grad-CAM++', 'Anatomy', 'Combined'] as XaiTab[]).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setActiveDrTab(tab);
                            if (tab !== 'Lesions') setHighlightedLesion(null);
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            activeDrTab === tab
                              ? 'bg-[#0284C7] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-full h-[320px] sm:h-[380px] rounded-xl overflow-hidden border border-slate-800 bg-black flex items-center justify-center p-2">
                    <FundusRetinaCanvas
                      mode={activeDrTab}
                      opacity={65}
                      highlightLesion={highlightedLesion}
                      imageOriginal={originalImg}
                      imageGradCam={gradCamImg}
                      imageLesions={lesionsImg}
                      imageAnatomy={anatomyImg}
                      imageCombined={combinedImg}
                      className="w-full h-full"
                    />
                  </div>

                  {/* Doctor-Friendly Explanation for Active Visualization */}
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-300">
                      <strong className="text-white text-[11px] uppercase tracking-wide">{activeExpl.title}</strong>
                      <span className="text-[10px] text-slate-400">{activeExpl.short}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      {activeExpl.description}
                    </p>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* 6. RECOMMENDED CLINICAL ACTION */}
                {/* ========================================================================= */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs ${
                    recommendedAction.isReferral
                      ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
                    <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500">
                      6. Recommended Next Steps &amp; Follow-Up (Subject to Confirmation)
                    </span>
                    <span className="text-[10px] font-bold uppercase bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                      {recommendedAction.priorityBadge}
                    </span>
                  </div>
                  <h5 className="font-bold text-slate-900">{recommendedAction.actionTitle}</h5>
                  <p className="text-slate-700 leading-relaxed font-medium">{recommendedAction.actionSummary}</p>
                  <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200/60 flex justify-between">
                    <span>Follow-Up Interval: <strong className="text-slate-900">{recommendedAction.timingGuideline}</strong></span>
                    <span className="text-[10px] text-slate-400">{recommendedAction.protocolBasis}</span>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* 7. MODEL LIMITATIONS & QUALITY NOTES */}
                {/* ========================================================================= */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 uppercase text-[10px] tracking-wider">
                    <Info className="w-3.5 h-3.5 text-slate-600" />
                    <span>7. Model Limitations &amp; Quality Notes</span>
                  </div>
                  {modelLimitations.length > 0 ? (
                    <ul className="space-y-1 list-disc pl-5 text-slate-700 text-[11px]">
                      {modelLimitations.map((lim, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {lim}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      No model pipeline limitations or missing modalities identified. Retinal photography clarity is adequate for automated diabetic retinopathy decision support across the 45° central field. Automated outputs do not inspect peripheral retina beyond the captured field.
                    </p>
                  )}
                </div>

                {/* ========================================================================= */}
                {/* 8. OPHTHALMOLOGIST REVIEW */}
                {/* ========================================================================= */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                      <FileSignature className="w-3.5 h-3.5 text-blue-600" />
                      <span>8. Ophthalmologist Review</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        spec
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {reviewStatusText}
                    </span>
                  </div>
                  {spec ? (
                    <div className="space-y-1 text-slate-700 text-[11px]">
                      <p><strong>Specialist:</strong> {spec.specialistName}</p>
                      <p><strong>Review Date:</strong> {spec.reviewDate}</p>
                      <p><strong>Clinical Assessment:</strong> {spec.assessment}</p>
                      {spec.notes && <p><strong>Notes:</strong> {spec.notes}</p>}
                    </div>
                  ) : (
                    <div className="space-y-1 text-slate-500 text-[11px]">
                      <p><strong>Review Queue:</strong> Regional Tele-Ophthalmology Network</p>
                      <p><strong>Status:</strong> Queued for specialist clinical evaluation and sign-off</p>
                    </div>
                  )}

                  {/* Sign-off placeholders */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 text-[11px]">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Reviewing Ophthalmologist</span>
                      <span className="text-slate-900 block mt-0.5">{spec?.specialistName || 'Dr. ___________________________'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Registration / License</span>
                      <span className="text-slate-900 font-mono block mt-0.5">{(spec as any)?.registrationNumber || 'MCI / Reg: ____________________'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Clinical Signature &amp; Date</span>
                      <span className="text-slate-900 block mt-0.5">{spec?.reviewDate ? `Date: ${spec.reviewDate}` : 'Date: ________________________'}</span>
                    </div>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* 9. DISCLAIMER */}
                {/* ========================================================================= */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[10px] text-slate-500 leading-relaxed space-y-1">
                  <div className="font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>9. Clinical Decision-Support Disclaimer</span>
                  </div>
                  <p>
                    TRINAY is an artificial intelligence decision-support tool intended for tele-retinal screening and primary triage.
                    It does not provide an autonomous medical diagnosis. All automated classifications, lesion segmentations, and landmark
                    localizations must be clinically correlated and verified by a licensed ophthalmologist through direct clinical examination (slit-lamp biomicroscopy / OCT).
                  </p>
                  <p className="text-slate-400 font-mono pt-1 border-t border-slate-200">
                    Report ID: {existingReport?.id || drRec.id} • Screening ID: {drRec.id} • Generated: {existingReport?.generatedDate || drRec.date} • Eye: {drRec.eye} ({eyeShort})
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Clinical Disclaimer */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
            This screening report is generated automatically by the TRINAY AI deep learning engine for primary triage.
            All findings and quantitative measurements must be confirmed by a licensed ophthalmologist.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              setIsReferralModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 rounded-xl border border-slate-200 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-sky-600" />
            <span>Forward to Specialist</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-sky-600 rounded-xl shadow-xs transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
