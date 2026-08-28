import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CompositionProps, ShotData } from './types';

const ShotComponent: React.FC<{ shot: ShotData }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slow zoom effect
  const scale = interpolate(frame, [0, shot.durationFrames], [1, 1.1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: 'black' }}>
      <Img
        src={shot.imageUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
        }}
      />
      {/* Caption at the bottom */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: '5%',
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '32px',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            maxWidth: '80%',
          }}
        >
          {shot.caption}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const SpikeComposition: React.FC<CompositionProps> = ({
  shots,
  audioUrl,
  metadata,
}) => {
  const { width, height } = useVideoConfig();

  let currentStart = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {audioUrl && <Audio src={audioUrl} />}

      {shots.map((shot, index) => {
        const startFrame = currentStart;
        // Simple overlap for crossfade transition could be added here,
        // but for simplicity we will just render them sequentially.
        currentStart += shot.durationFrames;

        // Add a simple opacity fade-in for the first frame as a "transition"
        // In a real scenario, we'd use @remotion/transitions
        return (
          <Sequence
            key={shot.id}
            from={startFrame}
            durationInFrames={shot.durationFrames}
          >
            <ShotComponent shot={shot} />
          </Sequence>
        );
      })}

      {/* Burn-in Metadata Overlay */}
      <AbsoluteFill
        style={{
          padding: '20px',
          pointerEvents: 'none',
          color: 'rgba(255, 255, 255, 0.8)',
          fontFamily: 'monospace',
          fontSize: '18px',
          textShadow: '1px 1px 2px black',
        }}
      >
        <div style={{ position: 'absolute', top: 20, left: 20 }}>
          {metadata.projectId} | {metadata.runId}
        </div>
        <div style={{ position: 'absolute', top: 20, right: 20 }}>
          {metadata.rendererName}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            fontSize: '24px',
            fontWeight: 'bold',
            color: 'rgba(255, 100, 100, 0.8)',
          }}
        >
          {metadata.watermark}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
