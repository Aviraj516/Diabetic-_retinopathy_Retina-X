import React, { useState } from 'react';
import { Search, Eye, Plus, Filter, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CataractScreeningRecord } from '../types';

export const CataractHistoryPage: React.FC = () => {
  const {
    cataractScreenings,
    setActivePage,
    openCataractReportDetail,
  } = useApp();

  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<'All' | 'CATARACT' | 'NORMAL'>('All');

  const filtered = cataractScreenings.filter((s) => {
    const matchesSearch =
      s.patientName.toLowerCase().includes(search.toLowerCase()) ||
      s.patientId.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase());
    const matchesResult =
      resultFilter === 'All' || s.cataractPrediction === resultFilter;
    return matchesSearch && matchesResult;
  });

  const handleOpenReport = (screening: CataractScreeningRecord) => {
    openCataractReportDetail(screening.id);
  };

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">Cataract Screening History</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {cataractScreenings.length} total anterior cataract screenings recorded in this clinical session
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActivePage('cataract-screening')}
          className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-[#0284C7] hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Cataract Screening</span>
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Filters and Search Bar */}
        <div className="p-4.5 border-b border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Patient ID, Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:ring-1 focus:ring-sky-500/20 focus:border-[#0284C7]"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Result:</span>
            </span>
            {(['All', 'CATARACT', 'NORMAL'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setResultFilter(filter)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  resultFilter === filter
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter === 'All' ? 'All Results' : filter}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        {cataractScreenings.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-3.5 rounded-2xl bg-sky-50 flex items-center justify-center text-[#0284C7] border border-sky-100 shadow-2xs">
              <Eye className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Cataract Screenings Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              Begin by uploading or capturing an anterior eye photo in the Cataract Screening module.
            </p>
            <button
              type="button"
              onClick={() => setActivePage('cataract-screening')}
              className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-[#0284C7] hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Start Cataract Screening</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No matching cataract screenings found for "{search}".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">Patient ID</th>
                  <th className="px-6 py-3.5">Patient</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Result</th>
                  <th className="px-6 py-3.5">Cataract Probability</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">View Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((screening) => {
                  const isCataract = screening.cataractPrediction === 'CATARACT';
                  return (
                    <tr key={screening.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-slate-900">{screening.patientId}</td>
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-900">{screening.patientName}</div>
                        <div className="text-[10px] text-slate-400">
                          {screening.patientAge} yrs • {screening.patientGender} • {screening.eye}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500">{screening.date}</td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                            isCataract
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isCataract ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          <span>{screening.cataractPrediction}</span>
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-bold">
                        <span className={isCataract ? 'text-rose-700' : 'text-emerald-700'}>
                          {(screening.cataractProbability * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
                            screening.overallStatus === 'Referred'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {screening.overallStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenReport(screening)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-sky-50 text-[#0284C7] hover:text-sky-800 font-bold rounded-xl border border-slate-200 hover:border-sky-300 transition-colors shadow-2xs cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Report</span>
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

