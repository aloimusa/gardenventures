export interface BuiltVideoClip {
  slug: string;
  duration: number;
  page: string;
  media: string;
}

export function buildVideoGallery(options?: {
  root?: string;
  outDir?: string;
}): Promise<{
  videoRoot: string;
  clips: BuiltVideoClip[];
}>;
