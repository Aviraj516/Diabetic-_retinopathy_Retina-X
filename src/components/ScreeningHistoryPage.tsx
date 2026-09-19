import React, { useState } from 'react';
import { Search, Eye, Calendar, FileText, Plus, Filter } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ScreeningRecord } from '../types';

export const ScreeningHistoryPage: React.FC = () => {
  const {
    screenings,
    currentRole,
    currentUser,
    referrals,
    setActivePage,
    setActiveScreeningForModal,
    setIsReferralModalOpen,
    openReportDetail,
    t,
  } = useApp();

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');

  const roleScopedScreenings = screenings.filter((s) => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'nurse') {
      if (!currentUser) return false;
      return (
        s.nurseId === currentUser.id ||
        (s.nurseName &&
          currentUser.name &&
          s.nurseName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
        (s.nurseName &&
          currentUser.email &&
          s.nurseName.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
      );
    }
    if (currentRole === 'specialist') {
      if (!currentUser) return false;
      return (
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
        )
      );
    }
    return true;
  });

  const filtered = roleScopedScreenings.filter((s) => {
    const matchesSearch =
      s.patientName.toLowerCase().includes(search.toLowerCase()) ||
      s.patientId.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity =
      severityFilter === 'All' || s.drSeverity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const handleOpenReport = (s: ScreeningRecord) => {
    if (s.reportId) {
      openReportDetail(s.reportId);
    } else {
      setActivePage('reports');
    }
  };

  const handleOpenReferral = (s: ScreeningRecord) => {
    setActiveScreeningForModal(s);
    setIsReferralModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.screeningHistory}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {roleScopedScreenings.length} {t.recentScreenings.toLowerCase()}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActivePage('new-screening')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t.startNewScreening}</span>
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
            <span className="text-slate-500">{t.severity}:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium"
            >
              <option value="All">{t.allGrades}</option>
              <option value="No DR">{t.noDr}</option>
              <option value="Mild">{t.mild}</option>
              <option value="Moderate">{t.moderate}</option>
              <option value="Severe">{t.severe}</option>
              <option value="PDR">{t.pdr}</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        {roleScopedScreenings.length === 0 ? (
          <div className="py-20 px-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Eye className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              {t.noScreeningsYet}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
              {t.noScreeningsDesc}
            </p>
            <button
              type="button"
              onClick={() => setActivePage('new-screening')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{t.startNewScreening}</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 px-6 text-center text-xs text-slate-500">
            {t.noScreeningsYet}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">Record ID</th>
                  <th className="px-6 py-3.5">{t.patientId}</th>
                  <th className="px-6 py-3.5">{t.fullName}</th>
                  <th className="px-6 py-3.5">{t.date}</th>
                  <th className="px-6 py-3.5">{t.eye}</th>
                  <th className="px-6 py-3.5">{t.result}</th>
                  <th className="px-6 py-3.5">{t.confidence}</th>
                  <th className="px-6 py-3.5">{t.status}</th>
                  <th className="px-6 py-3.5 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-[11px] text-slate-500">
                      {item.id}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      {item.patientId}
                    </td>
                    <td className="px-6 py-3.5 font-medium">{item.patientName}</td>
                    <td className="px-6 py-3.5 text-slate-500">{item.date}</td>
                    <td className="px-6 py-3.5 font-medium text-blue-700">{item.eye}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          item.drSeverity === 'No DR'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.drSeverity === 'Mild'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : item.drSeverity === 'Moderate'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {item.drSeverity}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-slate-800">
                      {item.confidence}%
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-md text-[11px] font-medium ${
                          item.status === 'Reviewed'
                            ? 'bg-blue-50 text-blue-700'
                            : item.status === 'Referred'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenReport(item)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {t.viewReport}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenReferral(item)}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                      >
                        {t.referral}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
