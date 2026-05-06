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

    const { data: nextResult, error: nextError } = await supabase
      .from("draw_results")
      .select("id, participant_id, rank")
      .eq("draw_id", draw.id)
      .eq("is_revealed", false)
      .order("rank", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextError) {
      throw new HttpError("Failed to load next result", 500, nextError.message);
    }

    if (!nextResult) {
      return jsonResponse({
        success: true,
        winner: null,
        remaining_count: 0,
      });
    }

    const revealedAt = new Date().toISOString();
    const { data: revealedResult, error: updateError } = await supabase
      .from("draw_results")
      .update({
        is_revealed: true,
        revealed_at: revealedAt,
      })
      .eq("id", nextResult.id)
      .eq("is_revealed", false)
      .select("id, participant_id, rank, is_revealed, revealed_at")
      .maybeSingle();

    if (updateError) {
      throw new HttpError("Failed to reveal result", 500, updateError.message);
    }

    if (!revealedResult) {
      throw new HttpError("Result was revealed by another request", 409);
    }

    let card: Record<string, unknown> | null = null;

    if (draw.draw_mode === "card") {
      const { data: revealedCard, error: cardError } = await supabase
        .from("draw_cards")
        .update({
          is_revealed: true,
          revealed_at: revealedAt,
        })
        .eq("draw_id", draw.id)
        .eq("participant_id", revealedResult.participant_id)
        .select("id, position, is_winner, winner_rank, is_revealed, revealed_at")
        .maybeSingle();

      if (cardError) {
        throw new HttpError("Failed to reveal winner card", 500, cardError.message);
      }

      card = revealedCard;
    }

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id, name")
      .eq("id", revealedResult.participant_id)
      .single();

    if (participantError) {
      throw new HttpError("Failed to load winner", 500, participantError.message);
    }

    const { count, error: countError } = await supabase
      .from("draw_results")
      .select("id", { count: "exact", head: true })
      .eq("draw_id", draw.id)
      .eq("is_revealed", false);

    if (countError) {
      throw new HttpError("Failed to count remaining results", 500, countError.message);
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
      action: "result_revealed",
      payload: {
        admin_id: admin.admin_id,
        participant_id: revealedResult.participant_id,
        rank: revealedResult.rank,
        remaining_count: count ?? 0,
        card,
      },
    });

    if (auditError) {
      throw new HttpError("Failed to write audit log", 500, auditError.message);
    }

    return jsonResponse({
      success: true,
      winner: {
        participant_id: participant.id,
        name: participant.name,
        rank: revealedResult.rank,
        revealed_at: revealedResult.revealed_at,
      },
      card,
      remaining_count: count ?? 0,
    });
  })
);
