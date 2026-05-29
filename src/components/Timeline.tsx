import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { Memory } from '../types';
import { SCENARIOS } from '../constants/presets';

interface Props {
  memories: Memory[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function Timeline({ memories, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (!memories.length) return;

    const sorted = [...memories].sort((a, b) => a.timestamp - b.timestamp);
    const W = 800, H = 130;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(sorted, m => m.timestamp) as [number, number])
      .range([0, w]);

    const yScale = d3.scaleLinear().domain([-1, 1]).range([h, 0]);

    // Emotion curve
    const line = d3.line<Memory>()
      .x(m => xScale(m.timestamp))
      .y(m => yScale(m.nineD.Z_emotion.vector.valence))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(sorted)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', 'var(--accent-amber)')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.4);

    // Zero line
    g.append('line')
      .attr('x1', 0).attr('y1', yScale(0))
      .attr('x2', w).attr('y2', yScale(0))
      .attr('stroke', 'rgba(255,255,255,0.06)')
      .attr('stroke-dasharray', '4');

    // X axis
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(sorted.length).tickFormat((d: any) => {
        const m = sorted.find(m => m.timestamp === +d);
        return m ? `${m.nineD.Y_time.season}·${m.nineD.Y_time.dayNight}` : '';
      }));
    xAxis.selectAll('text').attr('fill', 'var(--text-muted)').style('font-size', '9px');
    xAxis.selectAll('line,path').attr('stroke', 'rgba(255,255,255,0.08)');

    // Y axis
    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale).ticks(3).tickFormat((d: any) => d.toFixed(1)));
    yAxis.selectAll('text').attr('fill', 'var(--text-muted)').style('font-size', '9px');
    yAxis.selectAll('line,path').attr('stroke', 'rgba(255,255,255,0.08)');

    const scenarioColors = Object.fromEntries(SCENARIOS.map(s => [s.id, s.color]));

    g.selectAll('circle')
      .data(sorted)
      .join('circle')
      .attr('cx', m => xScale(m.timestamp))
      .attr('cy', m => yScale(m.nineD.Z_emotion.vector.valence))
      .attr('r', m => m.id === selectedId ? 8 : 5)
      .attr('fill', m => scenarioColors[m.scenarioId] || '#fff')
      .attr('stroke', m => m.id === selectedId ? '#fff' : 'none')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('click', (_, m) => onSelect?.(m.id));

    g.selectAll('circle').append('title')
      .text(m => `${m.title}\nvalence=${m.nineD.Z_emotion.vector.valence.toFixed(2)}`);

  }, [memories, selectedId, onSelect]);

  return (
    <div className="card">
      <div className="section-title">时间线 · 情感曲线</div>
      <div style={{ textAlign: 'center' }}>
        <svg ref={svgRef} width={800} height={130} style={{ maxWidth: '100%' }} />
      </div>
    </div>
  );
}
