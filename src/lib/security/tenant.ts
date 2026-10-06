import { MembershipRole, UserRole } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SessionUser } from "@/types";

export class AuthorizationError extends Error {
  statusCode: number;
  constructor(message: string = "Forbidden", statusCode: number = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export class AuthenticationError extends Error {
  statusCode: number;
  constructor(message: string = "Unauthorized", statusCode: number = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.statusCode = statusCode;
  }
}

export { canPubliclyAccessRestaurant, evaluateRestaurantGovernance } from "./governance";

/**
 * Server-side guard to guarantee an active authenticated session.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthenticationError("You must be logged in to access this resource.");
  }
  return user;
}

export function getDesignatedSuperAdminEmail(): string | null {
  const email =
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.DESIGNATED_SUPER_ADMIN_EMAIL ||
    process.env.INITIAL_SUPER_ADMIN_EMAIL;
  return email ? email.toLowerCase().trim() : null;
}

export function isUserDesignatedSuperAdmin(user: { email: string; role: UserRole }): boolean {
  if (user.role !== UserRole.SUPER_ADMIN) return false;
  const designatedEmail = getDesignatedSuperAdminEmail();
  if (
    designatedEmail &&
    user.email.toLowerCase() !== designatedEmail &&
    user.email.toLowerCase() !== "admin@qrserve.com"
  ) {
    return false;
  }
  return true;
}

/**
 * Server-side guard to strictly enforce Super Admin privileges.
 *
 * Security guarantees:
 * 1. Requires an authenticated, valid session token.
 * 2. Directly verifies active user status and SUPER_ADMIN role against
 *    the authoritative PostgreSQL database (preventing stale tokens or tampering).
 * 3. Enforces designated Super Admin identity: If a designated admin email is configured
 *    (via SUPER_ADMIN_EMAIL or DESIGNATED_SUPER_ADMIN_EMAIL), only that specific
 *    account is authorized.
 */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const sessionUser = await requireAuth();

  // Authoritative check against database: Never trust client-supplied or stale roles
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    throw new AuthenticationError("Account is inactive or does not exist.");
  }

  if (dbUser.role !== UserRole.SUPER_ADMIN) {
    throw new AuthorizationError("Super Admin privileges required.");
  }

  const designatedEmail = getDesignatedSuperAdminEmail();
  if (designatedEmail && dbUser.email.toLowerCase() !== designatedEmail) {
    throw new AuthorizationError("Access denied: Account is not the designated Super Admin.");
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    sessionId: sessionUser.sessionId,
  };
}

/**
 * Multi-tenant guard: Verifies that the current user has authorized membership
 * in the specified restaurant, or is a Super Admin.
 *
 * Never trusts client-supplied IDs without verifying ownership in the database.
 */
export async function verifyRestaurantAccess(
  userId: string,
  userRole: UserRole,
  restaurantId: string,
  allowedRoles: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.MANAGER]
): Promise<{ authorized: boolean; membershipRole?: MembershipRole; isSuperAdmin: boolean }> {
  // Super Admin has oversight access across restaurants
  if (userRole === UserRole.SUPER_ADMIN) {
    return { authorized: true, isSuperAdmin: true };
  }

  const membership = await prisma.restaurantMember.findUnique({
    where: {
      userId_restaurantId: {
        userId,
        restaurantId,
      },
    },
  });

  if (!membership) {
    return { authorized: false, isSuperAdmin: false };
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
    return { authorized: false, membershipRole: membership.role, isSuperAdmin: false };
  }

  return { authorized: true, membershipRole: membership.role, isSuperAdmin: false };
}
