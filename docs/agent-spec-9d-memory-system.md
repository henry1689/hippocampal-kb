# 海马体 9D 情感记忆系统 — Agent 实现规范

> 版本: 1.0 | 最后更新: 2026-05-30
> 用途: 给 AI agent 的完整实现指引。按此规范可完美复刻系统。
> 文件位置: `hippocampal-kb/` (项目根目录)

---

## 目录

1. [项目总览](#1-项目总览)
2. [数据模型](#2-数据模型)
3. [核心算法：搜索评分引擎](#3-核心算法搜索评分引擎)
4. [核心算法：同事件识别（isSameEvent）](#4-核心算法同事件识别)
5. [核心算法：记忆增强（enrichExisting）](#5-核心算法记忆增强)
6. [核心文件：memory-store.js](#6-核心文件memory-storejs)
7. [核心文件：chat.js](#7-核心文件chatjs)
8. [核心文件：index.js API 层](#8-核心文件indexjs-api-层)
9. [前端组件与数据流](#9-前端组件与数据流)
10. [环境与配置](#10-环境与配置)
11. [关键设计决策及理由](#11-关键设计决策及理由)
12. [已知问题与待改进](#12-已知问题与待改进)

---

## 1. 项目总览

### 1.1 一句话定义

一个通过 9 维情感记忆体系（9D）实现 AI 长期记忆与人设一致性的 RAG（检索增强生成）系统。每次聊天自动提取情感记忆，下次聊天时通过多维搜索召回，注入 AI 上下文。

### 1.2 文件结构

```
hippocampal-kb/
├── index.html                    # Vite 入口 HTML
├── package.json                  # 依赖 & 脚本
├── vite.config.ts                # Vite 配置（/api → localhost:3001 代理）
├── tsconfig.json                 # TypeScript 配置
├── server/
│   ├── index.js                  # Express 服务端入口，定义所有 API 路由
│   ├── chat.js                   # RAG 对话逻辑：chatWithDeepSeek + extractMemory
│   └── memory-store.js           # 记忆引擎：CRUD + 搜索 + 同事件合并 + 维度评分
├── src/
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 主应用组件（状态管理 + 聊天 + 文件上传）
│   ├── index.css                 # 全局样式
│   ├── types/index.ts            # TypeScript 类型定义
│   ├── components/
│   │   ├── ChatMessage.tsx       # 纯对话气泡（只渲染 text）
│   │   ├── MemoryLog.tsx         # 词元拆分日志面板
│   │   ├── SceneReconstruction.tsx  # 线索重建面板（前端搜索 + 9D 还原）
│   │   ├── NineDRadar.tsx        # 9D 雷达图
│   │   ├── KeywordGraph.tsx      # 词元关联图谱
│   │   ├── Timeline.tsx          # 时间线
│   │   └── LoadingScreen.tsx     # 加载屏
│   └── engine/
│       ├── SearchEngine.ts       # 前端搜索引擝
│       ├── NineDEncoder.ts       # 9D 编码器（维度检测）
│       └── similarity.ts         # Jaccard 相似度等工具
├── public/
│   └── favicon.svg               # 图标
├── data/
│   └── memories.json             # 持久化记忆文件（JSON）
├── docs/
│   ├── architecture-9d-memory-system.md  # 架构设计文档
│   └── agent-spec-9d-memory-system.md    # 本文件：Agent 实现规范
└── .env                          # 环境变量（DeepSeek API Key）
```

### 1.3 六条不可违背的设计原则

```
原则一：原文不可篡改
  → memory.text 必须是用户原始输入，AI 不得改写/概括/拼接
  → AI 生成的摘要只能出现在临时上下文中，不存入持久化记忆

原则二：9D 是检索桥梁，不是存储格式
  → 9 个维度存在的唯一目的是多角度搜索
  → 搜索时每个维度独立打分，最后加权求和

原则三：记忆是活的（同事件合并）
  → 同一事件反复提及 → 增强旧记录，不新增
  → 越常回忆，关键词越丰富、情感强度越准确

原则四：AI 不准猜，只能反问
  → 多条相关记忆时 → 列出辨识线索，让用户选择
  → 确认后再用选定记忆的内容回答

原则五：7 天间隔判定为不同事件
  → 相同 venue 但时间差 > 7 天 → isSameEvent = false
  → 防止"两次咖啡厅约会"被错误合并

原则六：搜索可解释、可调参
  → 18 个评分因子的权重都可独立调整
  → 每次搜索都有明确的分分依据
```

---

## 2. 数据模型

### 2.1 memories.json 格式

```json
{
  "version": 1,
  "data": [
    { /* Memory 条目 */ }
  ]
}
```

### 2.2 Memory 完整结构

```typescript
interface Memory {
  // ─── 基础字段 ───
  id: string;                          // "mem_{counter}_{timestamp}" 或 "know_{counter}_{timestamp}"
  type: 'memory' | 'article' | 'knowledge';
  priority: 0 | 1 | 2;                 // 0=系统, 1=聊天记忆(默认), 2=文章/知识库(高保留)
  title: string;                       // 人类可读的标题（提取/生成）
  text: string;                        // ⚠️ 核心字段：用户原始输入（聊天）或 AI 摘要（文章）
  tags: string[];                      // 标签数组
  timestamp: number;                   // Unix 毫秒时间戳

  // ─── 文章专用字段 ───
  originalContent?: string;            // 文章全文（不上传前端，仅 RAG 按需加载）
  category?: string;                   // 文章/文档分类
  evokedFeelings?: string[];           // 文章引发的情感（七情六欲）

  // ─── 9D 情感词元 ───
  nineD: NineDVector;

  // ─── 内部字段 ───
  _supplement?: string;                // 补充文本（enrichExisting 保留的备选原文）
}

interface NineDVector {
  X_semantic: {                        // 语义——"说了什么"
    keywords: string[];                // 关键词（双向匹配用，最多 10-15 个）
    topics: string[];                  // 主题列表
  };
  Y_time: {                            // 时间——"什么时候"
    // absolute 由外层 timestamp 字段存储
    season: string;                    // '春' | '夏' | '秋' | '冬' | ''
    dayNight: string;                  // '清晨' | '上午' | '中午' | '下午' | '傍晚' | '夜晚' | ''
  };
  Z_emotion: {                         // 情感——"什么情绪"
    vector: {
      valence: number;                 // -1 (负面) ~ +1 (正面)
      arousal: number;                 // -1 (平静) ~ +1 (兴奋)
    };
    intensity: number;                 // 0~1 情感强度
    primaryType: string;               // 情感类型：喜悦/悲伤/愤怒/恐惧/爱/思念/温暖/感伤/平静 等
  };
  W_who: Array<{                       // 人物——"和谁"
    name: string;
    identity: string;                  // 角色：self, romantic_interest, boss, spouse, child...
    gender: string;                    // '男' | '女' | '未知'
    relationship: string;              // 关系：伴侣/同事/朋友/家人...
    role: string;                      // '参与者' | '观察者' | '讲述者'
  }>;
  V_venue: {                           // 场景——"在哪里"
    type: string;                      // 场景类型（经 normVenue 归一化：咖啡厅/办公室/家/老街...）
    environment: string;               // 'indoor' | 'outdoor'
    lighting: string;                  // '温暖阳光' | '昏暗' | '黄昏' | '明亮' | ''
    atmosphere: string;                // '浪漫' | '紧张' | '轻松' | '悲伤' | ''
  };
  R_relation: {                        // 关系——"什么关系"
    interactionType: string;           // '浪漫约会' | '商务会议' | '家庭聚餐' | '聊天' | '同学' ...
    intimacyLevel: number;             // 0~1 亲密度
    socialDynamics: string;            // 'egalitarian' | 'hierarchical' | 'solo' | 'intimate'
    conversationFlow: string;          // 'smooth' | 'nervous' | 'heated' | 'quiet' | ''
  };
  M_depth: {                           // 深刻度——"多重要"
    importance: number;                // 0~1 重要性
    retentionPriority: number;         // 0~1 保留优先级
    emotionalWeight: number;           // 0~1 情感权重（通常等于 Z_emotion.intensity）
  };
  G_goods: Array<{                     // 物件——"有什么"
    name: string;
    category: string;                  // '衣物' | '食物' | '音乐' | '礼物' | '家具' | '动物' ...
    significance: string;              // 象征意义
  }>;
  S_senses: {                          // 感官——"感受到什么"
    visual: string;                    // 视觉画面描述
    auditory: string;                  // 声音/音乐描述
    olfactory: string;                 // 气味描述
    tactile: string;                   // 触感描述
    taste: string;                     // 味觉描述
  };
}
```

### 2.3 三种 memory type 的区别

| 字段 | `type:'memory'` | `type:'article'` | `type:'knowledge'` |
|:---|:---|:---|:---|
| 来源 | chat 聊天提取 | 上传 .txt 文章 | 上传工作文档 |
| priority | 1 | 2 | 2 |
| text | 用户原始输入 | AI 写的摘要 | AI 写的摘要 |
| originalContent | 无 | 文章全文 | 文档全文 |
| 情感强度 | 由 extractMemory 决定 | 由 LLM 分析决定 | 0.1（低） |
| 创建函数 | `add()` | `addKnowledge(article:true)` | `addKnowledge(article:false)` |

### 2.4 场地归一化映射表（VENUE_ALIASES）

不同输入映射到统一场地名，用于场地匹配和同事件判定：

```javascript
const VENUE_ALIASES = {
  '咖啡厅':'咖啡厅', '咖啡馆':'咖啡厅', 'coffee':'咖啡厅', 'cafe':'咖啡厅',
  '街道':'街道', '户外街道':'街道', '街头':'街道', '路边':'街道',
  '海滩':'海滩', '沙滩':'海滩', '海边':'海滩',
  '办公室':'办公室', '办公':'办公室', '工位':'办公室',
  '餐厅':'餐厅', '饭店':'餐厅', '餐馆':'餐厅', '食堂':'餐厅',
  '会议':'会议室', '会议室':'会议室', '开会':'会议室',
  '家':'家', '家里':'家', '家中':'家', 'home':'家',
};

function normVenue(type) {
  if (!type) return '';
  return VENUE_ALIASES[type] || type;
}
```

### 2.5 泛型关键词（GENERIC_KWS）

这些词在 `isSameEvent` 中不计入关键词匹配，因为它们太常见，会误判：

```javascript
const GENERIC_KWS = ['咖啡厅','咖啡馆','回忆','聊天','用户','AI','自己'];
```

---

## 3. 核心算法：搜索评分引擎

### 3.1 searchDimension(query, topK=5)

这是系统的核心搜索算法。遍历所有记忆，对每条计算总分，返回 Top K。

```javascript
function searchDimension(query, topK = 5) {
  // 1. 小写化查询词
  const q = query.toLowerCase();

  // 2. 常量映射表
  const VENUE_KWS = {
    '咖啡厅':'coffee_shop', '咖啡馆':'coffee_shop',
    '会议':'conference_room', '办公室':'office',
    '海滩':'beach', '沙滩':'beach',
    '图书馆':'library', '家':'home',
    '餐厅':'restaurant', '车间':'workshop', '生产部':'workshop'
  };
  const SEASON_KWS = ['春','夏','秋','冬','春天','夏天','秋天','冬天'];
  const DAYNIGHT_KWS = ['清晨','上午','中午','下午','傍晚','黄昏','夜晚','晚上'];
  const RELATION_KWS = {
    '约会':'romantic_date', '会议':'business_meeting',
    '家庭':'family_gathering', '独处':'solitude', '聊天':'friendly_chat'
  };
  const RECALL_KWS = ['记得','回忆','想起','之前','过去','那天','昨天',
                       '还记得','还记不记得','还记得吗'];

  // 3. 辅助函数：查询词是否匹配数组中任意项（双向）
  function qMatchAny(arr) {
    if (!arr) return false;
    for (const item of arr) {
      const lower = item.toLowerCase();
      if (q.includes(lower) || lower.includes(q)) return true;
    }
    return false;
  }

  // 4. 对每条记忆评分
  const scored = memories.map(m => {
    let score = 0;

    // [因子1] 标题匹配（双向）+ 文本匹配 + 分类匹配
    if (m.title?.toLowerCase().includes(q) || q.includes(m.title?.toLowerCase().slice(0, 4) || '')) score += 0.4;
    if (m.text?.toLowerCase().includes(q)) score += 0.3;
    if (m.category?.toLowerCase().includes(q)) score += 0.25;

    // [因子2] 关键词双向匹配
    if (qMatchAny(m.nineD?.X_semantic?.keywords)) score += 0.2;

    // [因子3] 标签双向匹配
    if (qMatchAny(m.tags)) score += 0.15;

    // [因子4-5] 场地匹配 ⚠️ 权重最高
    const mVenue = normVenue(m.nineD?.V_venue?.type);
    if (mVenue) {
      // 精准匹配：查询词包含 VENUE_KWS 的 key 且归一化后一致 → +1.0
      for (const [kw] of Object.entries(VENUE_KWS)) {
        if (q.includes(kw)) {
          const kVenue = normVenue(kw);
          if (kVenue && kVenue === mVenue) { score += 1.0; break; }
        }
      }
      // 直接匹配：查询词包含场地名或反之 → +0.6
      if (q.includes(mVenue.toLowerCase()) || mVenue.toLowerCase().includes(q)) score += 0.6;
    }

    // [因子6] 季节/早晚匹配
    for (const k of SEASON_KWS) {
      if (q.includes(k) && m.nineD?.Y_time?.season === k) score += 0.3;
    }
    for (const k of DAYNIGHT_KWS) {
      if (q.includes(k) && (m.nineD?.Y_time?.dayNight === k || m.nineD?.V_venue?.lighting === k)) score += 0.25;
    }

    // [因子7] 物件名称匹配
    for (const g of (m.nineD?.G_goods || [])) {
      if (g.name && (q.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(q))) {
        score += 0.3; break;
      }
      if (g.significance && q.includes(g.significance.toLowerCase())) { score += 0.15; break; }
    }

    // [因子8] 关系类型匹配
    for (const [kw, type] of Object.entries(RELATION_KWS)) {
      if (q.includes(kw) && m.nineD?.R_relation?.interactionType === type) score += 0.25;
    }

    // [因子9] 人物名称匹配
    for (const p of (m.nineD?.W_who || [])) {
      if (p.name && (q.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(q))) {
        score += 0.25; break;
      }
    }

    // [因子10] 感官匹配
    const senses = m.nineD?.S_senses;
    if (senses) {
      for (const key of ['visual','auditory','olfactory','tactile','taste']) {
        if (senses[key] && q.includes(senses[key].toLowerCase().slice(0, 4))) { score += 0.2; break; }
      }
    }

    // [因子11] 回忆意图加成 ⚠️ 关键乘数
    const isRecallQuery = RECALL_KWS.some(k => q.includes(k));
    if (isRecallQuery && score > 0.3) score *= 1.3;

    // [因子12] 情感关键词匹配
    const posWords = ['开心','快乐','幸福','浪漫','温暖','喜悦'];
    const negWords = ['沮丧','悲伤','难过','失落','愤怒','紧张','焦虑'];
    for (const w of posWords) if (q.includes(w) && m.nineD?.Z_emotion?.vector?.valence > 0.3) score += 0.2;
    for (const w of negWords) if (q.includes(w) && m.nineD?.Z_emotion?.vector?.valence < -0.3) score += 0.2;

    // [因子13] 情感强度加成
    const intensity = m.nineD?.Z_emotion?.intensity || 0;
    score += intensity * 0.1;

    // [因子14] 记忆深度加成
    const depth = m.nineD?.M_depth;
    if (depth) {
      score += (depth.importance || 0) * 0.08 + (depth.emotionalWeight || 0) * 0.07;
    }

    // [因子15] 情感查询放大
    const EMO_KWS = ['开心','难过','感动','温暖','幸福','伤心','怀念','浪漫',
                     '激动','紧张','害怕','焦虑','愤怒','委屈','满足','快乐',
                     '悲伤','痛苦','甜蜜','美好','感激','遗憾','温馨','喜悦',
                     '沮丧','失落','恐惧','惊喜','轻松'];
    if (EMO_KWS.some(k => q.includes(k))) {
      score += intensity * 0.2;
      if (depth) score += (depth.importance || 0) * 0.1;
    }

    // [因子16] 时间衰减（30天内线性减至0.1）
    const ageDays = (Date.now() - (m.timestamp || 0)) / 86400000;
    score += Math.max(0, 1 - ageDays / 30) * 0.1;

    return { memory: m, score };
  });

  // 5. 过滤 + 排序 + TopK
  return scored
    .filter(r => r.score > 0.15)       // 阈值 0.15
    .sort((a, b) => b.score - a.score)  // 降序
    .slice(0, topK)                     // 取 topK
    .map(r => r.memory);                // 返冑 memory 对象列表
}
```

### 3.2 searchRaw(query, topK=3) — 兜底搜索

当 `searchDimension` 返回空时使用。纯文本 bigram 匹配：

```javascript
function searchRaw(query, topK = 3) {
  const q = query.toLowerCase();
  const results = memories.map(m => {
    let score = 0;
    const title = (m.title || '').toLowerCase();
    const text = (m.text || '').toLowerCase();

    // 完全包含 → 高分
    if (title.includes(q) || text.includes(q)) score = 0.8;
    // 否则 bigram 分段匹配
    else if (q.length >= 2) {
      for (let i = 0; i < q.length - 1; i++) {
        const seg = q.slice(i, i + 2);
        // 跳过无意义的单字 bigram
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
```

### 3.3 search(query, topK=5) — 入口

```javascript
function search(query, topK = 5) {
  const dimResults = searchDimension(query, topK);
  if (dimResults.length > 0) return dimResults;
  return searchRaw(query, Math.max(topK, 3));
}
```

---

## 4. 核心算法：同事件识别

### 4.1 isSameEvent(a, b) — 判断两条记忆是否指向同一现实事件

```javascript
function isSameEvent(a, b) {
  // 条件1：必须同场地
  const aVenue = normVenue(a.nineD?.V_venue?.type);
  const bVenue = normVenue(b.nineD?.V_venue?.type);
  if (!aVenue || !bVenue || aVenue !== bVenue) return false;

  // 条件2：时间差 > 7 天 → 不同事件
  if (a.timestamp && b.timestamp && Math.abs(a.timestamp - b.timestamp) > 7 * 86400000) {
    return false;
  }

  // 条件3：至少有 1 个非泛型关键词重叠 或 1 个非通用人物重叠
  const skipKws = GENERIC_KWS; // ['咖啡厅','咖啡馆','回忆','聊天','用户','AI','自己']
  const aKws = (a.nineD?.X_semantic?.keywords || []).filter(k => !skipKws.includes(k));
  const bKws = (b.nineD?.X_semantic?.keywords || []).filter(k => !skipKws.includes(k));
  const commonKws = aKws.filter(k => bKws.includes(k));

  const skipPeople = new Set(['用户','AI','我','你']);
  const aPeople = (a.nineD?.W_who || []).map(p => p.name).filter(n => !skipPeople.has(n));
  const bPeople = (b.nineD?.W_who || []).map(p => p.name).filter(n => !skipPeople.has(n));
  const commonPeople = aPeople.filter(n => bPeople.includes(n));

  // 如果交互类型明确不同，需强证据（至少2个共同关键词）
  const aRel = a.nineD?.R_relation?.interactionType;
  const bRel = b.nineD?.R_relation?.interactionType;
  if (aRel && bRel && aRel !== bRel) {
    return commonKws.length >= 2;
  }

  return commonKws.length >= 1 || commonPeople.length >= 1;
}
```

**判定逻辑总结：**

```
同事件 = 同场地 AND 时间差≤7天 AND (有共同非泛型关键词 OR 有共同人物)
不同交互类型 → 需要 ≥2 个共同关键词（更严格）
```

---

## 5. 核心算法：记忆增强

### 5.1 enrichExisting(newMem) — 合并同事件记忆

当 `isSameEvent` 返回 true 时，将新记忆的信息合并到旧记忆中。

```javascript
function enrichExisting(newMem) {
  for (const existing of memories) {
    if (!isSameEvent(newMem, existing)) continue;

    // ── text：保留最详细的原文 ──
    // 新文本更长 → 新文本升级为主文本，旧文本存到 _supplement
    // 旧文本更长 → 新文本存到 _supplement
    if (newMem.text && !existing.text.includes(newMem.text)) {
      if (newMem.text.length > existing.text.length) {
        existing._supplement = existing.text;
        existing.text = newMem.text;
      } else {
        existing._supplement = (existing._supplement || '') + '；' + newMem.text;
      }
    }

    // ── keywords：合并去重 ──
    existing.nineD.X_semantic.keywords = [...new Set([
      ...(existing.nineD.X_semantic.keywords || []),
      ...(newMem.nineD.X_semantic.keywords || [])
    ])];

    // ── topics：合并去重 ──
    existing.nineD.X_semantic.topics = [...new Set([
      ...(existing.nineD.X_semantic.topics || []),
      ...(newMem.nineD.X_semantic.topics || [])
    ])];

    // ── tags：合并去重 ──
    existing.tags = [...new Set([
      ...(existing.tags || []),
      ...(newMem.tags || [])
    ])];

    // ── emotion：加权平均（旧:新 = 2:1）──
    const eEmo = existing.nineD.Z_emotion.vector;
    const nEmo = newMem.nineD.Z_emotion.vector;
    if (eEmo && nEmo) {
      eEmo.valence = (eEmo.valence * 2 + nEmo.valence) / 3;
      eEmo.arousal = (eEmo.arousal * 2 + nEmo.arousal) / 3;
    }
    // 新情感强度更高且类型存在 → 更新类型和强度
    if (nInt > eInt && newMem.nineD?.Z_emotion?.primaryType) {
      existing.nineD.Z_emotion.primaryType = newMem.nineD.Z_emotion.primaryType;
      existing.nineD.Z_emotion.intensity = (eInt + nInt) / 2;
    }

    // ── M_depth：取最大值 ──
    existing.nineD.M_depth.importance = Math.max(
      existing.nineD.M_depth.importance || 0,
      newMem.nineD.M_depth.importance || 0
    );
    existing.nineD.M_depth.retentionPriority = Math.max(
      existing.nineD.M_depth.retentionPriority || 0,
      newMem.nineD.M_depth.retentionPriority || 0
    );

    // ── W_who：合并去重 ──
    for (const np of (newMem.nineD.W_who || [])) {
      if (!existing.nineD.W_who.some(ep => ep.name === np.name)) {
        existing.nineD.W_who.push(np);
      }
    }

    // ── G_goods：合并去重 ──
    for (const ng of (newMem.nineD.G_goods || [])) {
      if (ng.name && !existing.nineD.G_goods.some(eg => eg.name === ng.name)) {
        existing.nineD.G_goods.push(ng);
      }
    }

    // ── S_senses：填充空字段 ──
    for (const key of ['visual','auditory','olfactory','tactile','taste']) {
      if (!existing.nineD.S_senses[key] && newMem.nineD?.S_senses?.[key]) {
        existing.nineD.S_senses[key] = newMem.nineD.S_senses[key];
      }
    }

    // ── timestamp：取较新值 ──
    existing.timestamp = Math.max(existing.timestamp, newMem.timestamp);

    // ── title：取较长值 ──
    if (newMem.title && newMem.title.length > (existing.title || '').length) {
      existing.title = newMem.title;
    }

    return existing; // 只合并第一个匹配
  }
  return null; // 无匹配
}
```

### 5.2 add(memory) — 记忆入库

```javascript
function add(memory) {
  memory.timestamp = memory.timestamp || Date.now();

  const matched = enrichExisting(memory);   // 尝试合并
  if (matched) {
    save();                                 // 合并了旧记录，只保存
    return matched;
  }

  // 新事件 → 新增
  memory.id = memory.id || `mem_${++counter}_${Date.now()}`;
  if (memory.priority === undefined) memory.priority = 1;
  memories.unshift(memory);                 // 加到列表最前
  save();
  return memory;
}
```

**关键设计点：** 合并后不新增记录。同事件永远只有一条活跃记录。

---

## 6. 核心文件：memory-store.js

### 6.1 文件职责

```javascript
import fs from 'fs';
import path from 'path';
```

单一职责：记忆数据的持久化、检索、变更。不涉及 AI 调用。

### 6.2 持久化实现

```javascript
const DATA_FILE = path.join(__dirname, '..', 'data', 'memories.json');
let memories = [];
let loaded = false;
const DATA_VERSION = 1;

function load() {
  if (loaded) return;  // 单例，一次会话只读一次磁盘
  // 读取文件 → 兼容旧格式（裸数组）和新格式（{version, data}）
  // → 执行 migrate() 版本迁移
}

function save() {
  // 写为 { version: DATA_VERSION, data: memories }
}

function migrate(data, fromVersion) {
  // 未来迁移逻辑：if (v < 2) { data = v2_upgrade(data); v = 2; }
}
```

### 6.3 所有导出函数签名

```javascript
// 获取全部记忆
export function getAll(): Memory[]

// 搜索（dimension + raw 两级回退）
export function search(query: string, topK?: number): Memory[]
export function searchRaw(query: string, topK?: number): Memory[]

// 聊天记忆入库
export function add(memory: Partial<Memory>): Memory

// 文章/知识库入库
export function addKnowledge({
  title, content, category, summary, keywords, tags,
  article, emotion, scene, characters, objects, senses, interactionType
}: AddKnowledgeParams): Memory

// 清空
export function clear(): void

// 工具函数
export function getAll(): Memory[]
export function getRelativeTime(memory: Memory): string
export function getKeywordFrequency(): Record<string, number>
export function getDimensionSalience(memory: Memory): Array<{dim: string, label: string, score: number}>
export function getDistinctiveMarkers(memory: Memory): {people: string[], goods: string[], uniqueKws: string[]}
```

### 6.4 addKnowledge 参数与逻辑

```javascript
export function addKnowledge({
  title,           // 标题
  content,         // 原始内容（全文）
  category,        // 分类
  summary,         // AI 生成的摘要（长度≤100）
  keywords,        // 关键词列表
  tags,            // 标签列表
  article,         // boolean: true=文章, false=工作文档
  emotion,         // { valence, arousal, primaryType, intensity, evokedFeelings }
  scene,           // { type, atmosphere, lighting }
  characters,      // [{ name, identity, relationship }]
  objects,         // [{ name, category, significance }]
  senses,          // { visual, auditory, olfactory, tactile }
  interactionType  // 互动类型
}) {
  // article=true → type='article', priority=2, 情感来自 LLM 分析
  // article=false → type='knowledge', priority=2, 情感默认低强度
  // text 字段存 summary（非原文，原文存 originalContent）
  // 9D 各维度按文章特有逻辑填充（场景/人物/物件/感官来自 LLM 分析结果）
}
```

---

## 7. 核心文件：chat.js

### 7.1 文件职责

两个导出函数：
1. `chatWithDeepSeek(messages, contextMemories)` — 构建 RAG 上下文，调用 DeepSeek API
2. `extractMemory(messages, replyText)` — 从对话中提取 9D 记忆

### 7.2 chatWithDeepSeek — 三层规则系统

**第一层：System Prompt（永久生效）**

```javascript
const systemContent = `你是都灵，用户的妻子（18岁，漂亮温柔）也是工作中的秘书...
重要规则：不要编造细节。

当用户问起以前的事时：
- 📍 如果只有一条相关记忆 → 用那条记忆的细节来回答
- 📍 如果有多条相关记忆 → 🚫 不要自己选一个回答！
    而是把每条记忆最有辨识度的细节分别列出，问用户是哪一次
- 📍 如果没有相关记忆 → 坦诚说不记得了，引导用户分享
- 每次提到的细节必须只来自真实记忆中的记录，绝对不能编造。`;
```

**第二层：上下文规则块（每次注入）**

构建位置：API messages 中，历史对话之后、用户最新查询之前。

```
【系统指令】以下是 N 条相关记忆——这些是过去对话的事实记录。

规则（必须遵守）：
1. 基于记忆中的事实回答，直接引用用户原话
2. 可以说"上次你提到……"、"我记得你说过……"、"是不是那次……"
3. 绝对不要编造细节
4. 突出维度分数高的方面要重点还原，特别注意场景和感官维度
5. ⚠️ 关键区分：多条记忆时，不猜！列选项反问用户
6. 线索不足时继续追问
7. 标记为"资料"的是工作文档
8. 标记为"文章"的是文学作品，按情感节奏互动
9. text 是用户原话，不要概括
10. 情感浓度高时放慢语感（条件性）
11. 用户提到地点时优先匹配（条件性）
```

**第三层：最终强调（最后一条 user message）**

```javascript
if (mentionedVenue) {
  `用户的问题中提到了"咖啡厅"。⚠️ 记忆列表中所有场景不是"咖啡厅"的记忆都不能用来回答。`
}
`基于以上记忆，回答用户：${query}`
```

### 7.3 记忆上下文格式化

三种类型格式不同：

**普通聊天记忆：**
```
[记忆 1] 标题（时间）
  内容: 用户原始输入
  场景: 咖啡厅 | 情感: 温馨
  人物: 用户 | 物件: 淡蓝色衬衫
  突出维度: 情感(85%) · 语义(70%)
  辨识线索: 独特物件: 淡蓝色衬衫
```

**文章记忆：**
```
[文章 1] 标题（时间）
  摘要: AI 摘要
  情感基调: 感伤（强度 80%）
  引发情绪: 怀旧、思念
  人物: 外婆 | 物件: 糖葫芦、花猫
  场景氛围: 老街 · 黄昏
  感官: 视觉:淡红色斜阳
  📄 用户未询问具体内容，用摘要和情感词元回应即可
```

**资料记忆：**
```
[资料 1] 标题（时间）
  摘要: ...
  分类: 技术文档
  关键词: 关键词1、关键词2
```

### 7.4 场地检测（条件规则 11 用）

```javascript
const VENUE_KEYWORDS = [
  '咖啡厅','咖啡馆','餐厅','饭店','办公室','会议室',
  '家','家里','海滩','沙滩','图书馆','车间','教室',
  '宿舍','公园','街道','路边','校门口','咖啡店'
];
const mentionedVenue = VENUE_KEYWORDS.find(k => q.includes(k));
```

### 7.5 extractMemory — 记忆提取

```javascript
export async function extractMemory(messages, replyText) {
  // 1. 获取用户最后一条输入
  const lastUserContent = messages.filter(m => m.role === 'user').slice(-1)[0].content;

  // 2. 清洗：去掉上传文件/报告前缀
  const userText = lastUserContent
    .replace(/^\[(上传文件|提交报告|系统指令).*?\]\n?/, '')
    .replace(/^[（\(]?上传了(文件|文章).*?[）\)]?\n?/, '')
    .trim();

  // 3. ⚠️ 三道 Guard
  if (!userText || userText.length < 5) return null;       // 太短
  if (userText.length > 500) return null;                   // 太长（可能是文章全文）
  if (/^(什么是|怎样|如何|为什么|会不会|能不能|是不是|有没有|测试|test|ping)/i.test(userText)) return null;  // 系统性问题

  // 4. 构建 LLM 提取 prompt（JSON 格式约束）
  // prompt 要求 LLM 输出 { title, nineD, tags }
  // ⚠️ text 字段不由 LLM 生成，由系统保存用户原文

  // 5. 调用 DeepSeek
  // 失败 → makeBasicMemory(userText) 兜底
  // 成功 → 合并 LLM 的 9D + 用户原文 → 返回 memory 对象
}
```

**LLM 提取 prompt（嵌入在 extractMemory 中）：**

```
从以下对话中提取9D情感词元。按 JSON 格式输出，不要包含其他文字：

{
  "title": "能概括核心内容的有意义标题（8-20字，让用户一眼认出是哪条记忆）",
  "nineD": {
    "X_semantic": { "keywords": ["关键词1","关键词2"], "topics": ["主题1"] },
    "Z_emotion": { "vector": { "valence": 0.0, "arousal": 0.0 }, "intensity": 0.5, "primaryType": "情绪类型" },
    "W_who": [{ "name": "人名", "identity": "角色", "gender": "男/女", "relationship": "关系", "role": "参与者/观察者" }],
    "V_venue": { "type": "场景类型", "environment": "indoor/outdoor", "lighting": "照明", "atmosphere": "氛围" },
    "R_relation": { "interactionType": "互动类型", "intimacyLevel": 0.5, "socialDynamics": "dynamics", "conversationFlow": "flow" },
    "M_depth": { "importance": 0.5, "retentionPriority": 0.5, "emotionalWeight": 0.5 },
    "G_goods": [{ "name": "物件名", "category": "类别", "significance": "意义" }],
    "S_senses": { "visual": "", "auditory": "", "olfactory": "", "tactile": "", "taste": "" }
  },
  "tags": ["标签1"]
}

注意：只提取9D词元，text字段由系统另行保存，不需要在这里生成。
如果对话中没有足够信息提取记忆，返回 null。
valence -1~1，arousal -1~1
```

### 7.6 makeBasicMemory — 兜底函数

```javascript
function makeBasicMemory(text) {
  if (!text || text.length < 5) return null;

  // 提取中文字词作为关键词
  const kws = [...new Set(text.match(/[一-鿿]{2,}/g) || [])].slice(0, 10);

  // 标题：取原文前15字（去掉"上传文件"类前缀）
  const titleText = text.replace(/^[\[\（\(]?[上传文件提交报告][^）\）\]]*[\）\）\]]?/, '').trim();
  const title = titleText.length > 15 ? titleText.slice(0, 15) + '…' : (titleText || '聊天记录');

  return {
    title,
    text,      // 原文
    nineD: {
      X_semantic: { keywords: kws, topics: [] },
      Z_emotion: { vector: { valence: 0, arousal: 0 }, intensity: 0.3, primaryType: 'neutral' },
      W_who: [], V_venue: {}, R_relation: {},
      M_depth: { importance: 0.3, retentionPriority: 0.3, emotionalWeight: 0.3 },
      G_goods: [], S_senses: {},
    },
    tags: kws.slice(0, 3),
    timestamp: Date.now(),
  };
}
```

---

## 8. 核心文件：index.js (API 层)

### 8.1 所有 API 端点

```
POST /api/chat        → 聊天（RAG 对话 + 记忆提取）
POST /api/knowledge   → 上传文章/文档
GET  /api/memories    → 获取全部记忆
GET  /api/search      → 搜索记忆（query param: ?q=）
DELETE /api/memories  → 清空记忆
```

### 8.2 POST /api/chat

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "还记得咖啡厅的事吗？" }
  ]
}
```

**Response:**
```json
{
  "reply": "（温柔回应）是那家爵士咖啡馆吗？",
  "memory": { /* Memory 对象或 null */ },
  "relatedMemories": [ /* 5 条 Memory */ ]
}
```

**处理逻辑：**
```
1. search(query, 5)           → 搜索 5 条相关记忆
2. chatWithDeepSeek(messages, relatedMemories) → AI 回复
3. extractMemory(messages, replyText) → 提取新记忆
4. add(memory)                → 入库（含合并逻辑）
5. 返回 { reply, memory, relatedMemories }
```

### 8.3 POST /api/knowledge

**Request:**
```json
{
  "title": "文章标题",
  "content": "全文内容",
  "category": "散文",
  "article": true
}
```

**Response:**
```json
{
  "memory": { /* Memory 对象 */ },
  "analysis": { /* LLM 分析结果 */ }
}
```

**处理逻辑：**
```
1. 初始化默认分析结果（含默认 emotion）
2. 调用 DeepSeek 做情感分析（prompt 分 article 和 doc 两种）
3. 分析失败 → 使用默认值，文章不丢失
4. addKnowledge({...}) → 入库
5. 返回 { memory, analysis }
```

### 8.4 文章分析 prompt

```javascript
const articlePrompt = `分析以下文章/故事，按以下流程处理：

第一步：写一段有情感共鸣的摘要（100字内），捕捉文章的情感基调和核心内容。
第二步：从摘要中提取完整的 9D 情感词元。

按 JSON 格式输出（不要其他文字）：
{
  "title": "文章标题",
  "summary": "有情感共鸣的一段话总结（100字内）",
  "keywords": ["关键词1","关键词2","关键词3"],
  "emotion": {
    "valence": 0.0, "arousal": 0.0,
    "primaryType": "核心情感类型",
    "intensity": 0.5,
    "evokedFeelings": ["情绪1","情绪2"]
  },
  "scene": { "type": "场景类型", "atmosphere": "氛围", "lighting": "光线" },
  "characters": [{ "name": "人物名", "identity": "角色", "relationship": "关系" }],
  "objects": [{ "name": "物件名", "category": "类别", "significance": "意义" }],
  "senses": { "visual": "", "auditory": "", "olfactory": "", "tactile": "" },
  "interactionType": "互动类型",
  "category": "文章分类",
  "tags": ["标签1","标签2"]
}`;
```

---

## 9. 前端组件与数据流

### 9.1 组件总览

```
App.tsx (状态管理中心)
├── LoadingScreen.tsx          # 初始加载屏
├── KeywordGraph.tsx           # 词元关联图谱（D3 force）
│   Props: { memories, selectedId, onSelect }
├── NineDRadar.tsx             # 9D 雷达图
│   Props: { memory }
├── SceneReconstruction.tsx    # 线索重建面板
│   Props: { memories, onSelect }
├── MemoryLog.tsx              # 词元拆分日志
│   Props: { memories, onSelect }
├── Timeline.tsx               # 时间线
│   Props: { memories, selectedId, onSelect }
└── 聊天侧边栏:
    ├── ChatMessage.tsx        # 纯对话气泡
    │   Props: { message: { id, role, text } }
    └── 输入栏（App.tsx 内联）
```

### 9.2 App.tsx 状态管理

```typescript
// 消息列表
const [messages, setMessages] = useState<Message[]>([{
  id: 'intro', role: 'assistant',
  text: '你好，我是海马体情感记忆系统。\n和我聊天吧，我会记住重要的事，并在之后回答时回忆起来。'
}]);

// 聊天记忆（展示在 MemoryLog）
const [chatMemories, setChatMemories] = useState<ChatMemory[]>([]);

// 用户输入
const [input, setInput] = useState('');
const [sending, setSending] = useState(false);

// 选中记忆（联动所有可视化面板）
const [selectedId, setSelectedId] = useState<string | undefined>();
```

**ChatMemory 接口：**
```typescript
interface ChatMemory {
  id: string;
  title: string;
  text: string;
  userInput?: string;    // 用户原始输入
  nineD: any;
  tags?: string[];
  timestamp: number;
}
```

### 9.3 聊天流程

```
用户输入 "还记得咖啡厅吗"
  → doChat(text)
    → POST /api/chat { messages }
    → 服务端搜索 + AI 回答 + 记忆提取
    → 返回 { reply, memory, relatedMemories }
    → messages.push({ role: 'assistant', text: data.reply })
    → data.memory → chatMemories.unshift(enriched)
```

### 9.4 文件上传流程

```
用户选择 .txt 文件
  → handleFileUpload()
    → FileReader 读取内容（截取前 3000 字符）
    → POST /api/knowledge { title, content, article: true }
      → 服务端分析 + 存储
    → POST /api/chat（自动问 AI 感受）
    → 显示 AI 回复
```

### 9.5 SceneReconstruction 搜索

```typescript
function doSearch(query: string) {
  // 1. nineDEncoder.detectDimensionBoosts(query) → 检测 9D 中哪些维度被触发
  // 2. 提取 bigram
  // 3. 对每条记忆：
  //    textSim = jaccard(qBigrams, memKeywords) * 0.4
  //    dimMatch = computeDimSim(dim, query, mem) 对每个触发维度加权 * 0.6
  //    score = textSim + dimMatch
  // 4. 过滤 > 0.05 → 排序 → Top 8
}
```

---

## 10. 环境与配置

### 10.1 .env 文件

```env
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3001
```

### 10.2 vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

### 10.3 启动命令

```bash
cd hippocampal-kb
npm install              # 安装依赖
node server/index.js     # 启动后端 (端口 3001)
npx vite --host          # 启动前端 (端口 5173)
```

---

## 11. 关键设计决策及理由

### 11.1 为什么用 9 个维度而不是向量 embedding？

| 方案 | 优点 | 缺点 |
|:---|:---|:---|
| 向量 embedding | 语义理解强 | 不可解释、无法调试、场地匹配弱 |
| 9D 规则评分 | 完全可解释、每个维度的权重可独立调优、场地匹配精准 | 扩展新维度要手动加规则 |

**结论：** 记忆量 < 1000 条时，9D 规则评分准确率更高（因场地/人物等结构化维度比语义向量更贴近用户的回忆方式）。

### 11.2 为什么场地权重最高（+1.0）？

用户回忆时的典型表述："记得**咖啡厅**那次……"、"在**办公室**……"、"那天在老**街**……"。场地是用户记忆中最明确、唯一性最强的锚点。情感词（"开心"）可能匹配 30 条记忆，但场地通常只匹配 1-3 条。

### 11.3 为什么 LLM 提取 9D 而不是规则提取？

早期尝试过用正则/NER 提取 9D 词元，但在中文场景下：
- 场景识别："黄昏的老街" vs "老街的黄昏" — 依赖语义理解
- 情感识别："嘴角微微上扬" → "喜悦" — 无法用规则覆盖
- 物件识别：开放式，无法穷举

LLM 虽然慢一点（每次提取需要一次 API 调用），但质量远高于规则提取。

### 11.4 为什么文章用 summary 做 text 而不是原文？

文章原文可能几千字，如果每次 RAG 都携带全文，token 消耗巨大。所以：
- `text` = AI 摘要（100 字内，每次 RAG 自动携带）
- `originalContent` = 全文（仅用户追问详细内容时按需加载）

### 11.5 为什么不存储 embedding？

当前记忆量 < 300 条，全量评分遍历性能足够。embedding 会引入：
- 额外的依赖（向量模型）
- 额外的存储（384 维 float 数组）
- 不可调试性

等到记忆超过 1000 条时再加倒排索引 + embedding 混合检索。

### 11.6 为什么 AI 不能改写 text？

```
场景：

用户说："第一次见面你穿着淡蓝色衬衫"

AI 改写后存储："用户提到第一次见面时AI穿了淡蓝色衬衫"

第三次检索后："用户回忆了初次见面的场景"

第六次检索后："用户曾经说过一些往事"
```

这就是记忆幻觉传播。每次改写都会丢失信息，多次后完全失真。**`text` 字段的铁律是系统的最后防线。**

---

## 12. 已知问题与待改进

### 12.1 已修复（版本 1.0）

| # | 问题 | 修复内容 |
|:---|:---|:---|
| 1 | enrichExisting + add 重复添加 | 合并后不再新增，返回合并结果 |
| 2 | text 被 `；` 拼接 | 改为取最长原文为主，短的存 _supplement |
| 3 | isSameEvent 跨 7 天误判 | 增加时间差 > 7 天 → false |
| 4 | AI 不按地点选记忆 | 最终 prompt 强调 venue 过滤 |
| 5 | 没有数据结构版本号 | 增加 version + migrate() |
| 6 | 文章被闲聊挤掉 | 增加 priority 分层 |
| 7 | extractMemory 无输入校验 | 增加长度/格式 Guard |

### 12.2 待修复

| # | 问题 | 影响 | 优先级 | 方案建议 |
|:---|:---|:---|:---:|:---|
| 1 | 前后端 venue 映射不一致 | 线索重建偏差 | P3 | 后羰加 GET /api/venues 接口 |
| 2 | 无关键词倒排索引 | >300 条后搜索变慢 | P4 | 加 keyword → memories 索引 |
| 3 | 淘汰只按 FIFO | 可能丢掉重要记忆 | P3 | 按 priority + lastAccessed 加权淘汰 |
| 4 | extractMemory 单次 LLM 调用 | 偶发提取失败 | P4 | 加重试机制 |

---

## 附录：关键代码索引

| 功能 | 文件 | 行号范围 |
|:---|:---|:---:|
| 数据模型定义 | `src/types/index.ts` | 1-135 |
| VENUE_ALIASES | `server/memory-store.js` | 59-67 |
| isSameEvent | `server/memory-store.js` | 86-117 |
| addKnowledge | `server/memory-store.js` | 123-179 |
| add + enrichExisting | `server/memory-store.js` | 181-291 |
| searchDimension (18因子) | `server/memory-store.js` | 293-421 |
| search / searchRaw | `server/memory-store.js` | 423-460 |
| getDimensionSalience | `server/memory-store.js` | 502-586 |
| getDistinctiveMarkers | `server/memory-store.js` | 592-623 |
| chatWithDeepSeek (三层规则) | `server/chat.js` | 8-158 |
| extractMemory | `server/chat.js` | 161-255 |
| makeBasicMemory | `server/chat.js` | 258-274 |
| API: /api/chat | `server/index.js` | 14-45 |
| API: /api/knowledge | `server/index.js` | 48-166 |
| SceneReconstruction | `src/components/SceneReconstruction.tsx` | 39-573 |
