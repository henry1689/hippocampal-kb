import type { DimensionMeta } from '../types';

export const DIMENSION_META: DimensionMeta[] = [
  { key: 'X_semantic', label: '语义维', shortLabel: '语义', description: '关键词与主题', color: '#4fc3f7', order: 0 },
  { key: 'Y_time',     label: '时间维', shortLabel: '时间', description: '时间与季节', color: '#ffb74d', order: 1 },
  { key: 'Z_emotion',  label: '情感维', shortLabel: '情感', description: '情绪与感受', color: '#ef5350', order: 2 },
  { key: 'W_who',      label: '人物维', shortLabel: '人物', description: '身份与角色', color: '#81c784', order: 3 },
  { key: 'V_venue',    label: '场景维', shortLabel: '场景', description: '环境与氛围', color: '#ce93d8', order: 4 },
  { key: 'R_relation', label: '关系维', shortLabel: '关系', description: '互动与亲密度', color: '#ffd54f', order: 5 },
  { key: 'M_depth',    label: '深刻维', shortLabel: '深刻', description: '重要性与权重', color: '#4db6ac', order: 6 },
  { key: 'G_goods',    label: '物件维', shortLabel: '物件', description: '物体与触发物', color: '#f06292', order: 7 },
  { key: 'S_senses',   label: '感官维', shortLabel: '感官', description: '五感细节', color: '#4dd0e1', order: 8 },
];

export const DIMENSION_MAP = new Map(DIMENSION_META.map(d => [d.key, d]));
