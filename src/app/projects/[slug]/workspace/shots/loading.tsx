import { Card } from '@/components/ui';
import { LoadingShimmer } from '@/components/motion/LoadingShimmer';

export default function ShotStoryboardLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <Card title="Loading shots">
        <LoadingShimmer lines={4} />
      </Card>
    </div>
  );
}
