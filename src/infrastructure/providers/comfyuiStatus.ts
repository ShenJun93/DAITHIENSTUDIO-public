import { readRegistryOptions } from './registry';
import { validateComfyUiBaseUrl } from './comfyuiProvider';
import type { ComfyUiStatusResponse } from '@/domain/comfyui';

const STATUS_TIMEOUT_MS = 3_000;
const UNREACHABLE_MESSAGE = 'Could not reach ComfyUI. Start it and verify the configured local endpoint.';

function safeModelLabel(raw: string): string {
  const leaf = raw.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return cleaned || 'configured checkpoint';
}

export async function getComfyUiStatus(): Promise<ComfyUiStatusResponse> {
  const options = readRegistryOptions(process.env);
  if (!options.comfyui) {
    return {
      status: 'unconfigured',
      message: 'Set COMFYUI_BASE_URL and COMFYUI_IMAGE_MODEL to configure.',
    };
  }

  const model = safeModelLabel(options.comfyui.imageModel);
  let baseUrl: string;
  try {
    baseUrl = validateComfyUiBaseUrl(options.comfyui.baseUrl);
  } catch {
    return { status: 'unreachable', error: UNREACHABLE_MESSAGE, model };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/system_stats`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);

    if (response.ok) return { status: 'ready', model };
    if (response.status >= 300 && response.status < 400) {
      return { status: 'unreachable', error: UNREACHABLE_MESSAGE, model };
    }
    return {
      status: 'unreachable',
      error: `ComfyUI returned HTTP ${response.status}. Check that the local service is ready.`,
      model,
    };
  } catch {
    return { status: 'unreachable', error: UNREACHABLE_MESSAGE, model };
  } finally {
    clearTimeout(timeout);
  }
}
