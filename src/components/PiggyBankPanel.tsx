import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Player } from "../services/playerService";
import {
  addSharedExpense,
  deleteOwnSharedExpense,
  subscribeSharedExpenses,
  type SharedExpense
} from "../services/expenseService";

interface Props {
  roomId: string;
  activePlayer: Player;
  players: Player[];
}

interface Transfer { from: string; to: string; amount: number }

function money(value: number) {
  return `${Math.round(value).toLocaleString("hu-HU")} Ft`;
}

function calculateTransfers(players: Player[], expenses: SharedExpense[]) {
  const companions = players.filter(player => !player.isGroom).sort((a, b) => a.name.localeCompare(b.name, "hu"));
  if (!companions.length) return { total: 0, shares: new Map<string, number>(), paid: new Map<string, number>(), transfers: [] as Transfer[] };
  const paid = new Map(companions.map(player => [player.id, 0]));
  let total = 0;
  for (const expense of expenses) {
    total += expense.amount;
    if (paid.has(expense.payerId)) paid.set(expense.payerId, (paid.get(expense.payerId) ?? 0) + expense.amount);
  }
  const base = Math.floor(total / companions.length);
  let remainder = total - base * companions.length;
  const shares = new Map<string, number>();
  companions.forEach(player => {
    const extra = remainder > 0 ? 1 : 0;
    shares.set(player.id, base + extra);
    remainder -= extra;
  });
  const creditors = companions.map(player => ({ player, amount: (paid.get(player.id) ?? 0) - (shares.get(player.id) ?? 0) })).filter(x => x.amount > 0);
  const debtors = companions.map(player => ({ player, amount: (shares.get(player.id) ?? 0) - (paid.get(player.id) ?? 0) })).filter(x => x.amount > 0);
  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0) transfers.push({ from: debtors[di].player.name, to: creditors[ci].player.name, amount });
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount === 0) ci += 1;
    if (debtors[di].amount === 0) di += 1;
  }
  return { total, shares, paid, transfers };
}

export default function PiggyBankPanel({ roomId, activePlayer, players }: Props) {
  const [items, setItems] = useState<SharedExpense[]>([]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [showSettlement, setShowSettlement] = useState(false);

  useEffect(() => subscribeSharedExpenses(roomId, setItems), [roomId]);
  useEffect(() => { setShowSettlement(false); }, [items]);

  const companions = useMemo(() => players.filter(player => !player.isGroom), [players]);
  const totals = useMemo(() => calculateTransfers(companions, items), [companions, items]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await addSharedExpense(roomId, activePlayer.id, activePlayer.name, label, Number(amount), note);
      setLabel(""); setAmount(""); setNote(""); setMessage("✅ Költség felvéve.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Nem sikerült felvenni a költséget."); }
  }

  return <section className="piggy-panel" id="active-view-root">
    <div className="piggy-title"><div><h2>🐷 Persely</h2><p>A vőlegény része 0 Ft. Minden költség az összes kísérő között oszlik meg.</p></div><strong>{money(totals.total)}</strong></div>
    <form className="piggy-form" onSubmit={submit}>
      <label>Mit vettél?<input value={label} onChange={e => setLabel(e.target.value)} placeholder="pl. taxi, vacsora, belépő" maxLength={80} /></label>
      <label>Összeg (Ft)<input type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="12500" /></label>
      <label className="piggy-note">Megjegyzés (opcionális)<input value={note} onChange={e => setNote(e.target.value)} placeholder="pl. reptér → belváros" maxLength={120} /></label>
      <button type="submit">➕ Költség hozzáadása</button>
    </form>
    {message && <p className="piggy-message">{message}</p>}

    <div className="piggy-summary-grid">
      {companions.map(player => <div key={player.id} className="piggy-summary-card"><strong>{player.name}</strong><span>Fizetett: {money(totals.paid.get(player.id) ?? 0)}</span></div>)}
    </div>

    <div className="piggy-list">
      {items.length === 0 ? <p>Még nincs közös költség.</p> : items.map(item => <article key={item.id}>
        <div><strong>{item.label}</strong><span>{item.payerName} fizette · {item.createdAt ? new Date(item.createdAt).toLocaleString("hu-HU") : ""}</span>{item.note && <small>{item.note}</small>}</div>
        <b>{money(item.amount)}</b>
        {item.payerId === activePlayer.id && <button type="button" className="piggy-delete" onClick={async () => { if (!window.confirm(`Törlöd ezt a költséget?\n${item.label} · ${money(item.amount)}`)) return; try { await deleteOwnSharedExpense(roomId, item.id, activePlayer.id); } catch (error) { setMessage(error instanceof Error ? error.message : "Nem sikerült törölni."); } }}>🗑</button>}
      </article>)}
    </div>

    <button type="button" className="piggy-calc" disabled={!companions.length || !items.length} onClick={() => setShowSettlement(true)}>🧮 Nap végi elszámolás</button>
    {showSettlement && <div className="piggy-settlement">
      <h3>💸 Ki kinek fizet?</h3>
      <p>Teljes költés: <b>{money(totals.total)}</b> · {companions.length} kísérő között. Az 1 Ft-os kerekítési különbséget a rendszer determinisztikusan elosztja.</p>
      {totals.transfers.length === 0 ? <strong>✅ Mindenki pontosan egyenlegben van.</strong> : <ol>{totals.transfers.map((transfer, index) => <li key={`${transfer.from}-${transfer.to}-${index}`}><b>{transfer.from}</b> → <b>{transfer.to}</b>: <strong>{money(transfer.amount)}</strong></li>)}</ol>}
    </div>}
  </section>;
}
