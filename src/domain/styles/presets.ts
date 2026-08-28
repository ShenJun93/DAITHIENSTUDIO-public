/**
 * Style presets (spec §13).
 *
 * Styles are described by *visual attributes* only. No living artist, studio or
 * film franchise is used as a style identifier — that rule is enforced by the
 * prompt linter (`restricted-style-reference`) as well as documented here.
 */
import type { StyleCategory } from '../enums';
import type { StyleDetails } from '../schemas';

export interface StylePreset {
  key: string;
  name: string;
  category: StyleCategory;
  promptBlock: string;
  negativeStyleRules: string;
  details: Partial<StyleDetails>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    key: 'stylized-3d-cinematic-comedy',
    name: 'Stylized 3D Cinematic Comedy',
    category: 'stylized-3d',
    promptBlock:
      'stylized cinematic 3D, expressive character design, rounded forms, exaggerated facial acting, soft global illumination, subtle subsurface skin, shallow cinematic depth of field, high-quality animated feature aesthetic',
    negativeStyleRules:
      'photorealistic pores, uncanny realism, flat 2D linework, low-poly faceting, harsh direct flash, muddy contrast',
    details: {
      medium: 'computer-generated 3D animation',
      renderingStyle: 'physically based shading with stylised falloff',
      texture: 'clean, slightly matte surfaces with soft fabric detail',
      lighting: 'soft key plus warm bounce, gentle rim light',
      cameraLanguage: 'motivated dollies and slow push-ins, 35–85mm equivalents',
      characterProportions: 'slightly enlarged head, expressive eyes, simplified hands',
      colorPalette: ['#F5C36B', '#2E6F9E', '#E2725B', '#F2EAD8'],
      motionStyle: 'snappy anticipation, generous follow-through',
      editingStyle: 'comedic timing, hold on reactions',
    },
  },
  {
    key: 'manhwa-fantasy-2-5d',
    name: '2.5D Manhwa Fantasy',
    category: 'motion-comic-2.5d',
    promptBlock:
      'webtoon-style illustration, crisp variable-width linework, vertical-panel composition, cel shading with gradient rim light, glowing magical accents, separated foreground / midground / background layers for parallax',
    negativeStyleRules: 'photorealistic skin, 3D specular highlights, muddy line weight, western comic halftone',
    details: {
      medium: 'digital illustration prepared as parallax layers',
      lineQuality: 'clean tapered ink lines, heavier on silhouettes',
      renderingStyle: 'cel shading with soft gradient ambient occlusion',
      colorPalette: ['#1B2440', '#5C7CFA', '#F4A0C0', '#FFF3D6'],
      composition: 'vertical reading flow, strong diagonals',
      motionStyle: 'parallax camera, limited character animation, animated hair and cloth',
      transitionStyle: 'panel wipe and speed-line whip',
    },
  },
  {
    key: 'ink-wash-cultivation',
    name: 'Traditional Ink-Wash Cultivation',
    category: 'anime-manga-manhwa',
    promptBlock:
      'traditional East Asian ink-wash painting aesthetic, wet brush gradients, generous negative space, mist-layered mountains, restrained palette with a single accent colour, calligraphic energy in the linework',
    negativeStyleRules: 'saturated neon, plastic 3D shading, photographic depth of field, cluttered detail',
    details: {
      medium: 'ink and wash on textured paper',
      lineQuality: 'calligraphic, variable pressure',
      texture: 'fibrous paper grain, bleeding edges',
      colorPalette: ['#1C1C1C', '#6E7B8B', '#C9C2B4', '#A63A2E'],
      lighting: 'flat ambient with atmospheric perspective',
      composition: 'asymmetric, large empty areas',
      motionStyle: 'slow drifting mist, cloth and sleeve motion',
    },
  },
  {
    key: 'surreal-luxury-commercial',
    name: 'Surreal Luxury Commercial',
    category: 'surreal-dreamlike',
    promptBlock:
      'surreal luxury advertising imagery, liquid metal and glass morphology, macro product beauty lighting, floating petals and slow smoke, seamless material transformation, immaculate reflections',
    negativeStyleRules: 'cluttered background, harsh on-camera flash, visible brand logos, cheap plastic sheen',
    details: {
      medium: 'photoreal CGI with surreal physics',
      lighting: 'large soft sources, controlled specular streaks',
      material: 'chrome, polished glass, silk, water',
      colorPalette: ['#0B0B0F', '#C8A96A', '#EFE7DC', '#5B2D3C'],
      cameraLanguage: 'slow macro dollies, orbiting reveals',
      motionStyle: 'continuous morph chains, no hard cuts',
    },
  },
  {
    key: 'handmade-clay-stop-motion',
    name: 'Handmade Clay Stop-Motion',
    category: 'claymation-stopmotion',
    promptBlock:
      'handmade clay puppet animation aesthetic, visible fingerprints and tool marks, felt and cardboard set dressing, miniature-scale depth of field, practical lamp lighting, 12 frames per second pose stepping',
    negativeStyleRules: 'perfect smooth CGI surfaces, motion blur, photoreal human skin, digital gradients',
    details: {
      medium: 'stop-motion with clay and felt puppets',
      texture: 'plasticine with fingerprints, fuzzy felt',
      lighting: 'small practical lamps, warm and slightly uneven',
      characterProportions: 'stubby limbs, oversized heads',
      motionStyle: 'stepped poses, small imperfections between frames',
      colorPalette: ['#D9773F', '#3F7D57', '#F0E3C2', '#4A3A32'],
    },
  },
  {
    key: 'photoreal-cinematic-fantasy',
    name: 'Cinematic Photorealistic Fantasy',
    category: 'photoreal-cinematic',
    promptBlock:
      'photorealistic cinematic frame, anamorphic 2.39:1 framing, natural skin texture, volumetric atmosphere, practical firelight and moonlight mix, fine film grain, filmic highlight rolloff',
    negativeStyleRules: 'cartoon proportions, cel shading, plastic skin, oversharpened HDR, watermark',
    details: {
      medium: 'live-action-equivalent digital cinematography',
      lensBehavior: 'anamorphic flare, oval bokeh, mild barrel distortion',
      lighting: 'motivated practicals, deep shadow retention',
      colorPalette: ['#0E1420', '#C2743A', '#7A8C99', '#E8DCC8'],
      cameraLanguage: 'steady dolly, restrained handheld for tension',
      environmentalDetail: 'high, with atmospheric haze layers',
    },
  },
  {
    key: 'minimal-motion-graphics',
    name: 'Minimal Motion Graphics',
    category: 'motion-graphics',
    promptBlock:
      'flat vector motion-graphics frame, geometric shapes, generous whitespace, two-accent colour system, crisp grotesque typography, subtle drop shadows, clean icon grid',
    negativeStyleRules: 'photographic texture, gradients with banding, skeuomorphic bevels, stock-photo collage',
    details: {
      medium: 'vector animation',
      composition: '12-column grid, strong left alignment',
      typography: 'geometric sans, tight tracking for headings',
      colorPalette: ['#111827', '#2563EB', '#F59E0B', '#F9FAFB'],
      motionStyle: 'ease-in-out transforms, staggered reveals',
      transitionStyle: 'shape wipes and masked slides',
    },
  },
  {
    key: 'vertical-ugc-commercial',
    name: 'Vertical UGC Commercial',
    category: 'avatar-presenter',
    promptBlock:
      'handheld vertical 9:16 frame, natural window light, lived-in home interior, slightly imperfect framing, authentic phone-camera colour, presenter speaking directly to lens',
    negativeStyleRules: 'studio seamless backdrop, cinematic anamorphic flare, colour-graded teal shadows, stock-model polish',
    details: {
      medium: 'smartphone-style capture',
      lensBehavior: 'wide 24mm equivalent, mild edge distortion',
      lighting: 'soft daylight from one side',
      composition: 'centre-weighted, headroom for captions',
      editingStyle: 'fast jump cuts, hook in the first 2 seconds',
      subtitle: 'large burned-in captions, high contrast',
    },
  },
  {
    key: 'retro-horror-vhs',
    name: 'Retro Horror VHS',
    category: 'photoreal-cinematic',
    promptBlock:
      'degraded analogue video aesthetic, chromatic bleed, tracking distortion lines, heavy grain, low-key practical lighting, 4:3-inspired framing inside a wider canvas, muted sickly palette',
    negativeStyleRules: 'clean digital sharpness, modern colour science, glossy CGI, bright saturated highlights',
    details: {
      medium: 'analogue tape transfer look',
      texture: 'tape noise, halation, scanline artefacts',
      lighting: 'single hard source, deep crushed blacks',
      colorPalette: ['#0A0C0A', '#3E5B4A', '#8A7B5C', '#B03A2E'],
      motionStyle: 'stuttering frame drops, slow creeping camera',
    },
  },
  {
    key: 'paper-cutout-folk-tale',
    name: 'Paper Cut-Out Folk Tale',
    category: 'claymation-stopmotion',
    promptBlock:
      'layered paper cut-out illustration, visible paper edges and slight shadows between layers, hand-torn textures, folk-art motifs, warm lantern lighting, shallow staged depth',
    negativeStyleRules: 'photoreal rendering, 3D specular highlights, digital airbrush gradients, neon colour',
    details: {
      medium: 'cut paper layers photographed in a shadow box',
      texture: 'fibrous torn edges, subtle paper grain',
      lighting: 'warm side light casting layer shadows',
      colorPalette: ['#E9D8A6', '#BB3E03', '#0A9396', '#3D405B'],
      motionStyle: 'sliding layers, hinged limb rotation',
      transitionStyle: 'layer slide and page turn',
    },
  },
];

export function findStylePreset(key: string): StylePreset | undefined {
  return STYLE_PRESETS.find((preset) => preset.key === key);
}

export const DEFAULT_STYLE_PRESET_KEY = 'stylized-3d-cinematic-comedy';
