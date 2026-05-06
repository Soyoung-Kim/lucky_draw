import { verifyAdminAccess } from "../_shared/admin.ts";
import { HttpError, jsonResponse, readJson, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { requiredText } from "../_shared/validation.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const body = await readJson(req);
    const admin = await verifyAdminAccess(body);
    const roomId = requiredText(body.room_id, "room_id");
    const supabase = getServiceClient();

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, status")
      .eq("id", roomId)
      .maybeSingle();

    if (roomError) {
      throw new HttpError("Failed to load room", 500, roomError.message);
    }

    if (!room) {
      throw new HttpError("Room not found", 404);
    }

    if (room.status === "closed") {
      return jsonResponse({ success: true, room_id: room.id, status: "closed" });
    }

    if (room.status !== "open") {
      throw new HttpError(`Room cannot be closed from status: ${room.status}`, 409);
    }

    const { data: updatedRoom, error: updateError } = await supabase
      .from("rooms")
      .update({ status: "closed" })
      .eq("id", room.id)
      .eq("status", "open")
      .select("id, status")
      .maybeSingle();

    if (updateError) {
      throw new HttpError("Failed to close room", 500, updateError.message);
    }

    if (!updatedRoom) {
      throw new HttpError("Room status changed before close", 409);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      room_id: updatedRoom.id,
      action: "room_closed",
      payload: {
        admin_id: admin.admin_id,
        status: updatedRoom.status,
      },
    });

    if (auditError) {
      throw new HttpError("Failed to write audit log", 500, auditError.message);
    }

    return jsonResponse({
      success: true,
      room_id: updatedRoom.id,
      status: updatedRoom.status,
    });
  })
);
