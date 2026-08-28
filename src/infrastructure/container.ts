/**
 * Composition root. The only place the database, storage driver, providers and
 * repositories are constructed — everything else receives a `Studio`.
 */
import type { Studio, StudioConfig } from '@/application/ports';
import { getDb } from './db/client';
import { LocalStorageProvider } from './storage/localStorage';
import { DefaultProviderRegistry, readRegistryOptions } from './providers/registry';
import {
  createEpisodeRepository,
  createSceneRepository,
  createScriptRepository,
  createShotRepository,
  createUserRepository,
  createWorkspaceRepository,
} from './repositories/production';
import { createProjectRepositoryWithProductionType } from './repositories/projectProductionTypeIdentity';
import { createBibleRepository } from './repositories/bibles';
import { createAssetRepository, createGenerationRepository, createPromptRepository } from './repositories/generation';
import {
  createActivityRepository,
  createApprovalRepository,
  createExportRepository,
  createQualityRepository,
  createTimelineRepository,
  createWorkflowRepository,
} from './repositories/support';
import { createAudioMixRepository } from './repositories/audioMixRepository';
import { createProductionAssetBindingRepository } from './repositories/productionAssetBindings';
import { createPublishRepo } from './db/publishRepo';
import { createNodeGraphRepo } from './db/nodeGraphRepo';
import { createFFmpegAdapter } from './ffmpeg/adapter';
import { createMediaMetadataProbe } from './storage/mediaMetadataProbe';
import { createDeliveryAdapter } from './delivery/adapter';

const deliveryAllowedHosts = (env: NodeJS.ProcessEnv): string[] =>
  (env.N8N_DELIVERY_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

function readConfig(env: NodeJS.ProcessEnv): StudioConfig {
  const number = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    maxConcurrentJobs: Math.max(1, Math.trunc(number(env.MAX_CONCURRENT_JOBS, 2))),
    jobTimeoutMs: Math.max(10_000, number(env.JOB_TIMEOUT_MS, 600_000)),
    costLimitUsdPerProject: number(env.COST_LIMIT_USD_PER_PROJECT, 25),
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    apiKey: (env.STUDIO_API_KEY ?? '').trim() || null,
  };
}

const globalForStudio = globalThis as unknown as { __studio?: Studio };

export function getStudio(): Studio {
  if (globalForStudio.__studio) return globalForStudio.__studio;

  const db = getDb();
  const config = readConfig(process.env);

  const clock = { nowIso: () => new Date().toISOString() };
  const logger = {
    info: (message: string, meta?: Record<string, unknown>) => console.log(message, meta ?? ''),
    warn: (message: string, meta?: Record<string, unknown>) => console.warn(message, meta ?? ''),
    error: (message: string, meta?: Record<string, unknown>) => console.error(message, meta ?? ''),
  };

  const studio: Studio = {
    clock,
    logger,
    config,
    storage: new LocalStorageProvider(process.env.STORAGE_LOCAL_ROOT ?? './storage', config.publicBaseUrl),
    providers: new DefaultProviderRegistry(readRegistryOptions(process.env)),
    workspaces: createWorkspaceRepository(db, clock),
    users: createUserRepository(db, clock),
    projects: createProjectRepositoryWithProductionType(db, clock),
    episodes: createEpisodeRepository(db, clock),
    audioMixes: createAudioMixRepository(db, clock),
    scripts: createScriptRepository(db, clock),
    scenes: createSceneRepository(db, clock),
    shots: createShotRepository(db, clock),
    bibles: createBibleRepository(db, clock),
    prompts: createPromptRepository(db, clock),
    generations: createGenerationRepository(db, clock),
    assets: createAssetRepository(db, clock),
    productionAssetBindings: createProductionAssetBindingRepository(db, clock),
    approvals: createApprovalRepository(db, clock),
    quality: createQualityRepository(db, clock),
    workflows: createWorkflowRepository(db, clock),
    timelines: createTimelineRepository(db, clock),
    exports: createExportRepository(db, clock),
    publishes: createPublishRepo(db, clock),
    nodeGraphs: createNodeGraphRepo(db, clock),
    activity: createActivityRepository(db, clock),
    media: createFFmpegAdapter(),
    mediaMetadataProbe: createMediaMetadataProbe(),
    delivery: createDeliveryAdapter({ allowedHosts: deliveryAllowedHosts(process.env) }),
  };

  globalForStudio.__studio = studio;
  return studio;
}

/**
 * Test helper: drops the memoised Studio so the next `getStudio()` rebuilds it
 * (picking up a fresh `getDb()`). Needed because `__studio` and `__studioDb`
 * are memoised on separate globals — closing the database alone leaves a
 * cached Studio holding repositories bound to the now-closed connection.
 */
export function resetStudio(): void {
  globalForStudio.__studio = undefined;
}

/** Test helper: build a Studio against an explicit database handle. */
export function buildStudio(db: ReturnType<typeof getDb>, overrides: Partial<Studio> = {}): Studio {
  const config = readConfig(process.env);
  const clock = { nowIso: () => new Date().toISOString() };
  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return {
    clock,
    logger,
    config,
    storage: new LocalStorageProvider(process.env.STORAGE_LOCAL_ROOT ?? './storage', config.publicBaseUrl),
    providers: new DefaultProviderRegistry(readRegistryOptions(process.env)),
    workspaces: createWorkspaceRepository(db, clock),
    users: createUserRepository(db, clock),
    projects: createProjectRepositoryWithProductionType(db, clock),
    episodes: createEpisodeRepository(db, clock),
    audioMixes: createAudioMixRepository(db, clock),
    scripts: createScriptRepository(db, clock),
    scenes: createSceneRepository(db, clock),
    shots: createShotRepository(db, clock),
    bibles: createBibleRepository(db, clock),
    prompts: createPromptRepository(db, clock),
    generations: createGenerationRepository(db, clock),
    assets: createAssetRepository(db, clock),
    productionAssetBindings: createProductionAssetBindingRepository(db, clock),
    approvals: createApprovalRepository(db, clock),
    quality: createQualityRepository(db, clock),
    workflows: createWorkflowRepository(db, clock),
    timelines: createTimelineRepository(db, clock),
    exports: createExportRepository(db, clock),
    publishes: createPublishRepo(db, clock),
    nodeGraphs: createNodeGraphRepo(db, clock),
    activity: createActivityRepository(db, clock),
    media: createFFmpegAdapter(),
    mediaMetadataProbe: createMediaMetadataProbe(),
    delivery: createDeliveryAdapter({ allowedHosts: deliveryAllowedHosts(process.env) }),
    ...overrides,
  };
}

/** Everything the app layer needs, wired once. */
export function getServices() {
  const studio = getStudio();
  return { studio };
}
