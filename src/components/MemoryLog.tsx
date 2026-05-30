interface Token {
  text: string;
  dim: string;
  weight: number;
}

interface ChatMemory {
  id: string;
  title: string;
  text: string;
  userInput?: string;
  nineD?: any;
  tags?: string[];
  timestamp?: number;
  _narrative?: string;
  _ai_response?: string;
  _tokens?: Token[];
  _15d?: {
    engram_depth?: number;
    venue?: string;
    cues?: string[];
    persona_mode?: string;
  };
}

interface Props {
  memories: ChatMemory[];
  onSelect?: (id: string) => void;
}

export function MemoryLog({ memories, onSelect }: Props) {
  return (
    <div className="card" style={{
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      minHeight: 280, maxHeight: 480, height: 480,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>📝 词元拆分及线索分类存储日志</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: memories.length > 0 ? '#4caf50' : 'var(--accent-amber)',
            display: 'inline-block',
            animation: memories.length === 0 ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {memories.length > 0
              ? `${memories.length} / 300`
              : '监听中...'}
          </span>
        </div>
      </div>

      {memories.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', gap: 8, padding: 20,
        }}>
          <div style={{ fontSize: 32, opacity: 0.5 }}>🧠</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>记忆体系待命中</div>
          <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            在右侧聊天窗口发送消息<br />
            系统会记录你的输入并提取 15D 结构化记忆
          </div>
          <div style={{
            marginTop: 12, padding: '6px 14px', borderRadius: 12,
            background: 'rgba(255,213,79,0.1)', border: '1px solid rgba(255,213,79,0.2)',
            fontSize: 11, color: 'var(--accent-amber)',
          }}>
            每次对话 → 情绪分析 → 场景提取 → 记忆存储
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {memories.map(m => (
            <div
              key={m.id}
              className="memory-log-item"
              onClick={() => onSelect?.(m.id)}
            >
              <div className="memory-log-header">
                <span className="memory-log-title">{m.title || '未命名记忆'}</span>
                <span className="memory-log-emotion" style={{ background: getEmotionColor(m) }}>
                  {m.nineD?.Z_emotion?.primaryType || 'neutral'}
                </span>
              </div>
              {m.userInput && (
                <div style={{
                  fontSize: 12, color: 'var(--text-primary)', marginBottom: 4,
                  padding: '4px 8px', background: 'rgba(255,213,79,0.06)',
                  borderLeft: '2px solid rgba(255,213,79,0.3)', borderRadius: '0 4px 4px 0',
                  lineHeight: 1.5,
                }}>
                  💬 {m.userInput.length > 80 ? m.userInput.slice(0, 80) + '…' : m.userInput}
                </div>
              )}
              <div className="memory-log-meta">
                <span>{m.nineD?.V_venue?.type || '未知场景'}</span>
                <span>{timeAgo(m.timestamp || Date.now())}</span>
                {m.nineD?.Z_emotion?.vector && (
                  <span>
                    v={m.nineD.Z_emotion.vector.valence.toFixed(2)} a={m.nineD.Z_emotion.vector.arousal.toFixed(2)}
                  </span>
                )}
              </div>
              {m.nineD?.X_semantic?.keywords?.length > 0 && (
                <div className="memory-log-tags">
                  {m.nineD.X_semantic.keywords.slice(0, 8).map((k: string, i: number) => (
                    <span key={i} className="tag">{k}</span>
                  ))}
                </div>
              )}

              {/* ⭐ V5.1.1: 15D 叙事标记 */}
              {m._narrative && (
                <div style={{
                  marginTop: 6, padding: '6px 8px', borderRadius: 6,
                  background: 'rgba(156,39,176,0.06)', border: '1px solid rgba(156,39,176,0.15)',
                  fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 10, color: '#ce93d8', marginBottom: 2 }}>
                    📖 15D 叙事记忆
                  </div>
                  <div>{m._narrative.length > 120 ? m._narrative.slice(0, 120) + '…' : m._narrative}</div>
                </div>
              )}

              {/* ⭐ V5.1.1: 15D 维度标记 */}
              {m._15d && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  <DimensionBadge label="刻录" value={m._15d.engram_depth?.toFixed(0)} color="#ef5350" />
                  <DimensionBadge label="场景" value={m._15d.venue} color="#4fc3f7" />
                  <DimensionBadge label="人格" value={m._15d.persona_mode} color="#81c784" />
                  <DimensionBadge label="线索" value={m._15d.cues?.length} color="#ffa726" />
                </div>
              )}

              {/* ⭐ V5.1.1: 15D 词元流 — 按原文顺序排列，维度着色 */}
              {m._tokens && m._tokens.length > 0 && (
                <div style={{
                  marginTop: 6, padding: '6px 8px', borderRadius: 6,
                  background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: 11, lineHeight: 2,
                }}>
                  <div style={{ fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                    15D 词元化
                  </div>
                  {m._tokens.map((t, i) => (
                    <TokenSpan key={i} token={t} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{
        fontSize: 10, color: 'var(--text-muted)', textAlign: 'center',
        paddingTop: 8, borderTop: '1px solid var(--border-color)', marginTop: 8,
        display: 'flex', justifyContent: 'center', gap: 12,
      }}>
        <span>⚡ 短时记忆 · 最近 300 条</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span>🧠 长期记忆 · 15D 知识库</span>
      </div>
    </div>
  );
}

function getEmotionColor(m: ChatMemory): string {
  const v = m.nineD?.Z_emotion?.vector;
  if (!v) return 'rgba(255,255,255,0.15)';
  const h = ((v.valence + 1) * 120);
  return `hsla(${h}, 60%, 50%, 0.35)`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

/** 15D 维度标签徽章 */
function DimensionBadge({ label, value, color }: { label: string; value?: string | number; color: string }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <span style={{
      fontSize: 9, padding: '1px 6px', borderRadius: 6,
      background: `${color}20`, color, border: `1px solid ${color}35`,
    }}>
      {label}: {value}
    </span>
  );
}

const DIM_COLORS: Record<string, string> = {
  X_semantic: '#4fc3f7', Y_time: '#ffb74d', Z_emotion: '#ef5350',
  W_who: '#81c784', V_venue: '#ce93d8', R_relation: '#ffd54f',
  M_depth: '#4db6ac', G_goods: '#f06292', S_senses: '#4dd0e1',
  neuro_arousal: '#ef5350', psychosexual: '#ff7043',
  social_topology: '#81c784', cognitive_executive: '#4dd0e1',
  textual_style: '#a1887f', aesthetic: '#ab47bc',
};

function TokenSpan({ token }: { token: Token }) {
  const color = DIM_COLORS[token.dim] || '#fff';
  return (
    <span style={{
      fontSize: 11, lineHeight: 1.8,
      color: color,
      background: `${color}12`,
      borderRadius: 3,
      padding: '1px 3px',
      margin: '0 1px',
      cursor: 'default',
      whiteSpace: 'nowrap',
    }} title={`维度: ${token.dim} | 权重: ${(token.weight * 100).toFixed(0)}%`}>
      {token.text}
    </span>
  );
}

// ⚠️ 保留 TokenBadge 别名兼容旧引用
const TokenBadge = TokenSpan;
