import type { ProcessSummary } from "../services/api";

interface Props {
  process: ProcessSummary;
}

export default function ProcessCard({ process }: Props) {
  return (
    <div className="process-card">
      <div className="process-card-header">
        <h3>{process.title}</h3>
        <span className={`status-badge status-${process.status}`}>
          {process.status}
        </span>
      </div>
      <div className="process-card-meta">
        <span className="process-type">{process.type}</span>
        <span className="process-date">
          {new Date(process.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
