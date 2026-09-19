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
import { ScreeningHistoryPage } from './components/ScreeningHistoryPage';
import { AdminScreeningsPage } from './components/AdminScreeningsPage';
import { ReferralsPage } from './components/ReferralsPage';
import { SpecialistReviewPage } from './components/SpecialistReviewPage';
import { AdminReportsPage } from './components/AdminReportsPage';
import { DetailedReportPage } from './components/DetailedReportPage';
import { AdminUsersPage } from './components/AdminUsersPage';
import { SettingsPage } from './components/SettingsPage';
import { AddPatientModal } from './components/AddPatientModal';
import { AiExplanationModal } from './components/AiExplanationModal';
import { ScreeningReportModal } from './components/ScreeningReportModal';
import { ReferralModal } from './components/ReferralModal';
import { LanguageModal } from './components/LanguageModal';
import { AiChatbotDrawer } from './components/AiChatbotDrawer';
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
        return <PatientProfilePage />;

      case 'new-screening':
        return <NewScreeningFlow />;

      case 'screening-history':
        return <ScreeningHistoryPage />;

      case 'screenings':
        return <AdminScreeningsPage />;

      case 'referrals':
        return <ReferralsPage />;

      case 'cases-reviews':
        return <SpecialistReviewPage />;

      case 'reports':
        return <AdminReportsPage />;

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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Fixed Left Sidebar (240px width, deep navy #0D1829, blue active box #1E60D5) */}
      <Sidebar
        isOpenOnMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main App Container (offset on desktop by sidebar width: md:pl-[240px]) */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-[240px]">
        {/* Top Navigation Bar */}
        <TopBar onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)} />

        {/* Dynamic Page Views */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-150">
          <ErrorBoundary>
            {renderMainContent()}
          </ErrorBoundary>
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

      <ReferralModal
        isOpen={isReferralModalOpen}
        onClose={() => setIsReferralModalOpen(false)}
      />

      <LanguageModal />
      <AiChatbotDrawer />
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
