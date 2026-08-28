/** Entry point for `npm run worker`. */
import { getStudio } from '../container';
import { createWorker } from './worker';

const studio = getStudio();
const worker = createWorker(studio, { workerId: `worker-${process.pid}` });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[worker] ${signal} received, finishing the current job then exiting.`);
    worker.stop();
  });
}

worker.start().catch((error: unknown) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
