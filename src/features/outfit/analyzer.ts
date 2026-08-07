import type { AnalyzeRequest, OutfitAnalysis } from "./domain";

export type AnalyzeInput = AnalyzeRequest & {
  image: Blob;
  signal?: AbortSignal;
};

export interface OutfitAnalyzer {
  analyze(input: AnalyzeInput): Promise<OutfitAnalysis>;
}
