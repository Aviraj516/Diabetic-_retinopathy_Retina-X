import React, { useState } from 'react';
import { X, Download, Share2, CheckCircle2, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { FundusRetinaCanvas } from './FundusRetinaCanvas';
import { useApp } from '../context/AppContext';
import { downloadRetinaXPdf } from '../utils/generateMedicalPdf';
import { ReportRecord } from '../types';

interface ScreeningReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScreeningReportModal: React.FC<ScreeningReportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeScreeningForModal, setIsReferralModalOpen, reports, patients } = useApp();
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen || !activeScreeningForModal) return null;

  const rec = activeScreeningForModal;
  const patient = patients.find((p) => p.id === rec.patientId);
  const existingReport = reports.find((r) => r.screeningId === rec.id || r.patientId === rec.patientId);

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      const reportToUse: ReportRecord = existingReport || {
        id: `REP-${rec.id}`,
        screeningId: rec.id,
        patientId: rec.patientId,
        patientName: rec.patientName,
        patientAge: rec.patientAge,
        patientGender: rec.patientGender,
        patientPhone: patient?.phoneNumber || '+91 98200 00000',
        generatedDate: rec.date,
        eye: rec.eye,
        drSeverity: rec.drSeverity,
        drSeverityLevel: rec.drSeverityLevel,
        confidence: rec.confidence,
        imageQuality: rec.imageQuality,
        imageFileName: 'retina_scan_01.jpg',
        findings: rec.findings,
        referralStatus: rec.drSeverityLevel.includes('Level 0') ? 'Not referred' : 'Referred',
        status: 'Generated',
        nurseName: rec.nurseName,
      };

      await downloadRetinaXPdf(reportToUse, patient);
    } catch (err) {
      console.error('Failed to generate PDF from modal:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header matching reference image #12 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                RETINA-X
              </h2>
              <p className="text-[11px] text-slate-500">
                AI Assisted Retinal Screening Report
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg shadow-2xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Report Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          {/* Patient Details & Fundus Preview Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Left 2 Cols: Clinical Metadata */}
            <div className="md:col-span-2 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Patient ID
                  </span>
                  <span className="font-bold text-slate-900">{rec.patientId}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Name
                  </span>
                  <span className="font-bold text-slate-900">{rec.patientName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Age / Gender
                  </span>
                  <span className="font-semibold text-slate-800">
                    {rec.patientAge} / {rec.patientGender}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Examined Eye
                  </span>
                  <span className="font-semibold text-blue-600">{rec.eye}</span>
                </div>
              </div>

              {/* Severity & Confidence */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">DR Severity:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      (existingReport?.drSeverity || rec.drSeverity) === 'No DR'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : (existingReport?.drSeverity || rec.drSeverity) === 'Mild'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : (existingReport?.drSeverity || rec.drSeverity) === 'Moderate'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {existingReport?.drSeverityLevel || rec.drSeverityLevel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Confidence:</span>
                  <span className="font-bold text-slate-900">
                    {existingReport?.confidence ?? rec.confidence}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Key Findings:</span>
                  <span className="font-medium text-slate-800 text-right">
                    {(existingReport?.findings || rec.findings || []).length > 0
                      ? (existingReport?.findings || rec.findings || []).join(', ')
                      : 'None observed'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Image Quality:</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                    {existingReport?.imageQuality || rec.imageQuality}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 pt-1">
                  <span className="text-slate-500 font-medium shrink-0">
                    Recommendation:
                  </span>
                  <span className="font-medium text-slate-800 text-right">
                    {existingReport?.recommendation || rec.recommendation}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Col: Retinal Image Thumbnail with Grad-CAM overlay */}
            <div className="flex flex-col items-center">
              <div className="w-full max-w-[200px] aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-xs">
                <FundusRetinaCanvas
                  mode="Grad-CAM++"
                  heatmapOpacity={60}
                  imageOriginal={existingReport?.imageOriginal || existingReport?.imageUrl || rec.imageUrl}
                  imageGradCam={existingReport?.imageGradCam}
                  imageLesions={existingReport?.imageLesions}
                  imageAnatomy={existingReport?.imageAnatomy}
                  imageCombined={existingReport?.imageCombined}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2 text-center font-medium">
                Retinal Fundus ({rec.eye === 'Left Eye' ? 'OS' : 'OD'}) with Guided Grad-CAM++ Attention
              </p>
            </div>
          </div>

          {/* Clinical Disclaimer */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500">
            This screening report is generated automatically by the RETINA-X deep learning algorithm.
            It assists certified healthcare personnel in early detection of diabetic retinopathy.
            Final diagnosis and therapeutic interventions must be rendered by a certified
            ophthalmologist.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              setIsReferralModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 rounded-lg border border-slate-200 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Forward to Specialist</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
