/**
 * Capability matrix. The application never assumes two providers support the
 * same operations — it asks. An unsupported operation fails fast with
 * UNSUPPORTED_CAPABILITY instead of sending a request that cannot work.
 */
import type { ProviderCapabilities } from '@/application/ports';

export const NO_CAPABILITIES: ProviderCapabilities = {
  textToImage: false,
  imageToImage: false,
  referenceImages: false,
  inpainting: false,
  upscale: false,
  textToVideo: false,
  imageToVideo: false,
  firstLastFrame: false,
  extendVideo: false,
  lipSync: false,
  voice: false,
  music: false,
  sound: false,
  structuredText: false,
  maxVideoSeconds: 0,
  supportedAspectRatios: [],
};

export const MOCK_CAPABILITIES: ProviderCapabilities = {
  ...NO_CAPABILITIES,
  textToImage: true,
  imageToImage: true,
  referenceImages: true,
  inpainting: true,
  upscale: true,
  textToVideo: true,
  imageToVideo: true,
  firstLastFrame: true,
  extendVideo: true,
  lipSync: true,
  voice: true,
  music: true,
  sound: true,
  structuredText: true,
  maxVideoSeconds: 60,
  supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5', '2.39:1', '21:9', '3:2'],
};

export const GOOGLE_CAPABILITIES: ProviderCapabilities = {
  ...NO_CAPABILITIES,
  textToImage: true,
  imageToImage: false,
  referenceImages: false,
  inpainting: false,
  upscale: false,
  textToVideo: true,
  imageToVideo: true,
  firstLastFrame: false,
  extendVideo: false,
  lipSync: false,
  voice: true,
  music: false,
  sound: false,
  structuredText: true,
  maxVideoSeconds: 8,
  supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5', '3:2'],
};

export const COMFYUI_CAPABILITIES: ProviderCapabilities = {
  ...NO_CAPABILITIES,
  textToImage: true,
  supportedAspectRatios: ['1:1'],
};

export function assertCapability(
  capabilities: ProviderCapabilities,
  capability: keyof ProviderCapabilities,
  providerKey: string,
): void {
  if (!capabilities[capability]) {
    throw new Error(`Provider "${providerKey}" does not support ${String(capability)}`);
  }
}
