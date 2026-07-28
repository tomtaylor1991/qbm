import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  where,
  updateDoc,
  type Unsubscribe
} from "firebase/firestore";

import { db } from "../firebase/firebase";

export interface Player {
  id: string;
  name: string;
  xp: number;
  huntPoints: number;
  catches: number;
  beerRounds: number;
  spiritRounds: number;
  slotSpins: number;
  slotPointsSpent: number;
  slotPointsWon: number;
  slotJackpots: number;
  joinedAt: string;
  inventory: { itemId: string; quantity: number }[];
  present: boolean;
  pvpWins: number;
  pvpLosses: number;
  pvpPointsWon: number;
  pveWins: number;
  pveLosses: number;
  isGroom: boolean;
}

export type RoundType = "BEER" | "SPIRIT";

export interface SlotSpinResult {
  symbols: [number, number, number];
  payout: number;
  jackpot: boolean;
  balanceAfter: number;
}

const SLOT_COST = 10;

export async function addPlayer(roomId: string, name: string, startingPoints = 500): Promise<string> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("A játékos neve kötelező.");

  const safeStartingPoints = Math.max(0, Math.floor(Number(startingPoints) || 0));

  const playerReference = await addDoc(collection(db, "rooms", roomId, "players"), {
    name: normalizedName,
    xp: 0,
    huntPoints: safeStartingPoints,
    catches: 0,
    beerRounds: 0,
    spiritRounds: 0,
    slotSpins: 0,
    slotPointsSpent: 0,
    slotPointsWon: 0,
    slotJackpots: 0,
    inventory: [],
    present: true,
    pvpWins: 0,
    pvpLosses: 0,
    pvpPointsWon: 0,
    pveWins: 0,
    pveLosses: 0,
    joinedAt: new Date().toISOString()
  });

  return playerReference.id;
}


export async function ensureGroomPlayer(roomId: string, groomName: string): Promise<string> {
  const normalizedName = groomName.trim();
  if (!normalizedName) throw new Error("A vőlegény neve kötelező.");

  const matches = await getDocs(query(
    collection(db, "rooms", roomId, "players"),
    where("name", "==", normalizedName)
  ));

  if (matches.empty) {
    const playerId = await addPlayer(roomId, normalizedName, 0);
    await updateDoc(doc(db, "rooms", roomId, "players", playerId), { isGroom: true, archivedDuplicate: false, present: true });
    return playerId;
  }

  const ordered = [...matches.docs].sort((a, b) =>
    String(a.data().joinedAt ?? "").localeCompare(String(b.data().joinedAt ?? ""))
  );
  const canonical = ordered[0];
  await updateDoc(canonical.ref, { isGroom: true, archivedDuplicate: false, present: true });

  await Promise.all(ordered.slice(1).map((duplicate) =>
    updateDoc(duplicate.ref, { archivedDuplicate: true, present: false, isGroom: false })
  ));

  return canonical.id;
}

export function subscribePlayers(roomId: string, callback: (players: Player[]) => void): Unsubscribe {
  const playersQuery = query(
    collection(db, "rooms", roomId, "players"),
    orderBy("joinedAt", "asc")
  );

  return onSnapshot(playersQuery, (snapshot) => {
    callback(snapshot.docs.filter((playerDocument) => playerDocument.data().archivedDuplicate !== true).map((playerDocument) => {
      const data = playerDocument.data();
      return {
        id: playerDocument.id,
        name: String(data.name ?? ""),
        xp: Number(data.xp ?? 0),
        huntPoints: Number(data.huntPoints ?? 0),
        catches: Number(data.catches ?? 0),
        beerRounds: Number(data.beerRounds ?? 0),
        spiritRounds: Number(data.spiritRounds ?? 0),
        slotSpins: Number(data.slotSpins ?? 0),
        slotPointsSpent: Number(data.slotPointsSpent ?? 0),
        slotPointsWon: Number(data.slotPointsWon ?? 0),
        slotJackpots: Number(data.slotJackpots ?? 0),
        inventory: Array.isArray(data.inventory) ? data.inventory.map((entry: any) => ({ itemId: String(entry?.itemId ?? ""), quantity: Math.max(0, Number(entry?.quantity ?? 0)) })).filter((entry: { itemId: string; quantity: number }) => entry.itemId && entry.quantity > 0) : [],
        present: data.present !== false,
        pvpWins: Number(data.pvpWins ?? 0),
        pvpLosses: Number(data.pvpLosses ?? 0),
        pvpPointsWon: Number(data.pvpPointsWon ?? 0),
        pveWins: Number(data.pveWins ?? 0),
        pveLosses: Number(data.pveLosses ?? 0),
        isGroom: data.isGroom === true,
        joinedAt: String(data.joinedAt ?? "")
      } satisfies Player;
    }));
  });
}


export async function setPlayerPresence(roomId: string, playerId: string, present: boolean): Promise<void> {
  await updateDoc(doc(db, "rooms", roomId, "players", playerId), { present });
}

export async function addHuntPoints(roomId: string, playerId: string, points = 10): Promise<void> {
  const safePoints = Math.max(1, Math.floor(points));
  await updateDoc(doc(db, "rooms", roomId, "players", playerId), {
    huntPoints: increment(safePoints),
    catches: increment(1)
  });
}


export async function awardPlayerPoints(
  roomId: string,
  playerId: string,
  points: number
): Promise<void> {
  const safePoints = Math.max(1, Math.floor(points));
  await updateDoc(doc(db, "rooms", roomId, "players", playerId), {
    huntPoints: increment(safePoints)
  });
}

export async function registerRoundPurchase(
  roomId: string,
  playerId: string,
  roundType: RoundType
): Promise<void> {
  const counterField = roundType === "BEER" ? "beerRounds" : "spiritRounds";
  await updateDoc(doc(db, "rooms", roomId, "players", playerId), {
    huntPoints: increment(100),
    [counterField]: increment(1)
  });
}

function randomFrom(values: number[]): number {
  return values[Math.floor(Math.random() * values.length)];
}

function shuffleSymbols(symbols: [number, number, number]): [number, number, number] {
  const shuffled = [...symbols];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled as [number, number, number];
}

function createSlotResult(): Omit<SlotSpinResult, "balanceAfter"> {
  const roll = Math.random();

  // 45%: nincs nyeremény — három különböző szimbólum.
  if (roll < 0.45) {
    const available = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const first = randomFrom(available);
    const second = randomFrom(available.filter((symbol) => symbol !== first));
    const third = randomFrom(
      available.filter((symbol) => symbol !== first && symbol !== second)
    );
    return { symbols: shuffleSymbols([first, second, third]), payout: 0, jackpot: false };
  }

  // 32%: két azonos — a játékos visszakapja a 10 pontos tétet.
  if (roll < 0.77) {
    const pair = randomFrom([0, 1, 2, 3, 4, 5, 6, 7]);
    const different = randomFrom(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((symbol) => symbol !== pair)
    );
    return { symbols: shuffleSymbols([pair, pair, different]), payout: 10, jackpot: false };
  }

  // 17%: három gyakori szimbólum.
  if (roll < 0.94) {
    const symbol = randomFrom([0, 1, 2, 3, 4]);
    return { symbols: [symbol, symbol, symbol], payout: 30, jackpot: false };
  }

  // 5%: három ritka szimbólum.
  if (roll < 0.99) {
    const symbol = randomFrom([5, 6, 7]);
    return { symbols: [symbol, symbol, symbol], payout: 50, jackpot: false };
  }

  // 1%: jackpot.
  return { symbols: [8, 8, 8], payout: 100, jackpot: true };
}

export async function playSlotMachine(roomId: string, playerId: string): Promise<SlotSpinResult> {
  const { symbols, payout, jackpot } = createSlotResult();
  const playerReference = doc(db, "rooms", roomId, "players", playerId);

  const balanceAfter = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(playerReference);
    if (!snapshot.exists()) throw new Error("A játékos nem található.");

    const data = snapshot.data();
    const currentPoints = Number(data.huntPoints ?? 0);
    if (currentPoints < SLOT_COST) {
      throw new Error("Nincs elég pontod a pörgetéshez. A beugró 10 pont.");
    }

    // Vesztes pörgetésnél levonjuk a 10 pontos tétet.
    // Nyerésnél a tét automatikusan visszajár, és a kiírt nyeremény
    // nettó pluszként kerül az egyenleghez.
    const nextPoints = payout > 0
      ? currentPoints + payout
      : currentPoints - SLOT_COST;

    transaction.update(playerReference, {
      huntPoints: nextPoints,
      slotSpins: Number(data.slotSpins ?? 0) + 1,
      slotPointsSpent: Number(data.slotPointsSpent ?? 0) + SLOT_COST,
      slotPointsWon: Number(data.slotPointsWon ?? 0) + payout,
      slotJackpots: Number(data.slotJackpots ?? 0) + (jackpot ? 1 : 0)
    });

    return nextPoints;
  });

  return { symbols, payout, jackpot, balanceAfter };
}
