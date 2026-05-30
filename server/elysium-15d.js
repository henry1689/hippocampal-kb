/**
 * ELYSIUM 15D+ 全息状态引擎
 *
 * 管理 15 维心理状态的追踪、EMA 平滑更新、checkpoint/rollback。
 * 四矩阵分层 (A/B/C/D) 清晰映射意识结构。
 *
 * 架构: 四矩阵分层 | 维度特定 EMA | 耦合规则验证 | 可回滚
 *
 * 集成方式:
 *   import { elysium15d } from './elysium-15d.js';
 *   elysium15d.updateFromText(userInput, analysis);
 *   const state = elysium15d.getState();
 *
 * 前端同步:
 *   import { DIMENSION_META, NUMERIC_SUB_FIELDS } from './elysium-15d.js';
 */

// ─── 15D+ 默认基线 · 四矩阵分层 ──────────────────────────

const DEFAULT_15D_STATE = {
  version: '5.1.1',

  // ── Matrix A：肉体与感官 ──
  matrix_A_body: {
    neuro_arousal: {
      hrv_stress_index: 50,    // 0-100
      gsr_excitement: 50,      // 0-100
      circadian_energy: 50,    // 0-100
    },
    embodied_senses: {
      ambient_light_pref: 'warm_dim',  // warm_dim | bright_cool | darkness
      haptic_intensity: 50,
      asmr_proximity: 50,
    },
    psycho_sexual: {
      current_desire_state: 'none',  // dominant | submissive | vanilla | none
      intimacy_craving: 50,
      sensitive_zones: [],
    },
  },

  // ── Matrix B：灵魂与潜意识 ──
  matrix_B_psyche: {
    attachment: {
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
  },

  // ── Matrix C：世俗与执行 ──
  matrix_C_social: {
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
  },

  // ── Matrix D：时间·语义·锚点 ──
  matrix_D_anchor: {
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
      relationship_age_days: 0,
      inside_jokes: [],
      vocabulary_trend: 'rich',
      speech_era: 'initial',
      speech_rhythm: 'normal',
    },
  },

  _meta: {
    version: '5.1.1',
    last_updated: Date.now(),
    interaction_count: 0,
    last_venue: '',
    last_emotion: 'neutral',
    session_start: Date.now(),
  },
};

// ─── 维度特定 EMA 系数 ───────────────────────────────────
// 不同维度需要不同的平滑速度：
//   生理响应 (0.3)  — 不会瞬间跳变
//   亲密度 (0.25)   — 积累慢消散也慢
//   模糊度 (0.5)    — 每次输入重新计算
//   道德疲劳 (0.15) — 积累极慢

const EMA_ALPHAS = {
  'neuro_arousal.hrv_stress_index': 0.3,
  'neuro_arousal.gsr_excitement': 0.3,
  'neuro_arousal.circadian_energy': 0.25,
  'psycho_sexual.intimacy_craving': 0.25,
  'shadow_self.moral_fatigue': 0.15,
  'semantic_intent.ambiguity_score': 0.5,
  'semantic_cues.interaction_weight': 0.4,
  'cognitive_executive.working_memory_load': 0.3,
  'social_topology.relational_tension': 0.3,
};

// ─── 维度耦合规则 ───────────────────────────────────────
// 某些维度变化会触发其他维度的联动调整

const COUPLING_RULES = [
  // 求救信号 → 强制抱持
  {
    when: (s) => s.matrix_D_anchor.semantic_intent.hidden_cry_for_help,
    then: (s) => { s.matrix_B_psyche.attachment.need_for_holding = true; },
  },
  // 深夜 + 低能量 → 暖灯 + ASMR
  {
    when: (s) => s.matrix_D_anchor.time_perception.day_night === '夜晚'
      && s.matrix_A_body.neuro_arousal.circadian_energy < 40,
    then: (s) => {
      s.matrix_A_body.embodied_senses.ambient_light_pref = 'warm_dim';
      s.matrix_A_body.embodied_senses.asmr_proximity =
        Math.min(100, s.matrix_A_body.embodied_senses.asmr_proximity + 10);
    },
  },
  // 高模糊 → 认知负荷上升
  {
    when: (s) => s.matrix_D_anchor.semantic_intent.ambiguity_score > 60,
    then: (s) => {
      s.matrix_C_social.cognitive_executive.working_memory_load =
        Math.min(100, s.matrix_C_social.cognitive_executive.working_memory_load + 10);
    },
  },
  // 高亲密 + 低压 → 心流可能
  {
    when: (s) => s.matrix_A_body.psycho_sexual.intimacy_craving > 70
      && s.matrix_A_body.neuro_arousal.hrv_stress_index < 30,
    then: (s) => { s.matrix_B_psyche.aesthetic_resonance.current_flow_state = true; },
  },
];

// ─── 工具函数 ────────────────────────────────────────────

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _getAlpha(path) {
  return EMA_ALPHAS[path] ?? 0.3;
}

function _ema(oldVal, newVal, path) {
  const alpha = _getAlpha(path);
  return alpha * newVal + (1 - alpha) * (oldVal ?? 50);
}

// ─── 状态管理器 ──────────────────────────────────────────

class Elysium15DManager {
  constructor() {
    this.state = _deepClone(DEFAULT_15D_STATE);
    this.checkpoints = [];
    this.pipelineLog = [];
    this.maxLogLength = 50;
    this._initTimePerception();
  }

  /** 初始化时间感知 */
  _initTimePerception() {
    const hour = new Date().getHours();
    const month = new Date().getMonth() + 1;

    if (month >= 3 && month <= 5) this.state.matrix_D_anchor.time_perception.season = '春';
    else if (month >= 6 && month <= 8) this.state.matrix_D_anchor.time_perception.season = '夏';
    else if (month >= 9 && month <= 11) this.state.matrix_D_anchor.time_perception.season = '秋';
    else this.state.matrix_D_anchor.time_perception.season = '冬';

    if (hour >= 5 && hour < 8) this.state.matrix_D_anchor.time_perception.day_night = '清晨';
    else if (hour >= 8 && hour < 12) this.state.matrix_D_anchor.time_perception.day_night = '上午';
    else if (hour >= 12 && hour < 14) this.state.matrix_D_anchor.time_perception.day_night = '中午';
    else if (hour >= 14 && hour < 18) this.state.matrix_D_anchor.time_perception.day_night = '下午';
    else if (hour >= 18 && hour < 21) this.state.matrix_D_anchor.time_perception.day_night = '傍晚';
    else this.state.matrix_D_anchor.time_perception.day_night = '夜晚';

    if (hour >= 22 || hour < 5) {
      this.state.matrix_A_body.neuro_arousal.circadian_energy = 25;
      this.state.matrix_A_body.embodied_senses.ambient_light_pref = 'warm_dim';
    }
  }

  /** 获取当前 15D 状态快照 */
  getState() {
    return _deepClone(this.state);
  }

  /** 获取紧凑状态（移除空字段） */
  getCompactState() {
    const s = _deepClone(this.state);
    for (const matrix of Object.values(s)) {
      if (typeof matrix !== 'object') continue;
      for (const val of Object.values(matrix)) {
        if (typeof val === 'object' && val !== null) {
          for (const [k, v] of Object.entries(val)) {
            if (v === '' || (Array.isArray(v) && v.length === 0)) {
              delete val[k];
            }
          }
        }
      }
    }
    return s;
  }

  /** 创建检查点（支持 rollback） */
  checkpoint() {
    this.checkpoints.push(_deepClone(this.state));
    if (this.checkpoints.length > 5) this.checkpoints.shift();
  }

  /** 回滚到上一个检查点 */
  rollback() {
    if (this.checkpoints.length === 0) return false;
    this.state = this.checkpoints.pop();
    return true;
  }

  /** 手动设置状态（前端生理信号输入） */
  setState(partial) {
    this._deepMerge(this.state, partial);
    this.state._meta.last_updated = Date.now();
    return this.getState();
  }

  /**
   * 从分析结果更新 15D 状态（EMA 平滑 + 耦合规则）
   * @param {object} analysis - AmbiguityAnalysis 结果
   */
  updateFromText(analysis) {
    this.checkpoint();
    const s = this.state;

    // ── 语义意图 ──
    s.matrix_D_anchor.semantic_intent.surface_text = analysis.rawText ?? '';
    s.matrix_D_anchor.semantic_intent.ambiguity_score = analysis.ambiguity_score ?? 0;
    s.matrix_D_anchor.semantic_intent.hidden_cry_for_help = analysis.hidden_cry_for_help ?? false;

    // ── 场景锚点 ──
    s.matrix_D_anchor.semantic_cues.extracted_cues = analysis.extracted_cues ?? [];
    s.matrix_D_anchor.semantic_cues.normalized_venue = analysis.normalized_venue ?? '';
    s.matrix_D_anchor.semantic_cues.key_objects = analysis.key_objects ?? [];
    s.matrix_D_anchor.semantic_cues.venue_type = analysis.normalized_venue || null;

    // ── 生理状态 EMA ──
    const na = s.matrix_A_body.neuro_arousal;
    if (analysis.emotionalValence !== undefined) {
      na.gsr_excitement = _ema(na.gsr_excitement, 50 + analysis.emotionalValence * 30,
        'neuro_arousal.gsr_excitement');
      na.hrv_stress_index = _ema(na.hrv_stress_index,
        Math.max(0, 50 - analysis.emotionalValence * 20),
        'neuro_arousal.hrv_stress_index');
    }

    const ps = s.matrix_A_body.psycho_sexual;
    if (analysis.intimacyHint !== undefined) {
      ps.intimacy_craving = _ema(ps.intimacy_craving, analysis.intimacyHint,
        'psycho_sexual.intimacy_craving');
    }

    // ── 道德疲劳（累加型） ──
    const shadow = s.matrix_B_psyche.shadow_self;
    const fatigueDelta = analysis.hidden_cry_for_help ? 5
      : (analysis.ambiguity_score > 60 ? 3 : 0);
    shadow.moral_fatigue = Math.min(100, (shadow.moral_fatigue ?? 50) + fatigueDelta);

    // ── 依恋状态 ──
    const attach = s.matrix_B_psyche.attachment;
    attach.need_for_holding = analysis.hidden_cry_for_help
      || na.hrv_stress_index > 80 || ps.intimacy_craving > 85;
    if (analysis.hidden_cry_for_help) attach.current_trigger = 'cry_for_help';

    // ── 交互权重 ──
    s.matrix_D_anchor.semantic_cues.interaction_weight = Math.min(100,
      (na.gsr_excitement ?? 50) * 0.35
      + (ps.intimacy_craving ?? 50) * 0.35
      + (na.hrv_stress_index ?? 50) * 0.3
    );

    // ── 认知负荷 ──
    const cog = s.matrix_C_social.cognitive_executive;
    cog.working_memory_load = _ema(
      cog.working_memory_load,
      30 + (analysis.ambiguity_score ?? 0) * 0.6,
      'cognitive_executive.working_memory_load'
    );

    // ── 维度耦合验证 ──
    for (const rule of COUPLING_RULES) {
      try { if (rule.when(s)) rule.then(s); } catch (e) { /* 单条失败不阻断 */ }
    }

    // ── 元数据 ──
    s._meta.last_updated = Date.now();
    s._meta.interaction_count += 1;
    if (analysis.normalized_venue) s._meta.last_venue = analysis.normalized_venue;

    return this.getState();
  }

  // ─── 流水线日志 ──────────────────────────────────────

  logPipeline(step, data) {
    this.pipelineLog.unshift({
      step,
      data: typeof data === 'object' ? _deepClone(data) : data,
      timestamp: Date.now(),
    });
    if (this.pipelineLog.length > this.maxLogLength) {
      this.pipelineLog = this.pipelineLog.slice(0, this.maxLogLength);
    }
  }

  getPipelineLog() {
    return this.pipelineLog;
  }

  /** 重置状态 */
  reset() {
    this.state = _deepClone(DEFAULT_15D_STATE);
    this.checkpoints = [];
    this.pipelineLog = [];
    this._initTimePerception();
  }

  // ─── 内部工具 ──────────────────────────────────────────

  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

// ─── 单例导出 ────────────────────────────────────────────

export const elysium15d = new Elysium15DManager();

// ─── 维度元数据（供前端 FifteenDViewer 同步） ──────────────

export const DIMENSION_META = [
  { key: 'matrix_A_body.neuro_arousal',        label: '① 神经唤醒', color: '#ef5350', matrix: 'A' },
  { key: 'matrix_A_body.embodied_senses',       label: '② 具身体感', color: '#f06292', matrix: 'A' },
  { key: 'matrix_A_body.psycho_sexual',         label: '③ 性心理',   color: '#ff7043', matrix: 'A' },
  { key: 'matrix_B_psyche.attachment',          label: '④ 依恋状态', color: '#ffa726', matrix: 'B' },
  { key: 'matrix_B_psyche.shadow_self',         label: '⑤ 影子人格', color: '#ce93d8', matrix: 'B' },
  { key: 'matrix_B_psyche.aesthetic_resonance', label: '⑥ 审美共鸣', color: '#ab47bc', matrix: 'B' },
  { key: 'matrix_C_social.social_topology',     label: '⑦ 社交拓扑', color: '#81c784', matrix: 'C' },
  { key: 'matrix_C_social.cognitive_executive', label: '⑧ 认知执行', color: '#4dd0e1', matrix: 'C' },
  { key: 'matrix_D_anchor.time_perception',     label: '⑨ 时间感知', color: '#4fc3f7', matrix: 'D' },
  { key: 'matrix_D_anchor.semantic_intent',     label: '⑩ 语义意图', color: '#7986cb', matrix: 'D' },
  { key: 'matrix_D_anchor.semantic_cues',       label: '⑪ 场景锚点', color: '#9575cd', matrix: 'D' },
  { key: 'matrix_D_anchor.textual_style',       label: '⑫ 文本风格', color: '#a1887f', matrix: 'D' },
];

export const NUMERIC_SUB_FIELDS = {
  'matrix_A_body.neuro_arousal':        ['hrv_stress_index', 'gsr_excitement', 'circadian_energy'],
  'matrix_A_body.psycho_sexual':        ['intimacy_craving'],
  'matrix_C_social.social_topology':    ['relational_tension'],
  'matrix_C_social.cognitive_executive': ['working_memory_load'],
  'matrix_B_psyche.shadow_self':        ['moral_fatigue'],
  'matrix_D_anchor.semantic_intent':    ['ambiguity_score'],
  'matrix_D_anchor.semantic_cues':      ['interaction_weight'],
};
