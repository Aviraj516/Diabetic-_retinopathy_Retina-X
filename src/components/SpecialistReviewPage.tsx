import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowLeft,
  Info,
  Check,
  Stethoscope,
  ShieldCheck,
  Calendar,
  Clock,
  Eye,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FundusRetinaCanvas } from './FundusRetinaCanvas';
import { XaiTab } from '../data/retinaImages';
import { DRSeverity, ScreeningRecord } from '../types';

export const SpecialistReviewPage: React.FC = () => {
  const {
    screenings,
    referrals,
    currentUser,
    submitSpecialistReview,
    setActivePage,
    openReportDetail,
    activeScreeningForModal,
    setActiveScreeningForModal,
    t,
  } = useApp();

  // Find cases needing specialist review assigned to this specialist
  const pendingCases = screenings.filter((s) => {
    if (!currentUser) return false;
    const isAssigned =
      s.specialistAssessment?.specialistId === currentUser.id ||
      (s.specialistAssessment?.specialistName &&
        currentUser.name &&
        s.specialistAssessment.specialistName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      referrals.some(
        (r) =>
          r.screeningId === s.id &&
          (r.specialistId === currentUser.id ||
            (r.specialistName &&
              currentUser.name &&
              r.specialistName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()))
      );
    return isAssigned && ((s.status === 'Referred' || s.status === 'Review') && !s.specialistAssessment);
  });

  // Selected case for review
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    activeScreeningForModal?.id || (pendingCases[0] ? pendingCases[0].id : null)
  );

  const activeCase = screenings.find((s) => s.id === selectedCaseId) || null;
  const activeReferral = referrals.find((r) => r.screeningId === activeCase?.id);

  const [activeXaiTab, setActiveXaiTab] = useState<XaiTab>('Grad-CAM++');
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(70);

  // Specialist Assessment Form State
  const [assessment, setAssessment] = useState<DRSeverity>('Moderate');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [recommendation, setRecommendation] = useState<
    'Follow-up' | 'Specialist monitoring' | 'Further evaluation' | 'No further action'
  >('Follow-up');
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Empty state if no case selected or pending
  if (!activeCase) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.casesReviews}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Review screenings referred by healthcare workers and issue official clinical assessments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActivePage('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.dashboard}</span>
          </button>
        </div>

        {pendingCases.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/90 p-12 text-center shadow-2xs">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Stethoscope className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              No cases awaiting review
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
              Screenings referred by Nurses will appear here for specialist review and secondary ophthalmology assessment.
            </p>
            <button
              type="button"
              onClick={() => setActivePage('dashboard')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-2xs"
            >
              {t.dashboard}
            </button>
          </div>
        ) : (
          /* Cases Awaiting Review Table */
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">
                {t.pendingReviews} ({pendingCases.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">{t.fullName}</th>
                    <th className="px-6 py-3">{t.patientId}</th>
                    <th className="px-6 py-3">{t.eye}</th>
                    <th className="px-6 py-3">{t.result}</th>
                    <th className="px-6 py-3">{t.confidence}</th>
                    <th className="px-6 py-3">{t.date}</th>
                    <th className="px-6 py-3">{t.priority}</th>
                    <th className="px-6 py-3">{t.status}</th>
                    <th className="px-6 py-3 text-right">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pendingCases.map((c) => {
                    const ref = referrals.find((r) => r.screeningId === c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-3.5 font-bold text-slate-900">{c.patientName}</td>
                        <td className="px-6 py-3.5 text-xs text-slate-500">{c.patientId}</td>
                        <td className="px-6 py-3.5 text-xs font-medium">{c.eye}</td>
                        <td className="px-6 py-3.5 text-xs font-semibold text-slate-900">
                          {c.drSeverityLevel}
                        </td>
                        <td className="px-6 py-3.5 text-xs text-blue-600 font-semibold">{c.confidence}%</td>
                        <td className="px-6 py-3.5 text-xs text-slate-500">{c.date}</td>
                        <td className="px-6 py-3.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                              ref?.priority === 'High'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {ref?.priority || 'Medium'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">
                            {t.pendingReviews}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedCaseId(c.id)}
                            className="px-3 py-1.5 bg-[#1E60D5] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                          >
                            {t.reviewCase}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Specialist Case Review Interface
  const handleAssessmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicalNotes.trim()) {
      alert('Please enter specialist observations and clinical notes.');
      return;
    }

    submitSpecialistReview({
      screeningId: activeCase.id,
      patientId: activeCase.patientId,
      assessment: assessment,
      notes: clinicalNotes.trim(),
      recommendation: recommendation,
    });

    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setSelectedCaseId(null);
    }, 1800);
  };

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Top Header & Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCaseId(null)}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Specialist Clinical Review</h1>
            <p className="text-xs text-slate-500">
              Case ID: {activeCase.id} • Patient: {activeCase.patientName} ({activeCase.patientId})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {activeCase.reportId && (
            <button
              type="button"
              onClick={() => openReportDetail(activeCase.reportId!)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span>View Full Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Patient Summary Header Card */}
      <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
        <div>
          <span className="text-slate-400 block font-medium">Patient</span>
          <strong className="text-sm text-slate-900">{activeCase.patientName}</strong>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Patient ID</span>
          <strong className="text-sm text-slate-900">{activeCase.patientId}</strong>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Age / Gender</span>
          <strong className="text-slate-800">{activeCase.patientAge} yrs / {activeCase.patientGender}</strong>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Eye Screened</span>
          <span className="font-bold text-blue-700">{activeCase.eye}</span>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Referral Priority</span>
          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            {activeReferral?.priority || 'Medium'}
          </span>
        </div>
      </div>

      {/* Main Grid: Left XAI Canvas, Right Specialist Assessment Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Retinal Image & XAI Visualizer */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              XAI Inspection Canvas
            </span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Quality: {activeCase.imageQuality} (Suitable)
            </span>
          </div>

          {/* Interactive Mode Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto text-xs font-medium">
            {(['Original', 'Grad-CAM++', 'Lesions', 'Anatomy', 'Combined'] as XaiTab[]).map(
              (mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setActiveXaiTab(mode)}
                  className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                    activeXaiTab === mode
                      ? 'bg-white text-blue-600 font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode}
                </button>
              )
            )}
          </div>

          {/* Fundus Canvas */}
          <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black border border-slate-200 shadow-inner">
            <FundusRetinaCanvas
              mode={activeXaiTab}
              opacity={heatmapOpacity}
              className="w-full h-full"
            />
          </div>

          {/* Opacity slider for overlays */}
          {(activeXaiTab === 'Grad-CAM++' || activeXaiTab === 'Combined') && (
            <div className="flex items-center justify-between gap-4 px-2 py-1 text-xs">
              <span className="text-slate-500 font-medium">Overlay Heatmap Opacity:</span>
              <div className="flex items-center gap-2 flex-1 max-w-xs">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={heatmapOpacity}
                  onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="w-8 font-mono text-[11px] text-slate-600 text-right">
                  {heatmapOpacity}%
                </span>
              </div>
            </div>
          )}

          {/* AI Detection Findings Strip */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
            <span className="font-bold text-slate-800 block">AI Detected Features:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {activeCase.findings.map((finding) => (
                <span
                  key={finding}
                  className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium text-[11px]"
                >
                  • {finding}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: SPECIALIST ASSESSMENT FORM */}
        <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-indigo-600" />
              <span>Specialist Clinical Assessment</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review AI hypothesis and submit official diagnostic assessment.
            </p>
          </div>

          {isSubmitted ? (
            <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-emerald-900">
                ✓ Review Submitted Successfully
              </h3>
              <p className="text-xs text-emerald-700">
                The assessment has been recorded. The case status is updated to <strong>Reviewed</strong> and synchronized with the healthcare worker&apos;s clinic.
              </p>
            </div>
          ) : (
            <form onSubmit={handleAssessmentSubmit} className="space-y-4">
              {/* AI Screening Result Reference */}
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-blue-600 font-bold uppercase block">AI Screening Result</span>
                  <span className="font-bold text-slate-900 text-sm">{activeCase.drSeverityLevel}</span>
                </div>
                <span className="text-xs font-bold text-blue-700 bg-white px-2 py-1 rounded border border-blue-200">
                  {activeCase.confidence}% Confidence
                </span>
              </div>

              {/* Your Assessment Radio Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Your Assessment
                </label>
                <div className="space-y-2">
                  {(
                    [
                      { val: 'No DR', label: 'No DR (No Diabetic Retinopathy)' },
                      { val: 'Mild', label: 'Mild NPDR' },
                      { val: 'Moderate', label: 'Moderate NPDR' },
                      { val: 'Severe', label: 'Severe NPDR' },
                      { val: 'PDR', label: 'Proliferative DR (PDR)' },
                    ] as { val: DRSeverity; label: string }[]
                  ).map((option) => (
                    <label
                      key={option.val}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        assessment === option.val
                          ? 'border-blue-500 bg-blue-50/50 font-semibold text-blue-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="specialist_assessment"
                        value={option.val}
                        checked={assessment === option.val}
                        onChange={() => setAssessment(option.val)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Specialist Clinical Notes Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                  Specialist Clinical Notes
                </label>
                <textarea
                  rows={3}
                  required
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Enter detailed clinical observations, retinal examination notes, or specific guidance for the clinic..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              {/* Recommendation Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                  Recommendation
                </label>
                <select
                  value={recommendation}
                  onChange={(e) =>
                    setRecommendation(
                      e.target.value as
                        | 'Follow-up'
                        | 'Specialist monitoring'
                        | 'Further evaluation'
                        | 'No further action'
                    )
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                >
                  <option value="Follow-up">Follow-up recommended (2–4 weeks)</option>
                  <option value="Specialist monitoring">Specialist monitoring &amp; dilated examination</option>
                  <option value="Further evaluation">Further evaluation (OCT / Fluorescein Angiography)</option>
                  <option value="No further action">No further action (Routine annual screening)</option>
                </select>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs rounded-lg shadow-xs shadow-blue-500/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Stethoscope className="w-4 h-4" />
                  <span>Submit Specialist Review</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
