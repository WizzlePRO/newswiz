import type { AccessModel } from '@newswiz/db';
import { ACCESS_LABELS, meterDetail } from '@/lib/format';

export function AccessBadge({
  access,
  meteredLimit = null,
  meteredPeriod = null,
}: {
  access: AccessModel;
  meteredLimit?: number | null;
  meteredPeriod?: 'week' | 'month' | null;
}) {
  const { label, title } = ACCESS_LABELS[access];
  const detail = access === 'metered' ? meterDetail(meteredLimit, meteredPeriod) : null;
  return (
    <span className={`badge ${access}`} title={title}>
      {detail ? `${label} · ${detail}` : label}
    </span>
  );
}
