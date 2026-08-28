/**
 * Drizzle repositories for the project tree: workspace, project, episode,
 * script, scene, shot.
 */
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { newId, slugify } from '@/domain/ids';
import { stringify } from '@/domain/json';
import { DomainError, notFound } from '@/domain/errors';
import {
  continuityStateSchema,
  type CreateProjectInput,
  type SceneInput,
  type ShotInput,
  type UpdateProjectInput,
  type UpdateShotInput,
} from '@/domain/schemas';
import type {
  Clock,
  EpisodeRepository,
  ProjectRepository,
  SceneRepository,
  ScriptRepository,
  ShotRepository,
  UserRepository,
  WorkspaceRepository,
} from '@/application/ports';
import type { EpisodeRecord, ProjectRecord, SceneRecord, ScriptRecord, ShotRecord, UserRecord } from '@/application/records';
import type { Db } from '../db/client';
import { episodes, projects, scenes, scriptDocuments, shots, users, workspaces } from '../db/schema';
import { toEpisode, toProject, toScene, toScript, toShot, toUser } from './mappers';

const DEFAULT_WORKSPACE_SLUG = 'studio';
const DEFAULT_OWNER_EMAIL = 'operator@localhost';

export function createWorkspaceRepository(db: Db, clock: Clock): WorkspaceRepository {
  return {
    async ensureDefault() {
      const existing = db.select().from(workspaces).where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG)).get();
      const workspaceId = existing?.id ?? newId('ws');
      if (!existing) {
        db.insert(workspaces)
          .values({
            id: workspaceId,
            name: 'Đại Thiên Tài Studio',
            slug: DEFAULT_WORKSPACE_SLUG,
            createdAt: clock.nowIso(),
            updatedAt: clock.nowIso(),
          })
          .run();
      }

      const owner = db.select().from(users).where(eq(users.email, DEFAULT_OWNER_EMAIL)).get();
      const ownerId = owner?.id ?? newId('usr');
      if (!owner) {
        db.insert(users)
          .values({
            id: ownerId,
            workspaceId,
            email: DEFAULT_OWNER_EMAIL,
            displayName: 'Operator',
            role: 'owner',
            createdAt: clock.nowIso(),
            updatedAt: clock.nowIso(),
          })
          .run();
      }

      return { workspaceId, ownerId };
    },
  };
}

export function createUserRepository(db: Db, clock: Clock): UserRepository {
  return {
    async byEmail(email: string): Promise<UserRecord | null> {
      const row = db.select().from(users).where(eq(users.email, email)).get();
      return row ? toUser(row) : null;
    },
    async byId(id: string): Promise<UserRecord | null> {
      const row = db.select().from(users).where(eq(users.id, id)).get();
      return row ? toUser(row) : null;
    },
  };
}

export function createProjectRepository(db: Db, clock: Clock): ProjectRepository {
  const load = (id: string): ProjectRecord => {
    const row = db.select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw notFound('Project', id);
    return toProject(row);
  };

  return {
    async create(input) {
      const now = clock.nowIso();
      const id = newId('prj');
      db.insert(projects)
        .values({
          id,
          workspaceId: input.workspaceId,
          slug: input.slug,
          title: input.title,
          description: input.description,
          genre: input.genre,
          format: input.format,
          targetAudience: input.targetAudience,
          platform: input.platform,
          language: input.language,
          durationTargetSeconds: input.durationTargetSeconds,
          aspectRatio: input.aspectRatio,
          secondaryAspectRatiosJson: stringify(input.secondaryAspectRatios),
          frameRate: input.frameRate,
          resolution: input.resolution,
          status: 'development',
          ownerId: input.ownerId,
          creativeBriefJson: stringify(input.creativeBrief ?? {}),
          costLimitUsd: input.costLimitUsd,
          productionStrategy: input.productionStrategy ?? 'hybrid',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return load(id);
    },

    async update(id, patch: UpdateProjectInput) {
      load(id);
      const values: Record<string, unknown> = { updatedAt: clock.nowIso() };
      const assign = <K extends keyof UpdateProjectInput>(key: K, column: string): void => {
        if (patch[key] !== undefined) values[column] = patch[key];
      };
      assign('title', 'title');
      assign('description', 'description');
      assign('genre', 'genre');
      assign('format', 'format');
      assign('targetAudience', 'targetAudience');
      assign('platform', 'platform');
      assign('language', 'language');
      assign('durationTargetSeconds', 'durationTargetSeconds');
      assign('aspectRatio', 'aspectRatio');
      assign('frameRate', 'frameRate');
      assign('resolution', 'resolution');
      assign('status', 'status');
      assign('costLimitUsd', 'costLimitUsd');
      assign('productionStrategy', 'productionStrategy');
      if (patch.styleId !== undefined) values.styleId = patch.styleId;
      if (patch.secondaryAspectRatios !== undefined) {
        values.secondaryAspectRatiosJson = stringify(patch.secondaryAspectRatios);
      }
      if (patch.creativeBrief !== undefined) {
        const current = load(id).creativeBrief;
        values.creativeBriefJson = stringify({ ...current, ...patch.creativeBrief });
      }

      db.update(projects).set(values).where(eq(projects.id, id)).run();
      return load(id);
    },

    async byId(id) {
      const row = db.select().from(projects).where(eq(projects.id, id)).get();
      return row && !row.deletedAt ? toProject(row) : null;
    },

    async bySlug(slug) {
      const row = db.select().from(projects).where(eq(projects.slug, slug)).get();
      return row && !row.deletedAt ? toProject(row) : null;
    },

    async list(options) {
      const rows = options?.includeDeleted
        ? db.select().from(projects).all()
        : db.select().from(projects).where(isNull(projects.deletedAt)).all();
      const sorted = rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? 50;
      return sorted.slice(offset, offset + limit).map(toProject);
    },

    /**
     * Soft delete releases the slug. The row stays for audit, but its slug is
     * suffixed so the UNIQUE index no longer blocks a new project (or a re-seed)
     * from taking the readable name back.
     */
    async softDelete(id) {
      const current = load(id);
      const now = clock.nowIso();
      const released = `${current.slug}~deleted~${now.replace(/[^0-9]/g, '').slice(0, 14)}`;
      db.update(projects)
        .set({ deletedAt: now, updatedAt: now, slug: released.slice(0, 200) })
        .where(eq(projects.id, id))
        .run();
    },

    async slugExists(slug) {
      const row = db.select({ deletedAt: projects.deletedAt }).from(projects).where(eq(projects.slug, slug)).get();
      return Boolean(row);
    },
  };
}

/** Reserves a unique slug without a race: check, then rely on the UNIQUE index. */
export async function reserveProjectSlug(repository: ProjectRepository, title: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;
  while (await repository.slugExists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 200) throw new DomainError('CONFLICT', `Could not find a free slug for "${title}"`);
  }
  return candidate;
}

export function createEpisodeRepository(db: Db, clock: Clock): EpisodeRepository {
  const load = (id: string): EpisodeRecord => {
    const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
    if (!row || row.deletedAt) throw notFound('Episode', id);
    return toEpisode(row);
  };

  return {
    async create(projectId, input) {
      const now = clock.nowIso();
      const id = newId('ep');
      db.insert(episodes)
        .values({ id, projectId, ...input, status: 'draft', createdAt: now, updatedAt: now })
        .run();
      return load(id);
    },

    async update(id, patch) {
      load(id);
      db.update(episodes).set({ ...patch, updatedAt: clock.nowIso() }).where(eq(episodes.id, id)).run();
      return load(id);
    },

    async findById(id) {
      const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
      return row && !row.deletedAt ? toEpisode(row) : null;
    },

    async delete(id) {
      load(id);
      db.update(episodes).set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() }).where(eq(episodes.id, id)).run();
    },

    async upsertFirst(projectId, title) {
      const existing = db
        .select()
        .from(episodes)
        .where(and(eq(episodes.projectId, projectId), eq(episodes.code, 'EP01')))
        .get();
      if (existing) return toEpisode(existing);

      const now = clock.nowIso();
      const id = newId('ep');
      db.insert(episodes)
        .values({ id, projectId, code: 'EP01', number: 1, title, synopsis: '', status: 'draft', createdAt: now, updatedAt: now })
        .run();
      const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
      if (!row) throw notFound('Episode', id);
      return toEpisode(row);
    },

    async listByProject(projectId): Promise<EpisodeRecord[]> {
      return db
        .select()
        .from(episodes)
        .where(and(eq(episodes.projectId, projectId), isNull(episodes.deletedAt)))
        .orderBy(asc(episodes.number))
        .all()
        .map(toEpisode);
    },

    async nextNumber(projectId) {
      const row = db
        .select({ value: sql<number>`coalesce(max(${episodes.number}), 0)` })
        .from(episodes)
        .where(eq(episodes.projectId, projectId))
        .get();
      return (row?.value ?? 0) + 1;
    },
  };
}

export function createScriptRepository(db: Db, clock: Clock): ScriptRepository {
  const currentRow = (projectId: string) =>
    db
      .select()
      .from(scriptDocuments)
      .where(eq(scriptDocuments.projectId, projectId))
      .orderBy(asc(scriptDocuments.version))
      .all()
      .at(-1);

  return {
    async save(projectId, input): Promise<ScriptRecord> {
      const now = clock.nowIso();
      const existing = currentRow(projectId);

      if (existing) {
        // Editing the script bumps its version; the parsed flag is cleared so a
        // stale scene breakdown can never look current.
        db.update(scriptDocuments)
          .set({
            title: input.title,
            scriptType: input.scriptType,
            raw: input.raw,
            version: existing.version + (existing.raw === input.raw ? 0 : 1),
            status: existing.raw === input.raw ? existing.status : 'draft',
            parsedAt: existing.raw === input.raw ? existing.parsedAt : null,
            updatedAt: now,
          })
          .where(eq(scriptDocuments.id, existing.id))
          .run();
        const row = db.select().from(scriptDocuments).where(eq(scriptDocuments.id, existing.id)).get();
        if (!row) throw notFound('Script', existing.id);
        return toScript(row);
      }

      const id = newId('scr');
      db.insert(scriptDocuments)
        .values({
          id,
          projectId,
          episodeId: null,
          title: input.title,
          scriptType: input.scriptType,
          raw: input.raw,
          version: 1,
          status: 'draft',
          parsedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(scriptDocuments).where(eq(scriptDocuments.id, id)).get();
      if (!row) throw notFound('Script', id);
      return toScript(row);
    },

    async current(projectId) {
      const row = currentRow(projectId);
      return row ? toScript(row) : null;
    },

    async markParsed(id) {
      db.update(scriptDocuments)
        .set({ status: 'parsed', parsedAt: clock.nowIso(), updatedAt: clock.nowIso() })
        .where(eq(scriptDocuments.id, id))
        .run();
    },
  };
}

export function createSceneRepository(db: Db, clock: Clock): SceneRepository {
  const load = (id: string): SceneRecord => {
    const row = db.select().from(scenes).where(eq(scenes.id, id)).get();
    if (!row) throw notFound('Scene', id);
    return toScene(row);
  };

  return {
    async create(projectId, input) {
      const now = clock.nowIso();
      const id = newId('scn');
      db.insert(scenes)
        .values({
          id,
          projectId,
          episodeId: input.episodeId,
          code: input.code,
          number: input.number,
          title: input.title,
          locationId: input.locationId,
          timeOfDay: input.timeOfDay,
          summary: input.summary,
          action: input.action,
          dialogueJson: stringify(input.dialogue),
          emotion: input.emotion,
          visualGoal: input.visualGoal,
          audioGoal: input.audioGoal,
          durationSeconds: input.durationSeconds,
          charactersJson: stringify(input.characters),
          status: input.status,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return load(id);
    },

    async update(id, patch: Partial<SceneInput>) {
      load(id);
      const values: Record<string, unknown> = { updatedAt: clock.nowIso() };
      if (patch.title !== undefined) values.title = patch.title;
      if (patch.locationId !== undefined) values.locationId = patch.locationId;
      if (patch.timeOfDay !== undefined) values.timeOfDay = patch.timeOfDay;
      if (patch.summary !== undefined) values.summary = patch.summary;
      if (patch.action !== undefined) values.action = patch.action;
      if (patch.dialogue !== undefined) values.dialogueJson = stringify(patch.dialogue);
      if (patch.emotion !== undefined) values.emotion = patch.emotion;
      if (patch.visualGoal !== undefined) values.visualGoal = patch.visualGoal;
      if (patch.audioGoal !== undefined) values.audioGoal = patch.audioGoal;
      if (patch.durationSeconds !== undefined) values.durationSeconds = patch.durationSeconds;
      if (patch.characters !== undefined) values.charactersJson = stringify(patch.characters);
      if (patch.status !== undefined) values.status = patch.status;
      db.update(scenes).set(values).where(eq(scenes.id, id)).run();
      return load(id);
    },

    async byId(id) {
      const row = db.select().from(scenes).where(eq(scenes.id, id)).get();
      return row && !row.deletedAt ? toScene(row) : null;
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(scenes)
        .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))
        .orderBy(asc(scenes.number))
        .all()
        .map(toScene);
    },

    async listByEpisode(projectId, episodeId) {
      return db
        .select()
        .from(scenes)
        .where(and(eq(scenes.projectId, projectId), eq(scenes.episodeId, episodeId), isNull(scenes.deletedAt)))
        .orderBy(asc(scenes.number))
        .all()
        .map(toScene);
    },

    async deleteAllForProject(projectId) {
      const rows = db.select({ id: scenes.id }).from(scenes).where(eq(scenes.projectId, projectId)).all();
      db.delete(scenes).where(eq(scenes.projectId, projectId)).run();
      return rows.length;
    },

    async deleteAllForEpisode(projectId, episodeId) {
      const predicate = and(eq(scenes.projectId, projectId), eq(scenes.episodeId, episodeId));
      const rows = db.select({ id: scenes.id }).from(scenes).where(predicate).all();
      db.delete(scenes).where(predicate).run();
      return rows.length;
    },

    async nextNumber(projectId) {
      const row = db
        .select({ value: sql<number>`coalesce(max(${scenes.number}), 0)` })
        .from(scenes)
        .where(eq(scenes.projectId, projectId))
        .get();
      return (row?.value ?? 0) + 1;
    },
  };
}

export function createShotRepository(db: Db, clock: Clock): ShotRepository {
  const load = (id: string): ShotRecord => {
    const row = db.select().from(shots).where(eq(shots.id, id)).get();
    if (!row) throw notFound('Shot', id);
    return toShot(row);
  };

  return {
    async create(projectId, input) {
      const now = clock.nowIso();
      const id = newId('shot');
      db.insert(shots)
        .values({
          id,
          projectId,
          episodeId: input.episodeId,
          sceneId: input.sceneId,
          code: input.code,
          shotNumber: input.shotNumber,
          // *10 leaves room between shots for a future insert-between without
          // renumbering the whole scene; matches shotNumber order until the
          // scene is actually reordered.
          sortIndex: input.shotNumber * 10,
          title: input.title,
          description: input.description,
          shotSize: input.shotSize,
          cameraAngle: input.cameraAngle,
          cameraMovementJson: stringify(input.cameraMovement),
          lens: input.lens,
          durationSeconds: input.durationSeconds,
          charactersJson: stringify(input.characters),
          locationId: input.location?.locationId ?? null,
          locationVersionId: input.location?.versionId ?? null,
          propsJson: stringify(input.props),
          dialogue: input.dialogue,
          emotion: input.emotion,
          lighting: input.lighting,
          visualEffectsJson: stringify(input.visualEffects),
          soundEffectsJson: stringify(input.soundEffects),
          continuityInJson: stringify(continuityStateSchema.parse(input.continuity.incoming)),
          continuityOutJson: stringify(continuityStateSchema.parse(input.continuity.outgoing)),
          intentionalChangesJson: stringify(input.continuity.intentionalChanges),
          aspectRatio: input.aspectRatio,
          importance: input.importance,
          status: 'planned',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return load(id);
    },

    async update(id, patch: UpdateShotInput) {
      load(id);
      const values: Record<string, unknown> = { updatedAt: clock.nowIso() };
      if (patch.title !== undefined) values.title = patch.title;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.shotSize !== undefined) values.shotSize = patch.shotSize;
      if (patch.cameraAngle !== undefined) values.cameraAngle = patch.cameraAngle;
      if (patch.cameraMovement !== undefined) values.cameraMovementJson = stringify(patch.cameraMovement);
      if (patch.lens !== undefined) values.lens = patch.lens;
      if (patch.durationSeconds !== undefined) values.durationSeconds = patch.durationSeconds;
      if (patch.characters !== undefined) values.charactersJson = stringify(patch.characters);
      if (patch.location !== undefined) {
        values.locationId = patch.location?.locationId ?? null;
        values.locationVersionId = patch.location?.versionId ?? null;
      }
      if (patch.props !== undefined) values.propsJson = stringify(patch.props);
      if (patch.dialogue !== undefined) values.dialogue = patch.dialogue;
      if (patch.emotion !== undefined) values.emotion = patch.emotion;
      if (patch.lighting !== undefined) values.lighting = patch.lighting;
      if (patch.visualEffects !== undefined) values.visualEffectsJson = stringify(patch.visualEffects);
      if (patch.soundEffects !== undefined) values.soundEffectsJson = stringify(patch.soundEffects);
      if (patch.continuity !== undefined) {
        values.continuityInJson = stringify(continuityStateSchema.parse(patch.continuity.incoming));
        values.continuityOutJson = stringify(continuityStateSchema.parse(patch.continuity.outgoing));
        values.intentionalChangesJson = stringify(patch.continuity.intentionalChanges);
      }
      if (patch.aspectRatio !== undefined) values.aspectRatio = patch.aspectRatio;
      if (patch.importance !== undefined) values.importance = patch.importance;
      if (patch.status !== undefined) values.status = patch.status;
      db.update(shots).set(values).where(eq(shots.id, id)).run();
      return load(id);
    },

    async byId(id) {
      const row = db.select().from(shots).where(eq(shots.id, id)).get();
      return row && !row.deletedAt ? toShot(row) : null;
    },

    async byCode(projectId, code) {
      const row = db
        .select()
        .from(shots)
        .where(and(eq(shots.projectId, projectId), eq(shots.code, code)))
        .get();
      return row && !row.deletedAt ? toShot(row) : null;
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(shots)
        .where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
        .orderBy(asc(shots.code))
        .all()
        .map(toShot);
    },

    async listByEpisode(projectId, episodeId) {
      return db
        .select()
        .from(shots)
        .where(and(eq(shots.projectId, projectId), eq(shots.episodeId, episodeId), isNull(shots.deletedAt)))
        .orderBy(asc(shots.code))
        .all()
        .map(toShot);
    },

    async listByScene(sceneId) {
      return db
        .select()
        .from(shots)
        .where(and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)))
        .orderBy(asc(shots.sortIndex), asc(shots.shotNumber))
        .all()
        .map(toShot);
    },

    async nextNumber(sceneId) {
      const row = db
        .select({ value: sql<number>`coalesce(max(${shots.shotNumber}), 0)` })
        .from(shots)
        .where(eq(shots.sceneId, sceneId))
        .get();
      return (row?.value ?? 0) + 1;
    },

    async reorder(sceneId, orderedShotIds) {
      const current = db
        .select({ id: shots.id })
        .from(shots)
        .where(and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)))
        .all();
      const currentIds = new Set(current.map((row) => row.id));
      const requestedIds = new Set(orderedShotIds);

      if (
        currentIds.size !== requestedIds.size ||
        orderedShotIds.some((id) => !currentIds.has(id))
      ) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'The reorder list must contain exactly the shots currently in this scene, no more and no fewer.',
          { sceneId, expected: [...currentIds], received: orderedShotIds },
        );
      }

      const now = clock.nowIso();
      orderedShotIds.forEach((id, index) => {
        db.update(shots)
          .set({ sortIndex: (index + 1) * 10, updatedAt: now })
          .where(eq(shots.id, id))
          .run();
      });

      return db
        .select()
        .from(shots)
        .where(and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)))
        .orderBy(asc(shots.sortIndex), asc(shots.shotNumber))
        .all()
        .map(toShot);
    },

    async countByStatus(projectId) {
      const rows = db
        .select({ status: shots.status, total: count() })
        .from(shots)
        .where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
        .groupBy(shots.status)
        .all();
      return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
    },

    async delete(id) {
      load(id);
      db.update(shots).set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() }).where(eq(shots.id, id)).run();
    },
  };
}

export type { ShotInput, SceneInput, CreateProjectInput };
