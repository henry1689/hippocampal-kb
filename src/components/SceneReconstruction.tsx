import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Memory, NineDVector } from '../types';
import { nineDEncoder } from '../engine/NineDEncoder';
import { jaccard } from '../utils/similarity';
import { DIMENSION_META } from '../constants/dimensions';

type DimKey = keyof NineDVector;

interface DimMatch {
  dim: DimKey;
  sim: number;
}

interface MatchResult {
  memory: Memory;
  score: number;
  dimMatches: DimMatch[];
  prev?: Memory;
  next?: Memory;
}

interface Props {
  memories: Memory[];
  onSelect?: (id: string) => void;
}

const DIM_COLORS: Record<DimKey, string> = {
  X_semantic: '#4fc3f7', Y_time: '#ffb74d', Z_emotion: '#ef5350',
  W_who: '#81c784', V_venue: '#ce93d8', R_relation: '#ffd54f',
  M_depth: '#4db6ac', G_goods: '#f06292', S_senses: '#4dd0e1',
};

const DIM_LABELS: Record<DimKey, string> = {
  X_semantic: '语义', Y_time: '时间', Z_emotion: '情感',
  W_who: '人物', V_venue: '场景', R_relation: '关系',
  M_depth: '深刻', G_goods: '物件', S_senses: '感官',
};

export function SceneReconstruction({ memories, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Build temporal index
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

  const doSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }

    const boosts = nineDEncoder.detectDimensionBoosts(trimmed);
    const boostedDims = Object.keys(boosts) as DimKey[];
    const qKws = extractKeywords(trimmed);

    const scored = memories.map(m => {
      const memKws = m.nineD.X_semantic.keywords;
      const textSim = qKws.length > 0 ? jaccard(qKws, memKws) : 0;

      const dimMatches: DimMatch[] = [];
      for (const dim of boostedDims) {
        const sim = computeDimSim(dim, trimmed, m);
        if (sim > 0) dimMatches.push({ dim, sim });
      }

      let score = textSim * 0.4;
      if (dimMatches.length > 0) {
        let weightedSum = 0, weightTotal = 0;
        for (const { dim, sim } of dimMatches) {
          const w = boosts[dim] ?? 1;
          weightedSum += sim * w;
          weightTotal += w;
        }
        if (weightTotal > 0) score += (weightedSum / weightTotal) * 0.6;
      }

      return { memory: m, score: Math.max(0, Math.min(1, score)), dimMatches };
    });

    const top = scored
      .filter(r => r.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const withContext = top.map(r => {
      const neighbors = temporalIndex.get(r.memory.id);
      return { ...r, prev: neighbors?.prev, next: neighbors?.next };
    });

    setResults(withContext);
    setSelectedIdx(0);
  }, [memories, temporalIndex]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleSelect = useCallback((id: string) => {
    onSelect?.(id);
  }, [onSelect]);

  const topResult = results[selectedIdx];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>🔍 线索重建 · 9D 场景还原</div>
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
  const n = m.nineD;
  const v = n.Z_emotion.vector;
  const emoH = ((v.valence + 1) * 120);
  const emoBg = `hsla(${emoH}, 60%, 50%, 0.15)`;
  const emoBorder = `hsla(${emoH}, 60%, 50%, 0.3)`;

  return (
    <div
      onClick={() => onSelect(m.id)}
      style={{
        padding: 12, borderRadius: 10, cursor: 'pointer',
        background: isBest ? 'rgba(255,213,79,0.04)' : 'rgba(255,255,255,0.02)',
        border: isBest ? '1px solid rgba(255,213,79,0.2)' : '1px solid transparent',
        transition: 'all 0.2s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: isBest ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
            {m.title}
          </span>
          <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: emoBg, color: '#fff', border: `1px solid ${emoBorder}` }}>
            {n.Z_emotion.primaryType}
          </span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: result.score > 0.6 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
          {(result.score * 100).toFixed(0)}%
        </span>
      </div>

      {/* ─── 9D Dimensional Reconstruction Grid ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.6 }}>

        {/* 故事 Story */}
        <DimSection dim="X_semantic" icon="📖" label="故事">
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
            {m.text.length > 200 ? m.text.slice(0, 200) + '…' : m.text}
          </div>
          {n.X_semantic.keywords.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {n.X_semantic.keywords.slice(0, 8).map((k, i) => (
                <span key={i} className="tag">{k}</span>
              ))}
            </div>
          )}
        </DimSection>

        {/* 情感 Emotion */}
        <DimSection dim="Z_emotion" icon="❤️" label="情感">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{n.Z_emotion.primaryType}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              valence {v.valence > 0 ? '+' : ''}{v.valence.toFixed(2)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              arousal {v.arousal > 0 ? '+' : ''}{v.arousal.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 32 }}>强度</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{
                width: `${n.Z_emotion.intensity * 100}%`, height: '100%',
                borderRadius: 3, background: `hsla(${emoH}, 60%, 50%, 0.6)`,
              }} />
            </div>
          </div>
        </DimSection>

        {/* 场景 Scene */}
        <DimSection dim="V_venue" icon="🌍" label="场景">
          <span>{n.V_venue.type} · {n.V_venue.environment} · {n.V_venue.lighting}灯光 · {n.V_venue.atmosphere}</span>
        </DimSection>

        {/* 时间 Time */}
        <DimRow icon="🕐" label="时间" color={DIM_COLORS.Y_time}>
          <span>{n.Y_time.season || '—'}季 · {n.Y_time.dayNight || '—'}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{timeAgo(m.timestamp)}</span>
        </DimRow>

        {/* 人物 People */}
        <DimSection dim="W_who" icon="👥" label="人物">
          {n.W_who.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {n.W_who.map((p, i) => (
                <span key={i} style={{ fontSize: 12 }}>
                  {p.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({p.identity})</span>
                </span>
              ))}
            </div>
          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </DimSection>

        {/* 物件 Goods + 感官 Senses in same row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <DimSection dim="G_goods" icon="📦" label="物件" compact>
            {n.G_goods.length > 0
              ? n.G_goods.map((g, i) => (
                  <span key={i} style={{ fontSize: 12 }}>
                    {g.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({g.category})</span>
                  </span>
                ))
              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
          </DimSection>
          <DimSection dim="S_senses" icon="🔊" label="感官" compact>
            {renderSenses(n.S_senses)}
          </DimSection>
        </div>

        {/* 关系 Relation + 深刻度 Depth */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <DimSection dim="R_relation" icon="🔗" label="关系" compact>
            <span>{n.R_relation.interactionType} · 亲密度 {(n.R_relation.intimacyLevel * 100).toFixed(0)}%</span>
          </DimSection>
          <DimRow icon="📊" label="深刻" color={DIM_COLORS.M_depth}>
            <span>重要 {(n.M_depth.importance * 100).toFixed(0)}% · 保留 {(n.M_depth.retentionPriority * 100).toFixed(0)}%</span>
          </DimRow>
        </div>
      </div>

      {/* Temporal context */}
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

      {/* Dimension matches */}
      {result.dimMatches.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {result.dimMatches.map(d => (
            <span key={d.dim} style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 8,
              background: (DIM_COLORS[d.dim] || '#fff') + '30',
              color: DIM_COLORS[d.dim] || '#fff',
              border: `1px solid ${(DIM_COLORS[d.dim] || '#fff')}40`,
            }}>
              {DIM_LABELS[d.dim]} {(d.sim * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Compact result row ──────────────────────────

function CompactResult({ result, onClick }: { result: MatchResult; onClick: () => void }) {
  const m = result.memory;
  const n = m.nineD;
  const v = n.Z_emotion.vector;
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
          {n.V_venue.type}
        </span>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
        {(result.score * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────

function DimSection({ dim, icon, label, children, compact }: {
  dim: DimKey; icon: string; label: string; children: React.ReactNode; compact?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: compact ? 4 : 6, alignItems: 'flex-start' }}>
      <span style={{ fontSize: compact ? 11 : 12, color: DIM_COLORS[dim], flexShrink: 0, width: compact ? 50 : 60 }}>
        {icon} {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function DimRow({ icon, label, color, children }: {
  icon: string; label: string; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color, flexShrink: 0, width: 60 }}>{icon} {label}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────

function renderSenses(s: NineDVector['S_senses']): React.ReactNode {
  const labels: Record<keyof NineDVector['S_senses'], string> = {
    visual: '视觉', auditory: '听觉', olfactory: '嗅觉', tactile: '触觉', taste: '味觉',
  };
  const active = (Object.keys(labels) as (keyof NineDVector['S_senses'])[])
    .filter(k => s[k] && s[k].length > 0);

  if (active.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {active.map(k => (
        <span key={k} style={{ fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{labels[k]}: </span>
          {s[k].length > 10 ? s[k].slice(0, 10) + '…' : s[k]}
        </span>
      ))}
    </div>
  );
}

function extractKeywords(text: string): string[] {
  const chars = [...text];
  const kws: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    const bg = chars[i] + chars[i + 1];
    if (/[一-鿿]/.test(chars[i]) && /[一-鿿]/.test(chars[i + 1])) kws.push(bg);
  }
  return [...new Set(kws)];
}

function computeDimSim(dim: DimKey, query: string, mem: Memory): number {
  switch (dim) {
    case 'X_semantic': {
      // Bigram Jaccard on keywords
      const qKws = extractKeywords(query);
      let kwScore = qKws.length > 0 ? jaccard(qKws, mem.nineD.X_semantic.keywords) : 0;

      // Also check: does any tag/title/text contain any part of the query (bidirectional)?
      const q = query.toLowerCase();
      const title = (mem.title || '').toLowerCase();
      const text = (mem.text || '').toLowerCase();
      const tags = (mem.tags || []).map(t => t.toLowerCase());
      const kws = (mem.nineD.X_semantic.keywords || []).map(k => k.toLowerCase());

      // Check if query is a substring of any tag (e.g. "红楼" → "红楼梦同人")
      const allTextFields = [title, text, ...tags, ...kws];
      let textMatch = 0;
      for (const field of allTextFields) {
        if (field.includes(q)) { textMatch = 0.5; break; }
        // Check partial: any 2+ char segment of query matches any tag/text
        if (q.length >= 2) {
          for (let i = 0; i < q.length - 1; i++) {
            const seg = q.slice(i, i + 2);
            if (field.includes(seg) && seg.length === 2 && !'的了我是在有和他她都就也'.includes(seg)) {
              textMatch = Math.max(textMatch, 0.3);
            }
          }
        }
      }

      return Math.max(kwScore, textMatch);
    }
    case 'Y_time': {
      const sk = ['春','夏','秋','冬','春天','夏天','秋天','冬天'];
      const dk = ['清晨','上午','中午','下午','傍晚','夜晚','晚上'];
      for (const k of sk) if (query.includes(k)) return 1;
      for (const k of dk) if (query.includes(k)) return 1;
      return 0;
    }
    case 'Z_emotion': {
      const pos = ['开心','快乐','幸福','浪漫','温暖','喜悦'];
      const neg = ['沮丧','悲伤','难过','失落','愤怒','紧张','焦虑','低落'];
      const qPos = pos.filter(w => query.includes(w)).length;
      const qNeg = neg.filter(w => query.includes(w)).length;
      if (qPos === 0 && qNeg === 0) return 0;
      const qV = (qPos - qNeg) / (qPos + qNeg);
      return Math.max(0, 1 - Math.abs(qV - mem.nineD.Z_emotion.vector.valence));
    }
    case 'W_who': {
      const names = ['我','她','他','张总','妻子','孩子','朋友','同事','领导','老板'];
      const q = names.filter(n => query.includes(n));
      if (q.length === 0) return 0;
      return jaccard(q, mem.nineD.W_who.map(p => p.name));
    }
    case 'V_venue': {
      const map: Record<string, string> = {
        '咖啡厅':'coffee_shop','咖啡馆':'coffee_shop','会议':'conference_room',
        '办公室':'office','海滩':'beach','沙滩':'beach','图书馆':'library',
        '家':'home','餐厅':'restaurant','车间':'workshop','生产部':'workshop',
      };
      for (const [kw, type] of Object.entries(map)) {
        if (query.includes(kw) && mem.nineD.V_venue.type === type) return 1;
      }
      return 0;
    }
    case 'R_relation': {
      const map: Record<string, string> = {
        '约会':'romantic_date','会议':'business_meeting','家庭':'family_gathering',
        '独处':'solitude','聊天':'friendly_chat','对话':'chat',
      };
      for (const [kw, type] of Object.entries(map)) {
        if (query.includes(kw) && mem.nineD.R_relation.interactionType === type) return 1;
      }
      return 0;
    }
    case 'M_depth':
      return mem.nineD.M_depth.importance;
    case 'G_goods': {
      const obj = ['萨克斯','吉他','篝火','咖啡','书','月光','海浪','木门'];
      const qObj = obj.filter(k => query.includes(k));
      if (qObj.length === 0) return 0;
      return jaccard(qObj, mem.nineD.G_goods.map(g => g.name));
    }
    case 'S_senses': {
      const sk = ['听到','音乐','声音','闻到','味道','香气','温暖','触碰','苦','甜'];
      const qS = sk.filter(k => query.includes(k));
      if (qS.length === 0) return 0;
      const s = mem.nineD.S_senses;
      let hits = 0;
      for (const k of qS) {
        if (s.auditory.includes(k) || s.olfactory.includes(k) || s.tactile.includes(k) || s.taste.includes(k)) hits++;
      }
      return hits / qS.length;
    }
    default: return 0;
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}
