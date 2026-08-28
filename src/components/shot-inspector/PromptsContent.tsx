'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, EmptyState, Notice, StatusBadge } from '@/components/ui';
import { PreflightReadiness } from '@/components/shot-inspector/PreflightReadiness';
import type { PreflightReadinessData } from '@/components/shot-inspector/preflightReadinessUtils';
import {
  derivePromptHealth,
  PROMPT_HEALTH_GLYPHS,
  PROMPT_HEALTH_LABELS,
  type PromptHealth,
  type PromptKind,
  type PromptKindHealth,
  type PromptReadData,
  type ShotRefInputs,
} from '@/components/shot-inspector/promptHealthUtils';
import type { LintIssue } from '@/domain/schemas';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';

interface PromptVersionData {
  compiled: string;
  negative: string;
  lockRefs: {
    characters: Array<{ id: string; code: string; version: number }>;
    style: { id: string; code: string; version: number } | null;
    location: { id: string; code: string; version: number } | null;
    props: Array<{ id: string; code: string; version: number }>;
  };
  lint: { ok: boolean; score: number; issues: Array<LintIssue>; characterCount: number } | null;
  version: number;
  createdAt: string;
}

interface ShotIngredientsData {
  characters: Array<{ characterId: string; versionId: string; name?: string }>;
  location: { locationId: string; versionId: string; name?: string } | null;
  props: Array<{ propId: string; versionId: string; name?: string }>;
  hasProjectStyle: boolean;
  shotSize: string;
  cameraAngle: string;
  cameraMovement: string;
  lens: string;
  durationSeconds: number;
  aspectRatio: string;
  description: string;
  dialogue: string;
  lighting: string;
  emotion: string;
}

export interface PromptsContentProps {
  imageData: PromptReadData | null;
  videoData: PromptReadData | null;
  requiredRefs: ShotRefInputs;
  ingredients: ShotIngredientsData;
  basePath: string;
  preflight?: PreflightReadinessData;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`text-[10px] uppercase font-semibold tracking-wide border px-2 py-0.5 rounded transition ${
        error
          ? 'border-red-400 text-red-600 bg-red-50'
          : 'text-ink-mid hover:text-ink-hi hover:bg-surface-3'
      }`}
    >
      {error ? 'Failed to copy' : copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function kindLabel(kind: PromptKind): string {
  return kind === 'image' ? 'Image prompt' : 'Video prompt';
}

function healthSection(health: PromptHealth, basePath: string) {
  const glyph = PROMPT_HEALTH_GLYPHS[health.status];
  const label = PROMPT_HEALTH_LABELS[health.status];

  const toneBorder =
    health.status === 'BLOCKED'
      ? 'border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-950/40'
      : health.status === 'EMPTY'
        ? 'border-line bg-surface-2'
        : health.status === 'NEEDS_ATTENTION'
          ? 'border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-950/30'
          : 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-950/30';

  const toneText =
    health.status === 'BLOCKED'
      ? 'text-red-800 dark:text-red-200'
      : health.status === 'EMPTY'
        ? 'text-ink-mid'
        : health.status === 'NEEDS_ATTENTION'
          ? 'text-amber-900 dark:text-amber-200'
          : 'text-emerald-900 dark:text-emerald-200';

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneBorder}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${toneText}`}>
          <span aria-hidden="true">{glyph}</span>
          {label}
        </span>
        <span className={`text-sm ${toneText}`}>{health.reason}</span>
      </div>
      {health.actionLabel && health.actionDestination && (
        <div className="mt-2">
          <Link
            href={`${basePath}/${health.actionDestination}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-400 bg-transparent px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-500/50 dark:text-red-300 dark:hover:bg-red-950/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1"
          >
            {health.actionLabel}
          </Link>
        </div>
      )}
    </div>
  );
}

function lintSeverityBadge(severity: string) {
  if (severity === 'error') return <StatusBadge status="error" />;
  if (severity === 'warning') return <StatusBadge status="warning" />;
  return <StatusBadge status="info" />;
}

function promptKindSection(
  data: PromptReadData | null,
  health: PromptKindHealth,
  kind: PromptKind,
  ingredients: ShotIngredientsData,
) {
  if (!data) {
    return (
      <Card title={kindLabel(kind)}>
        <EmptyState title={health.reason} hint="No compiled prompt data is available for this shot." />
      </Card>
    );
  }

  const { compiled, negative, lockRefs, lint, version, createdAt } = data;

  const lockBadges: Array<{ label: string }> = [];
  if (lockRefs.characters && lockRefs.characters.length > 0) {
    for (const ref of lockRefs.characters) {
      lockBadges.push({ label: formatSnapshotId(ref.code, ref.version) });
    }
  }
  if (lockRefs.style) {
    lockBadges.push({ label: formatSnapshotId(lockRefs.style.code, lockRefs.style.version) });
  }
  if (lockRefs.location) {
    lockBadges.push({ label: formatSnapshotId(lockRefs.location.code, lockRefs.location.version) });
  }
  if (lockRefs.props && lockRefs.props.length > 0) {
    for (const ref of lockRefs.props) {
      lockBadges.push({ label: formatSnapshotId(ref.code, ref.version) });
    }
  }

  return (
    <Card
      title={
        <span>
          {kindLabel(kind)}
          {version > 0 && <span className="ml-2 font-normal text-xs text-ink-lo">· v{version}</span>}
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge status={health.status === 'READY' ? 'approved' : 'warning'} />
          <span className="text-ink-mid">
            lint {lint && typeof lint.score === 'number' ? lint.score : 0}/100 · {compiled.length} chars
          </span>
        </div>

        {lint && lint.issues && lint.issues.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Lint findings</h3>
            <ul className="mt-1 space-y-1 text-xs">
              {lint.issues.map((issue, index) => (
                <li key={`${issue.rule}-${index}`} className="flex flex-wrap items-baseline gap-1.5">
                  {lintSeverityBadge(issue.severity)}
                  <span className="text-ink-hi">{issue.message}</span>
                  {issue.hint && <span className="text-ink-lo">{issue.hint}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Prompt text</h3>
            {compiled && <CopyButton text={compiled} />}
          </div>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-hi font-mono selection:bg-brand selection:text-white">
            {compiled || '—'}
          </pre>
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Negative prompt</h3>
          <p className="mt-1 rounded bg-surface-2 p-2 text-[12px] text-ink-mid font-mono">{negative || '—'}</p>
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Locked references</h3>
          {lockBadges.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {lockBadges.map((badge) => (
                <Badge key={badge.label}>{badge.label}</Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-lo">No locked references</p>
          )}
        </div>

        {kind === 'video' && data && (
          <Notice tone="info">
            The video prompt depends on a compiled image prompt for shot composition continuity.
          </Notice>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-lo">
          {version > 0 && <span>Version {version}</span>}
          <span>Created {new Date(createdAt).toLocaleString()}</span>
          {lint && typeof lint.characterCount === 'number' && <span>{lint.characterCount} chars</span>}
        </div>
      </div>
    </Card>
  );
}

function hasContributor(refId: string, imageRefs: any, videoRefs: any, type: 'characters' | 'location' | 'props'): boolean {
  if (type === 'location') {
    return imageRefs?.location?.id === refId || videoRefs?.location?.id === refId;
  }

  const imgContributed = imageRefs?.[type]?.some((r: any) => r.id === refId);
  const vidContributed = videoRefs?.[type]?.some((r: any) => r.id === refId);
  return Boolean(imgContributed || vidContributed);
}

function ingredientsSection(ingredients: ShotIngredientsData, imageData: PromptReadData | null, videoData: PromptReadData | null) {
  const hasData =
    ingredients.characters.length > 0 ||
    ingredients.location !== null ||
    ingredients.props.length > 0 ||
    ingredients.description;

  const imageRefs = imageData?.lockRefs;
  const videoRefs = videoData?.lockRefs;

  return (
    <Card title="Prompt ingredients" className="lg:col-span-1">
      {!hasData ? (
        <EmptyState title="No shot data available" hint="Shot facts and references feed into prompt compilation." />
      ) : (
        <div className="space-y-4">
          {ingredients.characters.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Characters</h3>
              <ul className="mt-1 space-y-1">
                {ingredients.characters.map((c) => {
                  const isContributor = hasContributor(c.characterId, imageRefs, videoRefs, 'characters');
                  return (
                    <li key={c.characterId} className="text-sm text-ink-hi">
                      <span className="text-xs text-ink-lo block">{isContributor ? 'Contributor' : 'Linked Character'}</span>
                      {c.name || c.characterId}
                      {c.versionId && (
                        <span className="ml-1.5">
                          <Badge>{c.versionId}</Badge>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {ingredients.location && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Location</h3>
              <p className="mt-1 text-sm text-ink-hi">
                <span className="text-xs text-ink-lo block">
                  {hasContributor(ingredients.location.locationId, imageRefs, videoRefs, 'location') ? 'Contributor' : 'Linked Location'}
                </span>
                {ingredients.location.name || ingredients.location.locationId}
                {ingredients.location.versionId && (
                  <span className="ml-1.5">
                    <Badge>{ingredients.location.versionId}</Badge>
                  </span>
                )}
              </p>
            </div>
          )}

          {ingredients.props.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Props</h3>
              <ul className="mt-1 space-y-1">
                {ingredients.props.map((p) => {
                  const isContributor = hasContributor(p.propId, imageRefs, videoRefs, 'props');
                  return (
                    <li key={p.propId} className="text-sm text-ink-hi">
                      <span className="text-xs text-ink-lo block">{isContributor ? 'Contributor' : 'Linked Prop'}</span>
                      {p.name || p.propId}
                      {p.versionId && (
                        <span className="ml-1.5">
                          <Badge>{p.versionId}</Badge>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {ingredients.hasProjectStyle && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Project style</h3>
              <p className="mt-1 text-sm text-ink-hi">Defined at project level</p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Shot facts</h3>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              {ingredients.shotSize && (
                <>
                  <dt className="text-xs text-ink-lo">Shot size</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.shotSize}</dd>
                </>
              )}
              {ingredients.cameraAngle && (
                <>
                  <dt className="text-xs text-ink-lo">Camera angle</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.cameraAngle}</dd>
                </>
              )}
              {ingredients.cameraMovement && (
                <>
                  <dt className="text-xs text-ink-lo">Movement</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.cameraMovement}</dd>
                </>
              )}
              {ingredients.lens && (
                <>
                  <dt className="text-xs text-ink-lo">Lens</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.lens}</dd>
                </>
              )}
              {ingredients.aspectRatio && (
                <>
                  <dt className="text-xs text-ink-lo">Aspect ratio</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.aspectRatio}</dd>
                </>
              )}
              {typeof ingredients.durationSeconds === 'number' && (
                <>
                  <dt className="text-xs text-ink-lo">Duration</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.durationSeconds}s</dd>
                </>
              )}
              {ingredients.lighting && (
                <>
                  <dt className="text-xs text-ink-lo">Lighting</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.lighting}</dd>
                </>
              )}
              {ingredients.emotion && (
                <>
                  <dt className="text-xs text-ink-lo">Emotion</dt>
                  <dd className="text-xs text-ink-hi">{ingredients.emotion}</dd>
                </>
              )}
            </dl>
          </div>

          {ingredients.description && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Description</h3>
              <p className="mt-1 text-sm text-ink-mid">{ingredients.description}</p>
            </div>
          )}

          {ingredients.dialogue && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-lo">Dialogue</h3>
              <p className="mt-1 rounded bg-surface-2 p-2 text-[12px] text-ink-mid font-mono whitespace-pre-wrap">
                {ingredients.dialogue}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function PromptsContent({ imageData, videoData, requiredRefs, ingredients, basePath, preflight }: PromptsContentProps) {
  const health = derivePromptHealth(imageData, videoData, requiredRefs);

  return (
    <div className="space-y-4">
      {healthSection(health, basePath)}
      {preflight && <PreflightReadiness data={preflight} promptHealth={health} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {promptKindSection(imageData, health.image, 'image', ingredients)}
          {promptKindSection(videoData, health.video, 'video', ingredients)}
        </div>

        <div className="space-y-4">
          {ingredientsSection(ingredients, imageData, videoData)}
        </div>
      </div>
    </div>
  );
}
