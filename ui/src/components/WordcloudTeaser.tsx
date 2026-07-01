import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWordcloudCloud } from "../services/api";
import hub from "../config/hub";
import "./WordcloudTeaser.css";

// A slim, always-near-the-top affordance pointing at the community word cloud.
// Shows the actual submitted words rotating through; when the cloud is empty it
// invites the visitor to be the first. Hidden entirely when no word cloud is
// configured (VITE_HUB_ONBOARDING_WORDCLOUD_ID) or the fetch fails, so it never
// renders a broken/empty bar.
export default function WordcloudTeaser() {
  const id = hub.onboarding_wordcloud_id;
  const [words, setWords] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<string>("");
  const [hidden, setHidden] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!id) {
      setHidden(true);
      return;
    }
    let cancelled = false;
    getWordcloudCloud(id)
      .then((res) => {
        if (cancelled) return;
        const cloud = res.clouds?.[0];
        if (!cloud) {
          setHidden(true);
          return;
        }
        setPrompt(cloud.prompt_text || "");
        const top = [...(cloud.entries || [])]
          .sort((a, b) => b.count - a.count)
          .slice(0, 20)
          .map((e) => e.text);
        setWords(top);
      })
      .catch(() => setHidden(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Rotate the visible word once the cloud has at least two.
  useEffect(() => {
    if (words.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % words.length), 2200);
    return () => clearInterval(t);
  }, [words]);

  if (hidden || !id) return null;

  const hasWords = words.length > 0;
  const current = hasWords ? words[idx % words.length] : "";

  return (
    <Link
      to={`/wordcloud/${id}`}
      className="wc-teaser"
      aria-label="View the community word cloud"
    >
      <span className="wc-teaser-icon" aria-hidden="true">✦</span>
      <span className="wc-teaser-label">Community word cloud</span>
      <span className="wc-teaser-sep" aria-hidden="true">·</span>
      {hasWords ? (
        <span className="wc-teaser-rotator">
          <span key={idx} className="wc-teaser-word">
            {current}
          </span>
        </span>
      ) : (
        <span className="wc-teaser-empty">
          {prompt ? `${prompt} ` : ""}Be the first to add a word
        </span>
      )}
      <span className="wc-teaser-cta" aria-hidden="true">→</span>
    </Link>
  );
}
