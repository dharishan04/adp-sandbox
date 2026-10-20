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

test('only the requested sensor readings are returned', async ({ request }) => {
  const range = q('2026-01-01T02:00:00Z', '2026-01-01T04:00:00Z');
  const [r1, r2] = await Promise.all([
    request.get(`/sensors/s-1/history?${range}`),
    request.get(`/sensors/s-2/history?${range}`),
  ]);
  expect(r1.status()).toBe(200);
  expect(r2.status()).toBe(200);
  const b1 = await r1.json();
  const b2 = await r2.json();
  expect(b1.sensorId).toBe('s-1');
  expect(b2.sensorId).toBe('s-2');
  expect(b1.readings).toHaveLength(3);
  expect(b2.readings).toHaveLength(3);
  expect(b1.readings.map((r: { at: string }) => r.at)).toEqual(b2.readings.map((r: { at: string }) => r.at));
  b1.readings.forEach((r: { value: number }, i: number) => expect(r.value).not.toBe(b2.readings[i].value));
});

test('a window with no readings is 200 with an empty array', async ({ request }) => {
  const res = await request.get(`/sensors/s-1/history?${q('2026-01-01T02:10:00Z', '2026-01-01T02:50:00Z')}`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ sensorId: 's-1', readings: [] });
});

test('a range of exactly 7 days is accepted', async ({ request }) => {
  const res = await request.get(`/sensors/s-1/history?${q('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z')}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.readings).toHaveLength(169);
});

test('a range just over 7 days is 400', async ({ request }) => {
  const res = await request.get(`/sensors/s-1/history?${q('2026-01-01T00:00:00Z', '2026-01-08T00:00:01Z')}`);
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: 'range_too_large' });
});

test('history of an unknown sensor is 404',async ({ request }) => {
  const res = await request.get(`/sensors/nope/history?${q('2026-01-01T00:00:00Z', '2026-01-01T05:00:00Z')}`);
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'unknown_sensor' });
});

test('a range over the limit is 400', async ({ request }) => {
  const res = await request.get(`/sensors/s-1/history?${q('2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z')}`);
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: 'range_too_large' });
});
