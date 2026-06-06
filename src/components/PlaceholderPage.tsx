import { Card, EmptyState, Icon } from '@/components/ui';

interface PlaceholderPageProps {
  title: string;
  icon: string;
  milestone: string;
}

/**
 * Temporary placeholder used during M0 for routes whose feature modules
 * land in later milestones. Replaced as each milestone is implemented.
 */
export function PlaceholderPage({ title, icon, milestone }: PlaceholderPageProps) {
  return (
    <Card glass>
      <EmptyState
        icon={<Icon name={icon} aria-hidden />}
        title={title}
        description={`Modul ini akan dibangun pada ${milestone}. Kerangka & desain sudah siap.`}
      />
    </Card>
  );
}
