// Admin settings controller — read/write admin-configurable hub settings.
//
// Exposes:
//   - brief_recipient_emails  (Slice 3 addendum — recipients of vote
//                              results, sent to the Board on approval.
//                              Field name preserved across Slice 8.5's
//                              civic.brief → civic.vote_results rename
//                              so existing operator config keeps working.)
//   - announcement_authors    (Slice 4.1: {email, label} list of non-admin
//                              users authorized to post announcements)
//
// More settings can be added by extending SettingsResponse + the PATCH
// body handler.

import { Request, Response } from "express";
import {
  type AnnouncementAuthor,
  getAnnouncementAuthors,
  getVoteResultsRecipients,
  setAnnouncementAuthors,
  setVoteResultsRecipients,
} from "../services/hubSettings.js";
import { getAuthUser } from "../middleware/auth.js";

interface SettingsResponse {
  brief_recipient_emails: string[];
  announcement_authors: AnnouncementAuthor[];
}

async function loadSettings(): Promise<SettingsResponse> {
  return {
    brief_recipient_emails: await getVoteResultsRecipients(),
    announcement_authors: await getAnnouncementAuthors(),
  };
}

export async function handleGetSettings(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json(await loadSettings());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handlePatchSettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const actor = getAuthUser(res).id;
    const body = (req.body ?? {}) as {
      brief_recipient_emails?: unknown;
      announcement_authors?: unknown;
    };

    if (body.brief_recipient_emails !== undefined) {
      if (!Array.isArray(body.brief_recipient_emails)) {
        res.status(400).json({
          error: "brief_recipient_emails must be an array of strings.",
        });
        return;
      }
      const input = body.brief_recipient_emails.filter(
        (e): e is string => typeof e === "string",
      );
      await setVoteResultsRecipients(input, actor);
    }

    if (body.announcement_authors !== undefined) {
      if (!Array.isArray(body.announcement_authors)) {
        res.status(400).json({
          error:
            "announcement_authors must be an array of { email, label } objects.",
        });
        return;
      }
      const input: AnnouncementAuthor[] = [];
      for (const entry of body.announcement_authors) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as { email?: unknown; label?: unknown };
        if (typeof e.email === "string" && typeof e.label === "string") {
          input.push({ email: e.email, label: e.label });
        }
      }
      await setAnnouncementAuthors(input, actor);
    }

    res.json(await loadSettings());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
