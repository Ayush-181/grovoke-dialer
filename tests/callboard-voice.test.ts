import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  conferenceName,
  controlConference,
  voiceClock,
  type StoredVoiceLeg,
  type VoiceControl,
  type VoiceControlPorts,
} from "../src/lib/callboard-voice.shared";
import { recordingMediaUrl } from "../src/lib/callboard-handlers.server";
import {
  validTwilioSignature,
  verifyCallboardWebhook,
  xmlEscape,
} from "../src/lib/callboard-webhook.server";

const primary: StoredVoiceLeg = { phone: "+12125550101", sid: "primary-call", primary: true };
const added: StoredVoiceLeg = { phone: "+12125550102", sid: "added-call", primary: false };
function provider(initial: StoredVoiceLeg[] = [primary], statuses: Record<string, string> = {}) {
  let legs = initial.map((leg) => ({ ...leg }));
  const calls = new Map(
    legs.map((leg) => [leg.sid, { status: statuses[leg.sid] ?? "in-progress", duration: "20" }]),
  );
  const participants = new Map(
    legs
      .filter((leg) => calls.get(leg.sid)!.status === "in-progress")
      .map((leg) => [
        leg.sid,
        {
          call_sid: leg.sid,
          label: leg.label ?? `leg_${leg.phone.replace(/\D/g, "")}`,
          hold: false,
        },
      ]),
  );
  const operations: { path: string; values?: Record<string, string> }[] = [];
  let ended = false,
    conferenceStatus = "in-progress",
    sequence = 0;
  const ports: VoiceControlPorts = {
    async request<T>(path: string, values?: Record<string, string>): Promise<T> {
      operations.push({ path, ...(values ? { values } : {}) });
      const call = /^\/Calls\/(.+)\.json$/.exec(path);
      if (call) {
        const record = calls.get(call[1]!);
        if (!record) throw new Error("Unknown synthetic call");
        if (values?.Status) {
          record.status = values.Status;
          participants.delete(call[1]!);
        }
        return { ...record } as T;
      }
      if (path.endsWith("/Participants.json?PageSize=100"))
        return { participants: [...participants.values()].map((item) => ({ ...item })) } as T;
      if (path.endsWith("/Participants.json") && values) {
        const sid = `added-${++sequence}`;
        calls.set(sid, { status: "ringing", duration: "0" });
        participants.set(sid, { call_sid: sid, label: values.Label!, hold: false });
        return { call_sid: sid } as T;
      }
      const participant = /\/Participants\/(.+)\.json$/.exec(path);
      if (participant && values) {
        const record = participants.get(participant[1]!);
        if (!record) throw new Error("Unknown synthetic participant");
        record.hold = values.Hold === "true";
        return { ...record } as T;
      }
      if (path === "/Conferences/conference.json") {
        if (values?.Status) conferenceStatus = values.Status;
        return { status: conferenceStatus } as T;
      }
      throw new Error(`Unexpected synthetic operation ${path}`);
    },
    async saveLegs(next) {
      legs = next.map((leg) => ({ ...leg }));
    },
    async markEnded() {
      ended = true;
    },
  };
  return {
    ports,
    operations,
    calls,
    participants,
    legs: () => legs,
    ended: () => ended,
    run: (input: VoiceControl) =>
      controlConference(input, legs, "conference", "+12125550100", ports),
  };
}

describe("conference controls with mocked provider ports", () => {
  test("the browser room adds the primary prospect once with a stable retry label", async () => {
    const mock = provider([]);
    const input = { operation: "add" as const, phone: primary.phone, primary: true };
    const result = await mock.run(input);
    expect(result.ended).toBe(false);
    expect(result.legs[0]).toMatchObject({
      phone: primary.phone,
      primary: true,
      status: "ringing",
    });
    expect(mock.legs()[0]).toMatchObject({ label: "leg_12125550101", generation: 1 });
    const create = mock.operations.filter(
      (operation) => operation.path.endsWith("/Participants.json") && operation.values,
    );
    expect(create).toHaveLength(1);
    expect(create[0]?.values).toMatchObject({
      To: primary.phone,
      EndConferenceOnExit: "true",
      Timeout: "30",
    });
    await mock.run(input);
    expect(
      mock.operations.filter(
        (operation) => operation.path.endsWith("/Participants.json") && operation.values,
      ),
    ).toHaveLength(1);
  });

  test("a conference contact can be removed while ringing and dialed again with a fresh leg", async () => {
    const mock = provider();
    await mock.run({ operation: "add", phone: added.phone });
    const first = mock.legs().find((leg) => !leg.primary)!;
    await mock.run({ operation: "remove", phone: added.phone });
    expect(mock.calls.get(first.sid)?.status).toBe("canceled");
    await mock.run({ operation: "remove", phone: added.phone }); // retry is harmless
    await mock.run({ operation: "add", phone: added.phone });
    const retried = mock.legs().find((leg) => !leg.primary)!;
    expect(retried.sid).not.toBe(first.sid);
    expect(retried.label).toBe("leg_12125550102_2");
    expect(retried.generation).toBe(2);
    expect(mock.legs()).toHaveLength(2);
  });

  test("adding decision makers requires an answered, unheld primary contact", async () => {
    const empty = provider([]);
    await expect(empty.run({ operation: "add", phone: added.phone })).rejects.toThrow("primary");
    const ringing = provider([primary], { [primary.sid]: "ringing" });
    await expect(ringing.run({ operation: "add", phone: added.phone })).rejects.toThrow("answer");
    const held = provider();
    held.participants.get(primary.sid)!.hold = true;
    await expect(held.run({ operation: "add", phone: added.phone })).rejects.toThrow("Resume");
    const active = provider();
    await expect(
      active.run({ operation: "add", phone: added.phone, primary: true }),
    ).rejects.toThrow("already");
    await expect(active.run({ operation: "remove", phone: primary.phone })).rejects.toThrow(
      "Only an added",
    );
  });

  test("hold and resume affect answered legs and expose confirmed provider state", async () => {
    const mock = provider([primary, added]);
    const held = await mock.run({ operation: "hold", held: true });
    expect(held.legs.every((leg) => leg.held)).toBe(true);
    const resumed = await mock.run({ operation: "hold", held: false });
    expect(resumed.legs.every((leg) => !leg.held)).toBe(true);
    await expect(
      mock.run({ operation: "hold", phone: "+12125550199", held: true }),
    ).rejects.toThrow("not part");
    await expect(mock.run({ operation: "hold" })).rejects.toThrow("whether");
    const ringing = provider([primary], { [primary.sid]: "ringing" });
    await expect(ringing.run({ operation: "hold", held: true })).rejects.toThrow("answer");
  });

  test("ending cancels pending legs as well as connected calls before saving terminal state", async () => {
    const mock = provider([primary, added], { [added.sid]: "ringing" });
    const result = await mock.run({ operation: "end" });
    expect(result).toEqual({ legs: [], ended: true });
    expect(mock.calls.get(primary.sid)?.status).toBe("completed");
    expect(mock.calls.get(added.sid)?.status).toBe("canceled");
    expect(mock.ended()).toBe(true);
  });

  test("unanswered primary calls terminate the room and do not leave other legs ringing", async () => {
    for (const status of ["busy", "no-answer", "failed", "canceled", "completed"]) {
      const mock = provider([primary, added], { [primary.sid]: status, [added.sid]: "ringing" });
      const result = await mock.run({ operation: "state" });
      expect(result.ended).toBe(true);
      expect(mock.calls.get(added.sid)?.status).toBe("canceled");
      expect(mock.ended()).toBe(true);
    }
  });

  test("a disappeared room still cancels outbound legs that have not joined it", async () => {
    const mock = provider([primary], { [primary.sid]: "ringing" });
    await controlConference({ operation: "end" }, mock.legs(), null, "+12125550100", mock.ports);
    expect(mock.calls.get(primary.sid)?.status).toBe("canceled");
    expect(mock.ended()).toBe(true);
    expect(mock.operations.some((operation) => operation.path.startsWith("/Conferences/"))).toBe(
      false,
    );
  });

  test("retries recover an existing labeled participant without creating another provider leg", async () => {
    const mock = provider([]);
    mock.calls.set("already-created", { status: "ringing", duration: "0" });
    mock.participants.set("already-created", {
      call_sid: "already-created",
      label: "leg_12125550101",
      hold: false,
    });
    await mock.run({ operation: "add", phone: primary.phone, primary: true });
    expect(mock.legs()[0]?.sid).toBe("already-created");
    expect(
      mock.operations.some(
        (operation) => operation.path.endsWith("/Participants.json") && operation.values,
      ),
    ).toBe(false);
  });
  test("an already-completed leg or room is a successful hangup after an ambiguous acknowledgement", async () => {
    const mock = provider();
    const request = mock.ports.request;
    mock.ports.request = async <T>(path: string, values?: Record<string, string>): Promise<T> => {
      if (path === `/Calls/${primary.sid}.json` && values) {
        mock.calls.get(primary.sid)!.status = "completed";
        throw new Error("Synthetic acknowledgement lost");
      }
      if (path === "/Conferences/conference.json") {
        if (values) throw new Error("Synthetic room already completed");
        return { status: "completed" } as T;
      }
      return request<T>(path, values);
    };
    expect(await mock.run({ operation: "end" })).toEqual({ legs: [], ended: true });
    expect(mock.ended()).toBe(true);
  });
  test("a failed hangup stays visible when the provider still reports an active leg", async () => {
    const mock = provider();
    const request = mock.ports.request;
    mock.ports.request = async <T>(path: string, values?: Record<string, string>): Promise<T> => {
      if (path.startsWith("/Calls/") && values) throw new Error("Synthetic provider failure");
      return request<T>(path, values);
    };
    await expect(mock.run({ operation: "end" })).rejects.toThrow("provider failure");
    expect(mock.ended()).toBe(false);
    expect(mock.calls.get(primary.sid)?.status).toBe("in-progress");
  });

  test("a registry save failure is visible and never reported as a successful add", async () => {
    const mock = provider([]);
    mock.ports.saveLegs = async () => {
      throw new Error("Synthetic save failed");
    };
    await expect(
      mock.run({ operation: "add", phone: primary.phone, primary: true }),
    ).rejects.toThrow("save failed");
    expect(mock.legs()).toEqual([]);
    expect(mock.ended()).toBe(false);
  });

  test("participant limit counts active legs and invalid provider durations never create NaN metrics", async () => {
    const legs = Array.from({ length: 11 }, (_, index) => ({
      phone: `+121255501${String(index).padStart(2, "0")}`,
      sid: `sid-${index}`,
      primary: index === 0,
    }));
    const mock = provider(legs);
    await expect(mock.run({ operation: "add", phone: "+12125550199" })).rejects.toThrow(
      "ten additional",
    );
    mock.calls.get("sid-10")!.status = "completed";
    mock.calls.get("sid-0")!.duration = "invalid";
    const result = await mock.run({ operation: "add", phone: "+12125550199" });
    expect(result.legs.find((leg) => leg.primary)?.durationSeconds).toBe(0);
    expect(mock.legs()).toHaveLength(12);
  });
});

describe("voice timing and signed callback boundaries", () => {
  test("ringing never contributes conversation time, and hold is excluded without negative or future drift", () => {
    const current = {
      started: 1000,
      answered: null as number | null,
      heldMs: 0,
      heldSince: null as number | null,
    };
    expect(voiceClock(current, 11000)).toEqual({ seconds: 10, talkSeconds: 0, heldSeconds: 0 });
    current.answered = 11000;
    expect(voiceClock(current, 21000)).toEqual({ seconds: 20, talkSeconds: 10, heldSeconds: 0 });
    current.heldSince = 21000;
    expect(voiceClock(current, 26000)).toEqual({ seconds: 25, talkSeconds: 10, heldSeconds: 5 });
    current.heldMs = 5000;
    current.heldSince = null;
    expect(voiceClock(current, 31000)).toEqual({ seconds: 30, talkSeconds: 15, heldSeconds: 5 });
    expect(voiceClock(current, 0)).toEqual({ seconds: 0, talkSeconds: 0, heldSeconds: 0 });
  });

  test("conference names are scoped to both workspace and attempt", () => {
    expect(conferenceName("a-a", "b-b")).toBe("cb_aa_bb");
    expect(conferenceName("aa", "bc")).not.toBe(conferenceName("ab", "ac"));
    expect(xmlEscape('<x a="1">&')).toBe("&lt;x a=&quot;1&quot;&gt;&amp;");
  });

  test("signature verification binds the exact URL, query, form values and signing material", async () => {
    const url = "https://example.invalid/api/public/callboard/recording?ws=synthetic&attempt=one";
    const form = new URLSearchParams([
      ["To", "+12125550102"],
      ["CallSid", "CA-synthetic"],
      ["Tag", "z"],
      ["Tag", "a"],
      ["Tag", "a"],
    ]);
    const material = "synthetic-signing-material";
    const message = url + "CallSidCA-syntheticTagaTagzTo+12125550102";
    const signature = createHmac("sha1", material).update(message).digest("base64");
    expect(await validTwilioSignature(url, form, signature, material)).toBe(true);
    expect(await validTwilioSignature(url + "&different=true", form, signature, material)).toBe(
      false,
    );
    expect(await validTwilioSignature(url, form, signature, "different-synthetic-material")).toBe(
      false,
    );
    form.set("To", "+12125550199");
    expect(await validTwilioSignature(url, form, signature, material)).toBe(false);
    expect(await validTwilioSignature(url, form, "", material)).toBe(false);
  });

  test("malformed webhook requests fail before any database or provider access", async () => {
    expect(await verifyCallboardWebhook(new Request("https://example.invalid/voice"))).toBeNull();
    expect(
      await verifyCallboardWebhook(
        new Request("https://example.invalid/voice", {
          method: "POST",
          body: "{}",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).toBeNull();
    expect(
      await verifyCallboardWebhook(
        new Request("https://example.invalid/voice", {
          method: "POST",
          body: "WorkspaceId=------------------------------------&AttemptId=------------------------------------",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      ),
    ).toBeNull();
    expect(
      await verifyCallboardWebhook(
        new Request("https://example.invalid/voice", {
          method: "POST",
          body: "x",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": String(100000),
          },
        }),
      ),
    ).toBeNull();
  });

  test("recording URLs accept the signing account's media once and reject foreign hosts, accounts and suffix tricks", () => {
    const account = `AC${"a".repeat(32)}`;
    const recording = `RE${"b".repeat(32)}`;
    const base = `https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/${recording}`;
    for (const suffix of ["", ".mp3", ".wav"])
      expect(recordingMediaUrl(base + suffix, account)).toBe(base + ".mp3");
    for (const value of [
      base + ".mp3.mp3",
      base + "?token=synthetic",
      base + "#fragment",
      base.replace("https:", "http:"),
      base.replace("api.twilio.com", "api.twilio.com.example.invalid"),
      base.replace(account, `AC${"c".repeat(32)}`),
      base.replace("api.twilio.com", "name:password@api.twilio.com"),
      base.replace("api.twilio.com", "api.twilio.com:444"),
      "not a URL",
    ])
      expect(recordingMediaUrl(value, account)).toBeNull();
  });
});
