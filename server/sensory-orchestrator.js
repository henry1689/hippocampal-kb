/**
 * SensoryOrchestrator — 感官编排器
 *
 * 根据 15D 状态和主导人格，生成感官输出配置。
 *
 * V5.1.1 状态路径: matrix_* 四矩阵
 */

import { processText } from './textual-embodiment.js';

function _v(obj, ...paths) {
  for (const p of paths) {
    const val = p.split('.').reduce((o, k) => o?.[k], obj);
    if (val !== undefined) return val;
  }
  return undefined;
}

export function orchestrate(aiText, state15d, rhythmConfig = null) {
  const intimacy = _v(state15d, 'matrix_A_body.psycho_sexual.intimacy_craving', 'psychosexual_profile.intimacy_craving') ?? 50;
  const tension  = _v(state15d, 'matrix_C_social.social_topology.relational_tension', 'social_topology.relational_tension') ?? 50;
  const load     = _v(state15d, 'matrix_C_social.cognitive_executive.working_memory_load', 'cognitive_executive.working_memory_load') ?? 50;
  const energy   = _v(state15d, 'matrix_A_body.neuro_arousal.circadian_energy', 'neuro_arousal.circadian_energy') ?? 50;
  const lightPref = _v(state15d, 'matrix_A_body.embodied_senses.ambient_light_pref', 'embodied_senses.ambient_light_pref') ?? 'warm_dim';

  if (!rhythmConfig) {
    const embodied = processText(aiText, state15d);
    rhythmConfig = embodied.rhythm_config;
  }

  const config = {
    tts_config: { voice_id: 'elysium_partner_v1', pitch: 1.0, speed: 0.95, breathiness: 0.2, proximity_effect: false },
    ambient_tags: [],
    iot_commands: [],
  };

  const isSafe = !(energy > 70 && lightPref === 'bright_cool');

  if (intimacy > 70) {
    config.tts_config.voice_id = 'elysium_partner_v1';
    config.tts_config.breathiness = 0.6;
    config.tts_config.proximity_effect = true;
    config.tts_config.speed = 0.85;
    config.ambient_tags = ['warm', 'intimate', 'dim_light'];
    if (isSafe) config.iot_commands.push({ type: 'light', device: 'bedroom', action: 'set_color', payload: { hex: '#FF8C00', brightness: 20 }, duration: 300, fade_out: 60 });
  } else if (tension > 60) {
    config.tts_config.voice_id = 'elysium_strategist_v1';
    config.tts_config.breathiness = 0.1;
    config.tts_config.pitch = 0.9;
    config.tts_config.speed = 1.05;
    config.ambient_tags = ['analytical', 'cool', 'bright'];
  } else if (load > 70) {
    config.tts_config.voice_id = 'elysium_secretary_v1';
    config.tts_config.speed = 1.1;
    config.tts_config.breathiness = 0.15;
    config.ambient_tags = ['efficient', 'calm'];
  }

  if (rhythmConfig.typing_speed === 'slow') config.tts_config.speed *= 0.9;
  else if (rhythmConfig.typing_speed === 'fast') config.tts_config.speed *= 1.15;

  return config;
}
