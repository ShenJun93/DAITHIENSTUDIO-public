/**
 * Project lifecycle + the dashboard aggregate.
 *
 * Creating a project also seeds the things a production cannot work without:
 * an episode, a Style Bible from the chosen preset, and an empty script. That
 * is deliberate — a project with no style is a project that will drift.
 */
import { DomainError, notFound } from '@/domain/errors';
import { slugify } from '@/domain/ids';
import {
  createProjectWithProductionTypeSchema,
  updateProjectWithProductionTypeSchema,
  type CreateProjectWithProductionTypeInput,
  type UpdateProjectWithProductionTypeInput,
} from '@/domain/productionTypeIdentity';
import { DEFAULT_STYLE_PRESET_KEY, findStylePreset } from '@/domain/styles/presets';
import {
  asProductionTypeProjectRepository,
  type ProductionTypeProjectRecord,
} from '../productionTypeProjectPort';
import type { Studio } from '../ports';
import type { EpisodeRecord } from '../records';

export interface DashboardSummary {
  projects: number;
  activeProjects: number;
  shotsByStatus: Record<string, number>;
  generationsByStatus: Record<string, number>;
  approvedAssets: number;
  pendingAssets: number;
  estimatedSpendUsd: number;
  recentActivity: { action: string; targetType: string; targetId: string; createdAt: string }[];
}

export function createProjectService(studio: Studio) {
  const { episodes, scripts, bibles, shots, generations, assets, activity, clock } = studio;
  const projects = asProductionTypeProjectRepository(studio.projects);

  async function requireProject(idOrSlug: string): Promise<ProductionTypeProjectRecord> {
    const project = (await projects.byId(idOrSlug)) ?? (await projects.bySlug(idOrSlug));
    if (!project) throw notFound('Project', idOrSlug);
    return project;
  }

  return {
    requireProject,

    async create(raw: unknown): Promise<ProductionTypeProjectRecord> {
      const input: CreateProjectWithProductionTypeInput = createProjectWithProductionTypeSchema.parse(raw);
      const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();

      // Unique slug: probe, then let the UNIQUE index be the real guard.
      const base = slugify(input.title);
      let slug = base;
      for (let attempt = 2; await projects.slugExists(slug); attempt += 1) {
        slug = `${base}-${attempt}`;
        if (attempt > 200) throw new DomainError('CONFLICT', `Could not allocate a slug for "${input.title}"`);
      }

      const project = await projects.create({ ...input, workspaceId, ownerId, slug });

      await episodes.upsertFirst(project.id, `${project.title} — EP01`);
      await scripts.save(project.id, { title: 'Main script', scriptType: 'motion-comic', raw: '' });

      const preset = findStylePreset(input.stylePresetKey ?? DEFAULT_STYLE_PRESET_KEY);
      if (preset) {
        const code = await bibles.nextCode(project.id, 'style');
        const style = await bibles.createStyle(project.id, {
          code,
          name: preset.name,
          category: preset.category,
          details: preset.details,
          promptBlock: preset.promptBlock,
          negativeStyleRules: preset.negativeStyleRules,
          status: 'draft',
        });
        await projects.update(project.id, { styleId: style.id });
      }

      await activity.log({
        projectId: project.id,
        userId: ownerId,
        action: 'project.created',
        targetType: 'project',
        targetId: project.id,
        details: { title: project.title, slug: project.slug },
      });

      return requireProject(project.id);
    },

    async update(id: string, raw: unknown): Promise<ProductionTypeProjectRecord> {
      const patch: UpdateProjectWithProductionTypeInput = updateProjectWithProductionTypeSchema.parse(raw);
      const project = await requireProject(id);
      const updated = await projects.update(project.id, patch);
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'project.updated',
        targetType: 'project',
        targetId: project.id,
        details: { fields: Object.keys(patch) },
      });
      return updated;
    },

    async list(options?: { limit?: number; offset?: number }): Promise<ProductionTypeProjectRecord[]> {
      return projects.list(options);
    },

    async get(idOrSlug: string): Promise<ProductionTypeProjectRecord> {
      return requireProject(idOrSlug);
    },

    async getActiveEpisode(projectId: string, preferredEpisodeId?: string): Promise<EpisodeRecord | null> {
      const episodeList = await episodes.listByProject(projectId);
      if (preferredEpisodeId) {
        return episodeList.find((episode) => episode.id === preferredEpisodeId) ?? null;
      }
      return episodeList[0] ?? null;
    },

    async softDelete(id: string): Promise<void> {
      const project = await requireProject(id);
      await projects.softDelete(project.id);
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'project.deleted',
        targetType: 'project',
        targetId: project.id,
        details: { soft: true },
      });
    },

    /** Everything the project overview page needs, in one pass. */
    async overview(idOrSlug: string, episodeId?: string) {
      const project = await requireProject(idOrSlug);
      const episodeList = await episodes.listByProject(project.id);

      let activeEpisode: EpisodeRecord | null = null;
      if (episodeId) {
        activeEpisode = episodeList.find((episode) => episode.id === episodeId) ?? null;
        if (!activeEpisode) {
          throw notFound('Episode', episodeId);
        }
      } else {
        activeEpisode = episodeList[0] ?? null;
      }
      const [sceneList, shotList, characterList, locationList, propList, styleList, generationCounts, assetCounts] =
        await Promise.all([
          activeEpisode ? studio.scenes.listByEpisode(project.id, activeEpisode.id) : studio.scenes.listByProject(project.id),
          activeEpisode ? shots.listByEpisode(project.id, activeEpisode.id) : shots.listByProject(project.id),
          bibles.listCharacters(project.id),
          bibles.listLocations(project.id),
          bibles.listProps(project.id),
          bibles.listStyles(project.id),
          generations.countByStatus(project.id),
          assets.countByKind(project.id),
        ]);

      const script = await scripts.current(project.id);
      const shotStatuses = await shots.countByStatus(project.id);
      const spent = await generations.spentUsd(project.id);

      return {
        project,
        episodes: episodeList,
        activeEpisodeId: activeEpisode?.id ?? null,
        script,
        scenes: sceneList,
        shots: shotList,
        characters: characterList,
        locations: locationList,
        props: propList,
        styles: styleList,
        shotStatuses,
        generationCounts,
        assetCounts,
        spentUsd: spent,
        totalDurationSeconds: shotList.reduce((sum, shot) => sum + shot.durationSeconds, 0),
      };
    },

    async dashboard(): Promise<DashboardSummary> {
      const all = await projects.list({ limit: 200 });
      const shotsByStatus: Record<string, number> = {};
      const generationsByStatus: Record<string, number> = {};
      let approvedAssets = 0;
      let pendingAssets = 0;
      let estimatedSpendUsd = 0;

      for (const project of all) {
        for (const [status, total] of Object.entries(await shots.countByStatus(project.id))) {
          shotsByStatus[status] = (shotsByStatus[status] ?? 0) + total;
        }
        for (const [status, total] of Object.entries(await generations.countByStatus(project.id))) {
          generationsByStatus[status] = (generationsByStatus[status] ?? 0) + total;
        }
        approvedAssets += (await assets.list(project.id, { approvalState: 'approved', limit: 500 })).length;
        pendingAssets += (await assets.list(project.id, { approvalState: 'pending', limit: 500 })).length;
        estimatedSpendUsd += await generations.spentUsd(project.id);
      }

      const recent = await activity.recent(null, 12);

      return {
        projects: all.length,
        activeProjects: all.filter((project) => project.status === 'production' || project.status === 'development')
          .length,
        shotsByStatus,
        generationsByStatus,
        approvedAssets,
        pendingAssets,
        estimatedSpendUsd: Math.round(estimatedSpendUsd * 10_000) / 10_000,
        recentActivity: recent.map((entry) => ({
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          createdAt: entry.createdAt,
        })),
      };
    },

    /** Used by the settings page to show when data was last touched. */
    nowIso: () => clock.nowIso(),
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
