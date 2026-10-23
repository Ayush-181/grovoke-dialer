import { createFileRoute } from "@tanstack/react-router";
import { callboardRecording } from "../../../../lib/callboard-handlers.server";
export const Route = createFileRoute("/api/public/callboard/recording")({
  server: { handlers: { POST: ({ request }) => callboardRecording(request) } },
});
