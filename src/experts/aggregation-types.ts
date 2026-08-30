export interface ExpertPredictionRow {
  source_key: string;
  source_type: string | null;
  base_weight: number | null;

  confidence: number | null;
  source_rank: number | null;

  is_favorite: number | boolean;
  is_banko: number | boolean;
  is_strong: number | boolean;
  is_star: number | boolean;

  is_rival: number | boolean;
  is_surprise: number | boolean;
  is_avoid: number | boolean;
}

export interface ExpertConsensus {
  sourceCount: number;

  bankoCount: number;
  favoriteCount: number;
  strongCount: number;
  starCount: number;
  rivalCount: number;
  surpriseCount: number;
  avoidCount: number;

  weightedBanko: number;
  weightedFavorite: number;
  weightedStrong: number;
  weightedStar: number;
  weightedRival: number;
  weightedSurprise: number;
  weightedAvoid: number;

  weightedSupport: number;
  weightedOpposition: number;

  expertScore: number;
  supportConfidence: number;

  labels: string[];
  summary: string;
}
