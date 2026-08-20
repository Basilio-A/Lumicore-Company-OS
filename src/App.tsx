import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PrefsProvider } from '@/context/PrefsContext';
import { ProductsProvider } from '@/context/ProductsContext';
import { RequireAuth, RequireFounder } from '@/components/guards';
import { AppLayout } from '@/components/AppLayout';

import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import PendingPage from '@/pages/auth/PendingPage';

import OverviewPage from '@/pages/OverviewPage';
import SettingsPage from '@/pages/SettingsPage';

import ProductDashboard from '@/pages/product/ProductDashboard';
import TaskBoard from '@/pages/product/TaskBoard';
import SprintsPage from '@/pages/product/SprintsPage';
import DocsPage from '@/pages/product/DocsPage';
import KnowledgeBasePage from '@/pages/product/KnowledgeBasePage';
import ChatPage from '@/pages/product/ChatPage';
import ProductTeamPage from '@/pages/product/ProductTeamPage';

import TeamHubPage from '@/pages/company/TeamHubPage';
import EmployeeOfTheMonthPage from '@/pages/company/EmployeeOfTheMonthPage';
import EquityPage from '@/pages/company/EquityPage';
import InvestorPortalPage from '@/pages/company/InvestorPortalPage';
import TechStackPage from '@/pages/company/TechStackPage';
import FinancialsPage from '@/pages/company/FinancialsPage';

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="font-display font-bold text-lg text-[var(--text)]">Lumicore<span className="accent">.</span></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/overview" replace /> : <LoginPage />} />
      <Route path="/signup" element={session ? <Navigate to="/overview" replace /> : <SignupPage />} />
      <Route path="/request-access" element={<Navigate to="/signup" replace />} />
      <Route path="/forgot-password" element={session ? <Navigate to="/overview" replace /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/pending" element={<PendingPage />} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route path="/company/team-hub" element={<TeamHubPage />} />
        <Route path="/company/employee-of-the-month" element={<EmployeeOfTheMonthPage />} />
        <Route path="/company/investors" element={<InvestorPortalPage />} />
        <Route path="/company/tech-stack" element={<TechStackPage />} />
        <Route path="/company/financials" element={<RequireFounder><FinancialsPage /></RequireFounder>} />
        <Route path="/company/equity" element={<RequireFounder><EquityPage /></RequireFounder>} />

        <Route path="/product/:productSlug/dashboard" element={<ProductDashboard />} />
        <Route path="/product/:productSlug/tasks" element={<TaskBoard />} />
        <Route path="/product/:productSlug/sprints" element={<SprintsPage />} />
        <Route path="/product/:productSlug/docs" element={<DocsPage />} />
        <Route path="/product/:productSlug/knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="/product/:productSlug/chat" element={<ChatPage />} />
        <Route path="/product/:productSlug/team" element={<ProductTeamPage />} />
      </Route>

      <Route path="*" element={<Navigate to={session ? '/overview' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <AuthProvider>
        <ProductsProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ProductsProvider>
      </AuthProvider>
    </PrefsProvider>
  );
}
