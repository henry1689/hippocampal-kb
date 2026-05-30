/**
 * ELYSIUM V5.1.1 — 海马体记忆 + 极乐境 完整流水线
 *
 * 完整处理流水线：
 *   输入 → 模糊检测 → 15D更新 → 记忆共振 → 人格融合 → LLM → 具身化 → 感官编排
 *
 * V5.1.1 状态路径更新: matrix_* 四矩阵 + 检查点 + 维度耦合
 */

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
import { tokenAssoc } from './token-association.js';
import { learn as learnEmotion, getProfile as getEmotionProfile, reset as resetEmotion } from './emotion-tracker.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── 快捷取值工具（兼容新旧状态路径） ──────────────────────

function _v(obj, ...paths) {
  for (const p of paths) {
    const val = p.split('.').reduce((o, k) => o?.[k], obj);
    if (val !== undefined) return val;
  }
  return undefined;
}

// ══════════════════════════════════════════════════════════
//  15D Debug API
// ══════════════════════════════════════════════════════════

app.get('/api/debug/state', (req, res) => res.json(elysium15d.getState()));
app.get('/api/debug/state/compact', (req, res) => res.json(elysium15d.getCompactState()));
app.get('/api/debug/pipeline', (req, res) => res.json(elysium15d.getPipelineLog()));
app.get('/api/debug/tokens', (req, res) => res.json(tokenAssoc.getStats()));
app.get('/api/debug/tokens/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const cues = q.split(/[\s,，、]+/).filter(Boolean);
  res.json(tokenAssoc.searchByTokens(cues));
});

app.post('/api/debug/analyze', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const analysis = analyzeAmbiguity(text, elysium15d.getState());
  const weights = calculateWeights();
  res.json({ analysis, weights });
});

app.post('/api/debug/state', (req, res) => {
  const state = elysium15d.setState(req.body);
  res.json({ ok: true, state });
});

app.post('/api/debug/rollback', (req, res) => {
  const ok = elysium15d.rollback();
  res.json({ ok, state: elysium15d.getState() });
});

app.get('/api/debug/reset', (req, res) => {
  elysium15d.reset();
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════
//  Chat API — 完整 V5.1.1 流水线
// ══════════════════════════════════════════════════════════

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
    // ⭐ 注入全频谱情感画像（喜怒哀乐惧爱厌恶 → AI 相应回应）
    const emotionProfile = getEmotionProfile(
      query.includes('咖啡厅') ? '咖啡厅' : query.includes('老街') ? '老街' : query.includes('家') ? '家' : '',
      ''
    );
    const promptWithEmotion = emotionProfile.hasData
      ? systemPrompt + '\n\n【情感频次数据】' + emotionProfile.summary + '\n\n根据以上频次和加权强度数据，自行选择合适的情感回应方式。不要生硬套用规则，要自然。'
      : systemPrompt;
    const messagesWithSystem = [
      { role: 'system', content: promptWithEmotion },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const isClarify = resonance.action === 'CLARIFY';
    const aiReply = await chatWithDeepSeek(
      messagesWithSystem,
      isClarify ? [] : resonance.memories,
      systemPrompt
    );
    const replyText = aiReply.choices[0].message.content;

    elysium15d.logPipeline('6_ai_reply', {
      action: resonance.action, length: replyText.length,
      preview: replyText.slice(0, 80),
    });

    // 6️⃣ 提取记忆 — 只存用户输入，AI 回复不自动存入（防止编造成记忆）
    const memory = await extractMemory(messages, replyText);
    if (memory) {
      // ⭐ 仅当用户明确说"记住""记下来"等指令时，才把 AI 回复存入
      const wantSaveAi = /记住|记下来|记着|存起来|保留|记住你说的|记住这句/.test(query);
      if (wantSaveAi) {
        memory._ai_response = replyText.length > 500 ? replyText.slice(0, 500) + '…' : replyText;
      }
      const s = elysium15d.getState();
      const gsr      = _v(s, 'matrix_A_body.neuro_arousal.gsr_excitement', 'neuro_arousal.gsr_excitement') ?? 50;
      const intimacy = _v(s, 'matrix_A_body.psycho_sexual.intimacy_craving', 'psychosexual_profile.intimacy_craving') ?? 50;
      const stress   = _v(s, 'matrix_A_body.neuro_arousal.hrv_stress_index', 'neuro_arousal.hrv_stress_index') ?? 50;
      const peak     = Math.max(gsr, intimacy, stress);
      const engramDepth = Math.min(100, Math.round(
        (gsr * 0.35 + intimacy * 0.35 + stress * 0.3) * Math.max(1.0 + peak / 200, peak > 85 ? 1.5 : 1.0) * 10
      ) / 10);
      memory._15d = {
        engram_depth: engramDepth,
        venue: _v(s, 'matrix_D_anchor.semantic_cues.normalized_venue', 'semantic_cues.normalized_venue') ?? '',
        cues: _v(s, 'matrix_D_anchor.semantic_cues.extracted_cues', 'semantic_cues.extracted_cues') ?? [],
        persona_mode: Object.entries(weights).filter(([, v]) => v > 0.3).map(([k]) => k).join('+'),
      };
      memoryStore.add(memory);
      // ⭐ V5.1.1: 15D 词元关联索引
      tokenAssoc.indexMemory(memory);
      // ⭐ 情感频次学习
      learnEmotion(memory._tokens, memory);
    }

    // 6b. 文本具身后处理
    const stateForEmbodiment = elysium15d.getState();
    const embodied = processTextualEmbodiment(replyText, stateForEmbodiment);

    // 6c. 感官编排
    const sensoryConfig = orchestrateSensory(embodied.text, stateForEmbodiment, embodied.rhythm_config);

    // 6d. 风格演化
    styleEvolution.updateAfterInteraction(embodied.text);

    elysium15d.logPipeline('6_embodied', {
      rhythm_speed: embodied.rhythm_config.typing_speed,
      tags: embodied.ambient_tags, ritual: embodied.ritual_appended,
    });

    // 7️⃣ 后台异步记忆固化
    memoryConsolidator.consolidate(
      { text: query, summary: memory?.text || query, timestamp: Date.now(),
        dominantPersona: resonance.action, analysis: resonance.analysis },
      elysium15d.getState(), replyText
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
        state: elysium15d.getState(),
        state_before: stateBefore,
        action: resonance.action,
        pipeline: elysium15d.getPipelineLog().slice(0, 8),
      },
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════
//  SSE 流式聊天
// ══════════════════════════════════════════════════════════

app.post('/api/chat/stream', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

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

    elysium15d.logPipeline('1_input', { text: query });
    const resonance = await memoryResonance.process(query, stateBefore);
    const weights = resonance.weights || calculateWeights(elysium15d.getState());
    const systemPrompt = resonance.systemPrompt;

    const initEmbodied = processTextualEmbodiment('', elysium15d.getState());
    const initSensory = orchestrateSensory('', elysium15d.getState(), initEmbodied.rhythm_config);
    res.write(`data: ${JSON.stringify({ type: 'config', rhythm: initEmbodied.rhythm_config, sensory: initSensory })}\n\n`);

    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];
    const isClarify = resonance.action === 'CLARIFY';
    const aiReply = await chatWithDeepSeek(messagesWithSystem, isClarify ? [] : resonance.memories, systemPrompt);
    const replyText = aiReply.choices[0].message.content;

    const embodied = processTextualEmbodiment(replyText, elysium15d.getState());
    const sensoryConfig = orchestrateSensory(embodied.text, elysium15d.getState(), embodied.rhythm_config);

    const chars = [...embodied.text];
    const pauses = new Set(embodied.rhythm_config.breath_pauses || []);
    const speedDelay = embodied.rhythm_config.typing_speed === 'slow' ? 40
      : embodied.rhythm_config.typing_speed === 'fast' ? 8 : 20;

    for (let i = 0; i < chars.length; i++) {
      res.write(`data: ${JSON.stringify({ type: 'token', content: chars[i], index: i })}\n\n`);
      await new Promise(r => setTimeout(r, pauses.has(i) ? speedDelay * 15 : speedDelay));
    }

    res.write(`data: ${JSON.stringify({ type: 'done', rhythm: embodied.rhythm_config, sensory: sensoryConfig })}\n\n`);
    res.end();

    const memory = await extractMemory(messages, replyText);
    if (memory) { memory._ai_response = replyText; memoryStore.add(memory); }
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

// ══════════════════════════════════════════════════════════
//  Knowledge Base
// ══════════════════════════════════════════════════════════

app.post('/api/knowledge', async (req, res) => {
  try {
    const { title, content, category, article } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const docPrompt = `分析以下工作资料，提取关键信息，按 JSON 格式输出（不要其他文字）：
{ "title": "简短的资料标题", "summary": "一段话总结核心内容（100字内）", "keywords": ["关键词1","关键词2","关键词3"], "category": "分类（如：项目计划/会议记录/技术文档/市场分析/报告）", "tags": ["标签1","标签2"] }`;

    const articlePrompt = `分析以下文章/故事，按以下流程处理：
第一步：写一段有情感共鸣的摘要（100字内）。
第二步：从摘要中提取完整的 9D 情感词元。

按 JSON 格式输出：
{
  "title": "文章标题", "summary": "有情感共鸣的一段话总结（100字内）",
  "keywords": ["关键词1","关键词2","关键词3"],
  "emotion": { "valence": 0.0, "arousal": 0.0, "primaryType": "核心情感类型", "intensity": 0.5, "evokedFeelings": ["情绪1","情绪2"] },
  "scene": { "type": "场景类型", "atmosphere": "氛围", "lighting": "光线" },
  "characters": [{ "name": "人物名", "identity": "角色", "relationship": "关系" }],
  "objects": [{ "name": "物件名", "category": "类别", "significance": "意义" }],
  "senses": { "visual": "", "auditory": "", "olfactory": "", "tactile": "" },
  "interactionType": "互动类型", "category": "文章分类", "tags": ["标签1"]
}`;

    let analysis = {
      title: title || '文档', summary: '', keywords: [], category: category || '未分类',
      tags: [], scene: null, characters: [], objects: [], senses: null, interactionType: '',
    };
    if (article) analysis.emotion = { valence: 0, arousal: 0, primaryType: '平静', intensity: 0.3, evokedFeelings: [] };

    try {
      const resp = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          messages: [{ role: 'system', content: article ? articlePrompt : docPrompt }, { role: 'user', content: content.slice(0, 3000) }],
          max_tokens: 1024, temperature: 0.1,
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
              parsed.emotion.intensity = Math.min(baseIntensity + (parsed.emotion.evokedFeelings || []).length * 0.03, 0.95);
              analysis.emotion = parsed.emotion;
            }
            Object.assign(analysis, parsed);
          }
        }
      }
    } catch (e) { console.warn('Article analysis failed:', e.message); }

    const memory = memoryStore.addKnowledge({
      title: analysis.title, summary: analysis.summary, content,
      keywords: analysis.keywords, category: analysis.category, tags: analysis.tags,
      article: !!article, emotion: analysis.emotion || null,
      scene: analysis.scene || null, characters: analysis.characters || [],
      objects: analysis.objects || [], senses: analysis.senses || null,
      interactionType: analysis.interactionType || '',
    });

    res.json({ memory, analysis });
  } catch (err) {
    console.error('Knowledge error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════
//  Memory CRUD
// ══════════════════════════════════════════════════════════

app.get('/api/memories', (req, res) => res.json(memoryStore.getAll()));
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json(memoryStore.getAll().slice(0, 10));
  res.json(memoryStore.search(q));
});
app.delete('/api/memories', (req, res) => { memoryStore.clear(); res.json({ ok: true }); });

// 启动时索引已有记忆的词元
function reindexAllMemories() {
  const all = memoryStore.getAll();
  let count = 0;
  for (const mem of all) {
    if (mem._tokens && mem._tokens.length > 0) {
      tokenAssoc.indexMemory(mem);
      count++;
    }
  }
  console.log(`Re-indexed ${count} memories with tokens (${all.length} total)`);
}

app.listen(PORT, () => {
  console.log(`Hippocampal server running on http://localhost:${PORT}`);
  reindexAllMemories();
});
