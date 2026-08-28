/**
 * Bible repository — characters, locations, props, styles, voice profiles.
 *
 * Two invariants live here:
 *  1. every create/update writes an immutable snapshot into `bible_versions`
 *     and bumps `currentVersion`, so a prompt can pin `CHAR001_V2` forever;
 *  2. snapshots are insert-only — an existing version row is never updated.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { bibleCode, newId } from '@/domain/ids';
import { stringify } from '@/domain/json';
import { notFound } from '@/domain/errors';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import type { BibleRepository, Clock } from '@/application/ports';
import type {
  BibleVersionRecord,
  CharacterRecord,
  LocationRecord,
  PropRecord,
  StyleRecord,
  VoiceProfileRecord,
} from '@/application/records';
import type { Db } from '../db/client';
import { bibleVersions, characters, locations, props, styles, voiceProfiles } from '../db/schema';
import { toBibleVersion, toCharacter, toLocation, toProp, toStyle, toVoiceProfile } from './mappers';

/** `CHAR001` + version 2 → `CHAR001_V2`. The id every prompt pins. Delegates to the domain-owned grammar. */
export const snapshotId = formatSnapshotId;

export function createBibleRepository(db: Db, clock: Clock): BibleRepository {
  const writeSnapshot = (
    kind: 'character' | 'location' | 'prop' | 'style',
    refId: string,
    version: number,
    payload: unknown,
    note: string,
  ): void => {
    const existing = db
      .select({ id: bibleVersions.id })
      .from(bibleVersions)
      .where(and(eq(bibleVersions.kind, kind), eq(bibleVersions.refId, refId), eq(bibleVersions.version, version)))
      .get();
    // Insert-only: an existing snapshot is authoritative and never rewritten.
    if (existing) return;

    db.insert(bibleVersions)
      .values({
        id: newId('bv'),
        kind,
        refId,
        version,
        payloadJson: stringify(payload),
        note,
        createdAt: clock.nowIso(),
      })
      .run();
  };

  const loadCharacter = (id: string): CharacterRecord => {
    const row = db.select().from(characters).where(eq(characters.id, id)).get();
    if (!row) throw notFound('Character', id);
    return toCharacter(row);
  };
  const loadLocation = (id: string): LocationRecord => {
    const row = db.select().from(locations).where(eq(locations.id, id)).get();
    if (!row) throw notFound('Location', id);
    return toLocation(row);
  };
  const loadProp = (id: string): PropRecord => {
    const row = db.select().from(props).where(eq(props.id, id)).get();
    if (!row) throw notFound('Prop', id);
    return toProp(row);
  };
  const loadStyle = (id: string): StyleRecord => {
    const row = db.select().from(styles).where(eq(styles.id, id)).get();
    if (!row) throw notFound('Style', id);
    return toStyle(row);
  };

  return {
    // --- Characters ------------------------------------------------------
    async createCharacter(projectId, input) {
      const now = clock.nowIso();
      const id = newId('char');
      db.insert(characters)
        .values({
          id,
          projectId,
          code: input.code,
          name: input.name,
          role: input.role,
          identityJson: stringify(input.identity),
          variableJson: stringify(input.variable),
          promptToken: input.promptToken || input.name,
          negativePrompt: input.negativePrompt,
          forbiddenChangesJson: stringify(input.forbiddenChanges),
          colorPaletteJson: stringify(input.colorPalette),
          voiceProfileId: input.voiceProfileId,
          currentVersion: 1,
          lockEnabled: input.lockEnabled,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const record = loadCharacter(id);
      writeSnapshot('character', id, 1, record, 'initial version');
      return record;
    },

    async updateCharacter(id, patch) {
      const current = loadCharacter(id);
      const nextVersion = current.currentVersion + 1;
      const values: Record<string, unknown> = { updatedAt: clock.nowIso(), currentVersion: nextVersion };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.role !== undefined) values.role = patch.role;
      if (patch.identity !== undefined) values.identityJson = stringify({ ...current.identity, ...patch.identity });
      if (patch.variable !== undefined) values.variableJson = stringify({ ...current.variable, ...patch.variable });
      if (patch.promptToken !== undefined) values.promptToken = patch.promptToken;
      if (patch.negativePrompt !== undefined) values.negativePrompt = patch.negativePrompt;
      if (patch.forbiddenChanges !== undefined) values.forbiddenChangesJson = stringify(patch.forbiddenChanges);
      if (patch.colorPalette !== undefined) values.colorPaletteJson = stringify(patch.colorPalette);
      if (patch.voiceProfileId !== undefined) values.voiceProfileId = patch.voiceProfileId;
      if (patch.lockEnabled !== undefined) values.lockEnabled = patch.lockEnabled;
      if (patch.status !== undefined) values.status = patch.status;

      db.update(characters).set(values).where(eq(characters.id, id)).run();
      const updated = loadCharacter(id);
      writeSnapshot('character', id, nextVersion, updated, 'edited');
      return updated;
    },

    async characterById(id) {
      const row = db.select().from(characters).where(eq(characters.id, id)).get();
      return row && !row.deletedAt ? toCharacter(row) : null;
    },

    async listCharacters(projectId) {
      return db
        .select()
        .from(characters)
        .where(and(eq(characters.projectId, projectId), isNull(characters.deletedAt)))
        .orderBy(asc(characters.code))
        .all()
        .map(toCharacter);
    },

    async listCharactersByVoiceProfile(voiceProfileId) {
      return db
        .select()
        .from(characters)
        .where(eq(characters.voiceProfileId, voiceProfileId))
        .all()
        .map(toCharacter);
    },

    // --- Locations -------------------------------------------------------
    async createLocation(projectId, input) {
      const now = clock.nowIso();
      const id = newId('loc');
      db.insert(locations)
        .values({
          id,
          projectId,
          code: input.code,
          name: input.name,
          type: input.type,
          era: input.era,
          detailsJson: stringify(input.details),
          promptBlock: input.promptBlock,
          negativePrompt: input.negativePrompt,
          colorPaletteJson: stringify(input.colorPalette),
          continuityNotes: input.continuityNotes,
          currentVersion: 1,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const record = loadLocation(id);
      writeSnapshot('location', id, 1, record, 'initial version');
      return record;
    },

    async updateLocation(id, patch) {
      const current = loadLocation(id);
      const nextVersion = current.currentVersion + 1;
      const values: Record<string, unknown> = { updatedAt: clock.nowIso(), currentVersion: nextVersion };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.type !== undefined) values.type = patch.type;
      if (patch.era !== undefined) values.era = patch.era;
      if (patch.details !== undefined) values.detailsJson = stringify({ ...current.details, ...patch.details });
      if (patch.promptBlock !== undefined) values.promptBlock = patch.promptBlock;
      if (patch.negativePrompt !== undefined) values.negativePrompt = patch.negativePrompt;
      if (patch.colorPalette !== undefined) values.colorPaletteJson = stringify(patch.colorPalette);
      if (patch.continuityNotes !== undefined) values.continuityNotes = patch.continuityNotes;
      if (patch.status !== undefined) values.status = patch.status;

      db.update(locations).set(values).where(eq(locations.id, id)).run();
      const updated = loadLocation(id);
      writeSnapshot('location', id, nextVersion, updated, 'edited');
      return updated;
    },

    async locationById(id) {
      const row = db.select().from(locations).where(eq(locations.id, id)).get();
      return row && !row.deletedAt ? toLocation(row) : null;
    },

    async listLocations(projectId) {
      return db
        .select()
        .from(locations)
        .where(and(eq(locations.projectId, projectId), isNull(locations.deletedAt)))
        .orderBy(asc(locations.code))
        .all()
        .map(toLocation);
    },

    // --- Props -----------------------------------------------------------
    async createProp(projectId, input) {
      const now = clock.nowIso();
      const id = newId('prop');
      db.insert(props)
        .values({
          id,
          projectId,
          code: input.code,
          name: input.name,
          description: input.description,
          ownerCharacterId: input.ownerCharacterId,
          detailsJson: stringify(input.details),
          promptToken: input.promptToken || input.name,
          continuityConstraintsJson: stringify(input.continuityConstraints),
          currentVersion: 1,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const record = loadProp(id);
      writeSnapshot('prop', id, 1, record, 'initial version');
      return record;
    },

    async updateProp(id, patch) {
      const current = loadProp(id);
      const nextVersion = current.currentVersion + 1;
      const values: Record<string, unknown> = { updatedAt: clock.nowIso(), currentVersion: nextVersion };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.ownerCharacterId !== undefined) values.ownerCharacterId = patch.ownerCharacterId;
      if (patch.details !== undefined) values.detailsJson = stringify({ ...current.details, ...patch.details });
      if (patch.promptToken !== undefined) values.promptToken = patch.promptToken;
      if (patch.continuityConstraints !== undefined) {
        values.continuityConstraintsJson = stringify(patch.continuityConstraints);
      }
      if (patch.status !== undefined) values.status = patch.status;

      db.update(props).set(values).where(eq(props.id, id)).run();
      const updated = loadProp(id);
      writeSnapshot('prop', id, nextVersion, updated, 'edited');
      return updated;
    },

    async propById(id) {
      const row = db.select().from(props).where(eq(props.id, id)).get();
      return row && !row.deletedAt ? toProp(row) : null;
    },

    async listProps(projectId) {
      return db
        .select()
        .from(props)
        .where(and(eq(props.projectId, projectId), isNull(props.deletedAt)))
        .orderBy(asc(props.code))
        .all()
        .map(toProp);
    },

    // --- Styles ----------------------------------------------------------
    async createStyle(projectId, input) {
      const now = clock.nowIso();
      const id = newId('sty');
      db.insert(styles)
        .values({
          id,
          projectId,
          code: input.code,
          name: input.name,
          category: input.category,
          detailsJson: stringify(input.details),
          promptBlock: input.promptBlock,
          negativeStyleRules: input.negativeStyleRules,
          currentVersion: 1,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const record = loadStyle(id);
      writeSnapshot('style', id, 1, record, 'initial version');
      return record;
    },

    async updateStyle(id, patch) {
      const current = loadStyle(id);
      const nextVersion = current.currentVersion + 1;
      const values: Record<string, unknown> = { updatedAt: clock.nowIso(), currentVersion: nextVersion };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.category !== undefined) values.category = patch.category;
      if (patch.details !== undefined) values.detailsJson = stringify({ ...current.details, ...patch.details });
      if (patch.promptBlock !== undefined) values.promptBlock = patch.promptBlock;
      if (patch.negativeStyleRules !== undefined) values.negativeStyleRules = patch.negativeStyleRules;
      if (patch.status !== undefined) values.status = patch.status;

      db.update(styles).set(values).where(eq(styles.id, id)).run();
      const updated = loadStyle(id);
      writeSnapshot('style', id, nextVersion, updated, 'edited');
      return updated;
    },

    async styleById(id) {
      const row = db.select().from(styles).where(eq(styles.id, id)).get();
      return row && !row.deletedAt ? toStyle(row) : null;
    },

    async listStyles(projectId) {
      return db
        .select()
        .from(styles)
        .where(and(eq(styles.projectId, projectId), isNull(styles.deletedAt)))
        .orderBy(asc(styles.code))
        .all()
        .map(toStyle);
    },

    // --- Codes and snapshots ---------------------------------------------
    /**
     * Next free code for this kind. Derived from the highest existing numeric
     * suffix rather than a row count, so deleting an entry can never make the
     * allocator hand out a code that already exists.
     */
    async nextCode(projectId, kind) {
      const table = { character: characters, location: locations, prop: props, style: styles }[kind];
      const rows = db.select({ code: table.code }).from(table).where(eq(table.projectId, projectId)).all();
      let highest = 0;
      for (const row of rows) {
        const digits = /(\d{3,})$/.exec(row.code);
        if (!digits) continue;
        highest = Math.max(highest, Number.parseInt(digits[1] as string, 10));
      }
      return bibleCode(kind, highest + 1);
    },

    async saveVersion(input): Promise<BibleVersionRecord> {
      writeSnapshot(input.kind, input.refId, input.version, input.payload, input.note);
      const row = db
        .select()
        .from(bibleVersions)
        .where(
          and(
            eq(bibleVersions.kind, input.kind),
            eq(bibleVersions.refId, input.refId),
            eq(bibleVersions.version, input.version),
          ),
        )
        .get();
      if (!row) throw notFound('BibleVersion', `${input.kind}/${input.refId}/v${input.version}`);
      return toBibleVersion(row);
    },

    async version(kind, refId, version) {
      const row = db
        .select()
        .from(bibleVersions)
        .where(and(eq(bibleVersions.kind, kind), eq(bibleVersions.refId, refId), eq(bibleVersions.version, version)))
        .get();
      return row ? toBibleVersion(row) : null;
    },

    async latestVersion(kind, refId) {
      const rows = db
        .select()
        .from(bibleVersions)
        .where(and(eq(bibleVersions.kind, kind), eq(bibleVersions.refId, refId)))
        .orderBy(asc(bibleVersions.version))
        .all();
      const row = rows.at(-1);
      return row ? toBibleVersion(row) : null;
    },

    async listVersions(kind, refId) {
      return db
        .select()
        .from(bibleVersions)
        .where(and(eq(bibleVersions.kind, kind), eq(bibleVersions.refId, refId)))
        .orderBy(asc(bibleVersions.version))
        .all()
        .map(toBibleVersion);
    },

    // --- Voice profiles --------------------------------------------------
    async listVoiceProfiles(projectId) {
      return db
        .select()
        .from(voiceProfiles)
        .where(and(eq(voiceProfiles.projectId, projectId), isNull(voiceProfiles.deletedAt)))
        .orderBy(asc(voiceProfiles.name))
        .all()
        .map(toVoiceProfile);
    },

    async createVoiceProfile(projectId, input): Promise<VoiceProfileRecord> {
      const now = clock.nowIso();
      const id = newId('voice');
      db.insert(voiceProfiles)
        .values({
          id,
          projectId,
          name: input.name,
          provider: input.provider,
          language: input.language,
          voiceName: input.voiceName,
          speed: input.speed,
          pitch: input.pitch,
          emotion: input.emotion,
          style: input.style,
          pronunciationJson: stringify(input.pronunciation),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(voiceProfiles).where(eq(voiceProfiles.id, id)).get();
      if (!row) throw notFound('VoiceProfile', id);
      return toVoiceProfile(row);
    },

    async updateVoiceProfile(id, patch) {
      const values: Record<string, unknown> = { updatedAt: clock.nowIso() };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.provider !== undefined) values.provider = patch.provider;
      if (patch.language !== undefined) values.language = patch.language;
      if (patch.voiceName !== undefined) values.voiceName = patch.voiceName;
      if (patch.speed !== undefined) values.speed = patch.speed;
      if (patch.pitch !== undefined) values.pitch = patch.pitch;
      if (patch.emotion !== undefined) values.emotion = patch.emotion;
      if (patch.style !== undefined) values.style = patch.style;
      if (patch.pronunciation !== undefined) values.pronunciationJson = stringify(patch.pronunciation);

      db.update(voiceProfiles).set(values).where(eq(voiceProfiles.id, id)).run();
      const row = db.select().from(voiceProfiles).where(eq(voiceProfiles.id, id)).get();
      if (!row) throw notFound('VoiceProfile', id);
      return toVoiceProfile(row);
    },

    async deleteVoiceProfile(id) {
      db.update(voiceProfiles).set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() }).where(eq(voiceProfiles.id, id)).run();
    },
  };
}
