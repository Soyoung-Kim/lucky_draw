import { verifyAdminAccess } from "../_shared/admin.ts";
import { sha256Hex } from "../_shared/crypto.ts";
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
      .select("id, room_id, status, draw_mode, winner_count")
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
      .select("id, participant_id, position, is_winner, winner_rank, is_revealed, revealed_at, card_status")
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
      const { count: selectedCount, error: selectedCountError } = await supabase
        .from("draw_results")
        .select("id", { count: "exact", head: true })
        .eq("draw_id", draw.id);

      if (selectedCountError) {
        throw new HttpError("Failed to count selected cards", 500, selectedCountError.message);
      }

      if ((selectedCount ?? 0) >= draw.winner_count) {
        throw new HttpError("선택한 당첨자 수가 이미 충족되었습니다", 409);
      }

      const selectedOrder = (selectedCount ?? 0) + 1;
      const { data: updatedCard, error: updateError } = await supabase
        .from("draw_cards")
        .update({
          is_winner: true,
          winner_rank: selectedOrder,
          is_revealed: true,
          revealed_at: revealedAt,
          card_status: "revealed",
        })
        .eq("id", card.id)
        .eq("is_revealed", false)
        .select("id, participant_id, position, is_winner, winner_rank, is_revealed, revealed_at, card_status")
        .maybeSingle();

      if (updateError) {
        throw new HttpError("Failed to reveal card", 500, updateError.message);
      }

      if (!updatedCard) {
        throw new HttpError("Card was revealed by another request", 409);
      }

      revealedCard = updatedCard;
      changed = true;

      const { error: resultError } = await supabase.from("draw_results").insert({
        draw_id: draw.id,
        participant_id: updatedCard.participant_id,
        rank: selectedOrder,
        is_revealed: true,
        revealed_at: revealedAt,
      });

      if (resultError) {
        if (resultError.code === "23505") {
          throw new HttpError("Selected card conflicts with an existing result", 409);
        }

        throw new HttpError("Failed to create selected card result", 500, resultError.message);
      }

      const { data: currentResults, error: currentResultsError } = await supabase
        .from("draw_results")
        .select("participant_id, rank")
        .eq("draw_id", draw.id)
        .order("rank", { ascending: true });

      if (currentResultsError) {
        throw new HttpError("Failed to load selected card results", 500, currentResultsError.message);
      }

      const resultHash = await sha256Hex(JSON.stringify(currentResults ?? []));
      const drawUpdate: Record<string, string> = { result_hash: resultHash };

      if (draw.status === "created") {
        drawUpdate.status = "revealing";
      }

      const { error: drawUpdateError } = await supabase
        .from("draws")
        .update(drawUpdate)
        .eq("id", draw.id);

      if (drawUpdateError) {
        throw new HttpError("Failed to update draw", 500, drawUpdateError.message);
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
          selected_order: revealedCard.winner_rank,
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
        selected_order: revealedCard.winner_rank,
        is_revealed: revealedCard.is_revealed,
        revealed_at: revealedCard.revealed_at,
      },
    });
  })
);
