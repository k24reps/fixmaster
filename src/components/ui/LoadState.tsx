import { Icon } from './Icon';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { useT } from '@/i18n';
import type { LoadQuery } from './loadPending';

/**
 * Loading or failed state for a list whose emptiness is not known yet. Pair
 * with `loadPending` (./loadPending) before rendering the page's EmptyState.
 */
export function LoadState({ queries }: { queries: LoadQuery[] }) {
  const t = useT();
  const failed = queries.filter((q) => q.error !== null);

  if (failed.length === 0) {
    return (
      <div role="status" aria-live="polite">
        <EmptyState
          icon={<Icon name="circle-notch" className="spin" aria-hidden />}
          title={t('common.loading')}
        />
      </div>
    );
  }

  return (
    <div role="alert">
      <EmptyState
        icon={<Icon name="triangle-exclamation" aria-hidden />}
        title={t('common.loadFailed')}
        description={t('common.loadFailedDescription')}
        action={
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Icon name="repeat" aria-hidden />}
            onClick={() => failed.forEach((q) => void q.refetch())}
          >
            {t('common.retry')}
          </Button>
        }
      />
    </div>
  );
}
