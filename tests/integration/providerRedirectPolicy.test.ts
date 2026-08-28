import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

describe('Provider Redirect Policy (Phase 3)', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect-302') {
        res.writeHead(302, { Location: '/target' });
        res.end();
      } else if (req.url === '/redirect-307') {
        res.writeHead(307, { Location: '/target' });
        res.end();
      } else if (req.url === '/target') {
        res.writeHead(200);
        res.end('Success');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it('proves that fetch with redirect: "manual" surfaces 302 instead of auto-following', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/redirect-302`, {
      redirect: 'manual'
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/target');
    const text = await res.text(); // empty body for 302
    expect(text).toBe('');
  });

  it('proves that fetch with redirect: "manual" surfaces 307 instead of auto-following', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/redirect-307`, {
      method: 'POST',
      body: 'test-body',
      redirect: 'manual'
    });

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('/target');
  });

  it('proves that default fetch (without manual) auto-follows and returns 200', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/redirect-302`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('Success');
  });
});
