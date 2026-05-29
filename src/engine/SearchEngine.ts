/**
 * SearchEngine — top-level orchestrator that wires all engine modules.
 * Provides a single clean API for the UI.
 */

import { MemoryStore, memoryStore } from './MemoryStore';
import { EmbeddingEngine, embeddingEngine } from './EmbeddingEngine';
import { PatternCompleter, createCompleter } from './PatternCompleter';
import { PatternSeparator, patternSeparator } from './PatternSeparator';
import { NineDEncoder, nineDEncoder } from './NineDEncoder';
import { EmotionalTagger, emotionalTagger } from './EmotionalTagger';
import { TemporalChain } from './TemporalChain';
import { MemoryGraphBuilder } from './MemoryGraph';
import { ALL_MEMORIES } from '../constants/presets';
import type { Memory, NineDVector, SearchQuery, SearchResult, GraphData, ChainLink } from '../types';

export class SearchEngine {
  private store: MemoryStore;
  private completer!: PatternCompleter;
  private chain: TemporalChain | null = null;
  private graph: GraphData = { nodes: [], edges: [] };

  constructor(store: MemoryStore) {
    this.store = store;
  }

  async initialize(): Promise<void> {
    await this.store.init();
    this.completer = createCompleter(this.store);
    this.rebuildDerived();
  }

  async initializeEmbedder(onProgress?: (pct: number) => void): Promise<void> {
    await embeddingEngine.initialize(onProgress);
  }

  isEmbedderReady(): boolean {
    return embeddingEngine.isReady();
  }

  private rebuildDerived(): void {
    const all = ALL_MEMORIES;
    this.chain = new TemporalChain(all);
    this.graph = new MemoryGraphBuilder().build(all);
  }

  async searchByText(text: string, topK = 5): Promise<SearchResult[]> {
    const boosts = nineDEncoder.detectDimensionBoosts(text);
    return this.completer.complete({ text, dimensionBoosts: boosts, topK });
  }

  async searchByPartialCue(cue: string): Promise<SearchResult[]> {
    return this.searchByText(cue, 5);
  }

  getAllMemories(): Memory[] {
    return ALL_MEMORIES;
  }

  getGraph(): GraphData {
    return this.graph;
  }

  getChain(): TemporalChain | null {
    return this.chain;
  }

  getMemoryById(id: string): Memory | undefined {
    return ALL_MEMORIES.find(m => m.id === id);
  }

  getStore(): MemoryStore {
    return this.store;
  }
}

export const searchEngine = new SearchEngine(memoryStore);
