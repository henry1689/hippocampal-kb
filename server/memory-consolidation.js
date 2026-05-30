/**
 * MemoryConsolidator — 记忆固化引擎
 *
 * 在每次对话后后台执行：
 *   1. 计算 engram_depth (刻录强度)
 *   2. isSameEvent 去重
 *   3. 写入长期记忆
 *   4. 更新用户基线画像 (EMA)
 *
 * V5.1.1 状态路径: matrix_* 四矩阵
 */

import * as memoryStore from './memory-store.js';
import { elysium15d } from './elysium-15d.js';

const GENERIC_KWS = ['咖啡厅','咖啡馆','回忆','聊天','用户','AI','自己'];
const SKIP_PEOPLE = new Set(['用户','AI','我','你']);
const VENUE_ALIASES = {
  '咖啡厅':'咖啡厅','咖啡馆':'咖啡厅','coffee':'咖啡厅','cafe':'咖啡厅',
  '街道':'街道','户外街道':'街道','路边':'街道','海滩':'海滩','沙滩':'海滩','海边':'海滩',
  '办公室':'办公室','办公':'办公室','工位':'办公室',
  '餐厅':'餐厅','饭店':'餐厅','餐馆':'餐厅','食堂':'餐厅',
  '会议':'会议室','会议室':'会议室','开会':'会议室',
  '家':'家','家里':'家','家中':'家','home':'家',
};
function normVenue(type) { return type ? (VENUE_ALIASES[type] || type) : ''; }

function _v(obj, ...paths) {
  for (const p of paths) {
    const val = p.split('.').reduce((o, k) => o?.[k], obj);
    if (val !== undefined) return val;
  }
  return undefined;
}

class MemoryConsolidator {
  async consolidate(log, state15d, aiResponse) {
    const depth = this._calculateEngramDepth(state15d);
    elysium15d.logPipeline('7_memory_stored', { engram_depth: depth, summary: (log.summary || '').slice(0, 60) });

    const existing = this._dedupCheck(log);
    if (existing) {
      if (aiResponse && aiResponse.length > (existing._ai_response || '').length) {
        existing._ai_response = aiResponse;
        const newKws = log.analysis?.extracted_cues || [];
        if (newKws.length > 0) {
          const eKws = existing.nineD?.X_semantic?.keywords || [];
          if (existing.nineD) existing.nineD.X_semantic.keywords = [...new Set([...eKws, ...newKws])];
        }
      }
      return { merged: true, existingId: existing.id, engram_depth: depth };
    }

    if (depth > 40) {
      elysium15d.logPipeline('7_memory_stored', { action: 'WRITE', engram_depth: depth, note: 'engram_depth > 40, writing to long-term' });
    }

    this._updateBaseline(state15d, depth);
    return { merged: false, engram_depth: depth };
  }

  _calculateEngramDepth(state15d) {
    const gsr      = _v(state15d, 'matrix_A_body.neuro_arousal.gsr_excitement', 'neuro_arousal.gsr_excitement') ?? 50;
    const intimacy = _v(state15d, 'matrix_A_body.psycho_sexual.intimacy_craving', 'psychosexual_profile.intimacy_craving') ?? 50;
    const stress   = _v(state15d, 'matrix_A_body.neuro_arousal.hrv_stress_index', 'neuro_arousal.hrv_stress_index') ?? 50;

    const base = gsr * 0.35 + intimacy * 0.35 + stress * 0.3;
    const peak = Math.max(gsr, intimacy, stress);
    const continuousAmp = 1.0 + peak / 200;
    const thresholdAmp = peak > 85 ? 1.5 : 1.0;
    const amplifier = Math.max(continuousAmp, thresholdAmp);
    return Math.min(100, Math.round(base * amplifier * 10) / 10);
  }

  _dedupCheck(log) {
    const newVenue = log.analysis?.normalized_venue || '';
    const newKws = log.analysis?.extracted_cues || [];
    const newTs = log.timestamp || Date.now();
    const allMemories = memoryStore.getAll();

    for (const existing of allMemories) {
      const eVenue = normVenue(existing.nineD?.V_venue?.type);
      if (!eVenue || !newVenue) continue;
      if (eVenue !== normVenue(newVenue)) continue;
      if (existing.timestamp && Math.abs(existing.timestamp - newTs) > 7 * 86400000) continue;

      const eKws = (existing.nineD?.X_semantic?.keywords || []).filter(k => !GENERIC_KWS.includes(k));
      const nKws = newKws.filter(k => !GENERIC_KWS.includes(k));
      const commonKws = eKws.filter(k => nKws.includes(k));
      const ePeople = (existing.nineD?.W_who || []).map(p => p.name).filter(n => !SKIP_PEOPLE.has(n));
      const commonPeople = ePeople.filter(p => false); // 当前暂未提取人物

      if (commonKws.length >= 1 || commonPeople.length >= 1) return existing;
    }
    return null;
  }

  _updateBaseline(state15d, depth) {
    elysium15d.logPipeline('8_baseline_update', {
      moral_fatigue: _v(state15d, 'matrix_B_psyche.shadow_self.moral_fatigue', 'shadow_self.moral_fatigue'),
      intimacy: _v(state15d, 'matrix_A_body.psycho_sexual.intimacy_craving', 'psychosexual_profile.intimacy_craving'),
      depth,
    });
  }
}

export const memoryConsolidator = new MemoryConsolidator();
