// @refresh reset
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { SplunkProvider } from '@/contexts/SplunkContext';
import { LlmContextProvider } from '@/contexts/LlmContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { AppErrorBoundary, ContextHealthIndicator } from '@/components/common/AppErrorBoundary';
import { useTheme } from '@/hooks/useTheme';
import { routes } from './routes';

const App: React.FC = () => {
  const { theme } = useTheme();

  return (
    <AppErrorBoundary>
      <Router>
        <AuthProvider>
          <SplunkProvider>
          <LlmContextProvider>
            <RouteGuard>
              <IntersectObserver />
              <div className="flex min-h-screen w-full bg-background text-foreground">
                <Routes>
                  {routes.map((route, index) => (
                    <Route key={index} path={route.path} element={route.element} />
                  ))}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
              <Toaster position="bottom-right" theme={theme} richColors />
            </RouteGuard>
            <ContextHealthIndicator />
          </LlmContextProvider>
          </SplunkProvider>
        </AuthProvider>
      </Router>
    </AppErrorBoundary>
  );
};

export default App;
