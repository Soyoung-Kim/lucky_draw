import { createAdminSessionToken, verifyAdminCredentials, verifyAdminAccess } from "../_shared/admin.ts";
import { secureShuffle } from "../_shared/crypto.ts";
import { HttpError, jsonResponse, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { body, name, rateLimit, result, uuid } from "../_shared/nds-lucky-100.ts";

Deno.serve((req) => withJsonHandler(req, async () => {
  // Explicit configuration prevents the legacy helper's default credentials/secret fallback.
  for (const key of ["ADMIN_ID", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"]) {
    if (!Deno.env.get(key)?.trim()) throw new HttpError("Admin configuration is missing", 503);
  }
  const payload = await body(req);
  const action = payload.action;
  if (action === "login") {
    await rateLimit(req, "admin-login", 10);
    const adminId = verifyAdminCredentials(payload.admin_id, payload.password);
    const session = await createAdminSessionToken(adminId);
    return jsonResponse({ success: true, admin_id: adminId, admin_session_token: session.token, expires_at: session.expires_at });
  }
  // Only signed sessions accepted for new endpoints; do not accept the legacy static token.
  const admin = await verifyAdminAccess({ admin_session_token: payload.admin_session_token });
  if (admin.admin_id !== Deno.env.get("ADMIN_ID")) throw new HttpError("Invalid admin session", 401);
  if (typeof action !== "string" || !["create", "board", "close", "update", "delete", "draw", "finish"].includes(action)) throw new HttpError("INVALID_ACTION", 400);
  const eventId = action === "create" ? null : uuid(payload.event_id);
  const data: Record<string, unknown> = {};
  if (action === "create") {
    if (typeof payload.title !== "string" || !payload.title.trim() || [...payload.title.trim()].length > 120) throw new HttpError("INVALID_TITLE", 400);
    data.title = payload.title.trim();
  }
  if (action === "update" || action === "delete") data.participant_id = uuid(payload.participant_id, "participant_id");
  if (action === "update") data.name = name(payload.name);
  const client = getServiceClient();
  if (action === "draw") {
    if (payload.winner_count !== 2 && payload.winner_count !== 3) throw new HttpError("INVALID_WINNER_COUNT", 400);
    // closed events cannot be edited. Concurrent draws are resolved under the DB event lock.
    const { data: snapshot, error } = await client.rpc("nds_lucky_100_admin", { p_action: "board", p_event: eventId, p_actor: admin.admin_id, p_data: {} });
    if (error) throw new HttpError("Failed to load candidates", 500);
    if (snapshot.error) return result(snapshot);
    if (snapshot.event.status !== "closed" && !["drawing", "completed"].includes(snapshot.event.status)) return result({ error: "NOT_CLOSED" });
    if (["drawing", "completed"].includes(snapshot.event.status)) return result(snapshot);
    if (snapshot.participants.length < payload.winner_count) return result({ error: "NOT_ENOUGH_PARTICIPANTS" });
    data.winner_count = payload.winner_count;
    data.participant_ids = secureShuffle<{ id: string }>(snapshot.participants).slice(0, payload.winner_count).map((p) => p.id);
  }
  const { data: response, error } = await client.rpc("nds_lucky_100_admin", { p_action: action, p_event: eventId, p_actor: admin.admin_id, p_data: data });
  if (error) throw new HttpError("Failed to process admin request", 500);
  return result(response);
}));
