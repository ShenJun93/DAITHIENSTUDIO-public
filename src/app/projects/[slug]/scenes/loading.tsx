import { Card } from '@/components/ui';
import { LoadingShimmer } from '@/components/motion/LoadingShimmer';

export default function ScenesLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <Card title="Loading">
        <LoadingShimmer lines={5} />
      </Card>
    </div>
  );
}
