/** 流水线追踪面板：显示每次聊天的处理步骤 */

interface PipelineStep {
  step: string;
  data: any;
  timestamp: number;
}

interface PipelineTraceProps {
  pipeline: PipelineStep[];
  ambiguity?: any;
  weights?: any;
}

const STEP_LABELS: Record<string, string> = {
  '1_input': '1️⃣ 用户输入',
  '2_ambiguity': '2️⃣ 模糊检测',
  '3_memory_search': '3️⃣ 记忆检索',
  '4_persona_weights': '4️⃣ 人格权重',
  '5_prompt_built': '5️⃣ 提示词构建',
  '6_ai_reply': '6️⃣ AI 回复',
  '7_memory_stored': '7️⃣ 记忆存储',
};

const STEP_COLORS: Record<string, string> = {
  '1_input': '#4fc3f7',
  '2_ambiguity': '#ce93d8',
  '3_memory_search': '#81c784',
  '4_persona_weights': '#ffa726',
  '5_prompt_built': '#f06292',
  '6_ai_reply': '#4dd0e1',
  '7_memory_stored': '#ef5350',
};

export function PipelineTrace({ pipeline, ambiguity, weights }: PipelineTraceProps) {
  // 取最近一次完整流水线（7步）
  const recentPipeline: PipelineStep[] = [];
  const seen = new Set<string>();
  for (const p of pipeline) {
    if (!seen.has(p.step) && STEP_LABELS[p.step]) {
      recentPipeline.push(p);
      seen.add(p.step);
    }
  }
  recentPipeline.sort((a, b) => a.timestamp - b.timestamp);

  if (recentPipeline.length === 0 && !ambiguity && !weights) {
    return (
      <div className="card" style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
        发送一条消息查看处理流水线
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12, fontSize: 12 }}>
      <div className="section-title" style={{ margin: '0 0 10px 0' }}>⚙️ 处理流水线</div>

      {/* 当前模糊检测摘要 */}
      {ambiguity && (
        <div style={{
          padding: '8px 10px', marginBottom: 10, borderRadius: 8,
          background: ambiguity.ambiguity_score > 60
            ? 'rgba(255,152,0,0.1)'
            : 'rgba(76,175,80,0.1)',
          border: `1px solid ${ambiguity.ambiguity_score > 60 ? 'rgba(255,152,0,0.3)' : 'rgba(76,175,80,0.3)'}`,
        }}>
          <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
            模糊度: {ambiguity.ambiguity_score.toFixed(1)}/100
            {ambiguity.hidden_cry_for_help && <span style={{ color: '#ef5350', marginLeft: 8 }}>🆘 求救信号</span>}
          </div>
          {ambiguity.extracted_cues?.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              线索: {ambiguity.extracted_cues.join('、')}
            </div>
          )}
          {ambiguity.normalized_venue && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              场地: {ambiguity.normalized_venue}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
            代词:{ambiguity.pronounCount} 情绪词:{ambiguity.emotionCount} 抽象:{ambiguity.abstractCount} 具体:{ambiguity.concreteCount}
          </div>
        </div>
      )}

      {/* 人格权重 */}
      {weights && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 10, padding: '6px 10px',
          borderRadius: 8, background: 'rgba(255,255,255,0.03)',
        }}>
          {Object.entries(weights).map(([key, val]) => (
            <div key={key} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                {key === 'partner' ? '💗 伴侣' : key === 'strategist' ? '🗡️ 军师' : '📋 秘书'}
              </div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: key === 'partner' ? '#f06292' : key === 'strategist' ? '#81c784' : '#4dd0e1',
              }}>
                {(val as number * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 流水线步骤 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {recentPipeline.map((step, i) => (
          <StepCard key={step.step} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}

function StepCard({ step, index }: { step: PipelineStep; index: number }) {
  const color = STEP_COLORS[step.step] || 'var(--text-muted)';
  const label = STEP_LABELS[step.step] || step.step;

  return (
    <div style={{
      display: 'flex', gap: 8, padding: '5px 8px', borderRadius: 6,
      alignItems: 'flex-start',
      background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
    }}>
      <div style={{
        width: 4, height: '100%', minHeight: 24, borderRadius: 2,
        background: color, flexShrink: 0, marginTop: 2,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 10, color }}>{label}</div>
        <StepDataPreview data={step.data} />
      </div>
    </div>
  );
}

function StepDataPreview({ data }: { data: any }) {
  if (!data) return null;
  if (typeof data === 'string') {
    return <div style={{ fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{data.slice(0, 100)}</div>;
  }
  if (typeof data === 'object') {
    const lines: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (key === 'preview' && typeof val === 'string') {
        lines.push(`📝 ${val.slice(0, 60)}`);
      } else if (Array.isArray(val)) {
        lines.push(`${key}: [${val.join(', ').slice(0, 60)}]`);
      } else if (typeof val === 'object') {
        lines.push(`${key}: ${JSON.stringify(val).slice(0, 60)}`);
      } else {
        lines.push(`${key}: ${String(val).slice(0, 50)}`);
      }
    }
    return (
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    );
  }
  return <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{String(data).slice(0, 80)}</div>;
}
