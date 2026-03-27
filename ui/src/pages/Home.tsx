import { useEffect, useState } from "react";
import { listProcesses, type ProcessSummary } from "../services/api";
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
      <h1>Civic Hub</h1>
      <p className="subtitle">Community processes</p>

      {loading && <p>Loading...</p>}
      {error && <p className="error">Failed to load processes: {error}</p>}
      {!loading && !error && <ProcessList processes={processes} />}
    </div>
  );
}
