// Fixed in-memory readings: the toy app has no storage.
export type Reading = { at: string; value: number };

const HOUR = 3600_000;
const start = Date.parse('2026-01-01T00:00:00Z');

function series(base: number, count: number): Reading[] {
  return Array.from({ length: count }, (_, i) => ({
    at: new Date(start + i * HOUR).toISOString(),
    value: Math.round((base + Math.sin(i / 4) * 2) * 10) / 10,
  }));
}

// 10 days of hourly readings per sensor.
export const readings: Record<string, Reading[]> = {
  's-1': series(21, 240),
  's-2': series(18, 240),
};
