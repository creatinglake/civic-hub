/**
 * Static hub configuration.
 * In the future this will come from the backend discovery manifest
 * or a hub settings API. For now it's hardcoded.
 */

const hub = {
  jurisdiction: "Floyd County, Virginia",
  label: "Civic Hub",
  tagline: "Vote on local issues and see where our community stands",
  // Local banner image — downtown Floyd, VA (Routes 221 & 8 intersection)
  // Replaces the external Unsplash URL to comply with no-external-network constraint
  banner_url: "/floyd-banner.jpg",
};

export default hub;
