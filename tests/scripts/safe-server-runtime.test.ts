import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import * as cp from 'node:child_process';
import * as net from 'node:net';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// @ts-ignore
import { getFreePort, inspectPort, startServer, stopServer, clearMetadata, loadMetadata, saveMetadata } from '../../scripts/quality/safe-server-runtime.mjs';
// @ts-ignore
import runtimeSource from '../../scripts/quality/safe-server-runtime.mjs?raw';

const dummyServerPath = path.join(process.cwd(), 'scripts', 'quality', 'fixtures', 'dummy-server.mjs');
const nextDir = path.join(os.tmpdir(), `daithienstudio-test-next-${Date.now()}`);
const corruptOnceMarkers = new Set<string>();

function resetCorruptOnceMarker(port: number) {
  const marker = path.join(os.tmpdir(), `run-count-${port}.txt`);
  fs.rmSync(marker, { force: true });
  corruptOnceMarkers.add(marker);
}

// Regression guard for TASK-FIX-SAFE-SERVER-TEST-ISOLATION-001: extracted so it's
// directly callable from a test, not only reachable via vitest's afterEach hook.
// Metadata is ALWAYS cleared in the finally block, even when the cleanup attempt
// above fails — the original failure still throws and surfaces to the test runner,
// but a genuine one-time cleanup failure (e.g. a spawned process exiting slightly
// slower than the timeout under heavy concurrent test-suite CPU load) can no longer
// leak stale metadata forward into whichever test runs next. The detached, unref'd
// child process survives independently of this bookkeeping file either way, so
// clearing it after a failed cleanup attempt does not reduce anyone's actual ability
// to find/kill an orphaned process later.
function runAfterEachCleanup() {
  try {
    const metadata = loadMetadata();
    if (metadata) {
      const cleanup = stopServer(metadata.runtimeId);
      if (cleanup.status !== 'CLEANUP_SUCCESS') {
        throw new Error(`Test server cleanup failed: ${cleanup.reason}`);
      }
    }
  } finally {
    delete process.env.MODE;
    delete process.env.TIMEOUT_MS;
    clearMetadata();
    // Clean up temporary .next dir if created
    if (fs.existsSync(nextDir)) {
      fs.rmSync(nextDir, { recursive: true, force: true });
    }
    for (const marker of corruptOnceMarkers) {
      fs.rmSync(marker, { force: true });
    }
    corruptOnceMarkers.clear();
  }
}

describe('Safe Server Runtime', () => {
  afterEach(runAfterEachCleanup);

  describe('Port Inspection', () => {
    it('should assign a free port', async () => {
      const port = await getFreePort();
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
    });

    it('should detect a free port', async () => {
      const port = await getFreePort();
      const res = await inspectPort(port);
      expect(res.status).toBe('PORT_FREE');
    });

    it('should detect a healthy occupied port', async () => {
      const port = await getFreePort();
      const server = http.createServer((req, res) => {
        res.writeHead(200);
        res.end('OK');
      });
      await new Promise<void>((resolve) => server.listen(port, () => resolve()));

      const res = await inspectPort(port);
      expect(res.status).toBe('PORT_OCCUPIED_HEALTHY');

      server.close();
    });

    it('should detect an unresponsive occupied port', async () => {
      const port = await getFreePort();
      const server = net.createServer((c) => {
        // TCP server that doesn't answer HTTP
      });
      await new Promise<void>((resolve) => server.listen(port, () => resolve()));

      const res = await inspectPort(port);
      expect(res.status).toBe('PORT_OCCUPIED_UNRESPONSIVE');

      server.close();
    });
  });

  describe('Server Lifecycle', () => {
    it('should start and wait for readiness', async () => {
      const port = await getFreePort();
      const res = await startServer('node', [dummyServerPath], port);

      expect(res.status).toBe('SERVER_READY');
      if (res.status !== 'SERVER_READY') throw new Error('Not ready');
      expect(res.pid).toBeGreaterThan(0);
      expect(res.runtimeId).toBeDefined();
      expect(res.logPath).toBeDefined();

      const log = fs.readFileSync(res.logPath, 'utf-8');
      expect(log).toContain('Server listening on');
    });

    it('should handle timeout when server is unresponsive', async () => {
      const port = await getFreePort();
      process.env.MODE = 'unresponsive';
      process.env.TIMEOUT_MS = '2000';

      const res = await startServer('node', [dummyServerPath], port);
      expect(res.status).toBe('SERVER_START_TIMEOUT');

      delete process.env.MODE;
      delete process.env.TIMEOUT_MS;
    }, 10000);

    it('should detect child exit before readiness', async () => {
      const port = await getFreePort();
      process.env.MODE = 'stderr';

      const res = await startServer('node', [dummyServerPath], port);
      expect(res.status).toBe('APPLICATION_RUNTIME_ERROR');

      delete process.env.MODE;
    });

    it('should clean up the owned child', async () => {
      const port = await getFreePort();
      const res = await startServer('node', [dummyServerPath], port);
      if (res.status !== 'SERVER_READY') console.error('START FAILED:', res);
      expect(res.status).toBe('SERVER_READY');

      const stopRes = stopServer(res.runtimeId);
      expect(stopRes.status).toBe('CLEANUP_SUCCESS');
      if (stopRes.status !== 'CLEANUP_SUCCESS') throw new Error('Not success');
      expect(stopRes.pid).toBe(res.pid);

      // Verify the port is free again
      const inspectRes = await inspectPort(port);
      expect(inspectRes.status).toBe('PORT_FREE');
    });

    it('should refuse to kill unowned process', () => {
      const stopRes = stopServer('fake-runtime-id');
      expect(stopRes.status).toBe('SERVER_CLEANUP_FAILED');
    });

    it.runIf(process.platform === 'win32')('should report cleanup failure and retain metadata', () => {
      saveMetadata({
        runtimeId: 'invalid-pid-runtime',
        pid: -1,
        port: 65535,
        command: 'node',
        args: [],
        cwd: process.cwd(),
        repoRoot: process.cwd(),
        startTimestamp: Date.now(),
        stdoutPath: 'invalid-pid-runtime-out.log',
        stderrPath: 'invalid-pid-runtime-err.log',
        processIdentity: null
      });

      const stopRes = stopServer('invalid-pid-runtime');

      expect(stopRes.status).toBe('SERVER_CLEANUP_FAILED');
      if (stopRes.status !== 'SERVER_CLEANUP_FAILED') throw new Error('Expected cleanup failure');
      expect(stopRes.reason).toContain('Invalid process ID');
      expect(loadMetadata()?.runtimeId).toBe('invalid-pid-runtime');
      clearMetadata();
    });

    it.runIf(process.platform === 'win32')(
      'always clears metadata even when cleanup fails, so a stale runtime never leaks into the next test',
      () => {
        saveMetadata({
          runtimeId: 'isolation-regression-runtime',
          pid: -1,
          port: 65534,
          command: 'node',
          args: [],
          cwd: process.cwd(),
          repoRoot: process.cwd(),
          startTimestamp: Date.now(),
          stdoutPath: 'isolation-regression-out.log',
          stderrPath: 'isolation-regression-err.log',
          processIdentity: null,
        });

        expect(() => runAfterEachCleanup()).toThrow(/Test server cleanup failed/);
        expect(loadMetadata()).toBeNull();
      },
    );
  });

  describe('Cache Recovery', () => {
    beforeAll(() => {
      if (!fs.existsSync(nextDir)) fs.mkdirSync(nextDir, { recursive: true });
    });

    it('should detect corruption and delete cache dir (cache recovery)', async () => {
      const port = await getFreePort();
      process.env.MODE = 'corrupt-repeat'; // Will print webpack module error and exit

      if (!fs.existsSync(nextDir)) fs.mkdirSync(nextDir, { recursive: true });
      fs.writeFileSync(path.join(nextDir, 'fake-cache.txt'), 'data');

      // First run will hit corruption, we don't enable recovery flag yet to check detection
      const res = await startServer('node', [dummyServerPath], port, '/', false, nextDir);
      expect(res.status).toBe('NEXT_CACHE_CORRUPTION');

      delete process.env.MODE;
    });

    it('should restart exactly once if cacheRecovery is true', async () => {
      const port = await getFreePort();
      resetCorruptOnceMarker(port);

      process.env.MODE = 'corrupt-once';

      if (!fs.existsSync(nextDir)) fs.mkdirSync(nextDir, { recursive: true });

      const res = await startServer('node', [dummyServerPath], port, '/', true, nextDir);

      expect(res.status).toBe('SERVER_READY');

      // Verify .next was deleted
      expect(fs.existsSync(nextDir)).toBe(false);

      delete process.env.MODE;
    });

    it('should stop with failure if corruption repeats', async () => {
      const port = await getFreePort();
      process.env.MODE = 'corrupt-repeat'; // Always corrupt

      if (!fs.existsSync(nextDir)) fs.mkdirSync(nextDir, { recursive: true });

      const res = await startServer('node', [dummyServerPath], port, '/', true, nextDir);

      expect(res.status).toBe('NEXT_CACHE_CORRUPTION');

      delete process.env.MODE;
    });
  });
  describe('Metadata and State', () => {
    it('should create PID/runtime metadata', async () => {
      const port = await getFreePort();
      const res = await startServer('node', [dummyServerPath], port);
      expect(res.status).toBe('SERVER_READY');

      const { getStatus } = await import('../../scripts/quality/safe-server-runtime.mjs');
      const statusRes = getStatus();
      expect(statusRes.status).toBe('RUNTIME_ACTIVE');
      if (statusRes.status !== 'RUNTIME_ACTIVE' || !statusRes.metadata) throw new Error('Not active');
      expect(statusRes.metadata.runtimeId).toBe(res.runtimeId);
      expect(statusRes.metadata.pid).toBe(res.pid);
      expect(statusRes.metadata.command).toBe('node');

      stopServer(res.runtimeId);
    });

    it('should clean up metadata', async () => {
      const port = await getFreePort();
      const res = await startServer('node', [dummyServerPath], port);
      stopServer(res.runtimeId);

      const { getStatus } = await import('../../scripts/quality/safe-server-runtime.mjs');
      const statusRes = getStatus();
      expect(statusRes.status).toBe('NO_RUNTIME');
    });

    it('should capture stderr output', async () => {
      const port = await getFreePort();
      process.env.MODE = 'stderr';
      const res = await startServer('node', [dummyServerPath], port);

      expect(res.status).toBe('APPLICATION_RUNTIME_ERROR');
      if (res.status !== 'APPLICATION_RUNTIME_ERROR') throw new Error('Wrong status');
      expect(res.stderrPath).toBeDefined();
      const stderr = fs.readFileSync(res.stderrPath, 'utf-8');
      expect(stderr).toContain('Error: An error occurred');

      delete process.env.MODE;
    });

    it('should preserve repository state by isolating cache directory', async () => {
      const port = await getFreePort();
      resetCorruptOnceMarker(port);
      process.env.MODE = 'corrupt-once';

      const realNextDir = path.join(process.cwd(), '.next');
      const realNextExisted = fs.existsSync(realNextDir);
      if (!realNextExisted) fs.mkdirSync(realNextDir, { recursive: true });
      fs.writeFileSync(path.join(realNextDir, 'real-file.txt'), 'data');

      if (!fs.existsSync(nextDir)) fs.mkdirSync(nextDir, { recursive: true });

      const res = await startServer('node', [dummyServerPath], port, '/', true, nextDir);
      expect(res.status).toBe('SERVER_READY');
      expect(fs.existsSync(nextDir)).toBe(false); // Isolated cache deleted

      // Real repository state preserved
      expect(fs.existsSync(path.join(realNextDir, 'real-file.txt'))).toBe(true);

      if (!realNextExisted) fs.rmSync(realNextDir, { recursive: true, force: true });
      delete process.env.MODE;
    });

    it('should provide structured status output', async () => {
      const { getStatus } = await import('../../scripts/quality/safe-server-runtime.mjs');
      const statusRes = getStatus();
      expect(statusRes).toHaveProperty('status');
      // Already NO_RUNTIME because previous tests cleaned up
      if (statusRes.status === 'RUNTIME_ACTIVE') {
        expect(statusRes).toHaveProperty('metadata');
      }
    });
  });

  describe('Real Child-Process Lifecycle CLI test', () => {
    it('should execute full lifecycle through CLI commands', () => {
      const cliPath = path.join(process.cwd(), 'scripts', 'quality', 'safe-server-runtime.mjs');

      // 1. inspect free
      const inspectOut = cp.execSync(`node ${cliPath} inspect 0`, { encoding: 'utf-8' });
      expect(inspectOut).toContain('PORT_FREE');

      // 2. start
      const startOut = cp.execSync(`node ${cliPath} start --cmd node --args ${dummyServerPath} --port auto`, { encoding: 'utf-8' });
      const startRes = JSON.parse(startOut.trim());
      expect(startRes.status).toBe('SERVER_READY');

      // 3. status
      const statusOut = cp.execSync(`node ${cliPath} status`, { encoding: 'utf-8' });
      expect(statusOut).toContain('RUNTIME_ACTIVE');

      // 4. stop
      const stopOut = cp.execSync(`node ${cliPath} stop ${startRes.runtimeId}`, { encoding: 'utf-8' });
      const stopRes = JSON.parse(stopOut.trim());
      expect(stopRes.status).toBe('CLEANUP_SUCCESS');

      // 5. status after stop
      const statusOutAfter = cp.execSync(`node ${cliPath} status`, { encoding: 'utf-8' });
      expect(statusOutAfter).toContain('NO_RUNTIME');
    });
  });

  describe('Cleanup timeout tolerance', () => {
    // Regression guard for TASK-FIX-SAFE-SERVER-CLI-TIMING-001: source-level assertion
    // (matching this repo's established convention for pinning a constant without
    // exporting an internal-only function) that the two cleanup-wait timeouts stay at
    // their widened 5000ms bound, not silently regressed back to the flake-prone 2000ms.
    it('keeps waitForProcessExit and waitForPortRelease at the widened 5000ms default', () => {
      expect(runtimeSource).toMatch(/function waitForProcessExit\(pid, timeoutMs = 5000\)/);
      expect(runtimeSource).toMatch(/function waitForPortRelease\(port, timeoutMs = 5000\)/);
      expect(runtimeSource).not.toContain('timeoutMs = 2000');
    });
  });

  describe('PID Reuse and Process Identity Verification', () => {
    it('should reject stopServer when PID is reused and verify unrelated process remains alive', async () => {
      // Create a dummy unrelated process
      const unrelatedScriptPath = path.join(os.tmpdir(), `unrelated-${Date.now()}.mjs`);
      fs.writeFileSync(unrelatedScriptPath, 'setInterval(() => {}, 1000);');
      const unrelatedProcess = cp.spawn('node', [unrelatedScriptPath], { detached: true });

      const port = await getFreePort();

      // We manually create metadata to simulate a stale PID scenario
      const { saveMetadata } = await import('../../scripts/quality/safe-server-runtime.mjs');
      const runtimeId = 'fake-runtime-stale-pid';
      saveMetadata({
        runtimeId,
        pid: unrelatedProcess.pid as number, // Hijack unrelated process's PID
        port,
        command: 'node',
        args: [],
        cwd: process.cwd(),
        repoRoot: process.cwd(),
        startTimestamp: Date.now() - 100000,
        stdoutPath: 'fake-out',
        stderrPath: 'fake-err',
        processIdentity: {
           pid: unrelatedProcess.pid as number,
           name: 'node.exe',
           creationDate: '/Date(0)/' // Fake creation date to force mismatch
        }
      });

      const stopRes = stopServer(runtimeId);
      expect(stopRes.status).toBe('PROCESS_OWNERSHIP_UNVERIFIED');

      // Verify the unrelated process is still alive
      let isAlive = true;
      try {
         // Sending signal 0 does not kill the process but checks if it exists
         process.kill(unrelatedProcess.pid as number, 0);
      } catch (e) {
         isAlive = false;
      }
      expect(isAlive).toBe(true);

      // Clean up unrelated process manually
      try {
        process.kill(unrelatedProcess.pid as number, 'SIGKILL');
      } catch (e) {}
      if (fs.existsSync(unrelatedScriptPath)) fs.unlinkSync(unrelatedScriptPath);
      clearMetadata();
    });
  });

  describe('Interruption Cleanup', () => {
    it('should clean up child and metadata on SIGINT/SIGTERM', async () => {
      const port = await getFreePort();

      const unrelatedScriptPath = path.join(os.tmpdir(), `unrelated2-${Date.now()}.mjs`);
      fs.writeFileSync(unrelatedScriptPath, 'setInterval(() => {}, 1000);');
      const unrelatedProcess = cp.spawn('node', [unrelatedScriptPath], { detached: true });

      // Create a dummy orchestrator that imports the module, starts the server, and stays alive
      const dummyOrchestratorPath = path.join(os.tmpdir(), `orchestrator-${Date.now()}.mjs`);
      const cliPath = path.join(process.cwd(), 'scripts', 'quality', 'safe-server-runtime.mjs').replace(/\\/g, '/');
      const dummyServerPathStr = dummyServerPath.replace(/\\/g, '/');

      fs.writeFileSync(dummyOrchestratorPath, `
        import { startServer } from 'file://${cliPath}';
        async function run() {
          const res = await startServer('node', ['${dummyServerPathStr}'], ${port});
          console.log(JSON.stringify(res));
          process.stdin.resume();
          process.stdin.on('data', () => {
             process.emit('SIGINT'); // manually trigger the signal handler for testing
          });
        }
        run();
      `);

      const orchestratorProcess = cp.spawn('node', [dummyOrchestratorPath], { stdio: ['pipe', 'pipe', 'inherit'] });

      let stdoutStr = '';
      await new Promise<void>((resolve, reject) => {
        orchestratorProcess.stdout.on('data', (data) => {
          stdoutStr += data.toString();
          if (stdoutStr.includes('SERVER_READY')) resolve();
        });
        orchestratorProcess.on('exit', () => reject(new Error('Orchestrator exited prematurely')));
      });

      // Find the first JSON object in stdout
      const jsonStrMatch = stdoutStr.match(/\{.*?\}/);
      const res = JSON.parse(jsonStrMatch![0]);
      expect(res.status).toBe('SERVER_READY');

      const childPid = res.pid;

      // Verify child is alive
      expect(() => process.kill(childPid, 0)).not.toThrow();

      const orchestratorExit = new Promise<void>((resolve, reject) => {
        if (orchestratorProcess.exitCode !== null) {
          resolve();
          return;
        }
        orchestratorProcess.once('exit', () => resolve());
        orchestratorProcess.once('error', reject);
      });

      // Trigger SIGINT by writing to stdin
      orchestratorProcess.stdin.write('stop\\n');

      // Wait for orchestrator to exit
      await orchestratorExit;

      // Wait a moment for child cleanup to finish
      await new Promise(r => setTimeout(r, 500));

      // Verify child is terminated
      let childAlive = true;
      try {
        process.kill(childPid, 0);
      } catch (e) {
        childAlive = false;
      }
      expect(childAlive).toBe(false);

      // Verify metadata is cleared
      const { loadMetadata } = await import('../../scripts/quality/safe-server-runtime.mjs');
      expect(loadMetadata()).toBeNull();

      // Verify unrelated process is untouched
      let unrelatedAlive = true;
      try {
        process.kill(unrelatedProcess.pid as number, 0);
      } catch (e) {
        unrelatedAlive = false;
      }
      expect(unrelatedAlive).toBe(true);

      // Manual cleanup
      try { process.kill(unrelatedProcess.pid as number, 'SIGKILL'); } catch (e) {}
      if (fs.existsSync(unrelatedScriptPath)) fs.unlinkSync(unrelatedScriptPath);
      if (fs.existsSync(dummyOrchestratorPath)) fs.unlinkSync(dummyOrchestratorPath);
    });
  });
});
