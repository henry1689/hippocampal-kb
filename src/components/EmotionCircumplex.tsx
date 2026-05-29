import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { Memory } from '../types';
import { EMOTION_PROTOTYPES, emotionToColor } from '../constants/emotions';
import { SCENARIOS } from '../constants/presets';

interface Props {
  memories: Memory[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function EmotionCircumplex({ memories, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const W = 360, H = 300;
    const margin = 30;
    const w = W - margin * 2, h = H - margin * 2;

    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${margin},${margin})`);

    const xScale = d3.scaleLinear().domain([-1, 1]).range([0, w]);
    const yScale = d3.scaleLinear().domain([1, -1]).range([0, h]);

    // Background quadrants
    g.append('rect').attr('x', 0).attr('y', 0).attr('width', w/2).attr('height', h/2)
      .attr('fill', 'rgba(255, 100, 100, 0.05)');     // high arousal, negative valence
    g.append('rect').attr('x', w/2).attr('y', 0).attr('width', w/2).attr('height', h/2)
      .attr('fill', 'rgba(255, 200, 100, 0.05)');     // high arousal, positive valence
    g.append('rect').attr('x', 0).attr('y', h/2).attr('width', w/2).attr('height', h/2)
      .attr('fill', 'rgba(100, 100, 200, 0.05)');     // low arousal, negative valence
    g.append('rect').attr('x', w/2).attr('y', h/2).attr('width', w/2).attr('height', h/2)
      .attr('fill', 'rgba(100, 200, 100, 0.05)');     // low arousal, positive valence

    // Axes
    g.append('line').attr('x1', 0).attr('y1', h/2).attr('x2', w).attr('y2', h/2).attr('stroke', 'rgba(255,255,255,0.1)');
    g.append('line').attr('x1', w/2).attr('y1', 0).attr('x2', w/2).attr('y2', h).attr('stroke', 'rgba(255,255,255,0.1)');
    g.append('text').attr('x', w).attr('y', h/2 - 6).attr('text-anchor', 'end').attr('fill', 'var(--text-muted)').style('font-size', '10px').text('愉快 ← valence → 不愉快');
    g.append('text').attr('x', w/2 + 4).attr('y', 10).attr('fill', 'var(--text-muted)').style('font-size', '10px').text('兴奋 ↑');

    // Emotion prototype labels
    EMOTION_PROTOTYPES.forEach(p => {
      const cx = xScale(p.valence), cy = yScale(p.arousal);
      g.append('text')
        .attr('x', cx).attr('y', cy)
        .attr('text-anchor', 'middle').attr('dy', '-4')
        .attr('fill', 'rgba(255,255,255,0.15)')
        .style('font-size', '8px')
        .text(p.label);
    });

    // Scenario color map
    const scenarioColors = Object.fromEntries(SCENARIOS.map(s => [s.id, s.color]));

    // Data points
    memories.forEach(m => {
      const v = m.nineD.Z_emotion.vector;
      const cx = xScale(v.valence), cy = yScale(v.arousal);
      const isSelected = m.id === selectedId;
      const color = scenarioColors[m.scenarioId] || '#fff';

      const gPoint = g.append('g')
        .attr('cursor', 'pointer')
        .on('click', () => onSelect?.(m.id));

      gPoint.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', isSelected ? 8 : 5)
        .attr('fill', color)
        .attr('opacity', isSelected ? 1 : 0.6)
        .attr('stroke', isSelected ? '#fff' : 'none')
        .attr('stroke-width', 2);

      if (isSelected) {
        gPoint.append('circle')
          .attr('cx', cx).attr('cy', cy)
          .attr('r', 12).attr('fill', 'none')
          .attr('stroke', color).attr('stroke-width', 1)
          .attr('opacity', 0.5);
      }

      // Tooltip
      gPoint.append('title').text(`${m.title}\n(${v.valence.toFixed(2)}, ${v.arousal.toFixed(2)})`);
    });
  }, [memories, selectedId, onSelect]);

  return (
    <div className="card">
      <div className="section-title">情感环状图 (Circumplex)</div>
      <div style={{ textAlign: 'center' }}>
        <svg ref={svgRef} width={360} height={300} style={{ maxWidth: '100%' }} />
      </div>
    </div>
  );
}
