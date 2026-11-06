import React, { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Eye,
  Sliders,
  Info,
  Layers,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Activity,
  FileCheck,
} from 'lucide-react';
import { resolveImageUrl, FALLBACK_IMAGES } from '../utils/imageUtils';

export type GlaucomaVisualizationMode =
  | 'Original'
  | 'Optic Disc & Cup'
  | 'Neuroretinal Rim'
  | 'Retinal Vessels'
  | 'Grad-CAM'
  | 'Clinical Evidence'
  | 'Interactive (Bokeh)';

export interface GlaucomaRetinaCanvasProps {
  mode: GlaucomaVisualizationMode;
  onModeChange?: (mode: GlaucomaVisualizationMode) => void;
  imageOriginal?: string | null;
  imageOpticNerve?: string | null;
  imageRim?: string | null;
  imageVessels?: string | null;
  imageGradCam?: string | null;
  imageWorkflow?: string | null;
  bokehHtml?: string | null;
  segmentationStatus?: string;
  discCupSegmentation?: {
    status?: string;
    validationStatus?: string;
    isValid?: boolean;
    discDetected?: boolean;
    cupDetected?: boolean;
    cupInsideDisc?: boolean;
    discPath?: string;
    cupPath?: string;
    verticalCDR?: number;
    horizontalCDR?: number;
    areaCDR?: number;
    rimArea?: number;
    cdrFeatures?: {
      status?: string;
      vertical_cdr?: number;
      horizontal_cdr?: number;
      area_cdr?: number;
      disc_x?: number;
      disc_y?: number;
      disc_width?: number;
      disc_height?: number;
      cup_x?: number;
      cup_y?: number;
      cup_width?: number;
      cup_height?: number;
      cup_inside_ratio?: number;
      disc_area?: number;
      cup_area?: number;
      rim_area?: number;
    };
  };
  vesselSegmentation?: {
    detected?: boolean;
    pixels?: number;
    density?: number;
  };
  glaucoma?: {
    prediction?: string;
    glaucomaProbability?: number;
    normalProbability?: number;
    confidence?: number;
    glaucomaFlag?: boolean;
    clinicalRecommendation?: string;
    shapImportance?: Record<string, number>;
  };
  heatmapOpacity?: number;
  onHeatmapOpacityChange?: (opacity: number) => void;
  onInspectFullscreen?: () => void;
  className?: string;
  patientName?: string;
  patientId?: string;
  eyeSide?: string;
}

export const GlaucomaRetinaCanvas: React.FC<GlaucomaRetinaCanvasProps> = ({
  mode,
  onModeChange,
  imageOriginal,
  imageOpticNerve,
  imageRim,
  imageVessels,
  imageGradCam,
  imageWorkflow,
  bokehHtml,
  segmentationStatus: directSegStatus,
  discCupSegmentation,
  vesselSegmentation,
  glaucoma,
  heatmapOpacity = 75,
  onHeatmapOpacityChange,
  onInspectFullscreen,
  className = '',
  patientName,
  patientId,
  eyeSide,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [hasImgError, setHasImgError] = useState<boolean>(false);

  // Reset zoom on mode change
  useEffect(() => {
    setZoomScale(1.0);
    setHasImgError(false);
  }, [mode]);

  // Extract segmentation metrics & validation state
  const cdrFeats = discCupSegmentation?.cdrFeatures;
  const isSegmentationValid =
    discCupSegmentation?.isValid !== false &&
    discCupSegmentation?.status !== 'INVALID_DISC' &&
    discCupSegmentation?.status !== 'INVALID_CUP' &&
    discCupSegmentation?.status !== 'INVALID_CUP_POSITION' &&
    discCupSegmentation?.status !== 'INVALID_GEOMETRY' &&
    discCupSegmentation?.status !== 'SEGMENTATION_UNGRADABLE';

  const segmentationStatus =
    directSegStatus ||
    discCupSegmentation?.status ||
    discCupSegmentation?.validationStatus ||
    (isSegmentationValid ? 'VALID' : 'UNGRADABLE');

  const vCdr = isSegmentationValid
    ? (cdrFeats?.vertical_cdr ?? discCupSegmentation?.verticalCDR ?? null)
    : null;
  const hCdr = isSegmentationValid
    ? (cdrFeats?.horizontal_cdr ?? discCupSegmentation?.horizontalCDR ?? null)
    : null;
  const aCdr = isSegmentationValid
    ? (cdrFeats?.area_cdr ?? discCupSegmentation?.areaCDR ?? null)
    : null;
  const discArea = isSegmentationValid ? (cdrFeats?.disc_area ?? null) : null;
  const cupArea = isSegmentationValid ? (cdrFeats?.cup_area ?? null) : null;
  const rimArea = isSegmentationValid
    ? (discCupSegmentation?.rimArea ??
      (discArea && cupArea ? Math.max(0, discArea - cupArea) : null))
    : null;

  const rawScore = glaucoma?.glaucomaProbability;
  const scorePct = isSegmentationValid && rawScore != null ? +(rawScore * 100).toFixed(1) : null;
  const isSuspect =
    isSegmentationValid &&
    (glaucoma?.prediction === 'GLAUCOMA_SUSPECT' || Boolean(glaucoma?.glaucomaFlag));

  // Resolve base and primary images cleanly
  const resolvedBaseOriginal =
    resolveImageUrl(imageOriginal || '', '') ||
    FALLBACK_IMAGES.glaucoma;

  const resolvePrimaryImage = (): string => {
    switch (mode) {
      case 'Original':
        return resolvedBaseOriginal;
      case 'Optic Disc & Cup':
        return (
          resolveImageUrl(imageOpticNerve || '', '') ||
          resolveImageUrl(imageWorkflow || '', '') ||
          resolvedBaseOriginal
        );
      case 'Neuroretinal Rim':
        return (
          resolveImageUrl(imageRim || '', '') ||
          resolveImageUrl(imageOpticNerve || '', '') ||
          resolvedBaseOriginal
        );
      case 'Retinal Vessels':
        return (
          resolveImageUrl(imageVessels || '', '') ||
          resolveImageUrl(imageWorkflow || '', '') ||
          resolvedBaseOriginal
        );
      case 'Grad-CAM':
        return (
          resolveImageUrl(imageGradCam || '', '') ||
          resolveImageUrl(imageWorkflow || '', '') ||
          resolvedBaseOriginal
        );
      case 'Clinical Evidence':
        return (
          resolveImageUrl(imageWorkflow || '', '') ||
          resolveImageUrl(imageOpticNerve || '', '') ||
          resolvedBaseOriginal
        );
      default:
        return resolvedBaseOriginal;
    }
  };

  const primarySrc = resolvePrimaryImage();

  const handleZoomIn = () => setZoomScale((s) => Math.min(2.5, +(s + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoomScale((s) => Math.max(1.0, +(s - 0.25).toFixed(2)));
  const handleZoomReset = () => setZoomScale(1.0);

  // If Bokeh mode is requested and HTML is present
  if (mode === 'Interactive (Bokeh)' && bokehHtml) {
    return (
      <div className={`relative w-full h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 ${className}`}>
        <iframe
          title="Interactive Bokeh Optic Nerve Telemetry"
          srcDoc={bokehHtml}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    );
  }

  // Grad-CAM blend mode cross-fades the heatmap over the pristine canonical fundus
  const isHeatmapMode = mode === 'Grad-CAM';
  const hasDistinctHeatmap =
    isHeatmapMode &&
    Boolean(imageGradCam) &&
    imageGradCam !== imageWorkflow &&
    Boolean(resolvedBaseOriginal);

  // Reusable Retinal Viewport Element
  const renderRetinalViewport = () => (
    <div className="relative w-full h-full flex items-center justify-center bg-[#070B14] rounded-xl overflow-hidden select-none">
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden transition-transform duration-150 ease-out"
        style={{
          transform: zoomScale > 1.0 ? `scale(${zoomScale})` : undefined,
          transformOrigin: 'center center',
        }}
      >
        {/* Base layer when cross-fading Grad-CAM heatmap */}
        {hasDistinctHeatmap && (
          <img
            src={resolvedBaseOriginal}
            alt="Base Fundus"
            className="w-full h-full block max-w-full max-h-full pointer-events-none"
            style={{ objectFit: 'contain' }}
            draggable={false}
          />
        )}

        {/* Primary High-Resolution Clinical Visualization Layer */}
        <img
          src={primarySrc}
          alt={`Glaucoma ${mode} Structural Biomarker`}
          className="w-full h-full block max-w-full max-h-full pointer-events-none"
          style={{
            objectFit: 'contain',
            position: hasDistinctHeatmap ? 'absolute' : 'relative',
            inset: hasDistinctHeatmap ? 0 : undefined,
            opacity: hasDistinctHeatmap ? heatmapOpacity / 100 : 1.0,
          }}
          draggable={false}
          onError={() => setHasImgError(true)}
        />
      </div>

      {/* Non-obstructive Ungradable Notice */}
      {!isSegmentationValid && (
        <div className="absolute top-14 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md p-3 rounded-xl bg-slate-900/90 text-amber-300 text-xs border border-amber-500/60 shadow-xl backdrop-blur-md flex items-center gap-2.5 z-20 pointer-events-auto">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <div className="text-[11px] leading-snug">
            <strong className="block font-bold text-amber-200">
              Segmentation Ungradable ({segmentationStatus})
            </strong>
            <span className="text-slate-300">
              Disc or cup boundary ungradable. Measurements inhibited for clinical safety.
            </span>
          </div>
        </div>
      )}

      {/* FLOATING HUD: TOP-LEFT METADATA PILL */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none z-20">
        <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-white text-[11px] font-bold border border-slate-700/80 backdrop-blur-md flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {mode === 'Original'
              ? 'Original Fundus Image'
              : mode === 'Optic Disc & Cup'
              ? 'Optic Disc & Cup'
              : mode === 'Neuroretinal Rim'
              ? 'Neuroretinal Rim'
              : mode === 'Retinal Vessels'
              ? 'Retinal Microvasculature'
              : mode === 'Grad-CAM'
              ? 'Grad-CAM Saliency'
              : 'Clinical Evidence Workflow'}
          </span>
        </span>

        {patientName && (
          <span className="hidden sm:inline-block px-2.5 py-1.5 rounded-lg bg-slate-900/85 text-slate-300 text-[11px] border border-slate-700/80 backdrop-blur-md shadow-md">
            {patientName} {patientId ? `(${patientId})` : ''} • {eyeSide || 'Right Eye'}
          </span>
        )}
      </div>

      {/* FLOATING HUD: TOP-RIGHT ZOOM & FULLSCREEN CONTROLS */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoomScale >= 2.5}
          className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition-colors cursor-pointer disabled:opacity-40 shadow-md"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoomScale <= 1.0}
          className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition-colors cursor-pointer disabled:opacity-40 shadow-md"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {zoomScale > 1.0 && (
          <button
            type="button"
            onClick={handleZoomReset}
            className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-sky-300 hover:text-white text-[10px] font-mono font-bold border border-slate-700/80 backdrop-blur-md transition-colors cursor-pointer shadow-md"
            title="Reset Zoom"
          >
            {zoomScale}x Reset
          </button>
        )}

        {onInspectFullscreen && (
          <button
            type="button"
            onClick={onInspectFullscreen}
            className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition-colors cursor-pointer shadow-md"
            title="Inspect Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* FLOATING HUD: BOTTOM STATUS BAR */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 z-20 pointer-events-none">
        {/* Left: Mode-Specific Legend */}
        <div className="pointer-events-auto">
          {mode === 'Optic Disc & Cup' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] font-mono border border-slate-700/90 backdrop-blur-md shadow-lg">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
                <span>Disc (Green)</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" />
                <span>Cup (Magenta)</span>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                vCDR:{' '}
                <strong className="text-white">
                  {isSegmentationValid && vCdr != null && vCdr > 0 ? vCdr.toFixed(3) : '—'}
                </strong>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Status:{' '}
                <strong
                  className={
                    isSegmentationValid ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {segmentationStatus}
                </strong>
              </span>
            </div>
          )}

          {mode === 'Neuroretinal Rim' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] font-mono border border-slate-700/90 backdrop-blur-md shadow-lg">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                <span>Rim Shading (Blue)</span>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Rim Area:{' '}
                <strong className="text-white">
                  {isSegmentationValid && rimArea != null && rimArea > 0
                    ? `${rimArea.toLocaleString()} px`
                    : 'Calculated'}
                </strong>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                vCDR:{' '}
                <strong className="text-white">
                  {isSegmentationValid && vCdr != null && vCdr > 0 ? vCdr.toFixed(3) : '—'}
                </strong>
              </span>
            </div>
          )}

          {mode === 'Retinal Vessels' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] font-mono border border-slate-700/90 backdrop-blur-md shadow-lg">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>Vessels (Cyan)</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">
                Density:{' '}
                <strong className="text-white">
                  {vesselSegmentation?.density
                    ? `${(vesselSegmentation.density * 100).toFixed(1)}%`
                    : 'Delineated'}
                </strong>
              </span>
            </div>
          )}

          {mode === 'Grad-CAM' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] border border-slate-700/90 backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold">Attribution:</span>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-2 rounded-full bg-linear-to-r from-blue-700 via-emerald-500 via-amber-400 to-red-600" />
                  <span className="text-[10px] text-slate-400 font-mono">Low → High</span>
                </div>
              </div>

              {onHeatmapOpacityChange && (
                <div className="flex items-center gap-2 pl-0 sm:pl-3 border-t sm:border-t-0 sm:border-l border-slate-700">
                  <Sliders className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-400 text-[10px]">Opacity:</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={heatmapOpacity}
                    onChange={(e) => onHeatmapOpacityChange(Number(e.target.value))}
                    className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
                  />
                  <span className="text-[10px] font-mono text-slate-300">{heatmapOpacity}%</span>
                </div>
              )}
            </div>
          )}

          {mode === 'Clinical Evidence' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] font-mono border border-slate-700/90 backdrop-blur-md shadow-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Full Clinical Evidence Workflow</span>
              <span className="text-slate-600">|</span>
              <span>
                vCDR:{' '}
                <strong className="text-white">
                  {isSegmentationValid && vCdr != null && vCdr > 0 ? vCdr.toFixed(3) : '—'}
                </strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 font-bold">1:1 Registered</span>
            </div>
          )}
        </div>

        {/* Right: Technical Pill */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-400 text-[10px] border border-slate-800 backdrop-blur-md shadow-lg">
          <Info className="w-3 h-3 text-sky-400" />
          <span>Screening Decision Support • Canonical 512×512 Frame</span>
        </div>
      </div>
    </div>
  );

  // Dedicated Clinical Evidence Summary Component (Adjacent on Desktop, Stacked on Mobile)
  const renderClinicalEvidencePanel = () => (
    <div className="w-full lg:w-[380px] xl:w-[420px] h-full overflow-y-auto bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-5 text-slate-800 flex flex-col justify-between space-y-3.5">
      <div className="space-y-3.5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0284C7]" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
              CLINICAL EVIDENCE SUMMARY
            </span>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80">
            {patientId || 'PX-Screening'} • {eyeSide || 'Right Eye'}
          </span>
        </div>

        {/* 1. Image & Segmentation Validity */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">1. Image & Segmentation Validity:</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase border ${
                isSegmentationValid
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {isSegmentationValid ? 'VALID' : 'UNGRADABLE'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            {isSegmentationValid
              ? 'Optic disc and cup boundaries verified on canonical 512×512 coordinate frame.'
              : `Segmentation ungradable (${segmentationStatus}). Morphometric measurements inhibited for clinical safety.`}
          </p>
        </div>

        {/* 2. AI Screening Result */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">2. AI Screening Result:</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${
                !isSegmentationValid
                  ? 'bg-slate-100 text-slate-600 border-slate-300'
                  : isSuspect
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {!isSegmentationValid
                ? 'Inconclusive'
                : isSuspect
                ? 'Glaucoma Suspect'
                : 'Low-Risk Classification'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 mt-1">
            <span className="text-slate-600 font-medium">Model Screening Score:</span>
            <span className="font-mono font-bold text-slate-900">
              {scorePct !== null ? `${scorePct}%` : 'Inhibited'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            Statistical screening triage score (Random Forest). Not a calibrated disease probability.
          </p>
        </div>

        {/* 3. Quantitative Structural Metrics */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-700 block">3. Quantitative Structural Metrics:</span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-[10px] text-slate-400 block font-medium">Vertical CDR (vCDR)</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {vCdr !== null && vCdr > 0 ? vCdr.toFixed(3) : 'Not available'}
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-[10px] text-slate-400 block font-medium">Horizontal CDR (hCDR)</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {hCdr !== null && hCdr > 0 ? hCdr.toFixed(3) : 'Not available'}
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-[10px] text-slate-400 block font-medium">Area CDR (Fraction)</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {aCdr !== null && aCdr > 0 ? aCdr.toFixed(3) : 'Not available'}
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-[10px] text-slate-400 block font-medium">Rim Area (2D Pixels)</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {rimArea !== null && rimArea > 0 ? `${rimArea.toLocaleString()} px` : 'Calculated'}
              </span>
            </div>
          </div>

          <div className="p-2 bg-slate-50/70 rounded-lg border border-slate-200/60 flex items-center justify-between text-[10.5px]">
            <span className="text-slate-500">Quadrant Rim Thickness (ISNT):</span>
            <span className="font-semibold text-slate-400">Not available (Not implemented)</span>
          </div>
        </div>

        {/* 4. Clinical Notice & Diagnostic Safeguards */}
        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-950 text-[11px] space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-900">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Clinical Notice:</span>
          </div>
          <p className="leading-relaxed text-amber-900/90 text-[10.5px]">
            AI screening results are decision support only and do not establish a confirmed diagnosis. Tonometry (IOP), central corneal thickness, and perimetry are required.
          </p>
        </div>

        {/* 5. Clinical Recommendation */}
        {glaucoma?.clinicalRecommendation && (
          <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80 text-[11px] space-y-0.5">
            <strong className="block font-bold text-sky-900">Clinical Recommendation:</strong>
            <p className="text-sky-950 leading-relaxed text-[10.5px]">
              {glaucoma.clinicalRecommendation}
            </p>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>TRINAY Glaucoma AI Decision Support</span>
        <span>Canonical 512×512 Frame</span>
      </div>
    </div>
  );

  // When 'Clinical Evidence' mode is active, render side-by-side (desktop) or stacked (mobile) layout
  if (mode === 'Clinical Evidence') {
    return (
      <div
        className={`relative w-full h-full bg-[#070B14] select-none flex flex-col lg:flex-row gap-3 p-2 rounded-xl ${className}`}
        style={{ touchAction: 'none' }}
      >
        {/* Retinal Image Viewport: 100% visible, fully registered, never obstructed */}
        <div className="relative flex-1 min-h-[360px] sm:min-h-[420px] lg:min-h-0 h-full rounded-xl overflow-hidden border border-slate-800">
          {renderRetinalViewport()}
        </div>

        {/* Dedicated Clinical Evidence Summary Panel: Adjacent, Non-obstructive */}
        {renderClinicalEvidencePanel()}
      </div>
    );
  }

  // All other 5 tabs: Pristine full-canvas image viewport with HUD toolbar
  return (
    <div
      className={`relative w-full h-full bg-[#070B14] overflow-hidden select-none flex items-center justify-center rounded-xl ${className}`}
      style={{ touchAction: 'none' }}
    >
      {renderRetinalViewport()}
    </div>
  );
};
