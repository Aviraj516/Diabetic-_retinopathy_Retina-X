import React, { useState, useEffect } from 'react';
import { XaiTab } from '../data/retinaImages';
export type { XaiTab };

interface FundusRetinaCanvasProps {
  mode?: XaiTab;
  heatmapOpacity?: number; // 0–100
  opacity?: number;        // alias for heatmapOpacity
  showAlignmentGuides?: boolean;
  className?: string;
  interactive?: boolean;
  // Real base64 PNG images from the ML server (no "data:image/png;base64," prefix needed — we add it)
  imageOriginal?: string;   // canonical fundus
  imageGradCam?: string;    // combined XAI heatmap overlay
  imageLesions?: string;    // lesion overlay
  imageAnatomy?: string;    // anatomy overlay
  imageCombined?: string;   // combined anatomy+lesion overlay
  imageDebugAnatomy?: string; // 4-panel diagnostic anatomy visualization (OD, Fovea, Macula, Combined)
  highlightLesion?: 'MA' | 'HE' | 'EX' | 'SE' | null;
  onInspectFullscreen?: () => void;
}

const b64Url = (b64: string) =>
  b64.startsWith('data:') || b64.startsWith('http') || b64.startsWith('/') || b64.startsWith('blob:')
    ? b64
    : `data:image/png;base64,${b64}`;

export const FundusRetinaCanvas: React.FC<FundusRetinaCanvasProps> = ({
  mode = 'Original',
  heatmapOpacity,
  opacity: opacityProp,
  showAlignmentGuides = false,
  className = '',
  imageOriginal,
  imageGradCam,
  imageLesions,
  imageAnatomy,
  imageCombined,
  imageDebugAnatomy,
  highlightLesion,
  onInspectFullscreen,
}) => {
  const [hasImgError, setHasImgError] = useState(false);
  const [showDiagnosticGrid, setShowDiagnosticGrid] = useState(false);
  const effectiveOpacity = heatmapOpacity ?? opacityProp ?? 70;

  // Resolve which image to show for the selected mode
  const resolveImage = (): string | null => {
    switch (mode) {
      case 'Original':
        return imageOriginal ? b64Url(imageOriginal) : null;
      case 'Grad-CAM++':
        return imageGradCam ? b64Url(imageGradCam) : (imageOriginal ? b64Url(imageOriginal) : null);
      case 'Lesions':
        return imageLesions ? b64Url(imageLesions) : (imageOriginal ? b64Url(imageOriginal) : null);
      case 'Anatomy':
        if (showDiagnosticGrid && imageDebugAnatomy) {
          return b64Url(imageDebugAnatomy);
        }
        return imageAnatomy ? b64Url(imageAnatomy) : (imageOriginal ? b64Url(imageOriginal) : null);
      case 'Combined':
        return imageCombined ? b64Url(imageCombined) : (imageOriginal ? b64Url(imageOriginal) : null);
      default:
        return imageOriginal ? b64Url(imageOriginal) : null;
    }
  };

  const imgSrc = resolveImage();

  useEffect(() => {
    setHasImgError(false);
  }, [imgSrc, mode, showDiagnosticGrid]);

  // If we have real ML images and no load error, show them directly
  if (imgSrc && !hasImgError) {
    const isHeatmapMode = mode === 'Grad-CAM++';
    const opacity = isHeatmapMode ? effectiveOpacity / 100 : 1.0;
    const needsBaseUnderlay = isHeatmapMode && !!imageOriginal && !!imageGradCam;

    return (
      <div className={`relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-black select-none ${className}`}>
        {/* Base original image shown under XAI heatmap so slider cross-fades smoothly with identical geometry */}
        {needsBaseUnderlay && (
          <img
            src={b64Url(imageOriginal!)}
            alt="Fundus base"
            className="w-full h-full block max-w-full max-h-full"
            style={{ objectFit: 'contain' }}
            draggable={false}
            onError={() => setHasImgError(true)}
          />
        )}

        {/* Primary image — real ML generated visualization */}
        <img
          src={imgSrc}
          alt={`Fundus ${mode}`}
          className="w-full h-full block max-w-full max-h-full"
          style={{
            objectFit: 'contain',
            position: needsBaseUnderlay ? 'absolute' : 'relative',
            inset: needsBaseUnderlay ? 0 : undefined,
            opacity: needsBaseUnderlay ? opacity : 1,
          }}
          draggable={false}
          onError={() => setHasImgError(true)}
        />

        {showAlignmentGuides && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg viewBox="0 0 500 500" className="w-full h-full absolute inset-0" xmlns="http://www.w3.org/2000/svg">
              <circle cx="250" cy="250" r="215" fill="none" stroke="#0284C7" strokeWidth="2" strokeDasharray="8 6" opacity="0.8" />
              <line x1="250" y1="220" x2="250" y2="240" stroke="#0284C7" strokeWidth="2" />
              <line x1="250" y1="260" x2="250" y2="280" stroke="#0284C7" strokeWidth="2" />
              <line x1="220" y1="250" x2="240" y2="250" stroke="#0284C7" strokeWidth="2" />
              <line x1="260" y1="250" x2="280" y2="250" stroke="#0284C7" strokeWidth="2" />
              <circle cx="250" cy="250" r="14" fill="none" stroke="#0284C7" strokeWidth="1.5" />
              <path d="M 120 140 L 100 140 L 100 160" fill="none" stroke="#0284C7" strokeWidth="3" />
              <path d="M 380 140 L 400 140 L 400 160" fill="none" stroke="#0284C7" strokeWidth="3" />
              <path d="M 100 340 L 100 360 L 120 360" fill="none" stroke="#0284C7" strokeWidth="3" />
              <path d="M 400 340 L 400 360 L 380 360" fill="none" stroke="#0284C7" strokeWidth="3" />
            </svg>
          </div>
        )}

        {/* Mode badge & highlight indicator */}
        <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
          {mode === 'Anatomy' && imageDebugAnatomy && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDiagnosticGrid(!showDiagnosticGrid);
              }}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-slate-900/90 text-sky-300 hover:text-white border border-sky-500/50 backdrop-blur-xs transition-colors cursor-pointer pointer-events-auto shadow-xs"
            >
              {showDiagnosticGrid ? 'Unified Anatomy' : '4-Panel Diagnostic'}
            </button>
          )}
          {onInspectFullscreen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInspectFullscreen();
              }}
              className="p-1.5 rounded-md bg-slate-900/80 text-slate-300 hover:text-white border border-slate-600/50 backdrop-blur-xs transition-colors cursor-pointer pointer-events-auto shadow-xs"
              title="Fullscreen Inspection"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          )}
          {highlightLesion && (
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-amber-500 text-white shadow-xs animate-pulse border border-amber-300">
              Focus: {highlightLesion}
            </span>
          )}
          {mode === 'Grad-CAM++' && (
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#0284C7]/90 text-white shadow-xs backdrop-blur-xs border border-sky-400/30">
              XAI Heatmap {heatmapOpacity}%
            </span>
          )}
          {mode === 'Lesions' && (
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-rose-600/90 text-white shadow-xs backdrop-blur-xs border border-rose-400/30">
              Lesion Overlay
            </span>
          )}
          {mode === 'Anatomy' && (
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-teal-600/90 text-white shadow-xs backdrop-blur-xs border border-teal-400/30">
              {showDiagnosticGrid ? '4-Panel Diagnostic' : 'Anatomy Overlay'}
            </span>
          )}
          {mode === 'Combined' && (
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-indigo-600/90 text-white shadow-xs backdrop-blur-xs border border-indigo-400/30">
              Combined Overlay
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- Fallback: placeholder SVG (shown before any image is uploaded / while loading) ----
  return (
    <div className={`relative aspect-square w-full max-w-[480px] mx-auto overflow-hidden rounded-xl bg-black select-none ${className}`}>
      <svg viewBox="0 0 500 500" className="w-full h-full block" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="fundusBg" cx="48%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#C95B2A" />
            <stop offset="45%"  stopColor="#A84018" />
            <stop offset="75%"  stopColor="#7E240B" />
            <stop offset="92%"  stopColor="#4A1005" />
            <stop offset="100%" stopColor="#1E0502" />
          </radialGradient>
          <radialGradient id="opticDiscGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FFF2D6" />
            <stop offset="40%"  stopColor="#FED7AA" />
            <stop offset="70%"  stopColor="#FDBA74" />
            <stop offset="100%" stopColor="#EA580C" />
          </radialGradient>
          <radialGradient id="maculaGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#3E1108" />
            <stop offset="50%"  stopColor="#5B1D0E" />
            <stop offset="85%"  stopColor="#802812" />
            <stop offset="100%" stopColor="#A84018" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vignette" cx="50%" cy="50%" r="50%">
            <stop offset="82%"  stopColor="#000000" stopOpacity="0" />
            <stop offset="96%"  stopColor="#000000" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.98" />
          </radialGradient>
          <radialGradient id="gradcamHeatmap" cx="58%" cy="52%" r="45%">
            <stop offset="0%"   stopColor="#EF4444" stopOpacity="0.85" />
            <stop offset="25%"  stopColor="#F97316" stopOpacity="0.75" />
            <stop offset="50%"  stopColor="#FBBF24" stopOpacity="0.60" />
            <stop offset="70%"  stopColor="#22C55E" stopOpacity="0.40" />
            <stop offset="88%"  stopColor="#06B6D4" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.00" />
          </radialGradient>
        </defs>

        {/* Base fundus */}
        <circle cx="250" cy="250" r="235" fill="url(#fundusBg)" />

        {/* Optic disc */}
        <ellipse cx="145" cy="245" rx="28" ry="32" fill="url(#opticDiscGrad)" />
        <ellipse cx="143" cy="245" rx="14" ry="16" fill="#FFFBEB" opacity="0.85" />

        {/* Macula & fovea */}
        <circle cx="300" cy="260" r="45" fill="url(#maculaGrad)" />
        <circle cx="300" cy="260" r="8"  fill="#2E0A05" opacity="0.8" />
        <circle cx="299" cy="259" r="2"  fill="#FBBF24" opacity="0.6" />

        {/* Vessels */}
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M 145 235 C 150 180 190 130 255 115 C 310 102 360 120 405 155" fill="none" stroke="#500707" strokeWidth="5.5" opacity="0.85" />
          <path d="M 148 238 C 155 190 195 145 250 130 C 300 118 350 132 395 168" fill="none" stroke="#831818" strokeWidth="3.2" opacity="0.9" />
          <path d="M 145 255 C 152 305 190 355 255 375 C 320 392 375 370 415 330" fill="none" stroke="#500707" strokeWidth="5.5" opacity="0.85" />
          <path d="M 148 252 C 158 295 198 340 250 358 C 305 372 360 355 405 318" fill="none" stroke="#831818" strokeWidth="3.2" opacity="0.9" />
          <path d="M 140 235 C 120 185 85 150 45 135"  fill="none" stroke="#630D0D" strokeWidth="3.5" opacity="0.8" />
          <path d="M 140 255 C 115 305 80 345 45 365"  fill="none" stroke="#630D0D" strokeWidth="3.5" opacity="0.8" />
        </g>

        {/* Real Grad-CAM++ Attention Layer */}
        {(mode === 'Grad-CAM++' || mode === 'Combined') && (
          <circle cx="290" cy="255" r="165" fill="url(#gradcamHeatmap)" opacity={effectiveOpacity / 100} />
        )}

        {/* Vignette */}
        <circle cx="250" cy="250" r="235" fill="url(#vignette)" pointerEvents="none" />

        {/* Alignment guides (camera viewfinder) */}
        {showAlignmentGuides && (
          <g stroke="#0284C7" strokeWidth="2" opacity="0.85">
            <circle cx="250" cy="250" r="215" fill="none" strokeDasharray="8 6" />
            <line x1="250" y1="220" x2="250" y2="240" />
            <line x1="250" y1="260" x2="250" y2="280" />
            <line x1="220" y1="250" x2="240" y2="250" />
            <line x1="260" y1="250" x2="280" y2="250" />
            <circle cx="250" cy="250" r="14" fill="none" strokeWidth="1.5" />
            <path d="M 120 140 L 100 140 L 100 160" fill="none" strokeWidth="3" />
            <path d="M 380 140 L 400 140 L 400 160" fill="none" strokeWidth="3" />
            <path d="M 100 340 L 100 360 L 120 360" fill="none" strokeWidth="3" />
            <path d="M 400 340 L 400 360 L 380 360" fill="none" strokeWidth="3" />
          </g>
        )}
      </svg>

      {/* Upload placeholder text */}
      {showAlignmentGuides && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] text-slate-400 font-medium">Upload an image to analyse</span>
        </div>
      )}
    </div>
  );
};
