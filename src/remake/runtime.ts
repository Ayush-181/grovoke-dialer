import { createContext, useContext } from "react";
import type { Action, Booking, State } from "./model";
import type { BusyPeriod } from "../lib/booking-time";

export type ProviderSnapshot = {
  phase: "offline" | "idle" | "connecting" | "live" | "ended";
  phone?: string;
  seconds: number;
  talkSeconds?: number;
  heldSeconds?: number;
  legs?: { phone: string; status: string }[];
  muted: boolean;
  held?: boolean;
  recording?: boolean;
  error?: string | null;
};
export type RuntimeServices = {
  mode: "demo" | "live";
  label?: string;
  pending?: boolean;
  storageKey?: string;
  capabilities: {
    voice: boolean;
    dtmf?: boolean;
    hold: boolean;
    conference: boolean;
    recording: boolean;
    calendar: boolean;
  };
  voice?: {
    ready: boolean;
    status: ProviderSnapshot["phase"];
    inputDevices?: { id: string; label: string }[];
    selectedInput?: string | null;
    error: string | null;
    snapshot: ProviderSnapshot;
    connect: () => Promise<void>;
  };
  recordings?: { availableIds: string[]; load: (id: string) => Promise<Blob> };
  calendar?: {
    configured: boolean;
    ready: boolean;
    connected: boolean;
    connecting: boolean;
    email: string | null;
    error: string | null;
    connect: (changeAccount?: boolean) => void | Promise<void>;
    getBusy: (start: Date, end: Date) => Promise<BusyPeriod[]>;
    createBooking: (booking: Booking) => Promise<Booking>;
  };
  /** Executes the requested provider operation and persists a valid model transition. */
  execute?: (action: Action, before: State, after: State) => Promise<void>;
  refresh?: () => Promise<void>;
  signOut?: () => Promise<void>;
};
export const demoRuntime: RuntimeServices = {
  mode: "demo",
  capabilities: {
    dtmf: true,
    voice: true,
    hold: true,
    conference: true,
    recording: true,
    calendar: true,
  },
};
export const RuntimeContext = createContext<RuntimeServices>(demoRuntime);
export function useRuntime() {
  return useContext(RuntimeContext);
}
