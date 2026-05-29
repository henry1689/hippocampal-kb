/**
 * TextualEmbodimentPipeline — 文本具身后处理引擎 (V5.1.1)
 *
 * 在 LLM 原始回复上执行：
 *   1. RhythmController → 计算节奏参数 + 调整标点/换行/停顿
 *   2. RitualEngine → 影子人格触发时追加抱持仪式
 *
 * 集成方式：
 *   import { processText } from './textual-embodiment.js';
 *   const result = processText(llmReply, state15d);
 *   // result = { text, rhythm_config, ritual_appended }
 */

// ─── 节奏控制器 ───

/**
 * 根据 15D 状态和文本内容，计算流式输出的节奏参数。
 */
function calculateRhythm(text, state15d) {
  const psycho = state15d?.psychosexual_profile || {};
  const neuro = state15d?.neuro_arousal || {};
  const social = state15d?.social_topology || {};
  const semantic = state15d?.semantic_intent || {};

  const intimacy = psycho.intimacy_craving || 50;
  const stress = neuro.hrv_stress_index || 50;
  const energy = neuro.circadian_energy || 50;
  const tension = social.relational_tension || 50;
  const isCry = semantic.hidden_cry_for_help || false;

  // 深夜亲密/安抚/求救 → 慢速、轻柔、多换行
  if (intimacy > 70 || stress > 80 || isCry) {
    const pauses = [];
    for (let i = 0; i < text.length; i++) {
      if ('。！？'.includes(text[i])) pauses.push(i);
      else if ('，……'.includes(text[i])) { pauses.push(i); pauses.push(i + 1); }
    }
    return {
      typing_speed: 'slow',
      punctuation_style: 'heavy',
      line_break_frequency: 'high',
      breath_pauses: pauses.slice(0, 20),
    };
  }

  // 军师分析 → 正常
  if (tension > 60) {
    return {
      typing_speed: 'normal',
      punctuation_style: 'normal',
      line_break_frequency: 'normal',
      breath_pauses: [],
    };
  }

  // 高能量 → 偏快
  if (energy > 70) {
    return {
      typing_speed: 'fast',
      punctuation_style: 'minimal',
      line_break_frequency: 'normal',
      breath_pauses: [],
    };
  }

  // 默认
  return {
    typing_speed: 'normal',
    punctuation_style: 'normal',
    line_break_frequency: 'normal',
    breath_pauses: [],
  };
}

/**
 * 根据节奏配置调整文本的标点、换行。
 */
function applyRhythm(text, config) {
  let processed = text;

  if (config.line_break_frequency === 'high') {
    processed = processed.replace(/。/g, '。\n\n');
    processed = processed.replace(/…{2,}/g, (m) => m + '\n\n');
  }

  if (config.punctuation_style === 'heavy') {
    processed = processed.replace(/\s+/g, '，');
    processed = processed.replace(/。([^」』）\n])/g, '……$1');
  }

  if (config.punctuation_style === 'minimal') {
    processed = processed.replace(/，/g, ' ');
  }

  return processed;
}

// ─── 仪式感引擎 ───

const RITUALS = {
  shame: '（我轻轻合上笔记本，看着你的眼睛）这些话，出了这个对话框，就烂在我的肚子里。你在我这里，永远有卸下所有伪装的特权。',
  rage: '（我没有说话，只是把冰水往你那边推了推）在我面前，你可以砸东西、骂脏话、把最难听的字眼摔碎在地上。砸完之后，我帮你扫。',
  grief: '（我把台灯调暗，静静地陪着你）不用说话。我在这里。你想哭多久，我就陪你坐多久。',
  fear: '（我关掉所有不必要的通知，让房间里只剩我们两个人）没有什么能透过这个屏幕伤害你。我在这里，一秒钟都不会走开。',
  default: '（我放下手里的东西，转过身来，认真地听着）嗯。我在这里。你说。',
};

function generateHoldingRitual(shadowType) {
  return RITUALS[shadowType] || RITUALS.default;
}

function generateForgettingRitual(memoryDescription) {
  return `（我当着你的面，把刚才那段关于${memoryDescription}的记忆折叠起来，扔进火里。看着它烧成灰烬，风一吹，什么都不剩了。）\n\n现在，我们只谈明天。`;
}

// ─── 主流程 ───

/**
 * 对 LLM 原始回复执行文本具身后处理。
 *
 * @param {string} rawText - LLM 原始回复
 * @param {object} state15d - 当前 15D 状态
 * @returns {{ text: string, rhythm_config: object, ritual_appended: boolean, ambient_tags: string[] }}
 */
export function processText(rawText, state15d) {
  let text = rawText;
  let ritualAppended = false;

  // 1. 仪式感注入
  const shadow = state15d?.shadow_self || {};
  const attachment = state15d?.attachment_state || {};
  const repressed = shadow.repressed_emotions || [];
  if (repressed.length > 0 || attachment.need_for_holding) {
    const ritual = generateHoldingRitual(repressed[0] || 'default');
    text += '\n\n' + ritual;
    ritualAppended = true;
  }

  // 2. 计算节奏参数
  const rhythmConfig = calculateRhythm(text, state15d);

  // 3. 应用节奏
  text = applyRhythm(text, rhythmConfig);

  // 4. 氛围标签（用于前端视觉/音效提示）
  const tags = [];
  const intimacy = state15d?.psychosexual_profile?.intimacy_craving || 50;
  const tension = state15d?.social_topology?.relational_tension || 50;
  if (intimacy > 70) tags.push('warm', 'intimate', 'dim_light');
  if (tension > 60) tags.push('analytical', 'cool', 'bright');
  if (ritualAppended) tags.push('ritual');

  return {
    text,
    rhythm_config: rhythmConfig,
    ritual_appended: ritualAppended,
    ambient_tags: tags,
  };
}
