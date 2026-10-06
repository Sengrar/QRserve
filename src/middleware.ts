import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_dev_secret_please_set_jwt_secret_in_env_32chars";
const COOKIE_NAME = process.env.COOKIE_NAME || "qrserve_session";
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  let sessionUser: { sub: string; role: string; email: string } | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, encodedSecret, {
        algorithms: ["HS256"],
      });
      if (payload.sub && typeof payload.role === "string" && typeof payload.email === "string") {
        sessionUser = {
          sub: payload.sub,
          role: payload.role,
          email: payload.email,
        };
      }
    } catch {
      sessionUser = null;
    }
  }

  const isAdminLoginRoute = pathname === "/admin/login";
  const isAdminRoute = pathname.startsWith("/admin") && !isAdminLoginRoute;
  const isDashboardRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/restaurants") ||
    isAdminRoute;

  const designatedAdminEmail =
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.DESIGNATED_SUPER_ADMIN_EMAIL ||
    process.env.INITIAL_SUPER_ADMIN_EMAIL;

  const isSuperAdminUser =
    sessionUser?.role === "SUPER_ADMIN" &&
    (!designatedAdminEmail ||
      sessionUser.email.toLowerCase() === designatedAdminEmail.toLowerCase().trim());

  // If already authenticated as Super Admin, redirect away from /admin/login to /admin
  if (isAdminLoginRoute && isSuperAdminUser) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Redirect authenticated users away from /register to their dedicated panel.
  // /login is always accessible so users can re-authenticate or switch accounts without cookie traps.
  if (pathname.startsWith("/register") && sessionUser) {
    if (isSuperAdminUser) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Redirect unauthenticated users attempting to access protected routes:
  // Admin routes go to /admin/login, restaurant routes go to /login
  if (isDashboardRoute && !sessionUser) {
    if (isAdminRoute) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Enforce Super Admin route protection: Restaurant owners/staff cannot access /admin
  if (isAdminRoute && !isSuperAdminUser) {
    // Non-designated SUPER_ADMIN accounts are passed to AdminPage to display Access Denied
    // rather than redirecting to /dashboard (which causes an infinite loop)
    if (sessionUser?.role === "SUPER_ADMIN") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Separate panels: Designated Super Admin accessing restaurant owner /dashboard is directed to /admin
  if (pathname === "/dashboard" && isSuperAdminUser) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/register",
    "/dashboard/:path*",
    "/restaurants/:path*",
    "/admin/:path*",
  ],
};
