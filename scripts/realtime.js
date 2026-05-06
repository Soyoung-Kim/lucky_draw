import { supabaseClient } from "./supabaseClient.js";

export function subscribeRoom(roomId, handlers = {}) {
  return supabaseClient
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      (payload) => handlers.onRoom?.(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "draws", filter: `room_id=eq.${roomId}` },
      (payload) => handlers.onDraw?.(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "draws", filter: `room_id=eq.${roomId}` },
      (payload) => handlers.onDraw?.(payload.new),
    )
    .subscribe();
}

export function subscribeDraw(drawId, handlers = {}) {
  return supabaseClient
    .channel(`draw-${drawId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "draw_results", filter: `draw_id=eq.${drawId}` },
      (payload) => handlers.onResult?.(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "draw_cards", filter: `draw_id=eq.${drawId}` },
      (payload) => handlers.onCard?.(payload.new),
    )
    .subscribe();
}

export function unsubscribe(channel) {
  if (channel) {
    supabaseClient.removeChannel(channel);
  }
}
