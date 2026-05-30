/**
 * AmbiguityDetector — 模糊检测引擎
 *
 * 分析用户输入，计算语义模糊度、提取线索、检测求救信号。
 * 评分公式见 calc 注释。
 *
 * V5.1.1 状态路径更新: 使用 matrix_* 四矩阵路径
 */

const PRONOUNS = ['那','这','它','他','她','那种','这个','那个','这样','那样','那里','这里'];
const CONCRETE_NOUNS = ['咖啡厅','公司','会议','合同','医院','家','学校','办公室','餐厅','酒店','海滩','街道','酒吧','图书馆','车站','咖啡馆','食堂','教室','宿舍','公园','路边','咖啡店'];
const EMOTION_WORDS = ['难受','烦','累','不安','焦虑','怕','不开心','疲惫','孤独','压抑','崩溃','窒息','无力','麻木','空虚','难过','伤心','痛苦','绝望','烦躁','委屈'];
const ABSTRACT_NOUNS = ['感觉','情绪','状态','事情','问题','想法','念头','关系','状况','情况','时候','地方','东西'];
const CRY_FOR_HELP_PATTERNS = [/没事|还好|算了|不用|没什么|不知道|随便|都可以/, /你帮不了我|说了你也不懂|算了不说了/, /我想一个人待着|别管我|让我静静/];
const VENUE_TRIGGERS = {
  '咖啡厅':'咖啡厅','咖啡馆':'咖啡厅','餐厅':'餐厅','饭店':'餐厅','公司':'办公室','办公室':'办公室','办公':'办公室',
  '会议':'会议室','开会':'会议室','家':'家','家里':'家','回家':'家','学校':'学校','教室':'学校','医院':'医院',
  '酒店':'酒店','宾馆':'酒店','海滩':'海滩','沙滩':'海滩','街道':'街道','路边':'街道','宿舍':'宿舍','公园':'公园','图书馆':'图书馆','书店':'图书馆',
};
const STOP_WORDS = new Set(['的','了','在','是','我','你','他','她','它','我们','你们','有','和','就','也','都','这','那','上','下','去','来','不','没','把','被','让','给','对','到','从','说','看','想','要','一个','什么','那个','这个','可以','因为','所以','但是','如果']);
const POS_WORDS = ['开心','快乐','幸福','喜欢','爱','感动','温暖','美好','棒','好','赞','享受'];
const NEG_WORDS = ['烦','累','难过','伤心','痛苦','焦虑','愤怒','讨厌','恨','怕','糟','差'];
const INTIMACY_WORDS = ['想你','抱','亲','爱','暖','你在','一起','回家','见面','搂','贴'];

export class AmbiguityAnalysis {
  constructor() {
    this.ambiguity_score = 0; this.hidden_cry_for_help = false;
    this.extracted_cues = []; this.normalized_venue = '';
    this.key_objects = []; this.interaction_weight = 50;
    this.emotionalValence = 0; this.intimacyHint = 50;
    this.rawText = ''; this.pronounCount = 0;
    this.emotionCount = 0; this.concreteCount = 0; this.abstractCount = 0;
    this.posWords = []; this.negWords = [];
  }
}

export function analyzeAmbiguity(text, state15d = null) {
  const result = new AmbiguityAnalysis();
  result.rawText = text;
  if (!text || typeof text !== 'string') { result.ambiguity_score = 100; return result; }

  let score = 0;
  result.pronounCount = PRONOUNS.reduce((s, p) => s + ((text.match(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length), 0);
  score += result.pronounCount * 12;
  result.concreteCount = CONCRETE_NOUNS.reduce((s, n) => s + (text.includes(n) ? 1 : 0), 0);
  score -= result.concreteCount * 15;
  result.emotionCount = EMOTION_WORDS.reduce((s, e) => s + (text.includes(e) ? 2 : 0), 0);
  score += result.emotionCount;
  result.abstractCount = ABSTRACT_NOUNS.reduce((s, a) => s + (text.includes(a) ? 1 : 0), 0);
  score += result.abstractCount * 15;
  result.hidden_cry_for_help = CRY_FOR_HELP_PATTERNS.some(p => p.test(text));
  if (result.hidden_cry_for_help) score += 25;
  if (text.length < 10) score += 20; else if (text.length > 100) score -= 15;

  if (state15d && !result.hidden_cry_for_help) {
    const hidden = state15d?.matrix_D_anchor?.semantic_intent?.hidden_cry_for_help;
    if (hidden) { result.hidden_cry_for_help = true; score += 15; }
  }

  result.extracted_cues = [...new Set((text.match(/[一-鿿]{2,}/g) || []).filter(w => !STOP_WORDS.has(w)))].slice(0, 8);
  for (const [trigger, normalized] of Object.entries(VENUE_TRIGGERS)) {
    if (text.includes(trigger)) { result.normalized_venue = normalized; break; }
  }
  const objMatches = text.match(/(?:件|条|只|个|杯|本|双|张|把)([一-鿿]{2,4})/g);
  if (objMatches) result.key_objects = [...new Set(objMatches.map(m => m.slice(1)))];

  result.posWords = POS_WORDS.filter(w => text.includes(w));
  result.negWords = NEG_WORDS.filter(w => text.includes(w));
  const pC = result.posWords.length, nC = result.negWords.length;
  result.emotionalValence = pC + nC > 0 ? Math.max(-1, Math.min(1, (pC - nC) / (pC + nC))) : 0;

  const iC = INTIMACY_WORDS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  result.intimacyHint = Math.min(100, 50 + iC * 10);

  const gsr = state15d?.matrix_A_body?.neuro_arousal?.gsr_excitement ?? 50;
  const intimacy = state15d?.matrix_A_body?.psycho_sexual?.intimacy_craving ?? 50;
  const tension = state15d?.matrix_C_social?.social_topology?.relational_tension ?? 50;
  result.interaction_weight = Math.min(100, gsr * 0.3 + intimacy * 0.3 + tension * 0.2 + result.pronounCount * 5);
  result.ambiguity_score = Math.max(0, Math.min(100, score));
  return result;
}

const RECALL_KEYWORDS = ['记得','回忆','想起','之前','过去','那天','昨天','那次','那件事','那个','还记不记得'];
export function isMemoryQuery(text) { return RECALL_KEYWORDS.some(k => text.includes(k)); }

export const VENUE_ALIASES = {
  '咖啡厅':'咖啡厅','咖啡馆':'咖啡厅','coffee':'咖啡厅','cafe':'咖啡厅',
  '街道':'街道','户外街道':'街道','路边':'街道','海滩':'海滩','沙滩':'海滩','海边':'海滩',
  '办公室':'办公室','办公':'办公室','工位':'办公室','餐厅':'餐厅','饭店':'餐厅','餐馆':'餐厅','食堂':'餐厅',
  '会议':'会议室','会议室':'会议室','开会':'会议室','家':'家','家里':'家','家中':'家','home':'家',
  '学校':'学校','教室':'学校','大学':'学校','医院':'医院',
};
export function normVenue(type) { return type ? (VENUE_ALIASES[type] || type) : ''; }
export { VENUE_TRIGGERS };
