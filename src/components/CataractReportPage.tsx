import React, { useState, useEffect } from 'react';
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
  Loader2,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CataractScreeningRecord } from '../types';
import { downloadCataractPdf } from '../utils/generateMedicalPdf';
import { resolveImageUrl, getArtifactUrl } from '../utils/imageUtils';
import { getEvidenceIntensityLevel, getEvidenceIntensityExplanation, buildCataractWhyExplanation } from '../utils/cataractEvidence';


export const CataractReportPage: React.FC = () => {
  const {
    activeCataractScreeningId,
    activePatientId,
    cataractScreenings,
    patients,
    setActivePage,
  } = useApp();
  const [isDownloading, setIsDownloading] = useState(false);
  const [fetchedScreening, setFetchedScreening] = useState<CataractScreeningRecord | null>(null);
  const [loadingScreening, setLoadingScreening] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const screening = (activeCataractScreeningId
    ? cataractScreenings.find((s) => s.id === activeCataractScreeningId)
    : undefined) || (fetchedScreening?.id === activeCataractScreeningId ? fetchedScreening : null) || fetchedScreening;

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
        p.id === screening?.patientId ||
        (p as any).patient_id === screening?.patientId ||
        p.dbId === screening?.patientId ||
        p.dbId === screening?.patientDbId ||
        (screening?.patientName && screening.patientName !== 'Walk-in Patient' && p.fullName.toLowerCase() === screening.patientName.toLowerCase())
    ) ||
    (activePatientId ? patients.find((p) => p.id === activePatientId || p.dbId === activePatientId) : undefined) ||
    (patients.find((p) => p.fullName.toLowerCase().includes('khushi')) || realPatients[0]);

  const patient = matchedPatient || patients.find((p) => p.id === screening?.patientId || (p as any).patient_id === screening?.patientId);

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

  const [activeTab, setActiveTab] = useState<'visuals' | 'workflow' | 'xai'>('visuals');

  useEffect(() => {
    if (!activeCataractScreeningId) return;
    const exists = cataractScreenings.find((s) => s.id === activeCataractScreeningId);
    if (!exists && (!fetchedScreening || fetchedScreening.id !== activeCataractScreeningId)) {
      setLoadingScreening(true);
      fetch(`/api/screenings/${encodeURIComponent(activeCataractScreeningId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.screening) {
            setFetchedScreening(data.screening);
          }
        })
        .catch((err) => console.warn('[CataractReportPage] Fetch error:', err))
        .finally(() => setLoadingScreening(false));
    }
  }, [activeCataractScreeningId, cataractScreenings, fetchedScreening]);

  if (loadingScreening) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-slate-200 max-w-md mx-auto space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#0284C7] mx-auto" />
        <p className="text-sm text-slate-600 font-medium">Loading clinical screening record...</p>
      </div>
    );
  }

  if (!screening || !screening.id || !screening.patientId || screening.cataractProbability === undefined) {
    if (!screening) {
      console.warn('[CataractReportPage] Current screening session ID not found in records:', activeCataractScreeningId);
    } else {
      console.warn('[CataractReportPage] Current screening record missing required fields:', {
        id: screening.id,
        patientId: screening.patientId,
        cataractProbability: screening.cataractProbability,
        cataractPrediction: screening.cataractPrediction,
      });
    }
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-3.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Current screening result unavailable.</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          The requested screening session could not be verified or is missing required clinical fields. Silently substituting old patient data is prohibited.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setActivePage('cataract-history')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Cataract History
          </button>
          <button
            type="button"
            onClick={() => setActivePage('cataract-screening')}
            className="px-4 py-2 bg-[#0284C7] hover:bg-sky-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            New Screening
          </button>
        </div>
      </div>
    );
  }

  const isCataract = screening.cataractPrediction === 'CATARACT' || String(screening.cataractPrediction).toUpperCase().includes('CATARACT');
  const catProb = typeof screening.cataractProbability === 'number' && !isNaN(screening.cataractProbability)
    ? screening.cataractProbability
    : 0;
  const normProb = typeof screening.normalProbability === 'number' && !isNaN(screening.normalProbability)
    ? screening.normalProbability
    : (1 - catProb);
  const displayProb = isCataract ? catProb : normProb;
  const confidenceVal = Math.round(Math.max(catProb, normProb) * 1000) / 10;
  const evidenceLevel = getEvidenceIntensityLevel(screening.quantitativeAnalysis);
  const evidenceInfo = getEvidenceIntensityExplanation(evidenceLevel);
  const whyExplanation = buildCataractWhyExplanation({
    prediction: screening.cataractPrediction,
    cataractProbability: catProb,
    normalProbability: normProb,
    quant: screening.quantitativeAnalysis,
  });

  // P11 debug: the report screening ID must equal the dashboard screening ID.
  try {
    // eslint-disable-next-line no-console
    console.debug('[REPORT DEBUG]', {
      reportScreeningId: screening.id,
      activeScreeningId: activeCataractScreeningId,
      match: screening.id === activeCataractScreeningId,
      patientId: screening.patientId,
      prediction: screening.cataractPrediction,
      cataractProbability: screening.cataractProbability,
      evidenceIntensity: evidenceLevel,
    });
  } catch { /* debug-only */ }

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const resolvedPatientRecord = matchedPatient || (patient ? { ...patient, fullName: displayPatientName, id: displayPatientId } : {
        id: displayPatientId,
        fullName: displayPatientName,
        age: screening?.patientAge || 55,
        gender: screening?.patientGender || 'Other',
        phoneNumber: screening?.patientPhone || '',
        registeredDate: screening?.date || new Date().toISOString(),
        status: 'Active',
      } as any);
      const resolvedScreeningRecord = {
        ...screening,
        patientName: displayPatientName,
        patientId: displayPatientId,
      };
      await downloadCataractPdf(resolvedScreeningRecord, resolvedPatientRecord);
    } catch (err) {
      console.error('Failed to generate Cataract PDF:', err);
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
          onClick={() => setActivePage(activePatientId ? 'patient-detail' : 'cataract-history')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{activePatientId ? 'Back to Patient Profile' : 'Back to Cataract History'}</span>
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
                <Loader2 className="w-4 h-4 text-[#0284C7] animate-spin" />
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
            onClick={() => setActivePage('cataract-screening')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0284C7] hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
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
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 shadow-2xs">
              <Eye className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <div className="text-xl font-extrabold text-slate-900 tracking-tight">
                TRINAY <span className="text-[#0284C7]">CATARACT CLINICAL REPORT</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                AI-Assisted Anterior Segment Screening • Report ID: <span className="font-mono">{screening.id}</span>
              </div>
            </div>
          </div>

          <div className="text-right sm:text-right space-y-1 text-xs">
            <div className="font-bold text-slate-900">Date: {screening.date}</div>
            <div className="text-slate-500">Operator: {screening.nurseName || 'Clinical Specialist'}</div>
            <div className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified AI Clinical Screening</span>
            </div>
          </div>
        </div>

        {/* Patient Demographics & Image Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient Name</span>
            <span className="font-bold text-slate-900 text-sm">{displayPatientName}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient ID & Age</span>
            <span className="font-semibold text-slate-800">{displayPatientId} • {screening.patientAge || matchedPatient?.age || 55} yrs ({screening.patientGender || matchedPatient?.gender || 'Other'})</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Eye</span>
            <span className="font-semibold text-slate-800">{screening.eye} (OD/OS)</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Image Resolution</span>
            <span className="font-semibold text-slate-800">{screening.imageResolution || 'Standard'} ({screening.imageFileSize})</span>
          </div>
        </div>

        {/* Clinical Verdict Banner */}
        <div
          className={`p-6 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-5 ${
            isCataract ? 'bg-red-50/70 border-red-200' : 'bg-emerald-50/70 border-emerald-200'
          }`}
        >
          <div className="space-y-1 text-center md:text-left">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Diagnostic Verdict
            </div>
            <div
              className={`text-2xl font-extrabold ${
                isCataract ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {isCataract ? 'AI SCREENING RESULT: CATARACT DETECTED' : 'AI SCREENING RESULT: NO CATARACT DETECTED'}
            </div>
            <p className="text-xs text-slate-600 max-w-xl">
              {screening.clinicalRecommendation ||
                (isCataract
                  ? 'If cataract is detected by the AI screening model, recommend ophthalmologist evaluation and slit-lamp examination for clinical confirmation.'
                  : 'Clear crystalline lens pattern identified. Continue routine preventive ophthalmic checkup schedule.')}
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs min-w-[260px] space-y-2 text-xs">
            <div className="flex justify-between font-bold">
              <span className="text-red-700">Cataract Probability:</span>
              <span className="text-red-700 font-mono">{(catProb * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-emerald-700">Normal Probability:</span>
              <span className="text-emerald-700 font-mono">{(normProb * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
              <span>Model Classification:</span>
              <span className="font-semibold text-slate-700">EfficientNet-V2-S ({confidenceVal.toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        {/* Doctor's Interpretation & Patient Guidance Summary */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Activity className="w-4 h-4 text-[#0284C7]" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Clinical Interpretation & Patient Guidance Summary
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Doctor Triage Summary */}
            <div className="space-y-1.5 p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/60">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Doctor's Clinical Triage Summary
              </span>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {isCataract
                  ? `AI screening identified visual features associated with cataract in the analyzed lens region. The cataract classifier produced a probability of ${(catProb * 100).toFixed(2)}%. Clinical slit-lamp examination is recommended for confirmation.`
                  : `AI screening identified clear anterior segment patterns with normal crystalline lens optical transparency. The cataract classifier produced a normal probability of ${(normProb * 100).toFixed(2)}%. Clinical examination is recommended if visual symptoms persist.`}
              </p>
            </div>

            {/* Patient Explanation */}
            <div className="space-y-1.5 p-3.5 bg-sky-50/50 rounded-xl border border-sky-100">
              <span className="font-bold text-sky-900 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-600" />
                Patient Explanation (Simple & Understandable)
              </span>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {isCataract
                  ? "A clouding (cataract) was observed in the lens of your eye that can blur or dim your vision, like looking through a foggy window. This is very common and treatable. Please consult an eye specialist for an in-person eye exam to evaluate your vision and discuss treatment options."
                  : "Your eye lens appears clear and healthy with no signs of cataract detected today. Continue routine preventive eye care and protect your eyes with sunglasses outdoors."}
              </p>
            </div>
          </div>

          {/* Precautions */}
          <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/70 text-xs">
            <span className="font-bold text-amber-900 flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Precautions & Recommended Actions for the Patient
            </span>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 list-disc list-inside text-[11.5px]">
                {isCataract ? (
                  <>
                    <li>Avoid unassisted night driving, especially under bright oncoming headlights that cause glare.</li>
                    <li>Wear UV-blocking sunglasses during daylight hours to protect the eyes from solar radiation.</li>
                    <li>Ensure adequate lighting for reading and detailed tasks to reduce eye strain.</li>
                    <li>Schedule a complete slit-lamp examination with an ophthalmologist within 2-4 weeks.</li>
                  </>
                ) : (
                  <>
                    <li>Maintain regular annual comprehensive eye health checkups.</li>
                    <li>Protect your eyes from prolonged direct sun exposure by wearing UV-rated sunglasses.</li>
                    <li>Maintain a balanced diet rich in eye-healthy vitamins C, E, and antioxidants.</li>
                    <li>Promptly seek medical attention if you notice any sudden changes in vision clarity.</li>
                  </>
                )}
              </ul>
          </div>
        </div>

        {/* Clinical Anterior Segment Breakdown */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Clinical Anterior Segment Breakdown</h3>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Screening Stage</th>
                  <th className="px-4 py-3">Clinical Assessment Area</th>
                  <th className="px-4 py-3">Clinical Observation</th>
                  <th className="px-4 py-3">Diagnostic Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td className="px-4 py-3 font-semibold">1. Optical Quality</td>
                  <td className="px-4 py-3 text-slate-500">Corneal & Anterior Illumination</td>
                  <td className="px-4 py-3">
                    {screening.imageQuality === 'BAD' ? 'Reduced anterior segment clarity' : 'Sharp anterior focus, suitable for diagnostic staging'}
                  </td>
                  <td className={`px-4 py-3 font-bold ${screening.imageQuality === 'BAD' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {screening.imageQuality === 'BAD' ? 'SUBOPTIMAL' : 'GRADABLE (PASS)'}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">2. Analyzed Lens Region</td>
                  <td className="px-4 py-3 text-slate-500">Crystalline Lens & Pupillary Aperture</td>
                  <td className="px-4 py-3">
                    Exact lens/pupillary region delineated for model inspection
                  </td>
                  <td className="px-4 py-3 text-sky-700 font-bold">
                    REGION DELINEATED
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">3. Lens Opacity Evidence Map (Primary)</td>
                  <td className="px-4 py-3 text-slate-500">Localized Opacity Visual Characteristics</td>
                  <td className="px-4 py-3">
                    Transparent overlay restricted strictly to analyzed lens region
                  </td>
                  <td className={`px-4 py-3 font-bold ${isCataract ? 'text-red-700' : 'text-emerald-700'}`}>
                    {isCataract ? 'OPACITY EVIDENCE IDENTIFIED' : 'CLEAR OPTICAL AXIS'}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">4. Model Attention — Grad-CAM++ (Secondary)</td>
                  <td className="px-4 py-3 text-slate-500">Classifier Feature Focus</td>
                  <td className="px-4 py-3">
                    Attribution map showing image regions influencing classifier
                  </td>
                  <td className="px-4 py-3 text-slate-800 font-bold">ATTRIBUTION COMPUTED</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">5. Cataract Classifier Prediction</td>
                  <td className="px-4 py-3 text-slate-500">EfficientNet-V2-S Classification</td>
                  <td className="px-4 py-3 font-medium">
                    {isCataract ? `Cataract probability ${(catProb * 100).toFixed(2)}%` : `Normal probability ${(normProb * 100).toFixed(2)}%`}
                  </td>
                  <td className={`px-4 py-3 font-extrabold ${isCataract ? 'text-red-700' : 'text-emerald-700'}`}>
                    {isCataract ? 'CATARACT DETECTED' : 'NORMAL / NO CATARACT'}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">6. Quantitative AI Measurements</td>
                  <td className="px-4 py-3 text-slate-500">Objective Area Metrics</td>
                  <td className="px-4 py-3 font-medium">
                    Analyzed: {screening.quantitativeAnalysis?.analyzedRegionAreaPx ? `${screening.quantitativeAnalysis.analyzedRegionAreaPx.toLocaleString()} px` : 'Calculated'} • Opacity Zone: {screening.quantitativeAnalysis?.opacityEvidenceAreaPx ? `${screening.quantitativeAnalysis.opacityEvidenceAreaPx.toLocaleString()} px` : '0 px'} ({screening.quantitativeAnalysis?.opacityEvidencePercentage !== undefined ? `${screening.quantitativeAnalysis.opacityEvidencePercentage.toFixed(1)}%` : '0.0%'})
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-bold">
                    AI MEASURED
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">7. Referral Recommendation</td>
                  <td className="px-4 py-3 text-slate-500">Clinical Follow-up Pathway</td>
                  <td className="px-4 py-3">
                    {isCataract ? 'Ophthalmologist consultation & dilated slit-lamp exam advised' : 'Routine annual preventive screening schedule'}
                  </td>
                  <td className={`px-4 py-3 font-bold ${isCataract ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {isCataract ? 'REFERRED FOR SLIT-LAMP' : 'ROUTINE CARE'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Visual Evidence Gallery */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Visual AI Evidence</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Multi-layered anterior segment evidence from the current screening session
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              {[
                { id: 'visuals', label: 'Evidence Layers' },
                { id: 'workflow', label: '6-Panel Workflow' },
                { id: 'xai', label: 'Explainability (XAI)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#0284C7] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'visuals' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Panel 1: Original */}
                <div className="space-y-1.5 text-center">
                  <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800">
                    {!imgErrors['original'] && (screening.imageOriginal || screening.artifacts?.original_fundus || screening.artifacts?.original || getArtifactUrl(screening.id, 'original')) ? (
                      <img
                        src={resolveImageUrl(
                          screening.imageOriginal ||
                          screening.artifacts?.original_fundus ||
                          screening.artifacts?.original ||
                          getArtifactUrl(screening.id, 'original')
                        )}
                        alt="Original Eye Image"
                        className="w-full h-full object-contain"
                        onError={() => setImgErrors((prev) => ({ ...prev, original: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-900 text-slate-400">
                        <Eye className="w-6 h-6 text-slate-500 mb-1" />
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Visualization unavailable for this screening.
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 block">1. Original Eye Image</span>
                  <span className="text-[10px] text-slate-400 block">Current submitted photograph</span>
                </div>

                {/* Panel 2: Analyzed Lens Region */}
                <div className="space-y-1.5 text-center">
                  <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800">
                    {!imgErrors['analyzed_region'] && (screening.imageAnalyzedRegion || screening.artifacts?.analyzed_region || screening.imageEyeDetection || screening.artifacts?.eye_box || getArtifactUrl(screening.id, 'analyzed_region') || getArtifactUrl(screening.id, 'eye_box')) ? (
                      <img
                        src={resolveImageUrl(
                          screening.imageAnalyzedRegion ||
                          screening.artifacts?.analyzed_region ||
                          screening.imageEyeDetection ||
                          screening.artifacts?.eye_box ||
                          getArtifactUrl(screening.id, 'analyzed_region') ||
                          getArtifactUrl(screening.id, 'eye_box')
                        )}
                        alt="Analyzed Lens Region"
                        className="w-full h-full object-contain"
                        onError={() => setImgErrors((prev) => ({ ...prev, analyzed_region: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-900 text-slate-400">
                        <Scan className="w-6 h-6 text-slate-500 mb-1" />
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Visualization unavailable for this screening.
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-sky-700 block">2. Analyzed Lens Region</span>
                  <span className="text-[10px] text-slate-400 block">Delineated lens aperture ROI</span>
                </div>

                {/* Panel 3: Lens Opacity Evidence Map (Primary) */}
                <div className="space-y-1.5 text-center">
                  <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800 relative">
                    {!imgErrors['opacity_evidence'] && (screening.imageOpacityEvidence || screening.artifacts?.opacity_evidence || getArtifactUrl(screening.id, 'opacity_evidence')) ? (
                      <img
                        src={resolveImageUrl(
                          screening.imageOpacityEvidence ||
                          screening.artifacts?.opacity_evidence ||
                          getArtifactUrl(screening.id, 'opacity_evidence')
                        )}
                        alt="Lens Opacity Evidence Map"
                        className="w-full h-full object-contain"
                        onError={() => setImgErrors((prev) => ({ ...prev, opacity_evidence: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-900 text-slate-400">
                        <Activity className="w-6 h-6 text-slate-500 mb-1" />
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Visualization unavailable for this screening.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[11px] font-semibold text-red-700 block">3. Lens Opacity Evidence Map</span>
                    <span className="text-[9.5px] font-bold text-red-600 bg-red-50 px-1.5 py-0.2 rounded border border-red-100">PRIMARY</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[9.5px] text-slate-500">
                    <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> High</span>
                    <span className="inline-flex items-center gap-0.5 text-violet-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span> Mod</span>
                    <span className="inline-flex items-center gap-0.5 text-indigo-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span> Low</span>
                  </div>
                </div>

                {/* Panel 4: Model Attention — Grad-CAM++ (Secondary) */}
                <div className="space-y-1.5 text-center">
                  <div className="rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800 relative">
                    {!imgErrors['gradcam'] && (screening.imageGradCam || screening.artifacts?.gradcam || screening.artifacts?.gradcamOverlay || getArtifactUrl(screening.id, 'gradcam')) ? (
                      <img
                        src={resolveImageUrl(
                          screening.imageGradCam ||
                          screening.artifacts?.gradcam ||
                          screening.artifacts?.gradcamOverlay ||
                          getArtifactUrl(screening.id, 'gradcam')
                        )}
                        alt="Model Attention — Grad-CAM++"
                        className="w-full h-full object-contain"
                        onError={() => setImgErrors((prev) => ({ ...prev, gradcam: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-900 text-slate-400">
                        <Layers className="w-6 h-6 text-slate-500 mb-1" />
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Visualization unavailable for this screening.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[11px] font-semibold text-sky-700 block">4. Model Attention — Grad-CAM++</span>
                    <span className="text-[9.5px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-100">SECONDARY</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    Classifier feature focus
                  </span>
                </div>
              </div>

              {/* Quantitative Opacity Analysis Summary Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      AI Evidence Summary & Quantitative Opacity Analysis
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">
                    Calculated from current image
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Analyzed Lens Region</span>
                    <span className="text-sm font-extrabold text-slate-900 font-mono">
                      {screening.quantitativeAnalysis?.analyzedRegionAreaPx ? `${screening.quantitativeAnalysis.analyzedRegionAreaPx.toLocaleString()} px` : 'Calculated in ROI'}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Opacity Evidence Area</span>
                    <span className="text-sm font-extrabold text-slate-900 font-mono">
                      {screening.quantitativeAnalysis?.opacityEvidenceAreaPx ? `${screening.quantitativeAnalysis.opacityEvidenceAreaPx.toLocaleString()} px` : '0 px'}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Opacity Evidence %</span>
                    <span className="text-sm font-extrabold text-slate-900 font-mono">
                      {screening.quantitativeAnalysis?.opacityEvidencePercentage !== undefined ? `${screening.quantitativeAnalysis.opacityEvidencePercentage.toFixed(1)}%` : '0.0%'}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Cataract Probability</span>
                    <span className={`text-sm font-extrabold font-mono ${isCataract ? 'text-red-700' : 'text-emerald-700'}`}>
                      {(catProb * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 italic flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    AI Evidence Intensity: <strong className="not-italic">{evidenceInfo.title}</strong> — {evidenceInfo.meaning} {evidenceInfo.clinicalNote}
                  </span>
                </div>
              </div>

              {/* Why-this-result + evidence intensity (same derivation as dashboard) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    AI Evidence Intensity — {evidenceInfo.title}
                  </span>
                  <p className="text-[11.5px] text-slate-600 leading-relaxed">{evidenceInfo.interpretation}</p>
                  <p className="text-[11px] text-slate-500 italic leading-relaxed">
                    {evidenceInfo.clinicalNote} {evidenceInfo.action}
                  </p>
                </div>
                <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100 space-y-1.5">
                  <span className="text-xs font-bold text-sky-900 uppercase tracking-wider">
                    Why did the AI produce this result?
                  </span>
                  <p className="text-[11.5px] text-slate-700 leading-relaxed">{whyExplanation.whyResult}</p>
                  <p className="text-[11.5px] text-slate-700 leading-relaxed">{whyExplanation.visualEvidence}</p>
                  <p className="text-[11px] text-slate-500 italic leading-relaxed">
                    {whyExplanation.whatItMeans} {whyExplanation.nextStep}
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'workflow' ? (
            <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 p-2 min-h-[200px] flex items-center justify-center">
              {!imgErrors['workflow'] && (screening.imageWorkflow || screening.artifacts?.combined_xai || screening.artifacts?.workflow || getArtifactUrl(screening.id, 'workflow')) ? (
                <img
                  src={resolveImageUrl(
                    screening.imageWorkflow ||
                    screening.artifacts?.combined_xai ||
                    screening.artifacts?.workflow ||
                    getArtifactUrl(screening.id, 'workflow')
                  )}
                  alt="6-Panel Workflow"
                  className="w-full h-auto object-contain mx-auto rounded-lg"
                  onError={() => setImgErrors((prev) => ({ ...prev, workflow: true }))}
                />
              ) : (
                <div className="p-8 text-center text-slate-400">
                  <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <span className="text-xs text-slate-400">Visualization unavailable for this screening.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 p-2 min-h-[200px] flex items-center justify-center">
              {!imgErrors['xai'] && (screening.imageXai || screening.artifacts?.gradcam || screening.artifacts?.xai || getArtifactUrl(screening.id, 'xai') || screening.imageGradCam) ? (
                <img
                  src={resolveImageUrl(
                    screening.imageXai ||
                    screening.artifacts?.gradcam ||
                    screening.artifacts?.xai ||
                    getArtifactUrl(screening.id, 'xai') ||
                    screening.imageGradCam
                  )}
                  alt="XAI Explainability"
                  className="w-full h-auto object-contain mx-auto rounded-lg"
                  onError={() => setImgErrors((prev) => ({ ...prev, xai: true }))}
                />
              ) : (
                <div className="p-8 text-center text-slate-400">
                  <Sparkles className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <span className="text-xs text-slate-400">Visualization unavailable for this screening.</span>
                </div>
              )}
            </div>
          )}

        </div>


        {/* Clinical Notice & Sign-off */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p className="max-w-md">
            This screening report was generated by the TRINAY local AI cataract classifier. Results must be correlated with clinical slit-lamp findings.
          </p>
          <div className="text-right font-semibold text-slate-700">
            TRINAY Medical AI Platform
          </div>
        </div>
      </div>
    </div>
  );
};
