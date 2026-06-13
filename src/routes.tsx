import type { ReactNode } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HistoryPage from './pages/HistoryPage';
import PredictiveRiskPage from './pages/PredictiveRiskPage';
import CorrelationGraphPage from './pages/CorrelationGraphPage';
import DecisionJournalPage from './pages/DecisionJournalPage';
// Phase 2
import RemediationPage from './pages/RemediationPage';
import PolicyGuardrailsPage from './pages/PolicyGuardrailsPage';
import IncidentLearningPage from './pages/IncidentLearningPage';
// Phase 3
import AuditTrailPage from './pages/AuditTrailPage';
import CompliancePackPage from './pages/CompliancePackPage';
// Phase 4
import CostOptimizerPage from './pages/CostOptimizerPage';
import CommandCenterPage from './pages/CommandCenterPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: 'Login',
    path: '/login',
    element: <LoginPage />,
    public: true,
    visible: false,
  },
  {
    name: 'Dashboard',
    path: '/',
    element: <DashboardPage />,
  },
  {
    name: 'Analytics',
    path: '/analytics',
    element: <AnalyticsPage />,
  },
  {
    name: 'Settings',
    path: '/settings',
    element: <SettingsPage />,
  },
  {
    name: 'History',
    path: '/history',
    element: <HistoryPage />,
  },
  // Phase 1 — Intelligence
  {
    name: 'Predictive Risk',
    path: '/risk',
    element: <PredictiveRiskPage />,
  },
  {
    name: 'Correlation Graph',
    path: '/correlation',
    element: <CorrelationGraphPage />,
  },
  {
    name: 'Decision Journal',
    path: '/journal',
    element: <DecisionJournalPage />,
  },
  // Phase 2 — Autonomous Remediation
  {
    name: 'Remediation',
    path: '/remediation',
    element: <RemediationPage />,
  },
  {
    name: 'Policy Guardrails',
    path: '/guardrails',
    element: <PolicyGuardrailsPage />,
  },
  {
    name: 'Incident Learning',
    path: '/learning',
    element: <IncidentLearningPage />,
  },
  // Phase 3 — Compliance
  {
    name: 'Audit Trail',
    path: '/audit',
    element: <AuditTrailPage />,
  },
  {
    name: 'Compliance Packs',
    path: '/compliance',
    element: <CompliancePackPage />,
  },
  // Phase 4 — Optimization & Command
  {
    name: 'Cost Optimizer',
    path: '/optimizer',
    element: <CostOptimizerPage />,
  },
  {
    name: 'Command Center',
    path: '/command',
    element: <CommandCenterPage />,
  },
];
