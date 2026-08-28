/**
 * Export service — turns a project into portable artefacts.
 *
 * The project package is the important one: it freezes every bible version and
 * prompt version that was actually used, so the package explains itself without
 * the database. It also refuses to reference a deleted asset (rule 06 §10).
 */
import { DomainError, notFound } from '@/domain/errors';
import { exportRequestSchema, type ExportKindValue, type TimelineItem } from '@/domain/schemas';
import { sortShotsForSequence } from '@/domain/shotOrder';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import type { Studio } from '../ports';
import type { ExportRecord } from '../records';
import { createAssetService } from './assetService';
import { createContinuityService } from './continuityService';
import { createTimelineService } from './timelineService';

export interface ProjectPackage {
  formatVersion: string;
  exportedAt: string;
  project: unknown;
  script: unknown;
  episodes: unknown[];
  scenes: unknown[];
  shots: unknown[];
  bibles: { characters: unknown[]; locations: unknown[]; props: unknown[]; styles: unknown[] };
  frozenVersions: { characters: string[]; locations: string[]; props: string[]; styles: string[]; prompts: string[] };
  prompts: unknown[];
  generations: unknown[];
  assets: unknown[];
  lineage: Record<string, string[]>;
  timeline: TimelineItem[];
  continuity: unknown;
  costs: { estimatedUsd: number; actualUsd: number; byKind: Record<string, number> };
  warnings: string[];
}

export function createExportService(studio: Studio) {
  const {
    projects,
    episodes,
    scripts,
    scenes,
    shots,
    bibles,
    prompts,
    generations,
    assets,
    exports: exportRepo,
    storage,
    activity,
    clock,
  } = studio;
  const assetService = createAssetService(studio);
  const timelineService = createTimelineService(studio);
  const continuityService = createContinuityService(studio);

  async function readBytes(exportId: string): Promise<{ record: ExportRecord; body: Buffer }> {
    const record = await exportRepo.byId(exportId);
    if (!record) throw notFound('Export', exportId);
    const body = await storage.get(record.storageKey);
    return { record, body };
  }

  async function requireProject(idOrSlug: string) {
    const project = (await projects.byId(idOrSlug)) ?? (await projects.bySlug(idOrSlug));
    if (!project) throw notFound('Project', idOrSlug);
    return project;
  }

  async function buildPackage(projectIdOrSlug: string): Promise<ProjectPackage> {
    const project = await requireProject(projectIdOrSlug);
    const warnings: string[] = [];

    const [episodeList, script, sceneList, rawShotList, characterList, locationList, propList, styleList] =
      await Promise.all([
        episodes.listByProject(project.id),
        scripts.current(project.id),
        scenes.listByProject(project.id),
        shots.listByProject(project.id),
        bibles.listCharacters(project.id),
        bibles.listLocations(project.id),
        bibles.listProps(project.id),
        bibles.listStyles(project.id),
      ]);
    // Storyboard order (TASK-005), not insertion/code order — the shot-list
    // CSV and voice-script exports read `pack.shots` directly, and the EDL/SRT
    // exports read `pack.timeline`, which is built from this same order.
    const shotList = sortShotsForSequence(rawShotList, sceneList);
    // TASK-REFINE-004: a shot is soft-deleted, never hard-deleted, so a
    // prompt/generation whose `shotId` still points at one never becomes a
    // dangling foreign key — but it must not leak into a fresh export, so
    // anything shot-scoped is kept only when its shot is still active.
    const activeShotIds = new Set(shotList.map((shot) => shot.id));

    const promptList = (await prompts.listByProject(project.id)).filter(
      (prompt) => !prompt.shotId || activeShotIds.has(prompt.shotId),
    );
    const promptPayloads: unknown[] = [];
    const frozenPromptIds: string[] = [];
    for (const prompt of promptList) {
      const versions = await prompts.versions(prompt.id);
      promptPayloads.push({ ...prompt, versions });
      const newestVersion = versions.at(-1);
      if (newestVersion) frozenPromptIds.push(formatSnapshotId(prompt.id, newestVersion.version));
    }

    // Cost totals below intentionally use the full, unfiltered list — cost
    // already incurred for a since-deleted shot is still real project spend
    // and must not silently vanish from the aggregate.
    const generationList = await generations.listByProject(project.id, { limit: 1000 });
    const exportedGenerations = generationList.filter(
      (generation) => !generation.shotId || activeShotIds.has(generation.shotId),
    );
    const assetList = await assets.list(project.id, { limit: 1000 });

    // Freeze exactly the versions that shots pinned, not "everything current".
    const frozenCharacters = new Set<string>();
    const frozenLocations = new Set<string>();
    const frozenProps = new Set<string>();
    for (const shot of shotList) {
      for (const ref of shot.characters) if (ref.versionId) frozenCharacters.add(ref.versionId);
      if (shot.locationVersionId) frozenLocations.add(shot.locationVersionId);
      for (const ref of shot.props) if (ref.versionId) frozenProps.add(ref.versionId);
    }
    const frozenStyles = new Set<string>();
    for (const prompt of promptPayloads as { versions: { lockRefs: { style: { code: string; version: number } | null } }[] }[]) {
      const newestVersion = prompt.versions.at(-1);
      if (newestVersion?.lockRefs.style) {
        frozenStyles.add(formatSnapshotId(newestVersion.lockRefs.style.code, newestVersion.lockRefs.style.version));
      }
    }

    // Referential integrity: an export must not point at a missing file.
    const lineage: Record<string, string[]> = {};
    for (const asset of assetList) {
      if (asset.storageKey && !(await storage.exists(asset.storageKey))) {
        warnings.push(`Asset ${asset.id} (${asset.name}) has no file at ${asset.storageKey}; excluded from the package.`);
        continue;
      }
      lineage[asset.id] = await assetService.lineageTrail(asset.id);
    }

    const timeline = await timelineService.build(project.id);
    const continuity = await continuityService.forProject(project.id);

    const byKind: Record<string, number> = {};
    let estimatedUsd = 0;
    let actualUsd = 0;
    for (const generation of generationList) {
      estimatedUsd += generation.estimatedCostUsd;
      actualUsd += generation.actualCostUsd;
      byKind[generation.kind] = (byKind[generation.kind] ?? 0) + generation.actualCostUsd;
    }

    return {
      formatVersion: '1.0',
      exportedAt: clock.nowIso(),
      project,
      script,
      episodes: episodeList,
      scenes: sceneList,
      shots: shotList,
      bibles: { characters: characterList, locations: locationList, props: propList, styles: styleList },
      frozenVersions: {
        characters: [...frozenCharacters].sort(),
        locations: [...frozenLocations].sort(),
        props: [...frozenProps].sort(),
        styles: [...frozenStyles].sort(),
        prompts: frozenPromptIds.sort(),
      },
      prompts: promptPayloads,
      generations: exportedGenerations,
      assets: assetList.filter((asset) => lineage[asset.id] !== undefined),
      lineage,
      timeline: timeline.items,
      continuity,
      costs: {
        estimatedUsd: Math.round(estimatedUsd * 10_000) / 10_000,
        actualUsd: Math.round(actualUsd * 10_000) / 10_000,
        byKind,
      },
      warnings,
    };
  }

  /** SRT from the timeline's subtitle track. */
  function toSrt(items: TimelineItem[]): string {
    const stamp = (seconds: number): string => {
      const ms = Math.max(0, Math.round(seconds * 1000));
      const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
      const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
      const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
      const milli = String(ms % 1000).padStart(3, '0');
      return `${h}:${m}:${s},${milli}`;
    };

    return items
      .filter((item) => item.subtitle.trim().length > 0)
      .map(
        (item, index) =>
          `${index + 1}\n${stamp(item.startSeconds)} --> ${stamp(item.startSeconds + item.durationSeconds)}\n${item.subtitle.trim()}\n`,
      )
      .join('\n');
  }

  /** CMX3600-flavoured EDL — enough for a round trip into an NLE. */
  function toEdl(title: string, frameRate: number, items: TimelineItem[]): string {
    const tc = (seconds: number): string => {
      const totalFrames = Math.round(seconds * frameRate);
      const f = totalFrames % frameRate;
      const totalSeconds = Math.floor(totalFrames / frameRate);
      const s = totalSeconds % 60;
      const m = Math.floor(totalSeconds / 60) % 60;
      const h = Math.floor(totalSeconds / 3600);
      return [h, m, s, f].map((value) => String(value).padStart(2, '0')).join(':');
    };

    const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', ''];
    items.forEach((item, index) => {
      const record = tc(item.startSeconds);
      const recordOut = tc(item.startSeconds + item.durationSeconds);
      lines.push(
        `${String(index + 1).padStart(3, '0')}  ${item.shotCode.slice(0, 8).padEnd(8)} V     C        ${tc(0)} ${tc(item.durationSeconds)} ${record} ${recordOut}`,
      );
      lines.push(`* FROM CLIP NAME: ${item.shotCode}`);
      if (item.missing.length > 0) lines.push(`* MISSING: ${item.missing.join(', ')}`);
      lines.push('');
    });
    return lines.join('\n');
  }

  return {
    buildPackage,

    async run(raw: unknown): Promise<{ export: ExportRecord; downloadUrl: string; warnings: string[] }> {
      const input = exportRequestSchema.parse(raw);
      const project = await requireProject(input.projectId);
      const kind: ExportKindValue = input.kind;

      const pack = await buildPackage(project.id);
      let body = '';
      let extension = 'json';
      let mimeType = 'application/json';

      if (kind === 'project-package') {
        body = JSON.stringify(pack, null, 2);
      } else if (kind === 'srt') {
        body = toSrt(pack.timeline);
        extension = 'srt';
        mimeType = 'application/x-subrip';
        if (!body.trim()) throw new DomainError('VALIDATION_FAILED', 'No subtitles to export — no shot has dialogue.');
      } else if (kind === 'edl') {
        body = toEdl(project.title, project.frameRate, pack.timeline);
        extension = 'edl';
        mimeType = 'text/plain';
      } else if (kind === 'shot-list') {
        const header = 'code,scene,shotSize,cameraAngle,cameraMovement,lens,durationSeconds,characters,dialogue,status';
        const rows = (pack.shots as { code: string; sceneId: string; shotSize: string; cameraAngle: string; cameraMovement: { type: string; speed: string }; lens: string; durationSeconds: number; characters: { characterId: string; versionId: string }[]; dialogue: string; status: string }[]).map(
          (shot) =>
            [
              shot.code,
              shot.sceneId,
              shot.shotSize,
              shot.cameraAngle,
              `${shot.cameraMovement.speed} ${shot.cameraMovement.type}`,
              shot.lens,
              String(shot.durationSeconds),
              shot.characters.map((ref) => ref.versionId || ref.characterId).join(' '),
              `"${shot.dialogue.replace(/"/g, '""')}"`,
              shot.status,
            ].join(','),
        );
        body = [header, ...rows].join('\n');
        extension = 'csv';
        mimeType = 'text/csv';
      } else {
        // voice-script
        const lines = (pack.shots as { code: string; dialogue: string; characters: { characterId: string }[] }[])
          .filter((shot) => shot.dialogue.trim())
          .map((shot) => `[${shot.code}] ${shot.characters.map((ref) => ref.characterId).join(', ')}\n${shot.dialogue}\n`);
        body = lines.join('\n');
        extension = 'txt';
        mimeType = 'text/plain';
        if (!body.trim()) throw new DomainError('VALIDATION_FAILED', 'No dialogue to export.');
      }

      const stamp = clock.nowIso().replace(/[:.]/g, '-');
      const stored = await storage.put(
        `projects/${project.slug}/exports/${kind}-${stamp}.${extension}`,
        body,
        mimeType,
      );

      const record = await exportRepo.record({
        projectId: project.id,
        kind,
        storageKey: stored.key,
        frozenVersions: pack.frozenVersions,
        summary: {
          scenes: pack.scenes.length,
          shots: pack.shots.length,
          assets: pack.assets.length,
          costs: pack.costs,
          continuityErrors: (pack.continuity as { errors: number }).errors,
          warnings: pack.warnings.length,
          sizeBytes: stored.sizeBytes,
        },
      });

      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'export.created',
        targetType: 'export',
        targetId: record.id,
        details: { kind, sizeBytes: stored.sizeBytes, warnings: pack.warnings.length },
      });

      return { export: record, downloadUrl: stored.url, warnings: pack.warnings };
    },

    async list(projectIdOrSlug: string) {
      const project = await requireProject(projectIdOrSlug);
      return exportRepo.listByProject(project.id);
    },

    readBytes,

    async read(exportId: string): Promise<{ record: ExportRecord; body: string }> {
      const { record, body } = await readBytes(exportId);
      return { record, body: body.toString('utf8') };
    },
  };
}

export type ExportService = ReturnType<typeof createExportService>;
