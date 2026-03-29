import type { VoteSummary } from "../services/api";

interface Props {
  process: VoteSummary;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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
        <span>{process.total_votes} vote{process.total_votes !== 1 ? "s" : ""}</span>
        {process.status === "open" && process.closes_at && (
          <span>Closes {formatShortDate(process.closes_at)}</span>
        )}
        {process.status === "closed" && <span>Closed</span>}
      </div>
    </div>
  );
}
