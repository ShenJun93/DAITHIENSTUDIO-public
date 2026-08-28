/**
 * Deterministic local-only fixture for TASK-DAITHIEN-M1-M3-BROWSER-EVIDENCE-001.
 *
 * Creates three independent projects:
 * 1) legacy/null Production Type project for M1 set/clear evidence;
 * 2) evidence-rich project for M1 confirmation-gated reassignment evidence;
 * 3) motion-comic project with parsed scenes/shots/image prompts for M2/M3.
 *
 * This fixture never starts a worker and never executes a provider.
 */
import { createProjectService } from '../../src/application/services/projectService';
import { createScriptService } from '../../src/application/services/scriptService';
import { createBibleService } from '../../src/application/services/bibleService';
import { createPromptService } from '../../src/application/services/promptService';
import { getStudio } from '../../src/infrastructure/container';

const EVIDENCE_SCRIPT = `CẢNH 1 - HANG ĐỘNG - ĐÊM

Tinh thể xanh lam phát sáng. Triệu Ngốc ngồi trên bệ thiền và mở mắt.

TRIỆU NGỐC: Lần này ta sẽ làm được.

LƯ SƯ MUỘI: Muội đang ghi lại.

CẢNH 2 - SÂN LUYỆN - SÁNG

Triệu Ngốc rút mộc kiếm và bước vào sân luyện.

TRIỆU NGỐC: Bắt đầu thôi.
`;

async function main() {
  const studio = getStudio();
  const projectService = createProjectService(studio);
  const scriptService = createScriptService(studio);
  const bibleService = createBibleService(studio);
  const promptService = createPromptService(studio);

  const legacyProject = await projectService.create({
    title: 'M1 Legacy Production Type Evidence',
    description: 'Legacy/null Production Type browser evidence project',
    format: 'series',
    platform: 'internal',
  });

  const reassignmentProject = await projectService.create({
    title: 'M1 Reassignment Evidence Project',
    description: 'Meaningful production evidence for confirmation-gated reassignment',
    format: 'series',
    platform: 'internal',
    productionType: 'motion-comic',
  });
  await scriptService.saveScript(reassignmentProject.id, {
    title: 'M1 Reassignment Evidence Script',
    scriptType: 'motion-comic',
    raw: EVIDENCE_SCRIPT,
  });

  const bridgeProject = await projectService.create({
    title: 'M2-M3 Browser Evidence Project',
    description: 'Deterministic Journey and Safe Image bridge browser evidence project',
    genre: 'Test',
    format: 'series',
    targetAudience: 'Test audience',
    platform: 'internal',
    language: 'vi-VN',
    durationTargetSeconds: 300,
    aspectRatio: '16:9',
    secondaryAspectRatios: ['9:16'],
    frameRate: 24,
    resolution: '1920x1080',
    stylePresetKey: 'stylized-3d-cinematic-comedy',
    costLimitUsd: 25,
    productionType: 'motion-comic',
    creativeBrief: {
      logline: 'Browser evidence bridge project',
      theme: 'Evidence',
      tone: 'Neutral',
      hook: 'Ready production intent',
      cliffhanger: 'Pending generation only',
    },
  });

  await bibleService.addStyleFromPreset(bridgeProject.id, 'manhwa-fantasy-2-5d');
  await scriptService.saveScript(bridgeProject.id, {
    title: 'M2-M3 Evidence Script',
    scriptType: 'motion-comic',
    raw: EVIDENCE_SCRIPT,
  });
  await scriptService.parseIntoScenes(bridgeProject.id, { replaceExisting: true });
  await scriptService.buildShots(bridgeProject.id);
  await promptService.buildMissing(bridgeProject.id, 'image');

  const shots = await studio.shots.listByProject(bridgeProject.id);
  const firstShot = shots[0];
  if (!firstShot) throw new Error('M2-M3 fixture did not create a shot');

  console.log(`M1_LEGACY_SLUG=${legacyProject.slug}`);
  console.log(`M1_REASSIGN_SLUG=${reassignmentProject.slug}`);
  console.log(`M1_REASSIGN_FORMAT=${reassignmentProject.format}`);
  console.log(`M2M3_SLUG=${bridgeProject.slug}`);
  console.log(`M2M3_SHOT_CODE=${firstShot.code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
