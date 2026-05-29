# 海马体 9D 情感记忆系统 — Agent 实现规范（完整版）

> 版本: 1.0.0 | 最后更新: 2026-05-30 | 已升级至 ELYSIUM V5.1.1 15D+
> 用途: 给 AI agent 的完整实现指引。按此规范可完美复刻系统。

---

## 目录

1. 项目总览
2. 数据模型
3. 核心算法：搜索评分引擎
4. 核心算法：同事件识别
5. 核心算法：记忆增强
6. 记忆持久化
7. 核心文件：chat.js
8. API 端点
9. 前端组件与数据流
10. 环境与配置
11. 关键设计决策
12. 已知问题
13. 完整端到端示例（6个完整案例，追踪真实数据流）

---

## 1. 项目总览

一个通过 9 维情感记忆体系（9D）实现 AI 长期记忆与人设一致性的 RAG 系统。

### 1.1 文件结构

```
hippocampal-kb/
├── index.html
├── VERSION
├── package.json
├── vite.config.ts
├── server/
│   ├── index.js           # Express 入口，API 路由
│   ├── chat.js            # RAG 对话 + 记忆提取
│   └── memory-store.js    # 记忆引擎（CRUD + 搜索 + 合并）
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/index.ts
│   ├── components/        # ChatMessage, MemoryLog, SceneReconstruction...
│   └── engine/            # SearchEngine, NineDEncoder...
├── data/
│   └── memories.json
├── docs/
│   ├── architecture-9d-memory-system.md
│   └── agent-spec-complete.md    # ← 本文件
└── .env
```

### 1.2 六条不可违背的设计原则

```
原则一：原文不可篡改 → memory.text 必须是用户原始输入，AI 不得改写
原则二：9D 是检索桥梁 → 9 个维度独立打分，最后加权求和
原则三：记忆是活的    → 同事件合并增强，不新增
原则四：AI 不准猜     → 多条记忆时列选项反问，等用户确认
原则五：7天间隔判异   → 同 venue 但时间差 > 7天 = 不同事件
原则六：搜索可调参    → 16 个因子权重都可独立调整
```

---

## 2. 数据模型

### 2.1 memories.json 格式

```json
{ "version": 1, "data": [ /* Memory[] */ ] }
```

兼容旧版裸数组格式（`load()` 自动检测）。

### 2.2 Memory 结构

```typescript
interface Memory {
  id: string;                 // "mem_{counter}_{ts}" 或 "know_{counter}_{ts}"
  type: 'memory'|'article'|'knowledge';
  priority: 0|1|2;            // 0=系统, 1=聊天(默认), 2=文章
  title: string;
  text: string;               // ⚠️ 用户原话（聊天）或 AI 摘要（文章）
  tags: string[];
  timestamp: number;
  originalContent?: string;   // 仅文章有
  category?: string;
  evokedFeelings?: string[];
  _supplement?: string;       // enrichExisting 保留的备选原文
  nineD: NineDVector;
}

interface NineDVector {
  X_semantic: { keywords: string[], topics: string[] };       // 语义
  Y_time: { season: string, dayNight: string };               // 时间
  Z_emotion: { vector: {valence,arousal}, intensity, primaryType };  // 情感
  W_who: Array<{name,identity,gender,relationship,role}>;     // 人物
  V_venue: { type, environment, lighting, atmosphere };       // 场景
  R_relation: { interactionType, intimacyLevel, socialDynamics, conversationFlow };  // 关系
  M_depth: { importance, retentionPriority, emotionalWeight };// 深刻度
  G_goods: Array<{name,category,significance}>;               // 物件
  S_senses: { visual, auditory, olfactory, tactile, taste };  // 感官
}
```

### 2.3 三种 memory type

| type | 来源 | priority | text |
|:---|:---|:---:|:---|
| memory | 聊天提取 | 1 | 用户原始输入 |
| article | 文章上传 | 2 | AI 摘要（~100字） |
| knowledge | 工作文档 | 2 | AI 摘要 |

### 2.4 场地归一化

```javascript
const VENUE_ALIASES = {
  '咖啡厅':'咖啡厅', '咖啡馆':'咖啡厅', 'coffee':'咖啡厅', 'cafe':'咖啡厅',
  '街道':'街道', '户外街道':'街道', '路边':'街道',
  '海滩':'海滩', '沙滩':'海滩', '海边':'海滩',
  '办公室':'办公室', '办公':'办公室', '工位':'办公室',
  '餐厅':'餐厅', '饭店':'餐厅', '餐馆':'餐厅', '食堂':'餐厅',
  '会议':'会议室', '会议室':'会议室', '开会':'会议室',
  '家':'家', '家里':'家', '家中':'家', 'home':'家',
};
function normVenue(type) { return VENUE_ALIASES[type] || type || ''; }
```

### 2.5 泛型关键词（不计入事件匹配）

```javascript
const GENERIC_KWS = ['咖啡厅','咖啡馆','回忆','聊天','用户','AI','自己'];
```

---

## 3. 搜索评分引擎

### 3.1 search(query, topK=5)

```javascript
function search(query, topK = 5) {
  const dimResults = searchDimension(query, topK);
  if (dimResults.length > 0) return dimResults;
  return searchRaw(query, Math.max(topK, 3));
}
```

### 3.2 searchDimension 16 因子评分

| 因子 | 匹配规则 | 分值 |
|:---|:---|---:|
| 1 标题匹配 | title 含 q / q 含 title 前4字 | +0.4 |
| 2 文本匹配 | text 含 q | +0.3 |
| 3 分类匹配 | category 含 q | +0.25 |
| 4 关键词匹配 | q 含任意 keyword / keyword 含 q | +0.2 |
| 5 标签匹配 | q 含任意 tag / tag 含 q | +0.15 |
| 6 ⭐场地精准 | q 含 VENUE_KWS key 且归一化后一致 | **+1.0** |
| 7 场地文本 | q 含 venue 名 / venue 名含 q | +0.6 |
| 8 季节/时间 | q 含季节/早晚且匹配 memory | +0.3 |
| 9 物件匹配 | q 含 goods name / goods name 含 q | +0.3 |
| 10 关系匹配 | q 含关系词且 interactionType 匹配 | +0.25 |
| 11 人物匹配 | q 含人名 / 人名含 q | +0.25 |
| 12 感官匹配 | q 含 senses 字段前4字 | +0.2 |
| 13 ⭐回忆意图 | q 含"记得"等词且 score>0.3 | **×1.3** |
| 14 情感匹配 | q 含情感词且 valence 方向一致 | +0.2 |
| 15 强度深度 | intensity×0.1 + importance×0.08 + weight×0.07 | 动态 |
| 16 情感放大 | q 含情感词时额外 +intensity×0.2 + importance×0.1 | 动态 |
| 17 时间衰减 | max(0, 1-ageDays/30)×0.1 | 动态 |

**阈值**: score > 0.15 进入候选 → 排序 → Top 5

### 3.3 searchRaw 兜底

当 dimension 搜索无结果时，纯文本 bigram 匹配。完全包含得 0.8，bigram 分段匹配 title 得 0.4、text 得 0.3。阈值 0.2。

### 3.4 完整评分计算示例

查询 `"还记得咖啡厅的事吗？"`，对一条咖啡厅记忆的评分：

```
场地精准匹配  +1.0  (VENUE_KWS["咖啡厅"] → normVenue="咖啡厅" === mVenue)
场地文本匹配  +0.6  (q 含 "咖啡厅")
关键词匹配    +0.2  (keyword "咖啡厅" 被 q 包含)
标签匹配      +0.15 (tag "咖啡厅" 被 q 包含)
强度深度      +0.204 (intensity 0.8 + depth)
时间衰减      +0.09  (3天前)
                                     小计: 2.244
回忆意图 ×1.3  (q 含 "记得")
─────────────────────────────────────────
最终得分: 2.917  (远高于阈值 0.15)
```

---

## 4. 同事件识别

### 4.1 isSameEvent(a, b)

```
同事件 = 同场地 AND 时间差≤7天 AND (有共同非泛型关键词 OR 有共同人物)
不同交互类型 → 需要 ≥2 个共同关键词
```

### 4.2 能合并 vs 不能合并

**能合并（同事件，第二次聊同一件事）：**
```
第一次: "还记得咖啡厅吗，你穿着淡蓝色衬衫"  → 关键词: [淡蓝色衬衫]
第二次: "那件淡蓝色衬衫特别好看"             → 关键词: [淡蓝色衬衫]
共同非泛型关键词: ["淡蓝色衬衫"] ≥ 1 → 合并 ✓
```

**不能合并（不同话题，不同事件）：**
```
第一次: "还记得咖啡厅吗，你穿着淡蓝色衬衫"  → 关键词: [淡蓝色衬衫]
第二次: "那家咖啡馆的橘猫还在吗"            → 关键词: [橘猫,老板]
共同非泛型关键词: [] < 1 → 不合并 ✗
```

---

## 5. 记忆增强

### 5.1 add(memory)

```javascript
function add(memory) {
  memory.timestamp = memory.timestamp || Date.now();
  const matched = enrichExisting(memory);
  if (matched) { save(); return matched; }  // 合并 → 不新增
  memory.id = `mem_${++counter}_${Date.now()}`;
  if (memory.priority === undefined) memory.priority = 1;
  memories.unshift(memory);
  save();
  return memory;
}
```

### 5.2 enrichExisting 合并策略

| 字段 | 策略 |
|:---|:---|
| text | 取较长原文为主，短的存 _supplement |
| keywords | 合并去重 |
| topics | 合并去重 |
| tags | 合并去重 |
| emotion.valence | 加权平均（旧:新 = 2:1）|
| emotion.intensity | 新强度更高时更新，取平均 |
| M_depth | 各字段取 max |
| W_who | 按 name 去重合并 |
| G_goods | 按 name 去重合并 |
| S_senses | 填充空白字段 |
| timestamp | 取较新值 |
| title | 取较长值 |

---

## 6. 记忆持久化

### 6.1 文件操作

```javascript
const DATA_FILE = path.join(__dirname, '..', 'data', 'memories.json');
const DATA_VERSION = 1;
const MAX_MEMORIES = 300;

function load()   // 单例，一次会话读一次磁盘。兼容新旧格式
function save()   // 先 evictExcess() 再写 { version, data }
function migrate(data, fromVersion)  // 未来版本迁移入口
```

### 6.2 主动淘汰

```javascript
function evictExcess() {
  if (memories.length <= MAX_MEMORIES) return;
  memories.sort((a,b) => {
    const scoreA = (a.priority||1)*100 + (a.nineD?.Z_emotion?.intensity||0)*10
      + Math.max(0, 1-(Date.now()-(a.timestamp||0))/2592000000)*5;
    const scoreB = /* 同上 */
    return scoreB - scoreA;
  });
  memories = memories.slice(0, MAX_MEMORIES);
}
```

**淘汰权重**：priority × 100 + intensity × 10 + 30天衰减 × 5

- 文章 (priority=2) + 高强度 (0.8) + 新 → 得分 ~210 → 安全
- 闲聊 (priority=1) + 低强度 (0.3) + 旧 → 得分 ~100 → 可能淘汰

---

## 7. chat.js

### 7.1 chatWithDeepSeek — 三层规则

**第一层（System Prompt，永久）：**
```
你是都灵，用户的妻子也是秘书...

当用户问起以前的事时：
- 单条记忆 → 还原场景回答
- 多条记忆 → 🚫 不猜！列出每条辨识线索反问用户
- 无记忆 → 坦诚说不记得，引导分享
- 细节必须来自真实记录，不编造
```

**第二层（上下文规则块，每次注入）：**
```
规则1-4: 通用回答约束（基于事实、重点还原最强维度）
规则5:  ⚠️ 多条记忆时不猜，列选项反问
规则6:  线索不足时继续追问
规则7:  资料按事实回答
规则8:  文章按情感节奏互动
规则9:  text 是用户原话，不要概括
规则10: 情感浓度高时放慢语感（条件）
规则11: 用户提到地点时优先匹配（条件）
```

**第三层（最终强调）：**
```
用户提到了"咖啡厅" → ⚠️ 只从场景为"咖啡厅"的记忆中选择
基于以上记忆，回答用户：{query}
```

### 7.2 记忆上下文格式

**聊天记忆：**
```
[记忆 1] 咖啡厅初遇的温暖回忆（3天前）
  内容: 还记得我们第一次在咖啡厅见面吗？你穿着淡蓝色衬衫...
  场景: 咖啡厅 | 情感: 温馨
  人物: 用户 | 物件: 淡蓝色衬衫
  突出维度: 情感(85%) · 语义(70%)
  辨识线索: 独特物件: 淡蓝色衬衫
```

**文章：**
```
[文章 1] 黄昏老街（5天前）
  摘要: ...
  情感基调: 感伤（强度 76%）
  人物: 外婆 | 物件: 石板路、花猫
  场景氛围: 老街 · 黄昏怀旧 · 淡红色斜阳
  📄 用户未询问具体内容，用摘要回应即可
  （如用户追问原文 → 附上 originalContent）
```

### 7.3 extractMemory

```javascript
export async function extractMemory(messages, replyText) {
  // 取用户最后一条输入
  // 清洗上传前缀
  // Guard: 长度<5 或 >500 → null
  // Guard: 无情感词的短系统问题 → null
  // Guard: 纯测试命令(<8字) → null
  // 调用 LLM 提取 9D（prompt 见下）
  // 成功 → 合并用户原文 + LLM 的 9D
  // 失败 → makeBasicMemory 兜底
}
```

**提取 prompt 要求 LLM 输出：**
```json
{
  "title": "有意义的标题（8-20字）",
  "nineD": { 所有9个维度 },
  "tags": ["标签"]
}
```

### 7.4 makeBasicMemory 兜底

```javascript
function makeBasicMemory(text) {
  // 提取中文双字词作为关键词
  // 标题取原文前15字
  // 9D 全部设为默认值（intensity=0.3, neutral 情感）
  // 确保 text 存储用户原文
}
```

---

## 8. API 端点

### 8.1 POST /api/chat

```json
// Request
{ "messages": [{ "role": "user", "content": "还记得咖啡厅的事吗？" }] }

// Response
{
  "reply": "（温柔回应）怎么会不记得呢...",
  "memory": { /* Memory 对象或 null */ },
  "relatedMemories": [ /* 5 条 Memory */ ]
}
```

**流程**: search → chatWithDeepSeek → extractMemory → add → 返回

### 8.2 POST /api/knowledge

```json
// Request
{ "title": "黄昏老街", "content": "全文内容...", "category": "散文", "article": true }

// Response
{
  "memory": { /* Memory, type:'article' */ },
  "analysis": { /* LLM 情感分析结果 */ }
}
```

**文章分析 prompt** 要求 LLM 输出 title, summary, keywords, emotion (valence/arousal/primaryType/intensity/evokedFeelings), scene, characters, objects, senses, interactionType, category, tags。

### 8.3 其他端点

- `GET /api/memories` → 全部记忆
- `GET /api/search?q=xxx` → 搜索
- `DELETE /api/memories` → 清空

---

## 9. 前端组件

### 9.1 组件列表

| 组件 | 功能 | Props |
|:---|:---|:---|
| ChatMessage | 纯对话气泡 | `{ message: {id,role,text} }` |
| MemoryLog | 词元拆分日志 | `{ memories, onSelect }` |
| SceneReconstruction | 线索重建 | `{ memories, onSelect }` |
| NineDRadar | 9D 雷达图 | `{ memory }` |
| KeywordGraph | 词元关联图谱（D3） | `{ memories, selectedId, onSelect }` |
| Timeline | 时间线 | `{ memories, selectedId, onSelect }` |

### 9.2 App 状态

```typescript
const [messages, setMessages] = useState<Message[]>([]);
const [chatMemories, setChatMemories] = useState<ChatMemory[]>([]);
const [input, setInput] = useState('');
const [sending, setSending] = useState(false);
const [selectedId, setSelectedId] = useState<string>();
```

---

## 10. 环境与配置

```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3001
```

```bash
npm install
node server/index.js     # 后端 :3001
npx vite --host          # 前端 :5173
```

---

## 11. 关键设计决策

1. **9D 评分而非向量 embedding** — 小规模下更准，完全可解释
2. **场地权重最高（+1.0）** — 用户回忆时场地是唯一性最强的锚点
3. **LLM 提取 9D** — 中文 NLP 场景复杂，规则无法覆盖
4. **文章存摘要不存原文** — token 优化，原文按需加载
5. **不存 embedding** — 当前规模 < 300 条，全量遍历足够
6. **AI 不能改写 text** — 防止记忆幻觉传播

---

## 12. 已知问题

| 状态 | 问题 | 优先级 |
|:---|:---|:---:|
| ✅ 已修 | 重复添加、text拼接、跨7天误判、AI选错记忆 | — |
| ✅ 已修 | 无版本号、前端挤掉文章、无输入校验、FIFO淘汰 | — |
| ⏳ 待修 | 前后端 venue 映射不一致 | P3 |
| ⏳ 待修 | 无关键词倒排索引（>300条后慢） | P4 |
| ⏳ 待修 | extractMemory 偶发失败无重试 | P4 |

---

## 13. 完整端到端示例

### 13.1 聊天 → 提取 → 存储

**输入**:
```
还记得我们第一次在咖啡厅见面吗？你穿着淡蓝色衬衫，
坐在靠窗的位置，阳光正好斜照在你脸上。
我们聊了很久，从大学专业聊到各自家乡。
```

**搜索**: 记忆库为空 → `search()` 返回 `[]`

**AI 回复**: `（轻轻握住你的手）怎么会不记得呢。那家爵士咖啡馆...`

**extractMemory 传给 LLM 的对话**:
```
用户: 还记得我们第一次在咖啡厅见面吗？你穿着淡蓝色衬衫...
AI: （轻轻握住你的手）怎么会不记得呢。那家爵士咖啡馆...
```

**LLM 返回 9D**:
```json
{
  "title": "咖啡厅初遇的温暖回忆",
  "nineD": {
    "X_semantic": { "keywords": ["咖啡厅","淡蓝色衬衫","靠窗位置","阳光"], "topics": ["初次见面"] },
    "Z_emotion": { "vector": { "valence": 0.85, "arousal": 0.6 }, "intensity": 0.8, "primaryType": "温馨" },
    "V_venue": { "type": "咖啡厅", "environment": "indoor", "lighting": "温暖阳光", "atmosphere": "浪漫温馨" },
    "M_depth": { "importance": 0.85, "retentionPriority": 0.8, "emotionalWeight": 0.8 },
    "G_goods": [{ "name": "淡蓝色衬衫", "category": "衣物", "significance": "第一次见面穿的衬衫" }],
    "S_senses": { "visual": "阳光透过落地窗斜照在脸上", "auditory": "爵士乐", "olfactory": "咖啡香" }
  }
}
```

**最终 memories.json**:
```json
{
  "version": 1,
  "data": [{
    "id": "mem_1_1685290000000",
    "type": "memory", "priority": 1,
    "title": "咖啡厅初遇的温暖回忆",
    "text": "还记得我们第一次在咖啡厅见面吗？你穿着淡蓝色衬衫，坐在靠窗的位置，阳光正好斜照在你脸上。我们聊了很久，从大学专业聊到各自家乡。",
    "nineD": { /* 如上 */ },
    "tags": ["咖啡厅", "初次见面", "温馨"],
    "timestamp": 1685290000000
  }]
}
```

### 13.2 同事件不合并（不同关键词）

**第二次输入**: `"那家爵士咖啡馆现在还开着吗？老板养的那只橘猫还在不在？"`

**search 评分**:
```
场地精准"咖啡馆→咖啡厅" +1.0, 场地文本"咖啡馆" +0.6, 关键词"咖啡厅" +0.2
标签匹配 +0.15, 强度深度 +0.15, 时间衰减 +0.09
小计 2.19, 无回忆意图(不含"记得"), 最终 2.19
```

**enrichExisting 判定**:
```
旧关键词(去泛型): ["淡蓝色衬衫","靠窗位置","阳光","大学专业","各自家乡"]
新关键词(去泛型): ["爵士咖啡馆","橘猫","老板","再去看看"]
共同: 0 个 → isSameEvent = false → 不合并，作为新事件添加
```

### 13.3 AI 反问模式（多条记忆）

**记忆库**: 咖啡厅初见 + 路灯下牵手 + 老街花猫

**用户**: `"还记得那天的事吗？"`

**AI 上下文规则 5**: 多条记忆，不猜，列选项

**AI 回复**:
```
你说的"那天"是哪一次呀？
是咖啡厅那次，你穿着淡蓝色衬衫、阳光透过落地窗照在你脸上？
还是傍晚校园路灯下，我们第一次牵手的那次？
还是老街黄昏，你蹲在门槛边逗那只花猫的那次？
你跟我说说是哪个，我就想起来啦～
```

**用户确认**: `"就是牵手那次"`

**AI 用选定记忆还原**（只引用记忆 text 中的细节）:
```
那天傍晚路灯刚亮，你的手有点凉，我鼓起勇气握住你的手...
那条回宿舍的路，我们走得好慢好慢...
```

### 13.4 文章上传 → 分析 → 存储

**文件**: 《黄昏老街》散文

**LLM 分析结果**:
```json
{
  "summary": "黄昏时分，作者独自走在即将消逝的老街上...",
  "emotion": { "valence": -0.3, "intensity": 0.76, "primaryType": "感伤", "evokedFeelings": ["怀旧","思念"] },
  "scene": { "type": "老街", "atmosphere": "黄昏怀旧", "lighting": "淡红色斜阳" },
  "objects": [
    { "name": "石板路", "category": "建筑", "significance": "岁月痕迹" },
    { "name": "花猫", "category": "动物", "significance": "外婆家的记忆" }
  ],
  "senses": { "visual": "淡红色斜阳洒在石板路上", "auditory": "炒菜声", "olfactory": "饭菜香" }
}
```

**入库后 type:'article', priority:2, text 为摘要, originalContent 为全文。**

**RAG 加载**: 用户不问原文时只用摘要；用户说"写了什么"时附上 originalContent。

### 13.5 淘汰触发

300 条满时，新记忆触发淘汰：
```
文章"黄昏老街"   priority=2, intensity=0.76 → score ≈ 212 ← 安全
闲聊"今天吃了啥" priority=1, intensity=0.3  → score ≈ 108 ← 可能淘汰
测试"hello"      priority=0, intensity=0.1  → score ≈ 4   ← 最先淘汰
```

### 13.6 完整评分过程（16 因子逐项）

查询 `"还记得咖啡厅的事吗？"` 对咖啡厅记忆：

```
 1 标题匹配:  title含"咖啡厅的事吗"? NO. q含"咖啡厅初"? NO          →  0
 2 文本匹配:  text含q? NO                                          →  0
 3 分类:      ""                                                    →  0
 4 关键词:    q含"咖啡厅"? YES                                       → +0.2
 5 标签:      q含"咖啡厅"? YES                                       → +0.15
 6 场地精准:  VENUE_KWS["咖啡厅"]→"咖啡厅"===mVenue"咖啡厅"           → +1.0
 7 场地文本:  q含"咖啡厅"? YES                                       → +0.6
 8-12 其他:   无匹配                                                 →  0
13 回忆意图:  q含"记得"? YES. score=1.95 > 0.3 → ×1.3               → ×1.3
14 情感:      无情感词                                               →  0
15 强度深度:  0.8×0.1 + 0.85×0.08 + 0.8×0.07 = 0.204               → +0.204
16 情感放大:  无情感词                                               →  0
17 时间衰减:  (1-3/30)×0.1 = 0.09                                   → +0.09
────────────────────────────────────────────────────────
总分: (0+0+0+0.2+0.15+1.0+0.6+0+0+0+0+0+0+0.204+0.09)×1.3 = 2.244×1.3 = 2.917
阈值 0.15 → ✓ 命中
```

---

## 附录：关键代码索引

| 功能 | 文件 |
|:---|:---|
| VENUE_ALIASES, normVenue | server/memory-store.js:59-71 |
| isSameEvent | server/memory-store.js:86-117 |
| addKnowledge | server/memory-store.js:123-179 |
| add + enrichExisting | server/memory-store.js:181-291 |
| searchDimension | server/memory-store.js:293-421 |
| searchRaw + search | server/memory-store.js:423-460 |
| evictExcess + save | server/memory-store.js:46-58 |
| getDistinctiveMarkers | server/memory-store.js:592-623 |
| chatWithDeepSeek | server/chat.js:8-158 |
| extractMemory | server/chat.js:161-255 |
| makeBasicMemory | server/chat.js:258-274 |
| API: /api/chat | server/index.js:14-45 |
| API: /api/knowledge | server/index.js:48-166 |
| SceneReconstruction | src/components/SceneReconstruction.tsx:39-573 |
