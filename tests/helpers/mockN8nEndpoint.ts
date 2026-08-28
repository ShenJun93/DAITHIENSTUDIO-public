import * as http from 'http';

export interface CapturedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

export interface MockServerControls {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  getRequests: () => CapturedRequest[];
  url: (path: string) => string;
}

export function createMockN8nServer(port: number = 5678): MockServerControls {
  let capturedRequests: CapturedRequest[] = [];
  let retryCount = 0;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let parsedBody = null;
      try { if (body) parsedBody = JSON.parse(body); } catch (e) { }

      const urlObj = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = urlObj.pathname;

      const captured = {
        method: req.method || 'GET',
        path: req.url || '/',
        headers: { ...req.headers },
        body: parsedBody
      };
      capturedRequests.push(captured);

      if (req.method === 'GET' && pathname === '/requests') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(capturedRequests));
      }

      if (req.method === 'POST' && pathname === '/reset') {
        capturedRequests = [];
        retryCount = 0;
        res.writeHead(200);
        return res.end();
      }

      if (req.method === 'POST' && pathname === '/success') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Workflow started' }));
      }

      if (req.method === 'POST' && pathname === '/fail') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }

      if (req.method === 'POST' && pathname === '/always-fail') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Service Unavailable' }));
      }

      if (req.method === 'POST' && pathname === '/retry-then-success') {
        retryCount++;
        if (retryCount <= 2) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Failing on purpose' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Success after retry' }));
      }

      if (req.method === 'POST' && pathname === '/duplicate-check') {
        const idempotencyKey = req.headers['idempotency-key'];
        const existing = capturedRequests.filter(r => r.path === '/duplicate-check' && r.headers['idempotency-key'] === idempotencyKey);
        if (existing.length > 1) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Duplicate request detected' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Processed uniquely' }));
      }

      res.writeHead(404);
      res.end();
    });
  });

  return {
    start: () => new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    }),
    stop: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
    reset: () => {
      capturedRequests = [];
      retryCount = 0;
    },
    getRequests: () => [...capturedRequests],
    url: (path: string) => `http://127.0.0.1:${port}${path}`
  };
}
