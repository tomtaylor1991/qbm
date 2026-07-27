import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type Unsubscribe
} from "firebase/firestore";

import { db } from "../firebase/firebase";

export type JokerType =
  | "DELEGATE"
  | "COOP"
  | "REDRAW"
  | "DOUBLE_XP"
  | "SHIELD"
  | "REVERSE";

export interface Joker {
  id: string;
  type: JokerType;
  title: string;
  description: string;
  icon: string;
  remainingUses: number;
  initialUses: number;
  createdAt: string;
}

interface DefaultJoker {
  type: JokerType;
  title: string;
  description: string;
  icon: string;
  uses: number;
}

const defaultJokers: DefaultJoker[] = [
  {
    type: "DELEGATE",
    title: "Delegálás",
    description:
      "A vőlegény helyett egy kiválasztott kísérő teljesítheti a feladatot.",
    icon: "🫵",
    uses: 2
  },
  {
    type: "COOP",
    title: "Co-op mód",
    description:
      "Egy kísérő közvetlenül segíthet a vőlegénynek a feladat teljesítésében.",
    icon: "🤝",
    uses: 2
  },
  {
    type: "REDRAW",
    title: "Újrahúzás",
    description:
      "Az aktuális borítékos feladat eldobható, és helyette új húzható.",
    icon: "🔄",
    uses: 1
  },
  {
    type: "DOUBLE_XP",
    title: "Double XP",
    description:
      "A következő sikeresen teljesített feladat kétszeres XP-t ér.",
    icon: "✨",
    uses: 1
  },
  {
    type: "SHIELD",
    title: "Büntetéspajzs",
    description:
      "Az aktuális büntetés teljesítés nélkül semlegesíthető.",
    icon: "🛡️",
    uses: 1
  },
  {
    type: "REVERSE",
    title: "Reverse Card",
    description:
      "A feladatot a társaság által kiválasztott kísérő kapja meg.",
    icon: "🔁",
    uses: 1
  }
];

export async function seedDefaultJokers(
  roomId: string
): Promise<void> {
  const jokersCollection = collection(
    db,
    "rooms",
    roomId,
    "jokers"
  );

  const existingSnapshot =
    await getDocs(jokersCollection);

  if (!existingSnapshot.empty) {
    return;
  }

  const batch = writeBatch(db);
  const creationTime = Date.now();

  defaultJokers.forEach((joker, index) => {
    const jokerReference = doc(jokersCollection);

    batch.set(jokerReference, {
      type: joker.type,
      title: joker.title,
      description: joker.description,
      icon: joker.icon,
      remainingUses: joker.uses,
      initialUses: joker.uses,
      createdAt: new Date(
        creationTime + index
      ).toISOString()
    });
  });

  await batch.commit();
}

export function subscribeJokers(
  roomId: string,
  callback: (jokers: Joker[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const jokersQuery = query(
    collection(
      db,
      "rooms",
      roomId,
      "jokers"
    ),
    orderBy("createdAt")
  );

  return onSnapshot(
    jokersQuery,
    (snapshot) => {
      const jokers = snapshot.docs.map(
        (documentSnapshot) => {
          const data = documentSnapshot.data();

          return {
            id: documentSnapshot.id,
            type: data.type as JokerType,
            title: String(data.title ?? ""),
            description: String(
              data.description ?? ""
            ),
            icon: String(data.icon ?? "🃏"),
            remainingUses: Number(
              data.remainingUses ?? 0
            ),
            initialUses: Number(
              data.initialUses ?? 0
            ),
            createdAt: String(
              data.createdAt ?? ""
            )
          };
        }
      );

      callback(jokers);
    },
    (error) => {
      console.error(
        "Joker subscription error:",
        error
      );

      onError?.(error);
    }
  );
}

export async function consumeJoker(
  roomId: string,
  jokerId: string
): Promise<number> {
  const jokerReference = doc(
    db,
    "rooms",
    roomId,
    "jokers",
    jokerId
  );

  return runTransaction(
    db,
    async (transaction) => {
      const jokerSnapshot =
        await transaction.get(jokerReference);

      if (!jokerSnapshot.exists()) {
        throw new Error(
          "A joker már nem létezik."
        );
      }

      const remainingUses = Number(
        jokerSnapshot.data().remainingUses ?? 0
      );

      if (remainingUses <= 0) {
        throw new Error(
          "Ez a joker már elfogyott."
        );
      }

      const newRemainingUses =
        remainingUses - 1;

      transaction.update(jokerReference, {
        remainingUses: newRemainingUses
      });

      return newRemainingUses;
    }
  );
}

export async function activateDoubleXp(
  roomId: string,
  jokerId: string,
  playerName: string
): Promise<void> {
  const roomReference = doc(
    db,
    "rooms",
    roomId
  );

  const jokerReference = doc(
    db,
    "rooms",
    roomId,
    "jokers",
    jokerId
  );

  await runTransaction(
    db,
    async (transaction) => {
      const roomSnapshot =
        await transaction.get(roomReference);

      const jokerSnapshot =
        await transaction.get(jokerReference);

      if (!roomSnapshot.exists()) {
        throw new Error(
          "A szoba nem létezik."
        );
      }

      if (!jokerSnapshot.exists()) {
        throw new Error(
          "A joker nem létezik."
        );
      }

      const roomData = roomSnapshot.data();
      const jokerData = jokerSnapshot.data();

      if (
        jokerData.type !== "DOUBLE_XP"
      ) {
        throw new Error(
          "Ez nem Double XP joker."
        );
      }

      const remainingUses = Number(
        jokerData.remainingUses ?? 0
      );

      if (remainingUses <= 0) {
        throw new Error(
          "A Double XP joker elfogyott."
        );
      }

      if (roomData.doubleXpActive === true) {
        throw new Error(
          "Már aktív egy Double XP bónusz."
        );
      }

      transaction.update(jokerReference, {
        remainingUses: remainingUses - 1
      });

      transaction.update(roomReference, {
        doubleXpActive: true,
        doubleXpActivatedBy:
          playerName.trim() || "Ismeretlen",
        doubleXpActivatedAt:
          new Date().toISOString()
      });
    }
  );
}

export async function useShield(
  roomId: string,
  jokerId: string
): Promise<void> {
  const roomReference = doc(
    db,
    "rooms",
    roomId
  );

  const jokerReference = doc(
    db,
    "rooms",
    roomId,
    "jokers",
    jokerId
  );

  await runTransaction(
    db,
    async (transaction) => {
      const roomSnapshot =
        await transaction.get(roomReference);

      const jokerSnapshot =
        await transaction.get(jokerReference);

      if (!roomSnapshot.exists()) {
        throw new Error(
          "A szoba nem létezik."
        );
      }

      if (!jokerSnapshot.exists()) {
        throw new Error(
          "A joker nem létezik."
        );
      }

      const roomData = roomSnapshot.data();
      const jokerData = jokerSnapshot.data();

      if (jokerData.type !== "SHIELD") {
        throw new Error(
          "Ez nem büntetéspajzs."
        );
      }

      if (!roomData.activePunishmentQuestId) {
        throw new Error(
          "Nincs aktív büntetés."
        );
      }

      const remainingUses = Number(
        jokerData.remainingUses ?? 0
      );

      if (remainingUses <= 0) {
        throw new Error(
          "A büntetéspajzs elfogyott."
        );
      }

      transaction.update(jokerReference, {
        remainingUses: remainingUses - 1
      });

      transaction.update(roomReference, {
        activePunishmentQuestId: null
      });
    }
  );
}

export async function useEnvelopeRedraw(
  roomId: string,
  jokerId: string
): Promise<string> {
  const roomReference = doc(
    db,
    "rooms",
    roomId
  );

  const jokerReference = doc(
    db,
    "rooms",
    roomId,
    "jokers",
    jokerId
  );

  const envelopeSnapshot = await getDocs(
    collection(
      db,
      "rooms",
      roomId,
      "quests"
    )
  );

  const roomSnapshotBefore =
    await getDocs(
      query(
        collection(db, "rooms")
      )
    );

  void roomSnapshotBefore;

  return runTransaction(
    db,
    async (transaction) => {
      const roomSnapshot =
        await transaction.get(roomReference);

      const jokerSnapshot =
        await transaction.get(jokerReference);

      if (!roomSnapshot.exists()) {
        throw new Error(
          "A szoba nem létezik."
        );
      }

      if (!jokerSnapshot.exists()) {
        throw new Error(
          "A joker nem létezik."
        );
      }

      const roomData = roomSnapshot.data();
      const jokerData = jokerSnapshot.data();

      if (jokerData.type !== "REDRAW") {
        throw new Error(
          "Ez nem újrahúzás joker."
        );
      }

      const currentEnvelopeId =
        roomData.activeEnvelopeQuestId;

      if (!currentEnvelopeId) {
        throw new Error(
          "Nincs aktív boríték."
        );
      }

      const candidates =
        envelopeSnapshot.docs.filter(
          (documentSnapshot) => {
            const data =
              documentSnapshot.data();

            return (
              data.type === "ENVELOPE" &&
              data.completed !== true &&
              documentSnapshot.id !==
                currentEnvelopeId
            );
          }
        );

      if (candidates.length === 0) {
        throw new Error(
          "Nincs másik elérhető borítékos feladat."
        );
      }

      const remainingUses = Number(
        jokerData.remainingUses ?? 0
      );

      if (remainingUses <= 0) {
        throw new Error(
          "Az újrahúzás joker elfogyott."
        );
      }

      const newEnvelope =
        candidates[
          Math.floor(
            Math.random() *
              candidates.length
          )
        ];

      transaction.update(jokerReference, {
        remainingUses: remainingUses - 1
      });

      transaction.update(roomReference, {
        activeEnvelopeQuestId:
          newEnvelope.id
      });

      return newEnvelope.id;
    }
  );
}