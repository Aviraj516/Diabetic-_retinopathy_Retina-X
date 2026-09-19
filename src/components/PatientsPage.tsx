import React, { useState } from 'react';
import {
  Search,
  Plus,
  Users,
  ChevronRight,
  ScanEye,
  Trash2,
  Calendar,
  Phone,
  Eye,
  FileText,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Patient } from '../types';

export const PatientsPage: React.FC = () => {
  const {
    patients,
    screenings,
    referrals,
    reports,
    setIsAddPatientModalOpen,
    deletePatient,
    setWizardPatient,
    setActivePage,
    openPatientProfile,
    openReportDetail,
    currentRole,
    currentUser,
    t,
  } = useApp();

  const [searchFilter, setSearchFilter] = useState('');
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const roleScopedPatients = patients.filter((p) => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'nurse') {
      if (!currentUser) return false;
      return (
        p.createdByNurse === currentUser.id ||
        (p.createdByNurse &&
          currentUser.name &&
          p.createdByNurse.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
        (p.createdByNurse &&
          currentUser.email &&
          p.createdByNurse.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
      );
    }
    if (currentRole === 'specialist') {
      if (!currentUser) return false;
      return screenings.some(
        (s) =>
          s.patientId === p.id &&
          (s.specialistAssessment?.specialistId === currentUser.id ||
            referrals.some((r) => r.screeningId === s.id && r.specialistId === currentUser.id))
      );
    }
    return true;
  });

  const filteredPatients = roleScopedPatients.filter(
    (p) =>
      p.fullName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.id.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.phoneNumber.includes(searchFilter)
  );

  const handleStartScreeningForPatient = (e: React.MouseEvent, patient: Patient) => {
    e.stopPropagation();
    setWizardPatient(patient);
    setActivePage('new-screening');
  };

  const handleDeleteClick = (e: React.MouseEvent, patient: Patient) => {
    e.stopPropagation();
    setDeleteError(null);
    setPatientToDelete(patient);
  };

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.patients}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {roleScopedPatients.length} {t.registeredInSystem}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddPatientModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addNewPatient}</span>
        </button>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Search header bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t.searchPatientPlaceholder}
              className="w-full pl-9 pr-4 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="text-xs text-slate-500 self-end sm:self-center">
            {t.totalRecords}: <span className="font-semibold text-slate-800">{filteredPatients.length}</span>
          </div>
        </div>

        {/* Empty State when 0 patients */}
        {roleScopedPatients.length === 0 ? (
          <div className="py-20 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 text-slate-400">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              {t.noPatientsYet}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
              {t.noPatientsDesc}
            </p>
            <button
              type="button"
              onClick={() => setIsAddPatientModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t.addNewPatient}</span>
            </button>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="py-12 px-6 text-center text-xs text-slate-500">
            {t.noPatientsMatch} &quot;{searchFilter}&quot;
          </div>
        ) : (
          /* List of Patients */
          <div className="divide-y divide-slate-100">
            {filteredPatients.map((patient) => {
              const initials = patient.fullName
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              const pScreenings = screenings.filter((s) => s.patientId === patient.id);
              const pReferrals = referrals.filter((r) => r.patientId === patient.id);
              const pReports = reports.filter((r) => r.patientId === patient.id);
              const latestScreening = pScreenings[0];
              const isReferred = pReferrals.length > 0;
              const specialistName =
                latestScreening?.specialistAssessment?.specialistName ||
                (isReferred ? pReferrals[0].specialistName || 'Pending' : 'None');

              return (
                <div
                  key={patient.id}
                  onClick={() => openPatientProfile(patient.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50/80 transition-colors group cursor-pointer gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Initials Avatar */}
                    <div className="flex items-center justify-center w-11 h-11 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm shrink-0 border border-blue-200/60">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {patient.fullName}
                        </h4>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {patient.id}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mt-1">
                        <span>{t.age} {patient.age}</span>
                        <span>•</span>
                        <span>{patient.gender}</span>
                        {patient.phoneNumber && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {patient.phoneNumber}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-slate-700 font-medium">
                          {pScreenings.length} {t.screeningHistory}
                        </span>
                        {latestScreening && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-blue-700">
                              {latestScreening.drSeverityLevel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                    {pReports.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openReportDetail(pReports[0].id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs"
                        title={t.viewReport}
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span className="hidden sm:inline">{t.screeningReport}</span>
                      </button>
                    )}

                    {currentRole === 'nurse' && (
                      <button
                        type="button"
                        onClick={(e) => handleStartScreeningForPatient(e, patient)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-2xs transition-colors"
                      >
                        <ScanEye className="w-3.5 h-3.5" />
                        <span>{t.startScreening}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPatientProfile(patient.id);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      {t.viewProfile}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, patient)}
                      title={t.deletePatient}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Patient Confirmation Modal */}
      {patientToDelete && (
        <div
          id="modal-delete-patient-list"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-patient-list-title"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="delete-patient-list-title" className="text-base font-bold text-slate-900">
                  {t.deletePatientConfirmTitle}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t.deletePatientConfirmDesc}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="font-bold text-slate-900 text-sm">{patientToDelete.fullName}</div>
              <div className="text-slate-500 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">{patientToDelete.id}</span>
                <span>•</span>
                <span>{patientToDelete.age} yrs ({patientToDelete.gender})</span>
                <span>•</span>
                <span>{patientToDelete.phoneNumber}</span>
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
                id="btn-cancel-delete-patient-list"
                disabled={isDeleting}
                onClick={() => {
                  if (!isDeleting) {
                    setPatientToDelete(null);
                    setDeleteError(null);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                id="btn-confirm-delete-patient-list"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    setDeleteError(null);
                    const result = await deletePatient(patientToDelete.id);
                    if (result && !result.success && result.error) {
                      setDeleteError(result.error);
                      setIsDeleting(false);
                      return;
                    }
                    setPatientToDelete(null);
                    setIsDeleting(false);
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
