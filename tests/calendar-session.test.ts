import { expect, test } from "bun:test";
import { readCalendarSession } from "../src/lib/calendar-session";
const now = 1_000_000;
const key = "call-board:google-calendar:user-a";
function storage(value: string) {
  const data = new Map([[key, value]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}
test("restores the active connection after reload", () => {
  const saved = { token: "test-token", email: "user@example.com", expiresAt: now + 3600_000 };
  expect(readCalendarSession(storage(JSON.stringify(saved)), key, now)).toEqual(saved);
});
test("expired authorization is removed and cannot be restored", () => {
  const store = storage(
    JSON.stringify({ token: "test-token", email: "user@example.com", expiresAt: now - 1 }),
  );
  expect(readCalendarSession(store, key, now)).toBeNull();
  expect(store.getItem(key)).toBeNull();
});
test("another app user does not inherit the connection", () => {
  const store = storage(
    JSON.stringify({ token: "test-token", email: "user@example.com", expiresAt: now + 3600_000 }),
  );
  expect(readCalendarSession(store, "call-board:google-calendar:user-b", now)).toBeNull();
});
test("malformed or unreasonable session records are rejected", () => {
  for (const value of [
    "invalid JSON",
    "{}",
    JSON.stringify({ token: "test-token", email: "user@example.com", expiresAt: now + 999999999 }),
  ]) {
    expect(readCalendarSession(storage(value), key, now)).toBeNull();
  }
});
test("unavailable storage does not break the booking page", () => {
  expect(
    readCalendarSession(
      {
        getItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {},
      },
      key,
      now,
    ),
  ).toBeNull();
});
test("changed sender permissions invalidate the old cached authorization", () => {
  const store = storage(
    JSON.stringify({
      token: "test-token",
      email: "user@example.com",
      expiresAt: now + 3600_000,
      permissionsKey: "calendar",
    }),
  );
  expect(readCalendarSession(store, key, now, "ash@grovoke.com")).toBeNull();
});
