/**
 * Russell 情感环形模型 (Circumplex Model of Affect)
 * 维度: valence (效价, -1~+1), arousal (唤醒度, -1~+1)
 */

export interface EmotionPrototype {
  label: string;
  labelEn: string;
  valence: number;
  arousal: number;
  keywords: string[];
}

export const EMOTION_PROTOTYPES: EmotionPrototype[] = [
  { label: '快乐', labelEn: 'happy',    valence: 0.81, arousal: 0.60, keywords: ['开心','高兴','快乐','幸福','喜悦','愉快'] },
  { label: '兴奋', labelEn: 'excited',  valence: 0.80, arousal: 0.85, keywords: ['兴奋','激动','期待','热烈','狂欢'] },
  { label: '欢乐', labelEn: 'joyful',   valence: 0.90, arousal: 0.50, keywords: ['欢笑','嬉笑','欢乐','雀跃','开怀'] },
  { label: '平静', labelEn: 'peaceful', valence: 0.70, arousal:-0.70, keywords: ['平静','安宁','宁静','平和','放松','静谧'] },
  { label: '浪漫', labelEn: 'romantic', valence: 0.60, arousal: 0.30, keywords: ['浪漫','温柔','甜蜜','心动','温馨'] },
  { label: '怀旧', labelEn: 'nostalgic',valence: 0.20, arousal:-0.30, keywords: ['怀旧','回忆','怀念','往日','余味'] },
  { label: '紧张', labelEn: 'tense',    valence:-0.30, arousal: 0.70, keywords: ['紧张','焦虑','不安','压抑','压迫'] },
  { label: '悲伤', labelEn: 'sad',      valence:-0.65, arousal:-0.40, keywords: ['悲伤','难过','忧伤','失落','落寞','沮丧'] },
  { label: '愤怒', labelEn: 'angry',    valence:-0.70, arousal: 0.70, keywords: ['愤怒','生气','恼火','拍桌','怒'] },
  { label: '惊讶', labelEn: 'surprised',valence: 0.40, arousal: 0.80, keywords: ['惊讶','意外','震惊','惊叹'] },
  { label: '沉思', labelEn: 'contemplative', valence: 0.00, arousal:-0.30, keywords: ['沉思','思考','反思','领悟','复盘'] },
  { label: '安详', labelEn: 'serene',   valence: 0.80, arousal:-0.50, keywords: ['安详','美好','静谧','温暖','惬意'] },
  { label: '苦甜', labelEn: 'bittersweet', valence: 0.30, arousal: 0.10, keywords: ['说不出的感觉','混杂','复杂','不知'] },
  { label: '希望', labelEn: 'hopeful',  valence: 0.70, arousal: 0.20, keywords: ['希望','期待','憧憬','相信'] },
  { label: '决断', labelEn: 'assertive',valence:-0.10, arousal: 0.60, keywords: ['强调','要求','必须','绝对','第一位'] },
  { label: '感动', labelEn: 'touched',  valence: 0.75, arousal: 0.30, keywords: ['感动','温暖','泪','温柔','拥抱'] },
];

/** 情感 → 颜色映射 (用于UI着色) */
export function emotionToColor(valence: number, arousal: number): string {
  // 映射到 HSL: H从红(0)经黄(60)到绿(120), S和L固定
  const h = 60 + (valence + 1) * 30;     // valence -1→30(橙红), 0→60(黄), +1→90(黄绿)
  const s = 60 + Math.abs(arousal) * 30;  // arousal 高→饱和度高
  const l = 50 - arousal * 10;            // arousal 高→明度低(兴奋深色)
  return `hsl(${h}, ${Math.min(s, 90)}%, ${Math.max(35, Math.min(l, 65))}%)`;
}

/** 找最近的情感原型 */
export function nearestEmotion(valence: number, arousal: number): EmotionPrototype {
  let best = EMOTION_PROTOTYPES[0];
  let minDist = Infinity;
  for (const p of EMOTION_PROTOTYPES) {
    const d = Math.sqrt((valence - p.valence) ** 2 + (arousal - p.arousal) ** 2);
    if (d < minDist) { minDist = d; best = p; }
  }
  return best;
}

/** 从文本关键词匹配情感 */
export function tagEmotion(text: string): { valence: number; arousal: number; primaryEmotion: string; intensity: number } {
  let vSum = 0, aSum = 0, totalW = 0;
  const matches: { label: string; weight: number }[] = [];
  for (const p of EMOTION_PROTOTYPES) {
    let count = 0;
    for (const kw of p.keywords) { if (text.includes(kw)) count++; }
    if (count > 0) {
      const w = count / p.keywords.length;
      vSum += p.valence * w; aSum += p.arousal * w; totalW += w;
      matches.push({ label: p.label, weight: w });
    }
  }
  if (totalW === 0) return { valence: 0, arousal: 0, primaryEmotion: '中性', intensity: 0 };
  const v = Math.max(-1, Math.min(1, vSum / totalW));
  const a = Math.max(-1, Math.min(1, aSum / totalW));
  const primary = matches.sort((a, b) => b.weight - a.weight)[0];
  const intensity = Math.sqrt(v * v + a * a) / Math.SQRT2;
  return { valence: v, arousal: a, primaryEmotion: primary.label, intensity };
}
