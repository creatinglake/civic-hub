// Admin settings controller — read/write admin-configurable hub settings.
//
// Slice 3 exposes only brief recipient emails. More settings can be added
// by extending the SettingsResponse shape and the PATCH body handler.

import { Request, Response } from "express";
import {
  getBriefRecipients,
  setBriefRecipients,
} from "../services/hubSettings.js";
import { getAuthUser } from "../middleware/auth.js";

interface SettingsResponse {
  brief_recipient_emails: string[];
}

async function loadSettings(): Promise<SettingsResponse> {
  return {
    brief_recipient_emails: await getBriefRecipients(),
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
    const body = (req.body ?? {}) as { brief_recipient_emails?: unknown };

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
      await setBriefRecipients(input, actor);
    }

    res.json(await loadSettings());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
