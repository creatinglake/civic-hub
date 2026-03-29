import { useEffect, useState } from "react";
import { listProcesses, type ProcessSummary } from "../services/api";
import HubHeader from "../components/HubHeader";
import ProcessList from "../components/ProcessList";

export default function Home() {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProcesses()
      .then(setProcesses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <HubHeader />

      <section className="section">
        <h2 className="section-title">Community votes</h2>

        {loading && <p>Loading...</p>}
        {error && <p className="error">Failed to load votes: {error}</p>}
        {!loading && !error && <ProcessList processes={processes} />}
      </section>
    </div>
  );
}
