export function getFreePort(): Promise<number>;

export function findPidForPort(port: number): number | null;

export interface InspectResult {
  status: 'PORT_FREE' | 'PORT_OCCUPIED_HEALTHY' | 'PORT_OCCUPIED_UNRESPONSIVE';
  pid: number | null;
  httpStatus?: number;
  error?: string;
}

export function inspectPort(port: number, healthPath?: string): Promise<InspectResult>;

export interface ProcessIdentity {
  pid: number;
  name: string;
  creationDate: string;
}

export function getProcessIdentity(pid: number): ProcessIdentity | null;

export interface RuntimeMetadata {
  runtimeId: string;
  pid: number;
  port: number;
  command: string;
  args: string[];
  cwd: string;
  repoRoot: string;
  startTimestamp: number;
  stdoutPath: string;
  stderrPath: string;
  processIdentity?: ProcessIdentity | null;
}

export function saveMetadata(data: RuntimeMetadata): void;
export function loadMetadata(): RuntimeMetadata | null;
export function clearMetadata(): void;
export type ProcessCleanupResult =
  | { ok: true; alreadyStopped?: boolean; fallbackUsed?: boolean }
  | { ok: false; reason: string };

export function cleanProcessTree(pid: number): ProcessCleanupResult;

export type StartServerResult =
  | { status: 'SERVER_READY'; runtimeId: string; pid: number; logPath: string; stderrPath?: string; attempts?: number }
  | { status: 'SERVER_START_TIMEOUT'; runtimeId: string; pid: number; logPath: string; attempts?: number }
  | { status: 'APPLICATION_RUNTIME_ERROR'; runtimeId: string; pid: number; stderrPath: string }
  | { status: 'NEXT_CACHE_CORRUPTION'; runtimeId: string; pid: number }
  | { status: 'SERVER_PROCESS_EXITED'; runtimeId: string; pid: number };

export function startServer(
  command: string,
  args: string[],
  port: number,
  healthPath?: string,
  cacheRecovery?: boolean,
  cacheDir?: string | null
): Promise<StartServerResult>;

export type StopServerResult =
  | { status: 'CLEANUP_SUCCESS'; runtimeId: string; pid: number }
  | { status: 'SERVER_CLEANUP_FAILED'; reason: string; runtimeId?: string; pid?: number }
  | { status: 'PROCESS_OWNERSHIP_UNVERIFIED'; reason: string };

export function stopServer(runtimeId?: string | null): StopServerResult;

export interface StatusResult {
  status: 'NO_RUNTIME' | 'RUNTIME_ACTIVE';
  metadata?: RuntimeMetadata;
}

export function getStatus(): StatusResult;
