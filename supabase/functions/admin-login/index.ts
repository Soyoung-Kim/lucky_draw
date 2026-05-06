import { createAdminSessionToken, verifyAdminCredentials } from "../_shared/admin.ts";
import { jsonResponse, readJson, withJsonHandler } from "../_shared/http.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const body = await readJson(req);
    const adminId = verifyAdminCredentials(
      body.admin_id ?? body.id ?? body.username,
      body.password ?? body.pw,
    );
    const session = await createAdminSessionToken(adminId);

    return jsonResponse({
      success: true,
      admin_id: adminId,
      admin_session_token: session.token,
      expires_at: session.expires_at,
    });
  })
);
