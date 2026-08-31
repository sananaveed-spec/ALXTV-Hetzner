import {
  createKioskToken,
  getKioskCookieName,
  getSessionCookieName,
  isTelemetryTvEmbedRequest,
  isViewAuthEnabled,
  verifyKioskToken,
  verifySessionToken,
} from "@/lib/kiosk-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return true;
  }

  // Allow files served from /public (logo, icons, etc.) without auth redirects.
  return /\.[a-z0-9]+$/i.test(pathname);
}

function applyKioskCookie(response: NextResponse, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set(getKioskCookieName(), token, {
    httpOnly: true,
    secure: isProduction,
    // SameSite=None requires Secure; use Lax on localhost so the cookie is stored.
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function middleware(request: NextRequest) {
  if (!isViewAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname, searchParams } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const kioskCookie = request.cookies.get(getKioskCookieName())?.value;
  const sessionCookie = request.cookies.get(getSessionCookieName())?.value;

  if (
    (await verifyKioskToken(kioskCookie)) ||
    (await verifySessionToken(sessionCookie))
  ) {
    return NextResponse.next();
  }

  const embedKey = searchParams.get("embed_key");
  const expectedEmbedKey = process.env.KIOSK_EMBED_KEY?.trim();
  if (embedKey && expectedEmbedKey && embedKey === expectedEmbedKey) {
    const token = await createKioskToken();
    if (!token) {
      return NextResponse.next();
    }
    const response = NextResponse.next();
    applyKioskCookie(response, token);
    return response;
  }

  const referer = request.headers.get("referer");
  if (isTelemetryTvEmbedRequest(referer)) {
    const token = await createKioskToken();
    if (!token) {
      return NextResponse.next();
    }
    const expectedEmbedKey = process.env.KIOSK_EMBED_KEY?.trim();
    if (expectedEmbedKey && !searchParams.has("embed_key")) {
      const embedUrl = request.nextUrl.clone();
      embedUrl.searchParams.set("embed_key", expectedEmbedKey);
      const response = NextResponse.redirect(embedUrl);
      applyKioskCookie(response, token);
      return response;
    }
    const response = NextResponse.next();
    applyKioskCookie(response, token);
    return response;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
