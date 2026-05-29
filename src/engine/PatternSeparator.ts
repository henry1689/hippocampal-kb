/**
 * Pattern Separation — simulates dentate gyrus function.
 * Maps similar input embeddings to very different sparse codes.
 */

export class PatternSeparator {
  private projectionTriplets: { row: number; col: number; value: number }[] = [];
  private inputDim = 384;
  private outputDim = 2048;
  private sparsityK = 100;
  private initialized = false;

  constructor(inputDim = 384, outputDim = 2048, sparsityRatio = 0.05) {
    this.inputDim = inputDim;
    this.outputDim = outputDim;
    this.sparsityK = Math.max(1, Math.floor(outputDim * sparsityRatio));
  }

  initialize(): void {
    if (this.initialized) return;
    const rng = this.seededRng(42);
    const scale = Math.sqrt(2.0 / (this.inputDim + this.outputDim));
    for (let row = 0; row < this.outputDim; row++) {
      // Each output neuron connects to ~10% of inputs
      for (let col = 0; col < this.inputDim; col++) {
        if (rng() < 0.1) {
          this.projectionTriplets.push({
            row, col,
            value: (rng() * 2 - 1) * scale,
          });
        }
      }
    }
    this.initialized = true;
  }

  separate(inputEmbedding: number[]): Float32Array {
    if (!this.initialized) this.initialize();
    const output = new Float32Array(this.outputDim);
    for (const t of this.projectionTriplets) {
      output[t.row] += inputEmbedding[t.col] * t.value;
    }
    // ReLU
    for (let i = 0; i < this.outputDim; i++) {
      if (output[i] < 0) output[i] = 0;
    }
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < this.outputDim; i++) norm += output[i] * output[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < this.outputDim; i++) output[i] /= norm;
    // Top-K sparsity
    const indexed = Array.from({ length: this.outputDim }, (_, i) => i);
    const partialSort = (arr: number[], k: number) => {
      const copy = arr.slice(0, k);
      copy.sort((a, b) => output[b] - output[a]);
      for (let i = k; i < arr.length; i++) {
        if (output[arr[i]] > output[copy[k - 1]]) {
          copy[k - 1] = arr[i];
          copy.sort((a, b) => output[b] - output[a]);
        }
      }
      return copy;
    };
    const topIndices = partialSort(indexed, this.sparsityK);
    const result = new Float32Array(this.outputDim);
    for (const idx of topIndices) result[idx] = output[idx];
    return result;
  }

  similarity(a: Float32Array, b: Float32Array): number {
    let inter = 0, union = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] > 0 || b[i] > 0) union++;
      if (a[i] > 0 && b[i] > 0) inter++;
    }
    return union === 0 ? 0 : inter / union;
  }

  private seededRng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
}

export const patternSeparator = new PatternSeparator();
