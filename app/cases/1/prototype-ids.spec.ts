import { test, expect } from '@playwright/test';

const ids = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
const range = `from=${encodeURIComponent('2026-01-01T00:00:00Z')}&to=${encodeURIComponent('2026-01-01T05:00:00Z')}`;

for (const id of ids) {
  test(`history of prototype-member id ${id} is 404 unknown_sensor`, async ({ request }) => {
    const res = await request.get(`/sensors/${id}/history?${range}`);
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown_sensor' });
  });

  test(`latest of prototype-member id ${id} is 404 unknown_sensor`, async ({ request }) => {
    const res = await request.get(`/sensors/${id}/latest`);
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown_sensor' });
  });
}
