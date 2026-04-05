import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Home from "./pages/Home";
import Process from "./pages/Process";
import About from "./pages/About";
import Propose from "./pages/Propose";
import ProposalDetail from "./pages/ProposalDetail";
import AdminProposals from "./pages/AdminProposals";
import VoteLog from "./pages/VoteLog";
import IntroPopup, { hasSeenIntro } from "./components/IntroPopup";
import "./App.css";

function NavBar() {
  const { user, logout } = useAuth();

  const isAdmin = user?.email === "creatinglake@gmail.com";

  return (
    <nav className="app-nav">
      <div className="nav-links">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/propose" className="nav-link">Propose</Link>
        <Link to="/about" className="nav-link">About</Link>
      </div>
      <div className="nav-right">
        {isAdmin && (
          <Link to="/admin/proposals" className="nav-link nav-link-admin">Admin</Link>
        )}
        {user ? (
          <div className="nav-user">
            <span className="nav-user-email">{user.email}</span>
            <button className="nav-logout" onClick={logout}>Log out</button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function AppContent() {
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro());

  return (
    <div className="app">
      {showIntro && <IntroPopup onDismiss={() => setShowIntro(false)} />}

      <NavBar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/process/:id" element={<Process />} />
        <Route path="/propose" element={<Propose />} />
        <Route path="/proposal/:id" element={<ProposalDetail />} />
        <Route path="/votes/:id/log" element={<VoteLog />} />
        <Route path="/admin/proposals" element={<AdminProposals />} />
        <Route path="/about" element={<About />} />
      </Routes>

      <footer className="app-footer">
        Powered by <a href="https://civic.social" target="_blank" rel="noopener noreferrer">Civic Social</a>
      </footer>
    </div>
  );
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
