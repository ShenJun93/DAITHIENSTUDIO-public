import { createProjectService } from '../../src/application/services/projectService';
import { getStudio } from '../../src/infrastructure/container';

async function main() {
  const studio = getStudio();
  const project = await createProjectService(studio).create({
    title: 'Browser Evidence Blocked Project',
    description: 'CI-only persisted fixture used to prove blocked Project Overview rendering.',
  });

  // projectService.create deliberately creates an initial episode plus an empty
  // script. That is a real persisted Develop-phase blocker derived by the
  // productionJourneyService; no test-only state is injected into the UI.
  console.log(`BLOCKED_SLUG=${project.slug}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
