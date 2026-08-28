/**
 * Timeline service. Not an NLE — it sequences approved shots, surfaces what is
 * missing, and produces something an editor can import.
 */
import { notFound } from '@/domain/errors';
import { timelineItemSchema, type TimelineItem } from '@/domain/schemas';
import { sortShotsForSequence } from '@/domain/shotOrder';
import type { Studio } from '../ports';

export function createTimelineService(studio: Studio) {
  const { shots, scenes, assets, projects, timelines } = studio;

  async function requireProject(idOrSlug: string) {
    const project = (await projects.byId(idOrSlug)) ?? (await projects.bySlug(idOrSlug));
    if (!project) throw notFound('Project', idOrSlug);
    return project;
  }

  return {
    /** Rebuilds the timeline from current shot order and persists it. */
    async build(projectIdOrSlug: string, episodeId?: string): Promise<{ items: TimelineItem[]; totalSeconds: number; missingCount: number }> {
      const project = await requireProject(projectIdOrSlug);
      const [shotList, sceneList] = await Promise.all([
        episodeId ? shots.listByEpisode(project.id, episodeId) : shots.listByProject(project.id),
        episodeId ? scenes.listByEpisode(project.id, episodeId) : scenes.listByProject(project.id),
      ]);

      const ordered = sortShotsForSequence(shotList, sceneList);

      const items: TimelineItem[] = [];
      let cursor = 0;

      for (const [index, shot] of ordered.entries()) {
        const shotAssets = await assets.list(project.id, { shotId: shot.id, limit: 100 });
        const approved = shotAssets.filter((asset) => asset.approvalState === 'approved');

        const video = approved.find((asset) => asset.kind === 'video') ?? null;
        const voice = approved.find((asset) => asset.kind === 'voice') ?? null;
        const music = approved.find((asset) => asset.kind === 'music') ?? null;
        const sounds = approved.filter((asset) => asset.kind === 'sound');

        const missing: string[] = [];
        if (!video) missing.push('video');
        if (shot.dialogue.trim() && !voice) missing.push('voice');
        if (shot.characters.some((ref) => !ref.versionId)) missing.push('character-lock');

        items.push(
          timelineItemSchema.parse({
            shotId: shot.id,
            shotCode: shot.code,
            order: index,
            startSeconds: cursor,
            durationSeconds: shot.durationSeconds,
            videoAssetId: video?.id ?? null,
            voiceAssetId: voice?.id ?? null,
            musicAssetId: music?.id ?? null,
            soundAssetIds: sounds.map((asset) => asset.id),
            subtitle: shot.dialogue,
            missing,
          }),
        );
        cursor += shot.durationSeconds;
      }

      await timelines.save(project.id, items, undefined, episodeId);
      return {
        items,
        totalSeconds: cursor,
        missingCount: items.filter((item) => item.missing.length > 0).length,
      };
    },

    async current(projectIdOrSlug: string, episodeId?: string) {
      const project = await requireProject(projectIdOrSlug);
      const timeline = await timelines.current(project.id, episodeId);
      if (timeline) return timeline;
      const built = await this.build(project.id, episodeId);
      return timelines.save(project.id, built.items, undefined, episodeId);
    },
  };
}

export type TimelineService = ReturnType<typeof createTimelineService>;
