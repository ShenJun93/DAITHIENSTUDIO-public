/** The available workflows and their steps, including which steps are human gates. */
import { createWorkflowService } from '@/application/services/workflowService';
import { getContext, ok, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = route(async () => ok({ workflows: createWorkflowService(getContext().studio).definitions() }));
