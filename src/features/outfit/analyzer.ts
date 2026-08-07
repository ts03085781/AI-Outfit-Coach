import type { Occasion, OutfitAnalysis } from "./domain";

export type AnalyzeInput = {
  image: Blob;
  occasion: Occasion;
  signal?: AbortSignal;
};

export interface OutfitAnalyzer {
  analyze(input: AnalyzeInput): Promise<OutfitAnalysis>;
}
