// ─── 情感向量 (Russell Circumplex) ────────────────────
export interface EmotionVector {
  valence: number;  // -1 (悲伤/恐惧) 到 +1 (快乐/爱)
  arousal: number;  // -1 (困倦/平静) 到 +1 (兴奋/警觉)
}

// ─── 人物 ──────────────────────────────────────────────
export interface Person {
  name: string;
  identity: string;     // self, romantic_interest, boss, spouse, child...
  gender: string;
  age?: number;
  relationship: string; // self, spouse, superior, colleague, stranger...
  role: string;         // speaker, listener, observer, leader
  appearance?: string;
  emotion?: EmotionVector;
}

// ─── 场景物件 ──────────────────────────────────────────
export interface SceneObject {
  name: string;
  category: string;     // furniture, nature, food, music, body...
  significance: string;
  sensoryTrigger?: string;
}

// ─── 9D 向量 ───────────────────────────────────────────
export interface NineDVector {
  X_semantic: {
    keywords: string[];
    topics: string[];
  };
  Y_time: {
    absolute: number;       // Unix ms
    season: string;         // 春 夏 秋 冬
    dayNight: string;       // 清晨 上午 下午 傍晚 夜晚
    hour: number;           // 0-23
  };
  Z_emotion: {
    vector: EmotionVector;
    intensity: number;       // 0-1
    primaryType: string;     // joy, sad, angry, romantic...
  };
  W_who: Person[];
  V_venue: {
    type: string;            // coffee_shop, conference_room, beach, library...
    environment: string;     // indoor, outdoor
    lighting: string;        // dim, bright, natural, fluorescent
    atmosphere: string;      // intimate, tense, joyful, peaceful...
  };
  R_relation: {
    interactionType: string; // romantic_date, business_meeting, family_gathering...
    intimacyLevel: number;   // 0-1
    socialDynamics: string;  // hierarchical, egalitarian, solo, intimate
    conversationFlow: string;// nervous, smooth, heated, quiet...
  };
  M_depth: {
    importance: number;       // 0-1
    retentionPriority: number;// 0-1
    emotionalWeight: number;  // 0-1
  };
  G_goods: SceneObject[];
  S_senses: {
    visual: string;
    auditory: string;
    olfactory: string;
    tactile: string;
    taste: string;
  };
}

// ─── 记忆条目 ──────────────────────────────────────────
export interface Memory {
  id: string;
  scenarioId: string;
  momentIndex: number;
  title: string;
  text: string;
  embedding: number[];       // 384-dim
  timestamp: number;
  nineD: NineDVector;
  tags: string[];
}

// ─── 搜索 ──────────────────────────────────────────────
export interface SearchQuery {
  text: string;
  dimensionBoosts?: Partial<Record<keyof NineDVector, number>>;
  topK?: number;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  dimensionScores: Partial<Record<keyof NineDVector, number>>;
}

// ─── 图谱 ──────────────────────────────────────────────
export interface GraphNode {
  id: string;
  memory: Memory;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  connectingDimensions: (keyof NineDVector)[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── 时序链 ────────────────────────────────────────────
export interface ChainLink {
  memory: Memory;
  prev: string | null;
  next: string | null;
  decayWeight: number;
}

// ─── 维度元数据 ────────────────────────────────────────
export interface DimensionMeta {
  key: keyof NineDVector;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  order: number;
}
