import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  where,
  type Unsubscribe
} from "firebase/firestore";

import { db } from "../firebase/firebase";

import {
  drawRandomQuestByType,
  seedDefaultQuests
} from "./questService";

import {
  seedDefaultJokers
} from "./jokerService";

export interface Room {
  id: string;
  roomCode: string;
  name: string;
  groomName: string;

  currentXp: number;
  targetXp: number;

  status:
    | "WAITING"
    | "ACTIVE"
    | "FINISHED";

  victoryReached: boolean;

  pervyCount: number;
  pervyThreshold: number;

  activeNormalQuestId:
    | string
    | null;

  activeEnvelopeQuestId:
    | string
    | null;

  activePunishmentQuestId:
    | string
    | null;

  doubleXpActive: boolean;

  doubleXpActivatedBy:
    | string
    | null;

  doubleXpActivatedAt:
    | string
    | null;

  createdAt: string;
}

function generateRoomCode(): string {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from(
    { length: 6 },
    () => {
      const index = Math.floor(
        Math.random() *
          characters.length
      );

      return characters[index];
    }
  ).join("");
}

async function generateUniqueRoomCode(): Promise<string> {
  for (
    let attempt = 0;
    attempt < 10;
    attempt += 1
  ) {
    const roomCode =
      generateRoomCode();

    const roomQuery = query(
      collection(db, "rooms"),
      where(
        "roomCode",
        "==",
        roomCode
      ),
      limit(1)
    );

    const snapshot =
      await getDocs(roomQuery);

    if (snapshot.empty) {
      return roomCode;
    }
  }

  throw new Error(
    "Nem sikerült egyedi szobakódot generálni."
  );
}

function mapRoom(
  id: string,
  data: Record<string, unknown>
): Room {
  return {
    id,

    roomCode: String(
      data.roomCode ?? ""
    ),

    name: String(
      data.name ??
        "Legénybúcsú RPG"
    ),

    groomName: String(
      data.groomName ?? "Vőlegény"
    ),

    currentXp: Number(
      data.currentXp ?? 0
    ),

    targetXp: Number(
      data.targetXp ?? 500
    ),

    status:
      (data.status ??
        "ACTIVE") as Room["status"],

    victoryReached: Boolean(
      data.victoryReached
    ),

    pervyCount: Number(
      data.pervyCount ?? 0
    ),

    pervyThreshold: Number(
      data.pervyThreshold ?? 3
    ),

    activeNormalQuestId:
      typeof data.activeNormalQuestId ===
      "string"
        ? data.activeNormalQuestId
        : null,

    activeEnvelopeQuestId:
      typeof data.activeEnvelopeQuestId ===
      "string"
        ? data.activeEnvelopeQuestId
        : null,

    activePunishmentQuestId:
      typeof data.activePunishmentQuestId ===
      "string"
        ? data.activePunishmentQuestId
        : null,

    doubleXpActive: Boolean(
      data.doubleXpActive
    ),

    doubleXpActivatedBy:
      typeof data.doubleXpActivatedBy ===
      "string"
        ? data.doubleXpActivatedBy
        : null,

    doubleXpActivatedAt:
      typeof data.doubleXpActivatedAt ===
      "string"
        ? data.doubleXpActivatedAt
        : null,

    createdAt: String(
      data.createdAt ?? ""
    )
  };
}

export async function createRoom(
  name = "Legénybúcsú RPG",
  groomName = "Vőlegény",
  targetXp = 500
): Promise<Room> {
  const roomCode =
    await generateUniqueRoomCode();

  const roomData = {
    roomCode,
    name,
    groomName: groomName.trim() || "Vőlegény",

    currentXp: 0,
    targetXp: Math.min(5000, Math.max(100, Math.round(targetXp))),

    status: "ACTIVE" as const,
    victoryReached: false,

    pervyCount: 0,
    pervyThreshold: 3,

    activeNormalQuestId: null,
    activeEnvelopeQuestId: null,
    activePunishmentQuestId: null,

    doubleXpActive: false,
    doubleXpActivatedBy: null,
    doubleXpActivatedAt: null,

    createdAt:
      new Date().toISOString()
  };

  const documentReference =
    await addDoc(
      collection(db, "rooms"),
      roomData
    );

  await Promise.all([
    seedDefaultQuests(
      documentReference.id
    ),
    seedDefaultJokers(
      documentReference.id
    )
  ]);

  return {
    id: documentReference.id,
    ...roomData
  };
}

export async function findRoomByCode(
  roomCode: string
): Promise<Room | null> {
  const normalizedCode =
    roomCode
      .trim()
      .toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const roomQuery = query(
    collection(db, "rooms"),
    where(
      "roomCode",
      "==",
      normalizedCode
    ),
    limit(1)
  );

  const snapshot =
    await getDocs(roomQuery);

  if (snapshot.empty) {
    return null;
  }

  const roomDocument =
    snapshot.docs[0];

  return mapRoom(
    roomDocument.id,
    roomDocument.data()
  );
}

export function subscribeRoom(
  roomId: string,
  callback:
    (room: Room | null) => void,
  onError?:
    (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "rooms", roomId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(
        mapRoom(
          snapshot.id,
          snapshot.data()
        )
      );
    },
    (error) => {
      console.error(
        "Room subscription error:",
        error
      );

      onError?.(error);
    }
  );
}


export async function setActiveNormalQuest(
  roomId: string,
  questId: string | null
): Promise<void> {
  const roomReference = doc(db, "rooms", roomId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomReference);
    if (!snapshot.exists()) throw new Error("A szoba már nem létezik.");
    transaction.update(roomReference, { activeNormalQuestId: questId });
  });
}

export async function drawEnvelope(
  roomId: string
): Promise<string> {
  return drawRandomQuestByType(
    roomId,
    "ENVELOPE",
    "activeEnvelopeQuestId"
  );
}

export async function registerPervyComment(
  roomId: string
): Promise<{
  count: number;
  threshold: number;
  punishmentTriggered: boolean;
}> {
  const roomReference = doc(
    db,
    "rooms",
    roomId
  );

  const result =
    await runTransaction(
      db,
      async (transaction) => {
        const roomSnapshot =
          await transaction.get(
            roomReference
          );

        if (
          !roomSnapshot.exists()
        ) {
          throw new Error(
            "A szoba nem létezik."
          );
        }

        const data =
          roomSnapshot.data();

        if (
          data.activePunishmentQuestId
        ) {
          throw new Error(
            "Már van aktív büntetés."
          );
        }

        const oldCount = Number(
          data.pervyCount ?? 0
        );

        const threshold =
          Math.max(
            1,
            Number(
              data.pervyThreshold ??
                3
            )
          );

        const newCount =
          oldCount + 1;

        const punishmentTriggered =
          newCount >= threshold;

        transaction.update(
          roomReference,
          {
            pervyCount:
              punishmentTriggered
                ? 0
                : newCount
          }
        );

        return {
          count:
            punishmentTriggered
              ? 0
              : newCount,

          threshold,
          punishmentTriggered
        };
      }
    );

  if (
    result.punishmentTriggered
  ) {
    await drawRandomQuestByType(
      roomId,
      "PUNISHMENT",
      "activePunishmentQuestId"
    );
  }

  return result;
}