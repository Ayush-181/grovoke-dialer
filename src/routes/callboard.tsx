import { createFileRoute } from "@tanstack/react-router";
import { LiveWorkspace } from "../remake/live/LiveWorkspace";
export const Route = createFileRoute("/callboard")({ ssr: false, component: LiveWorkspace });
