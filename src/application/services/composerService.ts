import { DomainError, notFound } from '@/domain/errors';
import { composeVideoSchema } from '@/domain/schemas';
import type { AudioTrackConfig, Studio, VideoTrackConfig } from '../ports';
import { createTimelineService } from './timelineService';
import { createSoundStudioService } from './soundStudioService';
import { createProductionStrategyService } from './productionStrategyService';

export function createComposerService(studio: Studio) {
  const { projects, episodes, assets, exports: exportRepo, storage, activity, clock, media } = studio;
  const timelineService = createTimelineService(studio);

  return {
    async composeVideo(raw: unknown) {
      const input = composeVideoSchema.parse(raw);
      const project = await projects.byId(input.projectId);
      if (!project) throw notFound('Project', input.projectId);

      if (input.episodeId) {
        const episode = await episodes.findById(input.episodeId);
        if (!episode || episode.projectId !== project.id) throw notFound('Episode', input.episodeId);
      }

      const timeline = await timelineService.build(project.id, input.episodeId);
      if (timeline.items.length === 0) {
        throw new DomainError('VALIDATION_FAILED', 'Timeline is empty. Cannot compose video.');
      }

      const production = createProductionStrategyService(studio);
      const [bindings, readiness] = await Promise.all([
        studio.productionAssetBindings.listByProject(project.id),
        production.readiness(project.id),
      ]);
      if (project.productionStrategy === 'hybrid' && readiness.missingAnchorSnapshotIds.length > 0) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Hybrid consistency gate is blocked by ${readiness.missingAnchorSnapshotIds.length} missing approved Bible anchor(s): ${readiness.missingAnchorSnapshotIds.join(', ')}.`,
        );
      }

      const videos: VideoTrackConfig[] = [];
      const usedAssetIds: string[] = [];
      
      for (const item of timeline.items) {
        const shotAssets = await assets.list(project.id, { shotId: item.shotId, limit: 200 });
        let asset = project.productionStrategy === 'auto'
          ? shotAssets.find((candidate) =>
              candidate.approvalState === 'approved' &&
              candidate.kind === 'video' &&
              candidate.generationId !== null,
            ) ?? null
          : item.videoAssetId
            ? await assets.byId(item.videoAssetId)
            : null;

        if (project.productionStrategy === 'hybrid' && !asset) {
          const boundImageIds = bindings
            .filter((binding) =>
              binding.targetType === 'shot' &&
              binding.targetId === item.shotId &&
              binding.role === 'storyboard-keyframe',
            )
            .map((binding) => binding.assetId);
          const boundImages = (await Promise.all(boundImageIds.map((assetId) => assets.byId(assetId))))
            .filter((candidate): candidate is NonNullable<typeof candidate> =>
              candidate !== null &&
              candidate.approvalState === 'approved' &&
              candidate.kind === 'image' &&
              ['image/jpeg', 'image/png', 'image/webp'].includes(candidate.mimeType.toLowerCase()),
            );
          asset = boundImages[0] ?? null;
        }

        if (!asset) {
          const requirement = project.productionStrategy === 'auto'
            ? 'an approved provider-generated video'
            : 'an approved video or version-bound storyboard image';
          throw new DomainError('VALIDATION_FAILED', `Shot ${item.shotCode} needs ${requirement}.`);
        }

        if (!asset || !asset.storageKey) {
          throw new DomainError('NOT_FOUND', `Production asset for ${item.shotCode} is missing or has no storage file.`);
        }
        
        const path = await storage.localPath(asset.storageKey);
        videos.push(asset.kind === 'image'
          ? {
              path,
              mimeType: asset.mimeType,
              sourceKind: 'image',
              durationSeconds: item.durationSeconds,
              motion: 'subtle-zoom',
            }
          : { path, mimeType: asset.mimeType });
        usedAssetIds.push(asset.id);
      }

      const audioTracks: AudioTrackConfig[] = [];
      if (input.episodeId) {
        const mix = await createSoundStudioService(studio).getMixForEpisode(input.episodeId);
        for (const track of mix.tracks) {
          if (track.muted) continue;
          const asset = await assets.byId(track.assetId);
          if (!asset || !asset.storageKey || asset.approvalState !== 'approved') {
            throw new DomainError('VALIDATION_FAILED', `Audio track ${track.id} no longer resolves to an approved asset.`);
          }
          audioTracks.push({
            path: await storage.localPath(asset.storageKey),
            mimeType: asset.mimeType,
            startTimeSeconds: track.startTimeSeconds,
            durationSeconds: track.durationSeconds,
            gainDb: track.gainDb,
          });
          usedAssetIds.push(asset.id);
        }
      }

      const buffer = await media.concatenateVideos({
        videos,
        audioTracks,
        fps: input.fps,
        resolution: input.resolution,
      });

      const stamp = clock.nowIso().replace(/[:.]/g, '-');
      const storageKey = `projects/${project.slug}/exports/composer-${stamp}.mp4`;
      
      const stored = await storage.put(storageKey, buffer, 'video/mp4');

      const exportRecord = await exportRepo.record({
        projectId: project.id,
        kind: 'video',
        storageKey: stored.key,
        frozenVersions: {}, // Composer doesn't freeze the whole bible, it's just the video.
        summary: {
          productionStrategy: project.productionStrategy,
          resolution: input.resolution,
          fps: input.fps,
          shots: timeline.items.length,
          audioTracks: audioTracks.length,
          sizeBytes: stored.sizeBytes,
        },
      });

      // Also register it as an asset so it can be seen in the asset library
      const resString = input.resolution || '1920x1080';
      const parts = resString.split('x');
      const assetRecord = await assets.register({
        projectId: project.id,
        shotId: null,
        generationId: null,
        kind: 'export',
        name: `Composer Final ${resString}`,
        storageKey: stored.key,
        mimeType: 'video/mp4',
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        width: parseInt(parts[0] || '1920', 10),
        height: parseInt(parts[1] || '1080', 10),
        durationSeconds: timeline.totalSeconds,
        tags: ['final-render'],
        metadata: { fps: input.fps, exportId: exportRecord.id, productionStrategy: project.productionStrategy },
      });

      // Link lineage: the export asset is derived from all the shot videos
      for (const parentId of new Set(usedAssetIds)) {
        await assets.link(parentId, assetRecord.id, 'composedInto');
      }

      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'composer.success',
        targetType: 'export',
        targetId: exportRecord.id,
        details: { 
          resolution: input.resolution,
          fps: input.fps,
          shots: timeline.items.length,
          sizeBytes: stored.sizeBytes
        },
      });

      return {
        export: exportRecord,
        asset: assetRecord,
        downloadUrl: stored.url,
      };
    }
  };
}

export type ComposerService = ReturnType<typeof createComposerService>;
