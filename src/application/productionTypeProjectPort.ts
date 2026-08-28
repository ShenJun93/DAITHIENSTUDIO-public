import type { ProjectRepository } from './ports';
import type { ProjectRecord } from './records';
import type { ProductionType } from '@/domain/enums';
import type {
  CreateProjectWithProductionTypeInput,
  UpdateProjectWithProductionTypeInput,
} from '@/domain/productionTypeIdentity';

export type ProductionTypeProjectRecord = ProjectRecord & {
  productionType: ProductionType | null;
};

/**
 * Narrow bridge port for the explicit production-type identity. The wider
 * Studio contract stays unchanged until a separately authorized consolidation;
 * consumers that need identity opt into this stronger contract explicitly.
 */
export interface ProductionTypeProjectRepository extends Omit<
  ProjectRepository,
  'create' | 'update' | 'byId' | 'bySlug' | 'list'
> {
  create(
    input: CreateProjectWithProductionTypeInput & {
      workspaceId: string;
      ownerId: string;
      slug: string;
    },
  ): Promise<ProductionTypeProjectRecord>;
  update(id: string, patch: UpdateProjectWithProductionTypeInput): Promise<ProductionTypeProjectRecord>;
  byId(id: string): Promise<ProductionTypeProjectRecord | null>;
  bySlug(slug: string): Promise<ProductionTypeProjectRecord | null>;
  list(options?: { limit?: number; offset?: number; includeDeleted?: boolean }): Promise<ProductionTypeProjectRecord[]>;
}

export function asProductionTypeProjectRepository(repository: ProjectRepository): ProductionTypeProjectRepository {
  return repository as ProductionTypeProjectRepository;
}
