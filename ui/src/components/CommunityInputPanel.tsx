// CommunityInputPanel — renders the community comments collected via
// civic.input for a process.
//
// Read-only as of Slice 3.5. Comment submission now happens inside the vote
// flow in VotePanel so comments are always tied to the act of voting.
// This panel just displays what residents have already said.

import { useCallback, useEffect, useState } from "react";
import type { CommunityInput, CommunityInputConfig } from "../services/api";
import { getInputs } from "../services/api";

interface Props {
  processId: string;
  config?: CommunityInputConfig;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function CommunityInputPanel({ processId, config }: Props) {
  const [inputs, setInputs] = useState<CommunityInput[]>([]);

  const fetchInputs = useCallback(() => {
    getInputs(processId)
      .then(setInputs)
      .catch(() => {/* silent — inputs are non-critical */});
  }, [processId]);

  useEffect(() => {
    fetchInputs();
  }, [fetchInputs]);

  if (inputs.length === 0) return null;

  const label = config?.label ?? "Shared alongside residents' votes. Does not affect vote results.";

  return (
    <div className="community-input-panel">
      <h3>Community comments</h3>
      <p className="input-label">{label}</p>

      <div className="input-list">
        <p className="input-count">{inputs.length} comment{inputs.length !== 1 ? "s" : ""}</p>
        {inputs.map((input) => (
          <div key={input.id} className="input-item">
            <p className="input-body">{input.body}</p>
            <span className="input-meta">
              {input.author_id} &middot; {formatRelativeTime(input.submitted_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
