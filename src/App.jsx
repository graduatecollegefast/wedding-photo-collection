import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import EventPage from './pages/EventPage.jsx';
import NotFound from './pages/NotFound.jsx';

// The dashboard is loaded only when the couple opens it, so guests on slow
// connections download just the upload page.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));

export default function App() {
  return (
    <Routes>
      <Route path="/event/:slug" element={<EventPage />} />
      <Route
        path="/dashboard"
        element={
          <Suspense fallback={<div className="page-loading" role="status">Loading…</div>}>
            <Dashboard />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
