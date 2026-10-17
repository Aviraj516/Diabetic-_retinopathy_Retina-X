import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Users, TrendingUp, AlertCircle, FileText, Calendar, Filter, Search, Stethoscope, ArrowRight } from 'lucide-react';
import { Patient, ScreeningRecord, CataractScreeningRecord, GlaucomaScreeningRecord } from '../types';

export const AnalyticsPage: React.FC = () => {
  const { patients, screenings, cataractScreenings, glaucomaScreenings } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | '3m' | '6m' | '1y'>('all');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');

  // 1. Data Aggregation (all screenings across diseases)
  // Normalizing screening records to a common format for analytics.
  // P0: every flag is derived from the record's OWN result fields.
  const allScreenings = useMemo(() => {
    const dr = screenings.map(s => ({
      ...s,
      type: 'Diabetic Retinopathy',
      isNormal: s.drSeverity === 'No DR',
      isReferred: s.status === 'Referred' || s.status === 'Review'
    }));

    const cat = cataractScreenings.map(s => ({
      ...s,
      type: 'Cataract',
      isNormal: s.cataractPrediction !== 'CATARACT',
      isReferred: (s as any).overallStatus === 'Referred' || (s as any).status === 'Referred' || (s as any).status === 'Review'
    }));

    const glauc = glaucomaScreenings.map(s => ({
      ...s,
      type: 'Glaucoma',
      isNormal: s.glaucomaPrediction !== 'GLAUCOMA_SUSPECT',
      isReferred: (s as any).overallStatus === 'Referred' || (s as any).status === 'Referred' || (s as any).status === 'Review'
    }));

    // If there were other diseases (AMD, Keratitis), they would go here, currently returning []
    return [...dr, ...cat, ...glauc].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [screenings, cataractScreenings, glaucomaScreenings]);

  // Filter Screenings by Date
  const filteredScreenings = useMemo(() => {
    if (dateFilter === 'all') return allScreenings;
    const now = new Date();
    let cutoff = new Date();
    
    switch(dateFilter) {
      case '7d': cutoff.setDate(now.getDate() - 7); break;
      case '30d': cutoff.setDate(now.getDate() - 30); break;
      case '3m': cutoff.setMonth(now.getMonth() - 3); break;
      case '6m': cutoff.setMonth(now.getMonth() - 6); break;
      case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
    }
    
    return allScreenings.filter(s => new Date(s.date) >= cutoff);
  }, [allScreenings, dateFilter]);

  // Summary Metrics
  const totalScreenings = filteredScreenings.length;
  const normalCount = filteredScreenings.filter(s => s.isNormal).length;
  const referredCount = filteredScreenings.filter(s => s.isReferred).length;
  const abnormalCount = totalScreenings - normalCount; 
  
  // Disease counts
  const drCount = filteredScreenings.filter(s => s.type === 'Diabetic Retinopathy').length;
  const cataractCount = filteredScreenings.filter(s => s.type === 'Cataract').length;
  const glaucomaCount = filteredScreenings.filter(s => s.type === 'Glaucoma').length;
  const keratitisCount = 0;

  // Filtered Patients list (for search)
  const filteredPatients = useMemo(() => {
    return patients.filter(p => 
      p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [patients, searchTerm]);

  // Selected Patient Analytics
  const selectedPatientData = useMemo(() => {
    if (!selectedPatientId) return null;
    const p = patients.find(p => p.id === selectedPatientId);
    if (!p) return null;
    
    const pScreenings = allScreenings.filter(s => s.patientId === selectedPatientId);
    return {
      ...p,
      screenings: pScreenings,
      totalScreenings: pScreenings.length,
      normalCount: pScreenings.filter(s => s.isNormal).length,
      abnormalCount: pScreenings.filter(s => !s.isNormal).length,
      referredCount: pScreenings.filter(s => s.isReferred).length,
      latestScreening: pScreenings[0],
      diseasesScreened: Array.from(new Set(pScreenings.map(s => s.type)))
    };
  }, [selectedPatientId, patients, allScreenings]);

  // Disease Breakdown specific data
  const getDiseaseStats = (type: string, list: any[]) => {
    const diseaseScreenings = filteredScreenings.filter(s => s.type === type);
    const count = diseaseScreenings.length;
    const norm = diseaseScreenings.filter(s => s.isNormal).length;
    const ref = diseaseScreenings.filter(s => s.isReferred).length;
    const abn = count - norm;
    return { count, norm, abn, ref };
  };

  const drStats = getDiseaseStats('Diabetic Retinopathy', screenings);
  const catStats = getDiseaseStats('Cataract', cataractScreenings);
  const glStats = getDiseaseStats('Glaucoma', glaucomaScreenings);
  const kerStats = { count: 0, norm: 0, abn: 0, ref: 0 };

  const diseaseData = [
    { name: 'Diabetic Retinopathy', stats: drStats },
    { name: 'Cataract', stats: catStats },
    { name: 'Glaucoma', stats: glStats },
    { name: 'Keratitis', stats: kerStats }
  ];


  // Helper for progress bars
  const calculatePercentage = (value: number, total: number) => {
    return total === 0 ? 0 : Math.round((value / total) * 100);
  };

  if (patients.length === 0 && allScreenings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-8">
        <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center mb-6">
          <TrendingUp className="w-10 h-10 text-sky-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">No screening data available yet</h2>
        <p className="text-slate-500 max-w-md">
          Analytics and clinical intelligence will appear here once you begin performing patient screenings. 
          Real-time insights are generated from actual database records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Clinical Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Intelligence and trends from clinical screening records.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-xs">
          <select 
            className="bg-transparent text-sm font-medium text-slate-700 outline-none px-3 py-1.5 cursor-pointer"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
          >
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="3m">Last 3 Months</option>
            <option value="6m">Last 6 Months</option>
            <option value="1y">Last 1 Year</option>
          </select>
        </div>
      </div>

      {/* 3. Top Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2"><Users className="w-4 h-4" /> Total Patients</div>
          <div className="text-3xl font-bold text-slate-900">{patients.length}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2"><Stethoscope className="w-4 h-4" /> Total Screenings</div>
          <div className="text-3xl font-bold text-sky-600">{totalScreenings}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs border-l-4 border-l-emerald-500">
          <div className="text-sm font-medium text-slate-500 mb-1">Normal / Low Risk</div>
          <div className="text-3xl font-bold text-slate-900">{normalCount}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs border-l-4 border-l-amber-500">
          <div className="text-sm font-medium text-slate-500 mb-1">Abnormal / Suspect</div>
          <div className="text-3xl font-bold text-slate-900">{abnormalCount}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs border-l-4 border-l-rose-500">
          <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-rose-500"/> Review Required</div>
          <div className="text-3xl font-bold text-slate-900">{referredCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4. Disease Distribution Chart (Simplified as horizontal bars) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Disease Screening Distribution</h3>
          <div className="space-y-5">
            {diseaseData.map((d, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-semibold text-slate-700">{d.name}</span>
                  <span className="text-slate-500 font-medium">{d.stats.count} screenings</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3">
                  <div 
                    className="bg-sky-500 h-3 rounded-full transition-all duration-1000" 
                    style={{ width: `${calculatePercentage(d.stats.count, totalScreenings)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Screening Outcome Analysis */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Overall Outcome Analysis</h3>
          <div className="flex flex-col justify-center h-full gap-6 pb-6">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Normal / Low Risk</span>
                <span className="text-emerald-700 font-bold">{normalCount}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-4"><div className="bg-emerald-500 h-4 rounded-full" style={{ width: `${calculatePercentage(normalCount, totalScreenings)}%` }} /></div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Abnormal / Suspect</span>
                <span className="text-amber-700 font-bold">{abnormalCount}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-4"><div className="bg-amber-500 h-4 rounded-full" style={{ width: `${calculatePercentage(abnormalCount, totalScreenings)}%` }} /></div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-500"></div> Referred / Review Required</span>
                <span className="text-rose-700 font-bold">{referredCount}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-4"><div className="bg-rose-500 h-4 rounded-full" style={{ width: `${calculatePercentage(referredCount, totalScreenings)}%` }} /></div>
            </div>
          </div>
        </div>
      </div>


      {/* 6 & 10. Disease-Wise Outcome Breakdown */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Disease-Wise Outcome Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {diseaseData.map((d, i) => (
            <div key={i} className="border border-slate-100 bg-slate-50/50 p-4 rounded-xl">
              <div className="font-bold text-slate-800 mb-3 text-center">{d.name}</div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs bg-white px-2 py-1.5 border border-slate-100 rounded-md">
                  <span className="text-slate-500">Screened</span>
                  <span className="font-bold">{d.stats.count}</span>
                </div>
                <div className="flex justify-between text-xs bg-emerald-50 px-2 py-1.5 border border-emerald-100 rounded-md">
                  <span className="text-emerald-700">Normal</span>
                  <span className="font-bold text-emerald-700">{d.stats.norm}</span>
                </div>
                <div className="flex justify-between text-xs bg-amber-50 px-2 py-1.5 border border-amber-100 rounded-md">
                  <span className="text-amber-700">Abnormal</span>
                  <span className="font-bold text-amber-700">{d.stats.abn}</span>
                </div>
                <div className="flex justify-between text-xs bg-rose-50 px-2 py-1.5 border border-rose-100 rounded-md">
                  <span className="text-rose-700">Referred</span>
                  <span className="font-bold text-rose-700">{d.stats.ref}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 8. Patient Screening Summary Selection */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs lg:col-span-1 flex flex-col h-[500px]">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Patient Insights</h3>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search patient..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {!selectedPatientId ? (
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 border-t border-slate-100 pt-3">
              {filteredPatients.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500">No patients found.</div>
              ) : (
                filteredPatients.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className="flex justify-between items-center p-3 hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-xl cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{p.fullName}</div>
                      <div className="text-xs text-slate-500">{p.id}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-200">
              <button 
                onClick={() => setSelectedPatientId('')}
                className="text-xs text-sky-600 font-semibold mb-3 hover:underline text-left"
              >
                ← Back to patient list
              </button>
              
              {selectedPatientData && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h4 className="font-bold text-slate-900 text-lg">{selectedPatientData.fullName}</h4>
                    <p className="text-sm text-slate-500">ID: {selectedPatientData.id} • {selectedPatientData.age} yrs • {selectedPatientData.gender}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-500 font-medium">Screenings</div>
                      <div className="text-xl font-bold text-slate-800">{selectedPatientData.totalScreenings}</div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-500 font-medium">Diseases</div>
                      <div className="text-xl font-bold text-slate-800">{selectedPatientData.diseasesScreened.length}</div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Normal Results:</span>
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{selectedPatientData.normalCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Abnormal Results:</span>
                      <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{selectedPatientData.abnormalCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Referrals:</span>
                      <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{selectedPatientData.referredCount}</span>
                    </div>
                  </div>

                  {selectedPatientData.latestScreening && (
                    <div className="mt-auto pt-4 border-t border-slate-200">
                      <div className="text-xs text-slate-400 font-semibold mb-2 uppercase">Latest Screening</div>
                      <div className="text-sm font-medium text-slate-800">
                        {selectedPatientData.latestScreening.type} • {new Date(selectedPatientData.latestScreening.date).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Result: <span className="font-bold">{
                          (selectedPatientData.latestScreening as any).drSeverity ||
                          ((selectedPatientData.latestScreening as any).cataractPrediction === 'CATARACT' ? 'Cataract' : (selectedPatientData.latestScreening as any).cataractPrediction ? 'Normal' : null) ||
                          ((selectedPatientData.latestScreening as any).glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? 'Glaucoma Suspect' : (selectedPatientData.latestScreening as any).glaucomaPrediction ? 'Normal' : null) ||
                          'Completed'
                        }</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 7. Patient-wise Screening Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs lg:col-span-2 overflow-hidden flex flex-col h-[500px]">
          <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Recent Screening Records</h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Last 50 records</span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 text-xs font-semibold uppercase tracking-wider sticky top-0 shadow-[0_1px_0_rgba(203,213,225,1)]">
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">Disease</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Conf.</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredScreenings.slice(0, 50).map(s => {
                  const anyRec = s as any;
                  const severity =
                    anyRec.drSeverity ||
                    (anyRec.cataractPrediction
                      ? (anyRec.cataractPrediction === 'CATARACT' ? 'Cataract' : 'Normal')
                      : null) ||
                    (anyRec.glaucomaPrediction
                      ? (anyRec.glaucomaPrediction === 'GLAUCOMA_SUSPECT' ? 'Glaucoma Suspect' : 'Normal')
                      : null) ||
                    'N/A';
                  // Confidence may be stored as 0-100 (DR) or 0-1 probability (cataract/glaucoma).
                  const rawConf =
                    anyRec.confidence ??
                    (typeof anyRec.cataractProbability === 'number' ? anyRec.cataractProbability * 100 : null) ??
                    (typeof anyRec.glaucomaProbability === 'number' ? anyRec.glaucomaProbability * 100 : null) ??
                    (typeof anyRec.probability === 'number' ? (anyRec.probability <= 1 ? anyRec.probability * 100 : anyRec.probability) : null);
                  const confDisplay =
                    typeof rawConf === 'number' && !isNaN(rawConf) ? `${Math.round(rawConf * 10) / 10}%` : null;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{s.patientName}</div>
                        <div className="text-xs text-slate-500">{s.patientId}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.patientAge}y • {s.patientGender.substring(0, 1)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{s.type}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-medium">
                        {new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${s.isNormal ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {confDisplay ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-700">{confDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const st = (s as any).status || (s as any).overallStatus || 'Completed';
                          return (
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                          st === 'Completed' ? 'bg-sky-50 text-sky-700' :
                          st === 'Referred' ? 'bg-rose-50 text-rose-700' :
                          st === 'Review' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-50 text-slate-600'
                        }`}>
                          {st}
                        </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
                {filteredScreenings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                      No screening records match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
