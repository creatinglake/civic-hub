import { describe, it, expect } from "vitest";
import { isBlockedIp } from "../../src/utils/ssrfGuard.js";

describe("isBlockedIp", () => {
  it("blocks loopback, private, link-local and metadata ranges", () => {
    const blocked = [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // multicast
      "::1", // IPv6 loopback
      "fe80::1", // IPv6 link-local
      "fd00::1", // IPv6 unique-local
      "::ffff:127.0.0.1", // IPv4-mapped loopback
    ];
    for (const ip of blocked) {
      expect(isBlockedIp(ip), `${ip} should be blocked`).toBe(true);
    }
  });

  it("allows normal public addresses", () => {
    const allowed = [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34", // example.com
      "172.15.0.1", // just outside 172.16/12
      "172.32.0.1", // just outside 172.16/12
      "2606:4700:4700::1111", // public IPv6 (Cloudflare)
    ];
    for (const ip of allowed) {
      expect(isBlockedIp(ip), `${ip} should be allowed`).toBe(false);
    }
  });

  it("fails closed on garbage input", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
  });
});
