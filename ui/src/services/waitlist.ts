const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "/api";

export async function joinWaitlist(
  email: string,
  notes?: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/waitlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, notes: notes || undefined }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}
