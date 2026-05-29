/**
 * ELYSIUM 15D+ 状态引擎
 *
 * 管理 15 维心理状态的追踪、更新、持久化。
 * 使用 EMA (指数移动平均) 确保状态平滑演化。
 *
 * 集成方式：
 *   import { elysium15d } from './elysium-15d.js';
 *   elysium15d.updateFromText(userInput, analysis);
 *   const state = elysium15d.getState();
 */

// ─── 15D 默认基线 ───

const DEFAULT_15D_STATE = {
  // 矩阵 A：肉体与感官
  neuro_arousal: {
    hrv_stress_index: 50,
    gsr_excitement: 50,
    circadian_energy: 50,
  },
  embodied_senses: {
    ambient_light_pref: 'warm_dim',
    haptic_intensity: 50,
    asmr_proximity: 50,
  },
  psychosexual_profile: {
    current_desire_state: 'none',
    intimacy_craving: 50,
    sensitive_zones: [],
  },

  // 矩阵 B：灵魂与潜意识
  attachment_state: {
    current_trigger: null,
    need_for_holding: false,
  },
  shadow_self: {
    repressed_emotions: [],
    moral_fatigue: 50,
  },
  aesthetic_resonance: {
    current_flow_state: false,
    preferred_lineage: '',
  },

  // 矩阵 C：个人宇宙与世俗
  social_topology: {
    current_interacting_node: '',
    power_dynamic: 'equal',
    relational_tension: 50,
    persona_mask: '',
  },
  cognitive_executive: {
    working_memory_load: 50,
    decision_fatigue: false,
    pending_tasks_urgency: 'low',
  },

  // 矩阵 D：时间、语义与记忆锚点
  time_perception: {
    subjective_flow: 'flow_state',
    season: '',
    day_night: '',
  },
  semantic_intent: {
    surface_text: '',
    hidden_cry_for_help: false,
    ambiguity_score: 0,
  },
  semantic_cues: {
    venue_type: null,
    key_objects: [],
    interaction_weight: 50,
    extracted_cues: [],
    normalized_venue: '',
    prustean_smells: [],
    prustean_sounds: [],
    prustean_tactile: [],
  },
  textual_style: {
    relationship_age: 'new',
    inside_jokes: [],
    vocabulary_level: 'rich',
    speech_rhythm: 'normal',
  },

  // 元数据
  _meta: {
    version: '5.1.1',
    last_updated: Date.now(),
    interaction_count: 0,
  },
};

// ─── 状态管理器 ───

class Elysium15DManager {
  constructor() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_15D_STATE));
    this.pipelineLog = [];  // 流水线追踪日志
    this.maxLogLength = 50;
  }

  /** 获取当前 15D 状态快照 */
  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /** 获取清理后的状态（移除空字段，减少 token 消耗） */
  getCompactState() {
    const s = this.getState();
    // 移除空字符串/空数组字段
    for (const matrix of Object.values(s)) {
      for (const [key, val] of Object.entries(matrix)) {
        if (val === '' || (Array.isArray(val) && val.length === 0)) {
          delete matrix[key];
        }
      }
    }
    return s;
  }

  /** 手动设置状态（用于前端生理信号输入） */
  setState(partial) {
    this._deepMerge(this.state, partial);
    this.state._meta.last_updated = Date.now();
    return this.getState();
  }

  /** 从文本分析结果更新 15D 状态（EMA 平滑） */
  updateFromText(analysis) {
    const alpha = 0.3; // EMA 平滑系数
    const s = this.state;

    // 1. 语义意图
    s.semantic_intent.surface_text = analysis.rawText || s.semantic_intent.surface_text;
    s.semantic_intent.ambiguity_score = analysis.ambiguity_score ?? s.semantic_intent.ambiguity_score;
    s.semantic_intent.hidden_cry_for_help = analysis.hidden_cry_for_help ?? s.semantic_intent.hidden_cry_for_help;

    // 2. 语义线索
    if (analysis.extracted_cues) s.semantic_cues.extracted_cues = analysis.extracted_cues;
    if (analysis.normalized_venue) s.semantic_cues.normalized_venue = analysis.normalized_venue;
    if (analysis.key_objects) s.semantic_cues.key_objects = analysis.key_objects;
    if (analysis.normalized_venue) s.semantic_cues.venue_type = analysis.normalized_venue;

    // 3. 交互权重 = 情绪 + 亲密度 + 张力
    const prevIntimacy = s.psychosexual_profile.intimacy_craving;
    const prevStress = s.neuro_arousal.hrv_stress_index;
    const prevGsr = s.neuro_arousal.gsr_excitement;

    // EMA 更新生理状态（从文本情绪推断）
    if (analysis.emotionalValence !== undefined) {
      // 积极文本 → GSR上升，压力下降
      s.neuro_arousal.gsr_excitement = alpha * (50 + analysis.emotionalValence * 30) + (1 - alpha) * prevGsr;
      s.neuro_arousal.hrv_stress_index = alpha * Math.max(0, 50 - analysis.emotionalValence * 20) + (1 - alpha) * prevStress;
    }

    if (analysis.intimacyHint !== undefined) {
      s.psychosexual_profile.intimacy_craving = alpha * analysis.intimacyHint + (1 - alpha) * prevIntimacy;
    }

    // 4. 交互权重
    s.semantic_cues.interaction_weight = Math.min(100,
      s.neuro_arousal.gsr_excitement * 0.35 +
      s.psychosexual_profile.intimacy_craving * 0.35 +
      s.neuro_arousal.hrv_stress_index * 0.3
    );

    // 5. 元数据
    s._meta.last_updated = Date.now();
    s._meta.interaction_count += 1;

    return this.getState();
  }

  /** 记录流水线日志 */
  logPipeline(step, data) {
    this.pipelineLog.unshift({
      step,
      data: typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data,
      timestamp: Date.now(),
    });
    if (this.pipelineLog.length > this.maxLogLength) {
      this.pipelineLog = this.pipelineLog.slice(0, this.maxLogLength);
    }
  }

  /** 获取流水线日志 */
  getPipelineLog() {
    return this.pipelineLog;
  }

  /** 重置状态 */
  reset() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_15D_STATE));
    this.pipelineLog = [];
  }

  // ─── 内部工具 ───

  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

// ─── 单例导出 ───

export const elysium15d = new Elysium15DManager();
