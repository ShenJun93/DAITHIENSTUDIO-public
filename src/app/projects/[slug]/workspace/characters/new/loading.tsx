import { Card } from '@/components/ui';
import { LoadingShimmer } from '@/components/motion/LoadingShimmer';

export default function CharacterCreateLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <Card title="Loading" className="mx-auto max-w-2xl">
        <LoadingShimmer lines={4} />
      </Card>
    </div>
  );
}
