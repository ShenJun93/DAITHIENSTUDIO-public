import { describe, expect, it } from 'vitest';
import type { Studio } from '@/application/ports';
import type { ApprovalRecord } from '@/application/records';
import { createVisualPackageApprovalService } from '@/application/services/visualPackageApprovalService';
import type { VisualControlState } from '@/domain/visualControl/types';

function state(fingerprint = 'fp-1'): VisualControlState {
  return {
    projectId: 'prj_1',
    projectSlug: 'demo',
    shotId: 'shot_1',
    shotCode: 'S001',
    visualSpec: {
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'static' },
      lens: '50mm',
      durationSeconds: 5,
      lighting: 'soft',
      importance: 'normal',
      dialogue: '',
      emotion: 'calm',
      continuityIn: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'front', damagedObjects: [] } },
      continuityOut: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'front', damagedObjects: [] } },
      intentionalChanges: [],
    },
    pinnedReferences: [
      { kind: 'character', refId: 'char_1', code: 'CHAR001', versionId: 'CHAR001_V1', source: 'shot-field', resolved: true, resolvableReason: null },
    ],
    approvedReferences: [
      { kind: 'character', refId: 'char_1', versionId: 'CHAR001_V1', approvedAssetIds: ['ast_1'], role: 'identity-anchor' },
    ],
    prompt: {
      image: { kind: 'image', promptId: 'prm_1', version: 1, compiled: 'hero', negative: '', lintOk: true, lintScore: 100, lockRefs: { characters: [], props: [], location: null, style: null } },
      video: { kind: 'video', promptId: null, version: null, compiled: null, negative: null, lintOk: null, lintScore: null, lockRefs: null },
    },
    assets: [
      { assetId: 'ast_1', kind: 'character', name: 'Hero anchor', approvalState: 'approved', boundRole: 'identity-anchor', isRequiredReference: true, contributesToReadiness: true },
    ],
    continuity: { previousShotCode: null, nextShotCode: null, findings: [], blockers: [], content: [], fingerprint: 'continuity-fp' },
    packageFingerprint: fingerprint,
  };
}

function harness(initial = state()) {
  const records: ApprovalRecord[] = [];
  let current = initial;
  let counter = 0;
  const approvals = {
    async record(projectId: string, input: Parameters<Studio['approvals']['record']>[1]) {
      const record: ApprovalRecord = {
        id: `apr_${++counter}`,
        projectId,
        targetType: input.targetType,
        targetId: input.targetId,
        decision: input.decision,
        note: input.note,
        decidedBy: input.decidedBy,
        createdAt: `2026-08-11T00:00:0${counter}.000Z`,
      };
      records.push(record);
      return record;
    },
    async listForTarget(projectId: string, targetType: string, targetId: string) {
      return records.filter((record) => record.projectId === projectId && record.targetType === targetType && record.targetId === targetId);
    },
  };
  const studio = { approvals } as unknown as Studio;
  const service = createVisualPackageApprovalService(studio, async () => current);
  return { service, records, setCurrent: (next: VisualControlState) => { current = next; } };
}

describe('VC8 immutable visual package approval', () => {
  it('a shot with a blocked/violating continuity finding cannot be approved', async () => {
    const blocked = state();
    blocked.continuity.blockers = [{
      rule: 'costume-continuity',
      classification: 'continuity-violation',
      severity: 'error',
      field: 'character.costume',
      expected: 'blue',
      actual: 'red',
      message: 'Costume changed without transition.',
      sceneCode: 'SC001',
      shotCodes: ['S001'],
    }];
    const h = harness(blocked);
    await expect(
      h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'approved', '', 'usr_1'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(h.records).toHaveLength(0);

    await h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'changes-requested', 'fix continuity', 'usr_1');
    expect(h.records).toHaveLength(1);
  });

  it('a shot with an unapproved reference cannot be approved', async () => {
    const blocked = state();
    blocked.approvedReferences = [];
    const h = harness(blocked);
    await expect(
      h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'approved', '', 'usr_1'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(h.records).toHaveLength(0);
  });

  it('changing a shot field invalidates the approval', async () => {
    const h = harness();
    await h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'approved', 'original shot', 'usr_1');

    const changed = state('fp-shot-field-changed');
    changed.visualSpec = { ...changed.visualSpec, shotSize: 'close' };
    h.setCurrent(changed);

    const review = await h.service.reviewForShot('prj_1', 'shot_1');
    expect(review.currentApproved).toBe(false);
    expect(review.invalidated).toBe(true);
    expect(review.latestApproved?.packageFingerprint).toBe('fp-1');
  });

  it('changing bible versions invalidates the approval', async () => {
    const h = harness();
    await h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'approved', 'v1', 'usr_1');

    const changed = state('fp-bible-v2');
    changed.pinnedReferences = changed.pinnedReferences.map((pin) => ({ ...pin, versionId: 'CHAR001_V2' }));
    changed.approvedReferences = changed.approvedReferences.map((reference) => ({ ...reference, versionId: 'CHAR001_V2' }));
    h.setCurrent(changed);

    const review = await h.service.reviewForShot('prj_1', 'shot_1');
    expect(review.currentApproved).toBe(false);
    expect(review.invalidated).toBe(true);
  });

  it('approving a new snapshot invalidates approval', async () => {
    const h = harness();
    await h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'approved', 'anchor v1', 'usr_1');

    const changed = state('fp-new-approved-snapshot');
    changed.approvedReferences = changed.approvedReferences.map((reference) => ({
      ...reference,
      approvedAssetIds: [...reference.approvedAssetIds, 'ast_2'],
    }));
    changed.assets = [
      ...changed.assets,
      { assetId: 'ast_2', kind: 'character', name: 'Hero anchor v2', approvalState: 'approved', boundRole: 'identity-anchor', isRequiredReference: true, contributesToReadiness: true },
    ];
    h.setCurrent(changed);

    const review = await h.service.reviewForShot('prj_1', 'shot_1');
    expect(review.currentApproved).toBe(false);
    expect(review.invalidated).toBe(true);
  });

  it('approval is append-only (superseded by new approval, never deleted)', async () => {
    const h = harness();
    await h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'approved', 'first', 'usr_1');

    const changed = state('fp-2');
    changed.visualSpec = { ...changed.visualSpec, shotSize: 'close' };
    h.setCurrent(changed);
    await h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-2', 'approved', 'supersedes prior', 'usr_1');

    const review = await h.service.reviewForShot('prj_1', 'shot_1');
    expect(review.history).toHaveLength(2);
    expect(h.records).toHaveLength(2);
    expect(review.latestApproved?.packageFingerprint).toBe('fp-2');
    expect(review.currentApproved).toBe(true);
  });

  it('operator can see locked immutable approved package', async () => {
    const h = harness();
    await h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-1', 'approved', 'locked', 'usr_1');

    const changed = state('fp-2');
    changed.visualSpec = { ...changed.visualSpec, shotSize: 'close' };
    h.setCurrent(changed);

    const review = await h.service.reviewForShot('prj_1', 'shot_1');
    expect(review.latestApproved?.packageFingerprint).toBe('fp-1');
    expect(review.latestApproved?.package.visualSpec.shotSize).toBe('medium');
    expect(review.currentFingerprint).toBe('fp-2');
  });

  it('rejects a stale expected fingerprint', async () => {
    const h = harness(state('fp-current'));
    await expect(
      h.service.decideCurrentPackage('prj_1', 'shot_1', 'fp-stale', 'approved', '', 'usr_1'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(h.records).toHaveLength(0);
  });
});
