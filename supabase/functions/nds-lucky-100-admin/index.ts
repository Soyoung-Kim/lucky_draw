import { createAdminSessionToken, verifyAdminCredentials, verifyAdminAccess } from "../_shared/admin.ts";
import { secureShuffle } from "../_shared/crypto.ts";
import { HttpError, jsonResponse, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { body, name, rateLimit, result, uuid } from "../_shared/nds-lucky-100.ts";
import { testNames } from "../_shared/nds-test-participants.ts";

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
  if (typeof action !== "string" || !["create", "board", "close", "reopen", "update", "delete", "draw", "finish", "seed", "register"].includes(action)) throw new HttpError("INVALID_ACTION", 400);
  const eventId = action === "create" ? null : uuid(payload.event_id);
  const data: Record<string, unknown> = {};
  if (action === "create") {
    if (typeof payload.title !== "string" || !payload.title.trim() || [...payload.title.trim()].length > 120) throw new HttpError("INVALID_TITLE", 400);
    data.title = payload.title.trim();
  }
  if (action === "update" || action === "delete") data.participant_id = uuid(payload.participant_id, "participant_id");
  if (action === "update") data.name = name(payload.name);
  const client = getServiceClient();
  if (action === "register") {
    const participantName = name(payload.name);
    const slot = payload.slot_number;
    if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 1 || slot > 100) throw new HttpError("INVALID_SLOT", 400);
    const { data: registration, error } = await client.rpc("nds_lucky_100_public", {
      p_action: "register", p_event: eventId, p_name: participantName, p_slot: slot,
    });
    if (error) throw new HttpError("Failed to register participant", 500, { db_code: error.code });
    return result(registration);
  }
  if (action === "seed") {
    const count = payload.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 100) throw new HttpError("INVALID_TEST_COUNT", 400);
    const { data: board, error } = await client.rpc("nds_lucky_100_admin", { p_action: "board", p_event: eventId, p_actor: admin.admin_id, p_data: {} });
    if (error) throw new HttpError("Failed to load test board", 500);
    if (board.error) return result(board);
    if (board.event.status !== "registration") return result({ error: "CLOSED" });
    const occupied = new Set(board.participants.map((p: { slot_number: number }) => p.slot_number));
    const free = secureShuffle(Array.from({ length: 100 }, (_, i) => i + 1).filter((slot) => !occupied.has(slot)));
    if (count > free.length) return result({ error: "NOT_ENOUGH_SLOTS", available_slots: free.length });
    const names = testNames(board.participants.map((p: { display_name: string }) => p.display_name));
    let inserted = 0, nameIndex = 0, stoppedReason: string | null = null;
    // Each insert uses the exact public registration transaction, including name/slot/close checks.
    for (const slot of free) {
      if (inserted >= count) break;
      while (nameIndex < names.length) {
        const candidate = names[nameIndex++];
        const { data: registration, error: registerError } = await client.rpc("nds_lucky_100_public", {
          p_action: "register", p_event: eventId, p_name: candidate, p_slot: slot,
        });
        if (registerError) { stoppedReason = "SERVER_ERROR"; break; }
        if (!registration.error) { inserted++; break; }
        if (registration.error === "ALREADY_NAME") continue;
        if (registration.error === "SLOT_TAKEN") break;
        stoppedReason = registration.error; break;
      }
      if (stoppedReason) break;
    }
    if (inserted < count && !stoppedReason) stoppedReason = "NOT_ENOUGH_SLOTS";
    const { error: auditError } = await client.from("nds_lucky_100_audit_logs").insert({
      event_id: eventId, actor: admin.admin_id, action: "seed", details: { requested_count: count, inserted_count: inserted, stopped_reason: stoppedReason },
    });
    if (auditError) console.error("Test participant audit failed", { code: auditError.code });
    return jsonResponse({ success: true, requested_count: count, inserted_count: inserted, stopped_reason: stoppedReason });
  }
  if (action === "draw") {
    if (typeof payload.winner_count !== "number" || !Number.isInteger(payload.winner_count) || payload.winner_count < 1 || payload.winner_count > 10) throw new HttpError("INVALID_WINNER_COUNT", 400);
    // closed events cannot be edited. Concurrent draws are resolved under the DB event lock.
    const { data: snapshot, error } = await client.rpc("nds_lucky_100_admin", { p_action: "board", p_event: eventId, p_actor: admin.admin_id, p_data: {} });
    if (error) {
      console.error("NDS admin candidate RPC failed", { code: error.code, message: error.message });
      throw new HttpError("Failed to load candidates", 500, { db_code: error.code });
    }
    if (snapshot.error) return result(snapshot);
    if (snapshot.event.status !== "closed" && !["drawing", "completed"].includes(snapshot.event.status)) return result({ error: "NOT_CLOSED" });
    if (["drawing", "completed"].includes(snapshot.event.status)) return result(snapshot);
    if (snapshot.participants.length < payload.winner_count) return result({ error: "NOT_ENOUGH_PARTICIPANTS" });
    data.winner_count = payload.winner_count;
    data.candidate_ids = snapshot.participants.map((p: { id: string }) => p.id);
    data.participant_ids = secureShuffle<{ id: string }>(snapshot.participants).slice(0, payload.winner_count).map((p) => p.id);
  }
  const { data: response, error } = await client.rpc("nds_lucky_100_admin", { p_action: action, p_event: eventId, p_actor: admin.admin_id, p_data: data });
  if (error) {
    console.error("NDS admin RPC failed", { action, code: error.code, message: error.message });
    throw new HttpError("Failed to process admin request", 500, { db_code: error.code });
  }
  if (action === "reopen" && response.error === "INVALID_ACTION") return result({ error: "DB_UPDATE_REQUIRED" });
  return result(response);
}));
