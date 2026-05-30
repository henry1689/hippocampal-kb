/**
 * 15D+ 全息状态观测窗 — 四矩阵分组展示
 *
 * 维度元数据与后端 elysium-15d.js 的 DIMENSION_META / NUMERIC_SUB_FIELDS 保持同步。
 * 后端导出统一元数据 → 前端自动适配，无需硬编码维度标签。
 *
 * V5.1.1 状态路径: matrix_* 四矩阵
 */

interface FifteenDViewerProps {
  state: any;
}

// 与 elysium-15d.js DIMENSION_META 同步
const DIMENSION_LABELS: Record<string, { label: string; color: string; matrix: string }> = {
  'matrix_A_body.neuro_arousal':        { label: '① 神经唤醒', color: '#ef5350', matrix: 'A' },
  'matrix_A_body.embodied_senses':      { label: '② 具身体感', color: '#f06292', matrix: 'A' },
  'matrix_A_body.psycho_sexual':        { label: '③ 性心理',   color: '#ff7043', matrix: 'A' },
  'matrix_B_psyche.attachment':         { label: '④ 依恋状态', color: '#ffa726', matrix: 'B' },
  'matrix_B_psyche.shadow_self':        { label: '⑤ 影子人格', color: '#ce93d8', matrix: 'B' },
  'matrix_B_psyche.aesthetic_resonance':{ label: '⑥ 审美共鸣', color: '#ab47bc', matrix: 'B' },
  'matrix_C_social.social_topology':    { label: '⑦ 社交拓扑', color: '#81c784', matrix: 'C' },
  'matrix_C_social.cognitive_executive':{ label: '⑧ 认知执行', color: '#4dd0e1', matrix: 'C' },
  'matrix_D_anchor.time_perception':    { label: '⑨ 时间感知', color: '#4fc3f7', matrix: 'D' },
  'matrix_D_anchor.semantic_intent':    { label: '⑩ 语义意图', color: '#7986cb', matrix: 'D' },
  'matrix_D_anchor.semantic_cues':      { label: '⑪ 场景锚点', color: '#9575cd', matrix: 'D' },
  'matrix_D_anchor.textual_style':      { label: '⑫ 文本风格', color: '#a1887f', matrix: 'D' },
};

// 与 elysium-15d.js NUMERIC_SUB_FIELDS 同步
const SUB_FIELDS: Record<string, string[]> = {
  'matrix_A_body.neuro_arousal':        ['hrv_stress_index', 'gsr_excitement', 'circadian_energy'],
  'matrix_A_body.psycho_sexual':        ['intimacy_craving'],
  'matrix_C_social.social_topology':    ['relational_tension'],
  'matrix_C_social.cognitive_executive':['working_memory_load'],
  'matrix_B_psyche.shadow_self':        ['moral_fatigue'],
  'matrix_D_anchor.semantic_intent':    ['ambiguity_score'],
  'matrix_D_anchor.semantic_cues':      ['interaction_weight'],
};

const MATRIX_INFO: Record<string, { label: string; color: string }> = {
  A: { label: '肉体与感官', color: '#ff7043' },
  B: { label: '灵魂与潜意识', color: '#ab47bc' },
  C: { label: '世俗与执行', color: '#4dd0e1' },
  D: { label: '时间·语义·锚点', color: '#7986cb' },
};

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

export function FifteenDViewer({ state }: FifteenDViewerProps) {
  if (!state) {
    return <div className="card" style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>等待 15D 数据...</div>;
  }

  const meta = state._meta || {};
  const version = state.version || meta.version || '5.1.1';

  // 按 Matrix 分组
  const grouped: Record<string, string[]> = { A: [], B: [], C: [], D: [] };
  for (const key of Object.keys(DIMENSION_LABELS)) {
    const m = DIMENSION_LABELS[key].matrix;
    if (grouped[m]) grouped[m].push(key);
  }

  return (
    <div className="card" style={{ padding: 12, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>🧠 15D+ 全息状态</div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          交互 #{meta.interaction_count || 0} | v{version}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {['A','B','C','D'].map(mk => {
          const dims = grouped[mk] || [];
          if (dims.length === 0) return null;
          const info = MATRIX_INFO[mk];
          return (
            <div key={mk}>
              <div style={{
                fontSize: 10, fontWeight: 700, marginBottom: 4,
                color: info.color, textTransform: 'uppercase', letterSpacing: 1,
              }}>
                Matrix {mk} — {info.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {dims.map(dimKey => {
                  const dimInfo = DIMENSION_LABELS[dimKey];
                  const dimData = getByPath(state, dimKey);
                  if (!dimData) return null;
                  return (
                    <div key={dimKey} style={{
                      padding: '4px 6px', borderRadius: 4,
                      background: `${dimInfo.color}12`,
                      border: `1px solid ${dimInfo.color}25`,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 10, marginBottom: 1, color: dimInfo.color }}>
                        {dimInfo.label}
                      </div>
                      <DimensionValue data={dimData} fields={SUB_FIELDS[dimKey]} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 关键指标柱状图 */}
      <div style={{ marginTop: 10, padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6, color: 'var(--text-secondary)' }}>关键指标快照</div>
        <BarRow label="①压力" value={getByPath(state, 'matrix_A_body.neuro_arousal.hrv_stress_index')} color="#ef5350" />
        <BarRow label="②兴奋" value={getByPath(state, 'matrix_A_body.neuro_arousal.gsr_excitement')} color="#f06292" />
        <BarRow label="③能量" value={getByPath(state, 'matrix_A_body.neuro_arousal.circadian_energy')} color="#4dd0e1" />
        <BarRow label="④亲密度" value={getByPath(state, 'matrix_A_body.psycho_sexual.intimacy_craving')} color="#ff7043" />
        <BarRow label="⑤道德疲劳" value={getByPath(state, 'matrix_B_psyche.shadow_self.moral_fatigue')} color="#ce93d8" />
        <BarRow label="⑥关系张力" value={getByPath(state, 'matrix_C_social.social_topology.relational_tension')} color="#81c784" />
        <BarRow label="⑦认知负荷" value={getByPath(state, 'matrix_C_social.cognitive_executive.working_memory_load')} color="#4dd0e1" />
        <BarRow label="⑧模糊度" value={getByPath(state, 'matrix_D_anchor.semantic_intent.ambiguity_score')} color="#7986cb" />
        <BarRow label="⑨交互权重" value={getByPath(state, 'matrix_D_anchor.semantic_cues.interaction_weight')} color="#26a69a" />
      </div>
    </div>
  );
}

function DimensionValue({ data, fields }: { data: any; fields?: string[] }) {
  if (!data) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>;
  if (fields) {
    return (
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {fields.map(f => {
          const val = data[f];
          if (val === undefined || val === null) return null;
          if (typeof val === 'boolean') return <span key={f}>{f}: {val ? '✅' : '❌'} </span>;
          if (typeof val === 'number') return <span key={f}>{f}: {val.toFixed(1)} </span>;
          return <span key={f}>{f}: {String(val).slice(0, 20)} </span>;
        })}
        {data.normalized_venue && <span>📍{data.normalized_venue} </span>}
        {data.hidden_cry_for_help && <span>🆘求救 </span>}
        {data.day_night && <span>🌙{data.day_night} </span>}
        {data.speech_era && <span>📖{data.speech_era} </span>}
      </div>
    );
  }
  return <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{JSON.stringify(data).slice(0, 60)}</span>;
}

function BarRow({ label, value, color }: { label: string; value?: number; color: string }) {
  if (value === undefined || value === null) return null;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, fontSize: 10 }}>
      <span style={{ width: 60, color: 'var(--text-muted)', textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `${color}60`, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ width: 30, color: 'var(--text-secondary)', textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}
