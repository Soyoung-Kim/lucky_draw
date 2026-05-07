import { sha256Hex } from "./crypto.ts";
import { HttpError } from "./http.ts";

type AdminSessionPayload = {
  sub: string;
  role: "admin";
  iat: number;
  exp: number;
  v: 1;
};

const encoder = new TextEncoder();

function getAdminId() {
  return Deno.env.get("ADMIN_ID") ?? "super";
}

function getAdminPassword() {
  return Deno.env.get("ADMIN_PASSWORD") ?? "password";
}

function getSessionSecret() {
  return (
    Deno.env.get("ADMIN_SESSION_SECRET") ??
    Deno.env.get("ADMIN_TOKEN") ??
    getAdminPassword()
  );
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function hmacSha256(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

export function verifyAdminCredentials(adminId: unknown, password: unknown) {
  if (typeof adminId !== "string" || typeof password !== "string") {
    throw new HttpError("Invalid admin credentials", 401);
  }

  if (adminId !== getAdminId() || password !== getAdminPassword()) {
    throw new HttpError("Invalid admin credentials", 401);
  }

  return getAdminId();
}

export async function createAdminSessionToken(adminId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    sub: adminId,
    role: "admin",
    iat: now,
    exp: now + 60 * 60 * 8,
    v: 1,
  };
  const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signaturePart = base64UrlEncode(await hmacSha256(payloadPart, getSessionSecret()));

  return {
    token: `${payloadPart}.${signaturePart}`,
    expires_at: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function verifyAdminAccess(body: Record<string, unknown>) {
  const legacyToken = body.admin_token;
  const expectedLegacyToken = Deno.env.get("ADMIN_TOKEN");

  if (
    expectedLegacyToken &&
    typeof legacyToken === "string" &&
    timingSafeEqual(await sha256Hex(legacyToken), await sha256Hex(expectedLegacyToken))
  ) {
    return { admin_id: getAdminId(), auth_method: "admin_token" };
  }

  const sessionToken = body.admin_session_token;

  if (typeof sessionToken !== "string" || !sessionToken.includes(".")) {
    throw new HttpError("Admin login is required", 401);
  }

  const [payloadPart, signaturePart] = sessionToken.split(".");

  if (!payloadPart || !signaturePart) {
    throw new HttpError("Invalid admin session", 401);
  }

  const expectedSignature = base64UrlEncode(await hmacSha256(payloadPart, getSessionSecret()));

  if (!timingSafeEqual(signaturePart, expectedSignature)) {
    throw new HttpError("Invalid admin session", 401);
  }

  let payload: AdminSessionPayload;

  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
  } catch {
    throw new HttpError("Invalid admin session", 401);
  }

  const now = Math.floor(Date.now() / 1000);

  if (payload.role !== "admin" || payload.v !== 1 || payload.exp <= now) {
    throw new HttpError("Admin session expired", 401);
  }

  return { admin_id: payload.sub, auth_method: "admin_session_token" };
}
