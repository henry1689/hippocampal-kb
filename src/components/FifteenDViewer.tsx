/** 15D 状态观测窗 */
interface FifteenDViewerProps {
  state: any;
}

const DIMENSION_LABELS: Record<string, { label: string; color: string }> = {
  neuro_arousal: { label: '神经唤醒', color: '#ef5350' },
  embodied_senses: { label: '具身体感', color: '#f06292' },
  psychosexual_profile: { label: '性心理', color: '#ff7043' },
  attachment_state: { label: '依恋状态', color: '#ffa726' },
  shadow_self: { label: '影子人格', color: '#ce93d8' },
  social_topology: { label: '社交拓扑', color: '#81c784' },
  cognitive_executive: { label: '认知执行', color: '#4dd0e1' },
  time_perception: { label: '时间感知', color: '#4fc3f7' },
  semantic_intent: { label: '语义意图', color: '#7986cb' },
  semantic_cues: { label: '语义线索', color: '#9575cd' },
  textual_style: { label: '文本风格', color: '#a1887f' },
};

const SUB_FIELDS: Record<string, string[]> = {
  neuro_arousal: ['hrv_stress_index', 'gsr_excitement', 'circadian_energy'],
  psychosexual_profile: ['intimacy_craving'],
  social_topology: ['relational_tension'],
  cognitive_executive: ['working_memory_load'],
  shadow_self: ['moral_fatigue'],
  semantic_intent: ['ambiguity_score'],
};

export function FifteenDViewer({ state }: FifteenDViewerProps) {
  if (!state) return <div className="card" style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>等待 15D 数据...</div>;

  const meta = state._meta || {};

  return (
    <div className="card" style={{ padding: 12, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>🧠 15D 全息状态</div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          交互 #{meta.interaction_count || 0} | v{meta.version || '?'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {Object.entries(DIMENSION_LABELS).map(([key, info]) => {
          const dimData = state[key];
          if (!dimData) return null;
          return (
            <div key={key} style={{
              padding: '6px 8px', borderRadius: 6,
              background: `${info.color}12`,
              border: `1px solid ${info.color}25`,
            }}>
              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 2, color: info.color }}>
                {info.label}
              </div>
              <DimensionValue data={dimData} fields={SUB_FIELDS[key]} />
            </div>
          );
        })}
      </div>

      {/* 15D 柱状图概览 */}
      <div style={{ marginTop: 10, padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6, color: 'var(--text-secondary)' }}>关键指标快照</div>
        <BarRow label="压力" value={state.neuro_arousal?.hrv_stress_index} color="#ef5350" />
        <BarRow label="兴奋" value={state.neuro_arousal?.gsr_excitement} color="#f06292" />
        <BarRow label="能量" value={state.neuro_arousal?.circadian_energy} color="#4dd0e1" />
        <BarRow label="亲密度渴望" value={state.psychosexual_profile?.intimacy_craving} color="#ff7043" />
        <BarRow label="关系张力" value={state.social_topology?.relational_tension} color="#81c784" />
        <BarRow label="模糊度" value={state.semantic_intent?.ambiguity_score} color="#ce93d8" />
        <BarRow label="交互权重" value={state.semantic_cues?.interaction_weight} color="#ffa726" />
        <BarRow label="道德疲劳" value={state.shadow_self?.moral_fatigue} color="#9575cd" />
        <BarRow label="认知负荷" value={state.cognitive_executive?.working_memory_load} color="#4fc3f7" />
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
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `${color}60`, transition: 'width 0.3s' }} />
      </div>
      <span style={{ width: 30, color: 'var(--text-secondary)', textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}
