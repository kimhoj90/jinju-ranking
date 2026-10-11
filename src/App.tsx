import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { renderGlobalModal } from './components/GlobalModals';
import Layout from './components/Layout';
import { AuthProvider, SiteProvider, UiProvider } from './context/AppContext';
import AuthCallback from './pages/AuthCallback';
import Home from './pages/Home';
import Login from './pages/Login';
import Play from './pages/Play';
import Ranking from './pages/Ranking';
import Result from './pages/Result';
import { Contact, NotFound, Privacy, Records, Terms } from './pages/StaticPages';
import { SurveyBoard, SurveyDetail, SurveyWrite } from './pages/Surveys';

// 운영자 화면과 에디터는 필요할 때만 불러온다 (첫 화면을 가볍게)
const Admin = lazy(() => import('./pages/admin/Admin'));
const Propose = lazy(() => import('./pages/Propose'));

const loading = <main className="wrap"><p className="muted">불러오는 중…</p></main>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SiteProvider>
          <UiProvider render={renderGlobalModal}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="r/:slug" element={<Home />} />
                <Route path="r/:slug/play" element={<Play />} />
                <Route path="r/:slug/result" element={<Result />} />
                <Route path="r/:slug/ranking" element={<Ranking />} />
                <Route path="surveys" element={<SurveyBoard />} />
                <Route path="surveys/new" element={<SurveyWrite />} />
                <Route path="surveys/:id" element={<SurveyDetail />} />
                <Route path="records" element={<Records />} />
                <Route path="propose" element={<Suspense fallback={loading}><Propose /></Suspense>} />
                <Route path="login" element={<Login />} />
                <Route path="auth/callback" element={<AuthCallback />} />
                <Route path="privacy" element={<Privacy />} />
                <Route path="terms" element={<Terms />} />
                <Route path="contact" element={<Contact />} />
                <Route path="admin/*" element={<Suspense fallback={loading}><Admin /></Suspense>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </UiProvider>
        </SiteProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
