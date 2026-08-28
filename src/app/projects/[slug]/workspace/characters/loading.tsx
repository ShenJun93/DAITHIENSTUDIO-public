import { Card } from '@/components/ui';
import { LoadingShimmer } from '@/components/motion/LoadingShimmer';

export default function CharacterBrowserLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <Card title="Loading characters">
        <LoadingShimmer lines={4} />
      </Card>
    </div>
  );
}
