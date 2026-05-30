/**
 * EmotionTracker — 全频谱情感追踪器
 *
 * 跟踪用户对特定人/事/场景的长期情感倾向（喜怒哀乐惧爱厌恶）。
 * 每次提到某人/场景都开心 → AI 热情回应
 * 每次提到某人都愤怒 → AI 理解愤怒，提供情绪容器
 * 每次提到某话题都悲伤 → AI 温柔安抚
 *
 * 集成：
 *   import { learn, getProfile } from './emotion-tracker.js';
 *   learn(tokens, memory);
 *   const profile = getProfile(venue, person);
 *   // profile.affectionSummary → 注入 prompt 的情感画像
 */

// ─── 情感分类（全频谱） ───

const EMOTION_CATEGORIES = {
  joy:    { keywords: ['开心','快乐','幸福','喜悦','甜蜜','美好','棒','满足','高兴','笑','乐'], label: '开心', response: '热情回应，分享喜悦' },
  anger:  { keywords: ['愤怒','生气','烦躁','恼火','恨','讨厌','厌恶','发火','不爽','火大'], label: '愤怒', response: '理解愤怒，提供情绪容器' },
  grief:  { keywords: ['悲伤','难过','失落','委屈','沮丧','伤心','哭','痛苦','心碎','绝望'], label: '悲伤', response: '温柔安抚，心理抱持' },
  fear:   { keywords: ['焦虑','恐惧','不安','紧张','害怕','慌','担心','忧虑','惊恐','不安'], label: '恐惧', response: '冷静分析，增强安全感' },
  love:   { keywords: ['喜欢','爱','浪漫','思念','想','亲密','温暖','感动','贴心','珍惜'], label: '爱', response: '温暖回应，表达珍视' },
  disgust:{ keywords: ['恶心','反感','受不了','厌倦','烦','厌恶','鄙视','嫌弃'], label: '厌恶', response: '共情疏离，提供距离' },
  desire: { keywords: ['渴望','想要','期待','希望','向往','憧憬','盼','梦想'], label: '渴望', response: '鼓励支持，帮助规划' },
  surprise:{keywords: ['惊讶','意外','震惊','难以置信','没想到','竟然','居然'], label: '惊讶', response: '一起惊讶，然后理性分析' },
  neutral:{ keywords: [], label: '中性', response: '自然回应' },
};

// ─── 数据结构 ───

let emotionProfile = {
  _overall: { joy: 0, anger: 0, grief: 0, fear: 0, love: 0, disgust: 0, desire: 0, surprise: 0, total: 0 },
  _byVenue: {},   // { venueName: { joy: 0, anger: 0, ... } }
  _byPerson: {},  // { personName: { joy: 0, anger: 0, ... } }
};

/**
 * 从词元中识别情感类型。
 */
function classifyEmotion(tokens) {
  const counts = { joy: 0, anger: 0, grief: 0, fear: 0, love: 0, disgust: 0, desire: 0, surprise: 0 };
  for (const t of (tokens || [])) {
    if (!['Z_emotion', 'psychosexual', 'neuro_arousal'].includes(t.dim)) continue;
    const text = t.text;
    for (const [cat, cfg] of Object.entries(EMOTION_CATEGORIES)) {
      for (const kw of cfg.keywords) {
        if (text.includes(kw)) {
          counts[cat] += t.weight || 0.5;
          break;
        }
      }
    }
  }
  // 找出主导情感
  let maxCat = 'neutral';
  let maxVal = 0;
  for (const [cat, val] of Object.entries(counts)) {
    if (val > maxVal) { maxVal = val; maxCat = cat; }
  }
  return { dominant: maxCat, intensity: maxVal, counts };
}

/**
 * 学习一条记忆的情感模式。
 */
export function learn(tokens, memory) {
  if (!tokens || !Array.isArray(tokens)) return;

  const { dominant, counts } = classifyEmotion(tokens);
  if (dominant === 'neutral') return;

  // 提取场地和人物词元
  const venues = tokens.filter(t => t.dim === 'V_venue').map(t => t.text);
  const persons = tokens.filter(t => t.dim === 'W_who').map(t => t.text);

  const overall = emotionProfile._overall;
  overall.total++;
  overall[dominant] = (overall[dominant] || 0) + 1;

  for (const venue of venues) {
    if (!emotionProfile._byVenue[venue]) {
      emotionProfile._byVenue[venue] = { joy: 0, anger: 0, grief: 0, fear: 0, love: 0, disgust: 0, desire: 0, surprise: 0, total: 0 };
    }
    const v = emotionProfile._byVenue[venue];
    v.total++;
    v[dominant] = (v[dominant] || 0) + 1;
  }

  for (const person of persons) {
    if (['用户', 'AI', '我', '你'].includes(person)) continue;
    if (!emotionProfile._byPerson[person]) {
      emotionProfile._byPerson[person] = { joy: 0, anger: 0, grief: 0, fear: 0, love: 0, disgust: 0, desire: 0, surprise: 0, total: 0 };
    }
    const p = emotionProfile._byPerson[person];
    p.total++;
    p[dominant] = (p[dominant] || 0) + 1;
  }
}

/**
 * 获取情感频次和加权强度原始数据（LLM 自行决定如何回应）。
 * @param {string} venue - 当前讨论的场地
 * @param {string} person - 当前讨论的人物
 * @returns {{ summary: string, hasData: boolean }}
 */
export function getProfile(venue = '', person = '') {
  const parts = [];
  const o = emotionProfile._overall;

  // 整体统计
  if (o.total >= 2) {
    const top = Object.entries(o)
      .filter(([k]) => k !== 'total')
      .map(([k, v]) => ({ emotion: k, count: v, pct: ((v / o.total) * 100).toFixed(0) }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);
    if (top.length > 0) {
      const stats = top.map(e => `${e.emotion}:${e.count}次(${e.pct}%)`).join(' ');
      parts.push(`用户情感整体分布（共${o.total}条）：${stats}。根据频次和强度，自行判断如何回应。`);
    }
  }

  // 人物情绪统计（原始数据给 LLM）
  if (person && emotionProfile._byPerson[person]) {
    const p = emotionProfile._byPerson[person];
    if (p.total >= 1) {
      const top = Object.entries(p)
        .filter(([k]) => k !== 'total')
        .map(([k, v]) => ({ emotion: k, count: v, pct: ((v / Math.max(p.total, 1)) * 100).toFixed(0) }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);
      if (top.length > 0) {
        const stats = top.map(e => `${e.emotion}:${e.count}次(${e.pct}%)`).join(' ');
        parts.push(`提到「${person}」时（共${p.total}次）：${stats}。LLM根据频次和强度自行判断回应方式。`);
      }
    }
  }

  // 场景情绪统计
  if (venue && emotionProfile._byVenue[venue]) {
    const v = emotionProfile._byVenue[venue];
    if (v.total >= 1) {
      const top = Object.entries(v)
        .filter(([k]) => k !== 'total')
        .map(([k, vv]) => ({ emotion: k, count: vv, pct: ((vv / Math.max(v.total, 1)) * 100).toFixed(0) }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);
      if (top.length > 0) {
        const stats = top.map(e => `${e.emotion}:${e.count}次(${e.pct}%)`).join(' ');
        parts.push(`提到「${venue}」时（共${v.total}次）：${stats}。LLM根据频次和强度自行判断回应方式。`);
      }
    }
  }

  return {
    summary: parts.join('\n\n'),
    hasData: parts.length > 0,
  };
}

/**
 * 重置统计。
 */
export function reset() {
  emotionProfile = {
    _overall: { joy: 0, anger: 0, grief: 0, fear: 0, love: 0, disgust: 0, desire: 0, surprise: 0, total: 0 },
    _byVenue: {},
    _byPerson: {},
  };
}
