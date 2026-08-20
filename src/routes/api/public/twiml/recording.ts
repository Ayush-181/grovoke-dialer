import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twiml/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const workspaceId = url.searchParams.get("ws") ?? "";
        if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId)) {
          return new Response("bad workspace", { status: 400 });
        }

        const body = new URLSearchParams(await request.text());
        const callSid = body.get("CallSid") ?? body.get("ParentCallSid") ?? "";
        const recordingUrl = body.get("RecordingUrl") ?? "";
        const duration = Number(body.get("RecordingDuration") ?? "0");
        if (!callSid || !recordingUrl) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("dial_call_logs")
          .update({
            recording_url: `${recordingUrl}.mp3`,
            ...(duration > 0 ? { duration_seconds: duration } : {}),
          })
          .eq("workspace_id", workspaceId)
          .eq("call_sid", callSid);

        return new Response("ok");
      },
    },
  },
});
