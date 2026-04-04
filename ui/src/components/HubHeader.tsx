import hub from "../config/hub";

export default function HubHeader() {
  return (
    <header className="hub-header">
      <div className="hub-banner">
        <img src={hub.banner_url} alt="" className="hub-banner-img" />
      </div>
      <div className="hub-info">
        <h1 className="hub-name">{hub.jurisdiction}</h1>
        <span className="hub-label">{hub.label}</span>
        <p className="hub-tagline">{hub.tagline}</p>
      </div>
    </header>
  );
}
