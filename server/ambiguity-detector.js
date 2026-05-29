/**
 * AmbiguityDetector — 模糊检测引擎
 *
 * 分析用户输入，计算语义模糊度、提取线索、检测求救信号。
 * 输入：用户文本 + 可选 15D 状态
 * 输出：AmbiguityAnalysis（模糊度/线索/场地/物件/求救）
 *
 * 评分公式：
 *   score = pronounCount × 12 - nounCount × 15 + emotionCount × 2
 *         + (cryForHelp ? 25 : 0)
 *         + (length < 10 ? 20 : 0) - (length > 100 ? 15 : 0)
 *         + abstractNounCount × 15
 */

// ─── 静态词典 ───

const PRONOUNS = ['那','这','它','他','她','那种','这个','那个','这样','那样','那里','这里'];

const CONCRETE_NOUNS = [
  '咖啡厅','公司','会议','合同','医院','家','学校','办公室',
  '餐厅','酒店','海滩','街道','酒吧','图书馆','车站',
  '咖啡馆','食堂','教室','宿舍','公园','路边',
];

const EMOTION_WORDS = [
  '难受','烦','累','不安','焦虑','怕','不开心','疲惫',
  '孤独','压抑','崩溃','窒息','无力','麻木','空虚',
  '难过','伤心','痛苦','绝望','烦躁','委屈',
];

const ABSTRACT_NOUNS = [
  '感觉','情绪','状态','事情','问题','想法','念头',
  '关系','状况','情况','时候','地方','东西',
];

const CRY_FOR_HELP_PATTERNS = [
  /没事|还好|算了|不用|没什么|不知道|随便|都可以/,
  /你帮不了我|说了你也不懂|算了不说了/,
  /我想一个人待着|别管我|让我静静/,
];

const VENUE_TRIGGERS = {
  '咖啡厅':'咖啡厅', '咖啡馆':'咖啡厅',
  '餐厅':'餐厅', '饭店':'餐厅',
  '公司':'办公室', '办公室':'办公室', '办公':'办公室',
  '会议':'会议室', '开会':'会议室',
  '家':'家', '家里':'家', '回家':'家',
  '学校':'学校', '教室':'学校',
  '医院':'医院',
  '酒店':'酒店', '宾馆':'酒店',
  '海滩':'海滩', '沙滩':'海滩',
  '街道':'街道', '路边':'街道',
  '宿舍':'宿舍', '公园':'公园',
};

const STOP_WORDS = new Set([
  '的','了','在','是','我','你','他','她','它','我们','你们',
  '有','和','就','也','都','这','那','上','下','去','来','不',
  '没','把','被','让','给','对','到','从','说','看','想','要',
  '一个','什么','那个','这个','可以','因为','所以','但是','如果',
]);

// ─── 分析结果类型 ───

export class AmbiguityAnalysis {
  constructor() {
    this.ambiguity_score = 0;        // 0-100
    this.hidden_cry_for_help = false;
    this.extracted_cues = [];        // 提取的线索词
    this.normalized_venue = '';      // 归一化场地
    this.key_objects = [];           // 关键物件
    this.interaction_weight = 50;    // 0-100
    this.emotionalValence = 0;       // -1 ~ 1
    this.intimacyHint = 50;          // 0-100
    this.rawText = '';
    this.pronounCount = 0;
    this.emotionCount = 0;
    this.concreteCount = 0;
    this.abstractCount = 0;
  }
}

// ─── 主分析函数 ───

export function analyzeAmbiguity(text, state15d = null) {
  const result = new AmbiguityAnalysis();
  result.rawText = text;

  let score = 0;

  // 1. 代词密度
  const pronounCount = PRONOUNS.reduce((sum, p) => {
    const regex = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    return sum + ((text.match(regex) || []).length);
  }, 0);
  score += pronounCount * 12;
  result.pronounCount = pronounCount;

  // 2. 具体名词密度（有具体名词说明清晰）
  const concreteCount = CONCRETE_NOUNS.reduce((sum, n) => sum + (text.includes(n) ? 1 : 0), 0);
  score -= concreteCount * 15;
  result.concreteCount = concreteCount;

  // 3. 情绪词
  const emotionCount = EMOTION_WORDS.reduce((sum, e) => sum + (text.includes(e) ? 2 : 0), 0);
  score += emotionCount;
  result.emotionCount = emotionCount;

  // 4. 抽象名词检测
  const abstractCount = ABSTRACT_NOUNS.reduce((sum, a) => sum + (text.includes(a) ? 1 : 0), 0);
  score += abstractCount * 15;
  result.abstractCount = abstractCount;

  // 5. 求救信号
  const cryForHelp = CRY_FOR_HELP_PATTERNS.some(p => p.test(text));
  if (cryForHelp) {
    result.hidden_cry_for_help = true;
    score += 25;
  }

  // 6. 长度因子
  const textLen = text.length;
  if (textLen < 10) score += 20;
  else if (textLen > 100) score -= 15;

  // 7. 15D 状态覆写
  if (state15d && !cryForHelp) {
    const hidden = state15d.semantic_intent?.hidden_cry_for_help;
    if (hidden) {
      result.hidden_cry_for_help = true;
      score += 15;
    }
  }

  // 8. 线索提取
  const allWords = text.match(/[一-鿿]{2,}/g) || [];
  result.extracted_cues = [...new Set(allWords.filter(w => !STOP_WORDS.has(w)))].slice(0, 8);

  // 9. 场地识别
  for (const [trigger, normalized] of Object.entries(VENUE_TRIGGERS)) {
    if (text.includes(trigger)) {
      result.normalized_venue = normalized;
      break;
    }
  }

  // 10. 物件提取
  const objMatches = text.match(/(?:件|条|只|个|杯|本|双|张|把)([一-鿿]{2,4})/g);
  if (objMatches) {
    result.key_objects = [...new Set(objMatches.map(m => m.slice(1)))];
  }

  // 11. 情感效价（简单规则）
  const posWords = ['开心','快乐','幸福','喜欢','爱','感动','温暖','美好','棒'];
  const negWords = ['烦','累','难过','伤心','痛苦','焦虑','愤怒','讨厌','恨','怕'];
  const posCount = posWords.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const negCount = negWords.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  result.emotionalValence = posCount + negCount > 0
    ? Math.max(-1, Math.min(1, (posCount - negCount) / (posCount + negCount)))
    : 0;

  // 12. 亲密度提示
  const intimacyWords = ['想你','抱','亲','爱','暖','你在','一起','回家','见面'];
  const intimacyCount = intimacyWords.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  result.intimacyHint = Math.min(100, 50 + intimacyCount * 10);

  // 13. 交互权重
  result.interaction_weight = Math.min(100,
    (state15d?.neuro_arousal?.gsr_excitement || 50) * 0.3 +
    (state15d?.psychosexual_profile?.intimacy_craving || 50) * 0.3 +
    (state15d?.social_topology?.relational_tension || 50) * 0.2 +
    pronounCount * 5
  );

  // 最终得分
  result.ambiguity_score = Math.max(0, Math.min(100, score));

  return result;
}
