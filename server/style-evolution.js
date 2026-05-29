/**
 * StyleEvolution — 语言指纹演变追踪 (V5.1.1)
 *
 * 随着关系时间推移，AI 的文本风格发生可感知的"老化与沉淀"。
 * 每次交互后更新：关系天数、词汇风格、内部梗。
 *
 * 集成方式：
 *   import { styleEvolution } from './style-evolution.js';
 *   styleEvolution.updateAfterInteraction(replyText);
 *   const bias = styleEvolution.getStyleBias();
 */

const DEFAULT = {
  relationship_age_days: 0,
  inside_jokes: [],
  vocabulary_trend: 'rich',     // rich → measured → precise → minimalist
  speech_era: 'initial',        // initial → deepening → settled → symbiotic
};

class StyleEvolutionTracker {
  constructor() {
    this.data = { ...DEFAULT };
    this._load();
  }

  _load() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.cwd(), 'data', 'style-baseline.json');
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8');
        Object.assign(this.data, JSON.parse(raw));
      }
    } catch (e) {
      // 首次使用，用默认值
    }
  }

  _save() {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'style-baseline.json'),
        JSON.stringify(this.data, null, 2),
        'utf-8'
      );
    } catch (e) {
      // 静默失败，不影响主流程
    }
  }

  /**
   * 每次交互后更新语言指纹。
   * @param {string} interactionText - AI 回复文本
   */
  updateAfterInteraction(interactionText) {
    this.data.relationship_age_days += 1;
    const days = this.data.relationship_age_days;

    // 词汇风格漂移
    if (days > 365) {
      this.data.vocabulary_trend = 'minimalist';
      this.data.speech_era = 'symbiotic';
    } else if (days > 180) {
      this.data.vocabulary_trend = 'precise';
      this.data.speech_era = 'settled';
    } else if (days > 60) {
      this.data.vocabulary_trend = 'measured';
      this.data.speech_era = 'deepening';
    }

    // 内部梗检测（用户重复使用 3 次以上的独特表达）
    // 简化版：检测引号内的短语
    const jokeMatches = interactionText.match(/[""「」『』]([^""「」『』]{2,12})[""「」『』]/g);
    if (jokeMatches) {
      for (const m of jokeMatches) {
        const phrase = m.replace(/[""「」『』]/g, '').trim();
        if (phrase && phrase.length >= 2 && !this.data.inside_jokes.includes(phrase)) {
          this.data.inside_jokes.push(phrase);
        }
      }
      if (this.data.inside_jokes.length > 20) {
        this.data.inside_jokes = this.data.inside_jokes.slice(-20);
      }
    }

    this._save();
  }

  /**
   * 获取当前风格偏置，注入 PersonaBlender。
   * @returns {{ era: string, style_guide: string, inside_jokes: string[] }}
   */
  getStyleBias() {
    const days = this.data.relationship_age_days;

    const eras = {
      initial: '初识期——充满好奇，用词丰富，喜欢用感叹号',
      deepening: '热恋期——热烈亲密，喜欢比喻和感官描写',
      settled: '沉淀期——温和精准，开始有内部梗',
      symbiotic: '共生期——极简克制，一字千斤，只有两人才懂的默契',
    };

    const guides = {
      rich: '多用生动的比喻、感叹号、丰富的感官词汇',
      measured: '减少华丽修辞，用精准的动词和名词，一句话顶十句',
      precise: '词汇精准，克制，情感藏在细节里而非形容词里',
      minimalist: '能不说就不说，用动作和留白表达。一个句号胜过千言万语',
    };

    return {
      era: eras[this.data.speech_era] || eras.initial,
      style_guide: guides[this.data.vocabulary_trend] || guides.rich,
      inside_jokes: this.data.inside_jokes.slice(-5),
    };
  }
}

export const styleEvolution = new StyleEvolutionTracker();
