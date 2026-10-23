import { createFileRoute } from "@tanstack/react-router";
import { callboardVoice } from "../../../../lib/callboard-handlers.server";
export const Route = createFileRoute("/api/public/callboard/voice")({
  server: { handlers: { POST: ({ request }) => callboardVoice(request) } },
});
