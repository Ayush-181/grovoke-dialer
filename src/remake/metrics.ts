import type { Log, Session } from "./model";
import { CONNECTED_OUTCOMES } from "../lib/outcomes";

export function dateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)?.value).join("-");
}
export function inPeriod(logs: Log[], value: string) {
  return logs.filter((log) => dateKey(log.at).startsWith(value));
}
export function metrics(logs: Log[]) {
  const connected = logs.filter(
    (log) =>
      CONNECTED_OUTCOMES.includes(log.outcome as (typeof CONNECTED_OUTCOMES)[number]) ||
      log.outcome === "not_interested" ||
      log.triage ||
      log.offered ||
      log.booked,
  ).length;
  const count = (outcome: string) => logs.filter((log) => log.outcome === outcome).length;
  const talk = logs.reduce(
    (total, log) => total + Math.max(0, log.talkSeconds ?? log.seconds - (log.heldSeconds ?? 0)),
    0,
  );
  return {
    dials: logs.length,
    connected,
    triage: logs.filter((log) => log.triage).length,
    offered: logs.filter((log) => log.offered || log.booked || log.outcome === "appointment_set")
      .length,
    booked: logs.filter((log) => log.booked || log.outcome === "appointment_set").length,
    callbacks: logs.filter((log) => log.callback || log.outcome === "callback_requested").length,
    voicemail: count("voicemail"),
    noAnswer: count("no_answer"),
    busy: count("busy"),
    other: count("connected_other"),
    dialedOnly: count("dialed"),
    pending: count(""),
    gatekeeper: count("connected_gk"),
    decisionMaker: count("connected_dm"),
    notInterested: count("not_interested"),
    badNumber: count("bad_number"),
    doNotCall: count("do_not_call"),
    talk,
    average: logs.length ? Math.round(talk / logs.length) : 0,
    connectionRate: logs.length ? Math.round((connected / logs.length) * 100) : 0,
  };
}
export function sessionElapsed(session: Session, now: number) {
  return (
    session.elapsedMs + (session.startedAt === null ? 0 : Math.max(0, now - session.startedAt))
  );
}
export function sessionTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
