export interface DemoScore {
  id: string;
  title: string;
  format: "alphatex";
  alphaTex: string;
  tempo: number;
  timeSignature: string;
  tuning: string[];
  bars: number;
}

export const DEMO_SCORE: DemoScore = Object.freeze({
  id: "phase-0-drop-d-riff",
  title: "Phase 0 Drop D Riff",
  format: "alphatex",
  tempo: 120,
  timeSignature: "4/4",
  tuning: ["D2", "A2", "D3", "G3", "B3", "E4"],
  bars: 2,
  alphaTex: String.raw`\title "Phase 0 Drop D Riff"
\tempo 120
\track "Electric Guitar"
\staff {score tabs}
\tuning (E4 B3 G3 D3 A2 D2)
.
:8 0.6{pm} 0.6{pm} 3.6 5.6 0.6{pm} 0.6{pm} 3.5 5.5 |
:8 (0.6 2.5) (0.6 2.5) 3.6 5.6 (0.6 2.5) (0.6 2.5) 3.5 5.5 |`
});

export function summarizeDemoScore(score: DemoScore = DEMO_SCORE): string {
  return `${score.title}: ${score.bars} bars, ${score.timeSignature}, ${score.tempo} BPM, ${score.tuning.join(" ")} tuning.`;
}
