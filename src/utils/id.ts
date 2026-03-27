import { randomUUID } from "node:crypto";

// Generate a prefixed unique ID
export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
