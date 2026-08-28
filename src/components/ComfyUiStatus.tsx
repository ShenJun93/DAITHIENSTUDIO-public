'use client';

import { useEffect, useState } from 'react';
import { Badge, Card } from '@/components/ui';
import {
  comfyUiStatusResponseSchema,
  type ComfyUiStatusResponse,
} from '@/domain/comfyui';

const STATUS_CHECK_FAILED = 'Could not check ComfyUI readiness. Retry in a moment.';

export function ComfyUiStatus() {
  const [data, setData] = useState<ComfyUiStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/providers/comfyui/status');
      if (res.ok) {
        const parsed = comfyUiStatusResponseSchema.safeParse(await res.json());
        setData(parsed.success ? parsed.data : { status: 'unreachable', error: STATUS_CHECK_FAILED });
      } else {
        setData({ status: 'unreachable', error: STATUS_CHECK_FAILED });
      }
    } catch {
      setData({ status: 'unreachable', error: STATUS_CHECK_FAILED });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <Card title="ComfyUI Readiness">
        <p className="text-sm text-ink-mid" role="status" aria-live="polite">
          Checking ComfyUI status...
        </p>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card title="ComfyUI Readiness">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-hi">Status:</span>
          {data.status === 'unconfigured' && <Badge><span aria-hidden="true">ℹ</span> Unconfigured</Badge>}
          {data.status === 'ready' && <span className="text-emerald-600 dark:text-emerald-400 font-medium"><span aria-hidden="true">✓</span> Ready</span>}
          {data.status === 'unreachable' && <span className="text-red-600 dark:text-red-400 font-medium"><span aria-hidden="true">✕</span> Unreachable</span>}
        </div>

        {data.status === 'ready' && (
          <>
            <p className="text-sm text-ink-mid">
              Model Checkpoint: <code className="text-xs">{data.model}</code>
            </p>
            <p className="text-sm text-ink-mid">Capabilities: Image generation only (512x512)</p>
          </>
        )}

        {data.status === 'unconfigured' && (
          <p className="text-sm text-ink-lo">{data.message || 'Please configure COMFYUI_BASE_URL and COMFYUI_IMAGE_MODEL in your environment.'}</p>
        )}

        {data.status === 'unreachable' && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300">
            <p className="font-medium">Actionable failure</p>
            <p className="mt-1">{data.error}</p>
            <p className="mt-2 text-xs">Ensure ComfyUI is fully started and reachable at the configured COMFYUI_BASE_URL.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
