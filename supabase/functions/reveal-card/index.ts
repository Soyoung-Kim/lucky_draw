import { verifyAdminAccess } from "../_shared/admin.ts";
import { HttpError, jsonResponse, readJson, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { requiredPositiveInteger, requiredText } from "../_shared/validation.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const body = await readJson(req);
    const admin = await verifyAdminAccess(body);
    const drawId = requiredText(body.draw_id, "draw_id");
    const position = requiredPositiveInteger(body.position, "position");
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

    if (draw.draw_mode !== "card") {
      throw new HttpError("reveal-card is only available for card mode", 400);
    }

    if (draw.status === "finished") {
      throw new HttpError("Draw is already finished", 409);
    }

    const { data: card, error: cardError } = await supabase
      .from("draw_cards")
      .select("id, participant_id, position, is_winner, winner_rank, is_revealed, revealed_at")
      .eq("draw_id", draw.id)
      .eq("position", position)
      .maybeSingle();

    if (cardError) {
      throw new HttpError("Failed to load card", 500, cardError.message);
    }

    if (!card) {
      throw new HttpError("Card not found", 404);
    }

    let revealedCard = card;
    let changed = false;

    if (!card.is_revealed) {
      const revealedAt = new Date().toISOString();
      const { data: updatedCard, error: updateError } = await supabase
        .from("draw_cards")
        .update({
          is_revealed: true,
          revealed_at: revealedAt,
        })
        .eq("id", card.id)
        .eq("is_revealed", false)
        .select("id, participant_id, position, is_winner, winner_rank, is_revealed, revealed_at")
        .maybeSingle();

      if (updateError) {
        throw new HttpError("Failed to reveal card", 500, updateError.message);
      }

      if (!updatedCard) {
        throw new HttpError("Card was revealed by another request", 409);
      }

      revealedCard = updatedCard;
      changed = true;

      if (updatedCard.is_winner) {
        const { error: resultError } = await supabase
          .from("draw_results")
          .update({
            is_revealed: true,
            revealed_at: revealedAt,
          })
          .eq("draw_id", draw.id)
          .eq("participant_id", updatedCard.participant_id)
          .eq("is_revealed", false);

        if (resultError) {
          throw new HttpError("Failed to reveal linked winner result", 500, resultError.message);
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
    }

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id, name")
      .eq("id", revealedCard.participant_id)
      .single();

    if (participantError) {
      throw new HttpError("Failed to load participant", 500, participantError.message);
    }

    if (changed) {
      const { error: auditError } = await supabase.from("audit_logs").insert({
        room_id: draw.room_id,
        draw_id: draw.id,
        action: "card_revealed",
        payload: {
          admin_id: admin.admin_id,
          participant_id: revealedCard.participant_id,
          position: revealedCard.position,
          is_winner: revealedCard.is_winner,
          winner_rank: revealedCard.winner_rank,
        },
      });

      if (auditError) {
        throw new HttpError("Failed to write audit log", 500, auditError.message);
      }
    }

    return jsonResponse({
      success: true,
      card: {
        id: revealedCard.id,
        position: revealedCard.position,
        participant_id: participant.id,
        participant_name: participant.name,
        is_winner: revealedCard.is_winner,
        winner_rank: revealedCard.winner_rank,
        is_revealed: revealedCard.is_revealed,
        revealed_at: revealedCard.revealed_at,
      },
    });
  })
);
