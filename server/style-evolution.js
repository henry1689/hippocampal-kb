/**
 * StyleEvolution — 语言指纹演变追踪
 *
 * 随着关系时间推移，AI 的文本风格发生可感知的"老化与沉淀"。
 *
 * V5.1.1 状态路径: matrix_D_anchor.textual_style
 */

import { elysium15d } from './elysium-15d.js';
import fs from 'fs';
import path from 'path';

const STYLE_FILE = path.join(process.cwd(), 'data', 'style-baseline.json');

const DEFAULT = { relationship_age_days: 0, inside_jokes: [], vocabulary_trend: 'rich', speech_era: 'initial' };

class StyleEvolutionTracker {
  constructor() {
    this.data = { ...DEFAULT };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(STYLE_FILE)) {
        Object.assign(this.data, JSON.parse(fs.readFileSync(STYLE_FILE, 'utf-8')));
      }
    } catch (e) { /* 默认值 */ }
  }

  _save() {
    try {
      const dir = path.dirname(STYLE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STYLE_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) { /* 静默 */ }
  }

  updateAfterInteraction(interactionText) {
    this.data.relationship_age_days += 1;
    const days = this.data.relationship_age_days;

    if (days > 365) { this.data.vocabulary_trend = 'minimalist'; this.data.speech_era = 'symbiotic'; }
    else if (days > 180) { this.data.vocabulary_trend = 'precise'; this.data.speech_era = 'settled'; }
    else if (days > 60) { this.data.vocabulary_trend = 'measured'; this.data.speech_era = 'deepening'; }

    const jokeMatches = interactionText.match(/[""「」『』]([^""「」『』]{2,12})[""「」『』]/g);
    if (jokeMatches) {
      for (const m of jokeMatches) {
        const phrase = m.replace(/[""「」『』]/g, '').trim();
        if (phrase && phrase.length >= 2 && !this.data.inside_jokes.includes(phrase)) {
          this.data.inside_jokes.push(phrase);
        }
      }
      if (this.data.inside_jokes.length > 20) this.data.inside_jokes = this.data.inside_jokes.slice(-20);
    }

    // 同步到 15D 状态
    try {
      const state = elysium15d.getState();
      if (state.matrix_D_anchor) {
        state.matrix_D_anchor.textual_style.relationship_age_days = this.data.relationship_age_days;
        state.matrix_D_anchor.textual_style.inside_jokes = this.data.inside_jokes.slice(-5);
        state.matrix_D_anchor.textual_style.vocabulary_trend = this.data.vocabulary_trend;
        state.matrix_D_anchor.textual_style.speech_era = this.data.speech_era;
        elysium15d.setState(state);
      }
    } catch (e) { /* 状态同步失败不影响持久化 */ }

    this._save();
  }

  getStyleBias() {
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
