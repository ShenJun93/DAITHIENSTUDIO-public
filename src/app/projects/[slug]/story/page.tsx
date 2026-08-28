/** Story Development module (TASK-004) — premise to logline / synopsis / beats. */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createStoryService } from '@/application/services/storyService';
import {
  generateStoryAction,
  regenerateStoryPartAction,
  saveStoryDraftAction,
  acceptStoryPartsAction,
  unlockStoryPartsAction,
} from '@/app/actions';
import { StoryEditor } from '@/components/StoryEditor';
import { Card, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const story = await createStoryService(studio).get(slug);

  const hasContent =
    story.brief.logline || story.brief.synopsis || story.brief.beats.length > 0 || story.brief.premise;

  return (
    <div className="space-y-5">
      <Card title="Story Development">
        {!hasContent && (
          <EmptyState
            title="No story development yet"
            hint="Write a premise below and generate a logline, synopsis, theme, tone, hook, cliffhanger and a three-act beat sheet. Works offline on the mock provider."
          />
        )}
        <StoryEditor
          brief={story.brief}
          approvedParts={story.approvedParts}
          updatedAt={project.updatedAt}
          generateAction={generateStoryAction.bind(null, slug)}
          regenerateAction={regenerateStoryPartAction.bind(null, slug)}
          saveAction={saveStoryDraftAction.bind(null, slug)}
          acceptAction={acceptStoryPartsAction.bind(null, slug)}
          unlockAction={unlockStoryPartsAction.bind(null, slug)}
        />
      </Card>
    </div>
  );
}
