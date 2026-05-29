/**
 * Transformers.js embedding engine.
 * Runs all-MiniLM-L6-v2 in-browser for 384-dim text embeddings.
 * Falls back gracefully if model is unavailable.
 */

export class EmbeddingEngine {
  private pipeline: any = null;
  private ready = false;
  private loading = false;

  isReady(): boolean { return this.ready; }
  isLoading(): boolean { return this.loading; }

  async initialize(onProgress?: (pct: number) => void): Promise<void> {
    if (this.ready || this.loading) return;
    this.loading = true;
    try {
      const mod = await import('@xenova/transformers');
      this.pipeline = await mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (p: any) => {
          if (p.status === 'progress' && onProgress) onProgress(p.progress ?? 0);
        },
      });
      this.ready = true;
    } catch (e) {
      console.warn('Embedding model unavailable, using fallback:', e);
    } finally {
      this.loading = false;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.ready || !this.pipeline) return this.fallbackEmbed(text);
    try {
      const result = await this.pipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(result.data) as number[];
    } catch {
      return this.fallbackEmbed(text);
    }
  }

  private fallbackEmbed(text: string): number[] {
    const dims = 384;
    const arr = new Array(dims).fill(0);
    const chars = [...text];
    for (let i = 0; i < chars.length; i += 10) {
      const idx = Math.abs(chars[i].charCodeAt(0)) % dims;
      arr[idx] = (arr[idx] || 0) + 1;
    }
    let norm = 0;
    for (const v of arr) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dims; i++) arr[i] /= norm;
    return arr;
  }
}

export const embeddingEngine = new EmbeddingEngine();
