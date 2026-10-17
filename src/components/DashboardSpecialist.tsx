import React from 'react';
import {
  FileText,
  AlertOctagon,
  CheckCircle2,
  CalendarClock,
  ArrowRight,
  ClipboardList,
  Users,
  Activity,
  Send,
  Stethoscope,
  Calendar,
  UserPlus,
  PlusCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ScreeningRecord } from '../types';
import { EyeScreeningModules } from './EyeScreeningModules';
import { ClinicalDiseaseReference } from './DiseaseReferenceCards';

interface DashboardSpecialistProps {
  onOpenCaseReview?: (screening: ScreeningRecord) => void;
}

export const DashboardSpecialist: React.FC<DashboardSpecialistProps> = ({
  onOpenCaseReview,
}) => {
  const {
    currentUser,
    screenings,
    patients,
    referrals,
    setActivePage,
    setActiveScreeningForModal,
    t,
  } = useApp();

  const [currentGreeting, setCurrentGreeting] = React.useState<string>(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  React.useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) setCurrentGreeting('Good morning');
      else if (hour < 17) setCurrentGreeting('Good afternoon');
      else setCurrentGreeting('Good evening');
    };
    updateGreeting();
    const interval = setInterval(updateGreeting, 30000);
    return () => clearInterval(interval);
  }, []);

  const getGreeting = () => currentGreeting;

  const doctorName = currentUser?.name
    ? currentUser.name.toLowerCase() === 'avi' || currentUser.name.includes('Arvind') || currentUser.name.includes('Kulkarni')
      ? 'Dr. Aviraj Murkute'
      : currentUser.name.startsWith('Dr.')
      ? currentUser.name
      : `Dr. ${currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1)}`
    : 'Dr. Aviraj Murkute';

  // For a Specialist:
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

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const todaysPatientsCount = patients.filter((p) => p.lastScreeningDate === todayStr || p.createdAt?.startsWith(new Date().toISOString().slice(0, 10))).length;
  const todaysScreeningsCount = screenings.filter((s) => s.date === todayStr).length;

  const handleReviewClick = (caseItem: ScreeningRecord) => {
    setActiveScreeningForModal(caseItem);
    if (onOpenCaseReview) {
      onOpenCaseReview(caseItem);
    } else {
      setActivePage('cases-reviews');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Card matching Reference Image */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold rounded-lg bg-sky-50 text-[#0284C7] border border-sky-100">
              <Stethoscope className="w-4 h-4 text-[#0284C7]" />
              <span>Clinician Workspace Active</span>
            </span>
          </div>
          <h1 className="text-3xl sm:text-[34px] font-extrabold text-[#0F172A] tracking-tight leading-tight">
            {getGreeting()}, {doctorName}
          </h1>
          <p className="text-base sm:text-lg font-medium text-slate-500 mt-1.5">
            Manage patients, screenings, and eye-care reports from one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActivePage('cases-reviews')}
            className="inline-flex items-center gap-2 px-5.5 py-3 bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white text-base font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <ClipboardList className="w-5 h-5" />
            <span>Review Pending Cases ({casesAwaitingReview.length})</span>
          </button>
        </div>
      </div>

      {/* 4 Primary Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: TOTAL PATIENTS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              TOTAL PATIENTS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7]">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {patients.length}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              Enrolled in Registry
            </div>
          </div>
        </div>

        {/* Card 2: TODAY'S PATIENTS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              TODAY'S PATIENTS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {todaysPatientsCount}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              Scheduled for Clinic/Camp
            </div>
          </div>
        </div>

        {/* Card 3: TODAY'S SCREENINGS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              TODAY'S SCREENINGS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7]">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {todaysScreeningsCount}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              Optical AI Captures
            </div>
          </div>
        </div>

        {/* Card 4: PENDING REVIEWS */}
        <div className="p-5.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              PENDING REVIEWS
            </span>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-500">
              <AlertOctagon className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-4xl sm:text-[42px] font-extrabold text-[#0F172A] leading-tight">
              {casesAwaitingReview.length}
            </div>
            <div className="text-sm text-slate-400 font-medium mt-1">
              {casesAwaitingReview.length === 0 ? 'No pending reviews' : `${urgentCases.length} Urgent Priority`}
            </div>
          </div>
        </div>
      </div>



      {/* Eye Screening Modules Section (5 Diseases) */}
      <EyeScreeningModules />

      {/* Cases Awaiting Review Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              {t.casesAwaitingReview}
            </h2>
          </div>
          {casesAwaitingReview.length > 0 && (
            <span className="text-sm font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              {casesAwaitingReview.length} {t.actionNeeded}
            </span>
          )}
        </div>

        {/* Empty state when 0 cases exist */}
        {casesAwaitingReview.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
              <CheckCircle2 className="w-6 h-6 text-teal-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {t.noCasesAwaitingReview}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              {t.noCasesDesc}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-[13px] font-semibold text-slate-500 border-b border-slate-100 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">{t.patientId}</th>
                  <th className="px-5 py-3">{t.fullName}</th>
                  <th className="px-5 py-3">{t.date}</th>
                  <th className="px-5 py-3">{t.selectEye}</th>
                  <th className="px-5 py-3">{t.result}</th>
                  <th className="px-5 py-3">{t.confidence}</th>
                  <th className="px-5 py-3 text-right">{t.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {casesAwaitingReview.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-900">{item.patientId}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{item.patientName}</td>
                    <td className="px-5 py-3 text-slate-500">{item.date}</td>
                    <td className="px-5 py-3">{item.eye}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[13px] font-semibold border ${
                        item.drSeverity === 'Severe' || item.drSeverity === 'PDR'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : item.drSeverity === 'Moderate'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}>
                        {item.drSeverity}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-900">{item.confidence}%</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleReviewClick(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-white bg-[#0284C7] hover:bg-sky-700 rounded-lg transition-colors shadow-2xs"
                      >
                        <span>{t.reviewCase}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Doctor-Facing Disease Reference */}
      <ClinicalDiseaseReference />
    </div>
  );
};
