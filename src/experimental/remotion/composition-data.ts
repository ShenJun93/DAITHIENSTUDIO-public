import { staticFile } from 'remotion';
import { CompositionProps } from './types';

export const compositionData: CompositionProps = {
  shots: [
    {
      id: 'SH001',
      durationFrames: 60, // 2 seconds at 30fps
      imageUrl: staticFile('shot.jpg'),
      caption: 'The hero enters the scene.',
    },
    {
      id: 'SH002',
      durationFrames: 90, // 3 seconds at 30fps
      imageUrl: staticFile('shot.jpg'),
      caption: 'Looks around suspiciously.',
    },
    {
      id: 'SH003',
      durationFrames: 60, // 2 seconds at 30fps
      imageUrl: staticFile('browser-test.png'),
      caption: 'A shadow moves in the corner.',
    },
  ],
  audioUrl: null,
  metadata: {
    rendererName: 'Remotion Spike',
    watermark: 'EXPERIMENTAL',
    runId: 'RUN-SPIKE-1',
    projectId: 'PROJ-001',
  },
};
