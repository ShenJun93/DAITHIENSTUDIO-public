import { cookies } from 'next/headers';
import type { Studio } from '@/application/ports';
import type { EpisodeRecord } from '@/application/records';
import { createProjectService } from '@/application/services/projectService';

export async function getActiveEpisode(studio: Studio, projectId: string): Promise<EpisodeRecord | null> {
  const cookieStore = await cookies();
  const preferredEpisodeId = cookieStore.get(`studio_ep_${projectId}`)?.value;
  return createProjectService(studio).getActiveEpisode(projectId, preferredEpisodeId);
}
