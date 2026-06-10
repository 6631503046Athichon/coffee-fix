import { UserRole } from './user';

export enum CuppingSessionType {
  QC = "Standard QC",
  Competition = "Competition",
}

export interface CuppingSample {
  id: string;
  blindCode: string;
  greenBeanLotId?: string; // Optional for external samples
  submitterInfo: { name: string };
  originInfo: { farm: string };
  lotInfo: { process: string };
}

export interface JudgeScore {
  judgeId: string; // Corresponds to user ID
  judgeName: string;
  scores: { [attribute: string]: number };
  notes: string;
  totalScore: number;
}

export interface CuppingSession {
  id: string;
  name: string;
  date: string;
  type: CuppingSessionType;
  samples: CuppingSample[];
  judges: {
    id: string;
    name: string;
    role: UserRole.Cupper | UserRole.HeadJudge | UserRole.Processor;
  }[];
  scores: { [sampleId: string]: JudgeScore[] };
  status: "Setup" | "Scoring" | "Adjudication" | "Finalized";
  finalResults?: {
    [sampleId: string]: {
      avgScores: { [attribute: string]: number };
      totalScore: number;
      finalNotes: string;
      rank?: number;
    };
  };
}

// Updated for clarity to match SCA form structure
export const SCA_SENSORY_ATTRIBUTES = [
  "Fragrance/Aroma",
  "Flavor",
  "Aftertaste",
  "Acidity",
  "Body",
  "Balance",
  "Overall",
];

export const SCA_CUP_ATTRIBUTES = ["Uniformity", "Clean Cup", "Sweetness"];

// Maintained for backward compatibility with other components
export const SCA_ATTRIBUTES = [
  "Fragrance/Aroma",
  "Flavor",
  "Aftertaste",
  "Acidity",
  "Body",
  "Uniformity",
  "Balance",
  "Clean Cup",
  "Sweetness",
  "Overall",
];
