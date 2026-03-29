import hub from "../config/hub";

export default function HubHeader() {
  return (
    <header className="hub-header">
      <div className="hub-banner">
        <img src={hub.banner_url} alt="" className="hub-banner-img" />
      </div>
      <div className="hub-info">
        <h1 className="hub-name">{hub.name}</h1>
        <p className="hub-description">{hub.description}</p>
        <span className="hub-members">{hub.member_count} members</span>
      </div>
    </header>
  );
}
