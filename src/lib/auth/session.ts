import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { SessionUser } from "@/types";
import { UserRole } from "@prisma/client";

const FALLBACK_DEV_SECRET = "fallback_dev_secret_please_set_jwt_secret_in_env_32chars";
const COOKIE_NAME = process.env.COOKIE_NAME || "qrserve_session";
const SESSION_EXPIRY = "7d";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === FALLBACK_DEV_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[SECURITY WARNING] JWT_SECRET is not explicitly configured in production. For strict multi-tenant security, set a unique 32+ character random string in your environment."
      );
    }
    return new TextEncoder().encode(FALLBACK_DEV_SECRET);
  }
  return new TextEncoder().encode(secret);
}

const encodedSecret = getJwtSecretBytes();

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * Creates and cryptographically signs a JWT session token.
 */
export async function signSessionToken(payload: {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  sessionId?: string;
}): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
    sessionId: payload.sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(encodedSecret);
}

/**
 * Verifies a JWT session token and returns the payload if valid.
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, encodedSecret, {
      algorithms: ["HS256"],
    });

    if (!payload.sub || typeof payload.email !== "string" || typeof payload.role !== "string") {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      role: payload.role as UserRole,
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Sets the session cookie on the incoming response context.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Retrieves the current session user from the incoming request cookies.
 * Memoized per request using React cache to eliminate redundant JWT verification.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
});

/**
 * Deletes the session cookie on logout.
 */
export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
