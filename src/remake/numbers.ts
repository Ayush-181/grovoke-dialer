import { toE164 } from "../lib/phone";

// Reuse the original phone normalizer; validate before the mock adapter accepts it.
export function dialNumber(input: string): string | null {
  const raw = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (
    !raw.startsWith("+") &&
    digits.length !== 10 &&
    !(digits.length === 11 && digits.startsWith("1"))
  )
    return null;
  const phone = toE164(raw);
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || (phone.startsWith("+1") && phone.length !== 12))
    return null;
  return phone;
}
