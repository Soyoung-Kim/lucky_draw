import { verifyAdminAccess } from "../_shared/admin.ts";
import { secureShuffle, sha256Hex } from "../_shared/crypto.ts";
import { HttpError, jsonResponse, readJson, withJsonHandler } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { requiredPositiveInteger, requiredText } from "../_shared/validation.ts";

const ALGORITHM_VERSION = "secure-fisher-yates-v1";
const DRAW_MODES = new Set(["capsule", "card", "lotto"]);
const REVEAL_MODES = new Set(["auto", "manual"]);

type Participant = {
  id: string;
  name: string;
  employee_no: string;
  created_at: string;
};

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const body = await readJson(req);
    const admin = await verifyAdminAccess(body);
    const roomId = requiredText(body.room_id, "room_id");
    const winnerCount = requiredPositiveInteger(body.winner_count, "winner_count");
    const drawMode = requiredText(body.draw_mode, "draw_mode");
    const revealMode = requiredText(body.reveal_mode, "reveal_mode");

    if (!DRAW_MODES.has(drawMode)) {
      throw new HttpError("draw_mode must be capsule, card, or lotto", 400);
    }

    if (!REVEAL_MODES.has(revealMode)) {
      throw new HttpError("reveal_mode must be auto or manual", 400);
    }

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

    if (room.status !== "closed") {
      throw new HttpError("Room must be closed before drawing", 409);
    }

    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("id, name, employee_no, created_at")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (participantsError) {
      throw new HttpError("Failed to load participants", 500, participantsError.message);
    }

    const participantRows = (participants ?? []) as Participant[];
    const participantCount = participantRows.length;

    if (participantCount < winnerCount) {
      throw new HttpError("winner_count cannot exceed participant_count", 400, {
        participant_count: participantCount,
        winner_count: winnerCount,
      });
    }

    const participantSnapshot = participantRows.map((participant) => ({
      id: participant.id,
      name: participant.name,
      employee_no: participant.employee_no,
      created_at: participant.created_at,
    }));
    const participantSnapshotHash = await sha256Hex(JSON.stringify(participantSnapshot));
    const seedBytes = new Uint8Array(32);
    crypto.getRandomValues(seedBytes);
    const seedHash = await sha256Hex(seedBytes);
    const shuffledParticipants = secureShuffle(participantRows);
    const winners = shuffledParticipants.slice(0, winnerCount);
    const resultSnapshot = winners.map((participant, index) => ({
      rank: index + 1,
      participant_id: participant.id,
    }));
    const resultHash = await sha256Hex(JSON.stringify(resultSnapshot));

    const { data: draw, error: drawError } = await supabase
      .from("draws")
      .insert({
        room_id: room.id,
        draw_mode: drawMode,
        reveal_mode: revealMode,
        winner_count: winnerCount,
        participant_count: participantCount,
        algorithm_version: ALGORITHM_VERSION,
        seed_hash: seedHash,
        participant_snapshot_hash: participantSnapshotHash,
        result_hash: resultHash,
        status: "created",
      })
      .select("id")
      .single();

    if (drawError) {
      throw new HttpError("Failed to create draw", 500, drawError.message);
    }

    const resultRows = winners.map((participant, index) => ({
      draw_id: draw.id,
      participant_id: participant.id,
      rank: index + 1,
      is_revealed: false,
    }));

    const { error: resultsError } = await supabase.from("draw_results").insert(resultRows);

    if (resultsError) {
      throw new HttpError("Failed to create draw results", 500, resultsError.message);
    }

    if (drawMode === "card") {
      const winnerRanks = new Map(
        winners.map((participant, index) => [participant.id, index + 1]),
      );
      const cardParticipants = secureShuffle(participantRows);
      const cardRows = cardParticipants.map((participant, index) => {
        const winnerRank = winnerRanks.get(participant.id) ?? null;

        return {
          draw_id: draw.id,
          participant_id: participant.id,
          position: index + 1,
          is_winner: winnerRank !== null,
          winner_rank: winnerRank,
          is_revealed: false,
        };
      });

      const { error: cardsError } = await supabase.from("draw_cards").insert(cardRows);

      if (cardsError) {
        throw new HttpError("Failed to create draw cards", 500, cardsError.message);
      }
    }

    const { error: roomUpdateError } = await supabase
      .from("rooms")
      .update({ status: "drawing" })
      .eq("id", room.id);

    if (roomUpdateError) {
      throw new HttpError("Failed to update room status", 500, roomUpdateError.message);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      room_id: room.id,
      draw_id: draw.id,
      action: "draw_created",
      payload: {
        admin_id: admin.admin_id,
        draw_mode: drawMode,
        reveal_mode: revealMode,
        winner_count: winnerCount,
        participant_count: participantCount,
        algorithm_version: ALGORITHM_VERSION,
        seed_hash: seedHash,
        participant_snapshot_hash: participantSnapshotHash,
        result_hash: resultHash,
      },
    });

    if (auditError) {
      throw new HttpError("Failed to write audit log", 500, auditError.message);
    }

    return jsonResponse({
      success: true,
      draw_id: draw.id,
      draw_mode: drawMode,
      reveal_mode: revealMode,
      winner_count: winnerCount,
      participant_count: participantCount,
    });
  })
);
