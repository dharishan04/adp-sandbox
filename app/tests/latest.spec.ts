import { test, expect } from '@playwright/test';

test('latest reading of a known sensor', async ({ request }) => {
  const res = await request.get('/sensors/s-1/latest');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.sensorId).toBe('s-1');
  expect(typeof body.value).toBe('number');
  expect(Date.parse(body.at)).not.toBeNaN();
});

test('latest reading of an unknown sensor is 404', async ({ request }) => {
  const res = await request.get('/sensors/nope/latest');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'unknown_sensor' });
});
