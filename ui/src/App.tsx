import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Process from "./pages/Process";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/process/:id" element={<Process />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
