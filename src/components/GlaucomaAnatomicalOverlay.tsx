import React from 'react';

export interface GlaucomaAnatomicalOverlayProps {
  mode: 'Optic Disc & Cup' | 'Neuroretinal Rim' | 'OCT / RNFL Assessment';
  discPath?: string;
  cupPath?: string;
  discX: number;
  discY: number;
  discW: number;
  discH: number;
  cupX: number;
  cupY: number;
  cupW: number;
  cupH: number;
  vCdr: number;
  hCdr: number;
  aCdr: number;
  rimArea: number;
  isSegmentationValid: boolean;
  segmentationStatus?: string;
  glaucomaFlag?: boolean;
  eyeSide?: string;
}

interface LeaderLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  title: string;
  subtitle?: string;
  align?: 'left' | 'right' | 'center';
  color?: string;
}

const ClinicalLeaderLine: React.FC<LeaderLineProps> = ({
  x1,
  y1,
  x2,
  y2,
  title,
  subtitle,
  align = 'left',
  color = '#FFFFFF',
}) => {
  // Boundary-aware clamping strictly within 512x512 canonical view
  const clampedX2 = align === 'left' ? Math.max(18, Math.min(200, x2)) : Math.min(494, Math.max(312, x2));
  const clampedY2 = Math.min(480, Math.max(28, y2));
  const textAnchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
  const textOffset = align === 'right' ? -6 : align === 'center' ? 0 : 6;
  const shelfLength = 110;
  const shelfX2 = align === 'right' ? clampedX2 - shelfLength : clampedX2 + shelfLength;

  return (
    <g className="transition-opacity duration-200">
      {/* Anchor dot with high-contrast ring */}
      <circle cx={x1} cy={y1} r="4.5" fill={color} stroke="#030712" strokeWidth="1.5" />
      <circle cx={x1} cy={y1} r="7" fill={color} opacity="0.25" />

      {/* Stepped medical leader line to label shelf */}
      <line
        x1={x1}
        y1={y1}
        x2={clampedX2}
        y2={clampedY2}
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.9"
      />
      <line
        x1={clampedX2}
        y1={clampedY2}
        x2={shelfX2}
        y2={clampedY2}
        stroke={color}
        strokeWidth="1"
        opacity="0.4"
      />

      {/* Main label with dark halo for legible contrast */}
      <text
        x={clampedX2 + textOffset}
        y={clampedY2 - 3}
        fill={color}
        fontSize="11"
        fontWeight="700"
        textAnchor={textAnchor}
        style={{
          filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.98)) drop-shadow(0 0 6px rgba(0,0,0,0.9))',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        {title}
      </text>

      {/* Subtitle / Telemetry */}
      {subtitle && (
        <text
          x={clampedX2 + textOffset}
          y={clampedY2 + 12}
          fill="rgba(241, 245, 249, 0.92)"
          fontSize="9.5"
          fontWeight="500"
          textAnchor={textAnchor}
          style={{
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.98))',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          {subtitle}
        </text>
      )}
    </g>
  );
};

export const GlaucomaAnatomicalOverlay: React.FC<GlaucomaAnatomicalOverlayProps> = ({
  mode,
  discPath,
  cupPath,
  discX,
  discY,
  discW,
  discH,
  cupX,
  cupY,
  cupW,
  cupH,
  vCdr,
  hCdr,
  aCdr,
  rimArea,
  isSegmentationValid,
  glaucomaFlag,
  eyeSide = 'Right Eye',
}) => {
  if (!isSegmentationValid) {
    return null;
  }

  const discCx = discX + discW / 2;
  const discCy = discY + discH / 2;
  const cupCx = cupX + cupW / 2;
  const cupCy = cupY + cupH / 2;

  // Determine whether disc is on the right side (OD) or left side (OS)
  const isDiscOnRight = discCx > 256;

  // Correct textAnchor direction:
  // If disc is on right, label is on left -> text must anchor at left (start) and read rightward
  // If disc is on left, label is on right -> text must anchor at right (end) and read leftward
  const mainAlign: 'left' | 'right' = isDiscOnRight ? 'left' : 'right';
  const openSideSign = isDiscOnRight ? -1 : 1;

  // Safe anchor shelf positions
  const farOpenX = isDiscOnRight
    ? Math.max(22, Math.min(180, discX - 40))
    : Math.min(490, Math.max(320, discX + discW + 40));

  const isElevated = vCdr >= 0.58 || glaucomaFlag;

  return (
    <svg
      viewBox="0 0 512 512"
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      preserveAspectRatio="none"
    >
      {/* ============================================================== */}
      {/* 1. OPTIC DISC & CUP SEGMENTATION — ESSENTIAL                   */}
      {/* ============================================================== */}
      {mode === 'Optic Disc & Cup' && (
        <g>
          {/* A. Outer Optic Disc Boundary (Green #22C55E) */}
          {discPath ? (
            <path
              d={discPath}
              fill="rgba(34, 197, 94, 0.08)"
              stroke="#22C55E"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          ) : null}

          {/* B. Inner Optic Cup Boundary (Magenta #EC4899) */}
          {cupPath ? (
            <path
              d={cupPath}
              fill="rgba(236, 72, 153, 0.14)"
              stroke="#EC4899"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          ) : null}

          {/* C. Vertical Caliper Measurement Axis (Dashed lines with end ticks) */}
          {/* Disc Caliper Axis (Green) */}
          <line
            x1={discCx}
            y1={discY}
            x2={discCx}
            y2={discY + discH}
            stroke="#22C55E"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.85"
          />
          <line x1={discCx - 6} y1={discY} x2={discCx + 6} y2={discY} stroke="#22C55E" strokeWidth="1.5" />
          <line x1={discCx - 6} y1={discY + discH} x2={discCx + 6} y2={discY + discH} stroke="#22C55E" strokeWidth="1.5" />

          {/* Cup Caliper Axis (Magenta) */}
          <line
            x1={cupCx}
            y1={cupY}
            x2={cupCx}
            y2={cupY + cupH}
            stroke="#EC4899"
            strokeWidth="2"
            opacity="0.95"
          />
          <line x1={cupCx - 5} y1={cupY} x2={cupCx + 5} y2={cupY} stroke="#EC4899" strokeWidth="2" />
          <line x1={cupCx - 5} y1={cupY + cupH} x2={cupCx + 5} y2={cupY + cupH} stroke="#EC4899" strokeWidth="2" />

          {/* Centers */}
          <circle cx={discCx} cy={discCy} r="3" fill="#22C55E" stroke="#000" strokeWidth="1" />
          <circle cx={cupCx} cy={cupCy} r="3" fill="#EC4899" stroke="#000" strokeWidth="1" />

          {/* D. Clean Boundary-Aware Medical Leader Callouts */}
          <ClinicalLeaderLine
            x1={discCx + (isDiscOnRight ? -discW * 0.45 : discW * 0.45)}
            y1={discCy - discH * 0.35}
            x2={farOpenX}
            y2={Math.max(40, discCy - discH * 0.5 - 20)}
            title="Optic Disc Boundary"
            subtitle={`Vertical Height: ${discH} px • Width: ${discW} px`}
            align={mainAlign}
            color="#22C55E"
          />

          <ClinicalLeaderLine
            x1={cupCx + (isDiscOnRight ? -cupW * 0.45 : cupW * 0.45)}
            y1={cupCy + cupH * 0.35}
            x2={farOpenX}
            y2={Math.min(465, discCy + discH * 0.5 + 25)}
            title="Optic Cup Margin"
            subtitle={`Vertical Height: ${cupH} px • vCDR: ${vCdr.toFixed(3)}`}
            align={mainAlign}
            color="#EC4899"
          />
        </g>
      )}

      {/* ============================================================== */}
      {/* 2. NEURORETINAL RIM ANALYSIS — CLINICAL EVIDENCE              */}
      {/* ============================================================== */}
      {mode === 'Neuroretinal Rim' && (
        <g>
          {/* A. Annular Neuroretinal Rim Tissue Fill (Even-Odd rule) */}
          {discPath && cupPath ? (
            <>
              <path
                d={`${discPath} ${cupPath}`}
                fillRule="evenodd"
                fill="rgba(56, 189, 248, 0.26)"
                stroke="#38BDF8"
                strokeWidth="1.6"
                strokeDasharray="4 2"
              />
              {/* Outer disc in green dashed */}
              <path d={discPath} fill="none" stroke="#22C55E" strokeWidth="2" strokeDasharray="5 3" />
              {/* Inner cup in magenta dashed */}
              <path d={cupPath} fill="none" stroke="#EC4899" strokeWidth="2" strokeDasharray="5 3" />
            </>
          ) : null}

          {/* B. Verified Structural Measurements & Annotations Only */}
          {/* 1. Optic Cup Excavation */}
          <ClinicalLeaderLine
            x1={cupCx}
            y1={cupCy}
            x2={farOpenX}
            y2={Math.max(40, discCy - discH * 0.5 - 35)}
            title="Optic Cup Excavation"
            subtitle={`Excavation Fraction (Area CDR): ${aCdr > 0 ? (aCdr * 100).toFixed(1) + '%' : 'Calculated'}`}
            align={mainAlign}
            color="#FFFFFF"
          />

          {/* 2. Neuroretinal Rim Band */}
          <ClinicalLeaderLine
            x1={discCx + openSideSign * (discW * 0.42)}
            y1={discCy}
            x2={farOpenX}
            y2={discCy}
            title="Neuroretinal Rim Tissue"
            subtitle={rimArea > 0 ? `Annular Area: ${rimArea.toLocaleString()} px` : 'Delineated'}
            align={mainAlign}
            color="#38BDF8"
          />

          {/* 3. Explicit Clinical Notice on ISNT / Focal Thinning */}
          <ClinicalLeaderLine
            x1={discCx + openSideSign * (discW * 0.2)}
            y1={discY + discH - 3}
            x2={farOpenX}
            y2={Math.min(475, discY + discH + 30)}
            title="ISNT / Focal Thinning"
            subtitle="Requires stereoscopic biomicroscopy or OCT scan"
            align={mainAlign}
            color="#94A3B8"
          />

        </g>
      )}

      {/* ============================================================== */}
      {/* 3. OCT / RNFL ASSESSMENT — FUNDUS SCREENING (NO FAKE TELEMETRY) */}
      {/* ============================================================== */}
      {mode === 'OCT / RNFL Assessment' && (
        <g>
          {/* Outline disc and cup boundaries lightly for orientation */}
          {discPath ? (
            <path d={discPath} fill="none" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
          ) : null}
          {cupPath ? (
            <path d={cupPath} fill="none" stroke="#EC4899" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
          ) : null}
        </g>
      )}
    </svg>
  );
};

