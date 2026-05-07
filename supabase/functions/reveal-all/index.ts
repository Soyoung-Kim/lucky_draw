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
      .select("id, room_id, status, draw_mode")
      .eq("id", drawId)
      .maybeSingle();

    if (drawError) {
      throw new HttpError("Failed to load draw", 500, drawError.message);
    }

    if (!draw) {
      throw new HttpError("Draw not found", 404);
    }

    if (draw.status === "finished") {
      throw new HttpError("Draw is already finished", 409);
    }

    const { count: resultCount, error: resultCountError } = await supabase
      .from("draw_results")
      .select("id", { count: "exact", head: true })
      .eq("draw_id", draw.id)
      .eq("is_revealed", false);

    if (resultCountError) {
      throw new HttpError("Failed to count draw results", 500, resultCountError.message);
    }

    let cardCount = 0;

    if (draw.draw_mode === "card") {
      const { count, error } = await supabase
        .from("draw_cards")
        .select("id", { count: "exact", head: true })
        .eq("draw_id", draw.id)
        .eq("is_revealed", false);

      if (error) {
        throw new HttpError("Failed to count draw cards", 500, error.message);
      }

      cardCount = count ?? 0;
    }

    const revealedAt = new Date().toISOString();

    if (draw.draw_mode !== "card") {
      const { error: resultsError } = await supabase
        .from("draw_results")
        .update({
          is_revealed: true,
          revealed_at: revealedAt,
        })
        .eq("draw_id", draw.id)
        .eq("is_revealed", false);

      if (resultsError) {
        throw new HttpError("Failed to reveal draw results", 500, resultsError.message);
      }
    }

    if (draw.draw_mode === "card") {
      const { error: cardsError } = await supabase
        .from("draw_cards")
        .update({
          is_revealed: true,
          revealed_at: revealedAt,
        })
        .eq("draw_id", draw.id)
        .eq("is_revealed", false);

      if (cardsError) {
        throw new HttpError("Failed to reveal draw cards", 500, cardsError.message);
      }
    }

    if (draw.status === "created") {
      const { error: statusError } = await supabase
        .from("draws")
        .update({ status: "revealing" })
        .eq("id", draw.id);

      if (statusError) {
        throw new HttpError("Failed to update draw status", 500, statusError.message);
      }
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      room_id: draw.room_id,
      draw_id: draw.id,
      action: "reveal_all",
      payload: {
        admin_id: admin.admin_id,
        revealed_result_count: resultCount ?? 0,
        revealed_card_count: cardCount,
      },
    });

    if (auditError) {
      throw new HttpError("Failed to write audit log", 500, auditError.message);
    }

    return jsonResponse({
      success: true,
      revealed_result_count: resultCount ?? 0,
      revealed_card_count: cardCount,
    });
  })
);
