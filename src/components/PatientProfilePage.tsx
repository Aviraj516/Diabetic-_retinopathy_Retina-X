import React, { useState } from 'react';
import {
  ArrowLeft,
  User,
  Phone,
  Calendar,
  Activity,
  ScanEye,
  FileText,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Stethoscope,
  ChevronRight,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const PatientProfilePage: React.FC = () => {
  const {
    activePatientId,
    patients,
    screenings,
    referrals,
    reports,
    setActivePage,
    openReportDetail,
    setWizardPatient,
    sendReportToPatientPhone,
    deletePatient,
    t,
  } = useApp();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const patient = patients.find((p) => p.id === activePatientId) || patients[0];

  if (!patient) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-sm text-slate-500">{t.noPatientsMatch}</p>
        <button
          type="button"
          onClick={() => setActivePage('patients')}
          className="mt-3 px-4 py-2 bg-[#1E60D5] text-white text-xs font-semibold rounded-lg"
        >
          {t.patients}
        </button>
      </div>
    );
  }

  // Filter records belonging to this specific patient
  const patientScreenings = screenings.filter((s) => s.patientId === patient.id);
  const patientReferrals = referrals.filter((r) => r.patientId === patient.id);
  const patientReports = reports.filter((r) => r.patientId === patient.id);

  const latestScreening = patientScreenings[0] || null;

  // Check if any screening has a specialist review
  const latestSpecialistReview = patientScreenings.find((s) => s.specialistAssessment)?.specialistAssessment || null;

  const handleStartScreeningForPatient = () => {
    setWizardPatient(patient);
    setActivePage('new-screening');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          id="btn-back-to-patients"
          onClick={() => setActivePage('patients')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.back}</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            id="btn-delete-patient-profile"
            onClick={() => {
              setDeleteError(null);
              setIsDeleteModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200/90 shadow-2xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>{t.deletePatient}</span>
          </button>

          <button
            type="button"
            onClick={handleStartScreeningForPatient}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E60D5] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.startScreening}</span>
          </button>
        </div>
      </div>

      {/* Patient Master Demographics Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0 font-bold text-lg">
              {patient.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900">{patient.fullName}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {patient.id}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                <span>{t.age} {patient.age}</span>
                <span>•</span>
                <span>{patient.gender}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {patient.phoneNumber}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t.date}</span>
              <span className="text-xs font-bold text-slate-800">{patient.createdAt}</span>
            </div>
          </div>
        </div>

        {/* Clinical Baseline Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
          <div>
            <span className="text-xs text-slate-400 block font-medium">{t.diabetesDurationYears}</span>
            <span className="text-sm font-bold text-slate-800">
              {patient.diabetesDurationYears} {t.years}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">{t.knownDR}</span>
            <span
              className={`inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-semibold ${
                patient.knownDR === 'Yes'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {patient.knownDR === 'Yes' ? t.yes : t.no}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">{t.totalScreenings}</span>
            <span className="text-sm font-bold text-slate-800">{patientScreenings.length}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">{t.referralStatus}</span>
            <span className="text-sm font-bold text-slate-800">
              {patientReferrals.length > 0 ? (
                <span className="text-amber-600">{patientReferrals[0].priority}</span>
              ) : (
                <span className="text-slate-500">{t.no}</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* LATEST SCREENING SECTION */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanEye className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">{t.recentScreenings}</h2>
          </div>
          {latestScreening?.reportId && (
            <button
              type="button"
              onClick={() => openReportDetail(latestScreening.reportId!)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              <FileText className="w-4 h-4" />
              <span>{t.viewReport}</span>
            </button>
          )}
        </div>

        {latestScreening ? (
          <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            <div>
              <span className="text-xs text-slate-400 block">{t.date} & {t.selectEye}</span>
              <span className="text-sm font-bold text-slate-900">{latestScreening.date}</span>
              <span className="inline-block ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {latestScreening.eye}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">{t.result}</span>
              <span className="text-sm font-bold text-slate-900">
                {latestScreening.drSeverityLevel}
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.confidence}: <strong className="text-blue-600">{latestScreening.confidence}%</strong>
              </p>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">{t.qualityValidation}</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{latestScreening.imageQuality}</span>
              </span>
            </div>

            <div className="text-right">
              {latestScreening.reportId ? (
                <button
                  type="button"
                  onClick={() => openReportDetail(latestScreening.reportId!)}
                  className="px-4 py-2 bg-[#1E60D5] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  {t.viewReport}
                </button>
              ) : (
                <span className="text-xs text-slate-400">{t.completed}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">{t.noScreeningsYet}</p>
            <button
              type="button"
              onClick={handleStartScreeningForPatient}
              className="mt-3 px-4 py-2 bg-[#1E60D5] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"
            >
              {t.startScreening}
            </button>
          </div>
        )}
      </div>

      {/* SPECIALIST REVIEW SECTION */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">{t.specialistReview}</h2>
          </div>
          {latestSpecialistReview && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{t.reviewedCases}</span>
            </span>
          )}
        </div>

        <div className="p-6">
          {latestSpecialistReview ? (
            <div className="bg-indigo-50/40 rounded-xl p-5 border border-indigo-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {latestSpecialistReview.specialistName}
                  </h4>
                  <p className="text-xs text-slate-500">{t.date}: {latestSpecialistReview.reviewDate}</p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-indigo-200 text-xs font-bold text-indigo-900">
                  <span>{t.assessment}:</span>
                  <span className="text-blue-600">{latestSpecialistReview.assessment}</span>
                </div>
              </div>

              <div className="pt-2">
                <span className="text-xs font-semibold text-slate-700 block">{t.clinicalFindings}:</span>
                <p className="text-xs text-slate-600 mt-1 bg-white p-3 rounded-lg border border-indigo-100 leading-relaxed">
                  {latestSpecialistReview.notes}
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-600">
                  {t.recommendation}: <strong className="text-slate-900">{latestSpecialistReview.recommendation}</strong>
                </span>
              </div>
            </div>
          ) : patientReferrals.length > 0 ? (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-900">{t.pendingReviews}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {t.referredDate}: {patientReferrals[0].date} ({patientReferrals[0].specialistName})
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
              {t.noCasesDesc}
            </div>
          )}
        </div>
      </div>

      {/* SCREENING HISTORY SECTION */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-700" />
            <h2 className="text-base font-bold text-slate-900">{t.screeningHistory}</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {patientScreenings.length} {t.totalRecords}
          </span>
        </div>

        {patientScreenings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">{t.screeningId}</th>
                  <th className="px-6 py-3">{t.date}</th>
                  <th className="px-6 py-3">{t.selectEye}</th>
                  <th className="px-6 py-3">{t.result}</th>
                  <th className="px-6 py-3">{t.confidence}</th>
                  <th className="px-6 py-3">{t.status}</th>
                  <th className="px-6 py-3 text-right">{t.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {patientScreenings.map((sc, index) => (
                  <tr key={sc.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{sc.id}</td>
                    <td className="px-6 py-3.5 text-xs text-slate-500">{sc.date}</td>
                    <td className="px-6 py-3.5 text-xs font-medium">{sc.eye}</td>
                    <td className="px-6 py-3.5 text-xs font-semibold text-slate-900">
                      {sc.drSeverityLevel}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-blue-600 font-semibold">{sc.confidence}%</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          sc.status === 'Reviewed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : sc.status === 'Referred'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {sc.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right space-x-2">
                      {sc.reportId && (
                        <button
                          type="button"
                          onClick={() => openReportDetail(sc.reportId!)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          {t.viewReport}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            {t.noScreeningsYet}
          </div>
        )}
      </div>

      {/* REFERRALS & REPORTS DUAL COLUMN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* REFERRAL HISTORY */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-4 h-4 text-amber-600" />
              <span>{t.referrals}</span>
            </h3>
            <span className="text-xs text-slate-400">{patientReferrals.length}</span>
          </div>
          <div className="p-6">
            {patientReferrals.length > 0 ? (
              <div className="space-y-3">
                {patientReferrals.map((ref) => (
                  <div key={ref.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{ref.id}</span>
                      <span className="text-xs text-slate-500">{ref.date}</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      <strong>{t.assignSpecialist}:</strong> {ref.specialistName || 'Ophthalmology Department'}
                    </p>
                    <p className="text-xs text-slate-600">
                      <strong>{t.reasonForReferral}:</strong> {ref.reason || 'Moderate DR findings detected'}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {t.priority}: {ref.priority}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {t.status}: {ref.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">{t.noReferralsYet}</p>
            )}
          </div>
        </div>

        {/* REPORTS HISTORY */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>{t.reports}</span>
            </h3>
            <span className="text-xs text-slate-400">{patientReports.length}</span>
          </div>
          <div className="p-6">
            {patientReports.length > 0 ? (
              <div className="space-y-3">
                {patientReports.map((rpt) => (
                  <div key={rpt.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900">{rpt.id}</span>
                        <span className="text-xs text-slate-500 ml-2">({rpt.generatedDate})</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rpt.status === 'Sent to Patient'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {rpt.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {t.diagnosis}: <strong>{rpt.drSeverityLevel}</strong> ({rpt.eye})
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => openReportDetail(rpt.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded"
                      >
                        {t.viewReport}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">{t.noReportsYet}</p>
            )}
          </div>
        </div>
      </div>

      {/* Delete Patient Confirmation Modal */}
      {isDeleteModalOpen && (
        <div
          id="modal-delete-patient"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-patient-dialog-title"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="delete-patient-dialog-title" className="text-base font-bold text-slate-900">
                  {t.deletePatientConfirmTitle}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t.deletePatientConfirmDesc}
                </p>
              </div>
            </div>

            {/* Target Patient Clinical Details */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="font-bold text-slate-900 text-sm">{patient.fullName}</div>
              <div className="text-slate-500 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">{patient.id}</span>
                <span>•</span>
                <span>{patient.age} yrs ({patient.gender})</span>
                <span>•</span>
                <span>{patient.phoneNumber}</span>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                id="btn-cancel-delete-patient"
                disabled={isDeleting}
                onClick={() => {
                  if (!isDeleting) {
                    setIsDeleteModalOpen(false);
                    setDeleteError(null);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                id="btn-confirm-delete-patient"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    setDeleteError(null);
                    const result = await deletePatient(patient.id);
                    if (result && !result.success && result.error) {
                      setDeleteError(result.error);
                      setIsDeleting(false);
                      return;
                    }
                    setIsDeleteModalOpen(false);
                    setActivePage('patients');
                  } catch (err: any) {
                    setDeleteError(err?.message || 'Failed to delete patient');
                    setIsDeleting(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? t.deleting : t.deletePatient}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
