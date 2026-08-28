/**
 * Bible service — the read/write API for characters, locations, props, styles,
 * and the place snapshot ids are resolved back into prompt-ready data.
 *
 * `resolveSnapshot` is the load-bearing function: a prompt asks for
 * `CHAR001_V2` and gets exactly that payload, even if the character has been
 * edited five times since. If a pinned snapshot is missing, it fails loudly —
 * quietly falling back to "latest" is what silently breaks continuity.
 */
import { DomainError, notFound } from '@/domain/errors';
import {
  characterInputSchema,
  createVoiceProfileSchema,
  locationInputSchema,
  propInputSchema,
  styleInputSchema,
  type CharacterInput,
  type LocationInput,
  type PropInput,
  type StyleInput,
} from '@/domain/schemas';
import type {
  CharacterSnapshot,
  LocationSnapshot,
  PropSnapshot,
  StyleSnapshot,
} from '@/domain/prompt/locks';
import { STYLE_PRESETS } from '@/domain/styles/presets';
import {
  formatSnapshotId,
  parseSnapshotId as parseSnapshotIdFromDomain,
} from '@/domain/visualControl/approvedVersions';
import type { Studio } from '../ports';
import type { CharacterRecord, LocationRecord, PropRecord, StyleRecord } from '../records';

/** `CHAR001` + 2 → `CHAR001_V2`. Delegates to the domain-owned grammar. */
export const snapshotIdFor = formatSnapshotId;

/** Bible-only snapshot id parsing. Delegates to the domain-owned grammar. */
export const parseSnapshotId = parseSnapshotIdFromDomain;

export function createBibleService(studio: Studio) {
  const { bibles, projects, activity } = studio;

  async function requireProject(idOrSlug: string) {
    const project = (await projects.byId(idOrSlug)) ?? (await projects.bySlug(idOrSlug));
    if (!project) throw notFound('Project', idOrSlug);
    return project;
  }

  /**
   * Loads the exact snapshot a shot pinned. `versionId` empty means "the shot
   * was never locked" — the caller decides whether that is acceptable.
   */
  async function resolveSnapshot<T>(
    kind: 'character' | 'location' | 'prop' | 'style',
    refId: string,
    versionId: string,
  ): Promise<T> {
    if (!versionId) {
      throw new DomainError(
        'LOCK_REQUIRED',
        `A ${kind} reference has no pinned snapshot id. Rebuild the shot so it pins a bible version.`,
        { kind, refId },
      );
    }
    const { version } = parseSnapshotId(versionId);
    const snapshot = await bibles.version(kind, refId, version);
    if (!snapshot) {
      throw new DomainError(
        'MISSING_REFERENCE',
        `Pinned ${kind} snapshot ${versionId} no longer exists. It must never be deleted — check the bible_versions table.`,
        { kind, refId, versionId },
      );
    }
    return snapshot.payload as T;
  }

  return {
    resolveSnapshot,

    async characterSnapshot(refId: string, versionId: string): Promise<CharacterSnapshot> {
      const payload = await resolveSnapshot<CharacterRecord>('character', refId, versionId);
      return { ...payload, id: payload.id, code: payload.code, version: payload.currentVersion };
    },

    async locationSnapshot(refId: string, versionId: string): Promise<LocationSnapshot> {
      const payload = await resolveSnapshot<LocationRecord>('location', refId, versionId);
      return { ...payload, id: payload.id, code: payload.code, version: payload.currentVersion };
    },

    async propSnapshot(refId: string, versionId: string): Promise<PropSnapshot> {
      const payload = await resolveSnapshot<PropRecord>('prop', refId, versionId);
      return { ...payload, id: payload.id, code: payload.code, version: payload.currentVersion };
    },

    async styleSnapshot(refId: string, versionId: string): Promise<StyleSnapshot> {
      const payload = await resolveSnapshot<StyleRecord>('style', refId, versionId);
      return { ...payload, id: payload.id, code: payload.code, version: payload.currentVersion };
    },

    /** The project's current style, pinned at its current version. */
    async currentStyle(projectId: string): Promise<StyleSnapshot | null> {
      const project = await projects.byId(projectId);
      if (!project?.styleId) return null;
      const style = await bibles.styleById(project.styleId);
      if (!style) return null;
      return { ...style, version: style.currentVersion };
    },

    async versionHistoryWithUsage(kind: string, refId: string) {
      const versions = await bibles.listVersions(kind, refId);
      return Promise.all(
        versions.map(async (v) => {
          const snapshotId = snapshotIdFor(
            // @ts-expect-error Code exists in the payload, but typings are loose here
            v.payload.code || 'UNKNOWN',
            v.version
          );
          let matchString = snapshotId;
          // For location/style, the format inside lockRefs is {"code":"...","version":...}
          // The snapshotIdFor function just does CODE_V1, but lockRefsJson could hold either.
          // Since our countByLockRef uses LIKE, we can just use the exact snapshotId for Characters/Props.
          if (kind === 'location' || kind === 'style') {
            // @ts-expect-error Code exists in payload
            const code = v.payload.code;
            matchString = `\"code\":\"${code}\",\"version\":${v.version}`;
          }
          const promptsCount = await studio.prompts.countByLockRef(matchString);
          return {
            ...v,
            promptsCount,
          };
        })
      );
    },

    // --- Characters ------------------------------------------------------
    async listCharacters(projectIdOrSlug: string): Promise<CharacterRecord[]> {
      const project = await requireProject(projectIdOrSlug);
      return bibles.listCharacters(project.id);
    },

    async createCharacter(projectIdOrSlug: string, raw: unknown): Promise<CharacterRecord> {
      const project = await requireProject(projectIdOrSlug);
      const input: CharacterInput = characterInputSchema.parse(raw);
      const code = input.code ?? (await bibles.nextCode(project.id, 'character'));
      const character = await bibles.createCharacter(project.id, { ...input, code });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'character.created',
        targetType: 'character',
        targetId: character.id,
        details: { code: character.code, name: character.name },
      });
      return character;
    },

    async updateCharacter(id: string, raw: unknown): Promise<CharacterRecord> {
      const current = await bibles.characterById(id);
      if (!current) throw notFound('Character', id);
      const patch = characterInputSchema.partial().parse(raw);
      const updated = await bibles.updateCharacter(id, patch);
      await activity.log({
        projectId: updated.projectId,
        userId: null,
        action: 'character.versioned',
        targetType: 'character',
        targetId: id,
        details: { from: current.currentVersion, to: updated.currentVersion },
      });
      return updated;
    },

    async characterVersions(id: string) {
      return bibles.listVersions('character', id);
    },

    // --- Locations -------------------------------------------------------
    async listLocations(projectIdOrSlug: string): Promise<LocationRecord[]> {
      const project = await requireProject(projectIdOrSlug);
      return bibles.listLocations(project.id);
    },

    async createLocation(projectIdOrSlug: string, raw: unknown): Promise<LocationRecord> {
      const project = await requireProject(projectIdOrSlug);
      const input: LocationInput = locationInputSchema.parse(raw);
      const code = input.code ?? (await bibles.nextCode(project.id, 'location'));
      return bibles.createLocation(project.id, { ...input, code });
    },

    async updateLocation(id: string, raw: unknown): Promise<LocationRecord> {
      if (!(await bibles.locationById(id))) throw notFound('Location', id);
      return bibles.updateLocation(id, locationInputSchema.partial().parse(raw));
    },

    // --- Props -----------------------------------------------------------
    async listProps(projectIdOrSlug: string): Promise<PropRecord[]> {
      const project = await requireProject(projectIdOrSlug);
      return bibles.listProps(project.id);
    },

    async createProp(projectIdOrSlug: string, raw: unknown): Promise<PropRecord> {
      const project = await requireProject(projectIdOrSlug);
      const input: PropInput = propInputSchema.parse(raw);
      const code = input.code ?? (await bibles.nextCode(project.id, 'prop'));
      return bibles.createProp(project.id, { ...input, code });
    },

    async updateProp(id: string, raw: unknown): Promise<PropRecord> {
      if (!(await bibles.propById(id))) throw notFound('Prop', id);
      return bibles.updateProp(id, propInputSchema.partial().parse(raw));
    },

    // --- Styles ----------------------------------------------------------
    async listStyles(projectIdOrSlug: string): Promise<StyleRecord[]> {
      const project = await requireProject(projectIdOrSlug);
      return bibles.listStyles(project.id);
    },

    async createStyle(projectIdOrSlug: string, raw: unknown): Promise<StyleRecord> {
      const project = await requireProject(projectIdOrSlug);
      const input: StyleInput = styleInputSchema.parse(raw);
      const code = input.code ?? (await bibles.nextCode(project.id, 'style'));
      return bibles.createStyle(project.id, { ...input, code });
    },

    async updateStyle(id: string, raw: unknown): Promise<StyleRecord> {
      if (!(await bibles.styleById(id))) throw notFound('Style', id);
      return bibles.updateStyle(id, styleInputSchema.partial().parse(raw));
    },

    /** Adds a preset as a new Style Bible entry for this project. */
    async addStyleFromPreset(projectIdOrSlug: string, presetKey: string): Promise<StyleRecord> {
      const project = await requireProject(projectIdOrSlug);
      const preset = STYLE_PRESETS.find((candidate) => candidate.key === presetKey);
      if (!preset) throw notFound('Style preset', presetKey);
      const code = await bibles.nextCode(project.id, 'style');
      return bibles.createStyle(project.id, {
        code,
        name: preset.name,
        category: preset.category,
        details: preset.details,
        promptBlock: preset.promptBlock,
        negativeStyleRules: preset.negativeStyleRules,
        status: 'draft',
      });
    },

    presets: () => STYLE_PRESETS,

    // --- Voice -----------------------------------------------------------
    async listVoiceProfiles(projectIdOrSlug: string) {
      const project = await requireProject(projectIdOrSlug);
      return bibles.listVoiceProfiles(project.id);
    },

    async createVoiceProfile(projectIdOrSlug: string, raw: unknown) {
      const project = await requireProject(projectIdOrSlug);
      const input = createVoiceProfileSchema.parse(raw);
      return bibles.createVoiceProfile(project.id, input);
    },

    async updateVoiceProfile(id: string, raw: unknown) {
      const patch = createVoiceProfileSchema.partial().parse(raw);
      return bibles.updateVoiceProfile(id, patch);
    },

    async deleteVoiceProfile(id: string) {
      // TASK-014B: Prevent dangling character assignments.
      const charactersWithProfile = await bibles.listCharactersByVoiceProfile(id);
      for (const char of charactersWithProfile) {
        await bibles.updateCharacter(char.id, { voiceProfileId: null });
      }
      return bibles.deleteVoiceProfile(id);
    },
  };
}

export type BibleService = ReturnType<typeof createBibleService>;
