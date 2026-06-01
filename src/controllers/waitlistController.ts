import type { Request, Response } from "express";
import { getDb } from "../db/client.js";

export async function handleJoinWaitlist(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (typeof body.website === "string" && body.website.trim().length > 0) {
    res.json({ message: "You're on the list! We'll email you when access opens up." });
    return;
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email is required." });
    return;
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, 500)
      : null;

  try {
    const { error } = await getDb()
      .from("waitlist")
      .upsert(
        { email, notes, created_at: new Date().toISOString() },
        { onConflict: "email" },
      );
    if (error) throw error;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[waitlist] insert failed: ${msg}`);
    res.status(500).json({ error: "Could not join waitlist. Please try again." });
    return;
  }

  res.json({ message: "You're on the list! We'll email you when access opens up." });
}
