import hub from "../config/hub";

/**
 * Banner image strip. Rendered at the very top of the page above the nav on
 * routes that should show hub identity. Kept deliberately separate from the
 * hub text (HubInfo) so each page can decide whether to show the image,
 * the text, both, or neither.
 */
export default function HubBanner() {
  return (
    <div className="hub-banner" aria-hidden="true">
      <img src={hub.banner_url} alt="" className="hub-banner-img" />
    </div>
  );
}
