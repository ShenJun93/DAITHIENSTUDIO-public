import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/route';
import { createProjectAction } from '@/app/actions';
import * as projectServiceMod from '@/application/services/projectService';
import * as assignmentServiceMod from '@/application/services/productionTypeAssignmentService';
import type { Studio } from '@/application/ports';

// A minimal studio mock
function createTestStudio(): Studio {
  return {
    projects: {
      create: vi.fn(),
      update: vi.fn(),
      byId: vi.fn(),
      bySlug: vi.fn(),
    },
    activity: {
      log: vi.fn(),
    }
  } as unknown as Studio;
}

const studio = createTestStudio();

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/app/api/_lib/handler', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getContext: vi.fn(() => ({ studio })),
    requireApiKey: vi.fn(),
  };
});

vi.mock('@/app/_lib/actionAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/_lib/actionAuth')>();
  return {
    ...actual,
    getAuthorizedActionStudio: vi.fn(() => Promise.resolve(studio)),
  };
});

vi.mock('@/application/services/projectService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/application/services/projectService')>();
  return {
    ...actual,
    createProjectService: vi.fn(() => ({
      create: vi.fn().mockResolvedValue({ id: 'proj-1', slug: 'proj-1' }),
      update: vi.fn(),
      get: vi.fn(),
    })),
  };
});

vi.mock('@/application/services/productionTypeAssignmentService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/application/services/productionTypeAssignmentService')>();
  return {
    ...actual,
    createProductionTypeAssignmentService: vi.fn(() => ({
      change: vi.fn(),
      inspect: vi.fn(),
    })),
  };
});

describe('Project Production Type Routes', () => {
  let createSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    createSpy = vi.fn().mockResolvedValue({ id: 'proj-1', slug: 'proj-1' });
    vi.mocked(projectServiceMod.createProjectService).mockReturnValue({
      create: createSpy,
      update: vi.fn(),
      get: vi.fn(),
    } as any);
  });

  describe('Cycle A — POST /api/projects', () => {
    async function post(body: any) {
      const req = new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await POST(req as any);
    }

    it('A1 — rejects missing Production Type', async () => {
      const res = await post({ title: 'Test', format: 'short-film' });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_FAILED');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('A2 — rejects null Production Type', async () => {
      const res = await post({ title: 'Test', format: 'short-film', productionType: null });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_FAILED');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('A3 — rejects invalid Production Type', async () => {
      const res = await post({ title: 'Test', format: 'short-film', productionType: 'feature-film' });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_FAILED');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('A4 — accepts all accepted Production Types', async () => {
      const res = await post({ title: 'Test', format: 'short-film', productionType: 'cinematic-short-film' });
      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        productionType: 'cinematic-short-film'
      }));
    });

    it('A5 — Project.format remains independent', async () => {
      const res = await post({ title: 'Test', format: 'motion-comic', productionType: 'cinematic-short-film' });
      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        format: 'motion-comic',
        productionType: 'cinematic-short-film'
      }));
    });
  });

  describe('Cycle A — createProjectAction', () => {
    it('A6 — createProjectAction requires Production Type', async () => {
      // 1. Missing
      let fd = new FormData();
      fd.append('title', 'Test');
      fd.append('format', 'short-film');
      let result = await createProjectAction(fd);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(createSpy).not.toHaveBeenCalled();

      // 2. Invalid
      fd.set('productionType', 'feature-film');
      result = await createProjectAction(fd);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(createSpy).not.toHaveBeenCalled();

      // 3. Valid
      fd.set('productionType', 'animated-series');
      result = await createProjectAction(fd);
      expect(result.ok).toBe(true);
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        productionType: 'animated-series'
      }));
    });
  describe('Cycle B — PATCH /api/projects/[slug]/production-type', () => {
    let changeSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      changeSpy = vi.fn().mockResolvedValue({
        status: 'UPDATED',
        project: { id: 'proj-1', productionType: 'cinematic-short-film' },
        evidence: []
      });
      vi.mocked(assignmentServiceMod.createProductionTypeAssignmentService).mockReturnValue({
        change: changeSpy,
        inspect: vi.fn(),
      } as any);
    });

    async function patch(slug: string, body: any) {
      const { PATCH } = await import('@/app/api/projects/[slug]/production-type/route');
      const req = new Request(`http://localhost/api/projects/${slug}/production-type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await PATCH(req as any, { params: Promise.resolve({ slug }) } as any);
    }

    it('B1 — missing/wrong key => rejected', async () => {
      const handler = await import('@/app/api/_lib/handler');
      vi.mocked(handler.requireApiKey).mockImplementationOnce(() => {
        throw new Error('API key required');
      });
      const res = await patch('proj-1', { productionType: 'animated-series' });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error.code).toBe('INTERNAL');
    });

    it('B2 — invalid target rejected', async () => {
      const res = await patch('proj-1', { productionType: 'invalid-target' });
      expect(res.status).toBe(400);
      expect(changeSpy).not.toHaveBeenCalled();
    });

    it('B3 — no-data change -> UPDATED', async () => {
      const res = await patch('proj-1', { productionType: 'animated-series' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe('UPDATED');
      expect(changeSpy).toHaveBeenCalledWith('proj-1', expect.objectContaining({ productionType: 'animated-series' }));
    });

    it('B4 — production evidence + no confirmation', async () => {
      changeSpy.mockResolvedValueOnce({
        status: 'CONFIRMATION_REQUIRED',
        project: { id: 'proj-1' },
        evidence: ['script']
      });
      const res = await patch('proj-1', { productionType: 'animated-series' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe('CONFIRMATION_REQUIRED');
      expect(data.data.evidence).toContain('script');
    });

    it('B5 — production evidence + confirmation -> UPDATED', async () => {
      const res = await patch('proj-1', { productionType: 'animated-series', confirmExistingProductionData: true });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe('UPDATED');
      expect(changeSpy).toHaveBeenCalledWith('proj-1', expect.objectContaining({ productionType: 'animated-series', confirmExistingProductionData: true }));
    });

    it('B6 — clear behavior', async () => {
      const res = await patch('proj-1', { productionType: null });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe('UPDATED');
      expect(changeSpy).toHaveBeenCalledWith('proj-1', expect.objectContaining({ productionType: null }));
    });

    it('B7 — endpoint delegates to createProductionTypeAssignmentService', async () => {
      await patch('proj-1', { productionType: 'animated-series' });
      expect(changeSpy).toHaveBeenCalled();
    });
  });

  describe('Cycle B — changeProjectProductionTypeAction', () => {
    let changeSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
      changeSpy = vi.fn().mockResolvedValue({
        status: 'UPDATED',
        project: { id: 'proj-1', productionType: 'cinematic-short-film' },
        evidence: []
      });
      vi.mocked(assignmentServiceMod.createProductionTypeAssignmentService).mockReturnValue({
        change: changeSpy,
        inspect: vi.fn(),
      } as any);
    });

    it('SERVER_ACTION_REASSIGNMENT delegating properly', async () => {
      const { changeProjectProductionTypeAction } = await import('@/app/actions');
      const res = await changeProjectProductionTypeAction('proj-1', { productionType: 'animated-series' });
      expect(res.ok).toBe(true);
      expect((res as any).status).toBe('UPDATED');
      expect(changeSpy).toHaveBeenCalledWith('proj-1', expect.objectContaining({ productionType: 'animated-series' }));
    });
  });
});});
