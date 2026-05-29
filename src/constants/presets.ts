import type { Memory, NineDVector } from '../types';

function embed(text: string): number[] {
  // Pre-computed 384-dim embedding placeholder
  // In production this would be computed via all-MiniLM-L6-v2
  // For demo, we use a deterministic hash-based approach
  const dims = 384;
  const arr = new Array(dims).fill(0);
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  const rng = (i: number) => {
    let s = (BigInt(seed) * 6364136223846793005n + 1442695040888963407n) >> 0n;
    s = (s * 6364136223846793005n + BigInt(i) * 1442695040888963407n) >> 0n;
    return Number(BigInt.asIntN(32, s)) / 0x7fffffff;
  };
  for (let i = 0; i < dims; i++) arr[i] = rng(i) * 2 - 1;
  return arr;
}

const NOW = Date.now();

function ts(year: number, month: number, day: number, hour: number, min: number): number {
  return new Date(year, month - 1, day, hour, min).getTime();
}

// ─── Helper to build a Memory ──────────────────────────
function M(
  id: string, scenarioId: string, momentIndex: number,
  title: string, text: string,
  nineD: NineDVector, tags: string[] = [],
): Memory {
  return { id, scenarioId, momentIndex, title, text, embedding: embed(text), timestamp: nineD.Y_time.absolute || NOW, nineD, tags };
}

// ======================================================================
// Scenario 1: 夏夜咖啡厅 (Coral)
// ======================================================================
const coffee: Memory[] = [
  M('coffee_01', 'coffee_shop', 0, '推门而入', '推开咖啡厅厚重的木门，一阵凉意扑面而来。店内灯光昏黄，空气中飘着现磨咖啡的香气。墙角传来慵懒的萨克斯风音乐。我看见她坐在靠窗的位置，对我微笑。', {
    X_semantic: { keywords: ['咖啡厅','木门','凉意','灯光','昏黄','咖啡','香气','萨克斯风','微笑'], topics: ['到达','第一印象'] },
    Y_time: { absolute: ts(2025,7,15,21,0), season: '夏', dayNight: '夜晚', hour: 21 },
    Z_emotion: { vector: { valence: 0.6, arousal: 0.4 }, intensity: 0.7, primaryType: 'excited' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '她', identity: 'romantic_interest', gender: '女', age: 27, relationship: 'acquaintance', role: 'participant', appearance: '靠窗而坐，微笑' },
    ],
    V_venue: { type: 'coffee_shop', environment: 'indoor', lighting: 'dim', atmosphere: 'intimate' },
    R_relation: { interactionType: 'romantic_date', intimacyLevel: 0.3, socialDynamics: 'egalitarian', conversationFlow: 'nervous' },
    M_depth: { importance: 0.85, retentionPriority: 0.8, emotionalWeight: 0.8 },
    G_goods: [
      { name: '木门', category: 'furniture', significance: '入口印象', sensoryTrigger: '厚重' },
      { name: '咖啡杯', category: 'tableware', significance: '场景标志物' },
      { name: '萨克斯风', category: 'music', significance: '氛围音乐', sensoryTrigger: '慵懒' },
    ],
    S_senses: { visual: '昏黄灯光，她微笑的面容', auditory: '慵懒的萨克斯风音乐', olfactory: '现磨咖啡的香气', tactile: '推开木门，凉意扑面', taste: '' },
  }, ['咖啡厅','夏夜','约会']),

  M('coffee_02', 'coffee_shop', 1, '对话', '我们聊起了各自的近况。她谈到工作上的烦恼，语气有些低落。我想安慰她，却有些笨拙。她笑了，说"你还是这样"。那一刻，空气仿佛静止了。', {
    X_semantic: { keywords: ['近况','工作','烦恼','低落','安慰','笨拙','笑了','空气','静止'], topics: ['对话','情感交流'] },
    Y_time: { absolute: ts(2025,7,15,21,30), season: '夏', dayNight: '夜晚', hour: 21.5 },
    Z_emotion: { vector: { valence: 0.3, arousal: 0.2 }, intensity: 0.6, primaryType: 'bittersweet' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'listener' },
      { name: '她', identity: 'romantic_interest', gender: '女', age: 27, relationship: 'acquaintance', role: 'speaker', emotion: { valence: -0.1, arousal: -0.3 } },
    ],
    V_venue: { type: 'coffee_shop', environment: 'indoor', lighting: 'dim', atmosphere: 'intimate' },
    R_relation: { interactionType: 'romantic_date', intimacyLevel: 0.45, socialDynamics: 'egalitarian', conversationFlow: 'quiet' },
    M_depth: { importance: 0.75, retentionPriority: 0.7, emotionalWeight: 0.7 },
    G_goods: [{ name: '咖啡杯', category: 'tableware', significance: '手中拿着' }],
    S_senses: { visual: '她的表情变化', auditory: '她的声音，低落的语气', olfactory: '', tactile: '', taste: '咖啡的苦味' },
  }),

  M('coffee_03', 'coffee_shop', 2, '触碰', '道别时，她轻轻握了握我的手。手心温暖，目光在昏暗路灯下闪烁。她说"今晚很开心"。我站在原地，看着她消失在夜色中，心里有说不出的感觉。', {
    X_semantic: { keywords: ['道别','握','手心','温暖','路灯','闪烁','开心','原地','夜色','消失'], topics: ['道别','触碰'] },
    Y_time: { absolute: ts(2025,7,15,23,0), season: '夏', dayNight: '夜晚', hour: 23 },
    Z_emotion: { vector: { valence: 0.5, arousal: 0.6 }, intensity: 0.9, primaryType: 'romantic' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '她', identity: 'romantic_interest', gender: '女', age: 27, relationship: 'acquaintance', role: 'participant', emotion: { valence: 0.7, arousal: 0.3 } },
    ],
    V_venue: { type: 'street', environment: 'outdoor', lighting: 'dim', atmosphere: 'romantic' },
    R_relation: { interactionType: 'romantic_date', intimacyLevel: 0.6, socialDynamics: 'egalitarian', conversationFlow: 'warm' },
    M_depth: { importance: 0.9, retentionPriority: 0.9, emotionalWeight: 0.95 },
    G_goods: [
      { name: '路灯', category: 'infrastructure', significance: '照明与氛围', sensoryTrigger: '昏暗' },
      { name: '她的手', category: 'body', significance: '触碰的记忆' },
    ],
    S_senses: { visual: '路灯下她的目光闪烁', auditory: '她的声音："今晚很开心"', olfactory: '', tactile: '手心温暖，轻轻一握', taste: '' },
  }),

  M('coffee_04', 'coffee_shop', 3, '归途', '独自走在回家的路上，萨克斯风的旋律还在脑中回响。夏夜的蝉鸣，微凉的晚风，混合着咖啡的余味。我知道这个夜晚会在记忆里停留很久。', {
    X_semantic: { keywords: ['回家','路上','萨克斯风','旋律','回响','蝉鸣','晚风','咖啡','余味','记忆'], topics: ['归途','回味'] },
    Y_time: { absolute: ts(2025,7,15,23,30), season: '夏', dayNight: '夜晚', hour: 23.5 },
    Z_emotion: { vector: { valence: 0.4, arousal: -0.1 }, intensity: 0.7, primaryType: 'nostalgic' },
    W_who: [{ name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' }],
    V_venue: { type: 'street', environment: 'outdoor', lighting: 'dim', atmosphere: 'peaceful' },
    R_relation: { interactionType: 'solitude', intimacyLevel: 1.0, socialDynamics: 'solo', conversationFlow: 'quiet' },
    M_depth: { importance: 0.7, retentionPriority: 0.7, emotionalWeight: 0.75 },
    G_goods: [
      { name: '蝉', category: 'nature', significance: '夏夜标志' },
      { name: '咖啡余味', category: 'sensory', significance: '味觉记忆' },
    ],
    S_senses: { visual: '空无一人的街道', auditory: '蝉鸣，脑中回响的萨克斯风旋律', olfactory: '夜晚的空气', tactile: '微凉的晚风', taste: '咖啡的余味' },
  }),
];

// ======================================================================
// Scenario 2: 商业会议 (Amber)
// ======================================================================
const business: Memory[] = [
  M('biz_01', 'business_meeting', 0, '会议开始', '会议室里气氛紧张。张总坐在长桌主位，面前的资料摊开，眉头微蹙。各部长轮流汇报进展，声音里带着谨慎。', {
    X_semantic: { keywords: ['会议室','气氛','紧张','张总','长桌','主位','资料','汇报','进展','谨慎'], topics: ['会议','汇报'] },
    Y_time: { absolute: ts(2025,9,20,14,0), season: '秋', dayNight: '下午', hour: 14 },
    Z_emotion: { vector: { valence: -0.2, arousal: 0.6 }, intensity: 0.7, primaryType: 'tense' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'observer' },
      { name: '张总', identity: 'boss', gender: '男', age: 52, relationship: 'superior', role: 'leader', appearance: '眉头微蹙，坐主位' },
      { name: '各部长', identity: 'colleagues', gender: '未知', relationship: 'colleague', role: 'speaker' },
    ],
    V_venue: { type: 'conference_room', environment: 'indoor', lighting: 'fluorescent', atmosphere: 'tense' },
    R_relation: { interactionType: 'business_meeting', intimacyLevel: 0.2, socialDynamics: 'hierarchical', conversationFlow: 'nervous' },
    M_depth: { importance: 0.8, retentionPriority: 0.75, emotionalWeight: 0.6 },
    G_goods: [
      { name: '长桌', category: 'furniture', significance: '权力象征' },
      { name: '资料', category: 'document', significance: '会议材料' },
      { name: '投影仪', category: 'electronics', significance: '展示工具' },
    ],
    S_senses: { visual: '张总眉头微蹙，资料摊开', auditory: '各部长汇报声，语气谨慎', olfactory: '', tactile: '空调冷风', taste: '' },
  }),

  M('biz_02', 'business_meeting', 1, '质量争论', '当讨论到产品方案时，张总突然提高声音："质量是第一位的！"他拍了一下桌子，目光扫视全场。"价格可以谈，但质量绝对不能妥协。"会议室鸦雀无声。', {
    X_semantic: { keywords: ['产品方案','张总','提高声音','质量','第一位','拍桌','目光','价格','妥协','鸦雀无声'], topics: ['质量争论','强调'] },
    Y_time: { absolute: ts(2025,9,20,14,45), season: '秋', dayNight: '下午', hour: 14.75 },
    Z_emotion: { vector: { valence: -0.5, arousal: 0.85 }, intensity: 1.0, primaryType: 'assertive' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'listener' },
      { name: '张总', identity: 'boss', gender: '男', age: 52, relationship: 'superior', role: 'speaker', appearance: '提高声音，拍桌，目光扫视', emotion: { valence: -0.3, arousal: 0.9 } },
      { name: '团队', identity: 'colleagues', gender: '未知', relationship: 'colleague', role: 'listener' },
    ],
    V_venue: { type: 'conference_room', environment: 'indoor', lighting: 'fluorescent', atmosphere: 'tense' },
    R_relation: { interactionType: 'business_meeting', intimacyLevel: 0.15, socialDynamics: 'hierarchical', conversationFlow: 'heated' },
    M_depth: { importance: 0.95, retentionPriority: 0.95, emotionalWeight: 0.9 },
    G_goods: [
      { name: '桌子', category: 'furniture', significance: '被拍击', sensoryTrigger: '响声' },
      { name: '质量报告', category: 'document', significance: '争论焦点' },
    ],
    S_senses: { visual: '张总拍桌，目光扫视全场', auditory: '提高的声音，拍桌声，之后的沉默', olfactory: '', tactile: '', taste: '' },
  }),

  M('biz_03', 'business_meeting', 2, '缓和', '会后，张总单独叫住我，语气缓和了许多："小陈，你知道我不是针对谁。但这个项目是我们的翻身仗。"他拍了拍我的肩膀，眼神里有期待。', {
    X_semantic: { keywords: ['会后','张总','叫住','语气','缓和','小陈','针对','项目','翻身仗','拍肩','期待'], topics: ['会后谈话','信任'] },
    Y_time: { absolute: ts(2025,9,20,16,0), season: '秋', dayNight: '下午', hour: 16 },
    Z_emotion: { vector: { valence: 0.1, arousal: -0.2 }, intensity: 0.5, primaryType: 'contemplative' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'listener', appearance: '被叫住' },
      { name: '张总', identity: 'boss', gender: '男', age: 52, relationship: 'superior', role: 'speaker', appearance: '语气缓和，拍肩，眼神有期待', emotion: { valence: 0.3, arousal: -0.1 } },
    ],
    V_venue: { type: 'corridor', environment: 'indoor', lighting: 'bright', atmosphere: 'quiet' },
    R_relation: { interactionType: 'mentor_conversation', intimacyLevel: 0.5, socialDynamics: 'hierarchical', conversationFlow: 'warm' },
    M_depth: { importance: 0.7, retentionPriority: 0.65, emotionalWeight: 0.65 },
    G_goods: [{ name: '走廊', category: 'architecture', significance: '非正式场所' }],
    S_senses: { visual: '张总期待的眼神', auditory: '缓和的语气', olfactory: '', tactile: '拍肩膀', taste: '' },
  }),

  M('biz_04', 'business_meeting', 3, '反思', '深夜在办公室整理会议纪要，张总的话还在耳边回响。"质量第一"——这个词的分量，我直到今天才真正理解。窗外城市的灯火，像无数个正在运转的项目。', {
    X_semantic: { keywords: ['深夜','办公室','整理','会议纪要','质量第一','分量','理解','城市','灯火','项目'], topics: ['复盘','领悟'] },
    Y_time: { absolute: ts(2025,9,20,22,0), season: '秋', dayNight: '夜晚', hour: 22 },
    Z_emotion: { vector: { valence: 0.0, arousal: -0.3 }, intensity: 0.5, primaryType: 'contemplative' },
    W_who: [{ name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' }],
    V_venue: { type: 'office', environment: 'indoor', lighting: 'dim', atmosphere: 'quiet' },
    R_relation: { interactionType: 'solitude', intimacyLevel: 1.0, socialDynamics: 'solo', conversationFlow: 'quiet' },
    M_depth: { importance: 0.75, retentionPriority: 0.7, emotionalWeight: 0.7 },
    G_goods: [
      { name: '会议纪要', category: 'document', significance: '工作成果' },
      { name: '笔记本电脑', category: 'electronics', significance: '工作工具' },
      { name: '城市灯火', category: 'view', significance: '窗外景象', sensoryTrigger: '夜景' },
    ],
    S_senses: { visual: '窗外城市灯火', auditory: '键盘敲击声，远处车流声', olfactory: '', tactile: '键盘触感', taste: '' },
  }),
];

// ======================================================================
// Scenario 3: 海滩日落 (Cyan)
// ======================================================================
const beach: Memory[] = [
  M('beach_01', 'beach_sunset', 0, '到达海滩', '赤脚踩在温热的沙滩上，海浪轻轻拍打着脚踝。远处海平面染成金色，海鸥在头顶盘旋。孩子们在前边奔跑嬉笑。空气中弥漫着海水的咸味。', {
    X_semantic: { keywords: ['赤脚','沙滩','温热','海浪','脚踝','海平面','金色','海鸥','盘旋','孩子','奔跑','咸味'], topics: ['到达','自然'] },
    Y_time: { absolute: ts(2025,8,10,17,30), season: '夏', dayNight: '傍晚', hour: 17.5 },
    Z_emotion: { vector: { valence: 0.8, arousal: 0.5 }, intensity: 0.7, primaryType: 'joyful' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '妻子', identity: 'spouse', gender: '女', age: 35, relationship: 'spouse', role: 'participant' },
      { name: '孩子们', identity: 'children', gender: '未知', age: 8, relationship: 'child', role: 'participant', appearance: '奔跑嬉笑' },
    ],
    V_venue: { type: 'beach', environment: 'outdoor', lighting: 'natural', atmosphere: 'joyful' },
    R_relation: { interactionType: 'family_gathering', intimacyLevel: 0.9, socialDynamics: 'egalitarian', conversationFlow: 'playful' },
    M_depth: { importance: 0.7, retentionPriority: 0.6, emotionalWeight: 0.6 },
    G_goods: [
      { name: '沙滩', category: 'nature', significance: '触感记忆' },
      { name: '海浪', category: 'nature', significance: '听觉记忆' },
      { name: '海鸥', category: 'nature', significance: '视觉记忆' },
    ],
    S_senses: { visual: '金色海平面，海鸥盘旋，孩子奔跑', auditory: '海浪声，海鸥叫声，孩子的嬉笑声', olfactory: '海水的咸味', tactile: '温热沙滩，海浪拍打脚踝', taste: '' },
  }),

  M('beach_02', 'beach_sunset', 1, '共同看日落', '我们并肩坐在沙滩上，看着太阳缓缓沉入海平线。天空从金黄渐变到橙红，再到深紫。妻子靠在我肩上，轻声说"真美"。孩子们安静下来，被这景象震撼。', {
    X_semantic: { keywords: ['并肩','沙滩','太阳','沉入','海平线','金黄','橙红','深紫','渐变','妻子','靠','肩膀','真美','安静','震撼'], topics: ['日落','共享'] },
    Y_time: { absolute: ts(2025,8,10,18,30), season: '夏', dayNight: '傍晚', hour: 18.5 },
    Z_emotion: { vector: { valence: 0.9, arousal: 0.2 }, intensity: 0.8, primaryType: 'serene' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '妻子', identity: 'spouse', gender: '女', age: 35, relationship: 'spouse', role: 'participant', appearance: '靠在我肩上', emotion: { valence: 0.95, arousal: 0.1 } },
      { name: '孩子们', identity: 'children', age: 8, relationship: 'child', role: 'observer', emotion: { valence: 0.85, arousal: 0.3 } },
    ],
    V_venue: { type: 'beach', environment: 'outdoor', lighting: 'natural', atmosphere: 'peaceful' },
    R_relation: { interactionType: 'family_gathering', intimacyLevel: 0.95, socialDynamics: 'egalitarian', conversationFlow: 'quiet' },
    M_depth: { importance: 0.85, retentionPriority: 0.85, emotionalWeight: 0.8 },
    G_goods: [
      { name: '海平线', category: 'nature', significance: '日落焦点' },
      { name: '天空', category: 'nature', significance: '颜色渐变' },
    ],
    S_senses: { visual: '金黄→橙红→深紫的天空渐变，太阳沉入海平线', auditory: '轻声的"真美"，海浪声', olfactory: '海风', tactile: '妻子靠在我肩上', taste: '' },
  }),

  M('beach_03', 'beach_sunset', 2, '篝火晚会', '夜晚的海滩升起篝火，橘红色的火光映照着每个人的笑脸。有人弹起吉他，大家围着火堆唱歌。烤棉花糖的香甜味混着木柴燃烧的气息。', {
    X_semantic: { keywords: ['夜晚','海滩','篝火','橘红','火光','笑脸','吉他','唱歌','棉花糖','香甜','木柴','燃烧'], topics: ['篝火','欢乐'] },
    Y_time: { absolute: ts(2025,8,10,20,0), season: '夏', dayNight: '夜晚', hour: 20 },
    Z_emotion: { vector: { valence: 0.85, arousal: 0.6 }, intensity: 0.75, primaryType: 'joyful' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '家人', identity: 'family', relationship: 'family', role: 'participant' },
      { name: '其他游客', identity: 'stranger', relationship: 'stranger', role: 'participant' },
    ],
    V_venue: { type: 'beach', environment: 'outdoor', lighting: 'dim', atmosphere: 'joyful' },
    R_relation: { interactionType: 'communal_gathering', intimacyLevel: 0.5, socialDynamics: 'egalitarian', conversationFlow: 'playful' },
    M_depth: { importance: 0.7, retentionPriority: 0.65, emotionalWeight: 0.7 },
    G_goods: [
      { name: '篝火', category: 'fire', significance: '中心焦点', sensoryTrigger: '噼啪声' },
      { name: '吉他', category: 'music', significance: '音乐来源' },
      { name: '棉花糖', category: 'food', significance: '味觉记忆', sensoryTrigger: '香甜' },
      { name: '木柴', category: 'fuel', significance: '篝火材料', sensoryTrigger: '燃烧味' },
    ],
    S_senses: { visual: '橘红火光映照笑脸', auditory: '吉他声，唱歌声，篝火噼啪声', olfactory: '烤棉花糖香甜，木柴燃烧气息', tactile: '火光照在脸上的温暖', taste: '烤棉花糖的甜味' },
  }),

  M('beach_04', 'beach_sunset', 3, '夜晚漫步', '散场后和妻子沿着海岸线漫步。月光洒在海面上，像一条银色道路。潮水退去，沙滩上留下我们的脚印。她握着我的手，什么也没说，但一切尽在不言中。', {
    X_semantic: { keywords: ['散场','妻子','海岸线','漫步','月光','海面','银色','道路','潮水','退去','脚印','握','手','不言中'], topics: ['漫步','默契'] },
    Y_time: { absolute: ts(2025,8,10,22,0), season: '夏', dayNight: '夜晚', hour: 22 },
    Z_emotion: { vector: { valence: 0.8, arousal: -0.3 }, intensity: 0.7, primaryType: 'serene' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '妻子', identity: 'spouse', gender: '女', age: 35, relationship: 'spouse', role: 'participant', emotion: { valence: 0.85, arousal: -0.2 } },
    ],
    V_venue: { type: 'beach', environment: 'outdoor', lighting: 'dim', atmosphere: 'romantic' },
    R_relation: { interactionType: 'romantic_walk', intimacyLevel: 1.0, socialDynamics: 'intimate', conversationFlow: 'comfortable_silence' },
    M_depth: { importance: 0.8, retentionPriority: 0.8, emotionalWeight: 0.85 },
    G_goods: [
      { name: '月光', category: 'nature', significance: '浪漫氛围', sensoryTrigger: '银色' },
      { name: '脚印', category: 'trace', significance: '共同记忆' },
      { name: '她的手', category: 'body', significance: '握手的温暖' },
    ],
    S_senses: { visual: '月光在海面上的银色倒影，沙滩上的脚印', auditory: '轻柔的海浪声', olfactory: '夜晚的海风', tactile: '握着她的手，温暖', taste: '' },
  }),
];

// ======================================================================
// Scenario 4: 雨中图书馆 (Green)
// ======================================================================
const library: Memory[] = [
  M('lib_01', 'rainy_library', 0, '避雨', '突如其来的暴雨把我赶进了街角的旧图书馆。推开吱呀作响的木门，一股旧纸和木头的气味扑面而来。管理员抬头看了我一眼，又低头继续看书。', {
    X_semantic: { keywords: ['暴雨','街角','旧图书馆','木门','吱呀','旧纸','木头','气味','管理员'], topics: ['避雨','偶遇'] },
    Y_time: { absolute: ts(2025,4,5,15,0), season: '春', dayNight: '下午', hour: 15 },
    Z_emotion: { vector: { valence: 0.2, arousal: 0.3 }, intensity: 0.4, primaryType: 'surprised' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '管理员', identity: 'librarian', gender: '男', age: 65, relationship: 'stranger', role: 'observer', appearance: '抬头看一眼又低头看书' },
    ],
    V_venue: { type: 'library', environment: 'indoor', lighting: 'dim', atmosphere: 'peaceful' },
    R_relation: { interactionType: 'accidental_encounter', intimacyLevel: 0.05, socialDynamics: 'solitary', conversationFlow: 'quiet' },
    M_depth: { importance: 0.5, retentionPriority: 0.4, emotionalWeight: 0.4 },
    G_goods: [
      { name: '木门', category: 'furniture', significance: '入口', sensoryTrigger: '吱呀声' },
      { name: '书架', category: 'furniture', significance: '图书馆标志' },
      { name: '雨', category: 'weather', significance: '触发事件', sensoryTrigger: '暴雨声' },
    ],
    S_senses: { visual: '旧图书馆内部，管理员抬头', auditory: '暴雨声，木门吱呀声', olfactory: '旧纸和木头的气味', tactile: '推开吱呀作响的木门', taste: '' },
  }),

  M('lib_02', 'rainy_library', 1, '发现旧书', '我在二楼角落里发现了一本泛黄的诗集——北岛的《回答》。翻开扉页，上面有人用钢笔写了一段话："给未来的读者——愿你找到你想要的答案。"字迹娟秀，像是多年前的少女所写。', {
    X_semantic: { keywords: ['二楼','角落','泛黄','诗集','北岛','回答','扉页','钢笔','读者','答案','字迹','娟秀','少女'], topics: ['发现','奇妙缘分'] },
    Y_time: { absolute: ts(2025,4,5,15,30), season: '春', dayNight: '下午', hour: 15.5 },
    Z_emotion: { vector: { valence: 0.5, arousal: 0.5 }, intensity: 0.6, primaryType: 'surprised' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '匿名前读者', identity: 'unknown', gender: '女', relationship: 'stranger', role: 'author_of_note', appearance: '字迹娟秀，多年前的少女' },
    ],
    V_venue: { type: 'library', environment: 'indoor', lighting: 'dim', atmosphere: 'quiet' },
    R_relation: { interactionType: 'connection_across_time', intimacyLevel: 0.1, socialDynamics: 'solitary', conversationFlow: 'quiet' },
    M_depth: { importance: 0.75, retentionPriority: 0.7, emotionalWeight: 0.7 },
    G_goods: [
      { name: '诗集《回答》', category: 'book', significance: '发现的核心', sensoryTrigger: '泛黄' },
      { name: '扉页留言', category: 'note', significance: '跨越时间的对话', sensoryTrigger: '钢笔字迹' },
    ],
    S_senses: { visual: '泛黄的书页，娟秀的钢笔字迹', auditory: '雨声', olfactory: '旧纸的独特气味', tactile: '翻开泛黄的书页', taste: '' },
  }),

  M('lib_03', 'rainy_library', 2, '沉浸阅读', '我坐在窗边的老沙发上，听着雨声读诗。北岛的文字像雨水一样清洗着心灵。偶尔抬头，窗外雨雾朦胧，图书馆里只有翻书声和雨声交织在一起。', {
    X_semantic: { keywords: ['窗边','老沙发','雨声','读诗','北岛','文字','雨水','清洗','心灵','雨雾','朦胧','翻书声'], topics: ['阅读','沉浸'] },
    Y_time: { absolute: ts(2025,4,5,16,0), season: '春', dayNight: '下午', hour: 16 },
    Z_emotion: { vector: { valence: 0.6, arousal: -0.2 }, intensity: 0.5, primaryType: 'peaceful' },
    W_who: [{ name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' }],
    V_venue: { type: 'library', environment: 'indoor', lighting: 'dim', atmosphere: 'peaceful' },
    R_relation: { interactionType: 'solitude', intimacyLevel: 1.0, socialDynamics: 'solo', conversationFlow: 'quiet' },
    M_depth: { importance: 0.65, retentionPriority: 0.6, emotionalWeight: 0.6 },
    G_goods: [
      { name: '老沙发', category: 'furniture', significance: '舒适阅读', sensoryTrigger: '老旧' },
      { name: '诗集', category: 'book', significance: '阅读内容' },
    ],
    S_senses: { visual: '窗外雨雾朦胧', auditory: '雨声，翻书声', olfactory: '旧纸味', tactile: '老沙发的舒适触感', taste: '' },
  }),

  M('lib_04', 'rainy_library', 3, '雨停', '不知过了多久，雨停了。阳光透过云层洒进图书馆，尘埃在光柱中起舞。我合上书，把它放回原处，却在心里为那位素未谋面的前读者添上了一段想象的故事。', {
    X_semantic: { keywords: ['雨停','阳光','云层','图书馆','尘埃','光柱','起舞','合上书','放回','素未谋面','前读者','想象'], topics: ['结束','余韵'] },
    Y_time: { absolute: ts(2025,4,5,17,30), season: '春', dayNight: '傍晚', hour: 17.5 },
    Z_emotion: { vector: { valence: 0.7, arousal: -0.1 }, intensity: 0.6, primaryType: 'hopeful' },
    W_who: [
      { name: '我', identity: 'self', gender: '男', relationship: 'self', role: 'participant' },
      { name: '匿名前读者', identity: 'unknown', gender: '女', relationship: 'stranger', role: 'imagined' },
    ],
    V_venue: { type: 'library', environment: 'indoor', lighting: 'bright', atmosphere: 'peaceful' },
    R_relation: { interactionType: 'solitude_with_connection', intimacyLevel: 0.2, socialDynamics: 'solo', conversationFlow: 'quiet' },
    M_depth: { importance: 0.7, retentionPriority: 0.65, emotionalWeight: 0.65 },
    G_goods: [
      { name: '阳光光束', category: 'light', significance: '雨停标志', sensoryTrigger: '温暖' },
      { name: '尘埃', category: 'particle', significance: '视觉效果', sensoryTrigger: '在光柱中舞动' },
      { name: '诗集', category: 'book', significance: '被放回原处' },
    ],
    S_senses: { visual: '阳光透过云层，尘埃在光柱中起舞', auditory: '雨停后的宁静', olfactory: '雨后清新的空气', tactile: '阳光的温暖', taste: '' },
  }),
];

// ======================================================================
// 场景元数据
// ======================================================================
export interface ScenarioMeta {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: string;
}

export const SCENARIOS: ScenarioMeta[] = [
  { id: 'coffee_shop',      title: '夏夜咖啡厅', description: ' bittersweet 的夏夜邂逅', color: '#ff6b6b', icon: '☕' },
  { id: 'business_meeting', title: '商业会议',   description: '张总的"质量第一"',       color: '#ffb74d', icon: '📊' },
  { id: 'beach_sunset',     title: '海滩日落',   description: '温馨的家庭时光',         color: '#4dd0e1', icon: '🏖️' },
  { id: 'rainy_library',    title: '雨中图书馆', description: '意外的文学发现',         color: '#81c784', icon: '📚' },
];

export const ALL_MEMORIES: Memory[] = [...coffee, ...business, ...beach, ...library];

export function getMemoriesByScenario(scenarioId: string): Memory[] {
  return ALL_MEMORIES.filter(m => m.scenarioId === scenarioId);
}

export function getMemoryById(id: string): Memory | undefined {
  return ALL_MEMORIES.find(m => m.id === id);
}

export function getScenarioByMemory(memory: Memory): ScenarioMeta | undefined {
  return SCENARIOS.find(s => s.id === memory.scenarioId);
}

export function getScenarioById(id: string): ScenarioMeta | undefined {
  return SCENARIOS.find(s => s.id === id);
}
