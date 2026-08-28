import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createProductionTypeAssignmentService } from '@/application/services/productionTypeAssignmentService';
import { createProjectService } from '@/application/services/projectService';
import type { Studio } from '@/application/ports';
import { ProductionType } from '@/domain/enums';

function createMockStudio(): Studio {
  return {
    projects: {
      byId: vi.fn(),
      update: vi.fn(),
    },
    episodes: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    scripts: {
      current: vi.fn().mockResolvedValue(null),
    },
    scenes: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    shots: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    prompts: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    generations: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    assets: {
      list: vi.fn().mockResolvedValue([]),
    },
    workflows: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    timelines: {
      listByEpisode: vi.fn().mockResolvedValue([]),
    },
    exports: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    publishes: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    nodeGraphs: {
      listByProject: vi.fn().mockResolvedValue([]),
    },
    activity: {
      log: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Studio;
}

describe('ProductionTypeAssignmentService', () => {
  let studio: Studio;
  let service: ReturnType<typeof createProductionTypeAssignmentService>;

  beforeEach(() => {
    studio = createMockStudio();
    service = createProductionTypeAssignmentService(studio);
    
    // We mock projectService so we don't have to stub everything for createProjectService
    // Actually, createProjectService(studio).get() calls studio.projects.byId() or studio.projects.bySlug()
    vi.mocked(studio.projects.byId).mockResolvedValue({
      id: 'proj-1',
      productionType: 'cinematic-short-film' as ProductionType,
      format: 'short-film',
    } as any);
  });

  it('A. Fresh bootstrap project is NOT production evidence', async () => {
    // Has a default episode and empty seeded script
    vi.mocked(studio.episodes.listByProject).mockResolvedValue([{ id: 'ep-1' }] as any);
    vi.mocked(studio.scripts.current).mockResolvedValue({ raw: '', parsedAt: null } as any);

    const result = await service.inspect('proj-1');

    expect(result.hasProductionData).toBe(false);
    expect(result.evidence).toEqual([]);
    expect(result.currentProductionType).toBe('cinematic-short-film');
  });

  it('B. Script evidence (non-empty raw)', async () => {
    vi.mocked(studio.scripts.current).mockResolvedValue({ raw: 'some text', parsedAt: null } as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('script');
    expect(result.hasProductionData).toBe(true);
  });

  it('B. Script evidence (meaningful parsed)', async () => {
    vi.mocked(studio.scripts.current).mockResolvedValue({ raw: '', parsedAt: '2026-08-12T00:00:00Z' } as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('script');
    expect(result.hasProductionData).toBe(true);
  });

  it('C. Project-wide scene evidence', async () => {
    vi.mocked(studio.scenes.listByProject).mockResolvedValue([{ id: 'sc-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('scenes');
  });

  it('C. Project-wide shot evidence', async () => {
    vi.mocked(studio.shots.listByProject).mockResolvedValue([{ id: 'sh-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('shots');
  });

  it('D. Prompt evidence', async () => {
    vi.mocked(studio.prompts.listByProject).mockResolvedValue([{ id: 'pr-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('prompts');
  });

  it('E. Generation evidence', async () => {
    vi.mocked(studio.generations.listByProject).mockResolvedValue([{ id: 'gen-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('generations');
  });

  it('E. Asset evidence', async () => {
    vi.mocked(studio.assets.list).mockResolvedValue([{ id: 'asset-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('assets');
  });

  it('F. Workflow-run evidence', async () => {
    vi.mocked(studio.workflows.listByProject).mockResolvedValue([{ id: 'wf-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('workflows');
  });

  it('G. Timeline must be PROJECT-WIDE', async () => {
    // 2 episodes. The timeline is only in ep-2 (non-primary).
    vi.mocked(studio.episodes.listByProject).mockResolvedValue([
      { id: 'ep-1' },
      { id: 'ep-2' }
    ] as any);
    vi.mocked(studio.timelines.listByEpisode).mockImplementation(async (proj, epId) => {
      if (epId === 'ep-2') return [{ id: 'tl-1' }] as any;
      return [];
    });

    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('timelines');
  });

  it('H. Export evidence', async () => {
    vi.mocked(studio.exports.listByProject).mockResolvedValue([{ id: 'exp-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('exports');
  });

  it('H. Publish evidence', async () => {
    vi.mocked(studio.publishes.listByProject).mockResolvedValue([{ id: 'pub-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('publishes');
  });

  it('H. Node graph evidence', async () => {
    vi.mocked(studio.nodeGraphs.listByProject).mockResolvedValue([{ id: 'ng-1' }] as any);
    const result = await service.inspect('proj-1');
    expect(result.evidence).toContain('node-graphs');
  });
  describe('change() policy - Cycle A', () => {
    beforeEach(() => {
      vi.mocked(studio.projects.update).mockResolvedValue({ id: 'proj-1', productionType: 'cinematic-short-film', format: 'short-film' } as any);
    });

    it('A1 — NO_CHANGE', async () => {
      const result = await service.change('proj-1', { productionType: 'cinematic-short-film' });
      expect(result.status).toBe('NO_CHANGE');
      expect(studio.projects.update).not.toHaveBeenCalled();
    });

    it('A2 — production data + no confirmation', async () => {
      vi.mocked(studio.scripts.current).mockResolvedValue({ raw: 'data', parsedAt: null } as any);
      const result = await service.change('proj-1', { productionType: 'motion-comic' });
      expect(result.status).toBe('CONFIRMATION_REQUIRED');
      if (result.status === 'CONFIRMATION_REQUIRED') {
        expect(result.evidence).toContain('script');
      }
      expect(studio.projects.update).not.toHaveBeenCalled();
    });

    it('A3 — clearing with production data also requires confirmation', async () => {
      vi.mocked(studio.scripts.current).mockResolvedValue({ raw: 'data', parsedAt: null } as any);
      const result = await service.change('proj-1', { productionType: null });
      expect(result.status).toBe('CONFIRMATION_REQUIRED');
      expect(studio.projects.update).not.toHaveBeenCalled();
    });
  });
  describe('change() policy - Cycle B', () => {
    let updateSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      updateSpy = vi.fn().mockImplementation(async (id, patch) => {
        return { id, productionType: patch.productionType, format: 'motion-comic' };
      });
      studio.projects.update = updateSpy;
      
      vi.mocked(studio.projects.byId).mockResolvedValue({
        id: 'proj-1',
        productionType: 'cinematic-short-film' as ProductionType,
        format: 'motion-comic',
      } as any);
      vi.mocked(studio.scripts.current).mockResolvedValue(null);
    });

    it('B1 — no production evidence -> UPDATED', async () => {
      const result = await service.change('proj-1', { productionType: 'animated-series' });
      expect(result.status).toBe('UPDATED');
      expect(updateSpy).toHaveBeenCalledWith('proj-1', { productionType: 'animated-series' });
    });

    it('B2 — confirmed change with production evidence -> UPDATED', async () => {
      vi.mocked(studio.scripts.current).mockResolvedValue({ raw: 'data', parsedAt: null } as any);
      const result = await service.change('proj-1', {
        productionType: 'animated-series',
        confirmExistingProductionData: true
      });
      expect(result.status).toBe('UPDATED');
      expect(updateSpy).toHaveBeenCalledWith('proj-1', { productionType: 'animated-series' });
    });

    it('B3 — confirmed clear -> UPDATED', async () => {
      vi.mocked(studio.scripts.current).mockResolvedValue({ raw: 'data', parsedAt: null } as any);
      const result = await service.change('proj-1', {
        productionType: null,
        confirmExistingProductionData: true
      });
      expect(result.status).toBe('UPDATED');
      expect(updateSpy).toHaveBeenCalledWith('proj-1', { productionType: null });
    });

    it('B4 — Project.format independence', async () => {
      const result = await service.change('proj-1', { productionType: 'animated-series' });
      expect(updateSpy).toHaveBeenCalledWith('proj-1', { productionType: 'animated-series' });
      if (result.status === 'UPDATED') {
        expect(result.project.format).toBe('motion-comic');
      }
    });

    it('B5 — production records survive', async () => {
      vi.mocked(studio.scripts.current).mockResolvedValue({ raw: 'data', parsedAt: null } as any);
      await service.change('proj-1', {
        productionType: 'animated-series',
        confirmExistingProductionData: true
      });
      expect(updateSpy).toHaveBeenCalledWith('proj-1', { productionType: 'animated-series' });
    });

    it('B6 — invalid Production Type rejected server/application-side', async () => {
      await expect(service.change('proj-1', { productionType: 'invalid-type' as any }))
        .rejects.toThrow();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});

