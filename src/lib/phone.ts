export function normalizePhone(input: string | null | undefined): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function toE164(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");
  const digits = normalizePhone(raw);
  if (digits.length === 10) return "+1" + digits;
  if (digits.length > 10) return "+" + digits;
  return digits ? "+" + digits : "";
}

export function formatPhone(input: string | null | undefined): string {
  const d = normalizePhone(input);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return input ?? "";
}

export function areaCode(input: string | null | undefined): string | null {
  const d = normalizePhone(input);
  return d.length >= 10 ? d.slice(0, 3) : null;
}
