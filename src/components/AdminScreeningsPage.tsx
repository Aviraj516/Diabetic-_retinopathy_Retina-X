import React from 'react';
import { ScanEye, Search, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AdminScreeningsPage: React.FC = () => {
  const { screenings, referrals, openReportDetail, openPatientProfile, t } = useApp();
  const [search, setSearch] = React.useState('');

  const filtered = screenings.filter(
    (s) =>
      s.patientName.toLowerCase().includes(search.toLowerCase()) ||
      s.patientId.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      (s.nurseName && s.nurseName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ScanEye className="w-6 h-6 text-blue-600" />
            <span>{t.screeningOperations}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t.screeningOperationsDesc}
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
          {t.totalRecords}: {screenings.length}
        </span>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* Screenings Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            {t.noRecordsFound}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">{t.screeningId || 'Screening ID'}</th>
                  <th className="px-6 py-3.5">{t.fullName} ({t.patientId})</th>
                  <th className="px-6 py-3.5">{t.nurseRole}</th>
                  <th className="px-6 py-3.5">{t.date}</th>
                  <th className="px-6 py-3.5">{t.selectEye}</th>
                  <th className="px-6 py-3.5">{t.result}</th>
                  <th className="px-6 py-3.5">{t.confidence}</th>
                  <th className="px-6 py-3.5">{t.referrals}</th>
                  <th className="px-6 py-3.5">{t.specialistRole}</th>
                  <th className="px-6 py-3.5">{t.status}</th>
                  <th className="px-6 py-3.5 text-right">{t.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((s) => {
                  const ref = referrals.find((r) => r.screeningId === s.id);
                  const isReferred = Boolean(ref || s.status === 'Referred' || s.status === 'Reviewed');
                  const specialistName = s.specialistAssessment?.specialistName || ref?.specialistName || t.pendingReviews;
                  const reviewStatus = s.specialistAssessment
                    ? t.reviewedCases
                    : isReferred
                    ? t.pendingReviews
                    : t.none;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3.5 font-bold text-slate-900 text-xs">{s.id}</td>
                      <td className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() => openPatientProfile(s.patientId)}
                          className="text-xs font-bold text-blue-600 hover:underline block text-left"
                        >
                          {s.patientName}
                        </button>
                        <span className="text-[11px] text-slate-400">{s.patientId}</span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">{s.nurseName || t.nurseRole}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-500">{s.date}</td>
                      <td className="px-6 py-3.5 text-xs font-medium">{s.eye}</td>
                      <td className="px-6 py-3.5 text-xs font-bold text-slate-900">{s.drSeverityLevel}</td>
                      <td className="px-6 py-3.5 text-xs text-blue-600 font-bold">{s.confidence}%</td>
                      <td className="px-6 py-3.5 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isReferred
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isReferred ? t.yes : t.no}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">
                        {isReferred ? specialistName : t.none}
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            s.specialistAssessment
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isReferred
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {reviewStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {s.reportId && (
                          <button
                            type="button"
                            onClick={() => openReportDetail(s.reportId!)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{t.view}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
