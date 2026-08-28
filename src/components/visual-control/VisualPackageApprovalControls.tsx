'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  decideVisualPackageAction,
  getVisualPackageApprovalStateAction,
  type VisualPackageApprovalReadResult,
} from '@/app/visualPackageApprovalActions';
import type { VisualPackageApprovalEligibility } from '@/domain/visualControl/packageApproval';

export function VisualPackageApprovalControls({
  slug,
  shotCode,
  packageFingerprint,
  eligibility,
}: {
  slug: string;
  shotCode: string;
  packageFingerprint: string;
  eligibility: VisualPackageApprovalEligibility;
}) {
  const [readResult, setReadResult] = useState<VisualPackageApprovalReadResult | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const result = await getVisualPackageApprovalStateAction(slug, shotCode);
      setReadResult(result);
      if (!result.ok) setMessage(result.message);
    });
  };

  useEffect(() => {
    let active = true;
    getVisualPackageApprovalStateAction(slug, shotCode).then((result) => {
      if (!active) return;
      setReadResult(result);
      if (!result.ok) setMessage(result.message);
    });
    return () => {
      active = false;
    };
  }, [slug, shotCode, packageFingerprint]);

  const decide = (decision: 'approved' | 'rejected' | 'changes-requested') => {
    startTransition(async () => {
      const result = await decideVisualPackageAction(slug, shotCode, packageFingerprint, decision, note);
      setMessage(result.message);
      if (result.ok) {
        setNote('');
        const refreshed = await getVisualPackageApprovalStateAction(slug, shotCode);
        setReadResult(refreshed);
      }
    });
  };

  const review = readResult?.state;
  const latestApproved = review?.latestApproved ?? null;

  return (
    <div className="rounded-lg border border-line bg-surface-1 p-4" data-testid="visual-package-approval">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-hi">Visual package approval</h3>
          <p className="mt-1 text-xs text-ink-mid">
            Decision target: <code className="font-mono text-ink-hi">{packageFingerprint}</code>
          </p>
          <p className="mt-1 text-xs text-ink-lo">Package approval does not authorize provider execution.</p>
        </div>
        {review?.currentApproved ? (
          <span className="rounded-full border border-line px-2 py-1 text-xs text-ink-hi">Current package approved</span>
        ) : review?.invalidated ? (
          <span className="rounded-full border border-line px-2 py-1 text-xs text-ink-mid">Prior approval invalidated</span>
        ) : null}
      </div>

      {!eligibility.eligible && (
        <ul className="mt-3 space-y-1 text-xs text-ink-mid" aria-label="Package approval blockers">
          {eligibility.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
        </ul>
      )}

      <label className="mt-3 block text-xs text-ink-mid">
        Decision note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink-hi"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !eligibility.eligible}
          onClick={() => decide('approved')}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-hi disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve visual package
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide('changes-requested')}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-mid disabled:opacity-50"
        >
          Request changes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide('rejected')}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-mid disabled:opacity-50"
        >
          Reject package
        </button>
        <button type="button" disabled={pending} onClick={refresh} className="px-2 py-1.5 text-xs text-ink-lo">
          Refresh approval state
        </button>
      </div>

      {message && <p role="status" className="mt-2 text-xs text-ink-mid">{message}</p>}

      {review?.latest && (
        <p className="mt-3 text-xs text-ink-mid">
          Latest decision: <strong>{review.latest.approval.decision}</strong> · {review.history.length} append-only decision{review.history.length === 1 ? '' : 's'}
        </p>
      )}

      {latestApproved && (
        <details className="mt-3 rounded-md border border-line bg-surface-2 p-2">
          <summary className="cursor-pointer text-xs font-medium text-ink-hi">Locked immutable approved package</summary>
          <p className="mt-2 text-xs text-ink-mid">
            Approved fingerprint: <code className="font-mono">{latestApproved.packageFingerprint}</code>
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] text-ink-lo">
            {JSON.stringify(latestApproved.package, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
