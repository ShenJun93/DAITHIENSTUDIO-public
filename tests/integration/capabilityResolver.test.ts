import { describe, expect, it } from 'vitest';
import { CAPABILITY_KEYS } from '@/domain/capability';
import { createCapabilityResolver } from '@/application/services/capabilityResolver';
import { DefaultProviderRegistry } from '@/infrastructure/providers/registry';

describe('capability resolver integration', () => {
  it('resolves the six motion-comic capabilities from the accepted template and real mock registry descriptors', () => {
    const providers = new DefaultProviderRegistry({
      defaults: {
        text: 'mock',
        image: 'mock',
        video: 'mock',
        voice: 'mock',
        music: 'mock',
        sound: 'mock',
      },
      google: null,
      comfyui: null,
    });

    const resolver = createCapabilityResolver();
    const result = resolver.resolveAll(
      {
        productionType: 'motion-comic',
        projectStatus: 'production',
        providerDescriptors: providers.descriptors(),
      },
      CAPABILITY_KEYS,
    );

    for (const key of CAPABILITY_KEYS) {
      expect(result[key]).toEqual({ key, state: 'AVAILABLE', reasonCode: null });
    }
  });
});
