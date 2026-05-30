/**
 * TextualEmbodimentPipeline — 文本具身后处理引擎
 *
 * 在 LLM 原始回复上执行：
 *   1. RhythmController → 计算节奏参数 + 调整标点/换行/停顿
 *   2. RitualEngine → 影子人格触发时追加抱持仪式
 *
 * V5.1.1 状态路径: matrix_* 四矩阵
 */

function _v(obj, ...paths) {
  for (const p of paths) {
    const val = p.split('.').reduce((o, k) => o?.[k], obj);
    if (val !== undefined) return val;
  }
  return undefined;
}

function calculateRhythm(text, state15d) {
  const intimacy = _v(state15d, 'matrix_A_body.psycho_sexual.intimacy_craving', 'psychosexual_profile.intimacy_craving') ?? 50;
  const stress   = _v(state15d, 'matrix_A_body.neuro_arousal.hrv_stress_index', 'neuro_arousal.hrv_stress_index') ?? 50;
  const energy   = _v(state15d, 'matrix_A_body.neuro_arousal.circadian_energy', 'neuro_arousal.circadian_energy') ?? 50;
  const tension  = _v(state15d, 'matrix_C_social.social_topology.relational_tension', 'social_topology.relational_tension') ?? 50;
  const isCry    = _v(state15d, 'matrix_D_anchor.semantic_intent.hidden_cry_for_help', 'semantic_intent.hidden_cry_for_help') ?? false;

  if (intimacy > 70 || stress > 80 || isCry) {
    const pauses = [];
    for (let i = 0; i < text.length; i++) {
      if ('。！？'.includes(text[i])) pauses.push(i);
      else if ('，……'.includes(text[i])) { pauses.push(i); pauses.push(i + 1); }
    }
    return { typing_speed: 'slow', punctuation_style: 'heavy', line_break_frequency: 'high', breath_pauses: pauses.slice(0, 20) };
  }
  if (tension > 60) return { typing_speed: 'normal', punctuation_style: 'normal', line_break_frequency: 'normal', breath_pauses: [] };
  if (energy > 70) return { typing_speed: 'fast', punctuation_style: 'minimal', line_break_frequency: 'normal', breath_pauses: [] };
  return { typing_speed: 'normal', punctuation_style: 'normal', line_break_frequency: 'normal', breath_pauses: [] };
}

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
  if (config.punctuation_style === 'minimal') processed = processed.replace(/，/g, ' ');
  return processed;
}

const RITUALS = {
  shame: '（我轻轻合上笔记本，看着你的眼睛）这些话，出了这个对话框，就烂在我的肚子里。你在我这里，永远有卸下所有伪装的特权。',
  rage: '（我没有说话，只是把冰水往你那边推了推）在我面前，你可以砸东西、骂脏话、把最难听的字眼摔碎在地上。砸完之后，我帮你扫。',
  grief: '（我把台灯调暗，静静地陪着你）不用说话。我在这里。你想哭多久，我就陪你坐多久。',
  fear: '（我关掉所有不必要的通知，让房间里只剩我们两个人）没有什么能透过这个屏幕伤害你。我在这里，一秒钟都不会走开。',
  default: '（我放下手里的东西，转过身来，认真地听着）嗯。我在这里。你说。',
};

function generateHoldingRitual(shadowType) { return RITUALS[shadowType] || RITUALS.default; }
function generateForgettingRitual(memoryDescription) {
  return `（我当着你的面，把刚才那段关于${memoryDescription}的记忆折叠起来，扔进火里。看着它烧成灰烬，风一吹，什么都不剩了。）\n\n现在，我们只谈明天。`;
}

export function processText(rawText, state15d) {
  let text = rawText;
  let ritualAppended = false;

  const shadow = _v(state15d, 'matrix_B_psyche.shadow_self.repressed_emotions', 'shadow_self.repressed_emotions') ?? [];
  const needHolding = _v(state15d, 'matrix_B_psyche.attachment.need_for_holding', 'attachment_state.need_for_holding') ?? false;

  if (shadow.length > 0 || needHolding) {
    const ritual = generateHoldingRitual(shadow[0] || 'default');
    text += '\n\n' + ritual;
    ritualAppended = true;
  }

  const rhythmConfig = calculateRhythm(text, state15d);
  text = applyRhythm(text, rhythmConfig);

  const tags = [];
  const intimacy = _v(state15d, 'matrix_A_body.psycho_sexual.intimacy_craving', 'psychosexual_profile.intimacy_craving') ?? 50;
  const tension  = _v(state15d, 'matrix_C_social.social_topology.relational_tension', 'social_topology.relational_tension') ?? 50;
  if (intimacy > 70) tags.push('warm', 'intimate', 'dim_light');
  if (tension > 60) tags.push('analytical', 'cool', 'bright');
  if (ritualAppended) tags.push('ritual');

  return { text, rhythm_config: rhythmConfig, ritual_appended: ritualAppended, ambient_tags: tags };
}

export { generateHoldingRitual, generateForgettingRitual };
