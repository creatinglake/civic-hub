// Vercel serverless function — serves page-specific Open Graph meta
// tags for social media crawlers. Normal browser requests get the SPA
// index.html unchanged.
//
// vercel.json routes content paths (/process/:id, /proposal/:id, etc.)
// here. The function checks User-Agent: crawlers get a minimal HTML
// page with the right og:title / og:description / og:image; browsers
// get the built SPA so React Router handles client-side routing.

import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync } from "fs";
import { resolve } from "path";

const CRAWLER_RE =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|TelegramBot|Applebot|Pinterest|Embedly|Quora|vkShare|W3C_Validator/i;

const HUB_NAME =
  process.env.VITE_HUB_PAGE_TITLE ?? "Floyd County, VA — Civic Hub";
const BANNER_URL =
  process.env.VITE_HUB_BANNER_URL ?? "/floyd-banner.jpg";
const SITE_URL = (
  process.env.CIVIC_UI_BASE_URL ??
  process.env.BASE_URL ??
  "https://floyd.civic.social"
).replace(/\/$/, "");

let cachedIndexHtml: string | null = null;

function getIndexHtml(): string {
  if (cachedIndexHtml) return cachedIndexHtml;
  // Vercel's outputDirectory is ui/dist — the serverless function runs
  // from .vercel/output/functions/api/og.func/ but static assets are
  // at the deployment root. Try several candidate paths that cover
  // local dev and Vercel's production layout.
  const candidates = [
    resolve(__dirname, "..", "ui", "dist", "index.html"),
    resolve(__dirname, "..", "..", "ui", "dist", "index.html"),
    resolve(__dirname, "..", "index.html"),
  ];
  for (const p of candidates) {
    try {
      cachedIndexHtml = readFileSync(p, "utf-8");
      return cachedIndexHtml;
    } catch {
      // try next
    }
  }
  throw new Error("index.html not found");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function absoluteImage(img: string | undefined | null): string {
  if (!img) return `${SITE_URL}${BANNER_URL}`;
  if (img.startsWith("http")) return img;
  return `${SITE_URL}${img}`;
}

interface OgData {
  title: string;
  description: string;
  image?: string | null;
}

async function fetchOgData(pathname: string): Promise<OgData | null> {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [kind, id] = segments;
  const apiBase = `${SITE_URL}/api`;

  try {
    if (kind === "process" || kind === "proposal" || kind === "wordcloud") {
      const res = await fetch(`${apiBase}/process/${id}/state`);
      if (!res.ok) return null;
      const data = await res.json();
      const title = data.title ?? "Civic process";
      const type = data.type ?? "";
      const status = data.status ?? "";
      let desc: string;
      if (kind === "proposal" || type === "civic.proposal") {
        desc = `Check out this proposal: ${title}`;
      } else if (kind === "wordcloud" || type === "civic.wordcloud") {
        desc = `See what the community is saying: ${title}`;
      } else if (type === "civic.vote") {
        desc =
          status === "active"
            ? `Vote on this issue: ${title}`
            : `View this vote: ${title}`;
      } else {
        desc = title;
      }
      return { title, description: desc, image: data.image_url };
    }

    if (kind === "project") {
      const res = await fetch(`${apiBase}/projects/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const title = data.title ?? "Community project";
      return {
        title,
        description: `Check out this community project: ${title}`,
        image: data.banner_image_url,
      };
    }

    if (kind === "deliberation") {
      const res = await fetch(`${apiBase}/deliberations/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const topic = data.topic ?? "Community conversation";
      return {
        title: topic,
        description: `Join the conversation: ${topic}`,
      };
    }

    if (kind === "vote-results") {
      const res = await fetch(`${apiBase}/vote-results/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const title = data.title ?? "Vote results";
      return {
        title: `Vote results: ${title}`,
        description: `See how the community voted on: ${title}`,
        image: data.image_url,
      };
    }

    if (kind === "meeting-summary") {
      const res = await fetch(`${apiBase}/meeting-summary/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const title = data.meeting_title ?? "Meeting summary";
      return {
        title: `Meeting summary: ${title}`,
        description: `Read the summary: ${title}`,
      };
    }

    if (kind === "announcement") {
      const res = await fetch(`${apiBase}/announcement/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const title = data.title ?? "Announcement";
      return { title, description: title, image: data.image_url };
    }
  } catch {
    return null;
  }

  return null;
}

function ogHtml(og: OgData, pathname: string): string {
  const url = `${SITE_URL}${pathname}`;
  const image = absoluteImage(og.image);
  const t = escapeHtml(og.title);
  const d = escapeHtml(og.description);
  const hubName = escapeHtml(HUB_NAME);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${t} — ${hubName}</title>
  <meta name="description" content="${d}" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:site_name" content="${hubName}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body>
  <h1>${t}</h1>
  <p>${d}</p>
  <p><a href="${escapeHtml(url)}">Open in ${hubName}</a></p>
</body>
</html>`;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const ua = req.headers["user-agent"] ?? "";
  const pathname = req.url ?? "/";

  if (CRAWLER_RE.test(ua)) {
    const og = await fetchOgData(pathname);
    if (og) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(ogHtml(og, pathname));
      return;
    }
  }

  // Not a crawler (or data fetch failed) — serve the SPA.
  try {
    const html = getIndexHtml();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    // Fallback: redirect to the same path (Vercel's default SPA
    // rewrite will catch it on the next hop).
    res.writeHead(302, { Location: pathname });
    res.end();
  }
}
