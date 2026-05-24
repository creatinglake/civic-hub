import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, type ProjectSummary } from "../services/api";
import HubInfo from "../components/HubInfo";
import FeedVotesTabs from "../components/FeedVotesTabs";
import "./Projects.css";

export default function Projects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then((all) => setProjects(all))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const activeProjects = projects
    .filter((p) => p.status === "active")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const archivedProjects = projects
    .filter((p) => p.status === "archived")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <div className="page page-home">
      <HubInfo />
      <FeedVotesTabs />

      <section className="suggest-vote-cta projects-cta">
        <div className="suggest-vote-cta-inner projects-cta-inner">
          <h2 className="suggest-vote-cta-title projects-cta-title">
            Working on something for the community?
          </h2>
          <p className="suggest-vote-cta-body">
            Share a project you're building or organizing. Get community
            support, post updates, and keep people in the loop.
          </p>
          <Link to="/projects/new" className="suggest-vote-cta-button projects-cta-button">
            + Start a project
          </Link>
        </div>
      </section>

      {loading && <p className="section">Loading...</p>}
      {error && <p className="section error">Failed to load: {error}</p>}

      {!loading && !error && (
        <>
          <section className="section">
            <h2 className="section-title">Community Projects</h2>
            <p className="section-description">
              Projects and initiatives organized by community members.
              Show your support or get involved.
            </p>
            {activeProjects.length === 0 ? (
              <p className="empty-state-inline">
                No projects yet.{" "}
                <Link to="/projects/new" className="inline-link">
                  Start the first one.
                </Link>
              </p>
            ) : (
              <ul className="process-list">
                {activeProjects.map((p) => (
                  <li key={p.id}>
                    <Link to={`/project/${p.id}`} className="process-link">
                      <div className="project-card">
                        <div className="project-card-header">
                          <h3>{p.title}</h3>
                          <span className="status-badge status-active">active</span>
                        </div>
                        {(p.support_count > 0 || p.oppose_count > 0) && (
                          <div className="project-sentiment-bar">
                            {p.support_count > 0 && (
                              <span className="sentiment-support">
                                {p.support_count} support
                              </span>
                            )}
                            {p.oppose_count > 0 && (
                              <span className="sentiment-oppose">
                                {p.oppose_count} oppose
                              </span>
                            )}
                          </div>
                        )}
                        <div className="process-card-meta">
                          <span>by {p.user_id}</span>
                          <span>{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {archivedProjects.length > 0 && (
            <section className="section">
              <h2 className="section-title">Archived Projects</h2>
              <ul className="process-list">
                {archivedProjects.map((p) => (
                  <li key={p.id}>
                    <Link to={`/project/${p.id}`} className="process-link">
                      <div className="project-card">
                        <div className="project-card-header">
                          <h3>{p.title}</h3>
                          <span className="status-badge status-archived">archived</span>
                        </div>
                        <div className="process-card-meta">
                          <span>by {p.user_id}</span>
                          <span>{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
