import { Card } from '@/components/ui';
import { LoadingShimmer } from '@/components/motion/LoadingShimmer';

export default function ShotEditLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <Card title="Loading">
        <LoadingShimmer lines={6} />
      </Card>
    </div>
  );
}
