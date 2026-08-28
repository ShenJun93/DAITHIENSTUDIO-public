import { eq } from 'drizzle-orm';
import { audioTrackLayerSchema, type AudioMix } from '@/domain/schemas';
import type { AudioMixRepository, Clock } from '@/application/ports';
import { audioMixes, audioTracks } from '../db/schema';
import { newId } from '@/domain/ids';
import type { Db } from '../db/client';

export function createAudioMixRepository(db: Db, clock: Clock): AudioMixRepository {
  return {
    async getForEpisode(episodeId: string): Promise<AudioMix> {
      const mixRow = db.select().from(audioMixes).where(eq(audioMixes.episodeId, episodeId)).get();

      if (!mixRow) {
        const newMixId = newId('mix');
        const now = clock.nowIso();

        db.insert(audioMixes).values({
          id: newMixId,
          episodeId,
          createdAt: now,
          updatedAt: now,
        }).run();

        return {
          id: newMixId,
          episodeId,
          tracks: [],
        };
      }

      const trackRows = db.select().from(audioTracks).where(eq(audioTracks.mixId, mixRow.id)).all();

      return {
        id: mixRow.id,
        episodeId: mixRow.episodeId,
        tracks: trackRows.map((row) => ({
          id: row.id,
          mixId: row.mixId,
          layer: audioTrackLayerSchema.parse(row.layer),
          assetId: row.assetId,
          shotId: row.shotId,
          generationId: row.generationId,
          startTimeSeconds: row.startTimeSeconds,
          durationSeconds: row.durationSeconds,
          gainDb: row.gainDb,
          muted: row.muted === 1,
        })),
      };
    },

    async save(mix: AudioMix): Promise<void> {
      const now = clock.nowIso();

      db.transaction((tx) => {
        // Upsert mix
        tx.insert(audioMixes).values({
          id: mix.id,
          episodeId: mix.episodeId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: audioMixes.id,
          set: { updatedAt: now },
        })
        .run();

        // Replace tracks: delete old ones, insert new ones
        tx.delete(audioTracks).where(eq(audioTracks.mixId, mix.id)).run();

        if (mix.tracks.length > 0) {
          tx.insert(audioTracks).values(
            mix.tracks.map((t) => ({
              id: t.id,
              mixId: mix.id,
              layer: t.layer,
              assetId: t.assetId,
              shotId: t.shotId,
              generationId: t.generationId,
              startTimeSeconds: t.startTimeSeconds,
              durationSeconds: t.durationSeconds,
              gainDb: t.gainDb,
              muted: t.muted ? 1 : 0,
              createdAt: now,
              updatedAt: now,
            }))
          ).run();
        }
      });
    }
  };
}
