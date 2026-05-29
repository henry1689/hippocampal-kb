import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { GraphData } from '../types';
import { SCENARIOS } from '../constants/presets';

interface Props {
  data: GraphData;
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function MemoryGraph({ data, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (!data.nodes.length) return;

    const W = 500, H = 400;
    const scenarioColors = Object.fromEntries(SCENARIOS.map(s => [s.id, s.color]));

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(20));

    const link = svg.append('g')
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('stroke-width', d => Math.max(1, d.weight * 3));

    const node = svg.append('g')
      .selectAll('g')
      .data(data.nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => onSelect?.(d.id));

    node.append('circle')
      .attr('r', d => d.id === selectedId ? 10 : 6)
      .attr('fill', d => scenarioColors[d.memory.scenarioId] || '#fff')
      .attr('stroke', d => d.id === selectedId ? '#fff' : 'none')
      .attr('stroke-width', 2);

    node.append('title')
      .text(d => d.memory.title);

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [data, selectedId, onSelect]);

  return (
    <div className="card">
      <div className="section-title">关联图谱</div>
      <div style={{ textAlign: 'center' }}>
        <svg ref={svgRef} width={500} height={400} style={{ maxWidth: '100%' }} />
      </div>
    </div>
  );
}
