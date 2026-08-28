/**
 * Narrow aliases used by the mappers.
 *
 * A `text` column can technically hold anything, so mapping a row to a record
 * needs a decision about trust. For *closed vocabularies that the writer always
 * validates* (job status, asset kind, …) the value is asserted through these
 * aliases; anything the user can type freely is parsed with Zod instead. Keeping
 * the assertions in one named place makes the trust boundary reviewable rather
 * than scattering `as` across the mappers.
 */
import type {
  ApprovalDecisions,
  AssetKind,
  ExportKind,
  GenerationKind,
  GenerationStatus,
  ShotStatus,
  WorkflowKey,
} from '@/domain/enums';

export type ShotStatusLike = ShotStatus;
export type GenerationKindLike = GenerationKind;
export type GenerationStatusLike = GenerationStatus;
export type AssetKindLike = AssetKind;
export type WorkflowKeyLike = WorkflowKey;
export type ExportKindLike = ExportKind;
export type ApprovalDecisionLike = ApprovalDecisions;
