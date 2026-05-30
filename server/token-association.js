/**
 * TokenAssociation — 15D 词元关联引擎
 *
 * 管理词元 → 记忆的关联映射。
 * 每个词元（token）关联到一组记忆 ID，
 * 同一记忆中的词元自动建立关联网络。
 *
 * 集成方式：
 *   import { tokenAssoc } from './token-association.js';
 *   tokenAssoc.index(memory);        // 新记忆入库时调用
 *   const results = tokenAssoc.search(cues); // 按词元线索搜索
 */

const MIN_TOKEN_LENGTH = 2;

// 词元 → 记忆条目列表
// { tokenText: { dim, memoryIds: Set, weight: number } }
let tokenIndex = {};
let assocGraph = {}; // token → [关联token, ...]

/**
 * 将记忆中的词元加入关联索引。
 * @param {object} memory - 记忆条目（含 _tokens 数组）
 */
export function indexMemory(memory) {
  if (!memory._tokens || !Array.isArray(memory._tokens)) return;

  for (const token of memory._tokens) {
    const t = token.text;
    if (!t || t.length < MIN_TOKEN_LENGTH) continue;

    if (!tokenIndex[t]) {
      tokenIndex[t] = { dim: token.dim, memoryIds: new Set(), weight: token.weight || 0.3 };
    }
    tokenIndex[t].memoryIds.add(memory.id);
    // 权重取最大值
    tokenIndex[t].weight = Math.max(tokenIndex[t].weight, token.weight || 0.3);
  }

  // 建立词元间关联图：同一记忆中的词元互相关联
  const tokens = memory._tokens.map(t => t.text).filter(t => t && t.length >= MIN_TOKEN_LENGTH);
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      if (!assocGraph[tokens[i]]) assocGraph[tokens[i]] = new Set();
      if (!assocGraph[tokens[j]]) assocGraph[tokens[j]] = new Set();
      assocGraph[tokens[i]].add(tokens[j]);
      assocGraph[tokens[j]].add(tokens[i]);
    }
  }
}

/**
 * 按词元线索搜索关联记忆。
 * 多条线索时，命中同一记忆的次数越多，权重加成越大（交集加权）。
 * @param {string[]} cues - 线索词元列表
 * @param {number} topK - 返回数量
 * @returns {Array<{token: string, dim: string, weight: number, memoryIds: string[], assocTokens: string[], hitCount: number}>}
 */
export function searchByTokens(cues, topK = 5) {
  if (!cues || cues.length === 0) return [];

  const seen = new Set();
  const results = [];
  // 交集统计：memoryId → 命中了几条不同的线索
  const intersectionCount = {};

  for (const cue of cues) {
    // 精确匹配
    if (tokenIndex[cue]) {
      const entry = tokenIndex[cue];
      for (const mid of entry.memoryIds) {
        intersectionCount[mid] = (intersectionCount[mid] || 0) + 1;
      }
      results.push({
        token: cue, dim: entry.dim, weight: entry.weight,
        memoryIds: [...entry.memoryIds],
        assocTokens: assocGraph[cue] ? [...assocGraph[cue]] : [],
        hitCount: 1,
      });
      seen.add(cue);
    }

    // 模糊匹配（包含关系）
    for (const [token, entry] of Object.entries(tokenIndex)) {
      if (seen.has(token)) continue;
      if (token.includes(cue) || cue.includes(token)) {
        for (const mid of entry.memoryIds) {
          intersectionCount[mid] = (intersectionCount[mid] || 0) + 1;
        }
        results.push({
          token, dim: entry.dim, weight: entry.weight * 0.7,
          memoryIds: [...entry.memoryIds],
          assocTokens: assocGraph[token] ? [...assocGraph[token]] : [],
          hitCount: 1,
        });
        seen.add(token);
      }
    }
  }

  // 交集加权：如果一条记忆被多条线索同时命中，所有权重 × (1 + 0.3 × 命中数)
  for (const r of results) {
    for (const mid of r.memoryIds) {
      const hits = intersectionCount[mid] || 1;
      if (hits > 1) {
        r.weight *= (1 + 0.3 * hits);
        r.hitCount = hits;
      }
    }
  }

  results.sort((a, b) => b.weight - a.weight);
  
  // ⭐ 补充搜索：用 cue 的 2-gram 子串再搜一次（扩大召回，不漏掉相近词元）
  for (const cue of cues) {
    for (let i = 0; i < cue.length - 1; i++) {
      const gram = cue.slice(i, i + 2);
      if (seen.has(gram)) continue;
      for (const [token, entry] of Object.entries(tokenIndex)) {
        if (seen.has(token)) continue;
        if (token.includes(gram) || gram.includes(token)) {
          for (const mid of entry.memoryIds) {
            intersectionCount[mid] = (intersectionCount[mid] || 0) + 1;
          }
          results.push({
            token, dim: entry.dim, weight: entry.weight * 0.5,
            memoryIds: [...entry.memoryIds],
            assocTokens: assocGraph[token] ? [...assocGraph[token]] : [],
            hitCount: 1,
          });
          seen.add(token);
        }
      }
    }
  }

return results.slice(0, topK);
}

/**
 * 清空索引（用于重置/测试）。
 */
export function clearIndex() {
  tokenIndex = {};
  assocGraph = {};
}

/**
 * 获取索引统计。
 */
export function getStats() {
  let totalMemories = new Set();
  for (const entry of Object.values(tokenIndex)) {
    for (const id of entry.memoryIds) {
      totalMemories.add(id);
    }
  }
  return {
    tokens: Object.keys(tokenIndex).length,
    associations: Object.keys(assocGraph).length,
    memoryCount: totalMemories.size,
  };
}

// 导出单例
export const tokenAssoc = { indexMemory, searchByTokens, clearIndex, getStats };
