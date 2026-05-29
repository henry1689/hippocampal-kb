import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chatWithDeepSeek, extractMemory } from './chat.js';
import * as memoryStore from './memory-store.js';
import { elysium15d } from './elysium-15d.js';
import { analyzeAmbiguity } from './ambiguity-detector.js';
import { memoryResonance } from './memory-resonance.js';
import { memoryConsolidator } from './memory-consolidation.js';
import { calculateWeights } from './persona-blender.js';
import { processText as processTextualEmbodiment } from './textual-embodiment.js';
import { orchestrate as orchestrateSensory } from './sensory-orchestrator.js';
import { styleEvolution } from './style-evolution.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── 15D Debug API ────────────────────────────

/** GET /api/debug/state — 获取当前 15D 状态 */
app.get('/api/debug/state', (req, res) => {
  res.json(elysium15d.getState());
});

/** GET /api/debug/pipeline — 获取流水线日志 */
app.get('/api/debug/pipeline', (req, res) => {
  res.json(elysium15d.getPipelineLog());
});

/** POST /api/debug/analyze — 测试模糊检测 */
app.post('/api/debug/analyze', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const analysis = analyzeAmbiguity(text, elysium15d.getState());
  const weights = calculateWeights();
  res.json({ analysis, weights });
});

/** POST /api/debug/state — 手动设置 15D 状态 */
app.post('/api/debug/state', (req, res) => {
  const state = elysium15d.setState(req.body);
  res.json({ ok: true, state });
});

/** GET /api/debug/reset — 重置 15D 状态和流水线日志 */
app.get('/api/debug/reset', (req, res) => {
  elysium15d.reset();
  res.json({ ok: true });
});

// ─── Chat with RAG — V5.1.1 Pipeline ─────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const query = lastUserMsg?.content || '';
    const stateBefore = elysium15d.getState();

    // ═══════════════════════════════════════════════════
    //  V5.1.1 完整处理流水线
    // ═══════════════════════════════════════════════════

    // 1️⃣ 用户输入
    elysium15d.logPipeline('1_input', { text: query, length: query.length });

    // 2️⃣ → 3️⃣ 模糊检测 + 共振决策
    const resonance = await memoryResonance.process(query, stateBefore);

    // 4️⃣ 人格权重
    const weights = resonance.weights || calculateWeights(elysium15d.getState());

    // 5️⃣ 用 V5.1.1 prompt 调用 AI
    const systemPrompt = resonance.systemPrompt;
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    // 将记忆上下文传给 chat.js（记忆已在 systemPrompt 中内联）
    // 如果动作是 CLARIFY，不传额外记忆（已包含在 systemPrompt 中）
    const isClarify = resonance.action === 'CLARIFY';
    const aiReply = await chatWithDeepSeek(
      messagesWithSystem,
      isClarify ? [] : resonance.memories,  // CLARIFY 模式 memoryResonance 已处理记忆
      systemPrompt                           // 外部 system prompt 覆盖
    );
    const replyText = aiReply.choices[0].message.content;

    elysium15d.logPipeline('6_ai_reply', {
      action: resonance.action,
      length: replyText.length,
      preview: replyText.slice(0, 80),
    });

    // 6️⃣ 提取记忆 + 注入 AI 回复
    const memory = await extractMemory(messages, replyText);
    if (memory) {
      memory._ai_response = replyText.length > 500 ? replyText.slice(0, 500) + '…' : replyText;
      memory._15d = {
        engram_depth: elysium15d.getState().semantic_cues.interaction_weight,
        venue: elysium15d.getState().semantic_cues.normalized_venue,
        cues: elysium15d.getState().semantic_cues.extracted_cues,
        persona_mode: Object.entries(weights)
          .filter(([, v]) => v > 0.3).map(([k]) => k).join('+'),
      };
      memoryStore.add(memory);
    }

    // 6b. 文本具身后处理 — V5.1.1 TextualEmbodimentPipeline
    const stateForEmbodiment = elysium15d.getState();
    const embodied = processTextualEmbodiment(replyText, stateForEmbodiment);

    // 6c. 感官编排 — V5.1.1 SensoryOrchestrator
    const sensoryConfig = orchestrateSensory(embodied.text, stateForEmbodiment, embodied.rhythm_config);

    // 6d. 风格演化 — V5.1.1 StyleEvolution
    styleEvolution.updateAfterInteraction(embodied.text);

    elysium15d.logPipeline('6_embodied', {
      rhythm_speed: embodied.rhythm_config.typing_speed,
      tags: embodied.ambient_tags,
      ritual: embodied.ritual_appended,
    });

    // 7️⃣ 后台异步记忆固化
    memoryConsolidator.consolidate(
      {
        text: query,
        summary: memory?.text || query,
        timestamp: Date.now(),
        dominantPersona: resonance.action,
        analysis: resonance.analysis,
      },
      elysium15d.getState(),
      replyText
    ).catch(() => {});

    res.json({
      reply: embodied.text,
      action: resonance.action,
      memory: memory || null,
      relatedMemories: resonance.memories,
      rhythm_config: embodied.rhythm_config,
      sensory_config: sensoryConfig,
      style_bias: styleEvolution.getStyleBias(),
      _debug: {
        analysis: resonance.analysis,
        weights,
        state: stateBefore,
        action: resonance.action,
      },
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── SSE 流式聊天端点 ─── V5.1.1 新增
app.post('/api/chat/stream', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // 设置 SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const query = lastUserMsg?.content || '';
    const stateBefore = elysium15d.getState();

    // 1-4: 同 POST /api/chat 流水线
    elysium15d.logPipeline('1_input', { text: query });
    const resonance = await memoryResonance.process(query, stateBefore);
    const weights = resonance.weights || calculateWeights(elysium15d.getState());
    const systemPrompt = resonance.systemPrompt;

    // 发送初始配置（节奏参数、感官配置）
    const initEmbodied = processTextualEmbodiment('', elysium15d.getState());
    const initSensory = orchestrateSensory('', elysium15d.getState(), initEmbodied.rhythm_config);
    res.write(`data: ${JSON.stringify({ type: 'config', rhythm: initEmbodied.rhythm_config, sensory: initSensory })}\n\n`);

    // 5: 调用 LLM（非流式，简化版）
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];
    const isClarify = resonance.action === 'CLARIFY';
    const aiReply = await chatWithDeepSeek(
      messagesWithSystem, isClarify ? [] : resonance.memories, systemPrompt
    );
    const replyText = aiReply.choices[0].message.content;

    // 6: 文本具身处理
    const embodied = processTextualEmbodiment(replyText, elysium15d.getState());
    const sensoryConfig = orchestrateSensory(embodied.text, elysium15d.getState(), embodied.rhythm_config);

    // 按节奏参数将文本逐 token 发送到前端
    const chars = [...embodied.text];
    const pauses = new Set(embodied.rhythm_config.breath_pauses || []);
    const speedDelay = embodied.rhythm_config.typing_speed === 'slow' ? 40
      : embodied.rhythm_config.typing_speed === 'fast' ? 8 : 20;

    for (let i = 0; i < chars.length; i++) {
      res.write(`data: ${JSON.stringify({ type: 'token', content: chars[i], index: i })}\n\n`);
      if (pauses.has(i)) {
        await new Promise(r => setTimeout(r, speedDelay * 15));
      } else {
        await new Promise(r => setTimeout(r, speedDelay));
      }
    }

    // 发送完成信号
    res.write(`data: ${JSON.stringify({ type: 'done', rhythm: embodied.rhythm_config, sensory: sensoryConfig })}\n\n`);
    res.end();

    // 后台记忆提取 + 固化
    const memory = await extractMemory(messages, replyText);
    if (memory) {
      memory._ai_response = replyText;
      memoryStore.add(memory);
    }
    memoryConsolidator.consolidate(
      { text: query, summary: memory?.text || query, timestamp: Date.now(), dominantPersona: resonance.action, analysis: resonance.analysis },
      elysium15d.getState(), replyText
    ).catch(() => {});
    styleEvolution.updateAfterInteraction(embodied.text);

  } catch (err) {
    console.error('SSE error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// ─── Knowledge Base ─────────────────────────────────
app.post('/api/knowledge', async (req, res) => {
  try {
    const { title, content, category, article } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    // Different analysis prompts for documents vs articles
    const docPrompt = `分析以下工作资料，提取关键信息，按 JSON 格式输出（不要其他文字）：
{
  "title": "简短的资料标题",
  "summary": "一段话总结核心内容（100字内）",
  "keywords": ["关键词1","关键词2","关键词3"],
  "category": "分类（如：项目计划/会议记录/技术文档/市场分析/报告）",
  "tags": ["标签1","标签2"]
}`;

    const articlePrompt = `分析以下文章/故事，按以下流程处理：

第一步：写一段有情感共鸣的摘要（100字内），捕捉文章的情感基调和核心内容。
第二步：从摘要中提取完整的 9D 情感词元，用于指导AI以对应的情感与用户互动。

按 JSON 格式输出（不要其他文字）：
{
  "title": "文章标题",
  "summary": "有情感共鸣的一段话总结（100字内）——这是与用户建立情感连接的核心文本",
  "keywords": ["关键词1","关键词2","关键词3"],
  "emotion": {
    "valence": 0.0,
    "arousal": 0.0,
    "primaryType": "核心情感类型（如：喜悦/悲伤/愤怒/恐惧/爱/思念/温暖/感伤/平静）",
    "intensity": 0.5,
    "evokedFeelings": ["读者被引发的具体情绪1","情绪2"]
  },
  "scene": {
    "type": "场景类型（如：自然风光/家庭/城市/战场/田园等）",
    "atmosphere": "氛围描述",
    "lighting": "光线（如：温暖阳光/昏暗/黄昏/明亮等）"
  },
  "characters": [
    { "name": "人物名", "identity": "角色", "relationship": "与主角的关系" }
  ],
  "objects": [
    { "name": "物件名", "category": "类别", "significance": "象征意义" }
  ],
  "senses": {
    "visual": "视觉画面描述",
    "auditory": "声音/音乐描述",
    "olfactory": "气味描述",
    "tactile": "触感描述"
  },
  "interactionType": "互动类型（如：陪伴/重逢/离别/对话/思念/回忆等）",
  "category": "文章分类（如：散文/诗歌/故事/感悟/评论/同人）",
  "tags": ["标签1","标签2"]
}`;

    // Initialize with default analysis — article is saved even if LLM analysis fails
    let analysis = { title: title || '文档', summary: '', keywords: [], category: category || '未分类', tags: [], scene: null, characters: [], objects: [], senses: null, interactionType: '' };
    if (article) {
      analysis.emotion = { valence: 0, arousal: 0, primaryType: '平静', intensity: 0.3, evokedFeelings: [] };
    }

    // Best-effort LLM analysis — network errors won't lose the article
    try {
      const resp = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          messages: [{ role: 'system', content: article ? articlePrompt : docPrompt }, { role: 'user', content: content.slice(0, 3000) }],
          max_tokens: 1024,
          temperature: 0.1,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (article && parsed.emotion) {
              const baseIntensity = parsed.emotion.intensity || 0.3;
              const feelCount = (parsed.emotion.evokedFeelings || []).length;
              parsed.emotion.intensity = Math.min(baseIntensity + feelCount * 0.03, 0.95);
              analysis.emotion = parsed.emotion;
            }
            Object.assign(analysis, parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Article analysis failed, saving with defaults:', e.message);
    }

    const memory = memoryStore.addKnowledge({
      title: analysis.title,
      summary: analysis.summary,
      content,
      keywords: analysis.keywords,
      category: analysis.category,
      tags: analysis.tags,
      article: !!article,
      emotion: analysis.emotion || null,
      scene: analysis.scene || null,
      characters: analysis.characters || [],
      objects: analysis.objects || [],
      senses: analysis.senses || null,
      interactionType: analysis.interactionType || '',
    });

    res.json({ memory, analysis });
  } catch (err) {
    console.error('Knowledge error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Memory CRUD ────────────────────────────────────
app.get('/api/memories', (req, res) => {
  const all = memoryStore.getAll();
  res.json(all);
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json(memoryStore.getAll().slice(0, 10));
  res.json(memoryStore.search(q));
});

app.delete('/api/memories', (req, res) => {
  memoryStore.clear();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Hippocampal server running on http://localhost:${PORT}`);
});
