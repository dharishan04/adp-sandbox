import { createServer, type ServerResponse } from 'node:http';
import { readings } from './data.ts';

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const find = (id: string) => (Object.hasOwn(readings, id) ? readings[id] : undefined);
  const latest = url.pathname.match(/^\/sensors\/([^/]+)\/latest$/);
  if (req.method === 'GET' && latest) {
    const list = find(latest[1]);
    if (!list) return send(res, 404, { error: 'unknown_sensor' });
    return send(res, 200, { sensorId: latest[1], ...list[list.length - 1] });
  }
  const hist = url.pathname.match(/^\/sensors\/([^/]+)\/history$/);
  if (req.method === 'GET' && hist) {
    const list = find(hist[1]);
    if (!list) return send(res, 404, { error: 'unknown_sensor' });
    const from = Date.parse(url.searchParams.get('from') ?? '');
    const to = Date.parse(url.searchParams.get('to') ?? '');
    if (to - from > 7 * 24 * 3600_000) return send(res, 400, { error: 'range_too_large' });
    const inRange = list.filter((r) => {
      const t = Date.parse(r.at);
      return t >= from && t <= to;
    });
    return send(res, 200, { sensorId: hist[1], readings: inRange });
  }
  send(res, 404, { error: 'not_found' });
});

const port = Number(process.env.PORT ?? 3100);
server.listen(port, () => console.log(`readings on :${port}`));
