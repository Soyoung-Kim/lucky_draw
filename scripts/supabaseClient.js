import { CONFIG, isConfigured } from "./config.js";

if (!window.supabase) {
  throw new Error("Supabase JS CDN을 불러오지 못했습니다.");
}

export const supabaseClient = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
    },
  },
);

export function assertConfigured() {
  if (!isConfigured()) {
    throw new Error("scripts/config.js에 Supabase URL과 anon key를 입력해 주세요.");
  }
}
