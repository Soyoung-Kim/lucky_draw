import { supabaseClient, assertConfigured } from "./supabaseClient.js";

async function normalizeFunctionError(error, data) {
  if (data?.error) return data.error;

  if (error?.context) {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    } catch {
      // Keep the original function error message below.
    }
  }

  if (error?.message) return error.message;
  return "요청 처리에 실패했습니다.";
}

export async function invokeFunction(name, payload = {}) {
  assertConfigured();
  const { data, error } = await supabaseClient.functions.invoke(name, {
    body: payload,
  });

  if (error || data?.success === false) {
    throw new Error(await normalizeFunctionError(error, data));
  }

  return data;
}

export async function adminLogin(adminId, password) {
  return invokeFunction("admin-login", {
    admin_id: adminId,
    password,
  });
}

export async function createRoom(payload) {
  return invokeFunction("create-room", payload);
}

export async function submitEntry(payload) {
  return invokeFunction("submit-entry", payload);
}

export async function closeRoom(payload) {
  return invokeFunction("close-room", payload);
}

export async function createDraw(payload) {
  return invokeFunction("create-draw", payload);
}

export async function revealNext(payload) {
  return invokeFunction("reveal-next", payload);
}

export async function revealCard(payload) {
  return invokeFunction("reveal-card", payload);
}

export async function revealAll(payload) {
  return invokeFunction("reveal-all", payload);
}

export async function finishDraw(payload) {
  return invokeFunction("finish-draw", payload);
}

export async function fetchRoomByCode(code) {
  assertConfigured();
  const { data, error } = await supabaseClient
    .from("rooms")
    .select("id, code, title, status, starts_at, ends_at, created_at")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchRooms() {
  assertConfigured();
  const { data, error } = await supabaseClient
    .from("rooms")
    .select("id, code, title, status, starts_at, ends_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countParticipants(roomId) {
  assertConfigured();
  const { count, error } = await supabaseClient
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchLatestDraw(roomId) {
  assertConfigured();
  const { data, error } = await supabaseClient
    .from("draws")
    .select("id, room_id, draw_mode, reveal_mode, winner_count, participant_count, algorithm_version, status, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function fetchParticipantMap(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseClient
    .from("participants")
    .select("id, name")
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((participant) => [participant.id, participant]));
}

export async function fetchRevealedResults(drawId) {
  assertConfigured();
  const { data, error } = await supabaseClient
    .from("draw_results")
    .select("id, draw_id, participant_id, rank, is_revealed, revealed_at")
    .eq("draw_id", drawId)
    .eq("is_revealed", true)
    .order("rank", { ascending: true });

  if (error) throw new Error(error.message);

  const participantMap = await fetchParticipantMap((data ?? []).map((result) => result.participant_id));

  return (data ?? []).map((result) => ({
    ...result,
    participant_name: participantMap.get(result.participant_id)?.name || "당첨자",
  }));
}

export async function fetchRevealedCards(drawId) {
  assertConfigured();
  const { data, error } = await supabaseClient
    .from("draw_cards")
    .select("id, draw_id, participant_id, position, is_winner, winner_rank, is_revealed, revealed_at")
    .eq("draw_id", drawId)
    .eq("is_revealed", true)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);

  const participantMap = await fetchParticipantMap((data ?? []).map((card) => card.participant_id));

  return (data ?? []).map((card) => ({
    ...card,
    participant_name: participantMap.get(card.participant_id)?.name || "참가자",
  }));
}
