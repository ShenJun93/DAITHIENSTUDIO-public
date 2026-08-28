import * as http from 'node:http';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const port = parseInt(process.env.PORT, 10);
if (isNaN(port)) {
  console.error('PORT environment variable is required');
  process.exit(1);
}

const mode = process.env.MODE || 'ready';

switch (mode) {
  case 'ready':
  case 'test': {
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });
    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
    break;
  }
  case 'unresponsive': {
    const server = net.createServer((c) => {
      // Connect but do not respond to HTTP requests
    });
    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
    break;
  }
  case 'exit-before-ready': {
    console.log('Exiting before ready...');
    process.exit(1);
    break;
  }
  case 'stderr': {
    console.error('Error: An error occurred');
    process.exit(1);
    break;
  }
  case 'corrupt-once': {
    const runCountFile = path.join(os.tmpdir(), `run-count-${port}.txt`);
    let c = 0;
    if (fs.existsSync(runCountFile)) {
      c = parseInt(fs.readFileSync(runCountFile, 'utf-8'), 10);
    }
    c++;
    fs.writeFileSync(runCountFile, c.toString());
    
    if (c === 1) {
      console.error('__webpack_modules__[moduleId] is not a function');
      process.exit(1);
    } else {
      const server = http.createServer((req, res) => {
        res.writeHead(200);
        res.end('OK');
      });
      server.listen(port, () => {
        console.log(`Server listening on port ${port}`);
      });
    }
    break;
  }
  case 'corrupt-repeat': {
    console.error('__webpack_modules__[moduleId] is not a function');
    process.exit(1);
    break;
  }
  default:
    console.error(`Unknown mode: ${mode}`);
    process.exit(1);
}
