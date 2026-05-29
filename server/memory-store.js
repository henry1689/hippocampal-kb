import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'memories.json');

let memories = [];
let loaded = false;
const DATA_VERSION = 1;

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (loaded) return;
  ensureDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Support both wrapped { version, data } and bare array formats
      if (Array.isArray(parsed)) {
        memories = parsed;
      } else if (parsed.version && Array.isArray(parsed.data)) {
        memories = migrate(parsed.data, parsed.version);
      } else {
        memories = [];
      }
    }
  } catch (e) {
    console.warn('Failed to load memories:', e.message);
  }
  loaded = true;
}

function migrate(data, fromVersion) {
  let v = fromVersion;
  let m = data;
  // Future migrations: if (v < 2) { m = v2_upgrade(m); v = 2; }
  return m;
}

function save() {
  ensureDir();
  try {
    const wrapped = JSON.stringify({ version: DATA_VERSION, data: memories }, null, 2);
    fs.writeFileSync(DATA_FILE, wrapped, 'utf-8');
  } catch (e) {
    console.warn('Failed to save memories:', e.message);
  }
}

let counter = 0;

// ── Venue normalization ──
const VENUE_ALIASES = {
  '咖啡厅':'咖啡厅','咖啡馆':'咖啡厅','coffee':'咖啡厅','cafe':'咖啡厅',
  '街道':'街道','户外街道':'街道','街头':'街道','路边':'街道',
  '海滩':'海滩','沙滩':'海滩','海边':'海滩',
  '办公室':'办公室','办公':'办公室','工位':'办公室',
  '餐厅':'餐厅','饭店':'餐厅','餐馆':'餐厅','食堂':'餐厅',
  '会议':'会议室','会议室':'会议室','开会':'会议室',
  '家':'家','家里':'家','家中':'家','home':'家',
};

function normVenue(type) {
  if (!type) return '';
  return VENUE_ALIASES[type] || type;
}

export function getAll() {
  load();
  return memories;
}

// Generic words that don't help distinguish events
const GENERIC_KWS = ['咖啡厅','咖啡馆','回忆','聊天','用户','AI','自己'];

/**
 * Check if two memories likely refer to the SAME real-world event (not just same venue).
 * Returns true if they share venue + non-generic keyword/people overlap.
 */
function isSameEvent(a, b) {
  const aVenue = normVenue(a.nineD?.V_venue?.type);
  const bVenue = normVenue(b.nineD?.V_venue?.type);
  if (!aVenue || !bVenue || aVenue !== bVenue) return false;

  // Time gap check: more than 7 days apart → definitely different events
  if (a.timestamp && b.timestamp && Math.abs(a.timestamp - b.timestamp) > 7 * 86400000) {
    return false;
  }

  // Non-generic keyword overlap
  const aKws = (a.nineD?.X_semantic?.keywords || []).filter(k => !GENERIC_KWS.includes(k));
  const bKws = (b.nineD?.X_semantic?.keywords || []).filter(k => !GENERIC_KWS.includes(k));
  const commonKws = aKws.filter(k => bKws.includes(k));

  // People overlap (excluding speaker/listener generics)
  const skip = new Set(['用户','AI','我','你']);
  const aPeople = (a.nineD?.W_who || []).map(p => p.name).filter(n => !skip.has(n));
  const bPeople = (b.nineD?.W_who || []).map(p => p.name).filter(n => !skip.has(n));
  const commonPeople = aPeople.filter(n => bPeople.includes(n));

  // If interaction types are explicitly different → likely different events
  const aRel = a.nineD?.R_relation?.interactionType;
  const bRel = b.nineD?.R_relation?.interactionType;
  if (aRel && bRel && aRel !== bRel) {
    // Different interaction type — only treat as same event if very strong keyword evidence
    return commonKws.length >= 2;
  }

  // Same event if: share a non-generic keyword OR share a unique person
  return commonKws.length >= 1 || commonPeople.length >= 1;
}

/**
 * Add a knowledge-base entry (work document or article).
 * Documents → low emotion; Articles → emotional resonance from 七情六欲.
 */
export function addKnowledge({ title, content, category, summary, keywords, tags, article, emotion, scene, characters, objects, senses, interactionType }) {
  load();
  const isArticle = article || false;
  const hasEmotion = isArticle && emotion;
  const intensity = hasEmotion ? emotion.intensity || 0.5 : 0.1;
  const valence = hasEmotion ? emotion.valence || 0.3 : 0.1;
  const arousal = hasEmotion ? emotion.arousal || 0.2 : 0.1;
  const primaryType = hasEmotion ? emotion.primaryType || '感动' : 'neutral';
  const evoked = hasEmotion ? (emotion.evokedFeelings || []) : [];

  const memory = {
    type: isArticle ? 'article' : 'knowledge',
    priority: 2, // 2=文章/知识库（高保留），1=聊天记忆（普通），0=系统（低）
    title: title || '未命名文档',
    text: summary || content?.slice(0, 200) || '',
    originalContent: content || '', // 用户提交的原始内容，保留以供参考
    category: category || '未分类',
    evokedFeelings: evoked, // 文章引发的情感
    nineD: {
      X_semantic: {
        keywords: keywords || [],
        topics: [category || '知识库', isArticle ? '文章' : '工作文档', ...evoked],
      },
      Y_time: { season: '', dayNight: '' },
      Z_emotion: {
        vector: { valence, arousal },
        intensity,
        primaryType,
      },
      W_who: isArticle && characters?.length > 0
        ? characters.map(c => ({ name: c.name, identity: c.identity || '角色', gender: '未知', relationship: c.relationship || '关联', role: '参与者' }))
        : [{ name: '用户', identity: isArticle ? '读者' : '作者', gender: '未知', relationship: '自己', role: '参与者' }],
      V_venue: isArticle && scene
        ? { type: scene.type || '阅读', environment: 'indoor', lighting: scene.lighting || '', atmosphere: scene.atmosphere || '情感' }
        : { type: isArticle ? '阅读' : '工作', environment: 'indoor', lighting: '', atmosphere: isArticle ? '情感' : '专业' },
      R_relation: {
        interactionType: isArticle && interactionType ? interactionType : '资料提交',
        intimacyLevel: 0,
        socialDynamics: '专业',
        conversationFlow: '',
      },
      M_depth: { importance: 0.6, retentionPriority: 0.5, emotionalWeight: intensity },
      G_goods: isArticle && objects?.length > 0
        ? objects.map(o => ({ name: o.name, category: o.category || '物品', significance: o.significance || '' }))
        : [],
      S_senses: isArticle && senses
        ? { visual: senses.visual || '', auditory: senses.auditory || '', olfactory: senses.olfactory || '', tactile: senses.tactile || '', taste: '' }
        : { visual: '', auditory: '', olfactory: '', tactile: '', taste: '' },
    },
    tags: tags || [isArticle ? '文章' : '知识库', category || '未分类', ...evoked.slice(0, 2)],
    timestamp: Date.now(),
  };
  memory.id = `know_${++counter}_${Date.now()}`;
  memories.unshift(memory);
  save();
  return memory;
}

export function add(memory) {
  load();
  memory.timestamp = memory.timestamp || Date.now();

  // Self-learning: if this is a detail about an existing event, enrich it
  const matched = enrichExisting(memory);
  if (matched) {
    save();
    return matched;
  }

  // Fresh event — add as new entry
  memory.id = memory.id || `mem_${++counter}_${Date.now()}`;
  if (memory.priority === undefined) memory.priority = 1; // default: chat memory
  memories.unshift(memory);
  save();
  return memory;
}

/** Enrich an existing memory with new details when it's the same real-world event.
 *  Returns the enriched memory, or null if no match found. */
function enrichExisting(newMem) {
  for (const existing of memories) {
    if (!isSameEvent(newMem, existing)) continue;

    // ── Same event — enrich the existing memory ──

    // Keep the most descriptive user text as primary; preserve original as fallback
    if (newMem.text && !existing.text.includes(newMem.text)) {
      if (newMem.text.length > existing.text.length) {
        existing._supplement = existing.text;
        existing.text = newMem.text;
      } else {
        existing._supplement = (existing._supplement || '') + '；' + newMem.text;
      }
    }

    // Combine keywords (dedup)
    const eKws = existing.nineD.X_semantic.keywords || [];
    const nKws = newMem.nineD.X_semantic.keywords || [];
    existing.nineD.X_semantic.keywords = [...new Set([...eKws, ...nKws])];

    // Combine topics
    const eTopics = existing.nineD.X_semantic.topics || [];
    const nTopics = newMem.nineD.X_semantic.topics || [];
    existing.nineD.X_semantic.topics = [...new Set([...eTopics, ...nTopics])];

    // Merge tags
    const eTags = existing.tags || [];
    const nTags = newMem.tags || [];
    existing.tags = [...new Set([...eTags, ...nTags])];

    // Update emotion: weighted average (existing has more weight)
    const eEmo = existing.nineD?.Z_emotion?.vector;
    const nEmo = newMem.nineD?.Z_emotion?.vector;
    if (eEmo && nEmo) {
      eEmo.valence = (eEmo.valence * 2 + nEmo.valence) / 3;
      eEmo.arousal = (eEmo.arousal * 2 + nEmo.arousal) / 3;
    }
    const eInt = existing.nineD?.Z_emotion?.intensity || 0;
    const nInt = newMem.nineD?.Z_emotion?.intensity || 0;
    if (nInt > eInt && newMem.nineD?.Z_emotion?.primaryType) {
      existing.nineD.Z_emotion.primaryType = newMem.nineD.Z_emotion.primaryType;
      existing.nineD.Z_emotion.intensity = (eInt + nInt) / 2;
    }

    // Update depth (max)
    if (newMem.nineD?.M_depth) {
      const ed = existing.nineD.M_depth;
      const nd = newMem.nineD.M_depth;
      ed.importance = Math.max(ed.importance || 0, nd.importance || 0);
      ed.retentionPriority = Math.max(ed.retentionPriority || 0, nd.retentionPriority || 0);
    }

    // Merge unique people
    const ePeople = existing.nineD.W_who || [];
    const nPeople = newMem.nineD.W_who || [];
    const eNames = new Set(ePeople.map(p => p.name));
    for (const np of nPeople) {
      if (!eNames.has(np.name)) { ePeople.push(np); eNames.add(np.name); }
    }

    // Merge unique goods
    const eGoods = existing.nineD.G_goods || [];
    const nGoods = newMem.nineD.G_goods || [];
    const gNames = new Set(eGoods.map(g => g.name));
    for (const ng of nGoods) {
      if (ng.name && !gNames.has(ng.name)) { eGoods.push(ng); gNames.add(ng.name); }
    }

    // Fill empty senses
    const eSenses = existing.nineD.S_senses;
    const nSenses = newMem.nineD.S_senses;
    if (eSenses && nSenses) {
      for (const key of ['visual','auditory','olfactory','tactile','taste']) {
        if (!eSenses[key] && nSenses[key]) eSenses[key] = nSenses[key];
      }
    }

    // Update timestamp
    existing.timestamp = Math.max(existing.timestamp, newMem.timestamp);

    // More specific title
    if (newMem.title && newMem.title.length > (existing.title || '').length) {
      existing.title = newMem.title;
    }

    return existing; // Only enrich the best match (first found), return enriched memory
  }
  return null; // No matching event found
}

function searchDimension(query, topK = 5) {
  load();
  if (!query || memories.length === 0) return [];
  const q = query.toLowerCase();

  // 9D dimension keyword maps
  const VENUE_KWS = { '咖啡厅':'coffee_shop','咖啡馆':'coffee_shop','会议':'conference_room','办公室':'office','海滩':'beach','沙滩':'beach','图书馆':'library','家':'home','餐厅':'restaurant','车间':'workshop','生产部':'workshop' };
  const SEASON_KWS = ['春','夏','秋','冬','春天','夏天','秋天','冬天'];
  const DAYNIGHT_KWS = ['清晨','上午','中午','下午','傍晚','黄昏','夜晚','晚上'];
  const RELATION_KWS = {'约会':'romantic_date','会议':'business_meeting','家庭':'family_gathering','独处':'solitude','聊天':'friendly_chat'};
  const RECALL_KWS = ['记得','回忆','想起','之前','过去','那天','昨天','还记得','还记不记得','还记得吗'];

  // Helper: check if a query term matches any value from an array (both directions)
  function qMatchAny(arr) {
    if (!arr) return false;
    for (const item of arr) {
      const lower = item.toLowerCase();
      if (q.includes(lower) || lower.includes(q)) return true;
    }
    return false;
  }

  const scored = memories.map(m => {
    let score = 0;

    // 1. Title & text match (both directions)
    if (m.title?.toLowerCase().includes(q) || q.includes(m.title?.toLowerCase().slice(0, 4) || '')) score += 0.4;
    if (m.text?.toLowerCase().includes(q)) score += 0.3;
    if (m.category?.toLowerCase().includes(q)) score += 0.25;

    // 2. Keyword matching (bidirectional)
    if (qMatchAny(m.nineD?.X_semantic?.keywords)) score += 0.2;

    // 3. Tag matching (bidirectional)
    if (qMatchAny(m.tags)) score += 0.15;

    // 4. 9D Venue matching (normalized) — strong boost when query explicitly names a known venue
    const mVenue = normVenue(m.nineD?.V_venue?.type);
    if (mVenue) {
      for (const [kw, type] of Object.entries(VENUE_KWS)) {
        if (q.includes(kw)) {
          const kVenue = normVenue(kw);
          if (kVenue && kVenue === mVenue) { score += 1.0; break; }
        }
      }
      // Also match venue type directly
      if (q.includes(mVenue.toLowerCase()) || mVenue.toLowerCase().includes(q)) score += 0.6;
    }

    // 5. Time/Season matching (including lighting field)
    for (const k of SEASON_KWS) {
      if (q.includes(k) && m.nineD?.Y_time?.season === k) score += 0.3;
    }
    for (const k of DAYNIGHT_KWS) {
      if (q.includes(k) && (m.nineD?.Y_time?.dayNight === k || m.nineD?.V_venue?.lighting === k)) score += 0.25;
    }

    // 6. Objects/Goods matching (dynamic — check all goods names & significance)
    const goods = m.nineD?.G_goods || [];
    for (const g of goods) {
      if (g.name && (q.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(q))) {
        score += 0.3; break;
      }
      if (g.significance && q.includes(g.significance.toLowerCase())) { score += 0.15; break; }
    }

    // 7. Relation matching
    for (const [kw, type] of Object.entries(RELATION_KWS)) {
      if (q.includes(kw) && m.nineD?.R_relation?.interactionType === type) score += 0.25;
    }

    // 8. Person matching (dynamic — check all people names)
    const people = m.nineD?.W_who || [];
    for (const p of people) {
      if (p.name && (q.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(q))) {
        score += 0.25; break;
      }
    }

    // 9. Sensory matching — check senses fields
    const senses = m.nineD?.S_senses;
    if (senses) {
      for (const key of ['visual','auditory','olfactory','tactile','taste']) {
        if (senses[key] && q.includes(senses[key].toLowerCase().slice(0, 4))) { score += 0.2; break; }
      }
    }

    // 10. Recall intent: user is asking about past — boost existing matches
    const isRecallQuery = RECALL_KWS.some(k => q.includes(k));
    if (isRecallQuery && score > 0.3) score *= 1.3;

    // 11. Emotion matching
    const posWords = ['开心','快乐','幸福','浪漫','温暖','喜悦'];
    const negWords = ['沮丧','悲伤','难过','失落','愤怒','紧张','焦虑'];
    for (const w of posWords) if (q.includes(w) && m.nineD?.Z_emotion?.vector?.valence > 0.3) score += 0.2;
    for (const w of negWords) if (q.includes(w) && m.nineD?.Z_emotion?.vector?.valence < -0.3) score += 0.2;

    // 12. Emotional intensity — intense memories rank slightly higher
    const intensity = m.nineD?.Z_emotion?.intensity || 0;
    score += intensity * 0.1;

    // 13. Memory depth — important/emotionally weighty memories rank higher
    const depth = m.nineD?.M_depth;
    if (depth) {
      score += (depth.importance || 0) * 0.08 + (depth.emotionalWeight || 0) * 0.07;
    }

    // 14. Emotional query amplification — query with emotional keywords amplifies intensity weight
    const EMO_KWS = ['开心','难过','感动','温暖','幸福','伤心','怀念','浪漫','激动','紧张','害怕','焦虑','愤怒','委屈','满足','快乐','悲伤','痛苦','甜蜜','美好','感激','遗憾','温馨','喜悦','沮丧','失落','恐惧','惊喜','轻松'];
    const hasEmotionQuery = EMO_KWS.some(k => q.includes(k));
    if (hasEmotionQuery) {
      score += intensity * 0.2;
      if (depth) score += (depth.importance || 0) * 0.1;
    }

    // 15. Recency boost (moderate — don't let recency dominate)
    const ageDays = (Date.now() - (m.timestamp || 0)) / 86400000;
    const recencyBoost = Math.max(0, 1 - ageDays / 30) * 0.1;
    score += recencyBoost;

    return { memory: m, score };
  });

  return scored
    .filter(r => r.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => r.memory);
}

export function searchRaw(query, topK = 3) {
  // Fallback: pure text substring search — matches any memory whose title or text
  // contains any 2+ char segment of the query (ignoring 9D dimension search).
  load();
  if (!query || memories.length === 0) return [];
  const q = query.toLowerCase();
  const results = memories
    .map(m => {
      let score = 0;
      const title = (m.title || '').toLowerCase();
      const text = (m.text || '').toLowerCase();
      if (title.includes(q) || text.includes(q)) score = 0.8;
      else if (q.length >= 2) {
        for (let i = 0; i < q.length - 1; i++) {
          const seg = q.slice(i, i + 2);
          if (seg.length === 2 && !'的了我是在有和他她都就也'.includes(seg)) {
            if (title.includes(seg)) score = Math.max(score, 0.4);
            if (text.includes(seg)) score = Math.max(score, 0.3);
          }
        }
      }
      return { memory: m, score };
    })
    .filter(r => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => r.memory);
  return results;
}

/** Combined search: dimension search first, fallback to raw text search */
export function search(query, topK = 5) {
  load();
  const dimResults = searchDimension(query, topK);
  if (dimResults.length > 0) return dimResults;
  // Fallback: pure text search
  return searchRaw(query, Math.max(topK, 3));
}

/**
 * Get a human-readable relative time description for a memory.
 */
export function getRelativeTime(memory) {
  const ts = memory.timestamp;
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

/**
 * Build a frequency map of all keywords across all memories.
 * Frequently mentioned concepts are weighted higher in salience.
 */
export function getKeywordFrequency() {
  load();
  const freq = {};
  for (const m of memories) {
    for (const kw of (m.nineD?.X_semantic?.keywords || [])) {
      freq[kw] = (freq[kw] || 0) + 1;
    }
  }
  return freq;
}

/**
 * Compute which dimensions of a memory are most salient (0-1 each).
 * Enhanced with aesthetic-emotional coupling: rich scene/sensory data
 * amplifies emotional intensity (环境/音乐/灯光 = 情感放大器).
 * Returns sorted array of { dim, label, score }.
 */
export function getDimensionSalience(memory) {
  const D = memory.nineD || {};
  const scores = [];

  // X — 语义 richness
  const kwScore = Math.min((D.X_semantic?.keywords?.length || 0) / 5, 1) * 0.6;
  const tpScore = Math.min((D.X_semantic?.topics?.length || 0) / 3, 1) * 0.4;
  scores.push({ dim:'X', label:'语义', score: kwScore + tpScore });

  // Y — 时间 specificity
  const ySeas = D.Y_time?.season ? 0.6 : 0;
  const yDN = D.Y_time?.dayNight ? 0.4 : 0;
  scores.push({ dim:'Y', label:'时间', score: ySeas + yDN });

  // V — 场景 vividness (lighting, atmosphere, environment = aesthetic amplifiers)
  const vn = D.V_venue;
  let vScore = 0;
  if (vn) {
    if (vn.type) vScore += 0.2;
    if (vn.lighting) vScore += 0.3;  // 照明 → 情感放大器
    if (vn.atmosphere) vScore += 0.3; // 氛围 → 情感放大器
    if (vn.environment) vScore += 0.2;
  }
  scores.push({ dim:'V', label:'场景', score: vScore });

  // S — 感官 richness (visual/auditory = key emotional carriers)
  const sn = D.S_senses;
  const sKeys = ['visual','auditory','olfactory','tactile','taste'];
  const sFilled = sn ? sKeys.filter(k => sn[k]).length : 0;
  // Weight visual & auditory higher (they carry aesthetic/emotional info)
  let sScore = 0;
  if (sn) {
    if (sn.visual) sScore += 0.3;
    if (sn.auditory) sScore += 0.3; // 音乐/声音 → 情感放大器
    if (sn.olfactory) sScore += 0.15;
    if (sn.tactile) sScore += 0.15;
    if (sn.taste) sScore += 0.1;
  }
  scores.push({ dim:'S', label:'感官', score: sScore });

  // Z — 情感 intensity with aesthetic-emotional coupling
  // Rich scene (V) + sensory (S) data amplifies emotional intensity
  const v = D.Z_emotion?.vector;
  let zVal = v ? (Math.abs(v.valence) * 0.3 + Math.abs(v.arousal) * 0.2) : 0;
  let zInt = (D.Z_emotion?.intensity || 0) * 0.3;
  // Aesthetic-emotional coupling: beautiful environment amplifies emotion
  const aestheticBoost = (vScore > 0.5 ? 0.15 : 0) + (sScore > 0.4 ? 0.15 : 0);
  const cappedBoost = Math.min(aestheticBoost, 0.25);
  zVal += cappedBoost;
  zInt += (D.Z_emotion?.intensity || 0) * 0.2;
  scores.push({ dim:'Z', label:'情感', score: Math.min(zVal + zInt, 1) });

  // W — 人物 richness (interpersonal interactions affect emotions)
  const ppl = D.W_who || [];
  const wCnt = Math.min(ppl.length / 3, 1) * 0.4;
  const wRel = ppl.some(p => p.relationship && p.relationship.length > 1) ? 0.3 : 0;
  const wEmo = ppl.some(p => p.role === '参与者') ? 0.3 : 0; // 参与者的情感权重更高
  scores.push({ dim:'W', label:'人物', score: wCnt + wRel + wEmo });

  // R — 关系 depth (relationships drive emotional intensity)
  const rRel = D.R_relation;
  let rScore = 0;
  if (rRel) {
    rScore += (rRel.intimacyLevel || 0) * 0.5;
    if (rRel.interactionType) rScore += 0.25;
    if (rRel.socialDynamics) rScore += 0.25;
  }
  scores.push({ dim:'R', label:'关系', score: rScore });

  // M — 深刻度 (importance + retention priority)
  const md = D.M_depth;
  const mScore = md
    ? (md.importance || 0) * 0.4 + (md.retentionPriority || 0) * 0.3 + (md.emotionalWeight || 0) * 0.3
    : 0;
  scores.push({ dim:'M', label:'深刻度', score: mScore });

  // G — 物件 significance (objects as emotional anchors)
  const gds = D.G_goods || [];
  const gCnt = Math.min(gds.length / 3, 1) * 0.5;
  const gSig = gds.some(g => g.significance && g.significance.length > 2) ? 0.3 : 0;
  const gEmo = gds.some(g => g.category === '花' || g.category === '音乐' || g.category === '礼物') ? 0.2 : 0;
  scores.push({ dim:'G', label:'物件', score: gCnt + gSig + gEmo });

  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Get distinctive markers that set this memory apart from others at the same venue.
 * Used for recall clue generation.
 */
export function getDistinctiveMarkers(memory) {
  load();
  const venue = normVenue(memory.nineD?.V_venue?.type);
  if (!venue) return { people: [], goods: [], uniqueKws: [] };

  // Find other memories at the same venue
  const sameVenue = memories.filter(m =>
    m.id !== memory.id && normVenue(m.nineD?.V_venue?.type) === venue
  );

  // This memory's attributes
  const myPeople = new Set((memory.nineD?.W_who || []).map(p => p.name));
  const myGoods = new Set((memory.nineD?.G_goods || []).map(g => g.name));
  const myKws = new Set(memory.nineD?.X_semantic?.keywords || []);

  // Collect all attributes from other same-venue memories
  const otherPeople = new Set();
  const otherGoods = new Set();
  const otherKws = new Set();
  for (const m of sameVenue) {
    for (const p of (m.nineD?.W_who || [])) otherPeople.add(p.name);
    for (const g of (m.nineD?.G_goods || [])) otherGoods.add(g.name);
    for (const k of (m.nineD?.X_semantic?.keywords || [])) otherKws.add(k);
  }

  // Find unique markers (in this memory but not in others)
  const uniquePeople = [...myPeople].filter(p => !otherPeople.has(p) && p !== '用户' && p !== 'AI' && p !== '我' && p !== '你');
  const uniqueGoods = [...myGoods].filter(g => !otherGoods.has(g));
  const uniqueKws = [...myKws].filter(k => !otherKws.has(k) && !GENERIC_KWS.includes(k));

  return { people: uniquePeople, goods: uniqueGoods, uniqueKws: uniqueKws.slice(0, 3) };
}

export function clear() {
  memories = [];
  save();
}
