/**
 * Seed — builds the "Triệu Ngốc" demo project end to end.
 *
 * This is deliberately the *whole* pipeline, not a pile of rows: script →
 * scenes → shots → prompts (with locks) → mock generations → assets →
 * quality → approvals → timeline → export package. A repository where this
 * script passes is a repository where the product demonstrably works.
 *
 * Idempotent: re-running skips an existing demo project unless --force.
 */
import { createProjectService } from '@/application/services/projectService';
import { createScriptService } from '@/application/services/scriptService';
import { createBibleService } from '@/application/services/bibleService';
import { createPromptService } from '@/application/services/promptService';
import { createGenerationService } from '@/application/services/generationService';
import { createAssetService } from '@/application/services/assetService';
import { createQualityService } from '@/application/services/qualityService';
import { createTimelineService } from '@/application/services/timelineService';
import { createExportService } from '@/application/services/exportService';
import { createWorkflowService } from '@/application/services/workflowService';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import { getStudio } from '../container';
import { createWorker } from '../queue/worker';
import { runMigrations } from './migrate';

export const DEMO_SLUG = 'trieu-ngoc-tap-thu-nghiem';

const DEMO_SCRIPT = `CẢNH 1 - HANG ĐỘNG TU TIÊN PHÁT SÁNG - ĐÊM

Tinh thể xanh lam mọc dọc vách hang, hắt sáng lên một bệ thiền nứt nẻ. Màn che rách phất phơ. Triệu Ngốc ngồi khoanh chân, mắt nhắm nghiền, cố gắng nhập định lần thứ bốn mươi hai trong đêm. Một con dơi bay ngang, đậu lên đầu hắn.

TRIỆU NGỐC (bực bội): Ta là thiên tài tu tiên. Ta chỉ cần thêm ba giây nữa thôi.

Lư Sư Muội bước vào, tay cầm một quyển sổ ghi chép mỏng, mặt không biểu cảm.

LƯ SƯ MUỘI: Sư huynh, đêm nay là lần thứ bốn mươi hai. Muội đã ghi hết vào sổ.

TRIỆU NGỐC: Đừng ghi nữa! Sổ đó sau này là quốc bảo đấy.

CẢNH 2 - SÂN LUYỆN VÕ TRƯỚC HANG - SÁNG

Sương còn đọng trên phiến đá. Triệu Ngốc rút thanh mộc kiếm cũ ra khỏi vỏ, tay hơi run. Hắn hít một hơi thật sâu rồi vung kiếm. Thanh kiếm bay khỏi tay, cắm xuống đất cách đó ba bước.

LƯ SƯ MUỘI (bình thản): Muội ghi là "kiếm tự bay ra khỏi tay lần thứ mười một".

TRIỆU NGỐC: Đó là chiêu thức. Chiêu "Phi Kiếm Vô Tình". Ta cố ý.

CẢNH 3 - HANG ĐỘNG TU TIÊN PHÁT SÁNG - ĐÊM

Triệu Ngốc ngồi lại bệ thiền, lần này quyển sổ của Lư Sư Muội đặt bên cạnh. Hắn mở sổ ra, đọc từng dòng thất bại của chính mình, rồi bật cười. Tinh thể trên vách bỗng sáng lên một nhịp, đáp lại tiếng cười đó.

TRIỆU NGỐC (nhẹ nhàng): Bốn mươi hai lần. Vậy lần thứ bốn mươi ba thì sao.

LƯ SƯ MUỘI: Muội vẫn còn giấy.
`;

interface SeedOptions {
  force: boolean;
  verbose: boolean;
}

export interface SeedReport {
  projectId: string;
  slug: string;
  scenes: number;
  shots: number;
  characters: number;
  locations: number;
  props: number;
  styles: number;
  prompts: number;
  generations: number;
  assets: number;
  approvedAssets: number;
  qualityReports: number;
  workflowRuns: number;
  exportId: string;
  timelineItems: number;
  skipped: boolean;
}

export async function seed(options: SeedOptions = { force: false, verbose: true }): Promise<SeedReport> {
  const studio = getStudio();
  const log = (message: string): void => {
    if (options.verbose) console.log(message);
  };

  const projectService = createProjectService(studio);
  const scriptService = createScriptService(studio);
  const bibleService = createBibleService(studio);
  const promptService = createPromptService(studio);
  const generationService = createGenerationService(studio);
  const assetService = createAssetService(studio);
  const qualityService = createQualityService(studio);
  const timelineService = createTimelineService(studio);
  const exportService = createExportService(studio);
  const workflowService = createWorkflowService(studio);

  const existing = await studio.projects.bySlug(DEMO_SLUG);
  if (existing && !options.force) {
    log(`[seed] demo project already exists (${existing.slug}); pass --force to rebuild it.`);
    const shots = await studio.shots.listByProject(existing.id);
    const assets = await studio.assets.list(existing.id, { limit: 500 });
    const exportsList = await studio.exports.listByProject(existing.id);
    return {
      projectId: existing.id,
      slug: existing.slug,
      scenes: (await studio.scenes.listByProject(existing.id)).length,
      shots: shots.length,
      characters: (await studio.bibles.listCharacters(existing.id)).length,
      locations: (await studio.bibles.listLocations(existing.id)).length,
      props: (await studio.bibles.listProps(existing.id)).length,
      styles: (await studio.bibles.listStyles(existing.id)).length,
      prompts: (await studio.prompts.listByProject(existing.id)).length,
      generations: (await studio.generations.listByProject(existing.id, { limit: 500 })).length,
      assets: assets.length,
      approvedAssets: assets.filter((asset) => asset.approvalState === 'approved').length,
      qualityReports: (await studio.quality.listByProject(existing.id)).length,
      workflowRuns: (await studio.workflows.listByProject(existing.id)).length,
      exportId: exportsList[0]?.id ?? '',
      timelineItems: (await studio.timelines.current(existing.id))?.items.length ?? 0,
      skipped: true,
    };
  }

  if (existing && options.force) {
    log('[seed] --force: soft-deleting the previous demo project');
    await studio.projects.softDelete(existing.id);
  }

  // --- 1. Project -----------------------------------------------------------
  log('[seed] 1/10 creating project');
  const project = await projectService.create({
    title: 'Triệu Ngốc — Tập Thử Nghiệm',
    description:
      'Một gã tu tiên thất bại bốn mươi hai lần trong một đêm, và cô sư muội ghi chép lại tất cả. Hài, ấm, hơi châm biếm.',
    genre: 'Hài, tiên hiệp, xuyên không',
    format: 'series',
    targetAudience: 'Khán giả YouTube 18–34 thích truyện tiên hiệp hài',
    platform: 'youtube',
    language: 'vi-VN',
    durationTargetSeconds: 300,
    aspectRatio: '16:9',
    secondaryAspectRatios: ['9:16'],
    frameRate: 24,
    resolution: '1920x1080',
    stylePresetKey: 'stylized-3d-cinematic-comedy',
    costLimitUsd: 25,
    creativeBrief: {
      logline:
        'Một kẻ tu tiên vô vọng quyết định thất bại lần thứ bốn mươi ba, và phát hiện ra rằng chính sự kiên trì mới là pháp môn.',
      theme: 'Kiên trì trước thất bại',
      tone: 'Hài, ấm áp, hơi châm biếm',
      hook: 'Đêm nay là lần thứ bốn mươi hai.',
      cliffhanger: 'Muội vẫn còn giấy.',
    },
  });

  // Add the 2.5D motion-comic style too, so the project shows a real Style Bible
  // with more than one entry (the vertical output uses it).
  await bibleService.addStyleFromPreset(project.id, 'manhwa-fantasy-2-5d');

  // --- 2. Script + scenes ---------------------------------------------------
  log('[seed] 2/10 saving and parsing the script');
  await scriptService.saveScript(project.id, {
    title: 'Triệu Ngốc — EP01',
    scriptType: 'motion-comic',
    raw: DEMO_SCRIPT,
  });
  const parsed = await scriptService.parseIntoScenes(project.id, { replaceExisting: true });
  log(`[seed]     ${parsed.scenes.length} scenes, ${parsed.createdCharacters.length} characters auto-created`);

  // --- 3. Flesh out the Character Bible ------------------------------------
  log('[seed] 3/10 writing the Character Bible');
  const characters = await bibleService.listCharacters(project.id);
  const trieuNgoc = characters.find((character) => character.name.toLowerCase().includes('triệu'));
  const luSuMuoi = characters.find((character) => character.name.toLowerCase().includes('lư'));

  if (trieuNgoc) {
    await bibleService.updateCharacter(trieuNgoc.id, {
      role: 'protagonist',
      identity: {
        ageRange: 'late 20s',
        species: 'human',
        genderPresentation: 'male',
        height: '175cm',
        bodyType: 'thin, slightly stooped',
        faceShape: 'long with a narrow jaw',
        skinTone: 'pale warm',
        hair: 'messy black, tied loosely, strands escaping',
        eyes: 'dark brown with pronounced under-eye shadows',
        distinguishingMarks: ['permanent dark circles', 'small ink stain on the left thumb'],
      },
      variable: {
        costume: 'faded green cultivator robe, frayed hem, rope belt',
        accessories: ['old wooden sword in a cracked scabbard'],
        personality: 'stubborn, self-mythologising, secretly kind',
        motivation: 'to prove that persistence is itself a cultivation method',
        weakness: 'cannot admit a failure out loud',
        comedyStyle: 'confident narration undercut by physical failure',
        movementStyle: 'over-committed gestures, poor balance',
        expressions: ['smug', 'panicked', 'quietly moved', 'defeated but grinning'],
        poses: ['cross-legged meditation', 'dramatic sword raise', 'slumped on the stone dais'],
        costumeVariants: [{ key: 'night', description: 'robe loosened, sleeves rolled up' }],
      },
      promptToken: 'Trieu Ngoc, the failing cultivator',
      negativePrompt:
        'muscular build, clean pressed robe, western fantasy armour, extra fingers, distorted face, changed hair colour',
      forbiddenChanges: ['under-eye shadows', 'faded green robe', 'thin build', 'messy tied hair'],
      colorPalette: ['#4F6B4A', '#C9B79C', '#2E2A26', '#8FB8C9'],
      status: 'approved',
    });
  }

  if (luSuMuoi) {
    await bibleService.updateCharacter(luSuMuoi.id, {
      role: 'deuteragonist',
      identity: {
        ageRange: 'early 20s',
        species: 'human',
        genderPresentation: 'female',
        height: '162cm',
        bodyType: 'compact, upright',
        faceShape: 'round with a small chin',
        skinTone: 'light neutral',
        hair: 'straight black in a tight low bun, blunt fringe',
        eyes: 'narrow, very steady',
        distinguishingMarks: ['ink smudge on the right sleeve'],
      },
      variable: {
        costume: 'pale grey disciple robe, dark blue sash, sleeve guards',
        accessories: ['thin record book', 'bamboo brush'],
        personality: 'deadpan, meticulous, quietly loyal',
        motivation: 'to record the truth, however unflattering',
        weakness: 'cannot lie, even kindly',
        comedyStyle: 'flat factual delivery against absurdity',
        movementStyle: 'economical, always facing her subject',
        expressions: ['neutral', 'faintly amused', 'concerned', 'writing while walking'],
        poses: ['standing with the book open', 'brush poised', 'half-turn to leave'],
        costumeVariants: [],
      },
      promptToken: 'Lu Su Muoi, the record keeper',
      negativePrompt: 'loose flowing hair, ornate jewellery, revealing costume, extra fingers, changed eye shape',
      forbiddenChanges: ['tight low bun', 'pale grey robe with dark blue sash', 'record book in hand'],
      colorPalette: ['#B8BCC2', '#2F3E5C', '#1C1C1C', '#E8E2D6'],
      status: 'approved',
    });
  }

  // --- 4. Location Bible ----------------------------------------------------
  log('[seed] 4/10 writing the Location Bible');
  const locations = await bibleService.listLocations(project.id);
  const cave = locations.find((location) => location.name.toLowerCase().includes('hang'));
  const yard = locations.find((location) => location.name.toLowerCase().includes('sân'));

  if (cave) {
    await bibleService.updateLocation(cave.id, {
      type: 'interior',
      era: 'mythic pre-industrial',
      details: {
        geography: 'a pocket cave halfway up a mist-wrapped mountain',
        architecture: 'natural rock, one carved stone dais, a rope-hung torn curtain',
        layout: 'single chamber, dais centre-left, entrance camera-right',
        entrances: ['narrow cleft, camera right'],
        exits: ['same cleft', 'a crack too small to pass'],
        lighting: 'blue crystal glow from the walls, no warm source',
        weather: 'still air, faint drip',
        timeVariations: ['night: crystals dominate', 'day: pale shaft from the cleft'],
        keyObjects: ['cracked meditation dais', 'blue crystal clusters', 'torn hanging curtain', 'oddly mundane clutter'],
        cameraPossibilities: ['wide from the cleft', 'low angle across the dais', 'insert on crystal pulse'],
        ambientSound: 'low resonance hum, single water drip, distant wind at the cleft',
      },
      promptBlock:
        'a glowing cultivation cave, blue crystal clusters growing from rough rock walls, a cracked stone meditation dais, a torn hanging curtain, cool rim light with no warm source, faint mist near the floor',
      negativePrompt: 'warm torchlight, modern materials, polished stone, crowded set dressing',
      colorPalette: ['#12233A', '#3E7CA6', '#8FB8C9', '#2A2622'],
      continuityNotes:
        'Crystals are the only light source at night. The dais crack runs front-left to back-right and never moves.',
      status: 'approved',
    });
  }

  if (yard) {
    await bibleService.updateLocation(yard.id, {
      type: 'exterior',
      era: 'mythic pre-industrial',
      details: {
        geography: 'a flat stone terrace on the slope outside the cave',
        architecture: 'fitted flagstones, a low broken wall, one weathered training post',
        layout: 'terrace centre, cave mouth camera-left, drop to the valley camera-right',
        entrances: ['cave mouth, camera left'],
        exits: ['stone steps down, camera right'],
        lighting: 'soft morning light from screen-left, long shadows',
        weather: 'dew, thin mist below the terrace',
        timeVariations: ['morning: mist in the valley'],
        keyObjects: ['weathered training post', 'broken low wall', 'dew on flagstones'],
        cameraPossibilities: ['wide from the cave mouth', 'medium across the terrace', 'insert on the fallen sword'],
        ambientSound: 'birdsong, wind over stone',
      },
      promptBlock:
        'a stone training terrace on a misty mountain slope, weathered flagstones with dew, a broken low wall, a single wooden training post, soft morning light from screen left',
      negativePrompt: 'lush garden, manicured lawn, modern railings, night lighting',
      colorPalette: ['#9DA98F', '#D9D2C2', '#4E5B4A', '#EDE7DA'],
      continuityNotes: 'Morning light always comes from screen-left. The valley drop is always camera-right.',
      status: 'approved',
    });
  }

  // --- 5. Prop Bible --------------------------------------------------------
  log('[seed] 5/10 writing the Prop Bible');
  const woodenSword = await bibleService.createProp(project.id, {
    name: 'Mộc kiếm cũ',
    description: 'A worn wooden practice sword in a cracked lacquer scabbard. Trieu Ngoc has never landed a strike with it.',
    ownerCharacterId: trieuNgoc?.id ?? null,
    details: {
      material: 'dark hardwood, chipped lacquer scabbard',
      dimensions: '95cm overall',
      color: 'faded brown with a dull red wrap',
      condition: 'worn, a hairline split near the tip',
      functionalBehavior: 'leaves the hand at the worst possible moment',
      storyImportance: 'the running joke, and the thing he never abandons',
    },
    promptToken: 'the old wooden practice sword with a chipped lacquer scabbard',
    continuityConstraints: [
      'the hairline split near the tip is always present',
      'the red hand wrap never changes colour',
    ],
    status: 'approved',
  });

  const recordBook = await bibleService.createProp(project.id, {
    name: 'Sổ ghi chép của Lư Sư Muội',
    description: 'A thin string-bound record book. Every failure is dated and numbered in a small, level hand.',
    ownerCharacterId: luSuMuoi?.id ?? null,
    details: {
      material: 'mulberry paper, string binding, bamboo cover strip',
      dimensions: '18cm × 12cm',
      color: 'oat paper, indigo string',
      condition: 'well used, corners soft',
      functionalBehavior: 'always open when she is on screen',
      storyImportance: 'becomes the emotional turn in scene 3',
    },
    promptToken: 'a thin string-bound record book with oat-coloured paper',
    continuityConstraints: ['always held in her left hand', 'indigo binding string never changes'],
    status: 'approved',
  });

  // --- 6. Shots -------------------------------------------------------------
  log('[seed] 6/10 building shot coverage');
  const built = await scriptService.buildShots(project.id);
  log(`[seed]     ${built.shots.length} shots, ${built.recommendations.length} planner recommendation(s)`);

  // Attach props to the shots where the script says they are present, with the
  // pinned snapshot version, so the continuity checker has real data to compare.
  const allShots = await studio.shots.listByProject(project.id);
  const scenesList = await studio.scenes.listByProject(project.id);
  const sceneByNumber = new Map(scenesList.map((scene) => [scene.number, scene]));

  const scene1 = sceneByNumber.get(1);
  const scene2 = sceneByNumber.get(2);
  const scene3 = sceneByNumber.get(3);

  for (const shot of allShots) {
    const props: { propId: string; versionId: string; heldBy: string | null; state: string }[] = [];

    if (scene2 && shot.sceneId === scene2.id) {
      props.push({
        propId: woodenSword.id,
        versionId: formatSnapshotId(woodenSword.code, woodenSword.currentVersion),
        heldBy: trieuNgoc?.id ?? null,
        state: shot.shotNumber >= 3 ? 'planted in the ground' : 'in hand',
      });
    }
    if ((scene1 && shot.sceneId === scene1.id) || (scene3 && shot.sceneId === scene3.id)) {
      const inScene1 = Boolean(scene1 && shot.sceneId === scene1.id);
      // In scene 1 Lu Su Muoi carries the book; in scene 3 it rests on the dais.
      if (!inScene1 || shot.shotNumber >= 2) {
        props.push({
          propId: recordBook.id,
          versionId: formatSnapshotId(recordBook.code, recordBook.currentVersion),
          heldBy: inScene1 ? (luSuMuoi?.id ?? null) : null,
          state: inScene1 ? 'open in her left hand' : 'open on the dais',
        });
      }
    }

    if (props.length > 0) {
      await studio.shots.update(shot.id, { props });
    }
  }

  // --- 7. Prompts with locks -----------------------------------------------
  log('[seed] 7/10 compiling prompts with Character/Style/Location locks');
  const imagePrompts = await promptService.buildMissing(project.id, 'image');
  const videoPrompts = await promptService.buildMissing(project.id, 'video');
  log(
    `[seed]     ${imagePrompts.built.length} image prompt(s), ${videoPrompts.built.length} video prompt(s), ` +
      `${imagePrompts.failures.length + videoPrompts.failures.length} failure(s)`,
  );

  // --- 8. Mock generations + assets ----------------------------------------
  log('[seed] 8/10 queueing mock generations and draining the worker');
  const shotsForGeneration = (await studio.shots.listByProject(project.id)).slice(0, 6);
  for (const shot of shotsForGeneration) {
    const prompt = await studio.prompts.findForShot(shot.id, 'image');
    if (!prompt) continue;
    await generationService.enqueue({
      projectId: project.id,
      shotId: shot.id,
      promptId: prompt.id,
      kind: 'image',
      provider: (process.env.AI_IMAGE_PROVIDER || 'mock') as any,
      params: { count: 1 },
      referenceAssetIds: [],
      priority: 10,
    });
  }

  // One voice generation so the audio path is exercised too.
  const speakingShot = (await studio.shots.listByProject(project.id)).find((shot) => shot.dialogue.trim().length > 0);
  if (speakingShot) {
    await generationService.enqueue({
      projectId: project.id,
      shotId: speakingShot.id,
      kind: 'voice',
      provider: (process.env.AI_VOICE_PROVIDER || 'mock') as any,
      prompt: speakingShot.dialogue,
      params: { language: 'vi-VN', voiceName: 'demo-vi', speed: 1 },
      referenceAssetIds: [],
      priority: 20,
    });
  }

  const worker = createWorker(studio, { workerId: 'seed-worker' });
  const processed = await worker.drain();
  log(`[seed]     ${processed} job(s) processed by the mock provider`);

  // --- 9. Quality + approvals ----------------------------------------------
  log('[seed] 9/10 running quality checks and approving keyframes');
  const producedAssets = await studio.assets.list(project.id, { limit: 200 });
  let qualityCount = 0;
  for (const asset of producedAssets) {
    await qualityService.checkAsset(asset.id);
    qualityCount += 1;
  }

  // Approve the keyframes for the key shots so the video stage is unblocked —
  // this is the human-in-the-loop step, pre-answered for the demo.
  let approved = 0;
  for (const asset of producedAssets.filter((candidate) => candidate.kind === 'image').slice(0, 4)) {
    await assetService.decide(asset.id, 'approved', 'Approved as the demo keyframe.', null);
    approved += 1;
  }

  // --- 10. Timeline, workflow record, export -------------------------------
  log('[seed] 10/10 assembling the timeline and exporting the package');
  const timeline = await timelineService.build(project.id);
  const workflowRun = await workflowService.run({
    projectId: project.id,
    workflowKey: 'motion-comic',
    autoEnqueueGenerations: false,
  });
  await worker.drain();
  const exported = await exportService.run({ projectId: project.id, kind: 'project-package' });

  const finalAssets = await studio.assets.list(project.id, { limit: 500 });
  const report: SeedReport = {
    projectId: project.id,
    slug: project.slug,
    scenes: (await studio.scenes.listByProject(project.id)).length,
    shots: (await studio.shots.listByProject(project.id)).length,
    characters: (await studio.bibles.listCharacters(project.id)).length,
    locations: (await studio.bibles.listLocations(project.id)).length,
    props: (await studio.bibles.listProps(project.id)).length,
    styles: (await studio.bibles.listStyles(project.id)).length,
    prompts: (await studio.prompts.listByProject(project.id)).length,
    generations: (await studio.generations.listByProject(project.id, { limit: 500 })).length,
    assets: finalAssets.length,
    approvedAssets: finalAssets.filter((asset) => asset.approvalState === 'approved').length,
    qualityReports: qualityCount,
    workflowRuns: (await studio.workflows.listByProject(project.id)).length,
    exportId: exported.export.id,
    timelineItems: timeline.items.length,
    skipped: false,
  };

  log(
    `[seed] done — ${report.scenes} scenes · ${report.shots} shots · ${report.prompts} prompts · ` +
      `${report.generations} generations · ${report.assets} assets (${report.approvedAssets} approved) · ` +
      `${report.timelineItems} timeline items · workflow ${workflowRun.status}`,
  );
  if (approved === 0) log('[seed] note: no assets were approved — check the mock provider');

  return report;
}

const isDirectRun = process.argv[1]?.includes('seed');
if (isDirectRun) {
  runMigrations();
  seed({ force: process.argv.includes('--force'), verbose: true })
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('[seed] failed:', error);
      process.exit(1);
    });
}
