import { Link } from "react-router-dom";
import type { ProcessSummary } from "../services/api";
import ProcessCard from "./ProcessCard";

interface Props {
  processes: ProcessSummary[];
}

export default function ProcessList({ processes }: Props) {
  if (processes.length === 0) {
    return (
      <div className="empty-state">
        <p>No processes yet.</p>
        <p className="hint">
          Seed data at{" "}
          <a href="http://localhost:3000/debug/seed" target="_blank" rel="noreferrer">
            /debug/seed
          </a>{" "}
          then refresh.
        </p>
      </div>
    );
  }

  return (
    <ul className="process-list">
      {processes.map((p) => (
        <li key={p.id}>
          <Link to={`/process/${p.id}`} className="process-link">
            <ProcessCard process={p} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
