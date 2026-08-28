import { describe, expect, it, vi } from 'vitest';
import { createDeliveryAdapter } from '@/infrastructure/delivery/adapter';

describe('Publishing delivery adapter', () => {
  it('requires explicit destination host enablement', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = createDeliveryAdapter({ fetchImpl });
    await expect(adapter.deliver('https://delivery.example/hook', {}, 'key')).rejects.toThrow('disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts only to an allowlisted host with redirect refusal and idempotency', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const adapter = createDeliveryAdapter({ allowedHosts: ['delivery.example'], fetchImpl });
    await adapter.deliver('https://delivery.example/hook', { exportId: 'exp_1' }, 'delivery_1');
    expect(fetchImpl).toHaveBeenCalledWith(new URL('https://delivery.example/hook'), expect.objectContaining({
      method: 'POST', redirect: 'error', headers: expect.objectContaining({ 'Idempotency-Key': 'delivery_1' }),
    }));
  });
});
