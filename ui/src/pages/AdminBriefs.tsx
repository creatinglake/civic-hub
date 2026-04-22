import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  adminListBriefs,
  adminGetBrief,
  adminPatchBrief,
  adminApproveBrief,
  adminGetSettings,
  adminPatchSettings,
  type BriefDetail,
  type BriefPublicationStatus,
  type BriefSummary,
} from "../services/api";
import AdminTabs from "../components/AdminTabs";
import "./AdminBriefs.css";

const STATUS_FILTERS: Array<{ id: "all" | BriefPublicationStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "published", label: "Published" },
];

export default function AdminBriefs() {
  const navigate = useNavigate();
  const { id: routeBriefId } = useParams<{ id?: string }>();
  const view: "list" | "review" = routeBriefId ? "review" : "list";

  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [selected, setSelected] = useState<BriefDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | BriefPublicationStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Review form state
  const [commentsText, setCommentsText] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);

  // Settings (recipient email list)
  const [recipientsText, setRecipientsText] = useState("");
  const [recipientsLoaded, setRecipientsLoaded] = useState(false);
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [recipientsMessage, setRecipientsMessage] = useState<string | null>(null);

  useEffect(() => {
    adminGetSettings()
      .then((s) => {
        setRecipientsText(s.brief_recipient_emails.join(", "));
        setRecipientsLoaded(true);
      })
      .catch((err: Error) => {
        setError(`Could not load settings: ${err.message}`);
      });
  }, []);

  async function saveRecipients() {
    setSavingRecipients(true);
    setRecipientsMessage(null);
    try {
      const input = recipientsText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const saved = await adminPatchSettings({ brief_recipient_emails: input });
      setRecipientsText(saved.brief_recipient_emails.join(", "));
      setRecipientsMessage(
        saved.brief_recipient_emails.length === 0
          ? "Cleared — approvals will be blocked until a recipient is set."
          : `Saved. Briefs will be delivered to ${saved.brief_recipient_emails.length} recipient(s).`,
      );
    } catch (err) {
      setRecipientsMessage(
        err instanceof Error ? err.message : "Failed to save recipients",
      );
    } finally {
      setSavingRecipients(false);
    }
  }

  function loadList() {
    setLoading(true);
    setError(null);
    adminListBriefs()
      .then(setBriefs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadList();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return briefs;
    return briefs.filter((b) => b.publication_status === statusFilter);
  }, [briefs, statusFilter]);

  function openReview(id: string) {
    setError(null);
    setActionMessage(null);
    navigate(`/admin/briefs/${id}`);
  }

  function backToList() {
    setConfirmingApprove(false);
    setActionMessage(null);
    setError(null);
    navigate("/admin/briefs");
  }

  // Load the selected brief whenever the URL id changes. When we navigate
  // back to /admin/briefs (no id), clear the selection so stale state
  // doesn't flash on next entry.
  useEffect(() => {
    if (!routeBriefId) {
      setSelected(null);
      return;
    }
    setError(null);
    setActionMessage(null);
    adminGetBrief(routeBriefId)
      .then((brief) => {
        setSelected(brief);
        setCommentsText(brief.content.comments.join("\n"));
        setAdminNotes(brief.content.admin_notes);
        setConfirmingApprove(false);
      })
      .catch((err: Error) => setError(err.message));
  }, [routeBriefId]);

  async function saveDraft() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await adminPatchBrief(selected.id, {
        comments: parseCommentsText(commentsText),
        admin_notes: adminNotes,
      });
      setSelected(updated);
      setActionMessage("Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!selected) return;
    setApproving(true);
    setError(null);
    try {
      // Save any unsaved edits first so the published brief matches what the
      // admin is looking at.
      await adminPatchBrief(selected.id, {
        comments: parseCommentsText(commentsText),
        admin_notes: adminNotes,
      });
      const { brief } = await adminApproveBrief(selected.id);
      setSelected(brief);
      setActionMessage(
        `Approved. Brief delivered to ${brief.delivered_to.length} recipient(s) and published to the feed.`,
      );
      setConfirmingApprove(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(false);
    }
  }

  if (view === "review" && selected) {
    const isPending = selected.publication_status === "pending";
    return (
      <div className="page admin-briefs-page">
        <AdminTabs />
        <div className="admin-briefs-body">
          <button className="admin-back-link" onClick={backToList} type="button">
            &larr; Back to Civic Briefs
          </button>
          <h1>Review: {selected.title}</h1>
          <p className="admin-subtitle">
            Status: <StatusChip status={selected.publication_status} /> · Generated{" "}
            {formatDateTime(selected.generated_at)}
          </p>

          {actionMessage && <p className="admin-action-message">{actionMessage}</p>}
          {error && <p className="form-error">{error}</p>}

          <section className="admin-detail-section">
            <h3>Participation</h3>
            <p>
              {selected.content.participation_count} resident
              {selected.content.participation_count === 1 ? "" : "s"} voted.
            </p>
          </section>

          <section className="admin-detail-section">
            <h3>Positions</h3>
            <ul className="brief-positions-list">
              {selected.content.position_breakdown.map((p) => (
                <li key={p.option_id}>
                  <strong>{p.option_label}:</strong> {p.count} ({p.percentage}%)
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-detail-section">
            <h3>Community comments</h3>
            <p className="form-hint">
              One comment per line. Empty lines are ignored; duplicates are
              removed. This field will be pre-populated from civic.input in a
              future slice — for now, add anything worth surfacing to the Board.
            </p>
            <textarea
              className="form-textarea"
              rows={6}
              value={commentsText}
              onChange={(e) => setCommentsText(e.target.value)}
              disabled={!isPending}
              placeholder="(none)"
            />
          </section>

          <section className="admin-detail-section">
            <h3>Notes from the Civic Hub</h3>
            <p className="form-hint">
              Optional admin-authored context delivered alongside the results.
            </p>
            <textarea
              className="form-textarea"
              rows={4}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              disabled={!isPending}
              placeholder="(none)"
            />
          </section>

          {selected.delivered_to.length > 0 && (
            <section className="admin-detail-section">
              <h3>Delivered to</h3>
              <ul>
                {selected.delivered_to.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          {isPending && (
            <div className="admin-actions">
              <button
                type="button"
                className="admin-archive-button"
                onClick={saveDraft}
                disabled={saving || approving}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              {confirmingApprove ? (
                <>
                  <button
                    type="button"
                    className="admin-convert-button"
                    onClick={approve}
                    disabled={approving}
                  >
                    {approving ? "Approving…" : "Confirm: approve and publish"}
                  </button>
                  <button
                    type="button"
                    className="admin-cancel-button"
                    onClick={() => setConfirmingApprove(false)}
                    disabled={approving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="admin-convert-button"
                  onClick={() => setConfirmingApprove(true)}
                  disabled={saving}
                >
                  Approve and publish
                </button>
              )}
            </div>
          )}
          {confirmingApprove && (
            <p className="form-hint" style={{ marginTop: "var(--space-sm)" }}>
              This will deliver the brief to the Board and publish a "Civic Brief
              delivered" post to the public feed. This cannot be undone.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page admin-briefs-page">
      <AdminTabs />
      <div className="admin-briefs-body">
        <h1>Civic Briefs</h1>
        <p className="admin-subtitle">
          Review briefs generated automatically when votes close. Approval delivers
          the brief to the Board of Supervisors and publishes it to the public feed.
        </p>

        <section className="admin-settings-panel">
          <h3>Delivery settings</h3>
          <label className="form-label" htmlFor="brief-recipients">
            Brief recipient emails
          </label>
          <p className="form-hint">
            Comma- or newline-separated list of addresses that receive the brief
            on approval. Changes take effect on the next approval.
          </p>
          <textarea
            id="brief-recipients"
            className="form-textarea"
            rows={2}
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            disabled={!recipientsLoaded || savingRecipients}
            placeholder="board@floyd.gov, clerk@floyd.gov"
          />
          <div className="admin-settings-actions">
            <button
              type="button"
              className="admin-convert-button"
              onClick={saveRecipients}
              disabled={!recipientsLoaded || savingRecipients}
            >
              {savingRecipients ? "Saving…" : "Save recipients"}
            </button>
            {recipientsMessage && (
              <span className="admin-settings-message">{recipientsMessage}</span>
            )}
          </div>
        </section>

        <div className="admin-brief-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`admin-brief-filter${statusFilter === f.id ? " is-active" : ""}`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <p>Loading…</p>}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <p className="empty-state-inline">
            {statusFilter === "all"
              ? "No briefs yet. Briefs are created automatically when votes close."
              : `No ${statusFilter} briefs.`}
          </p>
        )}

        <ul className="admin-proposal-list">
          {filtered.map((brief) => (
            <li
              key={brief.id}
              className="admin-proposal-item"
              onClick={() => openReview(brief.id)}
            >
              <div className="admin-proposal-header">
                <h3>{brief.title}</h3>
                <StatusChip status={brief.publication_status} />
              </div>
              <div className="admin-proposal-meta">
                <span>{brief.participation_count} votes</span>
                <span>Generated {formatDate(brief.generated_at)}</span>
                {brief.published_at && (
                  <span>Published {formatDate(brief.published_at)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: BriefPublicationStatus }) {
  const cls = `status-badge admin-brief-status-${status}`;
  const label =
    status === "pending" ? "pending review" : status === "approved" ? "approved" : "published";
  return <span className={cls}>{label}</span>;
}

function parseCommentsText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
