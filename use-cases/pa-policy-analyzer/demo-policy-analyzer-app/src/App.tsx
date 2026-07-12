import { useState } from 'react';
import {
  OxygenUIThemeProvider,
  OxygenTheme,
  AppShell,
  Header,
  Sidebar,
  ColorSchemeToggle,
  UserMenu,
  Box,
  CircularProgress,
} from '@wso2/oxygen-ui';
import {
  ClipboardList,
  Plus,
  Shield,
  Users,
  Settings,
  LogOut,
  User,
  Building2,
} from '@wso2/oxygen-ui-icons-react';
import { AuthProvider } from './components/AuthProvider';
import { useAuth } from './components/useAuth';
import { EvaluationsPage } from './pages/EvaluationsPage';
import { EvaluationDetailPage } from './pages/EvaluationDetailPage';
import { NewEvaluationPage } from './pages/NewEvaluationPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { PatientsPage } from './pages/PatientsPage';
import { PayerOnboardingPage } from './pages/PayerOnboardingPage';

type PageName =
  | 'evaluations'
  | 'evaluation-detail'
  | 'new-evaluation'
  | 'policies'
  | 'patients'
  | 'payer-onboarding';

interface PageState {
  name: PageName;
  params?: Record<string, string>;
}

const navItems = [
  { id: 'new-evaluation', label: 'New Evaluation', icon: <Plus size={18} /> },
  { id: 'evaluations', label: 'Evaluations', icon: <ClipboardList size={18} /> },
  { id: 'policies', label: 'Policies', icon: <Shield size={18} /> },
  { id: 'patients', label: 'Patients', icon: <Users size={18} /> },
  { id: 'payer-onboarding', label: 'Onboard Payer', icon: <Building2 size={18} /> },
];

function AuthenticatedApp() {
  const { isAuthenticated, userInfo, isLoading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState<PageState>({ name: 'evaluations' });

  const navigate = (name: string, params?: Record<string, string>) => {
    setPage({ name: name as PageName, params });
  };

  const activeId =
    page.name === 'evaluation-detail' ? 'evaluations' : page.name;

  const renderPage = () => {
    switch (page.name) {
      case 'evaluations':
        return <EvaluationsPage onNavigate={navigate} />;
      case 'evaluation-detail':
        return (
          <EvaluationDetailPage
            evalId={page.params?.id ?? ''}
            onNavigate={navigate}
          />
        );
      case 'new-evaluation':
        return <NewEvaluationPage onNavigate={navigate} />;
      case 'policies':
        return <PoliciesPage />;
      case 'patients':
        return <PatientsPage onNavigate={navigate} />;
      case 'payer-onboarding':
        return <PayerOnboardingPage onNavigate={navigate} />;
      default:
        return <EvaluationsPage onNavigate={navigate} />;
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
    }
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated || !userInfo) {
    return null;
  }

  const displayName =
    `${userInfo.first_name} ${userInfo.last_name}`.trim() || userInfo.username;
  const userEmail = userInfo.email;

  return (
    <AppShell>
      <AppShell.Navbar>
        <Header>
          <Header.Toggle
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
          />
          <Header.Brand>
            <Header.BrandLogo>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1.5,
                  bgcolor: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Shield size={16} color="white" />
              </Box>
            </Header.BrandLogo>
            <Header.BrandTitle>PA Policy Analyzer</Header.BrandTitle>
          </Header.Brand>
          <Header.Spacer />
          <Header.Actions>
            <ColorSchemeToggle />
            <UserMenu>
              <UserMenu.Trigger name={displayName} />
              <UserMenu.Header
                name={displayName}
                email={userEmail}
                role="Reviewer"
              />
              <UserMenu.Item icon={<User size={18} />} label="Profile" onClick={() => {}} />
              <UserMenu.Item icon={<Settings size={18} />} label="Settings" onClick={() => {}} />
              <UserMenu.Divider />
              <UserMenu.Logout icon={<LogOut size={18} />} onClick={handleLogout} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </AppShell.Navbar>

      <AppShell.Sidebar>
        <Sidebar
          collapsed={collapsed}
          activeItem={activeId}
          onSelect={(id) => navigate(id)}
        >
          <Sidebar.Nav>
            <Sidebar.Category>
              {navItems.map((item) => (
                <Sidebar.Item key={item.id} id={item.id}>
                  <Sidebar.ItemIcon>{item.icon}</Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>{item.label}</Sidebar.ItemLabel>
                </Sidebar.Item>
              ))}
            </Sidebar.Category>
          </Sidebar.Nav>
          <Sidebar.Footer>
            <Sidebar.Item id="settings">
              <Sidebar.ItemIcon>
                <Settings size={18} />
              </Sidebar.ItemIcon>
              <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
            </Sidebar.Item>
          </Sidebar.Footer>
        </Sidebar>
      </AppShell.Sidebar>

      <AppShell.Main>
        <Box
          sx={{
            height: '100%',
            width: '100%',
            overflow: page.name === 'evaluation-detail' || page.name === 'patients' ? 'hidden' : 'auto',
          }}
        >
          {renderPage()}
        </Box>
      </AppShell.Main>

    </AppShell>
  );
}

export default function App() {
  return (
    <OxygenUIThemeProvider theme={OxygenTheme}>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </OxygenUIThemeProvider>
  );
}
