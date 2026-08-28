export interface ShotData {
  id: string;
  durationFrames: number;
  imageUrl: string;
  caption: string;
}

export interface MetadataBurnIn {
  rendererName: string;
  watermark: string;
  runId: string;
  projectId: string;
}

export interface CompositionProps {
  shots: ShotData[];
  audioUrl: string | null;
  metadata: MetadataBurnIn;
}
