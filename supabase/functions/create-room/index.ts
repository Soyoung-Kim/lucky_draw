import { verifyAdminAccess } from "../_shared/admin.ts";
import { randomCode } from "../_shared/crypto.ts";
import { HttpError, jsonResponse, readJson, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { optionalIsoDate, optionalText, requiredIsoDate, requiredText } from "../_shared/validation.ts";

function normalizeRoomCode(input: string | null) {
  const code = input ? input.trim().toUpperCase() : `EVT-${randomCode(6)}`;

  if (!/^[A-Z0-9_-]{3,50}$/.test(code)) {
    throw new HttpError("code must be 3-50 characters: A-Z, 0-9, underscore, or hyphen", 400);
  }

  return code;
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const body = await readJson(req);
    const admin = await verifyAdminAccess(body);
    const title = requiredText(body.title, "title", 120);
    const code = normalizeRoomCode(optionalText(body.code, "code", 50));
    const startsAt = optionalIsoDate(body.starts_at, "starts_at") ?? new Date();
    const endsAt = requiredIsoDate(body.ends_at, "ends_at");

    if (endsAt <= startsAt) {
      throw new HttpError("ends_at must be later than starts_at", 400);
    }

    const supabase = getServiceClient();

    const { data: room, error: insertError } = await supabase
      .from("rooms")
      .insert({
        code,
        title,
        status: "open",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select("id, code, title, status, starts_at, ends_at, created_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        throw new HttpError("Room code already exists", 409);
      }

      throw new HttpError("Failed to create room", 500, insertError.message);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      room_id: room.id,
      action: "room_created",
      payload: {
        admin_id: admin.admin_id,
        code: room.code,
        title: room.title,
        starts_at: room.starts_at,
        ends_at: room.ends_at,
      },
    });

    if (auditError) {
      throw new HttpError("Failed to write audit log", 500, auditError.message);
    }

    return jsonResponse({
      success: true,
      room,
    });
  })
);
