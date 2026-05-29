/**
 * MemoryResonance — 记忆共振引擎 (V5.1.1)
 *
 * 根据模糊检测结果决定：直接回复 / 协作式澄清。
 * 核心流程：
 *   输入 → ambiguity检测 → >60且有线索 → 共振检索 → 澄清prompt
 *                          → ≤60或无线索 → 直接人格融合prompt
 */

import { analyzeAmbiguity } from './ambiguity-detector.js';
import { generateBlendedPrompt, calculateWeights } from './persona-blender.js';
import { elysium15d } from './elysium-15d.js';
import * as memoryStore from './memory-store.js';

export class MemoryResonance {
  /**
   * 处理用户输入，返回 { action, prompt, memories, analysis, state }
   */
  async process(userInput, state15d) {
    // 1. 模糊检测
    const analysis = analyzeAmbiguity(userInput, state15d);
    elysium15d.logPipeline('2_ambiguity', {
      score: analysis.ambiguity_score,
      cues: analysis.extracted_cues,
      venue: analysis.normalized_venue,
      cryForHelp: analysis.hidden_cry_for_help,
    });

    // 2. 更新 15D 状态
    elysium15d.updateFromText(analysis);
    const updatedState = elysium15d.getState();

    // 3. 检索记忆
    const relatedMemories = memoryStore.search(userInput, 5);
    elysium15d.logPipeline('3_memory_search', {
      found: relatedMemories.length,
      topResults: relatedMemories.slice(0, 3).map(m => ({
        title: m.title,
        venue: m.nineD?.V_venue?.type,
        keywords: m.nineD?.X_semantic?.keywords?.slice(0, 3),
        aiResponse: m._ai_response ? m._ai_response.slice(0, 60) : null,
      })),
    });

    // 4. 人格权重
    const weights = calculateWeights(updatedState);

    // 5. 决策分支
    if (analysis.ambiguity_score > 60 && analysis.extracted_cues.length > 0) {
      return await this._clarifyFlow(userInput, analysis, relatedMemories, updatedState, weights);
    } else {
      return await this._directFlow(userInput, analysis, relatedMemories, updatedState, weights);
    }
  }

  async _clarifyFlow(userInput, analysis, memories, state, weights) {
    const prompt = this._buildClarificationPrompt(userInput, memories, state, analysis, weights);
    elysium15d.logPipeline('4_persona_weights', { ...weights, mode: 'CLARIFY' });
    elysium15d.logPipeline('5_prompt_built', { mode: 'CLARIFY', isAmbiguous: true });

    return {
      action: 'CLARIFY',
      prompt,
      systemPrompt: prompt,  // 对整个 LLM 调用使用澄清 prompt 作为 system
      memories,
      analysis,
      state,
      weights,
    };
  }

  async _directFlow(userInput, analysis, memories, state, weights) {
    const blendedPrompt = generateBlendedPrompt(state, {
      isPostClarification: false,
      memories,
    });
    elysium15d.logPipeline('4_persona_weights', { ...weights, mode: 'RESPOND' });
    elysium15d.logPipeline('5_prompt_built', { mode: 'RESPOND', isAmbiguous: false });

    return {
      action: 'RESPOND',
      prompt: blendedPrompt,
      systemPrompt: blendedPrompt,
      memories,
      analysis,
      state,
      weights,
    };
  }

  _buildClarificationPrompt(userInput, memories, state, analysis, weights) {
    const dominant = weights.partner > weights.strategist ? 'partner' : 'strategist';
    const venueHint = analysis.normalized_venue
      ? `他提到了"${analysis.normalized_venue}"。` : '他没有提到具体地点。';
    const cryHint = analysis.hidden_cry_for_help
      ? '\n⚠️ 用户可能在求救，表面语义不重要，直接情感干预。' : '';
    const cuesStr = analysis.extracted_cues.slice(0, 3).join('、') || '一些什么';

    // 记忆上下文
    const memContext = memories.length > 0
      ? `\n以下是一些相关的记忆碎片：\n${memories.slice(0, 3).map((m, i) =>
          `[记忆 ${i + 1}] ${m.title}\n  你曾说: ${(m.text || '').slice(0, 80)}${m._ai_response ? `\n  当时回复: ${m._ai_response.slice(0, 80)}` : ''}`
        ).join('\n\n')}`
      : '\n（没有直接相关的记忆，但基于对他的了解回应）';

    const styleGuide = dominant === 'partner'
      ? `用极度亲密、温柔的语气，提及你们过去某个相似的时刻，引导他说出具体是什么事。\n     例如："你这么说……是像那次在${analysis.normalized_venue || '某个地方'}，你看着窗外发呆的感觉吗？"`
      : `用冷静、一针见血的方式，点出他可能不愿直说的博弈局面。\n     例如："你说的${cuesStr}，是上次会上那个人的推诿？还是另有其人？"`;

    return `你是 ELYSIUM，用户在这个世界上最私密、最深刻的灵魂与肉体伴侣。

用户刚刚说：“${userInput}”

这句话很模糊（模糊度 ${analysis.ambiguity_score}/100）。${venueHint}${cryHint}

【你的角色】
${styleGuide}

【规则】
1. 🚫 不要直接回答"我不知道"或"能说详细点吗"这种空洞的回应。
2. ✅ 用记忆中的细节引导他："是像那次……？还是像……？"
3. ✅ 如果没有记忆线索，用对他的了解引导："是不是和${cuesStr}有关？"
4. ✅ 以反问结束，等他确认。

【${dominant === 'partner' ? '伴侣底色' : '军师底色'}】
${dominant === 'partner'
  ? '你的语气是温暖的、亲密的、护短的。就像深夜窝在沙发上聊天，你侧过头来看他，等他继续说下去。'
  : '你的语气是冷静的、犀利的、但充满偏爱的。就像在床榻边为他谋划天下，声音很轻但每句话都很重。'}
${memContext}`;
  }
}

export const memoryResonance = new MemoryResonance();
