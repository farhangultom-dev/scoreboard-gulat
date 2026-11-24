import { Corner, MatchEvent, MatchMetadata, VictoryType } from './match';

export interface MatchRecord {
  id: string; // ID unik rekaman (misal: "rec_1700000000_abc")
  savedAt: number; // Date.now()
  metadata: MatchMetadata;
  red: {
    name: string;
    countryOrTeam: string;
    score: number;
    cautions: number;
    passivityCount: number;
  };
  blue: {
    name: string;
    countryOrTeam: string;
    score: number;
    cautions: number;
    passivityCount: number;
  };
  winner: {
    corner: Corner;
    type: VictoryType;
  } | null;
  totalEvents: number;
  events: MatchEvent[];
}
