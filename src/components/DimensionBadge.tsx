import type { DimensionMeta } from '../types';
import { DIMENSION_META } from '../constants/dimensions';

export function DimensionBadge({ dim, highlight }: { dim: DimensionMeta; highlight?: boolean }) {
  return (
    <span
      className="dim-badge"
      style={{
        background: highlight ? `${dim.color}33` : 'rgba(255,255,255,0.06)',
        color: highlight ? dim.color : 'var(--text-secondary)',
        border: `1px solid ${highlight ? dim.color + '66' : 'transparent'}`,
      }}
      title={dim.description}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dim.color, display: 'inline-block' }} />
      {dim.shortLabel}
    </span>
  );
}

export function DimensionBadgeRow({ highlights }: { highlights?: Set<string> }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {DIMENSION_META.map(dim => (
        <DimensionBadge key={dim.key} dim={dim} highlight={highlights?.has(dim.key)} />
      ))}
    </div>
  );
}
