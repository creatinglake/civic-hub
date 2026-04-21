import hub from "../config/hub";

/**
 * Hub identity text: jurisdiction name, hub label, and tagline. Rendered on
 * pages that show the hub header. Pairs with HubBanner (the image strip)
 * but is intentionally standalone so pages can compose them independently.
 */
export default function HubInfo() {
  return (
    <header className="hub-info">
      <h1 className="hub-name">{hub.jurisdiction}</h1>
      <span className="hub-label">{hub.label}</span>
      <p className="hub-tagline">{hub.tagline}</p>
    </header>
  );
}
