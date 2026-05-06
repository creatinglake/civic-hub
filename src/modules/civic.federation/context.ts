export const AP_CONTEXT: (string | Record<string, string>)[] = [
  "https://www.w3.org/ns/activitystreams",
  { civic: "https://civic.social/ns#" },
];

export const ACTOR_CONTEXT: (string | Record<string, string>)[] = [
  "https://www.w3.org/ns/activitystreams",
  { civic: "https://civic.social/ns#" },
  "https://w3id.org/security/v1" as string,
];

export const AP_CONTENT_TYPE = "application/activity+json; charset=utf-8";
export const JRD_CONTENT_TYPE = "application/jrd+json; charset=utf-8";
export const AP_PUBLIC = "https://www.w3.org/ns/activitystreams#Public";
