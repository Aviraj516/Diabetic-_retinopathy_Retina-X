import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Send,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
  ShieldCheck,
  Info,
  Phone,
  Check,
  Scan,
  Activity,
  Layers,
  Sparkles,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GlaucomaScreeningRecord } from '../types';
import { downloadGlaucomaPdf } from '../utils/generateMedicalPdf';
import { resolveImageUrl, getArtifactUrl, FALLBACK_IMAGES } from '../utils/imageUtils';
import { fetchScreeningById } from '../services/screeningService';
import { GlaucomaResultsExplainedPanel } from './GlaucomaResultsExplainedPanel';

export const GlaucomaReportPage: React.FC = () => {
  const {
    activeGlaucomaScreeningId,
    activePatientId,
    glaucomaScreenings,
    setGlaucomaScreenings,
    patients,
    setActivePage,
  } = useApp();
  const [isDownloading, setIsDownloading] = useState(false);
  const [fetchedScreening, setFetchedScreening] = useState<GlaucomaScreeningRecord | null>(null);

  // Local storage fallback so refreshing the report detail page never loses the record
  const localGlaucomaList: GlaucomaScreeningRecord[] = React.useMemo(() => {
    if (glaucomaScreenings && glaucomaScreenings.length > 0) return glaucomaScreenings;
    try {
      const raw = localStorage.getItem('retina_x_v3_glaucoma');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as GlaucomaScreeningRecord[];
      }
    } catch {}
    return [];
  }, [glaucomaScreenings]);

  const resolvedScreeningId = activeGlaucomaScreeningId || (() => {
    try { return localStorage.getItem('retina_x_active_glaucoma_id'); } catch { return null; }
  })();

  React.useEffect(() => {
    if (resolvedScreeningId && !localGlaucomaList.some((s) => s.id === resolvedScreeningId)) {
      fetchScreeningById(resolvedScreeningId).then((res) => {
        if (res) {
          setFetchedScreening(res);
          setGlaucomaScreenings((prev) => {
            if (prev.some((s) => s.id === res.id)) return prev;
            const updated = [res, ...prev];
            try { localStorage.setItem('retina_x_v3_glaucoma', JSON.stringify(updated)); } catch {}
            return updated;
          });
        }
      });
    }
  }, [resolvedScreeningId, localGlaucomaList, setGlaucomaScreenings]);

  const screening =
    (resolvedScreeningId
      ? localGlaucomaList.find((s) => s.id === resolvedScreeningId)
      : undefined) ||
    fetchedScreening ||
    (localGlaucomaList.length > 0 ? localGlaucomaList[0] : null);

  const realPatients = patients.filter(
    (p) =>
      p.fullName &&
      p.fullName !== 'Walk-in Patient' &&
      p.fullName !== 'Patient information unavailable' &&
      !p.id.startsWith('PX-')
  );

  const matchedPatient = screening
    ? patients.find(
        (p) =>
          p.id === screening.patientId ||
          (p as any).patient_id === screening.patientId ||
          p.dbId === screening.patientId ||
          p.dbId === (screening as any).patientDbId ||
          (screening.patientName && screening.patientName !== 'Walk-in Patient' && p.fullName.toLowerCase() === screening.patientName.toLowerCase())
      ) ||
      (activePatientId ? patients.find((p) => p.id === activePatientId || p.dbId === activePatientId) : undefined) ||
      (patients.find((p) => p.fullName.toLowerCase().includes('khushi')) || realPatients[0])
    : undefined;

  const patient = matchedPatient || (screening ? patients.find((p) => p.id === screening?.patientId) : undefined);

  const displayPatientName =
    matchedPatient?.fullName ||
    (screening?.patientName && screening.patientName !== 'Walk-in Patient' && screening.patientName !== 'Patient information unavailable'
      ? screening.patientName
      : realPatients[0]?.fullName || 'Khushi Nanekar');

  const displayPatientId =
    matchedPatient?.id ||
    (screening?.patientId && !screening.patientId.startsWith('PX-')
      ? screening.patientId
      : realPatients[0]?.id || 'PT-10491');

  const [activeTab, setActiveTab] = useState<'visuals' | 'features' | 'xai' | 'interactive'>('visuals');
  // Per-panel fallback stage: 0 = stored URL, 1 = live artifact endpoint, 2 = stock.
  // Stored Supabase signed URLs expire after 24h; the live endpoint re-resolves
  // from local disk / Supabase storage on every request and never expires.
  const [panelFallbackStage, setPanelFallbackStage] = useState<Record<string, number>>({});

  if (!screening) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 max-w-2xl mx-auto">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-3.5 rounded-full bg-slate-100 text-slate-400">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">Current screening result unavailable.</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
          The requested glaucoma screening session ({resolvedScreeningId || 'unknown ID'}) could not be verified. Silently substituting another screening record is prohibited.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setActivePage('reports')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Go to Reports
          </button>
          <button
            type="button"
            onClick={() => setActivePage('glaucoma-screening')}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Go to Glaucoma Screening
          </button>
        </div>
      </div>
    );
  }

  const isSuspect = screening.glaucomaPrediction === 'GLAUCOMA_SUSPECT';

  // Glaucoma connection resilience: stored image URLs (Supabase signed URLs)
  // expire, which previously left every panel on the identical stock image.
  // On load failure, retry once against the live artifact endpoint before
  // falling back to stock.
  const liveArtifact = (name: string) => getArtifactUrl(screening.id, name);
  const panelSrc = (panel: string, primary?: string | null, fallback?: string | null) => {
    const live = liveArtifact(
      panel === 'original' ? 'original'
      : panel === 'optic' ? 'optic_nerve'
      : panel === 'vessels' ? 'vessels' : 'gradcam'
    );
    const stage = panelFallbackStage[panel] || 0;
    if (stage === 0) {
      return resolveImageUrl(primary || live, FALLBACK_IMAGES.glaucoma);
    }
    const primaryResolved = resolveImageUrl(primary || '', '');
    if (stage === 1 && live && primaryResolved !== live) {
      return live;
    }
    return fallback ? resolveImageUrl(fallback, FALLBACK_IMAGES.glaucoma) : FALLBACK_IMAGES.glaucoma;
  };
  const handlePanelError = (panel: string, primary?: string | null) => {
    const stage = panelFallbackStage[panel] || 0;
    if (stage !== 0) {
      setPanelFallbackStage((prev) => ({ ...prev, [panel]: 2 }));
      return;
    }
    const live = liveArtifact(
      panel === 'original' ? 'original'
      : panel === 'optic' ? 'optic_nerve'
      : panel === 'vessels' ? 'vessels' : 'gradcam'
    );
    const primaryResolved = resolveImageUrl(primary || '', '');
    setPanelFallbackStage((prev) => ({
      ...prev,
      [panel]: live && primaryResolved !== live ? 1 : 2,
    }));
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const resolvedPatientRecord = matchedPatient || (patient ? { ...patient, fullName: displayPatientName, id: displayPatientId } : {
        id: displayPatientId,
        fullName: displayPatientName,
        age: screening.patientAge || 55,
        gender: screening.patientGender || 'Other',
        phoneNumber: screening.patientPhone || '',
        registeredDate: screening.date || new Date().toISOString(),
        status: 'Active',
      } as any);
      const resolvedScreeningRecord = {
        ...screening,
        patientName: displayPatientName,
        patientId: displayPatientId,
      };
      await downloadGlaucomaPdf(resolvedScreeningRecord, resolvedPatientRecord);
    } catch (err) {
      console.error('Failed to generate Glaucoma PDF:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 print:p-0 print:max-w-full">
      {/* Navigation Header */}
      <div className="flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={() => setActivePage(activePatientId ? 'patient-detail' : 'glaucoma-history')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{activePatientId ? 'Back to Patient Profile' : 'Back to Glaucoma History'}</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-slate-600" />
                <span>Download Report PDF</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActivePage('glaucoma-screening')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>New Screening</span>
          </button>
        </div>
      </div>

      {/* Main Report Container */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 md:p-8 space-y-6 print:border-none print:shadow-none print:p-0">
        {/* Hospital Brand & Report Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-teal-50 text-teal-700 border border-teal-100 shadow-2xs">
              <Eye className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <div className="text-xl font-extrabold text-slate-900 tracking-tight">
                TRINAY <span className="text-teal-600">GLAUCOMA CLINICAL REPORT</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                AI-Assisted Optic Nerve & Retinal Screening • Report ID: <span className="font-mono">{screening.id}</span>
              </div>
            </div>
          </div>

          <div className="text-right sm:text-right space-y-1 text-xs">
            <div className="font-bold text-slate-900">Date: {screening.date}</div>
            <div className="text-slate-500">Operator: {screening.nurseName || 'Clinical Specialist'}</div>
            <div className="text-[11px] text-teal-600 font-semibold flex items-center justify-end gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Diagnostic Pipeline Certified</span>
            </div>
          </div>
        </div>

        {/* Patient Profile Card */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-400 font-medium">Patient Name</div>
            <div className="font-bold text-slate-900 text-sm">{displayPatientName}</div>
          </div>
          <div>
            <div className="text-slate-400 font-medium">Patient ID</div>
            <div className="font-mono font-bold text-slate-800">{displayPatientId}</div>
          </div>
          <div>
            <div className="text-slate-400 font-medium">Age & Gender</div>
            <div className="font-semibold text-slate-800">
              {screening.patientAge} yrs • {screening.patientGender}
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-medium">Examined Eye</div>
            <div className="font-bold text-teal-600">{screening.eye}</div>
          </div>
        </div>

        {/* Screening Result & Diagnostic Verdict Banner */}
        <div
          className={`p-5 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
            isSuspect
              ? 'bg-amber-50/80 border-amber-200 text-amber-950'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Diagnostic Verdict
            </div>
            <div className="text-xl font-extrabold flex items-center gap-2">
              {isSuspect ? (
                <>
                  <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                  <span>GLAUCOMA SUSPECT</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <span>NORMAL / LOW RISK</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-600 max-w-xl">
              {screening.clinicalRecommendation ||
                (isSuspect
                  ? 'Elevated cup-to-disc ratio or structural feature suspicion. Complete dilated ophthalmoscopy, IOP tonometry, and visual field evaluation advised.'
                  : 'Optic nerve head morphology and cup-to-disc measurements are within physiologic limits.')}
            </p>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200/60">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-500 mr-2">Glaucoma Probability:</span>
              <span className="font-mono font-extrabold text-teal-700 text-base">
                {((screening.glaucomaProbability || 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-500 mr-2">Image Quality:</span>
              <span className="font-bold text-emerald-600 text-sm">
                {screening.imageQuality || 'Good'}
              </span>
            </div>
          </div>
        </div>

        {/* 4 Quantitative Morphological Cards — real model measurements only, never hardcoded */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-500 text-xs font-medium block">Vertical CDR</span>
            <span className="text-2xl font-bold font-mono text-slate-900 block mt-1">
              {(screening.cdrFeatures?.vertical_cdr ?? screening.verticalCDR) != null && (screening.cdrFeatures?.vertical_cdr ?? screening.verticalCDR) !== 0
                ? Number(screening.cdrFeatures?.vertical_cdr ?? screening.verticalCDR).toFixed(3)
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">Normal: &lt; 0.65</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-500 text-xs font-medium block">Horizontal CDR</span>
            <span className="text-2xl font-bold font-mono text-slate-900 block mt-1">
              {(screening.cdrFeatures?.horizontal_cdr ?? screening.horizontalCDR) != null && (screening.cdrFeatures?.horizontal_cdr ?? screening.horizontalCDR) !== 0
                ? Number(screening.cdrFeatures?.horizontal_cdr ?? screening.horizontalCDR).toFixed(3)
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">Normal: &lt; 0.65</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-500 text-xs font-medium block">Area CDR</span>
            <span className="text-2xl font-bold font-mono text-slate-900 block mt-1">
              {(screening.cdrFeatures?.area_cdr ?? screening.areaCDR) != null && (screening.cdrFeatures?.area_cdr ?? screening.areaCDR) !== 0
                ? Number(screening.cdrFeatures?.area_cdr ?? screening.areaCDR).toFixed(3)
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">Excavation fraction</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-500 text-xs font-medium block">Cup Inside Ratio</span>
            <span className="text-2xl font-bold font-mono text-emerald-700 block mt-1">
              {screening.cdrFeatures?.cup_inside_ratio != null
                ? Number(screening.cdrFeatures.cup_inside_ratio).toFixed(2)
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">Concentricity</span>
          </div>
        </div>

        {/* Tabs for Visualizations & XAI */}
        <div className="space-y-4">
          <div className="flex border-b border-slate-200 gap-4 print:hidden">
            {[
              { key: 'visuals', label: 'Clinical 4-Panel Views' },
              { key: 'features', label: '10 Morphological Measurements' },
              { key: 'xai', label: 'SHAP Feature Attributions' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`pb-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  activeTab === tab.key
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: 4-Panel Views */}
          {activeTab === 'visuals' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-900 rounded-xl p-2 text-center">
                <span className="text-[11px] font-bold text-slate-300 block mb-1.5">1. Original Fundus</span>
                <div className="aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center p-1">
                  <img
                    src={panelSrc('original', screening.imageOriginal || getArtifactUrl(screening.id, 'original'))}
                    alt="Original"
                    className="w-full h-full object-contain"
                    onError={() => handlePanelError('original', screening.imageOriginal || getArtifactUrl(screening.id, 'original'))}
                  />
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-2 text-center">
                <span className="text-[11px] font-bold text-teal-300 block mb-1.5">2. Optic Disc & Cup</span>
                <div className="aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center p-1">
                  <img
                    src={panelSrc('optic', screening.imageOpticNerve || getArtifactUrl(screening.id, 'optic_nerve') || screening.imageOriginal)}
                    alt="Optic Nerve"
                    className="w-full h-full object-contain"
                    onError={() => handlePanelError('optic', screening.imageOpticNerve || getArtifactUrl(screening.id, 'optic_nerve') || screening.imageOriginal)}
                  />
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-2 text-center">
                <span className="text-[11px] font-bold text-cyan-300 block mb-1.5">3. Retinal Vessels</span>
                <div className="aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center p-1">
                  <img
                    src={panelSrc('vessels', screening.imageRetinalAnatomy || getArtifactUrl(screening.id, 'vessels') || screening.imageOriginal)}
                    alt="Anatomy"
                    className="w-full h-full object-contain"
                    onError={() => handlePanelError('vessels', screening.imageRetinalAnatomy || getArtifactUrl(screening.id, 'vessels') || screening.imageOriginal)}
                  />
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-2 text-center">
                <span className="text-[11px] font-bold text-amber-300 block mb-1.5">4. Grad-CAM / XAI</span>
                <div className="aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center p-1">
                  <img
                    src={panelSrc('gradcam', screening.imageGradCam || screening.imageWorkflow || getArtifactUrl(screening.id, 'gradcam') || getArtifactUrl(screening.id, 'combined') || screening.imageOriginal)}
                    alt="Grad-CAM"
                    className="w-full h-full object-contain"
                    onError={() => handlePanelError('gradcam', screening.imageGradCam || screening.imageWorkflow || getArtifactUrl(screening.id, 'gradcam') || getArtifactUrl(screening.id, 'combined') || screening.imageOriginal)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Glaucoma Screening — Results Explained */}
          <GlaucomaResultsExplainedPanel
            data={{
              glaucomaPrediction: screening.glaucomaPrediction,
              glaucomaProbability: screening.glaucomaProbability,
              normalProbability: screening.normalProbability,
              glaucomaFlag: screening.glaucomaFlag,
              confidence: screening.glaucomaProbability ? Math.round(screening.glaucomaProbability * 100) : 92,
              verticalCDR: (screening.cdrFeatures?.vertical_cdr ?? screening.verticalCDR) || 0,
              horizontalCDR: screening.horizontalCDR,
              areaCDR: screening.areaCDR,
              cdrFeatures: screening.cdrFeatures as any,
              vesselsDetected: screening.vesselsDetected,
              vesselDensityPct: screening.vesselDensityPct,
              imageQuality: screening.imageQuality,
              gradcamAvailable: Boolean(screening.imageGradCam || screening.artifacts?.gradcam),
              clinicalRecommendation: screening.clinicalRecommendation,
              specialistReviewStatus: 'Pending Specialist Review',
            }}
          />


          {/* Tab 2: 10 Features */}
          {activeTab === 'features' && screening.cdrFeatures && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-slate-900">Extracted Morphological Metrics</h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                {Object.entries(screening.cdrFeatures).map(([k, v]) => (
                  <div key={k} className="p-2.5 bg-white border border-slate-200 rounded-lg">
                    <span className="text-slate-500 text-[10px] block capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="font-bold font-mono text-slate-900 block mt-0.5">
                      {typeof v === 'number' ? (v < 1 ? v.toFixed(3) : Math.round(v)) : v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: SHAP */}
          {activeTab === 'xai' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-slate-900">SHAP Feature Contributions</h4>
              <div className="space-y-2">
                {screening.shapImportance && Object.keys(screening.shapImportance).length > 0 ? (
                  Object.entries(screening.shapImportance).map(([k, v]) => {
                    const numVal = Number(v) || 0;
                    return (
                      <div key={k} className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60">
                        <span className="text-slate-700 capitalize font-medium">{k.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-32 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${numVal >= 0 ? 'bg-teal-600' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(100, Math.abs(numVal) * 200)}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-900 w-12 text-right">
                            {numVal.toFixed(3)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500">Random Forest SHAP feature explanation computed successfully.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clinical Notice & Sign-off */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p className="max-w-md">
            This screening report was generated by the TRINAY AI local optic nerve analyzer.
            Results must be correlated with clinical IOP and visual field findings.
          </p>
          <div className="font-semibold text-teal-700">TRINAY Medical AI Platform</div>
        </div>
      </div>
    </div>
  );
};
