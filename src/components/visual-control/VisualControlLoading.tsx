/**
 * VC2 — Loading skeleton for the Visual Control section (TASK-UI-VISUAL-CONTROL-001).
 * Rendered by the Suspense boundary while the read model is fetched.
 */
export function VisualControlLoading() {
  return (
    <section aria-label="Loading Visual Control" aria-busy="true" className="space-y-3">
      <div className="h-6 w-48 animate-pulse rounded bg-surface-2" />
      <div className="rounded-lg border border-line bg-surface-1 p-4">
        <div className="h-14 w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="rounded-lg border border-line bg-surface-1 p-4">
        <div className="h-32 w-full animate-pulse rounded bg-surface-2" />
      </div>
    </section>
  );
}
