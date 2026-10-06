import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("Password Security Tests", () => {
  it("generates a bcrypt hash different from plaintext", async () => {
    const plain = "SuperSecret123!";
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("verifies matching password against generated hash", async () => {
    const plain = "ValidPassword456!";
    const hash = await hashPassword(plain);

    const isMatch = await verifyPassword(plain, hash);
    expect(isMatch).toBe(true);
  });

  it("rejects non-matching password", async () => {
    const plain = "ValidPassword456!";
    const hash = await hashPassword(plain);

    const isMatch = await verifyPassword("WrongPassword!", hash);
    expect(isMatch).toBe(false);
  });
});
