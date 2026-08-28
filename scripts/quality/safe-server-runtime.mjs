import * as net from 'node:net';
import * as http from 'node:http';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const REPO_HASH = crypto.createHash('sha256').update(REPO_ROOT).digest('hex').slice(0, 12);
const TEMP_BASE = process.env.TEMP || process.env.TMP || os.tmpdir();
const META_DIR = path.join(TEMP_BASE, 'daithienstudio-safe-server-runtime', REPO_HASH);
const META_FILE = path.join(META_DIR, 'safe-server-runtime.json');

export async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export function findPidForPort(port) {
  if (os.platform() !== 'win32') return null;
  try {
    const out = cp.execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
    const lines = out.split('\n');
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(pid)) return pid;
      }
    }
  } catch (e) {
    // Ignore error
  }
  return null;
}

export async function inspectPort(port, healthPath = '/') {
  // TCP Probe
  const tcpCheck = await new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });

  const pid = findPidForPort(port);

  if (!tcpCheck) {
    return { status: 'PORT_FREE', pid };
  }

  // HTTP Probe
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${healthPath}`, (res) => {
      resolve({ status: 'PORT_OCCUPIED_HEALTHY', pid, httpStatus: res.statusCode });
    });
    req.on('error', (e) => {
      resolve({ status: 'PORT_OCCUPIED_UNRESPONSIVE', pid, error: e.message });
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ status: 'PORT_OCCUPIED_UNRESPONSIVE', pid, error: 'TIMEOUT' });
    });
  });
}

function generateRuntimeId() {
  return crypto.randomUUID();
}

export function getProcessIdentity(pid) {
  if (os.platform() !== 'win32') return null;
  try {
    const script = `$process = Get-Process -Id ${pid} -ErrorAction Stop; ` +
      `[PSCustomObject]@{ ProcessId = $process.Id; Name = $process.ProcessName; ` +
      `CreationDate = $process.StartTime.ToUniversalTime().Ticks.ToString() } | ConvertTo-Json`;
    const result = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf-8',
      windowsHide: true
    });
    if (result.status !== 0) return null;
    const out = result.stdout.trim();
    if (!out) return null;
    const info = JSON.parse(out);
    if (!info) return null;
    return {
      pid: info.ProcessId,
      name: info.Name,
      creationDate: info.CreationDate
    };
  } catch (e) {
    return null;
  }
}

export function saveMetadata(data) {
  if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadMetadata() {
  if (fs.existsSync(META_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

export function clearMetadata() {
  if (fs.existsSync(META_FILE)) {
    fs.rmSync(META_FILE, { force: true });
  }
}

const cleanupWaitBuffer = new Int32Array(new SharedArrayBuffer(4));

function getProcessState(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { running: null, reason: `Invalid process ID: ${pid}` };
  }

  try {
    process.kill(pid, 0);
    return { running: true };
  } catch (error) {
    if (error?.code === 'ESRCH') return { running: false };
    return { running: null, reason: error?.message || String(error) };
  }
}

// Default bound raised from 2000ms to 5000ms (TASK-FIX-SAFE-SERVER-CLI-TIMING-001):
// on Windows, cleanProcessTree's `taskkill /f` is a forceful kill that does not wait
// for graceful shutdown, so it normally completes in milliseconds regardless of what
// the target process is doing — the flake observed here was not the target process
// hanging, but the test runner's own process occasionally not getting scheduled
// promptly enough (under heavy concurrent test-suite CPU load) to observe the real,
// prompt OS-level termination within a tight 2000ms poll window. Both functions poll
// for the actual condition and return as soon as it's met, so this only widens the
// worst-case tolerance — it does not slow the normal (non-flaky) case.
function waitForProcessExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let state = getProcessState(pid);

  while (state.running === true && Date.now() < deadline) {
    Atomics.wait(cleanupWaitBuffer, 0, 0, 25);
    state = getProcessState(pid);
  }

  return state;
}

function waitForPortRelease(port, timeoutMs = 5000) {
  if (!Number.isInteger(port) || port <= 0) return { released: true };

  const deadline = Date.now() + timeoutMs;
  let listenerPid = findPidForPort(port);
  while (listenerPid !== null && Date.now() < deadline) {
    Atomics.wait(cleanupWaitBuffer, 0, 0, 25);
    listenerPid = findPidForPort(port);
  }

  if (listenerPid === null) return { released: true };
  return { released: false, reason: `Port ${port} remained owned by PID ${listenerPid}` };
}

export function cleanProcessTree(pid) {
  const initialState = getProcessState(pid);
  if (initialState.running === false) {
    return { ok: true, alreadyStopped: true };
  }
  if (initialState.running === null) {
    return { ok: false, reason: initialState.reason };
  }

  if (os.platform() === 'win32') {
    const taskkill = cp.spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      encoding: 'utf-8',
      windowsHide: true
    });
    const taskkillFailure = taskkill.error?.message ||
      (taskkill.status === 0 ? null : (taskkill.stderr || taskkill.stdout || `taskkill exited with status ${taskkill.status}`).trim());

    if (!taskkillFailure) {
      const stateAfterTaskkill = waitForProcessExit(pid);
      if (stateAfterTaskkill.running === false) return { ok: true };
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        const reason = error?.message || String(error);
        return { ok: false, reason: taskkillFailure ? `${taskkillFailure}; fallback failed: ${reason}` : reason };
      }
    }

    const finalState = waitForProcessExit(pid);
    if (finalState.running === false) {
      return { ok: true, fallbackUsed: Boolean(taskkillFailure) };
    }
    return {
      ok: false,
      reason: taskkillFailure || finalState.reason || `Process ${pid} remained alive after cleanup`
    };
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (groupError) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (processError) {
        if (processError?.code !== 'ESRCH') {
          return { ok: false, reason: processError?.message || groupError?.message || String(processError) };
        }
      }
    }

    const finalState = waitForProcessExit(pid);
    if (finalState.running === false) return { ok: true };
    return { ok: false, reason: finalState.reason || `Process ${pid} remained alive after cleanup` };
  }
}

export async function startServer(command, args, port, healthPath = '/', cacheRecovery = false, cacheDir = null) {
  let cmd = command;
  if (os.platform() === 'win32' && cmd === 'npm') {
    cmd = 'npm.cmd';
  }

  const runtimeId = generateRuntimeId();
  if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });

  const stdoutPath = path.join(META_DIR, `server-${runtimeId}-out.log`);
  const stderrPath = path.join(META_DIR, `server-${runtimeId}-err.log`);

  const out = fs.openSync(stdoutPath, 'a');
  const err = fs.openSync(stderrPath, 'a');

  const child = cp.spawn(cmd, args, {
    detached: true,
    shell: false,
    stdio: ['ignore', out, err],
    windowsHide: true,
    env: { ...process.env, PORT: port.toString() }
  });

  child.unref();

  let processIdentity = null;
  if (os.platform() === 'win32') {
    // Retry slightly in case WMI takes a moment to register the process, though it's usually immediate
    for (let i = 0; i < 3; i++) {
      processIdentity = getProcessIdentity(child.pid);
      if (processIdentity) break;
      cp.execSync('ping 127.0.0.1 -n 2 > nul'); // Sleep ~1 second
    }
  }

  const metadata = {
    runtimeId,
    pid: child.pid,
    port,
    command,
    args,
    cwd: REPO_ROOT,
    repoRoot: REPO_ROOT,
    startTimestamp: Date.now(),
    stdoutPath,
    stderrPath,
    processIdentity
  };
  saveMetadata(metadata);

  let attempts = 0;
  const start = Date.now();
  let serverExited = false;
  const timeoutMs = parseInt(process.env.TIMEOUT_MS || '30000', 10);

  child.on('exit', () => {
    serverExited = true;
  });

  while (Date.now() - start < timeoutMs) {
    if (serverExited) {
      const errContent = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf-8') : '';
      const outContent = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf-8') : '';
      const logContent = errContent + '\n' + outContent;

      const hasCorruption = logContent.includes('__webpack_modules__[moduleId] is not a function') ||
                            (logContent.includes('Cannot find module') && (logContent.includes('.next\\server') || logContent.includes('.next/server')));

      if (hasCorruption && cacheRecovery) {
        cleanProcessTree(child.pid);
        const actualCacheDir = cacheDir || path.join(REPO_ROOT, '.next');
        if (fs.existsSync(actualCacheDir)) {
          fs.rmSync(actualCacheDir, { recursive: true, force: true });
        }
        return await startServer(command, args, port, healthPath, false, cacheDir);
      }

      const hasAppError = logContent.includes('Error:') && !hasCorruption;
      if (hasAppError) {
         return { status: 'APPLICATION_RUNTIME_ERROR', runtimeId, pid: child.pid, stderrPath };
      }

      if (hasCorruption) {
         return { status: 'NEXT_CACHE_CORRUPTION', runtimeId, pid: child.pid };
      }

      return { status: 'SERVER_PROCESS_EXITED', runtimeId, pid: child.pid };
    }

    const ins = await inspectPort(port, healthPath);
    if (ins.status === 'PORT_OCCUPIED_HEALTHY') {
       return { status: 'SERVER_READY', runtimeId, pid: child.pid, logPath: stdoutPath, stderrPath, attempts };
    }

    attempts++;
    await new Promise(r => setTimeout(r, 1000));
  }

  return { status: 'SERVER_START_TIMEOUT', runtimeId, pid: child.pid, attempts, logPath: stdoutPath };
}

export function stopServer(runtimeId = null) {
  const meta = loadMetadata();
  if (!meta) {
    return { status: 'SERVER_CLEANUP_FAILED', reason: 'No metadata found' };
  }

  if (runtimeId && meta.runtimeId !== runtimeId) {
    return { status: 'SERVER_CLEANUP_FAILED', reason: 'Runtime ID mismatch' };
  }

  if (meta.repoRoot !== REPO_ROOT) {
    return { status: 'SERVER_CLEANUP_FAILED', reason: 'Repository root mismatch' };
  }

  // Verify process identity to avoid PID reuse vulnerability
  if (os.platform() === 'win32') {
    const currentIdentity = getProcessIdentity(meta.pid);
    if (currentIdentity) {
      if (!meta.processIdentity || meta.processIdentity.creationDate !== currentIdentity.creationDate) {
        return { status: 'PROCESS_OWNERSHIP_UNVERIFIED', reason: 'Process identity mismatch (PID reused)' };
      }
    }
    // If currentIdentity is null, the process is no longer running (or we can't see it).
    // It's safe to clean up metadata.
  }

  const cleanup = cleanProcessTree(meta.pid);
  if (!cleanup.ok) {
    return { status: 'SERVER_CLEANUP_FAILED', reason: cleanup.reason, runtimeId: meta.runtimeId, pid: meta.pid };
  }
  if (os.platform() === 'win32') {
    const portRelease = waitForPortRelease(meta.port);
    if (!portRelease.released) {
      return { status: 'SERVER_CLEANUP_FAILED', reason: portRelease.reason, runtimeId: meta.runtimeId, pid: meta.pid };
    }
  }
  clearMetadata();
  return { status: 'CLEANUP_SUCCESS', runtimeId: meta.runtimeId, pid: meta.pid };
}

export function getStatus() {
  const meta = loadMetadata();
  if (!meta) return { status: 'NO_RUNTIME' };
  return { status: 'RUNTIME_ACTIVE', metadata: meta };
}

// Bounded signal handlers
function handleProcessExit() {
  const meta = loadMetadata();
  if (meta && meta.repoRoot === REPO_ROOT) {
    const cleanup = cleanProcessTree(meta.pid);
    if (cleanup.ok) {
      clearMetadata();
    } else {
      console.error(`Safe server cleanup failed for PID ${meta.pid}: ${cleanup.reason}`);
    }
  }
}

let cleanupHandled = false;
function syncCleanup() {
  if (cleanupHandled) return;
  cleanupHandled = true;
  handleProcessExit();
}

process.on('SIGINT', () => {
  syncCleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  syncCleanup();
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  syncCleanup();
  console.error(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  syncCleanup();
  console.error(reason);
  process.exit(1);
});


async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === '--help' || cmd === '-h') {
    console.log(`
Usage:
  node safe-server-runtime.mjs inspect <port> [healthPath]
  node safe-server-runtime.mjs status
  node safe-server-runtime.mjs start --cmd <command> [--args <arg1> <arg2>...] --port <port> [--health <path>] [--recover] [--cache-dir <dir>]
  node safe-server-runtime.mjs recover-start --cmd <command> [--args <arg1> <arg2>...] --port <port> [--health <path>] [--cache-dir <dir>]
  node safe-server-runtime.mjs stop <runtimeId>
    `);
    process.exit(0);
  }

  if (cmd === 'inspect') {
    const port = parseInt(args[1], 10);
    const health = args[2] || '/';
    const res = await inspectPort(port, health);
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'status') {
    const res = getStatus();
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'start' || cmd === 'recover-start') {
    const cmdIndex = args.indexOf('--cmd');
    const argsIndex = args.indexOf('--args');
    const portIndex = args.indexOf('--port');
    const healthIndex = args.indexOf('--health');
    const cacheDirIndex = args.indexOf('--cache-dir');
    const recover = cmd === 'recover-start' || args.includes('--recover');

    const command = args[cmdIndex + 1];
    const cmdArgs = [];
    if (argsIndex !== -1) {
      let i = argsIndex + 1;
      while (i < args.length && !args[i].startsWith('--')) {
        cmdArgs.push(args[i]);
        i++;
      }
    }

    const portStr = args[portIndex + 1];
    const port = portStr === 'auto' ? await getFreePort() : parseInt(portStr, 10);
    const health = healthIndex !== -1 ? args[healthIndex + 1] : '/';
    const cacheDir = cacheDirIndex !== -1 ? args[cacheDirIndex + 1] : null;

    const res = await startServer(command, cmdArgs, port, health, recover, cacheDir);
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'stop') {
    const runtimeId = args[1];
    const res = stopServer(runtimeId);
    console.log(JSON.stringify(res, null, 2));
    if (res.status !== 'CLEANUP_SUCCESS') process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ error: 'Unknown command' }));
    process.exit(1);
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(JSON.stringify({ status: 'ERROR', error: e.message }));
    process.exit(1);
  });
}
