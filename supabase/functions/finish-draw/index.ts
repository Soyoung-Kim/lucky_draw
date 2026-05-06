import { verifyAdminAccess } from "../_shared/admin.ts";
import { HttpError, jsonResponse, readJson, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { requiredText } from "../_shared/validation.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const body = await readJson(req);
    const admin = await verifyAdminAccess(body);
    const drawId = requiredText(body.draw_id, "draw_id");
    const supabase = getServiceClient();

    const { data: draw, error: drawError } = await supabase
      .from("draws")
      .select("id, room_id, status")
      .eq("id", drawId)
      .maybeSingle();

    if (drawError) {
      throw new HttpError("Failed to load draw", 500, drawError.message);
    }

    if (!draw) {
      throw new HttpError("Draw not found", 404);
    }

    if (draw.status === "finished") {
      return jsonResponse({
        success: true,
        draw_id: draw.id,
        room_id: draw.room_id,
        status: "finished",
      });
    }

    const { error: drawUpdateError } = await supabase
      .from("draws")
      .update({ status: "finished" })
      .eq("id", draw.id);

    if (drawUpdateError) {
      throw new HttpError("Failed to finish draw", 500, drawUpdateError.message);
    }

    const { error: roomUpdateError } = await supabase
      .from("rooms")
      .update({ status: "finished" })
      .eq("id", draw.room_id);

    if (roomUpdateError) {
      throw new HttpError("Failed to finish room", 500, roomUpdateError.message);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      room_id: draw.room_id,
      draw_id: draw.id,
      action: "draw_finished",
      payload: {
        admin_id: admin.admin_id,
      },
    });

    if (auditError) {
      throw new HttpError("Failed to write audit log", 500, auditError.message);
    }

    return jsonResponse({
      success: true,
      draw_id: draw.id,
      room_id: draw.room_id,
      status: "finished",
    });
  })
);
