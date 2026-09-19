import React from 'react';
import {
  FileText,
  AlertOctagon,
  CheckCircle2,
  CalendarClock,
  ArrowRight,
  ClipboardList,
  Eye,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ScreeningRecord } from '../types';

interface DashboardSpecialistProps {
  onOpenCaseReview?: (screening: ScreeningRecord) => void;
}

export const DashboardSpecialist: React.FC<DashboardSpecialistProps> = ({
  onOpenCaseReview,
}) => {
  const {
    currentUser,
    screenings,
    referrals,
    setActivePage,
    setActiveScreeningForModal,
    t,
  } = useApp();

  // For a Specialist:
  // Only count cases/screenings/referrals/reviews assigned to that Specialist according to the existing database relationships.
  // If there are no assigned cases: Cases/Patients = 0, Pending Reviews = 0.
  const assignedCases = screenings.filter((s) => {
    if (!currentUser) return false;
    const isAssignedAssessment =
      s.specialistAssessment?.specialistId === currentUser.id ||
      (s.specialistAssessment?.specialistName &&
        currentUser.name &&
        s.specialistAssessment.specialistName.trim().toLowerCase() === currentUser.name.trim().toLowerCase());

    const isAssignedReferral = referrals.some(
      (r) =>
        r.screeningId === s.id &&
        (r.specialistId === currentUser.id ||
          (r.specialistName &&
            currentUser.name &&
            r.specialistName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()))
    );

    return isAssignedAssessment || isAssignedReferral;
  });

  const casesAwaitingReview = assignedCases.filter(
    (s) => (s.status === 'Referred' || s.status === 'Review') && !s.specialistAssessment
  );

  const urgentCases = casesAwaitingReview.filter(
    (s) => s.drSeverity === 'Severe' || s.drSeverity === 'PDR'
  );

  const reviewedCases = assignedCases.filter((s) => s.status === 'Reviewed');

  const handleReviewClick = (caseItem: ScreeningRecord) => {
    setActiveScreeningForModal(caseItem);
    if (onOpenCaseReview) {
      onOpenCaseReview(caseItem);
    } else {
      setActivePage('cases-reviews');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>{t.welcomeSpecialist}, {currentUser?.name || t.specialistRole}</span>
            <span className="text-2xl select-none" role="img" aria-label="wave">
              👨‍⚕️
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t.specialistSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActivePage('cases-reviews')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow-xs shadow-blue-500/30 transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            <span>{t.reviewPendingCases} ({casesAwaitingReview.length})</span>
          </button>
        </div>
      </div>

      {/* 4 Specialist Stat Cards (all start at 0!) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {/* Card 1: Pending Reviews */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 text-blue-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {casesAwaitingReview.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.pendingReviews}
            </div>
          </div>
        </div>

        {/* Card 2: Urgent Cases */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-red-50 text-red-600 shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {urgentCases.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.urgentCases}
            </div>
          </div>
        </div>

        {/* Card 3: Reviewed Cases */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {reviewedCases.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.reviewedCases}
            </div>
          </div>
        </div>

        {/* Card 4: Follow-ups */}
        <div className="p-4 md:p-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-purple-50 text-purple-600 shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              0
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {t.followUps}
            </div>
          </div>
        </div>
      </div>

      {/* Cases Awaiting Review Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {t.casesAwaitingReview}
          </h2>
          {casesAwaitingReview.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
              {casesAwaitingReview.length} {t.actionNeeded}
            </span>
          )}
        </div>

        {/* Empty state when 0 cases exist */}
        {casesAwaitingReview.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-3.5 rounded-full bg-slate-100 text-slate-400">
              <Eye className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              {t.noCasesAwaitingReview}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {t.noCasesDesc}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">{t.patientId}</th>
                  <th className="px-6 py-3.5">{t.fullName}</th>
                  <th className="px-6 py-3.5">{t.date}</th>
                  <th className="px-6 py-3.5">{t.selectEye}</th>
                  <th className="px-6 py-3.5">{t.result}</th>
                  <th className="px-6 py-3.5">{t.confidence}</th>
                  <th className="px-6 py-3.5 text-right">{t.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                {casesAwaitingReview.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-slate-900">{item.patientId}</td>
                    <td className="px-6 py-3.5 font-medium">{item.patientName}</td>
                    <td className="px-6 py-3.5 text-slate-500">{item.date}</td>
                    <td className="px-6 py-3.5">{item.eye}</td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        {item.drSeverity}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold">{item.confidence}%</td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleReviewClick(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 rounded-lg transition-colors shadow-2xs"
                      >
                        <span>{t.reviewCase}</span>
                        <ArrowRight className="w-3 h-3" />
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
