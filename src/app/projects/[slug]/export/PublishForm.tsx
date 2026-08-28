'use client';

import { useState } from 'react';
import { retryPublishAction, runPublishAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import type { PublishRecord } from '@/application/records';
import { MAX_PUBLISH_ATTEMPTS } from '@/application/services/publishService';

/**
 * `toLocaleString()` formats using the running process's locale/timezone,
 * which differs between the Next.js server and the browser and produces a
 * React hydration mismatch. `toISOString()` is spec-guaranteed to always
 * render in UTC in a fixed format regardless of environment, so server and
 * client render byte-identical output.
 */
export function formatPublishTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

export function PublishForm({
  slug,
  exportId,
  publishes,
}: {
  slug: string;
  exportId: string;
  publishes: PublishRecord[];
}) {
  const [endpoint, setEndpoint] = useState('');

  const relatedPublishes = publishes.filter((p) => p.exportId === exportId);

  return (
    <div className="mt-3 bg-surface p-3 border border-line rounded">
      <h4 className="text-xs font-semibold mb-2">Publish to webhook</h4>

      <div className="flex items-center gap-2 mb-3">
        <label htmlFor={`publish-url-${exportId}`} className="sr-only">Webhook URL</label>
        <input
          id={`publish-url-${exportId}`}
          type="url"
          className="flex-1 bg-surface-alt border border-line rounded px-2 py-1 text-sm text-ink-hi"
          placeholder="https://n8n.your-domain.com/webhook/..."
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          aria-label="Webhook URL for publishing"
        />
        <ActionButton
          action={runPublishAction.bind(null, slug, exportId, endpoint)}
          label="Publish"
          variant="primary"
          pendingLabel="Sending..."
          disabled={!endpoint}
        />
      </div>

      {relatedPublishes.length > 0 && (
        <div className="space-y-1" role="list" aria-label="Publish history">
          {relatedPublishes.map((pub) => {
            let color = 'bg-surface-alt text-ink-lo';
            if (pub.status === 'completed') color = 'bg-emerald-500/20 text-emerald-300';
            else if (pub.status === 'failed') color = 'bg-rose-500/20 text-rose-300';
            else if (pub.status === 'running') color = 'bg-blue-500/20 text-blue-300';

            return (
              <div key={pub.id} role="listitem" className="text-xs flex flex-wrap gap-2 items-center text-ink-mid">
                <span className={`px-2 py-0.5 rounded-full ${color}`}>{pub.status}</span>
                <span className="truncate max-w-[200px]" title={pub.endpoint}>
                  {new URL(pub.endpoint).hostname}
                </span>
                <span>(Attempt {pub.attemptCount})</span>
                <span className="text-ink-lo">{formatPublishTimestamp(pub.updatedAt)}</span>
                {pub.lastError && (
                  <span className="text-rose-400 max-w-[300px] truncate block ml-auto" title={pub.lastError}>
                    {pub.lastError}
                  </span>
                )}
                {pub.status === 'failed' && pub.attemptCount < MAX_PUBLISH_ATTEMPTS && (
                  <ActionButton
                    action={retryPublishAction.bind(null, slug, pub.id)}
                    label="Retry"
                    variant="ghost"
                    pendingLabel="Retrying..."
                  />
                )}
                {pub.status === 'failed' && pub.attemptCount >= MAX_PUBLISH_ATTEMPTS && (
                  <span className="text-rose-400">Retry limit reached</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
