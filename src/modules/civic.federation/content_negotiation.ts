const AP_MEDIA_TYPES = [
  "application/activity+json",
  "application/ld+json",
];

export function wantsActivityPub(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  const lower = acceptHeader.toLowerCase();
  return AP_MEDIA_TYPES.some((t) => lower.includes(t));
}
