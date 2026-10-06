import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth/session";
import { UserRole } from "@prisma/client";

describe("Session & Token Security Tests", () => {
  it("generates a signed JWT and verifies valid payload", async () => {
    const payload = {
      userId: "usr_123456",
      email: "owner@cafe.com",
      name: "Cafe Owner",
      role: UserRole.RESTAURANT_OWNER,
    };

    const token = await signSessionToken(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(payload.userId);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.name).toBe(payload.name);
    expect(verified?.role).toBe(UserRole.RESTAURANT_OWNER);
  });

  it("rejects tampered tokens", async () => {
    const payload = {
      userId: "usr_123456",
      email: "owner@cafe.com",
      name: "Cafe Owner",
      role: UserRole.RESTAURANT_OWNER,
    };

    const token = await signSessionToken(payload);
    // Tamper with payload segment
    const parts = token.split(".");
    const tampered = `${parts[0]}.eyJyZXN0YXVyYW50IjoidGFtcGVyZWQifQ.${parts[2]}`;

    const verified = await verifySessionToken(tampered);
    expect(verified).toBeNull();
  });

  it("rejects random malformed strings as tokens", async () => {
    const verified = await verifySessionToken("invalid.token.structure");
    expect(verified).toBeNull();
  });
});
