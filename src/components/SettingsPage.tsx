import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Building2,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  Server,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const SettingsPage: React.FC = () => {
  const {
    isOnline,
    setIsOnline,
    pendingSyncCount,
    syncPendingRecords,
    resetAllData,
    patients,
    screenings,
    referrals,
    t,
  } = useApp();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState(false);

  const handleSyncNow = () => {
    setIsSyncing(true);
    setTimeout(() => {
      syncPendingRecords();
      setIsSyncing(false);
      setSyncSuccessMessage(true);
      setTimeout(() => setSyncSuccessMessage(false), 2500);
    }, 1000);
  };

  const handleResetData = () => {
    resetAllData();
    setResetConfirmation(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.settings}</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {t.clinicStationProfile} &amp; {t.networkSyncStatus}
        </p>
      </div>

      <div className="space-y-5">
        {/* Connectivity & Cloud Sync Card */}
        <div className="p-6 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <Server className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {t.networkSyncStatus}
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${
                  isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-bold text-slate-900">
                  {isOnline ? `${t.online} (${t.allDataSynced})` : `${t.offline} (${t.workingOffline})`}
                </p>
                <p className="text-slate-500 mt-0.5">
                  {isOnline
                    ? t.onlineModeDesc
                    : t.offlineModeDesc}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOnline(!isOnline)}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg font-semibold text-slate-700 transition-colors self-start sm:self-auto"
            >
              {isOnline ? t.offline : t.online}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1 text-xs">
            <div>
              <p className="font-semibold text-slate-800">
                {t.pendingLocalSync}: <span className="font-bold text-blue-600">{pendingSyncCount} {t.totalRecords}</span>
              </p>
              <p className="text-slate-500 text-[11px]">
                {t.lastCloudSync}: {t.date}
              </p>
            </div>

            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncNow}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E60D5] hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg shadow-2xs transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? `${t.syncNow}...` : t.syncNow}</span>
            </button>
          </div>

          {syncSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t.syncSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* Station / Clinic Profile */}
        <div className="p-6 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <Building2 className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {t.clinicStationProfile}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                {t.facilityName}
              </label>
              <input
                type="text"
                readOnly
                value="District Rural Health Center #4"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium cursor-not-allowed"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                {t.cameraModel}
              </label>
              <input
                type="text"
                readOnly
                value="Remidio Non-Mydriatic Fundus AI-Cam"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Empty State / Reset System Data */}
        <div className="p-6 bg-white rounded-xl border border-red-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-red-100">
            <Trash2 className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-bold text-red-900">
              {t.resetAllData}
            </h2>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {t.totalPatients}: <strong>{patients.length}</strong>,{' '}
            {t.totalScreenings}: <strong>{screenings.length}</strong>,{' '}
            {t.totalReferrals}: <strong>{referrals.length}</strong>.<br />
            {t.resetDataConfirmDesc}
          </p>

          {!resetConfirmation ? (
            <button
              type="button"
              onClick={() => setResetConfirmation(true)}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold text-xs rounded-lg transition-colors"
            >
              {t.resetAllData}
            </button>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-300 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
              <div className="flex-1 text-xs text-red-800 font-medium">
                {t.resetDataConfirmDesc}
              </div>
              <button
                type="button"
                onClick={handleResetData}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg"
              >
                {t.delete}
              </button>
              <button
                type="button"
                onClick={() => setResetConfirmation(false)}
                className="px-3 py-1.5 bg-white text-slate-700 font-semibold text-xs rounded-lg border border-slate-300"
              >
                {t.cancel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
