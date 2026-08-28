import { notFound } from 'next/navigation';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  Notice,
  SavedIndicator,
  Stat,
  StatusBadge,
} from '@/components/ui';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatedMetric } from '@/components/motion/AnimatedMetric';
import { LoadingShimmer } from '@/components/motion/LoadingShimmer';
import { ProgressTransition } from '@/components/motion/ProgressTransition';
import { SectionReveal } from '@/components/motion/SectionReveal';
import { StatusPulse } from '@/components/motion/StatusPulse';

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Development-only reference for the primitives, tokens and motion wrappers
 * documented in docs/design/**. Not linked from any production navigation
 * (src/app/layout.tsx) and unreachable once NODE_ENV=production — see
 * tests/unit/designGallery.test.ts.
 */
export default function DesignGalleryPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8 pb-16">
      <SectionReveal>
        <header className="flex flex-col gap-2">
          <Breadcrumbs items={[{ label: 'Dev' }, { label: 'Design Gallery' }]} />
          <h1 className="text-2xl font-semibold text-ink-hi">Design Gallery</h1>
          <p className="max-w-2xl text-sm text-ink-mid">
            Development-only reference for the primitives, tokens, states and motion wrappers
            defined by <code className="font-mono text-xs">docs/design/DESIGN.md</code>,{' '}
            <code className="font-mono text-xs">COMPONENT-GUIDELINES.md</code> and{' '}
            <code className="font-mono text-xs">MOTION-GUIDELINES.md</code>. Never linked from
            production navigation; returns 404 when <code className="font-mono text-xs">NODE_ENV=production</code>.
          </p>
        </header>
      </SectionReveal>

      <Card title="Typography">
        <div className="flex flex-col gap-3">
          <p className="text-2xl font-semibold text-ink-hi">Display heading — 24px semibold</p>
          <p className="text-xl font-semibold text-ink-hi">Page heading — 20px semibold</p>
          <p className="text-sm font-semibold text-ink-hi">Section heading — 14px semibold</p>
          <p className="text-sm font-medium text-ink-hi">Card title — 14px medium</p>
          <p className="text-sm text-ink-hi">Body — 14px regular</p>
          <p className="text-xs text-ink-mid">Metadata — 12px muted</p>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-lo">Label — 12px uppercase</p>
          <p className="font-mono text-xs text-ink-mid">Technical value — EP01_SC01_SH001 / CHAR001_V1</p>
        </div>
      </Card>

      <Card title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary action</Button>
          <Button variant="ghost">Secondary action</Button>
          <Button variant="danger">Destructive action</Button>
          <Button variant="ghost" disabled aria-describedby="gallery-disabled-hint">
            Disabled action
          </Button>
          <span id="gallery-disabled-hint" className="text-xs text-ink-lo">
            Disabled controls state why in real usage (e.g. a tooltip or adjacent hint).
          </span>
        </div>
      </Card>

      <Card title="Inputs">
        <div className="grid max-w-md gap-4">
          <Field label="Project title" hint="Persisted field, not a UI-only draft.">
            <input className={inputClass} placeholder="Tuyết Đỉnh Vibe Coding" />
          </Field>
          <Field label="Notes">
            <textarea className={inputClass} rows={3} placeholder="Optional context" />
          </Field>
        </div>
      </Card>

      <Card title="Badges and statuses">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>CHAR001_V1</Badge>
          <StatusBadge status="pending" />
          <StatusBadge status="review" />
          <StatusBadge status="approved" />
          <StatusBadge status="failed" />
          <StatusBadge status="cancelled" />
          <StatusBadge status="processing" />
          <StatusPulse label="Generating shot preview" tone="info" />
        </div>
      </Card>

      <Card title="Cards and stats">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Shots approved" value={<AnimatedMetric value="12 / 16" />} hint="Updated on last read" />
          <Stat label="Warnings" value="3" hint="2 missing reference, 1 unlocked bible" />
          <Stat label="Cost to date" value="$0.00" hint="Mock provider" />
        </div>
      </Card>

      <Card title="Empty, loading and error states">
        <div className="flex flex-col gap-4">
          <EmptyState
            title="No shots yet"
            hint="Add a scene and split it into shots to start production."
            action={<Button variant="ghost">Go to Scenes</Button>}
          />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-lo">Loading (Skeleton)</p>
            <LoadingShimmer lines={3} />
          </div>
          <ErrorState title="Could not load shot list" detail="PROJECT_ROUTE_FAILED — retry or contact the operator." />
          <Notice tone="warning">2 shots are missing an approved keyframe.</Notice>
          <Notice tone="success">Export package generated successfully.</Notice>
        </div>
      </Card>

      <Card title="Progress">
        <div className="max-w-md">
          <ProgressTransition percent={62} label="Rendering timeline" />
        </div>
      </Card>

      <Card title="Table">
        <DataTable head={['Shot', 'Scene', 'Status']}>
          <tr className="border-b border-line">
            <td className="px-2 py-2 font-mono text-xs">EP01_SC01_SH001</td>
            <td className="px-2 py-2">SC01</td>
            <td className="px-2 py-2">
              <StatusBadge status="approved" />
            </td>
          </tr>
          <tr>
            <td className="px-2 py-2 font-mono text-xs">EP01_SC01_SH002</td>
            <td className="px-2 py-2">SC01</td>
            <td className="px-2 py-2">
              <StatusBadge status="pending" />
            </td>
          </tr>
        </DataTable>
      </Card>

      <Card title="Separator and saved indicator">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-1/3" />
          <Separator />
          <SavedIndicator savedAt={null} />
        </div>
      </Card>

      <Card title="Theme">
        <p className="text-sm text-ink-mid">
          The application forces dark mode (<code className="font-mono text-xs">html.dark</code> in{' '}
          <code className="font-mono text-xs">src/app/layout.tsx</code>); there is no light-mode UI to preview live.
          Every token above still resolves through the <code className="font-mono text-xs">:root</code> /{' '}
          <code className="font-mono text-xs">.dark</code> pair in{' '}
          <code className="font-mono text-xs">src/app/globals.css</code>, so a future light-mode toggle needs no
          component change — only removing the forced class.
        </p>
      </Card>
    </div>
  );
}
