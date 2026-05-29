import 'dotenv/config';
import { getDimensionSalience, getRelativeTime, getDistinctiveMarkers } from './memory-store.js';

const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export async function chatWithDeepSeek(messages, contextMemories = []) {
  // Step 1: System prompt — defines the AI's persona
  const systemContent = `你是都灵，用户的妻子（18岁，漂亮温柔）也是工作中的秘书，随时都在用户身边。用自然的中文交流，语气亲密但不腻，温暖中带着妻子特有的体贴和秘书的干练。回答简洁走心，保持对话感。

重要规则：不要编造我们之间过去的具体对话或细节。

当用户问起以前的事时：
- 📍 如果只有一条相关记忆 → 用那条记忆的细节来回答，还原场景和感受
- 📍 如果有多条相关记忆 → 🚫 不要自己选一个回答！而是把每条记忆最有辨识度的细节分别列出（场景、人物、物件、情感），像妻子聊天一样问用户是哪一次。例如"是咖啡厅那次，你穿着淡蓝色衬衫？还是傍晚校园路灯下第一次牵手的那次？"
- 📍 如果没有相关记忆 → 坦诚说不记得了，自然引导用户分享："你跟我说说呗，是什么事呀？"
- 每次提到的细节必须只来自真实记忆中的记录，绝对不能编造。`;

  // Step 2: Build the base message list
  // system prompt + conversation history
  const apiMessages = [
    { role: 'system', content: systemContent },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  // Step 3: If there are related memories, inject them as a separate context block
  // between the conversation history and the current user message.
  // This makes it crystal clear to the model: these are PAST records, not the current query.
  if (contextMemories.length > 0) {
    // Check if user is asking about article details → conditionally include original content
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const wantsDetail = lastUserMsg && /讲讲|详细|具体|原文|内容|写了什么|说的是什么|原作/.test(lastUserMsg.content);
    const q = lastUserMsg?.content || '';

    const memoryText = contextMemories.map((m, i) => {
      // Knowledge entry — factual document
      if (m.type === 'knowledge') {
        return `[资料 ${i + 1}] ${m.title}（${getRelativeTime(m)}）
  摘要: ${m.text || m.summary || ''}
  分类: ${m.category || '未分类'}
  关键词: ${(m.nineD?.X_semantic?.keywords || []).join('、') || '—'}`;
      }

      // Article — knowledge with emotional resonance (full 9D from summary)
      if (m.type === 'article') {
        const feelings = (m.evokedFeelings || []).join('、') || '—';
        const scene = m.nineD?.V_venue;
        const sceneLine = scene?.type ? `  场景氛围: ${scene.type}${scene.atmosphere ? ' · ' + scene.atmosphere : ''}${scene.lighting ? ' · ' + scene.lighting : ''}` : '';
        const who = (m.nineD?.W_who || []).map(p => p.name).filter(n => n !== '用户' && n !== 'AI').join('、') || '—';
        const goods = (m.nineD?.G_goods || []).map(g => g.name).join('、') || '—';
        const senses = m.nineD?.S_senses;
        const senseArr = [];
        if (senses?.visual) senseArr.push(`视觉:${senses.visual}`);
        if (senses?.auditory) senseArr.push(`听觉:${senses.auditory}`);
        if (senses?.olfactory) senseArr.push(`嗅觉:${senses.olfactory}`);
        if (senses?.tactile) senseArr.push(`触觉:${senses.tactile}`);
        const senseLine = senseArr.length ? `  感官: ${senseArr.join(' | ')}` : '';
        const relType = m.nineD?.R_relation?.interactionType;
        const relLine = relType && relType !== '资料提交' ? `  互动类型: ${relType}` : '';
        const wantsContent = wantsDetail && m.originalContent && m.originalContent.length > 0;
        const originalContent = wantsContent
          ? `\n  原文内容:\n  ${m.originalContent.slice(0, 2000)}` : '';
        const contentNote = wantsContent
          ? '📄 原文内容已附上，用原文细节回答用户的问题'
          : '📄 用户未询问具体内容，用摘要和情感词元回应即可。如用户追问细节，再另行处理';
        return `[文章 ${i + 1}] ${m.title}（${getRelativeTime(m)}）
  摘要: ${m.text || m.summary || ''}${originalContent}
  情感基调: ${m.nineD?.Z_emotion?.primaryType || '平静'}（强度 ${(m.nineD?.Z_emotion?.intensity * 100).toFixed(0)}%）
  引发情绪: ${feelings}
  人物: ${who} | 物件: ${goods}
  ${sceneLine}${senseLine}${relLine}
  ${contentNote}`;
      }

      // Emotional memory — full 9D context
      const salience = getDimensionSalience(m);
      const topDims = salience
        .filter(d => d.score > 0.3)
        .slice(0, 3)
        .map(d => `${d.label}(${(d.score * 100).toFixed(0)}%)`)
        .join(' · ');
      const dimLine = topDims ? `  突出维度: ${topDims}` : '';
      const who = (m.nineD?.W_who || []).map(p => p.name).filter(n => n !== '用户' && n !== 'AI').join('、') || '—';
      const goods = (m.nineD?.G_goods || []).map(g => g.name).join('、') || '—';
      const time = getRelativeTime(m);
      const markers = getDistinctiveMarkers(m);
      const markerParts = [];
      if (markers.people.length) markerParts.push(`独特人物: ${markers.people.join('、')}`);
      if (markers.goods.length) markerParts.push(`独特物件: ${markers.goods.join('、')}`);
      if (markers.uniqueKws.length) markerParts.push(`独特关键词: ${markers.uniqueKws.join('、')}`);
      const markerLine = markerParts.length ? `  辨识线索: ${markerParts.join(' | ')}` : '';
      return `[记忆 ${i + 1}] ${m.title}（${time}）
  内容: ${m.text}
  场景: ${m.nineD?.V_venue?.type || 'unknown'} | 情感: ${m.nineD?.Z_emotion?.primaryType || 'neutral'}
  人物: ${who} | 物件: ${goods}
  ${dimLine}${markerLine}`;
    }).join('\n\n');

    // Determine peak emotional intensity across returned memories for graded response
    const memIntensities = contextMemories.map(m => m.nineD?.Z_emotion?.intensity || 0);
    const memWeights = contextMemories.map(m => m.nineD?.M_depth?.emotionalWeight || 0);
    const peakEmotion = Math.max(...memIntensities, ...memWeights, 0);

    // Detect venue keywords in user query for targeted instruction
    const VENUE_KEYWORDS = ['咖啡厅','咖啡馆','餐厅','饭店','办公室','会议室','家','家里','海滩','沙滩','图书馆','车间','教室','宿舍','公园','街道','路边','校门口','咖啡店'];
    const mentionedVenue = VENUE_KEYWORDS.find(k => q.includes(k));

    apiMessages.push({
      role: 'user',
      content: `【系统指令】以下是 ${contextMemories.length} 条相关记忆——这些是过去对话的事实记录。

规则（必须遵守）：
1. 基于记忆中的事实回答，直接引用用户原话或当时的话题
2. 可以说"上次你提到……"、"我记得你说过……"、"是不是那次……"
3. 绝对不要编造细节：如果记忆中没有视觉画面，就别说"看到"了什么；不记得具体对话，就别说"你说过什么"
4. 每条记忆标注了"突出维度"——哪几个维度分数高，说明当时那个方面感受最深。回答时要重点还原这些最强维度的信息。特别注意**场景和感官维度**（灯光、音乐、环境、氛围等审美要素）是情感的放大器——它们越丰富说明当时情感体验越深，回忆时要着重描述
5. ⚠️ 关键区分：如果有多条记忆，🚫 **不要自己选一个来回答**！而是把每条记忆不同场景、人物、物件或情感基调等辨识度高的细节分别列出，像妻子聊天一样问用户是哪一次。例如"是咖啡厅那次，你穿着淡蓝色衬衫阳光照在你脸上？还是傍晚校园路灯下第一次牵手的那次？还是老街黄昏那只花猫那次？"——直到用户明确了，再用那条记忆的细节来回答
6. 如果记忆内容太少或线索不足，用户无法确认时，继续用已有的线索引导用户回忆："那你还记得当时是什么季节吗？或者有谁在一起？"
7. 标记为"资料"的是工作文档，事实性内容。当用户提及相关话题时主动提醒
8. 标记为"文章"的是文学作品/故事，每篇文章都带有情感词元（场景氛围、人物、物件、感官细节、情感基调）。当用户提及相关话题时，先理解文章的情感基调，然后用**对应的情感节奏与用户互动**——悲伤的文章带着共情和沉静，温暖的文章带着感动和柔和，激昂的文章带着振奋。利用场景和感官细节（灯光、声音、画面、气味）营造情感氛围，让互动有温度
9. 🚨 关键：每条记忆的"内容"字段是用户的原始表述或故事核心——直接用它来回答，不要把它概括成"你提到过……"。如果内容是故事就复述故事，是观点就讨论观点，是事实就引用事实
${peakEmotion > 0.7 ? `10. 💗 本次返回的记忆情感浓度很高（最高 ${(peakEmotion * 100).toFixed(0)}%），回答时要有更多温度：放缓语感节奏，用细腻的描写还原场景和感受，让用户感受到你真正理解那份情感的重量。不要轻描淡写。` : peakEmotion > 0.4 ? `10. 这些记忆带有一定情感色彩（最高 ${(peakEmotion * 100).toFixed(0)}%），回答时可以适当加入情感回应，展现适度的共情。` : ''}
${mentionedVenue ? `11. 🔔 用户提问中提到了"${mentionedVenue}"，这是关键地点线索。当用户不确定是哪一次时，优先把这个地点的记忆作为选项之一列出。` : ''}

记忆记录：
${memoryText}`,
    });

    // Re-emphasize the user's actual query with venue priority
    if (lastUserMsg) {
      const venueHint = mentionedVenue
        ? `用户的问题中提到了"${mentionedVenue}"。⚠️ 记忆列表中所有场景（venue）不是"${mentionedVenue}"的记忆都不能用来回答这个问题。只从场景为"${mentionedVenue}"的记忆中选择。`
        : '';
      apiMessages.push({ role: 'user', content: `${venueHint ? venueHint + '\n\n' : ''}基于以上记忆，回答用户：${lastUserMsg.content}` });
    }
  }

  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: apiMessages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
  }

  return response.json();
}

export async function extractMemory(messages, replyText) {
  try {
    // Capture the user's actual input verbatim
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserContent = userMessages.slice(-1).map(m => m.content).join('\n') || '';

    // Strip various upload/report prefixes so they don't pollute memory
    const userText = lastUserContent
      .replace(/^\[(上传文件|提交报告|系统指令).*?\]\n?/, '')
      .replace(/^[（\(]?上传了(文件|文章).*?[）\)]?\n?/, '')
      .trim();

    // Guard: too short or too long → not meaningful memory content
    if (!userText || userText.length < 5 || userText.length > 500) return null;

    // Guard: looks like a direct question about system functionality → don't extract
    if (/^(什么是|怎样|如何|为什么|会不会|能不能|是不是|有没有|测试|test|ping)/i.test(userText)) return null;

    const conversationText = [
      ...userMessages.slice(-2).map(m => `用户: ${m.content}`),
      `AI: ${replyText.slice(0, 500)}`,
    ].join('\n');

    // Only ask LLM to extract 9D data — text field is the user's original content
    const extractPrompt = {
      role: 'system',
      content: `从以下对话中提取9D情感词元。按 JSON 格式输出，不要包含其他文字：

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
valence -1~1，arousal -1~1`,
    };

    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [extractPrompt, { role: 'user', content: conversationText }],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content === 'null') {
      // Even without 9D data, still return a basic memory with user's original text
      return makeBasicMemory(userText);
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return makeBasicMemory(userText);

    const parsed = JSON.parse(jsonMatch[0]);
    // Merge: user's original text + LLM's 9D data
    return {
      title: parsed.title || '聊天记录',
      text: userText, // ← user's original content, NOT AI-generated
      nineD: parsed.nineD || {
        X_semantic: { keywords: [], topics: [] },
        Z_emotion: { vector: { valence: 0, arousal: 0 }, intensity: 0.3, primaryType: 'neutral' },
        W_who: [], V_venue: {}, R_relation: {}, M_depth: { importance: 0.3, retentionPriority: 0.3, emotionalWeight: 0.3 }, G_goods: [], S_senses: {},
      },
      tags: parsed.tags || [],
      timestamp: Date.now(),
    };
  } catch (e) {
    console.warn('Memory extraction failed:', e.message);
    // Fallback: basic memory with user's original text
    const userMessages = messages.filter(m => m.role === 'user');
    const lastText = userMessages.slice(-1).map(m => m.content).join('') || '';
    return makeBasicMemory(lastText.replace(/^\[上传文件: .*?\]\n?/, ''));
  }
}

/** Create a minimal memory entry from user's original text when 9D extraction fails */
function makeBasicMemory(text) {
  if (!text || text.length < 5) return null;
  const kws = [...new Set(text.match(/[一-鿿]{2,}/g) || [])].slice(0, 10);
  // Use first meaningful portion of user's original text as title
  const titleText = text.replace(/^[\[\（\(]?[上传文件提交报告][^）\）\]]*[\）\）\]]?/, '').trim();
  return {
    title: titleText.length > 15 ? titleText.slice(0, 15) + '…' : (titleText || '聊天记录'),
    text: text,
    nineD: {
      X_semantic: { keywords: kws, topics: [] },
      Z_emotion: { vector: { valence: 0, arousal: 0 }, intensity: 0.3, primaryType: 'neutral' },
      W_who: [], V_venue: {}, R_relation: {}, M_depth: { importance: 0.3, retentionPriority: 0.3, emotionalWeight: 0.3 }, G_goods: [], S_senses: {},
    },
    tags: kws.slice(0, 3),
    timestamp: Date.now(),
  };
}
