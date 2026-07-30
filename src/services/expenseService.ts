import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "../firebase/firebase";

export interface SharedExpense {
  id: string;
  payerId: string;
  payerName: string;
  label: string;
  note: string;
  amount: number;
  createdAt: string;
}

export async function addSharedExpense(
  roomId: string,
  payerId: string,
  payerName: string,
  label: string,
  amount: number,
  note = ""
): Promise<void> {
  const cleanLabel = label.trim();
  const cleanAmount = Math.floor(Number(amount));
  if (!cleanLabel) throw new Error("Add meg, mire költöttél.");
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) throw new Error("Az összeg legyen legalább 1 Ft.");
  await addDoc(collection(db, "rooms", roomId, "sharedExpenses"), {
    payerId,
    payerName: payerName.trim(),
    label: cleanLabel,
    note: note.trim(),
    amount: cleanAmount,
    createdAt: new Date().toISOString()
  });
}

export function subscribeSharedExpenses(roomId: string, callback: (items: SharedExpense[]) => void): Unsubscribe {
  const q = query(collection(db, "rooms", roomId, "sharedExpenses"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snapshot => callback(snapshot.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      payerId: String(data.payerId ?? ""),
      payerName: String(data.payerName ?? ""),
      label: String(data.label ?? ""),
      note: String(data.note ?? ""),
      amount: Math.max(0, Math.floor(Number(data.amount ?? 0))),
      createdAt: String(data.createdAt ?? "")
    } satisfies SharedExpense;
  })));
}

export async function deleteOwnSharedExpense(roomId: string, expenseId: string, playerId: string): Promise<void> {
  const ref = doc(db, "rooms", roomId, "sharedExpenses", expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (String(snap.data().payerId ?? "") !== playerId) throw new Error("Csak a saját költségedet törölheted.");
  await deleteDoc(ref);
}
