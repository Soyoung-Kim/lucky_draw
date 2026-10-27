import { HttpError } from './http.ts';

const encoder = new TextEncoder();
export function getEjAdminConfig() {
  const id = Deno.env.get('EJ_ADMIN');
  const password = Deno.env.get('EJ_ADMIN_PASS');
  const secret = Deno.env.get('ADMIN_SESSION_SECRET');
  if (!id?.trim() || !password?.trim() || !secret?.trim()) {
    throw new HttpError('EJ_ADMIN, EJ_ADMIN_PASS 및 세션 서명 키 설정이 필요합니다.', 503);
  }
  // Separate signing context; credential changes also invalidate old EJ sessions.
  return { id, password, secret: JSON.stringify(['reserves-ej', secret, id, password]) };
}
function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function decode(value: string) {
  const base = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(base.padEnd(base.length + (4 - base.length % 4) % 4, '=')), c => c.charCodeAt(0));
}
async function key(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function verifyEjCredentials(id: unknown, password: unknown) {
  const config = getEjAdminConfig();
  if (typeof id !== 'string' || typeof password !== 'string') throw new HttpError('아이디 또는 비밀번호가 올바르지 않습니다.', 401);
  const signingKey = await key(config.secret);
  const signature = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(JSON.stringify([config.id, config.password])));
  if (!await crypto.subtle.verify('HMAC', signingKey, signature, encoder.encode(JSON.stringify([id, password])))) {
    throw new HttpError('아이디 또는 비밀번호가 올바르지 않습니다.', 401);
  }
  return config.id;
}
export async function createEjSession(id: string) {
  const config = getEjAdminConfig();
  if (id !== config.id) throw new HttpError('다시 로그인해 주세요.', 401);
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: id, role: 'ej-admin', aud: 'reserves-ej', iat: now, exp: now + 8 * 3600, v: 1 };
  const part = encode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await key(config.secret), encoder.encode(part));
  return { token: `${part}.${encode(new Uint8Array(signature))}`, expires_at: new Date(payload.exp * 1000).toISOString() };
}
export async function verifyEjSession(token: unknown) {
  const config = getEjAdminConfig();
  try {
    if (typeof token !== 'string' || token.length > 4096) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 2 || !parts.every(Boolean)) throw new Error();
    const [part, signature] = parts;
    if (!await crypto.subtle.verify('HMAC', await key(config.secret), decode(signature), encoder.encode(part))) throw new Error();
    const payload = JSON.parse(new TextDecoder().decode(decode(part)));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.role !== 'ej-admin' || payload.aud !== 'reserves-ej' || payload.sub !== config.id || payload.v !== 1 ||
      !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat) || payload.exp <= now || payload.iat > now ||
      payload.exp <= payload.iat || payload.exp - payload.iat > 8 * 3600) throw new Error();
    return { admin_id: payload.sub };
  } catch {
    throw new HttpError('다시 로그인해 주세요.', 401);
  }
}
