// SSRF guard for the link-preview fetcher (and any future server-side fetch of
// a user-supplied URL). The old check compared the hostname *string* against a
// few private ranges — which misses cloud-metadata (169.254.169.254), IP
// literals in odd encodings, and, crucially, DNS names that RESOLVE to an
// internal address. This resolves the host to its actual IP(s) and rejects any
// that fall in a private/loopback/link-local/reserved range. Callers must run
// it on the initial URL AND on every redirect target.

import { lookup } from "node:dns/promises";
import net from "node:net";

/** True if an IP literal (v4 or v6) is in a range we must never fetch. */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  if (!net.isIPv4(ip)) return true; // unknown format — fail closed
  const [a, b] = ip.split(".").map(Number);
  if (a === 127) return true; // loopback 127/8
  if (a === 10) return true; // private 10/8
  if (a === 0) return true; // "this" network / 0.0.0.0
  if (a === 169 && b === 254) return true; // link-local 169.254/16 (cloud metadata!)
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
  if (a === 192 && b === 168) return true; // private 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast / reserved 224.0.0.0+
  return false;
}

/**
 * Throw unless `rawUrl` is http(s) and its host resolves only to public IPs.
 * Run on the initial URL and on EVERY redirect hop before following it.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Malformed URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }
  const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error("Blocked internal address.");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error("Could not resolve host.");
  }
  if (addrs.length === 0) throw new Error("Could not resolve host.");
  for (const { address } of addrs) {
    if (isBlockedIp(address)) throw new Error("Blocked internal address.");
  }
}
