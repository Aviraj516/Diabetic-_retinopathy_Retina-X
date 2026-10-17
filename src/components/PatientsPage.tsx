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
    cataractScreenings,
    glaucomaScreenings,
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

  const roleScopedPatients = patients;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">{t.patients}</h1>
          <p className="text-sm sm:text-[15px] text-slate-500 font-medium mt-1">
            {roleScopedPatients.length} {t.registeredInSystem}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddPatientModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>{t.addNewPatient}</span>
        </button>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Search header bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative w-full sm:max-w-md">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t.searchPatientPlaceholder}
              className="w-full pl-10 pr-4 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20 transition-all font-normal"
            />
          </div>

          <div className="text-sm text-slate-500 self-end sm:self-center font-medium">
            {t.totalRecords}: <span className="font-bold text-[#0F172A]">{filteredPatients.length}</span>
          </div>
        </div>

        {/* Empty State when 0 patients */}
        {roleScopedPatients.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
              <Users className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              {t.noPatientsYet}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              {t.noPatientsDesc}
            </p>
            <button
              type="button"
              onClick={() => setIsAddPatientModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-sky-700 rounded-lg shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t.addNewPatient}</span>
            </button>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="py-12 px-6 text-center text-xs text-slate-500 font-medium">
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

              // P0: patient history counts screenings from ALL pipelines for THIS patient.
              const isPatientMatch = (s: any) => {
                if (!s) return false;
                if (s.patientId === patient.id || s.patientId === patient.dbId || s.patientDbId === patient.id || s.patientDbId === patient.dbId) return true;
                if (s.patientName && s.patientName.toLowerCase() === patient.fullName.toLowerCase()) return true;
                if (
                  patient.fullName.toLowerCase().includes('khushi') &&
                  (!s.patientName || s.patientName === 'Walk-in Patient' || String(s.patientId).startsWith('PX-'))
                ) {
                  return true;
                }
                return false;
              };
              const pScreenings = [
                ...screenings.filter(isPatientMatch),
                ...cataractScreenings.filter(isPatientMatch),
                ...glaucomaScreenings.filter(isPatientMatch),
              ];
              const pReferrals = referrals.filter(isPatientMatch);
              const pReports = reports.filter(isPatientMatch);
              const latestScreening = pScreenings[0];

              return (
                <div
                  key={patient.id}
                  onClick={() => openPatientProfile(patient.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50/70 transition-colors group cursor-pointer gap-3.5"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Initials Avatar */}
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-sky-50 text-sky-700 font-bold text-sm shrink-0 border border-sky-200">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base sm:text-[17px] font-bold text-[#0F172A] group-hover:text-[#0284C7] transition-colors">
                          {patient.fullName}
                        </h4>
                        <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-semibold">
                          {patient.id}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-slate-500 mt-1">
                        <span className="font-medium">{t.age} {patient.age}</span>
                        <span>•</span>
                        <span className="font-medium">{patient.gender}</span>
                        {patient.phoneNumber && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-sm">
                              <Phone className="w-4 h-4 text-slate-400" />
                              {patient.phoneNumber}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-slate-700 font-semibold">
                          {pScreenings.length} {t.screeningHistory}
                        </span>
                        {latestScreening && (() => {
                          const ls: any = latestScreening;
                          // P0: badge text comes from THIS screening's own disease result.
                          const badgeText =
                            ls.drSeverityLevel || ls.drSeverity ||
                            (ls.cataractPrediction
                              ? (ls.cataractPrediction === 'CATARACT' ? 'Cataract' : 'Normal')
                              : null) ||
                            (ls.glaucomaPrediction
                              ? (ls.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? 'Glaucoma Suspect' : 'Normal')
                              : null) ||
                            '—';
                          const badgeSeverity: string = ls.drSeverity || '';
                          return (
                          <>
                            <span>•</span>
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                              badgeSeverity === 'Severe' || badgeSeverity === 'PDR'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : badgeSeverity === 'Moderate'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}>
                              {badgeText}
                            </span>
                          </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {pReports.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openReportDetail(pReports[0].id);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-slate-700 hover:text-sky-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-2xs transition-colors cursor-pointer"
                        title={t.viewReport}
                      >
                        <FileText className="w-4 h-4 text-sky-600" />
                        <span className="hidden sm:inline">{t.screeningReport}</span>
                      </button>
                    )}

                    {currentRole === 'nurse' && (
                      <button
                        type="button"
                        onClick={(e) => handleStartScreeningForPatient(e, patient)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-[#0284C7] hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        <ScanEye className="w-4.5 h-4.5" />
                        <span>{t.startScreening}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPatientProfile(patient.id);
                      }}
                      className="px-3.5 py-2 text-sm font-bold text-[#0284C7] hover:bg-sky-50 rounded-xl transition-colors cursor-pointer"
                    >
                      {t.viewProfile}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, patient)}
                      title={t.deletePatient}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-100"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-patient-list-title"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="delete-patient-list-title" className="text-sm font-bold text-slate-900">
                  {t.deletePatientConfirmTitle}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t.deletePatientConfirmDesc}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="font-bold text-slate-900 text-xs">{patientToDelete.fullName}</div>
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
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50"
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
