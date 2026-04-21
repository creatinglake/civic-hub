import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Nav from "./components/Nav";
import Home from "./pages/Home";
import Votes from "./pages/Votes";
import Process from "./pages/Process";
import About from "./pages/About";
import Propose from "./pages/Propose";
import ProposalDetail from "./pages/ProposalDetail";
import AdminProposals from "./pages/AdminProposals";
import VoteLog from "./pages/VoteLog";
import IntroPopup, { hasSeenIntro } from "./components/IntroPopup";
import "./App.css";

function AppContent() {
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro());

  return (
    <div className="app">
      {showIntro && <IntroPopup onDismiss={() => setShowIntro(false)} />}

      <Nav />

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/votes" element={<Votes />} />
          <Route path="/process/:id" element={<Process />} />
          <Route path="/propose" element={<Propose />} />
          <Route path="/proposal/:id" element={<ProposalDetail />} />
          <Route path="/votes/:id/log" element={<VoteLog />} />
          <Route path="/admin/proposals" element={<AdminProposals />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

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
