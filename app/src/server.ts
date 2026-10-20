import { createServer, type ServerResponse } from 'node:http';
import { readings } from './data.ts';

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const latest = url.pathname.match(/^\/sensors\/([^/]+)\/latest$/);
  if (req.method === 'GET' && latest) {
    const list = readings[latest[1]];
    if (!list) return send(res, 404, { error: 'unknown_sensor' });
    return send(res, 200, { sensorId: latest[1], ...list[list.length - 1] });
  }
  send(res, 404, { error: 'not_found' });
});

const port = Number(process.env.PORT ?? 3100);
server.listen(port, () => console.log(`readings on :${port}`));
