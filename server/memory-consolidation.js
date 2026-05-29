/**
 * MemoryConsolidator — 记忆固化引擎 (V5.1.1)
 *
 * 在每次对话后后台执行：
 *   1. 计算 engram_depth (刻录强度)
 *   2. isSameEvent 去重
 *   3. 写入长期记忆
 *   4. 更新用户基线画像 (EMA)
 */

import * as memoryStore from './memory-store.js';
import { elysium15d } from './elysium-15d.js';

// 泛型关键词（继承自 9D）
const GENERIC_KWS = ['咖啡厅','咖啡馆','回忆','聊天','用户','AI','自己'];
const SKIP_PEOPLE = new Set(['用户','AI','我','你']);

const VENUE_ALIASES = {
  '咖啡厅':'咖啡厅','咖啡馆':'咖啡厅','coffee':'咖啡厅','cafe':'咖啡厅',
  '街道':'街道','户外街道':'街道','路边':'街道',
  '海滩':'海滩','沙滩':'海滩','海边':'海滩',
  '办公室':'办公室','办公':'办公室','工位':'办公室',
  '餐厅':'餐厅','饭店':'餐厅','餐馆':'餐厅','食堂':'餐厅',
  '会议':'会议室','会议室':'会议室','开会':'会议室',
  '家':'家','家里':'家','家中':'家','home':'家',
};

function normVenue(type) {
  if (!type) return '';
  return VENUE_ALIASES[type] || type;
}

class MemoryConsolidator {
  /**
   * 执行记忆固化
   * @param {object} log - 交互日志 { text, summary, timestamp, dominantPersona, analysis }
   * @param {object} state15d - 当前 15D 状态
   * @param {string} aiResponse - AI 回复文本
   */
  async consolidate(log, state15d, aiResponse) {
    // 1. 计算 engram_depth
    const depth = this._calculateEngramDepth(state15d);
    elysium15d.logPipeline('7_memory_stored', {
      engram_depth: depth,
      summary: (log.summary || '').slice(0, 60),
    });

    // 2. 去重检查
    const existing = this._dedupCheck(log);
    if (existing) {
      // 同事件：已有的记忆更新 _ai_response (如果新的更详细)
      if (aiResponse && aiResponse.length > (existing._ai_response || '').length) {
        existing._ai_response = aiResponse;
        // 合并关键词
        const newKws = log.analysis?.extracted_cues || [];
        if (newKws.length > 0) {
          const eKws = existing.nineD?.X_semantic?.keywords || [];
          existing.nineD.X_semantic.keywords = [...new Set([...eKws, ...newKws])];
        }
      }
      return { merged: true, existingId: existing.id, engram_depth: depth };
    }

    // 3. 高权重记忆写入长期存储（由 chat 流的 extractMemory + add 完成）
    if (depth > 40) {
      elysium15d.logPipeline('7_memory_stored', {
        action: 'WRITE',
        engram_depth: depth,
        note: 'engram_depth > 40, writing to long-term',
      });
    }

    // 4. 更新 15D 基线（EMA）
    this._updateBaseline(state15d, depth);

    return { merged: false, engram_depth: depth };
  }

  _calculateEngramDepth(state15d) {
    const neuro = state15d.neuro_arousal || {};
    const psycho = state15d.psychosexual_profile || {};

    const gsr = neuro.gsr_excitement || 50;
    const intimacy = psycho.intimacy_craving || 50;
    const stress = neuro.hrv_stress_index || 50;

    const base = gsr * 0.35 + intimacy * 0.35 + stress * 0.3;
    const peak = Math.max(gsr, intimacy, stress);

    // 双重放大：连续 + 阈值
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

      // 时间差 > 7天 → 不同事件
      if (existing.timestamp && Math.abs(existing.timestamp - newTs) > 7 * 86400000) continue;

      // 非泛型关键词重叠
      const eKws = (existing.nineD?.X_semantic?.keywords || []).filter(k => !GENERIC_KWS.includes(k));
      const nKws = newKws.filter(k => !GENERIC_KWS.includes(k));
      const commonKws = eKws.filter(k => nKws.includes(k));

      // 人物重叠
      const ePeople = (existing.nineD?.W_who || []).map(p => p.name).filter(n => !SKIP_PEOPLE.has(n));
      const nPeople = []; // 当前输入暂未提取人物
      const commonPeople = ePeople.filter(p => nPeople.includes(p));

      if (commonKws.length >= 1 || commonPeople.length >= 1) {
        return existing; // 同事件
      }
    }
    return null;
  }

  _updateBaseline(state15d, depth) {
    // EMA 更新缓存在 15D 状态引擎中
    // 实际生产环境写入文件/数据库
    elysium15d.logPipeline('8_baseline_update', {
      moral_fatigue: state15d.shadow_self?.moral_fatigue,
      intimacy: state15d.psychosexual_profile?.intimacy_craving,
      depth,
    });
  }
}

export const memoryConsolidator = new MemoryConsolidator();
