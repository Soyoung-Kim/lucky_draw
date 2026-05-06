import { HttpError, jsonResponse, readJson, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { requiredText } from "../_shared/validation.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const body = await readJson(req);
    const roomCode = requiredText(body.room_code, "room_code", 80).toUpperCase();
    const name = requiredText(body.name, "name", 50);
    const employeeNo = requiredText(body.employee_no, "employee_no", 50);
    const supabase = getServiceClient();

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, status, starts_at, ends_at")
      .eq("code", roomCode)
      .maybeSingle();

    if (roomError) {
      throw new HttpError("Failed to load room", 500, roomError.message);
    }

    if (!room) {
      throw new HttpError("Room not found", 404);
    }

    if (room.status !== "open") {
      throw new HttpError("Room is not open", 409);
    }

    const now = new Date();
    const startsAt = new Date(room.starts_at);
    const endsAt = new Date(room.ends_at);

    if (now < startsAt || now > endsAt) {
      throw new HttpError("Entry is not allowed at this time", 403);
    }

    const { data: participant, error: insertError } = await supabase
      .from("participants")
      .insert({
        room_id: room.id,
        name,
        employee_no: employeeNo,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        throw new HttpError("이미 응모되었습니다", 409);
      }

      throw new HttpError("Failed to submit entry", 500, insertError.message);
    }

    const { count, error: countError } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);

    if (countError) {
      throw new HttpError("Failed to count participants", 500, countError.message);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      room_id: room.id,
      action: "entry_submitted",
      payload: {
        participant_id: participant.id,
        name,
        employee_no: employeeNo,
        current_count: count ?? 0,
      },
    });

    if (auditError) {
      throw new HttpError("Failed to write audit log", 500, auditError.message);
    }

    return jsonResponse({
      success: true,
      participant_id: participant.id,
      current_count: count ?? 0,
    });
  })
);
