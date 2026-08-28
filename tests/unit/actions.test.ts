import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inspectShotPromptAction } from '@/app/actions';
import { getStudio } from '@/infrastructure/container';

vi.mock('@/infrastructure/container', () => ({
  getStudio: vi.fn(),
}));

vi.mock('@/application/services/projectService', () => ({
  createProjectService: vi.fn(),
}));

vi.mock('@/application/services/promptService', () => ({
  createPromptService: vi.fn(),
}));

describe('inspectShotPromptAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const setupMocks = (
    projectData: any,
    shotData: any,
    sceneData: any,
    episodeData: any,
  ) => {
    const mockProjectService = {
      get: vi.fn().mockImplementation(async (slug) => {
        if (!projectData) {
          class DomainError extends Error {
            code = 'NOT_FOUND';
            constructor() { super('Project not found'); }
          }
          throw new DomainError();
        }
        return projectData;
      }),
    };

    vi.mocked(getStudio).mockReturnValue({
      shots: { byId: vi.fn().mockImplementation(async (id) => shotData?.id === id ? shotData : null) },
      scenes: { byId: vi.fn().mockImplementation(async (id) => sceneData?.id === id ? sceneData : null) },
      episodes: { findById: vi.fn().mockImplementation(async (id) => episodeData?.id === id ? episodeData : null) },
      bibles: {
        characterById: vi.fn(),
        locationById: vi.fn(),
        propById: vi.fn(),
      }
    } as any);

    const mockPromptService = {
      compilePreview: vi.fn().mockResolvedValue({
        compiled: 'a beautiful shot',
        negative: 'ugly',
        lockRefs: { characters: [], style: null, location: null, props: [] },
        lint: { ok: true, score: 100, issues: [], characterCount: 16 },
        shot: {},
      }),
    };

    return { mockProjectService, mockPromptService };
  };

  it('owned Shot succeeds, returned DTO remains serializable, no mutation behavior', async () => {
    const { mockProjectService, mockPromptService } = setupMocks(
      { id: 'project-A', slug: 'proj-A-slug' },
      {
        id: 'shot-A',
        sceneId: 'scene-A',
        code: 'SH001',
        characters: [],
        locationId: null,
        props: [],
        shotSize: 'Medium',
        cameraAngle: 'Eye Level',
        cameraMovement: { speed: 'slow', type: 'pan' },
        lens: '50mm',
        durationSeconds: 5,
        aspectRatio: '16:9',
        description: 'Test',
        dialogue: '',
        lighting: 'Natural',
        emotion: 'Happy'
      },
      { id: 'scene-A', episodeId: 'episode-A' },
      { id: 'episode-A', projectId: 'project-A' }
    );

    const { createProjectService } = await import('@/application/services/projectService');
    const { createPromptService } = await import('@/application/services/promptService');
    vi.mocked(createProjectService).mockReturnValue(mockProjectService as any);
    vi.mocked(createPromptService).mockReturnValue(mockPromptService as any);

    const result = await inspectShotPromptAction('proj-A-slug', 'shot-A');

    expect(result.ok).toBe(true);
    expect(mockPromptService.compilePreview).toHaveBeenCalledWith('shot-A', 'image');
    expect(mockPromptService.compilePreview).toHaveBeenCalledWith('shot-A', 'video');

    expect(result).toHaveProperty('data');
    expect(result.data).not.toHaveProperty('shot');
    expect(result.data?.imageData).toEqual({
      compiled: 'a beautiful shot',
      negative: 'ugly',
      lockRefs: { characters: [], style: null, location: null, props: [] },
      lint: { ok: true, score: 100, issues: [], characterCount: 16 },
      version: 0,
      createdAt: expect.any(String),
    });
  });

  it('cross-project Shot is rejected and compilePreview is NOT called', async () => {
    const { mockProjectService, mockPromptService } = setupMocks(
      { id: 'project-A', slug: 'proj-A-slug' },
      { id: 'shot-B', sceneId: 'scene-B', characters: [], props: [] },
      { id: 'scene-B', episodeId: 'episode-B' },
      { id: 'episode-B', projectId: 'project-B' } // Belongs to Project B
    );

    const { createProjectService } = await import('@/application/services/projectService');
    const { createPromptService } = await import('@/application/services/promptService');
    vi.mocked(createProjectService).mockReturnValue(mockProjectService as any);
    vi.mocked(createPromptService).mockReturnValue(mockPromptService as any);

    const result = await inspectShotPromptAction('proj-A-slug', 'shot-B');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('SHOT_PROJECT_MISMATCH');
    expect(mockPromptService.compilePreview).not.toHaveBeenCalled();
  });

  it('nonexistent Shot rejected', async () => {
    const { mockProjectService, mockPromptService } = setupMocks(
      { id: 'project-A', slug: 'proj-A-slug' },
      null, // No shot
      null,
      null
    );

    const { createProjectService } = await import('@/application/services/projectService');
    const { createPromptService } = await import('@/application/services/promptService');
    vi.mocked(createProjectService).mockReturnValue(mockProjectService as any);
    vi.mocked(createPromptService).mockReturnValue(mockPromptService as any);

    const result = await inspectShotPromptAction('proj-A-slug', 'invalid-shot-id');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('SHOT_NOT_FOUND');
    expect(mockPromptService.compilePreview).not.toHaveBeenCalled();
  });

  it('nonexistent project rejected', async () => {
    const { mockProjectService, mockPromptService } = setupMocks(
      null, // No project
      { id: 'shot-A', sceneId: 'scene-A', characters: [], props: [] },
      { id: 'scene-A', episodeId: 'episode-A' },
      { id: 'episode-A', projectId: 'project-A' }
    );

    const { createProjectService } = await import('@/application/services/projectService');
    const { createPromptService } = await import('@/application/services/promptService');
    vi.mocked(createProjectService).mockReturnValue(mockProjectService as any);
    vi.mocked(createPromptService).mockReturnValue(mockPromptService as any);

    // Mock isDomainError to return true for DomainError
    vi.mock('@/domain/errors', async (importOriginal) => {
      const actual = await importOriginal() as any;
      return {
        ...actual,
        isDomainError: (e: any) => e instanceof Error && 'code' in e
      };
    });

    const result = await inspectShotPromptAction('invalid-slug', 'shot-A');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Project not found');
    expect(mockPromptService.compilePreview).not.toHaveBeenCalled();
  });
});
