import React from 'react';
import { Composition } from 'remotion';
import { SpikeComposition } from './Composition';
import { compositionData } from './composition-data';

export const RemotionRoot: React.FC = () => {
  const totalDuration = compositionData.shots.reduce(
    (acc, shot) => acc + shot.durationFrames,
    0
  );

  return (
    <>
      {/* 16:9 Composition */}
      <Composition
        id="SpikeAnimatic16x9"
        component={SpikeComposition}
        durationInFrames={totalDuration}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={compositionData}
      />
      {/* 9:16 Composition */}
      <Composition
        id="SpikeAnimatic9x16"
        component={SpikeComposition}
        durationInFrames={totalDuration}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={compositionData}
      />
    </>
  );
};
