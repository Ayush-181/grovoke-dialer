import { expect, test } from "bun:test";
import { bookingErrorMessage } from "../src/lib/booking-errors";
test("plain database errors retain the actual message", () => {
  expect(bookingErrorMessage({ message: "Database temporarily unavailable", code: "OTHER" })).toBe(
    "Database temporarily unavailable",
  );
});
test("missing professional columns identify the migration", () => {
  expect(
    bookingErrorMessage({
      message: "Could not find the 'invite_from' column of 'bookings' in the schema cache",
      code: "PGRST204",
    }),
  ).toContain("0001_professional_invites.sql");
  expect(
    bookingErrorMessage({ message: 'column "delivery_method" does not exist', code: "42703" }),
  ).toContain("No invitation was sent");
});
test("permission and missing-table errors are distinct", () => {
  expect(bookingErrorMessage({ message: "permission denied", code: "42501" })).toContain(
    "workspace membership",
  );
  expect(bookingErrorMessage({ message: "table missing", code: "PGRST205" })).toContain(
    "bookings table",
  );
});
test("Google errors and unknown failures remain readable", () => {
  expect(bookingErrorMessage(new Error("Reconnect Google"))).toBe("Reconnect Google");
  expect(bookingErrorMessage(null)).toContain("try again");
});
