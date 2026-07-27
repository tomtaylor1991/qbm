import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe
} from "firebase/firestore";

import { db } from "../firebase/firebase";

import { questCatalog } from "../data/quests/questCatalog";

import type {
  ActiveQuestRoomField,
  CompletionMode,
  NewQuest,
  Quest,
  QuestType
} from "../types/game";

export type {
  ActiveQuestRoomField,
  CompletionMode,
  NewQuest,
  Quest,
  QuestType
} from "../types/game";

function getFallbackImageUrl(
  seed: string
): string {
  return `https://picsum.photos/seed/${encodeURIComponent(
    `qbm-${seed}`
  )}/900/600`;
}

function createRandomFallbackImageUrl(): string {
  return getFallbackImageUrl(
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
}

function getRoomFieldForQuestType(
  questType: QuestType
): ActiveQuestRoomField | null {
  if (questType === "NORMAL") {
    return "activeNormalQuestId";
  }

  if (questType === "ENVELOPE") {
    return "activeEnvelopeQuestId";
  }

  if (questType === "PUNISHMENT") {
    return "activePunishmentQuestId";
  }

  return null;
}

function buildRoomCompletionUpdate(
  questType: QuestType,
  newXp: number,
  victoryReached: boolean,
  consumeDoubleXp: boolean
): Record<string, unknown> {
  const roomUpdate: Record<
    string,
    unknown
  > = {
    currentXp: newXp,
    victoryReached,
    status: "ACTIVE"
  };

  const activeQuestField =
    getRoomFieldForQuestType(
      questType
    );

  if (activeQuestField) {
    roomUpdate[activeQuestField] =
      null;
  }

  if (consumeDoubleXp) {
    roomUpdate.doubleXpActive =
      false;

    roomUpdate.doubleXpActivatedBy =
      null;

    roomUpdate.doubleXpActivatedAt =
      null;
  }

  return roomUpdate;
}

function calculateAwardedPoints(
  basePoints: number,
  doubleXpActive: boolean
): number {
  return doubleXpActive
    ? basePoints * 2
    : basePoints;
}

export async function seedDefaultQuests(
  roomId: string
): Promise<void> {
  const questsCollection = collection(
    db,
    "rooms",
    roomId,
    "quests"
  );

  const existingSnapshot =
    await getDocs(questsCollection);

  if (!existingSnapshot.empty) {
    return;
  }

  const batch = writeBatch(db);
  const creationTime = Date.now();

  questCatalog.forEach(
    (quest, index) => {
      const questReference = doc(
        questsCollection,
        quest.key
      );

      batch.set(questReference, {
        sourceKey: quest.key,

        title: quest.title,
        description:
          quest.description,
        points: quest.points,

        type: quest.type,
        completionMode:
          quest.completionMode,

        targetCount: quest.targetCount,
        maximumCount: quest.maximumCount,
        pointsPerCount: quest.pointsPerCount,
        timeBonusPercent: quest.timeBonusPercent,

        currentCount:
          ["COUNTER", "TIMED_SCORE"].includes(quest.completionMode)
            ? 0
            : null,

        durationSeconds:
          quest.durationSeconds,

        timerStartedAt: null,
        timerEndsAt: null,
        timerStartedBy: null,

        completed: false,
        completedBy: null,
        completedAt: null,
        awardedPoints: null,

        createdAt: new Date(
          creationTime + index
        ).toISOString(),

        fallbackImageUrl:
          getFallbackImageUrl(
            quest.fallbackImageSeed
          ),

        photoUrl: null
      });
    }
  );

  await batch.commit();
}

export async function addQuest(
  roomId: string,
  newQuest: NewQuest
): Promise<string> {
  const title =
    newQuest.title.trim();

  const description =
    newQuest.description.trim();

  const points = Math.round(
    Number(newQuest.points)
  );

  const completionMode =
    newQuest.completionMode ??
    "SIMPLE";

  if (!title) {
    throw new Error(
      "A feladat címe kötelező."
    );
  }

  if (
    !Number.isFinite(points) ||
    points <= 0
  ) {
    throw new Error(
      "A pontszám legyen pozitív egész szám."
    );
  }

  const targetCount =
    ["COUNTER", "TIMED_SCORE"].includes(completionMode)
      ? Math.max(
          1,
          Math.round(
            Number(
              newQuest.targetCount ?? 1
            )
          )
        )
      : null;

  const durationSeconds =
    ["TIMER", "TIMED_SCORE"].includes(completionMode)
      ? Math.max(
          1,
          Math.round(
            Number(
              newQuest.durationSeconds ??
                60
            )
          )
        )
      : null;

  const documentReference =
    await addDoc(
      collection(
        db,
        "rooms",
        roomId,
        "quests"
      ),
      {
        sourceKey: null,

        title,
        description,
        points,

        type:
          newQuest.type ?? "NORMAL",

        completionMode,

        targetCount,
        maximumCount: completionMode === "TIMED_SCORE" ? Math.max(targetCount ?? 1, Math.round(Number(newQuest.maximumCount ?? targetCount ?? 1))) : null,
        pointsPerCount: completionMode === "TIMED_SCORE" ? Math.max(1, Math.round(Number(newQuest.pointsPerCount ?? 1))) : null,
        timeBonusPercent: completionMode === "TIMED_SCORE" ? Math.max(0, Number(newQuest.timeBonusPercent ?? 30)) : null,

        currentCount:
          ["COUNTER", "TIMED_SCORE"].includes(completionMode)
            ? 0
            : null,

        durationSeconds,

        timerStartedAt: null,
        timerEndsAt: null,
        timerStartedBy: null,

        completed: false,
        completedBy: null,
        completedAt: null,
        awardedPoints: null,

        createdAt:
          new Date().toISOString(),

        fallbackImageUrl:
          createRandomFallbackImageUrl(),

        photoUrl: null
      }
    );

  return documentReference.id;
}

export function subscribeQuests(
  roomId: string,
  callback:
    (quests: Quest[]) => void,
  onError?:
    (error: Error) => void
): Unsubscribe {
  const questsQuery = query(
    collection(
      db,
      "rooms",
      roomId,
      "quests"
    ),
    orderBy("createdAt")
  );

  return onSnapshot(
    questsQuery,
    (snapshot) => {
      const quests =
        snapshot.docs.map(
          (
            documentSnapshot
          ): Quest => {
            const data =
              documentSnapshot.data();

            return {
              id:
                documentSnapshot.id,

              sourceKey:
                typeof data.sourceKey ===
                "string"
                  ? data.sourceKey
                  : null,

              title: String(
                data.title ?? ""
              ),

              description: String(
                data.description ?? ""
              ),

              points: Number(
                data.points ?? 0
              ),

              type:
                (data.type ??
                  "NORMAL") as QuestType,

              completionMode:
                (data.completionMode ??
                  "SIMPLE") as CompletionMode,

              targetCount:
                data.targetCount ===
                  null ||
                data.targetCount ===
                  undefined
                  ? null
                  : Number(
                      data.targetCount
                    ),

              maximumCount:
                data.maximumCount == null ? null : Number(data.maximumCount),

              pointsPerCount:
                data.pointsPerCount == null ? null : Number(data.pointsPerCount),

              timeBonusPercent:
                data.timeBonusPercent == null ? null : Number(data.timeBonusPercent),

              currentCount:
                data.currentCount ===
                  null ||
                data.currentCount ===
                  undefined
                  ? null
                  : Number(
                      data.currentCount
                    ),

              durationSeconds:
                data.durationSeconds ===
                  null ||
                data.durationSeconds ===
                  undefined
                  ? null
                  : Number(
                      data.durationSeconds
                    ),

              timerStartedAt:
                typeof data.timerStartedAt ===
                "string"
                  ? data.timerStartedAt
                  : null,

              timerEndsAt:
                typeof data.timerEndsAt ===
                "string"
                  ? data.timerEndsAt
                  : null,

              timerStartedBy:
                typeof data.timerStartedBy ===
                "string"
                  ? data.timerStartedBy
                  : null,

              completed: Boolean(
                data.completed
              ),

              completedBy:
                typeof data.completedBy ===
                "string"
                  ? data.completedBy
                  : null,

              completedAt:
                typeof data.completedAt ===
                "string"
                  ? data.completedAt
                  : null,

              awardedPoints:
                data.awardedPoints ===
                  null ||
                data.awardedPoints ===
                  undefined
                  ? null
                  : Number(
                      data.awardedPoints
                    ),

              createdAt: String(
                data.createdAt ?? ""
              ),

              fallbackImageUrl:
                String(
                  data.fallbackImageUrl ??
                    createRandomFallbackImageUrl()
                ),

              photoUrl:
                typeof data.photoUrl ===
                "string"
                  ? data.photoUrl
                  : null
            };
          }
        );

      callback(quests);
    },
    (error) => {
      console.error(
        "Quest subscription error:",
        error
      );

      onError?.(error);
    }
  );
}

async function finishQuestInTransaction(
  roomId: string,
  questId: string,
  playerName: string
): Promise<boolean> {
  const normalizedPlayerName =
    playerName.trim();

  if (!normalizedPlayerName) {
    throw new Error(
      "Előbb lépj be játékosként."
    );
  }

  const roomReference = doc(
    db,
    "rooms",
    roomId
  );

  const questReference = doc(
    db,
    "rooms",
    roomId,
    "quests",
    questId
  );

  const roomBefore = await getDoc(roomReference);
  const groomName = roomBefore.exists() ? String(roomBefore.data().groomName ?? "").trim() : "";
  const groomSnapshot = groomName
    ? await getDocs(query(collection(db, "rooms", roomId, "players"), where("name", "==", groomName)))
    : null;
  const groomReference = groomSnapshot?.docs[0]
    ? doc(db, "rooms", roomId, "players", groomSnapshot.docs[0].id)
    : null;

  return runTransaction(
    db,
    async (transaction) => {
      const roomSnapshot =
        await transaction.get(
          roomReference
        );

      const questSnapshot =
        await transaction.get(
          questReference
        );

      const groomPlayerSnapshot = groomReference
        ? await transaction.get(groomReference)
        : null;

      if (!roomSnapshot.exists()) {
        throw new Error(
          "A szoba már nem létezik."
        );
      }

      if (!questSnapshot.exists()) {
        throw new Error(
          "A feladat már nem létezik."
        );
      }

      const roomData =
        roomSnapshot.data();

      const questData =
        questSnapshot.data();

      if (
        questData.completed === true
      ) {
        return false;
      }

      const currentXp = Number(
        roomData.currentXp ?? 0
      );

      const targetXp = Number(
        roomData.targetXp ?? 500
      );

      const baseQuestPoints =
        Math.max(
          0,
          Number(
            questData.points ?? 0
          )
        );

      const doubleXpActive =
        roomData.doubleXpActive ===
        true;

      const awardedPoints =
        calculateAwardedPoints(
          baseQuestPoints,
          doubleXpActive
        );

      const questType =
        (questData.type ??
          "NORMAL") as QuestType;

      const newXp =
        currentXp + awardedPoints;

      const victoryReached =
        newXp >= targetXp;

      transaction.update(
        questReference,
        {
          completed: true,

          completedBy:
            normalizedPlayerName,

          completedAt:
            new Date().toISOString(),

          completedAtServer:
            serverTimestamp(),

          awardedPoints,

          timerStartedAt: null,
          timerEndsAt: null,
          timerStartedBy: null
        }
      );

      transaction.update(
        roomReference,
        buildRoomCompletionUpdate(
          questType,
          newXp,
          victoryReached,
          doubleXpActive
        )
      );

      if (groomReference && groomPlayerSnapshot?.exists() && awardedPoints > 0) {
        const groomData = groomPlayerSnapshot.data();
        transaction.update(groomReference, {
          xp: Number(groomData.xp ?? 0) + awardedPoints,
          huntPoints: Number(groomData.huntPoints ?? 0) + awardedPoints * 2
        });
      }

      return true;
    }
  );
}

export async function completeQuest(
  roomId: string,
  questId: string,
  playerName: string
): Promise<boolean> {
  return finishQuestInTransaction(roomId, questId, playerName);
}

export async function incrementQuestCounter(
  roomId: string,
  questId: string,
  playerName: string
): Promise<{
  completed: boolean;
  currentCount: number;
  targetCount: number;
}> {
  const normalizedPlayerName =
    playerName.trim();

  if (!normalizedPlayerName) {
    throw new Error(
      "Előbb lépj be játékosként."
    );
  }

  const roomReference = doc(
    db,
    "rooms",
    roomId
  );

  const questReference = doc(
    db,
    "rooms",
    roomId,
    "quests",
    questId
  );

  return runTransaction(
    db,
    async (transaction) => {
      const roomSnapshot =
        await transaction.get(
          roomReference
        );

      const questSnapshot =
        await transaction.get(
          questReference
        );

      if (!roomSnapshot.exists()) {
        throw new Error(
          "A szoba már nem létezik."
        );
      }

      if (!questSnapshot.exists()) {
        throw new Error(
          "A feladat már nem létezik."
        );
      }

      const roomData =
        roomSnapshot.data();

      const questData =
        questSnapshot.data();

      const completionMode =
        (questData.completionMode ??
          "SIMPLE") as CompletionMode;

      if (
        completionMode !== "COUNTER"
      ) {
        throw new Error(
          "Ez nem számlálós feladat."
        );
      }

      const targetCount =
        Math.max(
          1,
          Number(
            questData.targetCount ??
              1
          )
        );

      if (
        questData.completed === true
      ) {
        return {
          completed: true,
          currentCount:
            targetCount,
          targetCount
        };
      }

      const oldCount =
        Math.max(
          0,
          Number(
            questData.currentCount ??
              0
          )
        );

      const newCount =
        Math.min(
          targetCount,
          oldCount + 1
        );

      const completed =
        newCount >= targetCount;

      if (!completed) {
        transaction.update(
          questReference,
          {
            currentCount: newCount
          }
        );

        return {
          completed: false,
          currentCount: newCount,
          targetCount
        };
      }

      const currentXp = Number(
        roomData.currentXp ?? 0
      );

      const targetXp = Number(
        roomData.targetXp ?? 500
      );

      const baseQuestPoints =
        Math.max(
          0,
          Number(
            questData.points ?? 0
          )
        );

      const doubleXpActive =
        roomData.doubleXpActive ===
        true;

      const awardedPoints =
        calculateAwardedPoints(
          baseQuestPoints,
          doubleXpActive
        );

      const questType =
        (questData.type ??
          "NORMAL") as QuestType;

      const newXp =
        currentXp + awardedPoints;

      const victoryReached =
        newXp >= targetXp;

      transaction.update(
        questReference,
        {
          currentCount: newCount,

          completed: true,

          completedBy:
            normalizedPlayerName,

          completedAt:
            new Date().toISOString(),

          completedAtServer:
            serverTimestamp(),

          awardedPoints,

          timerStartedAt: null,
          timerEndsAt: null,
          timerStartedBy: null
        }
      );

      transaction.update(
        roomReference,
        buildRoomCompletionUpdate(
          questType,
          newXp,
          victoryReached,
          doubleXpActive
        )
      );

      return {
        completed: true,
        currentCount: newCount,
        targetCount
      };
    }
  );
}

export async function startTimedQuest(
  roomId: string,
  questId: string,
  playerName: string
): Promise<void> {
  const normalizedPlayerName =
    playerName.trim();

  if (!normalizedPlayerName) {
    throw new Error(
      "Előbb lépj be játékosként."
    );
  }

  const questReference = doc(
    db,
    "rooms",
    roomId,
    "quests",
    questId
  );

  await runTransaction(
    db,
    async (transaction) => {
      const questSnapshot =
        await transaction.get(
          questReference
        );

      if (!questSnapshot.exists()) {
        throw new Error(
          "A feladat már nem létezik."
        );
      }

      const questData =
        questSnapshot.data();

      if (
        questData.completed === true
      ) {
        throw new Error(
          "A feladat már teljesítve van."
        );
      }

      const completionMode =
        (questData.completionMode ??
          "SIMPLE") as CompletionMode;

      if (!["TIMER", "TIMED_SCORE"].includes(completionMode)) {
        throw new Error(
          "Ez nem időzítős feladat."
        );
      }

      const existingTimerEndsAt =
        questData.timerEndsAt;

      if (
        typeof existingTimerEndsAt ===
        "string"
      ) {
        const existingEndTime =
          new Date(
            existingTimerEndsAt
          ).getTime();

        if (
          Number.isFinite(
            existingEndTime
          ) &&
          existingEndTime >
            Date.now()
        ) {
          return;
        }
      }

      const durationSeconds =
        Math.max(
          1,
          Number(
            questData.durationSeconds ??
              60
          )
        );

      const now = Date.now();

      transaction.update(
        questReference,
        {
          timerStartedAt:
            new Date(now).toISOString(),

          timerEndsAt:
            new Date(
              now +
                durationSeconds *
                  1000
            ).toISOString(),

          timerStartedBy:
            normalizedPlayerName
        }
      );
    }
  );
}

export async function resetTimedQuest(
  roomId: string,
  questId: string
): Promise<void> {
  const questReference = doc(
    db,
    "rooms",
    roomId,
    "quests",
    questId
  );

  await runTransaction(
    db,
    async (transaction) => {
      const questSnapshot =
        await transaction.get(
          questReference
        );

      if (!questSnapshot.exists()) {
        throw new Error(
          "A feladat már nem létezik."
        );
      }

      if (
        questSnapshot.data()
          .completed === true
      ) {
        return;
      }

      transaction.update(
        questReference,
        {
          timerStartedAt: null,
          timerEndsAt: null,
          timerStartedBy: null
        }
      );
    }
  );
}

export async function changeTimedScoreCount(
  roomId: string,
  questId: string,
  delta: 1 | -1
): Promise<number> {
  const questReference = doc(db, "rooms", roomId, "quests", questId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(questReference);
    if (!snapshot.exists()) throw new Error("A feladat már nem létezik.");
    const data = snapshot.data();
    if ((data.completionMode ?? "SIMPLE") !== "TIMED_SCORE") throw new Error("Ez nem időzített pontgyűjtő feladat.");
    if (data.completed === true) return Number(data.currentCount ?? 0);
    const maximum = Math.max(1, Number(data.maximumCount ?? 1));
    const next = Math.min(maximum, Math.max(0, Number(data.currentCount ?? 0) + delta));
    transaction.update(questReference, { currentCount: next });
    return next;
  });
}

export async function finishTimedScoreQuest(
  roomId: string,
  questId: string,
  playerName: string
): Promise<{ completed: boolean; awardedPoints: number; bonusPoints: number }> {
  const roomReference = doc(db, "rooms", roomId);
  const questReference = doc(db, "rooms", roomId, "quests", questId);
  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, questSnapshot] = await Promise.all([transaction.get(roomReference), transaction.get(questReference)]);
    if (!roomSnapshot.exists() || !questSnapshot.exists()) throw new Error("A szoba vagy a feladat már nem létezik.");
    const room = roomSnapshot.data();
    const quest = questSnapshot.data();
    if (quest.completed === true) return { completed: false, awardedPoints: Number(quest.awardedPoints ?? 0), bonusPoints: 0 };
    if ((quest.completionMode ?? "") !== "TIMED_SCORE") throw new Error("Ez nem időzített pontgyűjtő feladat.");
    const count = Math.max(0, Number(quest.currentCount ?? 0));
    const target = Math.max(1, Number(quest.targetCount ?? 1));
    const perCount = Math.max(1, Number(quest.pointsPerCount ?? 1));
    const basePoints = count * perCount;
    const endsAt = typeof quest.timerEndsAt === "string" ? new Date(quest.timerEndsAt).getTime() : 0;
    const inTime = endsAt > Date.now();
    const bonusPercent = Math.max(0, Number(quest.timeBonusPercent ?? 30));
    const bonusPoints = count >= target && inTime ? Math.round(basePoints * bonusPercent / 100) : 0;
    const doubleXp = room.doubleXpActive === true;
    const awardedPoints = (basePoints + bonusPoints) * (doubleXp ? 2 : 1);
    const newXp = Number(room.currentXp ?? 0) + awardedPoints;
    transaction.update(questReference, { completed: true, completedBy: playerName.trim(), completedAt: new Date().toISOString(), completedAtServer: serverTimestamp(), awardedPoints, timerStartedAt: null, timerEndsAt: null, timerStartedBy: null });
    transaction.update(roomReference, buildRoomCompletionUpdate("NORMAL", newXp, newXp >= Number(room.targetXp ?? 500), doubleXp));
    return { completed: true, awardedPoints, bonusPoints };
  });
}

export async function drawRandomQuestByType(
  roomId: string,
  type: QuestType,
  roomField:
    ActiveQuestRoomField
): Promise<string> {
  if (type === "NORMAL") {
    throw new Error(
      "Normál feladat nem húzható ebből a pakliból."
    );
  }

  const roomReference = doc(
    db,
    "rooms",
    roomId
  );

  const candidatesQuery = query(
    collection(
      db,
      "rooms",
      roomId,
      "quests"
    ),
    where("type", "==", type),
    where(
      "completed",
      "==",
      false
    )
  );

  const candidatesSnapshot =
    await getDocs(
      candidatesQuery
    );

  const candidates =
    candidatesSnapshot.docs;

  if (candidates.length === 0) {
    throw new Error(
      type === "ENVELOPE"
        ? "Nincs több kihúzható borítékos feladat."
        : "Nincs több elérhető büntetés."
    );
  }

  return runTransaction(
    db,
    async (transaction) => {
      const roomSnapshot =
        await transaction.get(
          roomReference
        );

      if (!roomSnapshot.exists()) {
        throw new Error(
          "A szoba nem létezik."
        );
      }

      const currentlyActive =
        roomSnapshot.data()[
          roomField
        ];

      if (currentlyActive) {
        return String(
          currentlyActive
        );
      }

      const randomDocument =
        candidates[
          Math.floor(
            Math.random() *
              candidates.length
          )
        ];

      transaction.update(
        roomReference,
        {
          [roomField]:
            randomDocument.id
        }
      );

      return randomDocument.id;
    }
  );
}