import type { Memory, ChainLink } from '../types';

export class TemporalChain {
  private links = new Map<string, ChainLink>();
  private sortedMemories: Memory[] = [];

  constructor(memories: Memory[]) {
    this.sortedMemories = [...memories].sort((a, b) => a.timestamp - b.timestamp);
    this.build();
  }

  private build(): void {
    for (let i = 0; i < this.sortedMemories.length; i++) {
      const mem = this.sortedMemories[i];
      this.links.set(mem.id, {
        memory: mem,
        prev: i > 0 ? this.sortedMemories[i - 1].id : null,
        next: i < this.sortedMemories.length - 1 ? this.sortedMemories[i + 1].id : null,
        decayWeight: this.calcDecay(mem.timestamp),
      });
    }
  }

  private calcDecay(ts: number, lambda = 0.05): number {
    const ageDays = (Date.now() - ts) / 86400000;
    return Math.exp(-lambda * ageDays);
  }

  getNeighbors(id: string, window = 2): Memory[] {
    const link = this.links.get(id);
    if (!link) return [];
    const result: Memory[] = [];
    let curr = link.prev;
    let count = 0;
    while (curr && count < window) {
      const l = this.links.get(curr);
      if (l) { result.push(l.memory); curr = l.prev; count++; }
    }
    curr = link.next;
    count = 0;
    while (curr && count < window) {
      const l = this.links.get(curr);
      if (l) { result.push(l.memory); curr = l.next; count++; }
    }
    return result;
  }

  getAllLinks(): ChainLink[] {
    return Array.from(this.links.values());
  }
}
