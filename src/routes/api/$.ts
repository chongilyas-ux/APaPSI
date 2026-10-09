import { createFileRoute } from "@tanstack/react-router";

// Single HTTP entry for the APaPSI API (same contract as the original Express /api).
// Every endpoint except /health and first-run /auth/bootstrap verifies the caller's session.
async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const { handleApi } = await import("@/lib/api.server");
  const { handleAi } = await import("@/lib/ai.server");
  return handleApi(request, "/" + (params._splat ?? ""), handleAi);
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle },
  },
});
