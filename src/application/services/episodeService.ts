import { DomainError, notFound } from '@/domain/errors';
import { episodeCode } from '@/domain/ids';
import type { CreateEpisodeInput, UpdateEpisodeInput } from '@/domain/schemas';
import type { EpisodeRecord } from '@/application/records';
import type { EpisodeRepository } from '@/application/ports';

export interface EpisodeService {
  createEpisode(projectId: string, input: CreateEpisodeInput): Promise<EpisodeRecord>;
  updateEpisode(episodeId: string, patch: UpdateEpisodeInput): Promise<EpisodeRecord>;
  deleteEpisode(episodeId: string): Promise<void>;
  listEpisodes(projectId: string): Promise<EpisodeRecord[]>;
}

export function createEpisodeService(deps: { episodes: EpisodeRepository }): EpisodeService {
  return {
    async createEpisode(projectId, input) {
      const nextNumber = await deps.episodes.nextNumber(projectId);
      const code = episodeCode(nextNumber);

      return deps.episodes.create(projectId, {
        ...input,
        code,
        number: nextNumber,
      });
    },

    async updateEpisode(episodeId, patch) {
      const episode = await deps.episodes.findById(episodeId);
      if (!episode) throw notFound('Episode', episodeId);
      return deps.episodes.update(episodeId, patch);
    },

    async deleteEpisode(episodeId) {
      const episode = await deps.episodes.findById(episodeId);
      if (!episode) throw notFound('Episode', episodeId);
      if ((await deps.episodes.listByProject(episode.projectId)).length <= 1) {
        throw new DomainError('CONFLICT', 'A project must keep at least one episode.');
      }
      await deps.episodes.delete(episodeId);
    },

    async listEpisodes(projectId) {
      return deps.episodes.listByProject(projectId);
    },
  };
}
