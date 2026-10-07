export const GOOGLE_CALENDAR_SESSION_PREFIX = "call-board:google-calendar:";
export type SavedConnection = { token: string; email: string; expiresAt: number };
export function readCalendarSession(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  now = Date.now(),
): SavedConnection | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedConnection>;
    if (
      typeof saved.token !== "string" ||
      !saved.token ||
      typeof saved.email !== "string" ||
      !saved.email.includes("@") ||
      typeof saved.expiresAt !== "number" ||
      !Number.isFinite(saved.expiresAt) ||
      saved.expiresAt <= now ||
      saved.expiresAt > now + 86_400_000
    ) {
      storage.removeItem(key);
      return null;
    }
    return saved as SavedConnection;
  } catch {
    return null;
  }
}
