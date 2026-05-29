/**
 * SensoryOrchestrator — 感官编排器 (V5.1.1)
 *
 * 根据 15D 状态和主导人格，生成感官输出配置。
 * 第一版纯文字输出氛围标签，预留 IoT 硬件接口。
 *
 * 集成方式：
 *   import { orchestrate } from './sensory-orchestrator.js'
 *   const sensory = orchestrate(aiText, state15d, rhythmConfig);
 *   // sensory = { tts_config, ambient_tags, iot_commands }
 */

/**
 * 生成感官输出指令。
 *
 * @param {string} aiText - AI 回复文本（含节奏处理后的）
 * @param {object} state15d - 当前 15D 状态
 * @param {object} rhythmConfig - 节奏配置
 * @returns {{ tts_config: object, ambient_tags: string[], iot_commands: object[] }}
 */
export function orchestrate(aiText, state15d, rhythmConfig = {}) {
  const psycho = state15d?.psychosexual_profile || {};
  const social = state15d?.social_topology || {};
  const cognitive = state15d?.cognitive_executive || {};
  const neuro = state15d?.neuro_arousal || {};

  const intimacy = psycho.intimacy_craving || 50;
  const tension = social.relational_tension || 50;
  const load = cognitive.working_memory_load || 50;

  // 默认配置
  const config = {
    tts_config: {
      voice_id: 'elysium_partner_v1',
      pitch: 1.0,
      speed: 0.95,
      breathiness: 0.2,
      proximity_effect: false,
    },
    ambient_tags: [],
    iot_commands: [],
  };

  // 安全检测：公共场合禁用触觉
  const isSafe = !((neuro.circadian_energy || 50) > 70 &&
    state15d?.embodied_senses?.ambient_light_pref === 'bright_cool');

  // 优先级仲裁：partner > strategist > secretary
  if (intimacy > 70) {
    config.tts_config.voice_id = 'elysium_partner_v1';
    config.tts_config.breathiness = 0.6;
    config.tts_config.proximity_effect = true;
    config.tts_config.speed = 0.85;
    config.ambient_tags = ['warm', 'intimate', 'dim_light'];
    if (isSafe) {
      config.iot_commands.push({
        type: 'light',
        device: 'bedroom',
        action: 'set_color',
        payload: { hex: '#FF8C00', brightness: 20 },
        duration: 300,
        fade_out: 60,
      });
    }
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

  // 节奏影响 TTS 速度
  if (rhythmConfig.typing_speed === 'slow') {
    config.tts_config.speed *= 0.9;
  } else if (rhythmConfig.typing_speed === 'fast') {
    config.tts_config.speed *= 1.15;
  }

  return config;
}
