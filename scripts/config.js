export const CONFIG = {
  SUPABASE_URL: "https://skxxaiquhkjjlcpbmzul.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNreHhhaXF1aGtqamxjcGJtenVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDU1ODcsImV4cCI6MjA5MzYyMTU4N30.y3fEMi7xUtqD4U1Ip0uRhJV2Z2Ij1E9x1Dx7CWoUWac",
  PARTICIPANT_COUNT_REFRESH_MS: 5000,
  DRAW_REFRESH_MS: 3000,
  AUTO_REVEAL_DELAY_MS: 1500,
};

export function isConfigured() {
  return (
    CONFIG.SUPABASE_URL.startsWith("https://") &&
    !CONFIG.SUPABASE_URL.includes("skxxaiquhkjjlcpbmzul") &&
    CONFIG.SUPABASE_ANON_KEY &&
    CONFIG.SUPABASE_ANON_KEY !== "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNreHhhaXF1aGtqamxjcGJtenVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDU1ODcsImV4cCI6MjA5MzYyMTU4N30.y3fEMi7xUtqD4U1Ip0uRhJV2Z2Ij1E9x1Dx7CWoUWac"
  );
}
