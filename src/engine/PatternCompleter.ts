/**
 * Pattern Completion — simulates CA3 auto-associative memory.
 * Given partial cues, finds best matching memories via cosine similarity
 * + 9D dimension-boosted weighted fusion.
 */

import type { Memory, NineDVector, SearchQuery, SearchResult } from '../types';
import { cosineSimilarity, jaccard } from '../utils/similarity';
import { embeddingEngine } from './EmbeddingEngine';
import { MemoryStore } from './MemoryStore';

type DimKey = keyof NineDVector;

export class PatternCompleter {
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  async complete(query: SearchQuery): Promise<SearchResult[]> {
    const memories = await this.store.getAll();
    if (memories.length === 0) return [];

    let queryEmbedding: number[] | null = null;
    if (query.text.trim()) {
      queryEmbedding = await embeddingEngine.embed(query.text);
    }

    const boosts = query.dimensionBoosts ?? {};
    const boostedDims = Object.keys(boosts) as DimKey[];
    const hasBoosts = boostedDims.length > 0;

    const scored = memories.map(mem => {
      // Base text similarity
      let textSim = 0.5;
      if (queryEmbedding && mem.embedding.length > 0) {
        textSim = cosineSimilarity(queryEmbedding!, mem.embedding);
      }

      // Dimension scores
      const dimScores: Partial<Record<DimKey, number>> = {};

      if (hasBoosts) {
        for (const dim of boostedDims) {
          dimScores[dim] = this.computeDimScore(dim, query, mem);
        }
      }

      // Fusion: 35% text + 65% dimension boosts
      let total = textSim * 0.35;
      if (hasBoosts) {
        let boostSum = 0;
        let boostWeight = 0;
        for (const dim of boostedDims) {
          const score = dimScores[dim] ?? 0;
          const weight = boosts[dim] ?? 1;
          boostSum += score * weight;
          boostWeight += weight;
        }
        if (boostWeight > 0) {
          total += (boostSum / boostWeight) * 0.65;
        }
      } else {
        total = textSim;
      }

      return { memory: mem, score: Math.max(0, Math.min(1, total)), dimensionScores: dimScores };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, query.topK ?? 3);
  }

  private computeDimScore(dim: DimKey, query: SearchQuery, mem: Memory): number {
    switch (dim) {
      case 'X_semantic': return this.simSemantic(query, mem);
      case 'Y_time':     return this.simTime(query, mem);
      case 'Z_emotion':  return this.simEmotion(query, mem);
      case 'W_who':      return this.simPeople(query, mem);
      case 'V_venue':    return this.simVenue(query, mem);
      case 'R_relation': return this.simRelation(query, mem);
      case 'M_depth':    return this.simDepth(query, mem);
      case 'G_goods':    return this.simGoods(query, mem);
      case 'S_senses':   return this.simSenses(query, mem);
      default: return 0;
    }
  }

  private simSemantic(query: SearchQuery, mem: Memory): number {
    // If no specific keywords in query, use text similarity
    const qKws = this.extractKws(query.text);
    if (qKws.length === 0) return 0;
    return jaccard(qKws, mem.nineD.X_semantic.keywords);
  }

  private simTime(_query: SearchQuery, mem: Memory): number {
    // Boost if recent or matches seasonal patterns in text
    const ageDays = (Date.now() - mem.timestamp) / 86400000;
    if (ageDays < 30) return 0.8;
    if (ageDays < 90) return 0.5;
    if (ageDays < 365) return 0.3;
    return 0.1;
  }

  private simEmotion(query: SearchQuery, mem: Memory): number {
    // Compare query emotion vector with stored emotion
    const qTag = this.detectQueryEmotion(query.text);
    const mEmo = mem.nineD.Z_emotion.vector;
    if (!qTag) return 0;
    const dist = Math.sqrt((qTag.valence - mEmo.valence) ** 2 + (qTag.arousal - mEmo.arousal) ** 2);
    return Math.max(0, 1 - dist / 2.828);
  }

  private simPeople(query: SearchQuery, mem: Memory): number {
    const names = ['我','她','他','张总','妻子','孩子','朋友'];
    const qPeople = names.filter(n => query.text.includes(n));
    if (qPeople.length === 0) return 0;
    const memNames = mem.nineD.W_who.map(p => p.name);
    return jaccard(qPeople, memNames);
  }

  private simVenue(query: SearchQuery, mem: Memory): number {
    const venueKws: Record<string, string> = { '咖啡厅':'coffee_shop','咖啡馆':'coffee_shop','会议':'conference_room','办公室':'office','海滩':'beach','沙滩':'beach','图书馆':'library','书':'library' };
    for (const [kw, type] of Object.entries(venueKws)) {
      if (query.text.includes(kw) && mem.nineD.V_venue.type === type) return 1;
    }
    return 0;
  }

  private simRelation(query: SearchQuery, mem: Memory): number {
    const relKws: Record<string, string> = { '约会':'romantic_date','会议':'business_meeting','家庭':'family_gathering','独处':'solitude','朋友':'friendly_chat' };
    for (const [kw, type] of Object.entries(relKws)) {
      if (query.text.includes(kw) && mem.nineD.R_relation.interactionType === type) return 1;
    }
    return 0;
  }

  private simDepth(_query: SearchQuery, mem: Memory): number {
    // High-depth memories get a baseline boost
    return mem.nineD.M_depth.importance;
  }

  private simGoods(query: SearchQuery, mem: Memory): number {
    const objKws = ['萨克斯','吉他','篝火','咖啡','书','月光','海浪','木门'];
    const qObjs = objKws.filter(k => query.text.includes(k));
    if (qObjs.length === 0) return 0;
    const memObjs = mem.nineD.G_goods.map(g => g.name);
    return jaccard(qObjs, memObjs);
  }

  private simSenses(query: SearchQuery, mem: Memory): number {
    const senseKws = ['听到','听到','音乐','声音','闻到','味道','香气','温暖','触碰','苦','甜'];
    const qSense = senseKws.filter(k => query.text.includes(k));
    if (qSense.length === 0) return 0;
    const s = mem.nineD.S_senses;
    let hits = 0;
    for (const k of qSense) {
      if (s.auditory.includes(k) || s.olfactory.includes(k) || s.tactile.includes(k) || s.taste.includes(k)) hits++;
    }
    return hits / qSense.length;
  }

  private extractKws(text: string): string[] {
    const chars = [...text];
    const kws: string[] = [];
    for (let i = 0; i < chars.length - 1; i++) {
      const bg = chars[i] + chars[i + 1];
      if (/[一-鿿]/.test(chars[i]) && /[一-鿿]/.test(chars[i + 1])) kws.push(bg);
    }
    return [...new Set(kws)];
  }

  private detectQueryEmotion(text: string): { valence: number; arousal: number } | null {
    const posWords = ['开心','快乐','幸福','美好','浪漫','温暖','温柔','喜悦'];
    const negWords = ['沮丧','悲伤','难过','失落','愤怒','紧张','焦虑','低落'];
    const highArousal = ['兴奋','激动','紧张','愤怒','热烈','震撼'];
    const lowArousal = ['平静','安宁','困','疲惫','放松','宁静'];
    let pos = 0, neg = 0, high = 0, low = 0;
    for (const w of posWords) if (text.includes(w)) pos++;
    for (const w of negWords) if (text.includes(w)) neg++;
    for (const w of highArousal) if (text.includes(w)) high++;
    for (const w of lowArousal) if (text.includes(w)) low++;
    if (pos === 0 && neg === 0) return null;
    const v = pos + neg > 0 ? (pos - neg) / (pos + neg) : 0;
    const a = high + low > 0 ? (high - low) / (high + low) : 0;
    return { valence: Math.max(-1, Math.min(1, v)), arousal: Math.max(-1, Math.min(1, a)) };
  }
}

export function createCompleter(store: MemoryStore): PatternCompleter {
  return new PatternCompleter(store);
}
