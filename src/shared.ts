export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store"
    }
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isoNow(): string { return new Date().toISOString(); }

export function turkeyDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

export function turkeyDateTime(date: string, time: string | null): Date | null {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [y,m,d] = date.split("-").map(Number);
  const [hh,mm] = time.split(":").map(Number);
  // Turkey is UTC+3 year-round. Store/compare in UTC.
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm));
}

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}

export function unwrapQuickActionJson(value: any): any {
  if (value?.result !== undefined) return value.result;
  if (value?.data !== undefined) return value.data;
  return value;
}
