import { HttpError, jsonResponse, readJson, withJsonHandler } from "./http.ts";
import { getServiceClient } from "./supabase.ts";
import { sha256Hex } from "./crypto.ts";

export function uuid(value: unknown, field = "event_id") {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(`${field} must be a UUID`, 400);
  }
  return value;
}
export function name(value: unknown) {
  if (typeof value !== "string") throw new HttpError("INVALID_NAME", 400);
  const normalized = value.trim().replace(/\s+/g, " ");
  if ([...normalized].length < 1 || [...normalized].length > 30) throw new HttpError("INVALID_NAME", 400);
  return normalized;
}
export async function body(req: Request): Promise<Record<string, unknown>> {
  const value = await readJson(req);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("Invalid JSON body", 400);
  return value;
}
export function result(data: Record<string, unknown>) {
  if (data.error) {
    const code = String(data.error);
    const status = code.endsWith("NOT_FOUND") ? 404 : code.startsWith("INVALID") ? 400 : 409;
    return jsonResponse({ success: false, error: code, code }, status);
  }
  return jsonResponse({ success: true, ...data });
}
export async function rateLimit(req: Request, category: string, limit: number) {
  // Supabase's gateway must overwrite x-forwarded-for. No client-provided body key is accepted.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const key = await sha256Hex(`nds-lucky-100:${category}:${ip}`);
  const { data, error } = await getServiceClient().rpc("nds_lucky_100_rate_limit", { p_key: key, p_limit: limit });
  if (error) throw new HttpError("Rate limiter unavailable", 503);
  if (!data) throw new HttpError("TOO_MANY_REQUESTS", 429);
}
export function servePublic(action: "lookup" | "board" | "register") {
  Deno.serve((req) => withJsonHandler(req, async () => {
    const payload = await body(req);
    const eventId = uuid(payload.event_id);
    const participantName = action === "board" ? null : name(payload.name);
    let slot = null;
    if (action === "register") {
      if (typeof payload.slot_number !== "number" || !Number.isInteger(payload.slot_number) || payload.slot_number < 1 || payload.slot_number > 150) throw new HttpError("INVALID_SLOT", 400);
      slot = payload.slot_number;
    }
    // Shared Wi-Fi can place all 100 attendees behind one IP; polling gets a separate budget.
    await rateLimit(req, action === "board" ? "board" : "participation", action === "board" ? 2400 : 300);
    const { data, error } = await getServiceClient().rpc("nds_lucky_100_public", {
      p_action: action, p_event: eventId, p_name: participantName, p_slot: slot,
    });
    if (error) throw new HttpError("Failed to process participation request", 500);
    return result(data);
  }));
}
