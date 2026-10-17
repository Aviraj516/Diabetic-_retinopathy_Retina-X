import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LoginPage } from './components/LoginPage';
import { TwoStepVerificationPage } from './components/TwoStepVerificationPage';
import { MFAEnrollmentPage } from './components/MFAEnrollmentPage';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardNurse } from './components/DashboardNurse';
import { DashboardSpecialist } from './components/DashboardSpecialist';
import { DashboardAdmin } from './components/DashboardAdmin';
import { PatientsPage } from './components/PatientsPage';
import { PatientProfilePage } from './components/PatientProfilePage';
import { NewScreeningFlow } from './components/NewScreeningFlow';
import { NewScreeningEntry } from './components/NewScreeningEntry';
import { ScreeningHistoryPage } from './components/ScreeningHistoryPage';
import { AdminScreeningsPage } from './components/AdminScreeningsPage';
import { ReferralsPage } from './components/ReferralsPage';
import { SpecialistReviewPage } from './components/SpecialistReviewPage';
import { ReportsPage } from './components/ReportsPage';
import { AdminReportsPage } from './components/AdminReportsPage';
import { DetailedReportPage } from './components/DetailedReportPage';
import { AdminUsersPage } from './components/AdminUsersPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { SettingsPage } from './components/SettingsPage';
import { CataractScreeningFlow } from './components/CataractScreeningFlow';
import { CataractHistoryPage } from './components/CataractHistoryPage';
import { CataractReportPage } from './components/CataractReportPage';
import { CataractReportModal } from './components/CataractReportModal';
import { GlaucomaScreeningFlow } from './components/GlaucomaScreeningFlow';
import { GlaucomaHistoryPage } from './components/GlaucomaHistoryPage';
import { GlaucomaReportPage } from './components/GlaucomaReportPage';
import { GlaucomaReportModal } from './components/GlaucomaReportModal';
import { AddPatientModal } from './components/AddPatientModal';
import { AiExplanationModal } from './components/AiExplanationModal';
import { ScreeningReportModal } from './components/ScreeningReportModal';
import { ReferralModal } from './components/ReferralModal';
import { LanguageModal } from './components/LanguageModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const AppContent: React.FC = () => {
  const {
    currentUser,
    isAuthRestoring,
    authStage,
    pendingUser,
    currentRole,
    activePage,
    isAddPatientModalOpen,
    setIsAddPatientModalOpen,
    isExplanationModalOpen,
    setIsExplanationModalOpen,
    isReportModalOpen,
    setIsReportModalOpen,
    isReferralModalOpen,
    setIsReferralModalOpen,
  } = useApp();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // If restoring session on reload, prevent screen flash
  if (isAuthRestoring && currentUser) {
    return (
      <div className="min-h-screen bg-[#0D1829] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold tracking-wider text-slate-300">Loading RETINA-X Platform...</p>
      </div>
    );
  }

  // If not logged in, render either MFA Enrollment, Two-Step Verification, or Login
  if (!currentUser) {
    if (authStage === 'mfa-enroll' && pendingUser) {
      return <MFAEnrollmentPage />;
    }
    if (authStage === 'mfa' && pendingUser) {
      return <TwoStepVerificationPage />;
    }
    return <LoginPage />;
  }

  const renderMainContent = () => {
    switch (activePage) {
      case 'dashboard':
        if (currentRole === 'admin') return <DashboardAdmin />;
        if (currentRole === 'specialist') return <DashboardSpecialist />;
        return <DashboardNurse />;

      case 'patients':
        return <PatientsPage />;

      case 'patient-detail':
        return (
          <>
            <PatientsPage />
            <PatientProfilePage />
          </>
        );

      case 'new-screening':
        return <NewScreeningEntry />;

      case 'dr-screening':
        return <NewScreeningFlow />;

      case 'screening-history':
        return <ScreeningHistoryPage />;

      case 'cataract-screening':
        return <CataractScreeningFlow />;

      case 'cataract-history':
        return <CataractHistoryPage />;

      case 'cataract-report-detail':
        return <CataractReportPage />;

      case 'glaucoma-screening':
        return <GlaucomaScreeningFlow />;

      case 'glaucoma-history':
        return <GlaucomaHistoryPage />;

      case 'glaucoma-report-detail':
        return <GlaucomaReportPage />;

      case 'analytics':
        return <AnalyticsPage />;

      case 'reports-card':
        return <ReportsPage />;

      case 'screenings':
        return <AdminScreeningsPage />;

      case 'referrals':
        return <ReferralsPage />;

      case 'cases-reviews':
        return <SpecialistReviewPage />;

      case 'reports':
        return <ReportsPage />;

      case 'report-detail':
        return <DetailedReportPage />;

      case 'users':
        return <AdminUsersPage />;

      case 'settings':
        return <SettingsPage />;

      default:
        if (currentRole === 'admin') return <DashboardAdmin />;
        if (currentRole === 'specialist') return <DashboardSpecialist />;
        return <DashboardNurse />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar - Full Width across top */}
      <TopBar onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)} />

      {/* Main Body: Real Dashboard Layout with Left-Docked Sidebar and Main Content */}
      <div className="flex-1 flex min-w-0 w-full">
        <Sidebar
          isOpenOnMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Dynamic Page Views */}
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-7 overflow-y-auto animate-in fade-in duration-150">
          <div className="max-w-[1600px] w-full mx-auto">
            <ErrorBoundary>
              {renderMainContent()}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Shared Modals */}
      <AddPatientModal
        isOpen={isAddPatientModalOpen}
        onClose={() => setIsAddPatientModalOpen(false)}
      />

      <AiExplanationModal
        isOpen={isExplanationModalOpen}
        onClose={() => setIsExplanationModalOpen(false)}
      />

      <ScreeningReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />

      <CataractReportModal />
      <GlaucomaReportModal />

      <ReferralModal
        isOpen={isReferralModalOpen}
        onClose={() => setIsReferralModalOpen(false)}
      />

      <LanguageModal />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
