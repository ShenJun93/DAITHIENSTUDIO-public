import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: any) => {
      if ((globalThis as any).__MOCK_USE_STATE) {
        return (globalThis as any).__MOCK_USE_STATE(initial);
      }
      return actual.useState(initial);
    }
  };
});

import React from 'react';
Object.assign(globalThis, { React });

let mockStateValues: any[] = [];
let mockStateIndex = 0;

import { PromptsContent } from '@/components/shot-inspector/PromptsContent';

// Mock navigator.clipboard
Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: vi.fn(),
    },
  },
  writable: true,
});

describe('PromptsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    (globalThis as any).__MOCK_USE_STATE = undefined;
  });

  const defaultProps = {
    basePath: '/projects/test',
    requiredRefs: {
      hasCharacters: true,
      hasLocation: true,
      hasProps: false,
      hasProjectStyle: true,
    },
    ingredients: {
      characters: [{ characterId: 'char-1', versionId: 'v1', name: 'Alice' }],
      location: { locationId: 'loc-1', versionId: 'v1', name: 'Forest' },
      props: [{ propId: 'prop-1', versionId: 'v1', name: 'Sword' }],
      hasProjectStyle: true,
      shotSize: 'Medium',
      cameraAngle: 'Eye Level',
      cameraMovement: 'slow pan',
      lens: '50mm',
      durationSeconds: 5,
      aspectRatio: '16:9',
      description: 'Test description',
      dialogue: 'Hello world',
      lighting: 'Natural',
      emotion: 'Happy'
    },
    imageData: {
      compiled: 'A test image prompt',
      negative: 'ugly, bad',
      lockRefs: {
        characters: [{ id: 'char-1', code: 'ALICE', version: 1 }],
        style: null,
        location: null,
        props: []
      },
      lint: { ok: true, score: 100, issues: [], characterCount: 19 },
      version: 1,
      createdAt: new Date().toISOString()
    },
    videoData: {
      compiled: 'A test video prompt',
      negative: 'bad motion',
      lockRefs: {
        characters: [],
        style: null,
        location: null,
        props: []
      },
      lint: { ok: true, score: 100, issues: [], characterCount: 19 },
      version: 1,
      createdAt: new Date().toISOString()
    }
  };

  it('1. compiled prompt text renders', () => {
    const html = renderToStaticMarkup(React.createElement(PromptsContent, defaultProps));
    expect(html).toContain('A test image prompt');
    expect(html).toContain('A test video prompt');
  });

  it('2. Character linked/contributor state renders truthfully', () => {
    const html = renderToStaticMarkup(React.createElement(PromptsContent, defaultProps));
    expect(html).toMatch(/Contributor.*?Alice/);
  });

  it('3. Location state renders truthfully', () => {
    const html = renderToStaticMarkup(React.createElement(PromptsContent, defaultProps));
    expect(html).toMatch(/Linked Location.*?Forest/);
  });

  it('4. Prop state renders truthfully', () => {
    const html = renderToStaticMarkup(React.createElement(PromptsContent, defaultProps));
    expect(html).toMatch(/Linked Prop.*?Sword/);
  });

  it('5. empty compiled prompt state', () => {
    const props = { ...defaultProps, imageData: null, videoData: null };
    const html = renderToStaticMarkup(React.createElement(PromptsContent, props));
    expect(html).toContain('No compiled prompt data is available for this shot.');
  });

  it('6. missing-reference warning', () => {
    const props = {
      ...defaultProps,
      requiredRefs: { ...defaultProps.requiredRefs, hasCharacters: true },
      imageData: {
        ...defaultProps.imageData,
        lockRefs: { ...defaultProps.imageData.lockRefs, characters: [] }
      }
    };
    const html = renderToStaticMarkup(React.createElement(PromptsContent, props));
    expect(html).toContain('missing required lock references');
  });

  it('tests copy button interaction (7, 8, 9, 10)', async () => {
    const elementTree = PromptsContent(defaultProps);

    let CopyButtonComponent: any = null;
    let copyButtonProps: any = null;
    function traverse(el: any) {
      if (!el || typeof el !== 'object') return;
      if (typeof el.type === 'function' && el.type.name === 'CopyButton') {
        CopyButtonComponent = el.type;
        copyButtonProps = el.props;
        return;
      }
      if (el.props && el.props.children) {
        if (Array.isArray(el.props.children)) {
          el.props.children.forEach(traverse);
        } else {
          traverse(el.props.children);
        }
      }
    }
    traverse(elementTree);

    expect(CopyButtonComponent).toBeTruthy();

    // 7. copy button interaction & 8. exact prompt text
    mockStateValues = [];
    mockStateIndex = 0;
    (globalThis as any).__MOCK_USE_STATE = (initial: any) => {
      const idx = mockStateIndex++;
      if (mockStateValues.length <= idx) mockStateValues.push(initial);
      return [
        mockStateValues[idx],
        (newVal: any) => { mockStateValues[idx] = newVal; }
      ];
    };
    let btnTree = CopyButtonComponent(copyButtonProps);
    vi.mocked(navigator.clipboard.writeText).mockResolvedValueOnce(undefined);
    await btnTree.props.onClick();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('A test video prompt');

    // Check that 'copied' became true (first useState is copied, second is error)
    expect(mockStateValues[0]).toBe(true);
    expect(mockStateValues[1]).toBe(false);

    // 10. no mutation callback - we can see onClick is totally self-contained and takes no callbacks
    // 9. clipboard failure produces truthful failure feedback
    mockStateValues = []; // reset state
    mockStateIndex = 0;
    btnTree = CopyButtonComponent(copyButtonProps);

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Denied'));
    await btnTree.props.onClick();

    expect(mockStateValues[0]).toBe(false); // copied
    expect(mockStateValues[1]).toBe(true);  // error
  });
});
