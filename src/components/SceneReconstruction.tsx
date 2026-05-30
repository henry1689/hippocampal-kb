import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Memory } from '../types';

interface MatchResult {
  memory: Memory;
  score: number;
  prev?: Memory;
  next?: Memory;
}

interface Props {
  memories: Memory[];
  onSelect?: (id: string) => void;
}

export function SceneReconstruction({ memories, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [searching, setSearching] = useState(false);

  // Build temporal index from local memories (fallback)
  const temporalIndex = useMemo(() => {
    const sorted = [...memories].sort((a, b) => a.timestamp - b.timestamp);
    const map = new Map<string, { prev?: Memory; next?: Memory }>();
    for (let i = 0; i < sorted.length; i++) {
      map.set(sorted[i].id, {
        prev: i > 0 ? sorted[i - 1] : undefined,
        next: i < sorted.length - 1 ? sorted[i + 1] : undefined,
      });
    }
    return map;
  }, [memories]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }

    setSearching(true);
    try {
      // ⭐ V5.1.1: 15D 词元线索搜索（唯一规则）
      const cues = trimmed.split(/[\s,，、]+/).filter(Boolean);
      const tokenResp = await fetch(`/api/debug/tokens/search?q=${encodeURIComponent(cues.join(','))}`);
      const tokenData = await tokenResp.json();
      if (!Array.isArray(tokenData) || tokenData.length === 0) {
        setResults([]); setSelectedIdx(0); setSearching(false); return;
      }

      // 按 memoryId 分组，统计每条记忆的词元命中得分
      const memScores: Record<string, { memory: any; score: number }> = {};
      const allMemResp = await fetch('/api/memories');
      const allMemories = await allMemResp.json();
      const memMap = new Map(allMemories.map((m: any) => [m.id, m]));

      for (const t of tokenData) {
        const score = t.weight || 0.5;
        const assocCount = (t.assocTokens || []).length;
        for (const mid of (t.memoryIds || [])) {
          if (!memScores[mid]) memScores[mid] = { memory: memMap.get(mid) || null, score: 0 };
          memScores[mid].score += score * (1 + Math.min(assocCount, 20) * 0.02);
        }
      }

      const sorted = Object.values(memScores)
        .filter(r => r.memory && r.score > 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((r): MatchResult => ({
          memory: r.memory as Memory,
          score: Math.min(1, r.score / 10),
          prev: undefined, next: undefined,
        }));

      setResults(sorted);
      setSelectedIdx(0);
    } catch {
      setResults([]);
      setSelectedIdx(0);
    }
    setSearching(false);
  }, [memories, temporalIndex]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleSelect = useCallback((id: string) => {
    onSelect?.(id);
  }, [onSelect]);

  const topResult = results[selectedIdx];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>🔍 线索重建 · 15D 场景还原</div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{memories.length} 条可检索</span>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder='输入线索：如 "夏夜 咖啡厅 萨克斯" 或 "车间 5S 开心"'
          style={{
            width: '100%', padding: '9px 14px', borderRadius: 20,
            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
            color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font)',
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent-amber)'}
          onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
        />
      </div>

      {/* Empty state */}
      {query.trim() === '' ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12,
          border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>🔮</div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>输入任意线索，系统从 9 个维度重建完整场景</div>
          <div style={{ lineHeight: 1.8, color: 'var(--text-secondary)' }}>
            试试输入：<br />
            「夏夜 咖啡厅 萨克斯」→ 还原咖啡厅邂逅<br />
            「车间 5S」→ 还原工作场景改善<br />
            「心烦 红楼」→ 还原情绪故事
          </div>
        </div>
      ) : results.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          未找到匹配的记忆
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflow: 'hidden' }}>
          {/* ── Top result: Full 9D reconstruction ── */}
          {topResult && (
            <ReconstructedMemory
              result={topResult}
              isBest={selectedIdx === 0}
              onSelect={handleSelect}
            />
          )}

          {/* ── Other results (compact list) ── */}
          {results.length > 1 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>
                其他相关记忆 ({results.length - 1})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {results.slice(1).map((r, i) => (
                  <CompactResult
                    key={r.memory.id}
                    result={r}
                    onClick={() => { setSelectedIdx(i + 1); handleSelect(r.memory.id); }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Full 9D Reconstruction Card ────────────────

function ReconstructedMemory({ result, isBest, onSelect }: {
  result: MatchResult;
  isBest: boolean;
  onSelect: (id: string) => void;
}) {
  const m = result.memory;
  const n: any = m.nineD || {};
  const v: any = n.Z_emotion?.vector || { valence: 0, arousal: 0 };
  const emoH = ((v.valence + 1) * 120);
  const emoBg = 'hsla(' + emoH + ', 60%, 50%, 0.15)';
  const emoBorder = 'hsla(' + emoH + ', 60%, 50%, 0.3)';
  const m15d: any = (m as any)._15d || {};
  const narrative: string = (m as any)._narrative || '';

  return (
    <div onClick={() => onSelect(m.id)} style={{
      padding: 12, borderRadius: 10, cursor: 'pointer',
      background: isBest ? 'rgba(255,213,79,0.04)' : 'rgba(255,255,255,0.02)',
      border: isBest ? '1px solid rgba(255,213,79,0.2)' : '1px solid transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: isBest ? 'var(--accent-amber)' : 'var(--text-primary)' }}>{m.title}</span>
          <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: emoBg, color: '#fff', border: '1px solid ' + emoBorder }}>
            {(n.Z_emotion||{}).emotional_tag || (n.Z_emotion||{}).primaryType || '—'}
          </span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: result.score > 0.6 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
          {(result.score * 100).toFixed(0)}%
        </span>
      </div>

      {narrative && (
        <div style={{ padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: 'rgba(156,39,176,0.06)', border: '1px solid rgba(156,39,176,0.15)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, fontSize: 10, color: '#ce93d8', marginBottom: 2 }}>📖 15D 叙事记忆</div>
          {narrative}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {m15d.engram_depth ? <TagBadge label="刻录" value={m15d.engram_depth.toFixed(1)} color="#ef5350" /> : null}
        {m15d.venue ? <TagBadge label="场地" value={m15d.venue} color="#4fc3f7" /> : null}
        {m15d.persona_mode ? <TagBadge label="人格" value={m15d.persona_mode} color="#81c784" /> : null}
        <TagBadge label="情感" value={(n.Z_emotion||{}).emotional_tag || (n.Z_emotion||{}).primaryType || '—'} color="#ef5350" />
        <TagBadge label="场景" value={(n.V_venue||{}).type || '—'} color="#ce93d8" />
        <TagBadge label="时间" value={timeAgo(m.timestamp)} color="#ffb74d" />
      </div>

      {(n.X_semantic?.keywords||[]).length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {n.X_semantic.keywords.slice(0, 10).map((k: string, i: number) => (
            <span key={i} className="tag">{k}</span>
          ))}
        </div>
      )}
{(result.prev || result.next) && (
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-muted)',
          alignItems: 'center',
        }}>
          <span style={{ fontWeight: 600, fontSize: 10, color: 'var(--text-secondary)' }}>时间链</span>
          {result.prev && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ opacity: 0.4 }}>←</span>
              <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.prev.title}
              </span>
            </span>
          )}
          <span style={{ color: 'var(--accent-amber)', fontWeight: 500 }}>📍 当前</span>
          {result.next && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ opacity: 0.4 }}>→</span>
              <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.next.title}
              </span>
            </span>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Compact result row ──────────────────────────

function CompactResult({ result, onClick }: { result: MatchResult; onClick: () => void }) {
  const m = result.memory;
  const n: any = m.nineD || {};
  const v: any = n.Z_emotion?.vector || { valence: 0, arousal: 0 };
  const emoH = ((v.valence + 1) * 120);
  const emoBg = `hsla(${emoH}, 60%, 50%, 0.2)`;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
        background: 'rgba(255,255,255,0.02)', border: '1px solid transparent',
        transition: 'background 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
        <span style={{
          fontSize: 10, width: 8, height: 8, borderRadius: '50%',
          background: emoBg, display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {m.title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {(n.V_venue||{}).type || '未知'}
        </span>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
        {(result.score * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

function TagBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: color + '25', color, border: '1px solid ' + color + '40' }}>
      {label}: {value}
    </span>
  );
}
