import type { ClusterState } from "../../services/api";
import ClusterCard from "./ClusterCard";
import "./ClusterView.css";

interface Props {
  clusters: ClusterState;
}

export default function ClusterView({ clusters }: Props) {
  return (
    <div className="cluster-view">
      <div className="cluster-view-header">
        <h4 className="cluster-view-title">Opinion Groups</h4>
        <span className="cluster-view-meta">
          {clusters.participant_count} participants &middot;{" "}
          {clusters.statement_count} statements &middot;{" "}
          {clusters.groups.length} groups
        </span>
      </div>

      {clusters.consensus.agree.length > 0 && (
        <div className="consensus-section">
          <h5 className="consensus-heading">Broad Agreement</h5>
          <ul className="consensus-list">
            {clusters.consensus.agree.map((c) => (
              <li key={c.statement_id} className="consensus-item consensus-agree">
                <span className="consensus-text">{c.text}</span>
                <span className="consensus-rate">
                  {Math.round(c.agree_rate * 100)}% agree ({c.vote_count} votes)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cluster-grid">
        {clusters.groups.map((g) => (
          <ClusterCard
            key={g.id}
            groupId={g.id}
            size={g.size}
            statements={g.representative_statements}
          />
        ))}
      </div>
    </div>
  );
}
