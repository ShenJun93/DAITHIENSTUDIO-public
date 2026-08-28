/**
 * Music and sound generations route to their own providers (not TTS), keep
 * their capability gate, and produce persisted audio assets offline.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';
import type { GenerationKind } from '@/domain/enums';
import type { ProviderCapabilities, ProviderRegistry, ProviderDescriptor, VoiceProvider } from '@/application/ports';
import { DomainError } from '@/domain/errors';
import { NO_CAPABILITIES } from '@/infrastructure/providers/capabilities';

const env = useTempStudio('musicSound');

const { getStudio, buildStudio } = await import('@/infrastructure/container');
const { getDb } = await import('@/infrastructure/db/client');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createGenerationService } = await import('@/application/services/generationService');
const { createProjectService } = await import('@/application/services/projectService');
const { createWorker } = await import('@/infrastructure/queue/worker');

const studio = getStudio();
const generations = createGenerationService(studio);
const projects = createProjectService(studio);

function buildStudioOverride() {
  return buildStudio(getDb(), { providers: registryWithSoundDisabled() });
}

function registryWithSoundDisabled(): ProviderRegistry {
  const descriptor: ProviderDescriptor = {
    key: 'no-sound',
    label: 'No Sound (test)',
    offline: true,
    models: { sound: ['no-sound-v1'] },
    capabilities: { ...NO_CAPABILITIES, textToImage: true },
  };
  const voice: VoiceProvider = {
    descriptor,
    synthesize: async () => {
      throw new DomainError('PROVIDER_REJECTED', 'should never be reached');
    },
  };
  const voiceAs = <T>(_value: VoiceProvider): T => voice as unknown as T;
  return {
    descriptors: () => [descriptor],
    image: () => voiceAs(voice),
    video: () => voiceAs(voice),
    voice: () => voice,
    music: () => voice,
    sound: () => voice,
    text: () => voiceAs(voice),
    defaultKeyFor: (kind: GenerationKind) => (kind === 'sound' ? 'no-sound' : 'mock'),
    defaultModelFor: (kind: GenerationKind) => `model-${kind}`,
  };
}

describe('Music and sound generation routing', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(() => {
    env.cleanup();
  });

  it('enqueues, executes and persists a music generation with zero cost', async () => {
    const project = await projects.create({ title: 'Music Route' });
    const enqueued = await generations.enqueue({
      projectId: project.id,
      kind: 'music',
      provider: 'mock',
      model: 'mock-music-v1',
      prompt: 'A warm orchestral theme under the night-market scene.',
      params: { durationSeconds: 4 },
      referenceAssetIds: [],
    });
    expect(enqueued.generation.kind).toBe('music');
    expect(enqueued.generation.status).toBe('pending');

    await createWorker(studio, { workerId: 'music-test' }).drain();

    const done = await studio.generations.byId(enqueued.generation.id);
    expect(done?.status).toBe('completed');
    expect(done?.actualCostUsd).toBe(0);
    expect(done?.provider).toBe('mock');
    expect(done?.model).toBe('mock-music-v1');

    const produced = await studio.assets.listByGeneration(enqueued.generation.id);
    expect(produced.length).toBe(1);
    expect(produced[0]?.kind).toBe('music');
    expect(produced[0]?.mimeType).toBe('audio/wav');
  });

  it('enqueues, executes and persists a sound generation with zero cost', async () => {
    const project = await projects.create({ title: 'Sound Route' });
    const enqueued = await generations.enqueue({
      projectId: project.id,
      kind: 'sound',
      provider: 'mock',
      model: 'mock-sound-v1',
      prompt: 'A short whoosh when the sword leaves the hand.',
      params: { durationSeconds: 2 },
      referenceAssetIds: [],
    });
    expect(enqueued.generation.kind).toBe('sound');
    expect(enqueued.generation.status).toBe('pending');

    await createWorker(studio, { workerId: 'sound-test' }).drain();

    const done = await studio.generations.byId(enqueued.generation.id);
    expect(done?.status).toBe('completed');
    expect(done?.actualCostUsd).toBe(0);
    expect(done?.provider).toBe('mock');

    const produced = await studio.assets.listByGeneration(enqueued.generation.id);
    expect(produced.length).toBe(1);
    expect(produced[0]?.kind).toBe('sound');
    expect(produced[0]?.mimeType).toBe('audio/wav');
  });

  it('refuses a sound generation when the provider cannot do sound', async () => {
    const noSoundStudio = buildStudioOverride();
    const generationsNoSound = createGenerationService(noSoundStudio);
    const projectsNoSound = createProjectService(noSoundStudio);
    const project = await projectsNoSound.create({ title: 'Sound Capability' });
    await expect(
      generationsNoSound.enqueue({
        projectId: project.id,
        kind: 'sound',
        provider: 'no-sound',
        prompt: 'A door slam.',
        referenceAssetIds: [],
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  });
});
