export type QuestType =
  | "NORMAL"
  | "ENVELOPE"
  | "PUNISHMENT";

export type CompletionMode =
  | "SIMPLE"
  | "COUNTER"
  | "TIMER"
  | "TIMED_SCORE";

export type ActiveQuestRoomField =
  | "activeNormalQuestId"
  | "activeEnvelopeQuestId"
  | "activePunishmentQuestId";

export interface QuestSeed {
  key: string;
  title: string;
  description: string;
  points: number;
  type: QuestType;
  completionMode: CompletionMode;
  targetCount: number | null;
  maximumCount: number | null;
  pointsPerCount: number | null;
  timeBonusPercent: number | null;
  durationSeconds: number | null;
  fallbackImageSeed: string;
}

export interface Quest {
  id: string;
  sourceKey: string | null;
  title: string;
  description: string;
  points: number;
  type: QuestType;
  completionMode: CompletionMode;
  targetCount: number | null;
  maximumCount: number | null;
  pointsPerCount: number | null;
  timeBonusPercent: number | null;
  currentCount: number | null;
  durationSeconds: number | null;
  timerStartedAt: string | null;
  timerEndsAt: string | null;
  timerStartedBy: string | null;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  awardedPoints: number | null;
  createdAt: string;
  fallbackImageUrl: string;
  photoUrl: string | null;
}

export interface NewQuest {
  title: string;
  description: string;
  points: number;
  type?: QuestType;
  completionMode?: CompletionMode;
  targetCount?: number;
  maximumCount?: number;
  pointsPerCount?: number;
  timeBonusPercent?: number;
  durationSeconds?: number;
}
