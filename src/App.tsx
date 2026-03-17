import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useProjectStore } from './store/useProjectStore';
import { ProjectTabs } from './components/ProjectTabs/ProjectTabs';
import { GanttView } from './components/GanttView/GanttView';
import { LoginPage } from './pages/LoginPage';
import { AuthCallback } from './pages/AuthCallback';
import { AccountSetupPage } from './pages/AccountSetupPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage';
import styles from './App.module.css';

function MainApp() {
  return (
    <div className={styles.app}>
      <ProjectTabs />
      <GanttView />
    </div>
  );
}

function AppRoutes() {
  const { user, account, loading } = useAuth();
  const { initializeApp, reset } = useProjectStore();

  useEffect(() => {
    if (user && account) {
      initializeApp(account.id);
    } else if (!user) {
      reset();
    }
  }, [user?.id, account?.id]);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-muted)',
        fontSize: '16px',
      }}>
        טוען...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/app" replace />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/setup"
        element={user && !account ? <AccountSetupPage /> : <Navigate to={user ? '/app' : '/login'} replace />}
      />
      <Route
        path="/app"
        element={
          !user ? <Navigate to="/login" replace />
          : !account ? <Navigate to="/setup" replace />
          : <MainApp />
        }
      />
      <Route
        path="/profile"
        element={user ? <ProfilePage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/admin"
        element={user ? <AdminPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/settings/workspace"
        element={user ? <WorkspaceSettingsPage /> : <Navigate to="/login" replace />}
      />
      <Route path="/" element={<Navigate to={user ? '/app' : '/login'} replace />} />
      <Route path="*" element={<Navigate to={user ? '/app' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
