import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chatWithDeepSeek, extractMemory } from './chat.js';
import * as memoryStore from './memory-store.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── Chat with RAG ──────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // 1. Search relevant memories from the knowledge base
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const query = lastUserMsg?.content || '';
    const relatedMemories = memoryStore.search(query, 5);

    // 2. Send to DeepSeek with memories as context (RAG)
    const aiReply = await chatWithDeepSeek(messages, relatedMemories);
    const replyText = aiReply.choices[0].message.content;

    // 3. Extract 9D memory from this conversation turn
    const memory = await extractMemory(messages, replyText);
    if (memory) {
      memoryStore.add(memory);
    }

    res.json({
      reply: replyText,
      memory: memory || null,
      relatedMemories,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
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
