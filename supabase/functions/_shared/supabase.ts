/// &lt;reference types="https://deno.land/x/types/deno.d.ts" /&gt;
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError("Supabase service configuration is missing", 500);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
