/**
 * Rule-based Chinese text parser that extracts 9D cues from user queries.
 */

import type { NineDVector } from '../types';
import { emotionalTagger } from './EmotionalTagger';

const STOP_WORDS = new Set(['的','了','在','是','有','我','他','她','它','们','这','那','和','就','也','都','要','把','被','让','给','对','从','到','说','看','听','去','来','不','没','很','太','更','还','又','再','已','经','能','会','可','以','上','下','里','外','前','后','左','右','个','种','些','点']);

const SEASON_MAP: Record<string, string> = { '春':'春','春天':'春','春季':'春','夏':'夏','夏天':'夏','夏季':'夏','秋':'秋','秋天':'秋','秋季':'秋','冬':'冬','冬天':'冬','冬季':'冬' };
const DAYNIGHT_MAP: Record<string, string> = { '清晨':'清晨','早晨':'清晨','早上':'上午','上午':'上午','中午':'中午','下午':'下午','傍晚':'傍晚','晚上':'夜晚','夜晚':'夜晚','深夜':'夜晚','半夜':'夜晚' };
const VENUE_MAP: Record<string, string> = { '咖啡厅':'coffee_shop','咖啡馆':'coffee_shop','会议室':'conference_room','办公室':'office','海滩':'beach','沙滩':'beach','图书馆':'library','书店':'library','家':'home','家里':'home','餐厅':'restaurant','酒吧':'bar','公园':'park','教室':'classroom' };
const LIGHTING_MAP: Record<string, string> = { '昏黄':'dim','昏暗':'dim','黑暗':'dim','明亮':'bright','阳光':'natural','自然光':'natural','灯光':'fluorescent','日光灯':'fluorescent' };
const ATMOSPHERE_MAP: Record<string, string> = { '浪漫':'romantic','温馨':'intimate','紧张':'tense','压抑':'tense','欢乐':'joyful','愉快':'joyful','平静':'peaceful','安静':'peaceful','热闹':'lively','喧嚣':'lively','伤感':'sad' };
const RELATION_MAP: Record<string, string> = { '约会':'romantic_date','见面':'romantic_date','会议':'business_meeting','开会':'business_meeting','家庭':'family_gathering','家人':'family_gathering','聚会':'communal_gathering','独处':'solitude','聊天':'friendly_chat','谈话':'mentor_conversation' };
const PERSON_IDENTITY: Record<string, string> = { '我':'self','自己':'self','女朋友':'romantic_interest','男朋友':'romantic_interest','女友':'romantic_interest','男友':'romantic_interest','妻子':'spouse','老公':'spouse','老婆':'spouse','孩子':'child','儿子':'child','女儿':'child','老板':'boss','领导':'superior','张总':'boss','同事':'colleague','朋友':'friend','陌生人':'stranger','妈妈':'family','爸爸':'family' };

export class NineDEncoder {
  encode(text: string): Partial<NineDVector> {
    const result: Partial<NineDVector> = {};
    result.X_semantic = this.extractKeywords(text);
    result.Y_time = this.extractTime(text);
    result.V_venue = this.extractVenue(text);
    result.W_who = this.extractPeople(text);
    result.R_relation = this.extractRelation(text);
    result.G_goods = this.extractObjects(text);
    result.S_senses = this.extractSenses(text);
    return result;
  }

  private extractKeywords(text: string): { keywords: string[]; topics: string[] } {
    const chars = [...text];
    const words: string[] = [];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (/[一-鿿]/.test(c)) words.push(c);
    }
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      const bg = words[i] + words[i + 1];
      if (bg.length === 2) bigrams.push(bg);
    }
    const filtered = bigrams.filter(w => !STOP_WORDS.has(w));
    const unique = [...new Set(filtered)].slice(0, 20);
    const topics = [...new Set(unique.slice(0, 4))];
    return { keywords: unique, topics };
  }

  private extractTime(text: string): Partial<NineDVector['Y_time']> {
    const result: Partial<NineDVector['Y_time']> = {};
    for (const [key, val] of Object.entries(SEASON_MAP)) {
      if (text.includes(key)) { result.season = val; break; }
    }
    for (const [key, val] of Object.entries(DAYNIGHT_MAP)) {
      if (text.includes(key)) { result.dayNight = val; break; }
    }
    if (text.includes('夜') || text.includes('晚')) result.dayNight ??= '夜晚';
    return result;
  }

  private extractVenue(text: string): Partial<NineDVector['V_venue']> {
    const result: Partial<NineDVector['V_venue']> = {};
    for (const [key, val] of Object.entries(VENUE_MAP)) {
      if (text.includes(key)) { result.type = val; break; }
    }
    for (const [key, val] of Object.entries(LIGHTING_MAP)) {
      if (text.includes(key)) { result.lighting = val; break; }
    }
    for (const [key, val] of Object.entries(ATMOSPHERE_MAP)) {
      if (text.includes(key)) { result.atmosphere = val; break; }
    }
    if (text.includes('室内') || text.includes('屋里')) result.environment = 'indoor';
    if (text.includes('室外') || text.includes('户外')) result.environment = 'outdoor';
    return result;
  }

  private extractPeople(text: string): any[] {
    const people: any[] = [];
    for (const [key, val] of Object.entries(PERSON_IDENTITY)) {
      if (text.includes(key)) {
        people.push({ name: key, identity: val, gender: '未知', relationship: val === 'self' ? 'self' : 'acquaintance', role: 'participant' });
      }
    }
    if (text.includes('4人') || text.includes('四个人')) {
      for (let i = 0; i < 4; i++) people.push({ name: `人${i+1}`, identity: 'participant', gender: '未知', relationship: 'acquaintance', role: 'speaker' });
    }
    if (people.length === 0 && text.includes('人')) {
      people.push({ name: '某人', identity: 'participant', gender: '未知', relationship: 'acquaintance', role: 'speaker' });
    }
    return people;
  }

  private extractRelation(text: string): Partial<NineDVector['R_relation']> {
    const result: Partial<NineDVector['R_relation']> = {};
    for (const [key, val] of Object.entries(RELATION_MAP)) {
      if (text.includes(key)) { result.interactionType = val; break; }
    }
    if (text.includes('亲密') || text.includes('牵手') || text.includes('拥抱')) result.intimacyLevel = 0.8;
    if (text.includes('老板') || text.includes('领导') || text.includes('张总')) result.socialDynamics = 'hierarchical';
    return result;
  }

  private extractObjects(text: string): any[] {
    const objects: any[] = [];
    const patterns: [RegExp, string, string][] = [
      [/咖啡/g, 'coffee', '饮品'], [/萨克斯/g, 'music', '乐器'], [/吉他/g, 'music', '乐器'],
      [/书/g, 'book', '读物'], [/篝火/g, 'fire', '火光'], [/月光/g, 'nature', '自然'],
      [/海浪/g, 'nature', '自然'], [/桌子/g, 'furniture', '家具'], [/椅子/g, 'furniture', '家具'],
      [/手机/g, 'electronics', '电子'], [/电脑/g, 'electronics', '电子'],
    ];
    for (const [re, cat, sig] of patterns) {
      re.lastIndex = 0;
      if (re.test(text)) objects.push({ name: re.source.replace(/[\/\\]/g,''), category: cat, significance: sig });
    }
    return objects.slice(0, 6);
  }

  private extractSenses(text: string): Partial<NineDVector['S_senses']> {
    const result: Partial<NineDVector['S_senses']> = {};
    if (/看到|看见|映入|灯光|颜色|金黄|橙红/.test(text)) result.visual = text.match(/[^。，；！？]{0,20}(看到|看见|映入|灯光|颜色|金黄|橙红)[^。，；！？]{0,20}/)?.[0] || '';
    if (/听到|听见|声音|音乐|萨克斯|雨声|海浪/.test(text)) result.auditory = text.match(/[^。，；！？]{0,20}(听到|听见|声音|音乐|萨克斯|雨声|海浪)[^。，；！？]{0,20}/)?.[0] || '';
    if (/闻到|香气|味道|海水|咖啡|香味/.test(text)) result.olfactory = text.match(/[^。，；！？]{0,20}(闻到|香气|味道|海水|咖啡|香味)[^。，；！？]{0,20}/)?.[0] || '';
    if (/触碰|温暖|冰凉|握|拍|拥抱|轻盈/.test(text)) result.tactile = text.match(/[^。，；！？]{0,20}(触碰|温暖|冰凉|握|拍|拥抱|轻盈)[^。，；！？]{0,20}/)?.[0] || '';
    if (/苦|甜|咸|咖啡味|棉花糖/.test(text)) result.taste = text.match(/[^。，；！？]{0,20}(苦|甜|咸|咖啡味|棉花糖)[^。，；！？]{0,20}/)?.[0] || '';
    return result;
  }

  /** Detect which dimensions the query emphasises, for boosting */
  detectDimensionBoosts(text: string): Partial<Record<keyof NineDVector, number>> {
    const boosts: Partial<Record<keyof NineDVector, number>> = {};

    const venueKeys = Object.keys(VENUE_MAP);
    if (venueKeys.some(k => text.includes(k))) boosts.V_venue = 2.0;

    const seasonKeys = Object.keys(SEASON_MAP);
    if (seasonKeys.some(k => text.includes(k))) boosts.Y_time = 1.5;
    if (text.includes('夜') || text.includes('晚') || text.includes('早') || text.includes('午')) boosts.Y_time = 1.5;

    const objectPatterns = ['萨克斯','吉他','篝火','咖啡','书'];
    if (objectPatterns.some(p => text.includes(p))) boosts.G_goods = 1.5;

    const sensePatterns = ['听到','听到','闻到','味道','音乐','声音','香气'];
    if (sensePatterns.some(p => text.includes(p))) boosts.S_senses = 1.5;

    const personKeys = Object.keys(PERSON_IDENTITY);
    if (personKeys.some(k => text.includes(k))) boosts.W_who = 2.0;

    if (text.includes('会议') || text.includes('质量') || text.includes('价格')) boosts.X_semantic = 2.0;
    if (text.includes('质量') || text.includes('紧张') || text.includes('最重要')) boosts.Z_emotion = 1.5;

    // Chinese literature/story references — search by tag/title matching
    if (text.includes('红楼') || text.includes('故事') || text.includes('小说') || text.includes('文章')) {
      boosts.X_semantic = 2.5;
    }

    return boosts;
  }
}

export const nineDEncoder = new NineDEncoder();
