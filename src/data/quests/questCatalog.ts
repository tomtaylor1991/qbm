import normalQuestData from "./normal-quests.json";
import envelopeQuestData from "./envelope-quests.json";
import punishmentQuestData from "./punishment-quests.json";
import type { CompletionMode, QuestSeed, QuestType } from "../../types/game";

const questTypes: QuestType[] = ["NORMAL", "ENVELOPE", "PUNISHMENT"];
const modes: CompletionMode[] = ["SIMPLE", "COUNTER", "TIMER", "TIMED_SCORE"];

function positiveInteger(value: unknown, fallback: number | null = null): number | null {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function validateQuest(value: unknown, index: number, source: string): QuestSeed {
  if (!value || typeof value !== "object") throw new Error(`${source}[${index}]: hibás feladat.`);
  const q = value as Record<string, unknown>;
  const key = String(q.key ?? "").trim();
  const title = String(q.title ?? "").trim();
  const description = String(q.description ?? "").trim();
  const type = q.type as QuestType;
  const completionMode = q.completionMode as CompletionMode;
  const points = Number(q.points ?? 0);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new Error(`${source}[${index}]: hibás key.`);
  if (!title || !description) throw new Error(`${source}[${index}]: hiányzó cím vagy leírás.`);
  if (!questTypes.includes(type) || !modes.includes(completionMode)) throw new Error(`${source}[${index}]: hibás típus vagy mód.`);
  if (!Number.isInteger(points) || points < 0) throw new Error(`${source}[${index}]: a points nemnegatív egész legyen.`);

  const targetCount = ["COUNTER", "TIMED_SCORE"].includes(completionMode)
    ? positiveInteger(q.targetCount, 1)
    : null;
  const maximumCount = completionMode === "TIMED_SCORE"
    ? positiveInteger(q.maximumCount, targetCount)
    : null;
  const pointsPerCount = completionMode === "TIMED_SCORE"
    ? positiveInteger(q.pointsPerCount, 1)
    : null;
  const timeBonusPercent = completionMode === "TIMED_SCORE"
    ? Math.max(0, Number(q.timeBonusPercent ?? 30))
    : null;
  const durationSeconds = ["TIMER", "TIMED_SCORE"].includes(completionMode)
    ? positiveInteger(q.durationSeconds, 60)
    : null;

  return {
    key, title, description, points, type, completionMode,
    targetCount, maximumCount, pointsPerCount, timeBonusPercent,
    durationSeconds,
    fallbackImageSeed: String(q.fallbackImageSeed ?? key).trim() || key
  };
}

function validateCatalog(values: unknown, source: string): QuestSeed[] {
  if (!Array.isArray(values)) throw new Error(`${source}: a gyökérelem tömb legyen.`);
  return values.map((value, index) => validateQuest(value, index, source));
}

export const normalQuests = validateCatalog(normalQuestData, "normal-quests.json");
export const envelopeQuests = validateCatalog(envelopeQuestData, "envelope-quests.json");
export const punishmentQuests = validateCatalog(punishmentQuestData, "punishment-quests.json");
export const questCatalog = [...normalQuests, ...envelopeQuests, ...punishmentQuests];

const keys = questCatalog.map((quest) => quest.key);
if (new Set(keys).size !== keys.length) throw new Error("Duplikált quest key a katalógusban.");
