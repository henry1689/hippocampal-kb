import { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import type { Memory, NineDVector } from '../types';
import { DIMENSION_META } from '../constants/dimensions';

type DimKey = keyof NineDVector;

// ─── Data types ───────────────────────────────────
interface KWNode {
  id: string;
  label: string;
  dim: DimKey;
  dimLabel: string;
  freq: number;
  memoryIds: string[];
}

interface KWEdge {
  source: string;
  target: string;
  weight: number;
}

interface Props {
  memories: Memory[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

const DIM_MAP = new Map(DIMENSION_META.map(d => [d.key, d]));
const VISIBLE_DIMS = ['X_semantic', 'Z_emotion', 'W_who', 'V_venue', 'G_goods', 'S_senses'];

// ─── Helpers for edge source/target resolution ────
function edgeSource(e: KWEdge & any): string {
  return typeof e.source === 'object' ? e.source.id : e.source;
}
function edgeTarget(e: KWEdge & any): string {
  return typeof e.target === 'object' ? e.target.id : e.target;
}

// ─── Graph builder ─────────────────────────────────
function buildGraph(memories: Memory[]): { nodes: KWNode[]; edges: KWEdge[] } {
  const nodeMap = new Map<string, KWNode>();
  const edgeCount = new Map<string, { source: string; target: string; count: number }>();

  for (const mem of memories) {
    const n = mem.nineD;
    const localIds: string[] = [];

    const addNode = (prefix: string, label: string, dim: DimKey) => {
      const id = `${prefix}:${label}`;
      let node = nodeMap.get(id);
      if (!node) {
        const meta = DIM_MAP.get(dim);
        node = { id, label, dim, dimLabel: meta?.shortLabel || dim, freq: 0, memoryIds: [] };
        nodeMap.set(id, node);
      }
      node.freq++;
      if (!node.memoryIds.includes(mem.id)) node.memoryIds.push(mem.id);
      if (!localIds.includes(id)) localIds.push(id);
    };

    for (const kw of (n.X_semantic?.keywords || [])) addNode('X', kw, 'X_semantic');
    for (const tp of (n.X_semantic?.topics || [])) addNode('X', tp, 'X_semantic');
    if (n.Z_emotion?.primaryType) addNode('Z', n.Z_emotion.primaryType, 'Z_emotion');
    for (const p of (n.W_who || [])) {
      if (!['用户', 'AI', '我', '你'].includes(p.name)) addNode('W', p.name, 'W_who');
    }
    if (n.V_venue?.type) addNode('V', n.V_venue.type, 'V_venue');
    for (const g of (n.G_goods || [])) addNode('G', g.name, 'G_goods');

    const senses = n.S_senses;
    if (senses) {
      const seen = new Set<string>();
      for (const field of [senses.visual, senses.auditory, senses.olfactory, senses.tactile, senses.taste]) {
        if (!field) continue;
        const chars = [...field];
        for (let i = 0; i < chars.length - 1; i++) {
          const a = chars[i], b = chars[i + 1];
          if (/[一-鿿]/.test(a) && /[一-鿿]/.test(b)) {
            const bg = a + b;
            if (!'的了我是在有和他她都就也'.includes(bg) && !seen.has(bg)) {
              seen.add(bg);
              addNode('S', bg, 'S_senses');
            }
          }
        }
      }
    }
    for (const tag of (mem.tags || [])) addNode('X', tag, 'X_semantic');

    // Edges: co-occurrence in same memory
    for (let i = 0; i < localIds.length; i++) {
      for (let j = i + 1; j < localIds.length; j++) {
        const [a, b] = localIds[i] < localIds[j] ? [localIds[i], localIds[j]] : [localIds[j], localIds[i]];
        const key = `${a}||${b}`;
        let entry = edgeCount.get(key);
        if (!entry) {
          entry = { source: a, target: b, count: 0 };
          edgeCount.set(key, entry);
        }
        entry.count++;
      }
    }
  }

  return {
    nodes: [...nodeMap.values()].filter(n => n.freq > 0),
    edges: [...edgeCount.values()]
      .map(e => ({ source: e.source, target: e.target, weight: Math.min(e.count / 3, 1) }))
      .filter(e => e.weight > 0.01),
  };
}

// ─── React Component ─────────────────────────────
export function KeywordGraph({ memories, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<string | null>(null);
  const simRef = useRef<d3.Simulation<KWNode, KWEdge> | null>(null);

  const graphData = useMemo(() => buildGraph(memories), [memories]);

  // Compute set of highlighted node IDs based on selected memory (from panels)
  const highlightedIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId || memories.length === 0) return set;
    const mem = memories.find(m => m.id === selectedId);
    if (!mem) return set;

    const n = mem.nineD;
    const addIf = (prefix: string, label: string) => { if (label) set.add(`${prefix}:${label}`); };
    for (const kw of (n.X_semantic?.keywords || [])) addIf('X', kw);
    for (const tp of (n.X_semantic?.topics || [])) addIf('X', tp);
    if (n.Z_emotion?.primaryType) addIf('Z', n.Z_emotion.primaryType);
    for (const p of (n.W_who || [])) if (!['用户', 'AI', '我', '你'].includes(p.name)) addIf('W', p.name);
    if (n.V_venue?.type) addIf('V', n.V_venue.type);
    for (const g of (n.G_goods || [])) addIf('G', g.name);

    const directIds = new Set(set);
    for (const edge of graphData.edges) {
      if (directIds.has(edge.source) || directIds.has(edge.target)) {
        set.add(edge.source);
        set.add(edge.target);
      }
    }
    return set;
  }, [selectedId, memories, graphData]);

  // ── D3 rendering ──
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    const tooltip = d3.select(tooltipRef.current);
    const { nodes, edges } = graphData;
    if (nodes.length === 0) return;

    const W = svgEl.clientWidth || 420;
    const H = 320;
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    // Unique filter ID avoids conflicts with multiple instances
    const filterId = `kw-glow-${Math.random().toString(36).slice(2, 8)}`;
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', filterId);
    filter.append('feGaussianBlur').attr('stdDeviation', 2.5).attr('result', 'blur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // ── Background circle (brain-like spherical boundary) ──
    const maxR = Math.min(W, H) * 0.38;
    svg.append('circle')
      .attr('cx', W / 2).attr('cy', H / 2)
      .attr('r', maxR)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.04)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,6');

    // ── Simulation — compact spherical brain-like layout ──
    const simulation = d3.forceSimulation(nodes as unknown as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(edges).id(d => (d as any).id).distance(50).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => 6 + Math.sqrt((d as any).freq) * 1.5))
      .force('bound', (alpha: number) => {
        const cx = W / 2, cy = H / 2;
        for (const d of nodes) {
          const dx = (d as any).x - cx;
          const dy = (d as any).y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxR * (0.7 + alpha * 0.3)) {
            const ratio = maxR * (0.7 + alpha * 0.3) / dist;
            (d as any).x = cx + dx * ratio;
            (d as any).y = cy + dy * ratio;
          }
        }
      })
      .alphaDecay(0.02)
      .velocityDecay(0.42);
    simRef.current = simulation;

    // ── Edges ──
    const link = svg.append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', d => d.weight >= 0.33 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.04)')
      .attr('stroke-width', d => Math.max(0.5, d.weight * 2))
      .attr('stroke-dasharray', d => d.weight >= 0.33 ? null : '3,3');

    // ── Nodes ──
    const nodeG = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'grab');

    nodeG.append('circle')
      .attr('r', d => 4 + Math.sqrt(d.freq) * 3)
      .attr('fill', d => DIM_MAP.get(d.dim)?.color || '#fff')
      .attr('stroke', d => (highlightedIds.has(d.id) || focusedRef.current === d.id) ? 'rgba(255,213,79,0.8)' : 'none')
      .attr('stroke-width', 2)
      .attr('filter', d => focusedRef.current === d.id ? `url(#${filterId})` : 'none')
      .attr('opacity', d => {
        if (focusedRef.current) return focusedRef.current === d.id ? 1 : 0.06;
        if (highlightedIds.size === 0) return 0.75;
        return highlightedIds.has(d.id) ? 1 : 0.08;
      });

    nodeG.append('text')
      .text(d => {
        if (focusedRef.current) return focusedRef.current === d.id ? d.label : '';
        if (highlightedIds.size > 0) return highlightedIds.has(d.id) ? d.label : '';
        return d.freq > 2 ? d.label : '';
      })
      .attr('dx', d => 4 + Math.sqrt(d.freq) * 3 + 5)
      .attr('dy', 4)
      .attr('font-size', 10)
      .attr('fill', d => (highlightedIds.has(d.id) || focusedRef.current === d.id) ? '#ffd54f' : 'rgba(255,255,255,0.4)')
      .attr('pointer-events', 'none');

    // ── Reset to default visual state ──
    function resetToDefault() {
      nodeG.selectAll('circle')
        .transition().duration(200)
        .attr('opacity', d => {
          if (focusedRef.current) return focusedRef.current === d.id ? 1 : 0.06;
          if (highlightedIds.size === 0) return 0.75;
          return highlightedIds.has(d.id) ? 1 : 0.08;
        })
        .attr('filter', d => focusedRef.current === d.id ? `url(#${filterId})` : 'none')
        .attr('stroke', d => (highlightedIds.has(d.id) || focusedRef.current === d.id) ? 'rgba(255,213,79,0.8)' : 'none');
      nodeG.selectAll('text')
        .text(d => {
          if (focusedRef.current) return focusedRef.current === d.id ? d.label : '';
          if (highlightedIds.size > 0) return highlightedIds.has(d.id) ? d.label : '';
          return d.freq > 2 ? d.label : '';
        })
        .attr('fill', d => (highlightedIds.has(d.id) || focusedRef.current === d.id) ? '#ffd54f' : 'rgba(255,255,255,0.4)');
      link
        .transition().duration(200)
        .attr('opacity', 1)
        .attr('stroke', d => d.weight >= 0.33 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.04)');
    }

    // ── Drag (Obsidian-like: grab and move, node stays when released) ──
    const drag = d3.drag<SVGGElement, KWNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        // Keep node in place after drag (release only on click unfocus)
        d.fx = d.x;
        d.fy = d.y;
      });
    nodeG.call(drag as any);

    // ── Hover ──
    nodeG.on('mouseenter', function (_, d) {
      if (focusedRef.current) return; // Don't hover-highlight when focused
      const neighborIds = new Set([d.id]);
      edges.forEach(e => {
        if (edgeSource(e) === d.id || edgeTarget(e) === d.id) {
          neighborIds.add(edgeSource(e));
          neighborIds.add(edgeTarget(e));
        }
      });
      d3.select(this).select('circle').attr('cursor', 'pointer');
      nodeG.selectAll('circle')
        .transition().duration(120)
        .attr('opacity', nd => neighborIds.has(nd.id) ? 1 : 0.04);
      nodeG.selectAll('text')
        .text(nd => neighborIds.has(nd.id) ? nd.label : '');
      link
        .transition().duration(120)
        .attr('opacity', e => edgeSource(e) === d.id || edgeTarget(e) === d.id ? 0.9 : 0.01);
      const dimMeta = DIM_MAP.get(d.dim);
      tooltip
        .style('opacity', 1)
        .html(`<strong>${d.label}</strong> <span style="color:${dimMeta?.color || '#fff'}">(${d.dimLabel})</span> · ${d.freq} 次出现`);
    });

    nodeG.on('mousemove', function (event) {
      const [mx, my] = d3.pointer(event, svgEl.parentElement!);
      tooltip
        .style('left', Math.min(mx + 14, W - 200) + 'px')
        .style('top', Math.max(my - 32, 4) + 'px');
    });

    nodeG.on('mouseleave', function () {
      if (focusedRef.current) return;
      tooltip.style('opacity', 0);
      resetToDefault();
    });

    // ── Click to focus (Obsidian-like focus mode) ──
    nodeG.on('click', function (event, d) {
      event.stopPropagation();
      const wasFocused = focusedRef.current === d.id;
      focusedRef.current = wasFocused ? null : d.id;

      if (focusedRef.current) {
        // Focus: highlight this node and its 1-hop neighbors
        const neighborIds = new Set([focusedRef.current]);
        edges.forEach(e => {
          if (edgeSource(e) === focusedRef.current || edgeTarget(e) === focusedRef.current) {
            neighborIds.add(edgeSource(e));
            neighborIds.add(edgeTarget(e));
          }
        });
        nodeG.selectAll('circle')
          .transition().duration(200)
          .attr('opacity', nd => neighborIds.has(nd.id) ? 1 : 0.04)
          .attr('filter', nd => nd.id === focusedRef.current ? `url(#${filterId})` : 'none')
          .attr('stroke', nd => nd.id === focusedRef.current ? 'rgba(255,213,79,1)' : 'none');
        nodeG.selectAll('text')
          .text(nd => neighborIds.has(nd.id) ? nd.label : '');
        link
          .transition().duration(200)
          .attr('opacity', e => edgeSource(e) === d.id || edgeTarget(e) === d.id ? 0.8 : 0.01);
      } else {
        resetToDefault();
      }

      // Also navigate to related memory
      if (d.memoryIds.length > 0 && onSelect) {
        onSelect(d.memoryIds[0]);
      }
    });

    // Click on background → unfocus
    svg.on('click', function (event) {
      if (event.target === svgEl || (event.target as Element).tagName === 'svg') {
        focusedRef.current = null;
        resetToDefault();
      }
    });

    // ── Tick ──
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);
      nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [graphData, highlightedIds, onSelect]);

  // ── Render ──
  return (
    <div className="card" style={{ minHeight: 380 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>🔤 词元关联图谱</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {graphData.nodes.length} 词元 · {graphData.edges.length} 关联
        </div>
      </div>

      {/* Dimension legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {DIMENSION_META.filter(d => VISIBLE_DIMS.includes(d.key)).map(d => (
          <span key={d.key} style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
            {d.shortLabel}
          </span>
        ))}
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', marginLeft: 'auto' }}>
          拖动词元 · 点击聚焦 · 再次点击取消
        </span>
      </div>

      {/* SVG canvas */}
      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} width="100%" height={320} style={{ display: 'block' }} />
        <div ref={tooltipRef} style={{
          position: 'absolute', pointerEvents: 'none', opacity: 0,
          padding: '4px 10px', borderRadius: 6, fontSize: 11, lineHeight: 1.4,
          background: 'rgba(0,0,0,0.85)', color: '#fff', whiteSpace: 'nowrap',
          transition: 'opacity 0.12s', zIndex: 100,
        }} />
      </div>
    </div>
  );
}
