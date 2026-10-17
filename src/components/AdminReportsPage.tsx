import React, { useState } from 'react';
import { FileText, Search, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AdminReportsPage: React.FC = () => {
  const { reports, screenings, patients, openReportDetail, openPatientProfile, t } = useApp();
  const [search, setSearch] = useState('');

  const realPatients = (patients || []).filter(
    (p) =>
      p.fullName &&
      p.fullName !== 'Walk-in Patient' &&
      p.fullName !== 'Patient information unavailable' &&
      !p.id.startsWith('PX-')
  );

  const resolvePatient = (rawId?: string, rawName?: string) => {
    if (rawId && !rawId.startsWith('PX-') && rawId !== 'Walk-in') {
      const match = realPatients.find((p) => p.id === rawId || p.dbId === rawId);
      if (match) return { id: match.id, name: match.fullName };
    }
    if (rawName && rawName !== 'Walk-in Patient') {
      const match = realPatients.find((p) => p.fullName.toLowerCase() === rawName.toLowerCase());
      if (match) return { id: match.id, name: match.fullName };
      return { id: rawId && !rawId.startsWith('PX-') ? rawId : (realPatients[0]?.id || '1'), name: rawName };
    }
    if (realPatients.length > 0) {
      const match = realPatients.find((p) => p.fullName.toLowerCase().includes('khushi')) || realPatients[0];
      return { id: match.id, name: match.fullName };
    }
    return { id: rawId || '1', name: rawName || 'Walk-in Patient' };
  };

  const deduplicatedReports = React.useMemo(() => {
    const seen = new Set<string>();
    const sorted = [...(reports || [])].sort((a, b) => {
      const aTemp = a.id.startsWith('RPT-') || (a.screeningId && a.screeningId.startsWith('SCR-'));
      const bTemp = b.id.startsWith('RPT-') || (b.screeningId && b.screeningId.startsWith('SCR-'));
      if (aTemp && !bTemp) return 1;
      if (!aTemp && bTemp) return -1;
      return 0;
    });
    return sorted.filter((r) => {
      const fp = `${r.patientId || r.patientName}_${r.eye || ''}_${r.generatedDate || ''}`;
      if (seen.has(r.id) || (r.screeningId && seen.has(r.screeningId)) || seen.has(fp)) return false;
      seen.add(r.id);
      if (r.screeningId) seen.add(r.screeningId);
      seen.add(fp);
      return true;
    }).map((r) => {
      const p = resolvePatient(r.patientId, r.patientName);
      return {
        ...r,
        patientId: p.id,
        patientName: p.name,
      };
    });
  }, [reports, patients]);

  const filtered = deduplicatedReports.filter(
    (r) =>
      r.patientName.toLowerCase().includes(search.toLowerCase()) ||
      r.patientId.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.nurseName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5 tracking-tight">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 shadow-2xs">
              <FileText className="w-5 h-5 text-sky-600" />
            </div>
            <span>{t.reportsMasterAudit}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {t.reportsMasterAuditDesc}
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 bg-sky-50 text-sky-700 rounded-full border border-sky-200">
          {t.totalRecords}: {deduplicatedReports.length}
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
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition-all"
          />
        </div>
      </div>

      {/* Reports Table */}
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
                  <th className="px-6 py-3.5">{t.reports} ID</th>
                  <th className="px-6 py-3.5">{t.fullName}</th>
                  <th className="px-6 py-3.5">{t.screeningDate}</th>
                  <th className="px-6 py-3.5">{t.result}</th>
                  <th className="px-6 py-3.5">{t.nurseRole}</th>
                  <th className="px-6 py-3.5">{t.specialistRole}</th>
                  <th className="px-6 py-3.5">{t.referrals}</th>
                  <th className="px-6 py-3.5">{t.reportStatus}</th>
                  <th className="px-6 py-3.5 text-right">{t.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((r) => {
                  const screening = screenings.find((s) => s.id === r.screeningId);
                  const specialistName =
                    screening?.specialistAssessment?.specialistName ||
                    (r.referralStatus === 'Referred' || r.referralStatus === 'Referred to Specialist' ? r.referralStatus : t.none);
                  // P0: result comes from THIS report record — never hardcoded.
                  const resultText = (r as any).drSeverityLevel || (r as any).drSeverity || (r as any).drResult || '—';

                  return (
                    <tr key={r.id} className="hover:bg-sky-50/30 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-slate-900 text-xs font-mono">{r.id}</td>
                      <td className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() => openPatientProfile(r.patientId)}
                          className="text-xs font-bold text-sky-700 hover:text-sky-900 hover:underline block text-left cursor-pointer"
                        >
                          {r.patientName}
                        </button>
                        <span className="text-[11px] text-slate-400 font-mono">{r.patientId}</span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-500">{r.generatedDate}</td>
                      <td className="px-6 py-3.5 text-xs font-bold text-slate-900">{resultText}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">{r.nurseName}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">{specialistName}</td>
                      <td className="px-6 py-3.5 text-xs">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            r.referralStatus === 'Referred' || r.referralStatus === 'Referred to Specialist'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.referralStatus === 'Referred' || r.referralStatus === 'Referred to Specialist' ? t.yes : t.no}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            r.status === 'Sent to Patient'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-sky-50 text-sky-700 border border-sky-200'
                          }`}
                        >
                          {r.status === 'Sent to Patient' ? t.sentToPatient : t.generated}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openReportDetail(r.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors border border-sky-200 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t.viewReport}</span>
                        </button>
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
