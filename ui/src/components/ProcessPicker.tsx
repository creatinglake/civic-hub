import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./ProcessPicker.css";

interface Props {
  onDismiss: () => void;
}

const INTENTS = [
  {
    key: "conversation",
    label: "Talk through a question",
    description:
      "Not sure yet? Start here — open it up and see where people stand.",
    container: "Starts a Conversation",
    route: "/deliberations",
    guidance: null,
    guidanceWeight: null,
  },
  {
    key: "proposal",
    label: "Float a specific idea",
    description: "Put an idea forward and see who backs it.",
    container: "Starts a Proposal",
    route: "/propose/new",
    guidance:
      "Gauging support first? Great. For a broad or divisive idea, a conversation can surface common ground before you ask people to take a side.",
    guidanceWeight: "light" as const,
  },
  {
    key: "vote",
    label: "Decide a clear question",
    description: "Put a settled question to a community decision.",
    container: "Starts a Vote",
    route: "/votes/new",
    guidance:
      "Best for clear, discrete questions. For broad or divisive topics, a conversation first usually surfaces common ground.",
    guidanceWeight: "prominent" as const,
  },
  {
    key: "project",
    label: "Organize or build something",
    description: "Rally people to do or build it together.",
    container: "Starts a Project",
    route: "/projects/new",
    guidance: null,
    guidanceWeight: null,
  },
] as const;

export default function ProcessPicker({ onDismiss }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  function handlePick(route: string) {
    onDismiss();
    navigate(route);
  }

  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) onDismiss();
  }

  return (
    <dialog
      ref={dialogRef}
      className="picker"
      aria-labelledby="picker-title"
      onClick={handleClick}
      onClose={onDismiss}
    >
      <div className="picker-body">
        <div className="picker-header">
          <h2 id="picker-title" className="picker-title">
            What are you trying to do?
          </h2>
          <button
            type="button"
            className="picker-close"
            aria-label="Close"
            onClick={onDismiss}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="picker-cards">
          {INTENTS.map((intent) => (
            <button
              key={intent.key}
              type="button"
              className="picker-card"
              onClick={() => handlePick(intent.route)}
            >
              <span className="picker-card-label">{intent.label}</span>
              <span className="picker-card-desc">{intent.description}</span>
              <span className="picker-card-container">{intent.container}</span>
              {intent.guidance && (
                <span
                  className={`picker-card-guidance picker-card-guidance--${intent.guidanceWeight}`}
                >
                  {intent.guidance}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
