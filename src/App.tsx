import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const ControllerPage = lazy(() => import('./pages/ControllerPage'));
const DisplayPage = lazy(() => import('./pages/DisplayPage'));
const TournamentPage = lazy(() => import('./pages/TournamentPage'));
const ScheduleDisplayPage = lazy(() => import('./pages/ScheduleDisplayPage'));

function RouteLoadingFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-300 text-sm font-semibold">
      Memuat halaman...
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/controller" element={<ControllerPage />} />
            <Route path="/display" element={<DisplayPage />} />
            <Route path="/tournament" element={<TournamentPage />} />
            <Route path="/schedule" element={<ScheduleDisplayPage />} />
            <Route path="*" element={<Navigate to="/controller" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
