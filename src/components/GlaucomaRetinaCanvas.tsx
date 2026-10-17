import React, { useState, useEffect, useRef, useCallback } from 'react';
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

interface ImageDimensions {
  width: number;
  height: number;
}

interface FitRect {
  left: number;
  top: number;
  width: number;
  height: number;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const gradcamCanvasRef = useRef<HTMLCanvasElement>(null);

  // Intrinsic natural image dimensions
  const [naturalDimensions, setNaturalDimensions] = useState<ImageDimensions | null>(null);
  // Container rendered viewport dimensions
  const [containerDimensions, setContainerDimensions] = useState<ImageDimensions>({ width: 0, height: 0 });
  // Interactive zoom scale (1.0 = fit)
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  // Image loading & error states
  const [imageError, setImageError] = useState<boolean>(false);
  const [overlayError, setOverlayError] = useState<Record<string, boolean>>({});

  // Resolve canonical reference image URL
  const resolvedOriginalUrl = resolveImageUrl(imageOriginal || '', FALLBACK_IMAGES.glaucoma);

  // 1. Measure natural intrinsic dimensions of the reference fundus image
  useEffect(() => {
    if (!resolvedOriginalUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setNaturalDimensions({
        width: img.naturalWidth || 512,
        height: img.naturalHeight || 512,
      });
      setImageError(false);
    };
    img.onerror = () => {
      setNaturalDimensions({ width: 512, height: 512 });
      setImageError(true);
    };
    img.src = resolvedOriginalUrl;
  }, [resolvedOriginalUrl]);

  // 2. Measure viewport container dimensions dynamically with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerDimensions({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 3. Compute canonical letterbox/pillarbox rectangle (object-fit: contain inside container)
  const computeFitRect = useCallback((): FitRect => {
    const cw = containerDimensions.width;
    const ch = containerDimensions.height;
    if (!cw || !ch) return { left: 0, top: 0, width: 0, height: 0 };

    const nw = naturalDimensions?.width || 512;
    const nh = naturalDimensions?.height || 512;
    const imgAspect = nw / nh;
    const containerAspect = cw / ch;

    let w = cw;
    let h = ch;
    let left = 0;
    let top = 0;

    if (imgAspect > containerAspect) {
      // Letterbox top and bottom
      w = cw;
      h = cw / imgAspect;
      top = (ch - h) / 2;
      left = 0;
    } else {
      // Pillarbox left and right
      h = ch;
      w = ch * imgAspect;
      left = (cw - w) / 2;
      top = 0;
    }

    return { left, top, width: w, height: h };
  }, [containerDimensions, naturalDimensions]);

  const fitRect = computeFitRect();

  // 4. Render alpha-masked Grad-CAM onto HTML5 Canvas
  // Filters out low-activation baseline blue so fundus anatomy remains visible beneath!
  useEffect(() => {
    if (mode !== 'Grad-CAM' || !imageGradCam || !gradcamCanvasRef.current) return;
    const canvas = gradcamCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradImg = new Image();
    gradImg.crossOrigin = 'anonymous';
    gradImg.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      ctx.clearRect(0, 0, 512, 512);

      const offscreen = document.createElement('canvas');
      offscreen.width = 512;
      offscreen.height = 512;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;

      offCtx.drawImage(gradImg, 0, 0, 512, 512);
      const imgData = offCtx.getImageData(0, 0, 512, 512);
      const data = imgData.data;

      const alphaFactor = heatmapOpacity / 100;

      // Filter JET colormap:
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Activation proxy: higher red/yellow means higher model attribution
        const activation = Math.max(0, (r * 1.5 + g * 0.8 - b * 1.2) / 255);
        const normActivation = Math.min(1.0, Math.max(0.0, activation));

        if (normActivation < 0.15) {
          data[i + 3] = 0;
        } else {
          const ramp = (normActivation - 0.15) / 0.85;
          data[i + 3] = Math.round(ramp * alphaFactor * 240);
        }
      }

      ctx.putImageData(imgData, 0, 0);
    };

    gradImg.onerror = () => {
      setOverlayError((prev) => ({ ...prev, gradcam: true }));
    };

    gradImg.src = resolveImageUrl(imageGradCam, '');
  }, [mode, imageGradCam, heatmapOpacity]);

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

  const vCdr = isSegmentationValid ? (cdrFeats?.vertical_cdr ?? discCupSegmentation?.verticalCDR ?? 0) : 0;
  const hCdr = isSegmentationValid ? (cdrFeats?.horizontal_cdr ?? discCupSegmentation?.horizontalCDR ?? 0) : 0;
  const aCdr = isSegmentationValid ? (cdrFeats?.area_cdr ?? discCupSegmentation?.areaCDR ?? 0) : 0;
  const cupInsideRatio = cdrFeats?.cup_inside_ratio ?? 1.0;
  const discDetected = discCupSegmentation?.discDetected !== false && isSegmentationValid;
  const cupDetected = discCupSegmentation?.cupDetected !== false && isSegmentationValid;

  const discPath = isSegmentationValid ? discCupSegmentation?.discPath : undefined;
  const cupPath = isSegmentationValid ? discCupSegmentation?.cupPath : undefined;
  const rimArea = isSegmentationValid
    ? (discCupSegmentation?.rimArea ?? (cdrFeats?.disc_area && cdrFeats?.cup_area ? Math.max(0, cdrFeats.disc_area - cdrFeats.cup_area) : 0))
    : 0;

  // Actual bounding coordinates in 512x512 space
  const discX = cdrFeats?.disc_x ?? 220;
  const discY = cdrFeats?.disc_y ?? 190;
  const discW = cdrFeats?.disc_width ?? 120;
  const discH = cdrFeats?.disc_height ?? 130;
  const cupX = cdrFeats?.cup_x ?? 245;
  const cupY = cdrFeats?.cup_y ?? 215;
  const cupW = cdrFeats?.cup_width ?? 70;
  const cupH = cdrFeats?.cup_height ?? 80;

  const discCx = discX + discW / 2;
  const discCy = discY + discH / 2;
  const cupCx = cupX + cupW / 2;
  const cupCy = cupY + cupH / 2;

  const hasVectorCoordinates =
    isSegmentationValid &&
    cdrFeats &&
    typeof cdrFeats.disc_x === 'number' &&
    typeof cdrFeats.disc_width === 'number' &&
    cdrFeats.disc_width > 10;

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

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[#070B14] overflow-hidden select-none flex items-center justify-center ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* CANONICAL POSITIONED WRAPPER:
          Locked precisely to the displayed image rectangle with object-fit: contain.
          All layers (Original, Overlays, SVG, Heatmap) share this exact coordinate space! */}
      {fitRect.width > 0 && fitRect.height > 0 && (
        <div
          className="absolute transition-transform duration-100 ease-out"
          style={{
            left: `${fitRect.left}px`,
            top: `${fitRect.top}px`,
            width: `${fitRect.width}px`,
            height: `${fitRect.height}px`,
            transform: zoomScale > 1 ? `scale(${zoomScale})` : undefined,
            transformOrigin: 'center center',
          }}
        >
          {/* LAYER 0: BASE ORIGINAL FUNDUS IMAGE
              Preserved across every single visualization mode without resizing or jumping */}
          <img
            src={resolvedOriginalUrl}
            alt="Reference Fundus Image"
            className="w-full h-full block object-contain pointer-events-none"
            draggable={false}
            onError={() => setImageError(true)}
          />

          {/* LAYER 1: OPTIC DISC & CUP (Mode 2) */}
          {mode === 'Optic Disc & Cup' && (
            <>
              {isSegmentationValid ? (
                <>
                  <svg
                    viewBox="0 0 512 512"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <marker
                        id="arrow-green"
                        viewBox="0 0 10 10"
                        refX="6"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#22C55E" />
                      </marker>
                      <marker
                        id="arrow-magenta"
                        viewBox="0 0 10 10"
                        refX="6"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#EC4899" />
                      </marker>
                    </defs>

                    {/* 1. Actual Predicted Mask Boundaries (Polygons if available) */}
                    {discPath ? (
                      <path
                        d={discPath}
                        fill="rgba(34, 197, 94, 0.08)"
                        stroke="#22C55E"
                        strokeWidth="2.5"
                      />
                    ) : hasVectorCoordinates ? (
                      <ellipse
                        cx={discCx}
                        cy={discCy}
                        rx={discW / 2}
                        ry={discH / 2}
                        fill="rgba(34, 197, 94, 0.08)"
                        stroke="#22C55E"
                        strokeWidth="2.5"
                      />
                    ) : null}

                    {cupPath ? (
                      <path
                        d={cupPath}
                        fill="rgba(236, 72, 153, 0.14)"
                        stroke="#EC4899"
                        strokeWidth="2.5"
                      />
                    ) : hasVectorCoordinates ? (
                      <ellipse
                        cx={cupCx}
                        cy={cupCy}
                        rx={cupW / 2}
                        ry={cupH / 2}
                        fill="rgba(236, 72, 153, 0.14)"
                        stroke="#EC4899"
                        strokeWidth="2.5"
                      />
                    ) : null}

                    {/* 2. Center Points */}
                    {hasVectorCoordinates && (
                      <>
                        <circle cx={discCx} cy={discCy} r="3" fill="#22C55E" />
                        <circle cx={cupCx} cy={cupCy} r="3" fill="#EC4899" />

                        {/* 3. Vertical Caliper Measurement Lines */}
                        <line
                          x1={discCx}
                          y1={discY}
                          x2={discCx}
                          y2={discY + discH}
                          stroke="#22C55E"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                          opacity="0.85"
                        />
                        <line
                          x1={cupCx}
                          y1={cupY}
                          x2={cupCx}
                          y2={cupY + cupH}
                          stroke="#EC4899"
                          strokeWidth="1.6"
                          opacity="0.9"
                        />

                        {/* 4. Non-obstructive Leader Callouts */}
                        <line
                          x1={Math.min(500, discCx + discW / 2 + 55)}
                          y1={Math.max(30, discCy - 45)}
                          x2={discCx + discW / 2 - 2}
                          y2={discCy - 10}
                          stroke="#22C55E"
                          strokeWidth="1.5"
                          markerEnd="url(#arrow-green)"
                        />
                        <rect
                          x={Math.min(410, Math.max(10, discCx + discW / 2 + 20))}
                          y={Math.max(15, discCy - 68)}
                          width="95"
                          height="20"
                          rx="4"
                          fill="rgba(15, 23, 42, 0.90)"
                          stroke="#22C55E"
                          strokeWidth="1"
                        />
                        <text
                          x={Math.min(410, Math.max(10, discCx + discW / 2 + 20)) + 47}
                          y={Math.max(15, discCy - 68) + 14}
                          fill="#22C55E"
                          fontSize="10"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          OPTIC DISC
                        </text>

                        <line
                          x1={Math.min(500, cupCx + cupW / 2 + 55)}
                          y1={Math.min(490, cupCy + 55)}
                          x2={cupCx + cupW / 2 - 2}
                          y2={cupCy + 8}
                          stroke="#EC4899"
                          strokeWidth="1.5"
                          markerEnd="url(#arrow-magenta)"
                        />
                        <rect
                          x={Math.min(415, Math.max(10, cupCx + cupW / 2 + 20))}
                          y={Math.min(480, cupCy + 58)}
                          width="90"
                          height="20"
                          rx="4"
                          fill="rgba(15, 23, 42, 0.90)"
                          stroke="#EC4899"
                          strokeWidth="1"
                        />
                        <text
                          x={Math.min(415, Math.max(10, cupCx + cupW / 2 + 20)) + 45}
                          y={Math.min(480, cupCy + 58) + 14}
                          fill="#EC4899"
                          fontSize="10"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          OPTIC CUP
                        </text>
                      </>
                    )}
                  </svg>
                  {/* Fallback to image layer if vector paths and coordinates are both missing */}
                  {!discPath && !hasVectorCoordinates && imageOpticNerve && (
                    <img
                      src={resolveImageUrl(imageOpticNerve, '')}
                      alt="Optic Disc & Cup Segmentation Layer"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      draggable={false}
                    />
                  )}
                </>
              ) : (
                /* EXPLICIT UNGRADABLE / INVALID SEGMENTATION BANNER */
                <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-slate-900/95 text-amber-300 text-xs border border-amber-500/60 shadow-xl backdrop-blur-md flex items-center gap-3 pointer-events-auto">
                  <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                  <div>
                    <strong className="block font-bold text-amber-200">
                      Optic Nerve Segmentation Ungradable ({segmentationStatus})
                    </strong>
                    <span className="text-[11px] text-slate-300">
                      Disc or cup boundaries could not be delineated with anatomical validity.
                      Automated contour measurements and CDR calculation are inhibited for patient safety.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* LAYER 2: NEURORETINAL RIM EVIDENCE (View C) */}
          {mode === 'Neuroretinal Rim' && (
            <>
              {isSegmentationValid ? (
                <>
                  {discPath && cupPath ? (
                    <svg
                      viewBox="0 0 512 512"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      preserveAspectRatio="none"
                    >
                      {/* Even-odd fill produces annular rim tissue between outer disc and inner cup */}
                      <path
                        d={`${discPath} ${cupPath}`}
                        fillRule="evenodd"
                        fill="rgba(56, 189, 248, 0.28)"
                        stroke="#38BDF8"
                        strokeWidth="1.5"
                      />
                      {/* Outer disc boundary in dashed green */}
                      <path d={discPath} fill="none" stroke="#22C55E" strokeWidth="2" strokeDasharray="4 2" />
                      {/* Inner cup boundary in dashed magenta */}
                      <path d={cupPath} fill="none" stroke="#EC4899" strokeWidth="2" strokeDasharray="4 2" />
                    </svg>
                  ) : imageRim ? (
                    <img
                      src={resolveImageUrl(imageRim, '')}
                      alt="Neuroretinal Rim Segmentation Layer"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      draggable={false}
                    />
                  ) : null}

                  {/* Anatomical rim callout card */}
                  <div className="absolute top-14 left-4 max-w-xs p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-[11px] backdrop-blur-md shadow-xl space-y-1 pointer-events-auto">
                    <div className="flex items-center justify-between border-b border-slate-700/80 pb-1">
                      <span className="font-bold text-sky-400 uppercase tracking-wider text-[10px]">Neuroretinal Rim Region</span>
                      <span className="font-mono text-slate-300 font-bold">{rimArea > 0 ? `${rimArea.toLocaleString()} px` : 'Calculated'}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-300 space-y-1">
                      <p className="leading-snug">
                        Annular tissue between outer disc boundary (green) and inner cup boundary (magenta).
                      </p>
                      <div className="pt-1 border-t border-slate-800 text-[10px] text-amber-300/90 font-medium space-y-0.5">
                        <span>• Quadrant rim thickness (ISNT): <em>Not available — measurement not implemented in existing model</em>.</span>
                        <p className="text-slate-400 text-[9.5px] italic pt-0.5">
                          Note: Do not infer confirmed glaucoma from a large cup or an apparent rim abnormality alone.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-slate-900/95 text-amber-300 text-xs border border-amber-500/60 shadow-xl backdrop-blur-md flex items-center gap-3 pointer-events-auto">
                  <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                  <div>
                    <strong className="block font-bold text-amber-200">
                      Neuroretinal Rim Ungradable ({segmentationStatus})
                    </strong>
                    <span className="text-[11px] text-slate-300">
                      Rim region cannot be delineated because optic nerve segmentation failed validation.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* LAYER 3: RETINAL VESSELS (Mode 4) */}
          {mode === 'Retinal Vessels' && (
            <>
              {imageVessels && !overlayError['vessels'] ? (
                <img
                  src={resolveImageUrl(imageVessels, '')}
                  alt="Retinal Microvasculature Segmentation"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen"
                  draggable={false}
                  onError={() => setOverlayError((p) => ({ ...p, vessels: true }))}
                />
              ) : (
                <div className="absolute bottom-4 left-4 right-4 p-3 rounded-lg bg-slate-900/90 text-slate-300 text-xs border border-slate-700 backdrop-blur-xs flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0 text-sky-400" />
                  <span>
                    Retinal microvascular segmentation layer unavailable for this capture.
                    Original fundus is displayed without artificial overlays.
                  </span>
                </div>
              )}
            </>
          )}

          {/* LAYER 4: GRAD-CAM HEATMAP (Mode 5) */}
          {mode === 'Grad-CAM' && (
            <>
              {imageGradCam && !overlayError['gradcam'] ? (
                <>
                  <canvas
                    ref={gradcamCanvasRef}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                  {/* Grad-CAM Attribution Disclaimer Card */}
                  <div className="absolute top-14 left-4 max-w-sm p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-[11px] backdrop-blur-md shadow-xl space-y-1 pointer-events-auto">
                    <div className="flex items-center justify-between border-b border-slate-700/80 pb-1">
                      <span className="font-bold text-sky-400 uppercase tracking-wider text-[10px]">Grad-CAM Saliency Explanation</span>
                      <span className="font-mono text-slate-400 text-[10px]">Target: ONH</span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 leading-snug">
                      Reflects spatial gradient activations of the <strong>Attention U-Net Bottleneck (Layer 3)</strong> segmentation network.
                    </p>
                    <div className="pt-1 border-t border-slate-800 text-[10px] text-amber-300/90">
                      <span>Does NOT explain the tabular Random Forest classifier decision. Not a lesion segmentation or diagnostic proof.</span>
                    </div>
                  </div>
                </>
              ) : imageWorkflow ? (
                <img
                  src={resolveImageUrl(imageWorkflow, '')}
                  alt="Grad-CAM Clinical Blend"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ opacity: heatmapOpacity / 100 }}
                  draggable={false}
                />
              ) : (
                <div className="absolute bottom-4 left-4 right-4 p-3 rounded-lg bg-slate-900/90 text-slate-300 text-xs border border-slate-700 backdrop-blur-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Grad-CAM spatial attribution heatmap is unavailable for this session.</span>
                </div>
              )}
            </>
          )}

          {/* LAYER 5: CLINICAL EVIDENCE DASHBOARD (Mode 6) */}
          {mode === 'Clinical Evidence' && (
            <div className="absolute inset-0 w-full h-full bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white/95 text-slate-900 p-5 rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4.5 h-4.5 text-[#0284C7]" />
                    <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">
                      Clinical Evidence Summary
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                    Patient-Specific
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-slate-600 font-semibold">1. Image & Segmentation Validity:</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${isSegmentationValid ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                      {isSegmentationValid ? 'VALID' : `UNGRADABLE (${segmentationStatus})`}
                    </span>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-slate-600 font-semibold">2. AI Screening Result:</span>
                    <span className={`font-bold ${!isSegmentationValid ? 'text-amber-700' : glaucoma?.glaucomaFlag || glaucoma?.prediction === 'GLAUCOMA_SUSPECT' ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {!isSegmentationValid
                        ? 'Inconclusive (Ungradable)'
                        : glaucoma?.glaucomaFlag || glaucoma?.prediction === 'GLAUCOMA_SUSPECT'
                        ? 'Glaucoma Suspect'
                        : 'Low-Risk Classification'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                    <span className="text-slate-600 font-semibold block">3. Quantitative Structural Metrics:</span>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] pt-1">
                      <div>vCDR: <strong className="text-slate-900">{isSegmentationValid && vCdr > 0 ? vCdr.toFixed(3) : 'Not available'}</strong></div>
                      <div>hCDR: <strong className="text-slate-900">{isSegmentationValid && hCdr > 0 ? hCdr.toFixed(3) : 'Not available'}</strong></div>
                      <div>Area: <strong className="text-slate-900">{isSegmentationValid && aCdr > 0 ? aCdr.toFixed(3) : 'Not available'}</strong></div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-slate-600 font-semibold">4. Model Statistical Score:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {isSegmentationValid && glaucoma?.glaucomaProbability != null ? `${(glaucoma.glaucomaProbability * 100).toFixed(1)}%` : 'Inhibited'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 space-y-0.5">
                    <span className="font-bold block text-[11px]">5. Clinical Notice:</span>
                    <p className="text-[10.5px] leading-relaxed text-amber-800">
                      AI screening results are decision support only and do not establish a confirmed diagnosis. Tonometry (IOP), central corneal thickness, and perimetry are required.
                    </p>
                  </div>
                </div>

                {glaucoma?.clinicalRecommendation && (
                  <p className="text-[11px] text-slate-600 italic bg-sky-50/50 p-2.5 rounded-lg border border-sky-100">
                    <strong className="font-semibold text-slate-800 not-italic">Clinical Recommendation: </strong>
                    {glaucoma.clinicalRecommendation}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FLOATING IN-VIEWER HUD: TOP-LEFT METADATA PILL */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none z-20">
        <span className="px-2.5 py-1 rounded-lg bg-slate-900/85 text-white text-[11px] font-bold border border-slate-700/80 backdrop-blur-xs flex items-center gap-1.5 shadow-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {mode === 'Original'
              ? 'Original Fundus Image'
              : mode === 'Optic Disc & Cup'
              ? 'Optic Disc & Cup (Attention U-Net)'
              : mode === 'Neuroretinal Rim'
              ? 'Neuroretinal Rim Evidence'
              : mode === 'Retinal Vessels'
              ? 'Retinal Microvasculature'
              : mode === 'Grad-CAM'
              ? 'Grad-CAM Saliency Overlay'
              : 'Clinical Evidence'}
          </span>
        </span>

        {patientName && (
          <span className="hidden sm:inline-block px-2.5 py-1 rounded-lg bg-slate-900/85 text-slate-300 text-[11px] border border-slate-700/80 backdrop-blur-xs">
            {patientName} {patientId ? `(${patientId})` : ''} • {eyeSide || 'Right Eye'}
          </span>
        )}
      </div>

      {/* FLOATING IN-VIEWER HUD: TOP-RIGHT ZOOM & FULLSCREEN CONTROLS */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoomScale >= 2.5}
          className="p-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-xs transition-colors cursor-pointer disabled:opacity-40"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoomScale <= 1.0}
          className="p-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-xs transition-colors cursor-pointer disabled:opacity-40"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {zoomScale > 1.0 && (
          <button
            type="button"
            onClick={handleZoomReset}
            className="px-2 py-1 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-sky-300 hover:text-white text-[10px] font-mono font-bold border border-slate-700/80 backdrop-blur-xs transition-colors cursor-pointer"
            title="Reset Zoom"
          >
            {zoomScale}x Reset
          </button>
        )}

        {onInspectFullscreen && (
          <button
            type="button"
            onClick={onInspectFullscreen}
            className="p-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-xs transition-colors cursor-pointer"
            title="Inspect Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* FLOATING IN-VIEWER HUD: BOTTOM STATUS BAR */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 z-20 pointer-events-none">
        {/* Left: Mode-Specific Legend */}
        <div className="pointer-events-auto">
          {mode === 'Optic Disc & Cup' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] font-mono border border-slate-700/90 backdrop-blur-xs shadow-md">
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
              <span>vCDR: <strong className="text-white">{isSegmentationValid && vCdr > 0 ? vCdr.toFixed(3) : '—'}</strong></span>
              <span className="text-slate-600">|</span>
              <span>Status: <strong className={isSegmentationValid ? 'text-emerald-400' : 'text-amber-400'}>{segmentationStatus}</strong></span>
            </div>
          )}

          {mode === 'Neuroretinal Rim' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] font-mono border border-slate-700/90 backdrop-blur-xs shadow-md">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                <span>Rim Tissue (Blue)</span>
              </span>
              <span className="text-slate-600">|</span>
              <span>Rim Area: <strong className="text-white">{isSegmentationValid && rimArea > 0 ? `${rimArea.toLocaleString()} px` : '—'}</strong></span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">ISNT Rule: Not Implemented</span>
            </div>
          )}

          {mode === 'Retinal Vessels' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] font-mono border border-slate-700/90 backdrop-blur-xs shadow-md">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>Vessels (Cyan)</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">Coverage: {vesselSegmentation?.density ? `${(vesselSegmentation.density * 100).toFixed(1)}%` : 'Delineated'}</span>
            </div>
          )}

          {mode === 'Grad-CAM' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 text-slate-200 text-[11px] border border-slate-700/90 backdrop-blur-xs shadow-md">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold">Model Attribution:</span>
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
        </div>

        {/* Right: Explanatory Disclaimer Pill */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900/85 text-slate-400 text-[10px] border border-slate-800 backdrop-blur-xs">
          <Info className="w-3 h-3 text-sky-400" />
          <span>Screening decision support • Object-fit: contain • 1:1 Canvas registration</span>
        </div>
      </div>
    </div>
  );
};
