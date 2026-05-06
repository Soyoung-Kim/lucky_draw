export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return jsonResponse({ success: false, error: message, details }, status);
}

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }
}

export async function withJsonHandler(
  req: Request,
  handler: () => Promise<Response>,
) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("POST method is required", 405);
  }

  try {
    return await handler();
  } catch (error) {
    console.error(error);

    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status, error.details);
    }

    return errorResponse("Internal server error", 500);
  }
}
