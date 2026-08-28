export type OverviewReadiness =
  | 'READY'
  | 'NEEDS_ATTENTION'
  | 'BLOCKED'
  | 'IN_PROGRESS'
  | 'COMPLETE';

export type OverviewAction = {
  readiness: OverviewReadiness;
  reason: string;
  primaryLabel: string;
  destination: string;
  actionType: 'NAVIGATION';
  ruleId: string;
};

export interface OverviewInput {
  vcState: {
    pinnedReferences: Array<{ resolved: boolean }>;
    assets: Array<{ isRequiredReference: boolean; approvalState: string }>;
    continuity: { blockers: Array<{ message: string }> };
    prompt: {
      image: { promptId: string | null; lintOk: boolean | null };
      video: { promptId: string | null; lintOk: boolean | null };
    };
  } | null;
  shot: {
    shotSize: string;
    cameraAngle: string;
    lens: string;
    durationSeconds: number;
    aspectRatio: string;
    description: string;
    dialogue: string;
    lighting: string;
    emotion: string;
    importance: 'normal' | 'key';
    code: string;
  };
  imagePrompt: { version: { lint: { issues: Array<{ severity: string }> } | null } } | null;
  videoPrompt: { version: { lint: { issues: Array<{ severity: string }> } | null } } | null;
  generations: Array<{ kind: string; status: string; id: string }>;
  assets: Array<{ kind: string; approvalState: string; generationId: string | null }>;
  nextShotCode: string | null;
  basePath: string;
}

export function deriveNextAction(input: OverviewInput): OverviewAction {
  const { vcState, shot, imagePrompt, videoPrompt, generations, assets, nextShotCode, basePath } = input;

  const hasApprovedImage = assets.some(
    (a) => a.kind === 'image' && a.approvalState === 'approved',
  );
  const hasApprovedVideo = assets.some(
    (a) => a.kind === 'video' && a.approvalState === 'approved',
  );

  // Rule 1: Missing required shot spec (evaluated even when vcState is null)
  if (
    shot.shotSize === '' ||
    shot.cameraAngle === '' ||
    shot.lens === '' ||
    shot.durationSeconds === 0 ||
    shot.aspectRatio === ''
  ) {
    return {
      readiness: 'NEEDS_ATTENTION',
      reason: 'Shot is missing required spec fields — open the editor',
      primaryLabel: 'Edit shot',
      destination: `${basePath}/edit`,
      actionType: 'NAVIGATION',
      ruleId: '1',
    };
  }

  if (!vcState) {
    // Rule 18: Fallback — null VC state after complete spec
    return {
      readiness: 'NEEDS_ATTENTION',
      reason: 'Shot data is incomplete or contradictory — open the editor to complete or review the setup',
      primaryLabel: 'Review and complete shot setup',
      destination: `${basePath}/edit`,
      actionType: 'NAVIGATION',
      ruleId: '18',
    };
  }

  // Rule 2: Unresolved pinned reference
  if (vcState.pinnedReferences.some((ref) => !ref.resolved)) {
    return {
      readiness: 'BLOCKED',
      reason: 'A pinned reference cannot be resolved',
      primaryLabel: 'Resolve reference',
      destination: `${basePath}?tab=references`,
      actionType: 'NAVIGATION',
      ruleId: '2',
    };
  }

  // Rule 3: Required reference pending or rejected
  const unapprovedRequired = vcState.assets.filter(
    (a) => a.isRequiredReference && a.approvalState !== 'approved',
  );
  if (unapprovedRequired.length > 0) {
    const hasRejected = unapprovedRequired.some((a) => a.approvalState === 'rejected');
    return {
      readiness: 'BLOCKED',
      reason: hasRejected
        ? 'A required reference was rejected'
        : 'A required reference is pending review',
      primaryLabel: hasRejected
        ? 'Replace rejected reference'
        : 'Review reference',
      destination: `${basePath}?tab=generations`,
      actionType: 'NAVIGATION',
      ruleId: '3',
    };
  }

  // Rule 4: Continuity blocker
  if (vcState.continuity.blockers.length > 0) {
    return {
      readiness: 'BLOCKED',
      reason: `Continuity blocker: ${vcState.continuity.blockers[0]!.message}`,
      primaryLabel: 'Review continuity',
      destination: `${basePath}?tab=visual-control`,
      actionType: 'NAVIGATION',
      ruleId: '4',
    };
  }

  const imagePromptMissing =
    imagePrompt === null ||
    imagePrompt.version === undefined ||
    vcState.prompt.image.promptId === null;

  const videoPromptMissing =
    videoPrompt === null ||
    videoPrompt.version === undefined ||
    vcState.prompt.video.promptId === null;

  const imagePromptHasLintErrors =
    imagePrompt !== null &&
    imagePrompt.version !== undefined &&
    (imagePrompt.version.lint?.issues ?? []).some((i) => i.severity === 'error');

  const videoPromptHasLintErrors =
    videoPrompt !== null &&
    videoPrompt.version !== undefined &&
    (videoPrompt.version.lint?.issues ?? []).some((i) => i.severity === 'error');

  const activeImageGen = generations.some(
    (g) => g.kind === 'image' && (g.status === 'pending' || g.status === 'processing'),
  );
  const activeVideoGen = generations.some(
    (g) => g.kind === 'video' && (g.status === 'pending' || g.status === 'processing'),
  );

  const completedImageGenIds = generations
    .filter((g) => g.kind === 'image' && g.status === 'completed')
    .map((g) => g.id);
  const completedVideoGenIds = generations
    .filter((g) => g.kind === 'video' && g.status === 'completed')
    .map((g) => g.id);

  const hasPendingImageReview = assets.some(
    (a) =>
      a.kind === 'image' &&
      a.approvalState === 'pending' &&
      (a.generationId !== null
        ? completedImageGenIds.includes(a.generationId)
        : completedImageGenIds.length > 0),
  );
  const hasPendingVideoReview = assets.some(
    (a) =>
      a.kind === 'video' &&
      a.approvalState === 'pending' &&
      (a.generationId !== null
        ? completedVideoGenIds.includes(a.generationId)
        : completedVideoGenIds.length > 0),
  );

  const hasRejectedImage = assets.some(
    (a) => a.kind === 'image' && a.approvalState === 'rejected',
  );
  const hasRejectedVideo = assets.some(
    (a) => a.kind === 'video' && a.approvalState === 'rejected',
  );

  // --- PHASE 3: Image preparation and production ---
  if (!hasApprovedImage) {
    // Rule 5: Image prompt missing
    if (imagePromptMissing) {
      return {
        readiness: 'NEEDS_ATTENTION',
        reason: 'No compiled image prompt yet',
        primaryLabel: 'Compile image prompt',
        destination: `${basePath}?tab=prompts`,
        actionType: 'NAVIGATION',
        ruleId: '5',
      };
    }

    // Rule 6: Image prompt lint blocker
    if (imagePromptHasLintErrors) {
      return {
        readiness: 'BLOCKED',
        reason: 'Image prompt has blocking lint error(s)',
        primaryLabel: 'Fix image prompt',
        destination: `${basePath}?tab=prompts`,
        actionType: 'NAVIGATION',
        ruleId: '6',
      };
    }

    // Rule 7: Image generation active
    if (activeImageGen) {
      return {
        readiness: 'IN_PROGRESS',
        reason: 'Image generation is running',
        primaryLabel: 'View image generation',
        destination: `${basePath}?tab=generations`,
        actionType: 'NAVIGATION',
        ruleId: '7',
      };
    }

    // Rule 8: Image pending review
    if (hasPendingImageReview) {
      return {
        readiness: 'IN_PROGRESS',
        reason: 'Image generated — review and approve',
        primaryLabel: 'Review image',
        destination: `${basePath}?tab=generations`,
        actionType: 'NAVIGATION',
        ruleId: '8',
      };
    }

    // Rule 9: Image rejected
    if (hasRejectedImage) {
      return {
        readiness: 'NEEDS_ATTENTION',
        reason: 'Image asset was rejected — regenerate or review the rejection',
        primaryLabel: 'Regenerate image or review rejection',
        destination: `${basePath}?tab=generations`,
        actionType: 'NAVIGATION',
        ruleId: '9',
      };
    }

    // Rule 10: Image ready to queue
    return {
      readiness: 'READY',
      reason: 'Ready to generate the image',
      primaryLabel: 'Queue image',
      destination: `${basePath}?tab=prompts`,
      actionType: 'NAVIGATION',
      ruleId: '10',
    };
  }

  // --- PHASE 4: Video preparation and production ---
  if (!hasApprovedVideo) {
    // Rule 11: Video prompt missing
    if (videoPromptMissing) {
      return {
        readiness: 'NEEDS_ATTENTION',
        reason: 'Image approved — compile the video prompt next',
        primaryLabel: 'Compile video prompt',
        destination: `${basePath}?tab=prompts`,
        actionType: 'NAVIGATION',
        ruleId: '11',
      };
    }

    // Rule 12: Video prompt lint blocker
    if (videoPromptHasLintErrors) {
      return {
        readiness: 'BLOCKED',
        reason: 'Video prompt has blocking lint error(s)',
        primaryLabel: 'Fix video prompt',
        destination: `${basePath}?tab=prompts`,
        actionType: 'NAVIGATION',
        ruleId: '12',
      };
    }

    // Rule 13: Video generation active
    if (activeVideoGen) {
      return {
        readiness: 'IN_PROGRESS',
        reason: 'Video generation is running',
        primaryLabel: 'View video generation',
        destination: `${basePath}?tab=generations`,
        actionType: 'NAVIGATION',
        ruleId: '13',
      };
    }

    // Rule 14: Video pending review
    if (hasPendingVideoReview) {
      return {
        readiness: 'IN_PROGRESS',
        reason: 'Video generated — review and approve',
        primaryLabel: 'Review video',
        destination: `${basePath}?tab=generations`,
        actionType: 'NAVIGATION',
        ruleId: '14',
      };
    }

    // Rule 15: Video rejected
    if (hasRejectedVideo) {
      return {
        readiness: 'NEEDS_ATTENTION',
        reason: 'Video asset was rejected — regenerate or review the rejection',
        primaryLabel: 'Regenerate video or review rejection',
        destination: `${basePath}?tab=generations`,
        actionType: 'NAVIGATION',
        ruleId: '15',
      };
    }

    // Rule 16: Video ready to queue
    return {
      readiness: 'READY',
      reason: 'Ready to generate the video',
      primaryLabel: 'Queue video',
      destination: `${basePath}?tab=prompts`,
      actionType: 'NAVIGATION',
      ruleId: '16',
    };
  }

  // --- PHASE 5: Completion ---
  // Rule 17: Approved image AND approved video
  if (hasApprovedImage && hasApprovedVideo) {
    const shotListPath = basePath.substring(0, basePath.lastIndexOf('/'));
    if (nextShotCode) {
      return {
        readiness: 'COMPLETE',
        reason: 'Shot complete — image and video approved',
        primaryLabel: 'Next shot',
        destination: `${shotListPath}/${encodeURIComponent(nextShotCode)}`,
        actionType: 'NAVIGATION',
        ruleId: '17',
      };
    }
    return {
      readiness: 'COMPLETE',
      reason: 'Shot complete — image and video approved',
      primaryLabel: 'Return to shot list',
      destination: shotListPath,
      actionType: 'NAVIGATION',
      ruleId: '17',
    };
  }

  // Rule 18: Fallback
  return {
    readiness: 'NEEDS_ATTENTION',
    reason: 'Shot data is incomplete or contradictory — open the editor to complete or review the setup',
    primaryLabel: 'Review and complete shot setup',
    destination: `${basePath}/edit`,
    actionType: 'NAVIGATION',
    ruleId: '18',
  };
}

export function deriveReadinessTone(readiness: OverviewReadiness): 'success' | 'warning' | 'blocked' | 'info' | 'neutral' {
  switch (readiness) {
    case 'READY':
    case 'COMPLETE':
      return 'success';
    case 'NEEDS_ATTENTION':
      return 'warning';
    case 'BLOCKED':
      return 'blocked';
    case 'IN_PROGRESS':
      return 'info';
  }
}

export function deriveReadinessGlyph(readiness: OverviewReadiness): string {
  switch (readiness) {
    case 'READY':
      return '\u2713';
    case 'NEEDS_ATTENTION':
      return '\u26A0';
    case 'BLOCKED':
      return '\u2715';
    case 'IN_PROGRESS':
      return '\u25CD';
    case 'COMPLETE':
      return '\u2713';
  }
}
