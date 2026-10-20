import { test, expect } from '@playwright/test';

const q = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

test('history returns the readings in the range, oldest first, bounds inclusive', async ({ request }) => {
  const res = await request.get(`/sensors/s-1/history?${q('2026-01-01T02:00:00Z', '2026-01-01T05:00:00Z')}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.sensorId).toBe('s-1');
  expect(body.readings.map((r: { at: string }) => r.at)).toEqual([
    '2026-01-01T02:00:00.000Z',
    '2026-01-01T03:00:00.000Z',
    '2026-01-01T04:00:00.000Z',
    '2026-01-01T05:00:00.000Z',
  ]);
  for (const r of body.readings) expect(typeof r.value).toBe('number');
});

test('history excludes readings outside the range', async ({ request }) => {
  const res = await request.get(`/sensors/s-2/history?${q('2026-01-02T00:30:00Z', '2026-01-02T02:30:00Z')}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.sensorId).toBe('s-2');
  expect(body.readings.map((r: { at: string }) => r.at)).toEqual([
    '2026-01-02T01:00:00.000Z',
    '2026-01-02T02:00:00.000Z',
  ]);
});

test('a full day of hourly readings is 25 readings, ascending', async ({ request }) => {
  const res = await request.get(`/sensors/s-1/history?${q('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')}`);
  expect(res.status()).toBe(200);
  const times = (await res.json()).readings.map((r: { at: string }) => Date.parse(r.at));
  expect(times).toHaveLength(25);
  expect(times).toEqual([...times].sort((a, b) => a - b));
});

test('history of an unknown sensor is 404', async ({ request }) => {
  const res = await request.get(`/sensors/nope/history?${q('2026-01-01T00:00:00Z', '2026-01-01T05:00:00Z')}`);
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'unknown_sensor' });
});

test('a range over the limit is 400', async ({ request }) => {
  const res = await request.get(`/sensors/s-1/history?${q('2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z')}`);
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: 'range_too_large' });
});
