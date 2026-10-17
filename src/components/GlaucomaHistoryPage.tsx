import React, { useState } from 'react';
import { Search, Eye, Plus, Filter, CheckCircle2, AlertTriangle, FileText, Layers, Activity } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GlaucomaScreeningRecord } from '../types';

export const GlaucomaHistoryPage: React.FC = () => {
  const {
    glaucomaScreenings,
    setActivePage,
    openGlaucomaReportDetail,
  } = useApp();

  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<'All' | 'GLAUCOMA_SUSPECT' | 'NORMAL'>('All');

  const filtered = glaucomaScreenings.filter((s) => {
    const matchesSearch =
      s.patientName.toLowerCase().includes(search.toLowerCase()) ||
      s.patientId.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase());
    const matchesResult =
      resultFilter === 'All' || s.glaucomaPrediction === resultFilter;
    return matchesSearch && matchesResult;
  });

  const handleOpenReport = (screening: GlaucomaScreeningRecord) => {
    openGlaucomaReportDetail(screening.id);
  };

  const suspectCount = glaucomaScreenings.filter(s => s.glaucomaPrediction === 'GLAUCOMA_SUSPECT').length;
  const normalCount = glaucomaScreenings.filter(s => s.glaucomaPrediction === 'NORMAL').length;

  return (
    <div className="space-y-6 max-w-7xl pb-12 p-6 mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">Glaucoma Screening History</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {glaucomaScreenings.length} total optic disc / glaucoma screenings recorded in this clinical session
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActivePage('glaucoma-screening')}
          className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Glaucoma Screening</span>
        </button>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Total Screenings</span>
            <span className="text-2xl font-bold text-slate-900 block mt-0.5">{glaucomaScreenings.length}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Glaucoma Suspects (CDR &gt; 0.55)</span>
            <span className="text-2xl font-bold text-amber-600 block mt-0.5">{suspectCount}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Normal Optic Nerve</span>
            <span className="text-2xl font-bold text-emerald-600 block mt-0.5">{normalCount}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Filters and Search Bar */}
        <div className="p-4.5 border-b border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Patient ID, Name, Screening ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Result:</span>
            </span>
            {(['All', 'GLAUCOMA_SUSPECT', 'NORMAL'] as const).map((filter) => (
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
                {filter === 'All' ? 'All Results' : filter === 'GLAUCOMA_SUSPECT' ? 'Suspect' : 'Normal'}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        {glaucomaScreenings.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-3.5 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100 shadow-2xs">
              <Eye className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Glaucoma Screenings Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              Begin by uploading or capturing a retinal fundus photograph in the Glaucoma Screening module.
            </p>
            <button
              type="button"
              onClick={() => setActivePage('glaucoma-screening')}
              className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Start Glaucoma Screening</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No matching glaucoma screenings found for "{search}".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">Screening ID</th>
                  <th className="px-6 py-3.5">Patient</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Vertical CDR</th>
                  <th className="px-6 py-3.5">AI Result</th>
                  <th className="px-6 py-3.5">Probability</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((screening) => {
                  const isSuspect = screening.glaucomaPrediction === 'GLAUCOMA_SUSPECT';
                  return (
                    <tr key={screening.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5 font-bold font-mono text-slate-900">{screening.id}</td>
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-900">{screening.patientName}</div>
                        <div className="text-[10px] text-slate-400">
                          {screening.patientId} • {screening.patientAge} yrs • {screening.eye}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500">{screening.date}</td>
                      <td className="px-6 py-3.5">
                        <span className={`font-mono font-bold ${screening.verticalCDR > 0.60 ? 'text-amber-600' : 'text-slate-900'}`}>
                          {screening.verticalCDR?.toFixed(3) || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isSuspect
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isSuspect ? (
                            <>
                              <AlertTriangle className="w-3 h-3" />
                              GLAUCOMA SUSPECT
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              NORMAL
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-medium font-mono text-slate-900">
                        {((screening.glaucomaProbability || 0) * 100).toFixed(1)}%
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-semibold">
                          {screening.overallStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenReport(screening)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg font-bold text-xs transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Report</span>
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
