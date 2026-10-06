import crypto from "crypto";

/**
 * Generates a clean, human-friendly, uppercase order identifier.
 * Format: ORD-XXXXXX (e.g. ORD-7KJ92M)
 */
export function generateOrderNumber(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // excludes ambiguous chars like 0/O, 1/I
  let code = "";
  const randomBytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return `ORD-${code}`;
}

const ORDER_TOKEN_SALT = process.env.ORDER_TOKEN_SALT || "qrserve_order_verification_salt_2026";

/**
 * Generates a cryptographically authenticated tracking token for order confirmation lookup.
 * Protects against order enumeration by untrusted visitors guessing order numbers.
 */
export function generateOrderAccessToken(orderNumber: string, restaurantId: string): string {
  return crypto
    .createHmac("sha256", ORDER_TOKEN_SALT)
    .update(`${orderNumber}:${restaurantId}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Verifies that a client-provided order tracking token matches the order number and restaurant.
 */
export function verifyOrderAccessToken(
  orderNumber: string,
  restaurantId: string,
  providedToken: string
): boolean {
  if (!providedToken || typeof providedToken !== "string") return false;
  const expectedToken = generateOrderAccessToken(orderNumber, restaurantId);
  if (providedToken.length !== expectedToken.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedToken, "utf8"),
      Buffer.from(expectedToken, "utf8")
    );
  } catch {
    return false;
  }
}
