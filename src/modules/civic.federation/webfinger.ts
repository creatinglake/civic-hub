import { WebfingerResponse } from "./models.js";
import { AP_CONTENT_TYPE } from "./context.js";

export function buildWebfinger(
  resource: string,
  hubBaseUrl: string,
  hubUsername: string,
): WebfingerResponse | null {
  const hostname = new URL(hubBaseUrl).host;
  const expected = `acct:${hubUsername}@${hostname}`;

  if (resource !== expected) return null;

  return {
    subject: expected,
    links: [
      {
        rel: "self",
        type: AP_CONTENT_TYPE.split(";")[0].trim(),
        href: `${hubBaseUrl}/actor`,
      },
    ],
  };
}
