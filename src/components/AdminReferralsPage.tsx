import React from 'react';
import { Send, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AdminReferralsPage: React.FC = () => {
  const { referrals, screenings, openPatientProfile, t } = useApp();
  const [search, setSearch] = React.useState('');

  const filtered = referrals.filter(
    (r) =>
      r.patientName.toLowerCase().includes(search.toLowerCase()) ||
      r.patientId.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      (r.nurseName && r.nurseName.toLowerCase().includes(search.toLowerCase())) ||
      (r.specialistName && r.specialistName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Send className="w-6 h-6 text-amber-500" />
            <span>{t.referralsMasterAudit}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t.referralsMasterAuditDesc}
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
          {t.totalRecords}: {referrals.length}
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

      {/* Referrals Table */}
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
                  <th className="px-6 py-3.5">{t.referrals} ID</th>
                  <th className="px-6 py-3.5">{t.fullName}</th>
                  <th className="px-6 py-3.5">{t.referringNurse}</th>
                  <th className="px-6 py-3.5">{t.date}</th>
                  <th className="px-6 py-3.5">{t.reason}</th>
                  <th className="px-6 py-3.5">{t.priority}</th>
                  <th className="px-6 py-3.5">{t.referredSpecialist}</th>
                  <th className="px-6 py-3.5">{t.status}</th>
                  <th className="px-6 py-3.5">{t.specialistReviewStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((r) => {
                  const screening = screenings.find((s) => s.id === r.screeningId);
                  const isReviewed = Boolean(screening?.specialistAssessment || r.status === 'Completed');

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3.5 font-bold text-slate-900 text-xs">{r.id}</td>
                      <td className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() => openPatientProfile(r.patientId)}
                          className="text-xs font-bold text-blue-600 hover:underline block text-left"
                        >
                          {r.patientName}
                        </button>
                        <span className="text-[11px] text-slate-400">{r.patientId}</span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">{r.nurseName || 'Sister Priyanka'}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-500">{r.date}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-700 max-w-xs truncate">{r.reason}</td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            r.priority === 'High'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {r.priority === 'High' ? t.high : r.priority === 'Medium' ? t.medium : t.low}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-900 font-medium">
                        {r.specialistName || 'Dr. Mehta (Consultant)'}
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isReviewed
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isReviewed ? t.reviewedCases : t.pendingReviews}
                        </span>
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
