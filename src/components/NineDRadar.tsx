import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { Memory, NineDVector } from '../types';
import { DIMENSION_META } from '../constants/dimensions';

interface Props {
  memory: Memory | undefined;
}

export function NineDRadar({ memory }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (!memory) return;

    const dims = DIMENSION_META;
    const values = computeRadarValues(memory);

    const W = 300, H = 300;
    const cx = W / 2, cy = H / 2;
    const radius = 110;
    const levels = 5;
    const angleSlice = Math.PI * 2 / dims.length;

    // Grid rings
    for (let level = 1; level <= levels; level++) {
      const r = radius * level / levels;
      const pts = dims.map((_, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      }).join(' ');
      svg.append('polygon')
        .attr('points', pts)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.06)');
    }

    // Axes + labels
    dims.forEach((dim, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      svg.append('line')
        .attr('x1', cx).attr('y1', cy)
        .attr('x2', cx + radius * Math.cos(angle))
        .attr('y2', cy + radius * Math.sin(angle))
        .attr('stroke', 'rgba(255,255,255,0.08)');

      const labelR = radius + 22;
      const lx = cx + labelR * Math.cos(angle);
      const ly = cy + labelR * Math.sin(angle);
      svg.append('text')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', dim.color)
        .style('font-size', '11px')
        .style('font-weight', '500')
        .text(dim.shortLabel);
    });

    // Data polygon
    const pts = dims.map((dim, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const r = values[i] * radius;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');

    svg.append('polygon')
      .attr('points', pts)
      .attr('fill', 'rgba(255, 213, 79, 0.12)')
      .attr('stroke', 'var(--accent-amber)')
      .attr('stroke-width', 2);

    // Data dots
    dims.forEach((dim, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const r = values[i] * radius;
      svg.append('circle')
        .attr('cx', cx + r * Math.cos(angle))
        .attr('cy', cy + r * Math.sin(angle))
        .attr('r', 3)
        .attr('fill', 'var(--accent-amber)');
    });

  }, [memory]);

  if (!memory) {
    return (
      <div className="card">
        <div className="section-title">9D 感知剖面</div>
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>选择记忆查看剖面</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-title">9D 感知剖面</div>
      <div style={{ textAlign: 'center' }}>
        <svg ref={svgRef} width={300} height={300} style={{ maxWidth: '100%' }} />
      </div>
    </div>
  );
}

function computeRadarValues(memory: Memory): number[] {
  const n = memory.nineD;
  return [
    clamp01(n.X_semantic.keywords.length / 5),
    clamp01(n.Y_time.hour / 24),
    clamp01((n.Z_emotion.vector.valence + 1) / 2),
    clamp01(n.W_who.length / 3),
    0.7,
    n.R_relation.intimacyLevel,
    n.M_depth.importance,
    clamp01(n.G_goods.length / 3),
    sensesActive(n.S_senses),
  ];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function sensesActive(s: NineDVector['S_senses']): number {
  let count = 0;
  for (const val of Object.values(s)) {
    if (val && val.length > 0) count++;
  }
  return count / 5;
}
