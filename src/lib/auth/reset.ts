import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db/prisma";

const JWT_SECRET =
  process.env.JWT_SECRET || "fallback_dev_secret_please_set_jwt_secret_in_env_32chars";
const encodedSecret = new TextEncoder().encode(JWT_SECRET);
const RESET_TOKEN_EXPIRY = "15m"; // 15 minutes expiration

export interface PasswordResetPayload {
  userId: string;
  email: string;
}

/**
 * Creates a cryptographically signed, single-use password reset token.
 * Incorporates a hash prefix so that once the password changes, the token is permanently invalidated.
 */
export async function createPasswordResetToken(user: {
  id: string;
  email: string;
  passwordHash: string;
}): Promise<string> {
  const hashPrefix = user.passwordHash.slice(-10);

  return new SignJWT({
    sub: user.id,
    email: user.email.toLowerCase().trim(),
    hashPrefix,
    purpose: "password_reset",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(RESET_TOKEN_EXPIRY)
    .sign(encodedSecret);
}

/**
 * Verifies a password reset token.
 * Verifies expiration, cryptographic signature, and checks against current user's password hash in DB.
 */
export async function verifyPasswordResetToken(
  token: string
): Promise<PasswordResetPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedSecret, {
      algorithms: ["HS256"],
    });

    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      typeof payload.hashPrefix !== "string" ||
      payload.purpose !== "password_reset"
    ) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    // Single-use protection: If password was already updated, hashPrefix will not match!
    if (user.passwordHash.slice(-10) !== payload.hashPrefix) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
    };
  } catch {
    return null;
  }
}
