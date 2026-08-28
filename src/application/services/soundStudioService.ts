import type { AudioMix, AudioTrack } from '@/domain/schemas';
import { audioMixSchema } from '@/domain/schemas';
import { DomainError, notFound } from '@/domain/errors';
import type { AudioMixRepository, AssetRepository, EpisodeRepository } from '@/application/ports';
import type { TimelineService } from './timelineService';
import { newId } from '@/domain/ids';
import type { Studio } from '@/application/ports';
import { createTimelineService } from './timelineService';

export class SoundStudioService {
  constructor(
    private readonly episodeRepository: EpisodeRepository,
    private readonly audioMixRepository: AudioMixRepository,
    private readonly assetRepository: AssetRepository,
    private readonly timelineService: TimelineService,
  ) {}

  /**
   * Retrieves the current mix for an episode, creating an empty one if necessary.
   */
  async getMixForEpisode(episodeId: string): Promise<AudioMix> {
    const episode = await this.episodeRepository.findById(episodeId);
    if (!episode) throw notFound('Episode', episodeId);
    return this.audioMixRepository.getForEpisode(episodeId);
  }

  /**
   * Saves the entire mix state. Replaces all tracks for this mix.
   * Validates that all referenced assets are approved.
   */
  async saveMix(mix: AudioMix): Promise<void> {
    const parsed = audioMixSchema.parse(mix);
    const episode = await this.episodeRepository.findById(parsed.episodeId);
    if (!episode) throw notFound('Episode', parsed.episodeId);
    const persisted = await this.audioMixRepository.getForEpisode(parsed.episodeId);
    if (persisted.id !== parsed.id) {
      throw new DomainError('VALIDATION_FAILED', 'The audio mix id does not match the persisted episode mix.');
    }

    for (const track of parsed.tracks) {
      if (track.mixId !== parsed.id) {
        throw new DomainError('VALIDATION_FAILED', `Audio track ${track.id} belongs to another mix.`);
      }
      const asset = await this.assetRepository.byId(track.assetId);
      if (!asset) throw notFound('Asset', track.assetId);
      if (asset.projectId !== episode.projectId) {
        throw new DomainError('VALIDATION_FAILED', `Audio asset ${track.assetId} belongs to another project.`);
      }
      if (asset.approvalState !== 'approved') {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Cannot use unapproved asset ${track.assetId} in Sound Studio. Current state: ${asset.approvalState}`,
        );
      }
      if (track.shotId && asset.shotId !== track.shotId) {
        throw new DomainError('VALIDATION_FAILED', `Audio asset ${track.assetId} is not bound to shot ${track.shotId}.`);
      }
    }

    await this.audioMixRepository.save(parsed);
  }

  /**
   * Helper to quickly add one track to an episode's mix.
   */
  async addTrackToMix(
    episodeId: string,
    trackData: Omit<AudioTrack, 'id' | 'mixId'>
  ): Promise<AudioMix> {
    const mix = await this.getMixForEpisode(episodeId);

    const newTrack: AudioTrack = {
      ...trackData,
      id: newId('trk'),
      mixId: mix.id,
    };

    mix.tracks.push(newTrack);
    await this.saveMix(mix);

    return mix;
  }

  /**
   * Automatically integrates an approved asset into the mix.
   * Finds the asset's shot in the timeline, sets the correct start time,
   * maps the layer based on the asset kind, and replaces any existing track
   * for the same shot on that layer.
   */
  async importAssetToMix(episodeId: string, assetId: string): Promise<AudioMix> {
    const asset = await this.assetRepository.byId(assetId);
    if (!asset) throw notFound('Asset', assetId);
    if (asset.approvalState !== 'approved') {
      throw new DomainError('VALIDATION_FAILED', `Asset ${assetId} must be approved before importing`);
    }

    let layer: AudioTrack['layer'];
    if (asset.kind === 'voice') layer = 'dialogue';
    else if (asset.kind === 'sound') layer = 'foley';
    else if (asset.kind === 'music') layer = 'music';
    else throw new DomainError('VALIDATION_FAILED', `Asset kind ${asset.kind} cannot be placed on an audio track`);

    const episode = await this.episodeRepository.findById(episodeId);
    if (!episode) throw notFound('Episode', episodeId);
    if (asset.projectId !== episode.projectId) {
      throw new DomainError('VALIDATION_FAILED', `Audio asset ${assetId} belongs to another project.`);
    }

    const timeline = await this.timelineService.build(episode.projectId, episodeId);

    let startTimeSeconds = 0;
    if (asset.shotId) {
      const timelineItem = timeline.items.find((item) => item.shotId === asset.shotId);
      if (timelineItem) {
        startTimeSeconds = timelineItem.startSeconds;
      }
    }

    const mix = await this.getMixForEpisode(episodeId);

    // Replace source: remove existing track for this shot/layer
    if (asset.shotId) {
      mix.tracks = mix.tracks.filter(
        (t) => !(t.layer === layer && t.shotId === asset.shotId)
      );
    }

    mix.tracks.push({
      id: newId('trk'),
      mixId: mix.id,
      layer,
      assetId: asset.id,
      shotId: asset.shotId,
      generationId: asset.generationId,
      startTimeSeconds,
      durationSeconds: asset.durationSeconds ?? 0,
      gainDb: 0,
      muted: false,
    });

    await this.saveMix(mix);
    return mix;
  }
}

export function createSoundStudioService(studio: Studio): SoundStudioService {
  return new SoundStudioService(
    studio.episodes,
    studio.audioMixes,
    studio.assets,
    createTimelineService(studio)
  );
}
