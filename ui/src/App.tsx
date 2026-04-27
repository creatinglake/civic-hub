import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Nav from "./components/Nav";
import HubBanner from "./components/HubBanner";
import Home from "./pages/Home";
import Votes from "./pages/Votes";
import Process from "./pages/Process";
import About from "./pages/About";
import SearchPage from "./pages/Search";
import Propose from "./pages/Propose";
import ProposalDetail from "./pages/ProposalDetail";
import AdminProposals from "./pages/AdminProposals";
import AdminVoteResults from "./pages/AdminVoteResults";
import AdminMeetingSummaries from "./pages/AdminMeetingSummaries";
import AdminSettings from "./pages/AdminSettings";
import VoteResults from "./pages/VoteResults";
import MeetingSummary from "./pages/MeetingSummary";
import VoteLog from "./pages/VoteLog";
import PostAnnouncement from "./pages/PostAnnouncement";
import AnnouncementPage from "./pages/Announcement";
import Settings from "./pages/Settings";
import IntroPopup, { hasSeenIntro } from "./components/IntroPopup";
import "./App.css";

// Routes that show the hub banner above the nav. Detail/action pages
// (/process/:id, /propose, etc.) stay compact so task-focused flows are
// not pushed down by 200px of imagery.
const BANNER_ROUTES = new Set(["/", "/votes"]);

function BannerSlot() {
  const { pathname } = useLocation();
  if (!BANNER_ROUTES.has(pathname)) return null;
  return <HubBanner />;
}

function AppContent() {
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro());

  return (
    <div className="app">
      {showIntro && <IntroPopup onDismiss={() => setShowIntro(false)} />}

      <BannerSlot />
      <Nav />

      <main className="page-shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/votes" element={<Votes />} />
          <Route path="/process/:id" element={<Process />} />
          <Route path="/propose" element={<Propose />} />
          <Route path="/proposal/:id" element={<ProposalDetail />} />
          <Route path="/votes/:id/log" element={<VoteLog />} />
          <Route path="/admin/proposals" element={<AdminProposals />} />
          <Route path="/admin/vote-results" element={<AdminVoteResults />} />
          <Route path="/admin/vote-results/:id" element={<AdminVoteResults />} />
          {/* Legacy admin paths from before the Slice 8.5 rename — redirect
              so old bookmarks / nav muscle-memory continue to work. */}
          <Route
            path="/admin/briefs"
            element={<Navigate to="/admin/vote-results" replace />}
          />
          <Route path="/admin/briefs/:id" element={<LegacyBriefAdminRedirect />} />
          <Route
            path="/admin/meeting-summaries"
            element={<AdminMeetingSummaries />}
          />
          <Route
            path="/admin/meeting-summaries/:id"
            element={<AdminMeetingSummaries />}
          />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/vote-results/:id" element={<VoteResults />} />
          {/* Legacy public path: historical event action_urls point at
              /brief/:id. Vercel rewrites all non-/api requests to
              index.html, so this React Router route is the operative
              redirect for browser navigation. The Express app also has
              a 301 at /brief/:id for direct API/curl clients. */}
          <Route path="/brief/:id" element={<LegacyBriefRedirect />} />
          <Route path="/meeting-summary/:id" element={<MeetingSummary />} />
          <Route path="/announcement/new" element={<PostAnnouncement />} />
          <Route path="/announcement/:id/edit" element={<PostAnnouncement />} />
          <Route path="/announcement/:id" element={<AnnouncementPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </main>

      <footer className="app-footer">
        Powered by <a href="https://civic.social" target="_blank" rel="noopener noreferrer">Civic Social</a>
      </footer>
    </div>
  );
}

/**
 * Wrapper that pulls the :id param and 301-equivalents to the new
 * /vote-results/:id route. <Navigate replace> keeps history clean so
 * the back button doesn't bounce.
 */
function LegacyBriefRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/vote-results/${id}`} replace />;
}

function LegacyBriefAdminRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/admin/vote-results/${id}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
