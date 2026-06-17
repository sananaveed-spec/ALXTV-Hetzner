const KIOSK_COOKIE = "ttv_kiosk";
const SESSION_COOKIE = "ttv_sess";

function getAuthSecret(): string | null {
  const secret =
    process.env.KIOSK_AUTH_SECRET?.trim() ||
    process.env.KIOSK_VIEW_PASSWORD?.trim();
  return secret || null;
}

export function isViewAuthEnabled(): boolean {
  return Boolean(process.env.KIOSK_VIEW_PASSWORD?.trim());
}

export function getKioskCookieName(): string {
  return KIOSK_COOKIE;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bufferToBase64Url(sig);
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createKioskToken(): Promise<string | null> {
  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }
  return hmacSign("kiosk-v1", secret);
}

export async function createSessionToken(): Promise<string | null> {
  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }
  const payload = `session-v1:${Date.now()}`;
  const signature = await hmacSign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyKioskToken(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }
  const expected = await createKioskToken();
  return Boolean(expected && token === expected);
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }
  const secret = getAuthSecret();
  if (!secret) {
    return false;
  }
  const dot = token.lastIndexOf(".");
  if (dot === -1) {
    return false;
  }
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!payload.startsWith("session-v1:")) {
    return false;
  }
  const expected = await hmacSign(payload, secret);
  return signature === expected;
}

export function isTelemetryTvReferer(referer: string | null): boolean {
  if (!referer) {
    return false;
  }
  try {
    const host = new URL(referer).hostname.toLowerCase();
    return host === "telemetrytv.com" || host.endsWith(".telemetrytv.com");
  } catch {
    return false;
  }
}

export function isTelemetryTvEmbedRequest(referer: string | null): boolean {
  return isTelemetryTvReferer(referer);
}
