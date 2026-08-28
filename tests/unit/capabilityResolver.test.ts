import { describe, expect, it } from 'vitest';
import type { ProviderDescriptor } from '@/application/ports';
import { createCapabilityResolver, type CapabilityContext } from '@/application/services/capabilityResolver';
import { NO_CAPABILITIES } from '@/infrastructure/providers/capabilities';

const baseContext: CapabilityContext = {
  productionType: 'motion-comic',
  projectStatus: 'production',
  providerDescriptors: [],
};

function descriptor(
  key: string,
  capabilities: Partial<ProviderDescriptor['capabilities']>,
  offline = false,
): ProviderDescriptor {
  return {
    key,
    label: key,
    offline,
    models: {},
    capabilities: { ...NO_CAPABILITIES, ...capabilities },
  };
}

describe('capability resolver', () => {
  it('blocks every capability when explicit production type identity is missing', () => {
    const resolver = createCapabilityResolver();
    expect(resolver.resolve({ ...baseContext, productionType: null }, 'continuity.check')).toEqual({
      key: 'continuity.check',
      state: 'BLOCKED',
      reasonCode: 'PRODUCTION_TYPE_REQUIRED',
    });
  });

  it('treats a required workflow node as applicable', () => {
    const resolver = createCapabilityResolver();
    expect(resolver.resolve(baseContext, 'continuity.check')).toEqual({
      key: 'continuity.check',
      state: 'AVAILABLE',
      reasonCode: null,
    });
  });

  it('treats an optional workflow node as applicable rather than unsupported', () => {
    const resolver = createCapabilityResolver();
    expect(resolver.resolve(baseContext, 'generation.video.submit').reasonCode).not.toBe(
      'NOT_APPLICABLE_TO_PRODUCTION_TYPE',
    );
  });

  it('blocks mutation and execution capabilities for an archived project', () => {
    const resolver = createCapabilityResolver();
    const archived = { ...baseContext, projectStatus: 'archived' as const };
    for (const key of [
      'generation.image.submit',
      'generation.video.submit',
      'asset.approve',
      'composer.compose',
      'export.create',
    ] as const) {
      expect(resolver.resolve(archived, key)).toEqual({
        key,
        state: 'BLOCKED',
        reasonCode: 'PROJECT_ARCHIVED',
      });
    }
  });

  it('keeps continuity.check readable for an archived project', () => {
    const resolver = createCapabilityResolver();
    expect(resolver.resolve({ ...baseContext, projectStatus: 'archived' }, 'continuity.check')).toEqual({
      key: 'continuity.check',
      state: 'AVAILABLE',
      reasonCode: null,
    });
  });

  it('blocks image generation when no descriptor supports textToImage', () => {
    const resolver = createCapabilityResolver();
    expect(resolver.resolve(baseContext, 'generation.image.submit')).toEqual({
      key: 'generation.image.submit',
      state: 'BLOCKED',
      reasonCode: 'NO_CAPABLE_PROVIDER',
    });
  });

  it('blocks video generation when providers support image but not textToVideo', () => {
    const resolver = createCapabilityResolver();
    const context = {
      ...baseContext,
      providerDescriptors: [descriptor('image-only', { textToImage: true })],
    };
    expect(resolver.resolve(context, 'generation.video.submit')).toEqual({
      key: 'generation.video.submit',
      state: 'BLOCKED',
      reasonCode: 'NO_CAPABLE_PROVIDER',
    });
  });

  it('accepts an offline descriptor when it actually supports the required capability', () => {
    const resolver = createCapabilityResolver();
    const context = {
      ...baseContext,
      providerDescriptors: [descriptor('offline-capable', { textToVideo: true }, true)],
    };
    expect(resolver.resolve(context, 'generation.video.submit')).toEqual({
      key: 'generation.video.submit',
      state: 'AVAILABLE',
      reasonCode: null,
    });
  });

  it('resolveAll returns only the requested capability keys using the same precedence', () => {
    const resolver = createCapabilityResolver();
    const context = {
      ...baseContext,
      providerDescriptors: [descriptor('mock-like', { textToImage: true, textToVideo: true }, true)],
    };

    expect(resolver.resolveAll(context, ['continuity.check', 'generation.image.submit'])).toEqual({
      'continuity.check': {
        key: 'continuity.check',
        state: 'AVAILABLE',
        reasonCode: null,
      },
      'generation.image.submit': {
        key: 'generation.image.submit',
        state: 'AVAILABLE',
        reasonCode: null,
      },
    });
  });
});
