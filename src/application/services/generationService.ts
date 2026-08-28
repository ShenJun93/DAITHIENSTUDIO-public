/**
 * Generation service — the gate every paid request must pass, and the worker
 * loop that executes claimed jobs.
 *
 * Enqueue refuses to spend money when:
 *   - the prompt has blocking lint errors
 *   - continuity has blocking errors for this shot
 *   - a key shot has no approved keyframe and the request is a video
 *   - the project's cost ceiling would be exceeded
 *   - the selected provider cannot do what is being asked (capability check)
 *
 * Idempotency: a request key that has already been enqueued returns the
 * existing job instead of creating a duplicate.
 */
import { createHash } from 'node:crypto';
import { blockingIssues } from '@/domain/prompt/lint';
import { estimateCostUsd } from '@/domain/cost';
import { DomainError, notFound } from '@/domain/errors';
import {
  confirmImageGenerationSchema,
  confirmVideoGenerationSchema,
  enqueueGenerationSchema,
  prepareImageGenerationSchema,
  prepareVideoGenerationSchema,
  type ConfirmImageGenerationInput,
  type ConfirmVideoGenerationInput,
  type EnqueueGenerationInput,
  type PrepareImageGenerationInput,
  type PrepareVideoGenerationInput,
} from '@/domain/schemas';
import type { GenerationKind, ProjectStatus } from '@/domain/enums';
import type { GenerationArtifact, ProviderCapabilities, Studio } from '../ports';
import type { GenerationRecord } from '../records';
import { createAssetService } from './assetService';
import { createCapabilityResolver } from './capabilityResolver';
import { createContinuityService } from './continuityService';
import {
  createImageExecutionConfirmationTokenService,
  fingerprintImageExecutionCandidate,
} from './imageExecutionConfirmation';
import {
  createVideoExecutionConfirmationTokenService,
  fingerprintVideoExecutionCandidate,
} from './videoExecutionConfirmation';

export interface EnqueueResult {
  generation: GenerationRecord;
  reused: boolean;
  warnings: string[];
}

const REQUIRED_CAPABILITY: Partial<Record<GenerationKind, keyof ProviderCapabilities>> = {
  image: 'textToImage',
  video: 'textToVideo',
  voice: 'voice',
  music: 'music',
  sound: 'sound',
  text: 'structuredText',
};

export interface VideoConfirmationCandidate {
  version: number;
  projectId: string;
  productionType: string | null;
  projectStatus: string;
  shotId: string | null;
  promptId: string | null;
  promptVersion: number | null;
  kind: 'video';
  provider: string;
  model: string;
  prompt: string;
  negativePrompt: string;
  seed: number | null;
  params: Record<string, unknown>;
  referenceAssetIds: string[];
  priority: number;
  estimatedCostUsd: number;
  costBasis: { durationSeconds: number };
  warnings: string[];
}

function buildVideoConfirmationCandidate(input: {
  shotId: string | null;
  promptId: string | null;
  seed?: number;
  params: Record<string, unknown>;
  referenceAssetIds: string[];
  priority: number;
}, resolved: {
  projectId: string;
  productionType: string | null;
  projectStatus: string;
  promptVersion: number | null;
  provider: string;
  model: string;
  prompt: string;
  negativePrompt: string;
  estimatedCostUsd: number;
  costBasisDurationSeconds: number;
  warnings: string[];
}): VideoConfirmationCandidate {
  return {
    version: 1,
    projectId: resolved.projectId,
    productionType: resolved.productionType,
    projectStatus: resolved.projectStatus,
    shotId: input.shotId,
    promptId: input.promptId,
    promptVersion: resolved.promptVersion,
    kind: 'video',
    provider: resolved.provider,
    model: resolved.model,
    prompt: resolved.prompt,
    negativePrompt: resolved.negativePrompt,
    seed: input.seed ?? null,
    params: input.params,
    referenceAssetIds: input.referenceAssetIds,
    priority: input.priority,
    estimatedCostUsd: resolved.estimatedCostUsd,
    costBasis: { durationSeconds: resolved.costBasisDurationSeconds },
    warnings: [...resolved.warnings],
  };
}

function videoIdempotencyIdentity(candidate: VideoConfirmationCandidate): string {
  const { warnings, ...stableCandidate } = candidate;
  return createHash('sha256')
    .update(fingerprintVideoExecutionCandidate(stableCandidate), 'utf8')
    .digest('hex')
    .slice(0, 48);
}

export function createGenerationService(studio: Studio) {
  const { generations, prompts, shots, projects, assets, providers, storage, activity, logger, config, clock } = studio;
  const assetService = createAssetService(studio);
  const capabilityResolver = createCapabilityResolver();
  const continuityService = createContinuityService(studio);
  const imageConfirmationTokens = createImageExecutionConfirmationTokenService({
    apiKey: config.apiKey,
  });
  const videoConfirmationTokens = createVideoExecutionConfirmationTokenService({
    apiKey: config.apiKey,
  });

  function idempotencyKeyFor(input: {
    projectId: string;
    shotId: string | null;
    kind: string;
    provider: string;
    model: string;
    prompt: string;
    negativePrompt: string;
    seed: number | null;
    params: Record<string, unknown>;
  }): string {
    return createHash('sha256')
      .update(
        [
          input.projectId,
          input.shotId ?? '',
          input.kind,
          input.provider,
          input.model,
          input.prompt,
          input.negativePrompt,
          String(input.seed ?? ''),
          JSON.stringify(input.params),
        ].join('|'),
      )
      .digest('hex')
      .slice(0, 48);
  }

  async function resolveGenerationCandidate(input: EnqueueGenerationInput) {
    const warnings: string[] = [];

    if (input.kind === 'video' && input.idempotencyKey !== undefined) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Video generation must not be given a caller-supplied idempotencyKey; reuse identity is derived from the reviewed candidate.',
      );
    }

    const project = await projects.byId(input.projectId);
    if (!project) throw notFound('Project', input.projectId);

    if (input.kind === 'image') {
      const resolution = capabilityResolver.resolve(
        {
          productionType: project.productionType ?? null,
          projectStatus: project.status as ProjectStatus,
          providerDescriptors: providers.descriptors(),
        },
        'generation.image.submit',
      );
      if (resolution.state !== 'AVAILABLE') {
        throw new DomainError(
          'UNSUPPORTED_CAPABILITY',
          `Image generation is not available: ${resolution.reasonCode ?? resolution.state}.`,
          { capability: resolution },
        );
      }
    }

    if (input.kind === 'video') {
      const resolution = capabilityResolver.resolve(
        {
          productionType: project.productionType ?? null,
          projectStatus: project.status as ProjectStatus,
          providerDescriptors: providers.descriptors(),
        },
        'generation.video.submit',
      );
      if (resolution.state !== 'AVAILABLE') {
        throw new DomainError(
          'UNSUPPORTED_CAPABILITY',
          `Video generation is not available: ${resolution.reasonCode ?? resolution.state}.`,
          { capability: resolution },
        );
      }
    }

    const provider = input.provider ?? providers.defaultKeyFor(input.kind);
    const model = input.model ?? providers.defaultModelFor(input.kind, provider);

    const capability = REQUIRED_CAPABILITY[input.kind];
    if (capability) {
      const descriptor = providers.descriptors().find((candidate) => candidate.key === provider);
      if (!descriptor) {
        throw new DomainError('PROVIDER_UNAVAILABLE', `Provider "${provider}" is not registered.`);
      }
      if (!descriptor.capabilities[capability]) {
        throw new DomainError(
          'UNSUPPORTED_CAPABILITY',
          `Provider "${provider}" cannot do ${input.kind} (${String(capability)}).`,
          { provider, kind: input.kind },
        );
      }
    }

    let promptText = input.prompt ?? '';
    let negativePrompt = input.negativePrompt ?? '';
    let promptVersion: number | null = null;

    if (input.promptId) {
      const prompt = await prompts.byId(input.promptId);
      if (!prompt) throw notFound('Prompt', input.promptId);
      const version = await prompts.latestVersion(prompt.id);
      if (!version) throw notFound('PromptVersion', input.promptId);

      const blocking = version.lint ? blockingIssues(version.lint) : [];
      if (blocking.length > 0) {
        throw new DomainError(
          'PROMPT_LINT_BLOCKED',
          `Prompt v${version.version} has ${blocking.length} blocking lint error(s). Fix them before spending a generation.`,
          { issues: blocking },
        );
      }
      promptText = version.compiled;
      negativePrompt = version.negative;
      promptVersion = version.version;
    }

    if (!promptText.trim() && input.kind !== 'text') {
      throw new DomainError('VALIDATION_FAILED', 'A generation needs either a promptId or explicit prompt text.');
    }

    const shot = input.shotId ? await shots.byId(input.shotId) : null;
    if (input.shotId && !shot) throw notFound('Shot', input.shotId);

    if (shot) {
      const report = await continuityService.forShot(shot.id);
      if (report.blocked) {
        throw new DomainError(
          'MISSING_REFERENCE',
          `Shot ${shot.code} has ${report.errors} blocking continuity error(s). Resolve them before generating.`,
          { findings: report.findings.filter((finding) => finding.severity === 'error') },
        );
      }
      for (const finding of report.findings.filter((finding) => finding.severity === 'warning')) {
        warnings.push(`${finding.rule}: ${finding.message}`);
      }

      if (input.kind === 'video' && shot.importance === 'key') {
        const approved = await assets.list(project.id, { shotId: shot.id, approvalState: 'approved', limit: 20 });
        const hasKeyframe = approved.some((asset) => asset.kind === 'image' || asset.kind === 'storyboard');
        if (!hasKeyframe) {
          throw new DomainError(
            'MISSING_REFERENCE',
            `Shot ${shot.code} is a key shot. Approve a keyframe image before generating video (human-in-the-loop).`,
          );
        }
      }
    }

    const costBasisDurationSeconds =
      shot?.durationSeconds ?? Number(input.params.durationSeconds ?? 5);

    const estimatedCostUsd = estimateCostUsd({
      provider,
      kind: input.kind,
      count: Number(input.params.count ?? 1),
      durationSeconds: costBasisDurationSeconds,
      characters: promptText.length,
    });

    const ceiling = project.costLimitUsd > 0 ? project.costLimitUsd : config.costLimitUsdPerProject;
    const idempotencyKey =
      input.kind === 'video'
        ? videoIdempotencyIdentity(
            buildVideoConfirmationCandidate(input, {
              projectId: project.id,
              productionType: project.productionType ?? null,
              projectStatus: project.status,
              promptVersion,
              provider,
              model,
              prompt: promptText,
              negativePrompt,
              estimatedCostUsd,
              costBasisDurationSeconds,
              warnings,
            }),
          )
        : input.idempotencyKey ??
          idempotencyKeyFor({
            projectId: project.id,
            shotId: input.shotId,
            kind: input.kind,
            provider,
            model,
            prompt: promptText,
            negativePrompt,
            seed: input.seed ?? null,
            params: input.params,
          });

    return {
      input,
      project,
      shot,
      provider,
      model,
      promptText,
      negativePrompt,
      promptVersion,
      warnings,
      estimatedCostUsd,
      costBasisDurationSeconds,
      ceiling,
      idempotencyKey,
    };
  }

  async function commitGenerationCandidate(
    candidate: Awaited<ReturnType<typeof resolveGenerationCandidate>>,
  ): Promise<EnqueueResult> {
    const existing = await generations.byIdempotencyKey(candidate.idempotencyKey);
    if (existing) {
      return {
        generation: existing,
        reused: true,
        warnings: [...candidate.warnings, 'Reused an identical existing job.'],
      };
    }

    const { input, project, shot, provider, model, promptText, negativePrompt, promptVersion } = candidate;
    const generation = await generations.enqueue(
      {
        projectId: project.id,
        shotId: input.shotId,
        promptId: input.promptId,
        promptVersion,
        kind: input.kind,
        provider,
        model,
        prompt: promptText,
        negativePrompt,
        params: input.params,
        referenceAssetIds: input.referenceAssetIds,
        seed: input.seed ?? null,
        status: 'pending',
        priority: input.priority,
        maxAttempts: 3,
        scheduledAt: clock.nowIso(),
        estimatedCostUsd: candidate.estimatedCostUsd,
        idempotencyKey: candidate.idempotencyKey,
      },
      candidate.ceiling,
    );

    if (shot) await shots.update(shot.id, { status: 'generating' });
    await activity.log({
      projectId: project.id,
      userId: null,
      action: 'generation.enqueued',
      targetType: 'generation',
      targetId: generation.id,
      details: {
        kind: input.kind,
        provider,
        model,
        estimatedCostUsd: candidate.estimatedCostUsd,
        shotCode: shot?.code ?? null,
      },
    });

    return { generation, reused: false, warnings: candidate.warnings };
  }

  return {
    async enqueue(raw: unknown): Promise<EnqueueResult> {
      const input: EnqueueGenerationInput = enqueueGenerationSchema.parse(raw);
      if (input.kind === 'image' || input.kind === 'video') {
        throw new DomainError(
          'CONFIRMATION_REQUIRED',
          `${input.kind === 'image' ? 'Image' : 'Video'} generation must be prepared and explicitly confirmed before enqueue.`,
        );
      }
      return commitGenerationCandidate(await resolveGenerationCandidate(input));
    },

    async prepareImage(raw: unknown) {
      const input: PrepareImageGenerationInput = prepareImageGenerationSchema.parse(raw);
      const candidate = await resolveGenerationCandidate(input);

      const confirmationCandidate = {
        version: 1,
        projectId: candidate.project.id,
        productionType: candidate.project.productionType ?? null,
        projectStatus: candidate.project.status,
        shotId: input.shotId,
        promptId: input.promptId,
        promptVersion: candidate.promptVersion,
        kind: 'image' as const,
        provider: candidate.provider,
        model: candidate.model,
        prompt: candidate.promptText,
        negativePrompt: candidate.negativePrompt,
        seed: input.seed ?? null,
        params: input.params,
        referenceAssetIds: input.referenceAssetIds,
        priority: input.priority,
        estimatedCostUsd: candidate.estimatedCostUsd,
        warnings: [...candidate.warnings],
      };

      const issued = imageConfirmationTokens.issue(
        fingerprintImageExecutionCandidate(confirmationCandidate),
      );

      return {
        capability: 'generation.image.submit' as const,
        state: 'READY_FOR_CONFIRMATION' as const,
        preview: {
          projectId: candidate.project.id,
          productionType: candidate.project.productionType ?? null,
          shotId: input.shotId,
          promptId: input.promptId,
          promptVersion: candidate.promptVersion,
          provider: candidate.provider,
          model: candidate.model,
          prompt: candidate.promptText,
          negativePrompt: candidate.negativePrompt,
          estimatedCostUsd: candidate.estimatedCostUsd,
          seed: input.seed ?? null,
          params: input.params,
          referenceAssetIds: input.referenceAssetIds,
          priority: input.priority,
          warnings: [...candidate.warnings],
        },
        confirmationToken: issued.token,
        expiresAt: issued.expiresAt,
      };
    },

    async prepareVideo(raw: unknown) {
      const input: PrepareVideoGenerationInput = prepareVideoGenerationSchema.parse(raw);
      const candidate = await resolveGenerationCandidate(input);

      const confirmationCandidate = buildVideoConfirmationCandidate(input, {
        projectId: candidate.project.id,
        productionType: candidate.project.productionType ?? null,
        projectStatus: candidate.project.status,
        promptVersion: candidate.promptVersion,
        provider: candidate.provider,
        model: candidate.model,
        prompt: candidate.promptText,
        negativePrompt: candidate.negativePrompt,
        estimatedCostUsd: candidate.estimatedCostUsd,
        costBasisDurationSeconds: candidate.costBasisDurationSeconds,
        warnings: candidate.warnings,
      });

      const issued = videoConfirmationTokens.issue(
        fingerprintVideoExecutionCandidate(confirmationCandidate),
      );

      return {
        capability: 'generation.video.submit' as const,
        state: 'READY_FOR_CONFIRMATION' as const,
        preview: {
          projectId: candidate.project.id,
          productionType: candidate.project.productionType ?? null,
          shotId: input.shotId,
          promptId: input.promptId,
          promptVersion: candidate.promptVersion,
          provider: candidate.provider,
          model: candidate.model,
          prompt: candidate.promptText,
          negativePrompt: candidate.negativePrompt,
          estimatedCostUsd: candidate.estimatedCostUsd,
          reviewedDurationSeconds: candidate.costBasisDurationSeconds,
          seed: input.seed ?? null,
          params: input.params,
          referenceAssetIds: input.referenceAssetIds,
          priority: input.priority,
          warnings: [...candidate.warnings],
        },
        confirmationToken: issued.token,
        expiresAt: issued.expiresAt,
      };
    },

    async confirmImage(raw: unknown): Promise<EnqueueResult> {
      const input: ConfirmImageGenerationInput = confirmImageGenerationSchema.parse(raw);

      // Verify authenticity/expiry before trusting or resolving the submitted request.
      const confirmed = imageConfirmationTokens.verify(input.confirmationToken);
      const candidate = await resolveGenerationCandidate(input.request);

      const currentConfirmationCandidate = {
        version: 1,
        projectId: candidate.project.id,
        productionType: candidate.project.productionType ?? null,
        projectStatus: candidate.project.status,
        shotId: input.request.shotId,
        promptId: input.request.promptId,
        promptVersion: candidate.promptVersion,
        kind: 'image' as const,
        provider: candidate.provider,
        model: candidate.model,
        prompt: candidate.promptText,
        negativePrompt: candidate.negativePrompt,
        seed: input.request.seed ?? null,
        params: input.request.params,
        referenceAssetIds: input.request.referenceAssetIds,
        priority: input.request.priority,
        estimatedCostUsd: candidate.estimatedCostUsd,
        warnings: [...candidate.warnings],
      };

      const currentFingerprint = fingerprintImageExecutionCandidate(
        currentConfirmationCandidate,
      );

      if (currentFingerprint !== confirmed.candidateFingerprint) {
        throw new DomainError(
          'CONFIRMATION_STALE',
          'Image execution confirmation no longer matches the current resolved candidate.',
        );
      }

      // Enqueue/reserve only after authenticity, freshness and exactness pass.
      // Provider execution remains a separate worker operation.
      return commitGenerationCandidate(candidate);
    },

    async confirmVideo(raw: unknown): Promise<EnqueueResult> {
      const input: ConfirmVideoGenerationInput = confirmVideoGenerationSchema.parse(raw);

      // Verify authenticity/expiry before trusting or resolving the submitted request.
      const confirmed = videoConfirmationTokens.verify(input.confirmationToken);
      const candidate = await resolveGenerationCandidate(input.request);

      const currentConfirmationCandidate = buildVideoConfirmationCandidate(input.request, {
        projectId: candidate.project.id,
        productionType: candidate.project.productionType ?? null,
        projectStatus: candidate.project.status,
        promptVersion: candidate.promptVersion,
        provider: candidate.provider,
        model: candidate.model,
        prompt: candidate.promptText,
        negativePrompt: candidate.negativePrompt,
        estimatedCostUsd: candidate.estimatedCostUsd,
        costBasisDurationSeconds: candidate.costBasisDurationSeconds,
        warnings: candidate.warnings,
      });

      if (
        fingerprintVideoExecutionCandidate(currentConfirmationCandidate) !==
        confirmed.candidateFingerprint
      ) {
        throw new DomainError(
          'CONFIRMATION_STALE',
          'Video execution confirmation no longer matches the current resolved candidate.',
        );
      }

      // Enqueue/reserve only after authenticity, freshness and exactness pass.
      // Provider execution remains a separate worker operation.
      return commitGenerationCandidate(candidate);
    },

    async cancel(id: string): Promise<GenerationRecord> {
      const generation = await generations.cancel(id);
      await activity.log({
        projectId: generation.projectId,
        userId: null,
        action: 'generation.cancelled',
        targetType: 'generation',
        targetId: id,
        details: {},
      });
      return generation;
    },

    async byId(id: string) {
      const generation = await generations.byId(id);
      if (!generation) throw notFound('Generation', id);
      const producedAssets = await assets.listByGeneration(id);
      return { generation, assets: producedAssets };
    },

    async queue(projectId: string, status?: string) {
      return generations.listByProject(projectId, { status, limit: 200 });
    },

    async listForShot(shotId: string) {
      return generations.listByShot(shotId);
    },

    /**
     * Executes one claimed job. Called by the worker; separated so a test can
     * drive it synchronously without a polling loop.
     */
    async execute(generation: GenerationRecord): Promise<{ assetIds: string[] }> {
      const project = await projects.byId(generation.projectId);
      if (!project) throw notFound('Project', generation.projectId);
      const shot = generation.shotId ? await shots.byId(generation.shotId) : null;

      const referenceFiles: { mimeType: string; data: Buffer }[] = [];
      for (const assetId of generation.referenceAssetIds) {
        const asset = await assets.byId(assetId);
        if (!asset) {
          logger.warn(`[generation] reference asset ${assetId} is missing; continuing without it`);
          continue;
        }
        referenceFiles.push({ mimeType: asset.mimeType, data: await storage.get(asset.storageKey) });
      }

      let artifacts: GenerationArtifact[] = [];
      let actualCostUsd = 0;
      let raw: Record<string, unknown> = {};

      if (generation.kind === 'image') {
        const result = await providers.image(generation.provider).generateImage({
          prompt: generation.prompt,
          negativePrompt: generation.negativePrompt,
          model: generation.model,
          aspectRatio: shot?.aspectRatio ?? project.aspectRatio,
          count: Number(generation.params.count ?? 1),
          seed: generation.seed,
          referenceFiles,
          params: generation.params,
        });
        artifacts = result.artifacts;
        actualCostUsd = result.actualCostUsd;
        raw = result.raw;
      } else if (generation.kind === 'video') {
        const first = referenceFiles[0] ?? null;
        const result = await providers.video(generation.provider).generateVideo({
          prompt: generation.prompt,
          negativePrompt: generation.negativePrompt,
          model: generation.model,
          aspectRatio: shot?.aspectRatio ?? project.aspectRatio,
          durationSeconds: shot?.durationSeconds ?? Number(generation.params.durationSeconds ?? 5),
          seed: generation.seed,
          firstFrame: first,
          lastFrame: referenceFiles[1] ?? null,
          params: generation.params,
        });
        artifacts = result.artifacts;
        actualCostUsd = result.actualCostUsd;
        raw = result.raw;
      } else if (generation.kind === 'music') {
        const result = await providers.music(generation.provider).synthesize({
          text: generation.prompt,
          model: generation.model,
          language: String(generation.params.language ?? project.language),
          voiceName: String(generation.params.voiceName ?? ''),
          speed: Number(generation.params.speed ?? 1),
          pitch: Number(generation.params.pitch ?? 0),
          emotion: String(generation.params.emotion ?? ''),
          params: generation.params,
        });
        artifacts = result.artifacts;
        actualCostUsd = result.actualCostUsd;
        raw = result.raw;
      } else if (generation.kind === 'sound') {
        const result = await providers.sound(generation.provider).synthesize({
          text: generation.prompt,
          model: generation.model,
          language: String(generation.params.language ?? project.language),
          voiceName: String(generation.params.voiceName ?? ''),
          speed: Number(generation.params.speed ?? 1),
          pitch: Number(generation.params.pitch ?? 0),
          emotion: String(generation.params.emotion ?? ''),
          params: generation.params,
        });
        artifacts = result.artifacts;
        actualCostUsd = result.actualCostUsd;
        raw = result.raw;
      } else if (generation.kind === 'voice') {
        const result = await providers.voice(generation.provider).synthesize({
          text: generation.prompt,
          model: generation.model,
          language: String(generation.params.language ?? project.language),
          voiceName: String(generation.params.voiceName ?? ''),
          speed: Number(generation.params.speed ?? 1),
          pitch: Number(generation.params.pitch ?? 0),
          emotion: String(generation.params.emotion ?? ''),
          params: generation.params,
        });
        artifacts = result.artifacts;
        actualCostUsd = result.actualCostUsd;
        raw = result.raw;
      } else {
        throw new DomainError('UNSUPPORTED_CAPABILITY', `No executor for generation kind "${generation.kind}".`);
      }

      const assetIds = await assetService.storeGenerationArtifacts({
        generation,
        project,
        shotCode: shot?.code ?? null,
        sceneId: shot?.sceneId ?? null,
        artifacts,
      });

      await generations.complete(generation.id, { actualCostUsd, raw });
      if (shot) {
        await shots.update(shot.id, { status: 'review' });
      }
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'generation.completed',
        targetType: 'generation',
        targetId: generation.id,
        details: { assets: assetIds.length, actualCostUsd },
      });

      return { assetIds };
    },
  };
}

export type GenerationService = ReturnType<typeof createGenerationService>;
