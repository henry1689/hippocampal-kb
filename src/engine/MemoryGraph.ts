/**
 * Builds a force-directed graph by computing 9D pairwise edges between memories.
 */

import type { Memory, NineDVector, GraphData } from '../types';
import { jaccard } from '../utils/similarity';

type DimKey = keyof NineDVector;

export class MemoryGraphBuilder {
  build(memories: Memory[], threshold = 0.15): GraphData {
    const nodes = memories.map(m => ({ id: m.id, memory: m }));
    const edges: GraphData['edges'] = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const edge = this.computeEdge(memories[i], memories[j], threshold);
        if (edge) edges.push(edge);
      }
    }
    return { nodes, edges };
  }

  private computeEdge(m1: Memory, m2: Memory, threshold: number): GraphData['edges'][0] | null {
    const connectingDimensions: DimKey[] = [];
    let totalWeight = 0;

    const checks: [DimKey, number][] = [
      ['X_semantic', jaccard(m1.nineD.X_semantic.keywords, m2.nineD.X_semantic.keywords)],
      ['Y_time', this.timeSim(m1, m2)],
      ['Z_emotion', this.emoSim(m1, m2)],
      ['W_who', jaccard(m1.nineD.W_who.map(p => p.name), m2.nineD.W_who.map(p => p.name))],
      ['V_venue', m1.nineD.V_venue.type === m2.nineD.V_venue.type ? 1 : 0],
      ['R_relation', m1.nineD.R_relation.interactionType === m2.nineD.R_relation.interactionType ? 1 : 0],
      ['M_depth', 1 - Math.abs(m1.nineD.M_depth.importance - m2.nineD.M_depth.importance)],
      ['G_goods', jaccard(m1.nineD.G_goods.map(g => g.name), m2.nineD.G_goods.map(g => g.name))],
      ['S_senses', this.senseSim(m1, m2)],
    ];

    for (const [dim, sim] of checks) {
      if (sim > threshold) {
        connectingDimensions.push(dim);
        totalWeight += sim;
      }
    }

    if (connectingDimensions.length === 0) return null;
    return {
      source: m1.id,
      target: m2.id,
      weight: totalWeight / connectingDimensions.length,
      connectingDimensions,
    };
  }

  private timeSim(m1: Memory, m2: Memory): number {
    const diff = Math.abs(m1.timestamp - m2.timestamp) / 86400000; // days
    return Math.max(0, 1 - diff / 90);
  }

  private emoSim(m1: Memory, m2: Memory): number {
    const a = m1.nineD.Z_emotion.vector;
    const b = m2.nineD.Z_emotion.vector;
    const dist = Math.sqrt((a.valence - b.valence) ** 2 + (a.arousal - b.arousal) ** 2);
    return Math.max(0, 1 - dist / 2.828);
  }

  private senseSim(m1: Memory, m2: Memory): number {
    const senses: (keyof NineDVector['S_senses'])[] = ['visual','auditory','olfactory','tactile','taste'];
    let match = 0;
    for (const s of senses) {
      if (m1.nineD.S_senses[s] && m2.nineD.S_senses[s] && m1.nineD.S_senses[s].length > 0 && m2.nineD.S_senses[s].length > 0) {
        match++;
      }
    }
    return match / 5;
  }
}
