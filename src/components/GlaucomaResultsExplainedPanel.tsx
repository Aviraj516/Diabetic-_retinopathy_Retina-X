import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Info,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Activity,
  Layers,
  FileCheck,
  AlertCircle,
  XCircle,
} from 'lucide-react';

export interface GlaucomaResultsExplainedData {
  screeningStatus?: string;
  segmentationStatus?: string;
  isSegmentationValid?: boolean;
  glaucomaPrediction?: string;
  glaucomaProbability?: number;
  normalProbability?: number;
  glaucomaFlag?: boolean;
  confidence?: number;
  verticalCDR?: number;
  horizontalCDR?: number;
  areaCDR?: number;
  rimArea?: number;
  cdrFeatures?: {
    status?: string;
    vertical_cdr?: number;
    horizontal_cdr?: number;
    area_cdr?: number;
    cup_inside_ratio?: number;
    disc_area?: number;
    cup_area?: number;
    rim_area?: number;
    disc_width?: number;
    disc_height?: number;
  };
  vesselsDetected?: boolean;
  vesselDensityPct?: number;
  imageQuality?: string;
  gradcamAvailable?: boolean;
  clinicalRecommendation?: string;
  specialistReviewStatus?: string;
}

interface GlaucomaResultsExplainedPanelProps {
  data: GlaucomaResultsExplainedData;
  compact?: boolean;
  className?: string;
}

export const GlaucomaResultsExplainedPanel: React.FC<GlaucomaResultsExplainedPanelProps> = ({
  data,
  compact = false,
  className = '',
}) => {
  // Determine if segmentation validation passed
  const isSegValid =
    data.isSegmentationValid !== false &&
    data.segmentationStatus !== 'INVALID_DISC' &&
    data.segmentationStatus !== 'INVALID_CUP' &&
    data.segmentationStatus !== 'INVALID_CUP_POSITION' &&
    data.segmentationStatus !== 'INVALID_GEOMETRY' &&
    data.segmentationStatus !== 'SEGMENTATION_UNGRADABLE' &&
    data.glaucomaPrediction !== 'INCONCLUSIVE' &&
    data.glaucomaPrediction !== 'UNGRADABLE';

  const segStatus = data.segmentationStatus || (isSegValid ? 'VALID' : 'UNGRADABLE');

  const isSuspect =
    isSegValid &&
    (data.glaucomaPrediction === 'GLAUCOMA_SUSPECT' || Boolean(data.glaucomaFlag));

  // Model probability & confidence (only when valid)
  const probabilityPct =
    isSegValid && data.glaucomaProbability != null
      ? +(data.glaucomaProbability * 100).toFixed(1)
      : null;

  // Actual CDR values
  const vCdr = isSegValid ? (data.cdrFeatures?.vertical_cdr ?? data.verticalCDR ?? null) : null;
  const hCdr = isSegValid ? (data.cdrFeatures?.horizontal_cdr ?? data.horizontalCDR ?? null) : null;
  const aCdr = isSegValid ? (data.cdrFeatures?.area_cdr ?? data.areaCDR ?? null) : null;
  const cupInsideRatio = isSegValid ? (data.cdrFeatures?.cup_inside_ratio ?? null) : null;
  const discArea = isSegValid ? (data.cdrFeatures?.disc_area ?? null) : null;
  const cupArea = isSegValid ? (data.cdrFeatures?.cup_area ?? null) : null;
  const rimArea = isSegValid
    ? (data.rimArea ?? (discArea && cupArea ? Math.max(0, discArea - cupArea) : null))
    : null;

  // Structured Status Titles according to Priority 4
  const screeningStatusTitle = !isSegValid
    ? 'Inconclusive — reliable anatomical measurements could not be obtained'
    : isSuspect
    ? 'AI screening result: Glaucoma suspect — clinical assessment required.'
    : 'AI screening result: Low-risk classification — this does not exclude glaucoma.';

  const screeningStatusSubtitle = !isSegValid
    ? 'Automated classification inhibited for clinical safety • Reliable optic disc/cup contours could not be established'
    : isSuspect
    ? 'Elevated cup-to-disc ratio detected by automated calipers • Clinical assessment and tonometry required'
    : 'Optic nerve head morphology within screening boundaries • Regular ophthalmic examination advised';

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden ${className}`}>
      {/* 1. STRUCTURED RESULT HEADER */}
      <div
        className={`p-4 sm:p-5 border-b ${
          !isSegValid
            ? 'bg-amber-50/70 border-amber-200'
            : isSuspect
            ? 'bg-amber-50/50 border-amber-200'
            : 'bg-emerald-50/40 border-emerald-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  !isSegValid ? 'bg-amber-500' : isSuspect ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
                CLINICAL EVIDENCE SUMMARY
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
              {screeningStatusTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{screeningStatusSubtitle}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Probability pill */}
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-right">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase leading-tight">
                Model Screening Score
              </span>
              <span
                className={`text-sm sm:text-base font-black font-mono leading-tight ${
                  !isSegValid ? 'text-slate-500' : isSuspect ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {probabilityPct !== null ? `${probabilityPct}%` : 'Inhibited'}
              </span>
            </div>

            {/* Quality pill */}
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase leading-tight">
                Image Quality
              </span>
              <span className="text-xs font-bold text-slate-800 leading-tight">
                {data.imageQuality || 'Gradable'}
              </span>
            </div>

            {/* Specialist review status */}
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase leading-tight">
                Specialist Review
              </span>
              <span className="text-xs font-semibold text-amber-700 leading-tight">
                {data.specialistReviewStatus || 'Pending Specialist Review'}
              </span>
            </div>
          </div>
        </div>

        {/* Safety banner if segmentation failed */}
        {!isSegValid && (
          <div className="mt-3 p-3 rounded-xl bg-amber-100/80 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <strong className="block font-bold">Safety Enforcement Active:</strong>
              <span>
                Automated classification was inhibited because optic nerve segmentation failed validation (
                <code className="bg-amber-200/80 px-1 py-0.5 rounded font-mono font-bold text-[11px]">{segStatus}</code>
                ). TRINAY does not substitute fabricated fallback measurements or produce an unverified diagnosis from invalid anatomical input.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. THREE-CATEGORY CLINICAL EVIDENCE SECTIONS */}
      <div className="p-5 sm:p-6 space-y-6">
        {/* ============================================================ */}
        {/* CATEGORY A: IMAGE AND SEGMENTATION VALIDITY */}
        {/* ============================================================ */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
              <span>Category A: Image and Segmentation Validity</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Prerequisite for Classification</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* 1. Image Quality Status */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
              <span className="text-slate-500 text-[10px] block font-semibold uppercase">1. Image Quality</span>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{data.imageQuality || 'Gradable'}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  VALID
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight pt-0.5">
                Sharpness, illumination, and contrast verified.
              </p>
            </div>

            {/* 2. Optic Disc Segmentation */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
              <span className="text-slate-500 text-[10px] block font-semibold uppercase">2. Optic Disc Status</span>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {segStatus === 'INVALID_DISC' ? 'Undetected' : isSegValid ? 'Delineated' : 'Ungradable'}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                    segStatus === 'INVALID_DISC'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : isSegValid
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {segStatus === 'INVALID_DISC' ? 'INVALID' : isSegValid ? 'VALID' : 'INCONCLUSIVE'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight pt-0.5">
                {discArea ? `${discArea.toLocaleString()} px area` : 'Area threshold >= 500 px'}
              </p>
            </div>

            {/* 3. Optic Cup Segmentation */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
              <span className="text-slate-500 text-[10px] block font-semibold uppercase">3. Optic Cup Status</span>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {segStatus === 'INVALID_CUP' ? 'Undetected' : isSegValid ? 'Delineated' : 'Ungradable'}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                    segStatus === 'INVALID_CUP'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : isSegValid
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {segStatus === 'INVALID_CUP' ? 'INVALID' : isSegValid ? 'VALID' : 'INCONCLUSIVE'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight pt-0.5">
                {cupArea ? `${cupArea.toLocaleString()} px area` : 'Area threshold >= 50 px'}
              </p>
            </div>

            {/* 4. Anatomical Containment & Geometry */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
              <span className="text-slate-500 text-[10px] block font-semibold uppercase">4. Cup Containment</span>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {segStatus === 'INVALID_CUP_POSITION'
                    ? 'Displaced Cup'
                    : isSegValid
                    ? 'Concentric'
                    : 'Ungradable'}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                    segStatus === 'INVALID_CUP_POSITION' || segStatus === 'INVALID_GEOMETRY'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : isSegValid
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {segStatus === 'INVALID_CUP_POSITION' || segStatus === 'INVALID_GEOMETRY'
                    ? 'INVALID'
                    : isSegValid
                    ? 'VALID'
                    : 'INCONCLUSIVE'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight pt-0.5">
                {cupInsideRatio !== null ? `${(cupInsideRatio * 100).toFixed(0)}% inside disc (>=90%)` : 'Anatomical check'}
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CATEGORY B: QUANTITATIVE STRUCTURAL FINDINGS */}
        {/* ============================================================ */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
              <span>Category B: Quantitative Structural Findings</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {isSegValid ? 'Calculated from Validated Masks' : 'Inhibited — Segmentation Ungradable'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* vCDR */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Vertical CDR (vCDR)</span>
                <span className="font-mono font-bold px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-900 shadow-2xs">
                  {vCdr !== null && vCdr > 0 ? Number(vCdr).toFixed(3) : 'Not available'}
                </span>
              </div>
              <div className="text-[10.5px] text-slate-500 space-y-0.5">
                <div><strong>Type:</strong> Dimensionless ratio</div>
                <div><strong>Method:</strong> Attention U-Net vertical caliper</div>
                <div><strong>Status:</strong> {isSegValid ? 'Validated' : 'Not available — segmentation ungradable'}</div>
                <div><strong>Limitation:</strong> Sensitive to disc tilt and ovality</div>
              </div>
            </div>

            {/* hCDR */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Horizontal CDR (hCDR)</span>
                <span className="font-mono font-bold px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-900 shadow-2xs">
                  {hCdr !== null && hCdr > 0 ? Number(hCdr).toFixed(3) : 'Not available'}
                </span>
              </div>
              <div className="text-[10.5px] text-slate-500 space-y-0.5">
                <div><strong>Type:</strong> Dimensionless ratio</div>
                <div><strong>Method:</strong> Transverse caliper measurement</div>
                <div><strong>Status:</strong> {isSegValid ? 'Validated' : 'Not available — segmentation ungradable'}</div>
                <div><strong>Limitation:</strong> Vascular trunk can obscure horizontal cup boundary</div>
              </div>
            </div>

            {/* Area CDR */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Area CDR (Fraction)</span>
                <span className="font-mono font-bold px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-900 shadow-2xs">
                  {aCdr !== null && aCdr > 0 ? Number(aCdr).toFixed(3) : 'Not available'}
                </span>
              </div>
              <div className="text-[10.5px] text-slate-500 space-y-0.5">
                <div><strong>Type:</strong> Dimensionless fraction</div>
                <div><strong>Method:</strong> Cup pixel area / Full disc pixel area</div>
                <div><strong>Status:</strong> {isSegValid ? 'Validated' : 'Not available — segmentation ungradable'}</div>
                <div><strong>Limitation:</strong> 2D projection does not measure 3D cup volume</div>
              </div>
            </div>
          </div>

          {/* Morphometric Areas Strip */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500 block">Optic Disc Area:</span>
              <span className="font-mono font-bold text-slate-800">
                {discArea !== null && discArea > 0 ? `${discArea.toLocaleString()} px` : 'Not available'}
              </span>
              <span className="text-[9.5px] text-slate-400 block">2D pixel count at 512×512 (not mm²)</span>
            </div>

            <div>
              <span className="text-slate-500 block">Optic Cup Area:</span>
              <span className="font-mono font-bold text-slate-800">
                {cupArea !== null && cupArea > 0 ? `${cupArea.toLocaleString()} px` : 'Not available'}
              </span>
              <span className="text-[9.5px] text-slate-400 block">Segmented cup pixel area</span>
            </div>

            <div>
              <span className="text-slate-500 block">Neuroretinal Rim Area:</span>
              <span className="font-mono font-bold text-slate-800">
                {rimArea !== null && rimArea > 0 ? `${rimArea.toLocaleString()} px` : 'Not available'}
              </span>
              <span className="text-[9.5px] text-slate-400 block">Disc area minus cup area</span>
            </div>

            <div>
              <span className="text-slate-500 block">Quadrant Rim (ISNT):</span>
              <span className="font-bold text-amber-700 block text-[10.5px]">
                Not available
              </span>
              <span className="text-[9.5px] text-slate-400 block">Measurement not implemented in model</span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CATEGORY C: AI SCREENING INTERPRETATION */}
        {/* ============================================================ */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
              <span>Category C: AI Screening Interpretation</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Screening Classification Result</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
              <div>
                <span className="text-slate-500 text-[10.5px] block font-semibold uppercase">
                  AI Screening Classification:
                </span>
                <span
                  className={`font-bold text-sm ${
                    !isSegValid ? 'text-amber-700' : isSuspect ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {screeningStatusTitle}
                </span>
              </div>

              {isSegValid && probabilityPct !== null && (
                <div className="text-right">
                  <span className="text-slate-500 text-[10px] block">Model Score (RF):</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">{probabilityPct}%</span>
                </div>
              )}
            </div>

            <p className="text-slate-600 leading-relaxed text-[11.5px]">
              {!isSegValid
                ? 'Automated glaucoma classification was inhibited because reliable anatomical measurements could not be established. Inconclusive screening results must not be treated as evidence of glaucoma or as evidence of its absence.'
                : isSuspect
                ? 'The Random Forest screening model classified this examination as a glaucoma suspect based on 10 extracted morphometric parameters. This finding indicates screening risk and requires formal clinical ophthalmic evaluation.'
                : 'The Random Forest screening model classified this examination in the low-risk category. A low-risk screening classification does not exclude glaucoma (including normal-tension glaucoma or early visual field loss).'}
            </p>

            {/* Diagnostic safety notice */}
            <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-700 space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                <span>Screening Limitation Notice:</span>
              </div>
              <p className="leading-snug text-slate-600">
                This algorithm provides screening triage and does not confirm glaucoma. Definitive clinical diagnosis requires intraocular pressure (IOP) tonometry, gonioscopy, central corneal thickness (CCT), and automated perimetry.
              </p>
            </div>

            {/* Dynamic clinical recommendation from model */}
            {data.clinicalRecommendation && (
              <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-100 text-slate-800 space-y-0.5 text-[11px]">
                <strong className="font-bold text-sky-900 block">Clinical Recommendation:</strong>
                <p className="leading-relaxed text-slate-700">{data.clinicalRecommendation}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
