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

function statusLabel(status: string): string {
  switch (status) {
    case "draft": return "draft";
    case "proposed": return "gathering support";
    case "threshold_met": return "ready to activate";
    case "active": return "active";
    case "closed": return "closed";
    case "finalized": return "finalized";
    default: return status;
  }
}

export default function ProcessCard({ process }: Props) {
  const isVotable = process.status === "active";
  const isDone = process.status === "closed" || process.status === "finalized";
  const isProposal = process.status === "proposed" || process.status === "threshold_met";

  return (
    <div className="process-card">
      <div className="process-card-header">
        <h3>{process.title}</h3>
        <span className={`status-badge status-${process.status}`}>
          {statusLabel(process.status)}
        </span>
      </div>
      <div className="process-card-meta">
        {isProposal && (
          <span>{process.support_count} of {process.support_threshold} endorsements</span>
        )}
        {(isVotable || isDone) && (
          <span>{process.total_votes} vote{process.total_votes !== 1 ? "s" : ""}</span>
        )}
        {isVotable && process.closes_at && (
          <span>Closes {formatShortDate(process.closes_at)}</span>
        )}
        {isDone && <span>{process.status === "finalized" ? "Finalized" : "Closed"}</span>}
        {process.status === "draft" && <span>Draft</span>}
      </div>
    </div>
  );
}
