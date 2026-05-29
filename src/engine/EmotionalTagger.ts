import { tagEmotion } from '../constants/emotions';
import type { EmotionVector } from '../types';

export class EmotionalTagger {
  tag(text: string) {
    return tagEmotion(text);
  }

  nearestPrototype(valence: number, arousal: number): string {
    const { tagEmotion } = require('../constants/emotions');
    return tagEmotion('').primaryEmotion; // fallback
  }

  distance(a: EmotionVector, b: EmotionVector): number {
    return Math.sqrt((a.valence - b.valence) ** 2 + (a.arousal - b.arousal) ** 2);
  }
}

export const emotionalTagger = new EmotionalTagger();
