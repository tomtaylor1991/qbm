import { useState } from "react";
import { registerRoundPurchase, type Player, type RoundType } from "../services/playerService";

interface Props {
  roomId: string;
  players: Player[];
  activePlayer: Player | null;
}

export default function RoundCounterPanel({ roomId, players, activePlayer }: Props) {
  const [saving, setSaving] = useState<RoundType | null>(null);

  async function addRound(roundType: RoundType) {
    if (!activePlayer) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    const label = roundType === "BEER" ? "sörkört" : "töménykört";
    if (!window.confirm(`Biztosan vettél egy ${label} az egész társaságnak?\n\nJutalom: +100 pont`)) return;

    try {
      setSaving(roundType);
      await registerRoundPurchase(roomId, activePlayer.id, roundType);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nem sikerült rögzíteni a kört.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mini-game-panel">
      <h2>🍻 Italhősök</h2>
      <p>Csak az egész társaságnak vásárolt kör számít. Minden kör +100 személyes pont.</p>

      <div className="round-list">
        {players.map((player) => {
          const isActive = player.id === activePlayer?.id;
          return (
            <article className={`round-row${isActive ? " round-row--active" : ""}`} key={player.id}>
              <div className="round-player">
                <strong>👤 {player.name}</strong>
                <span>{player.huntPoints} pont</span>
              </div>
              <div className="round-counters">
                <span title="Sörkörök">🍺 <strong>{player.beerRounds}</strong></span>
                <span title="Töménykörök">🥃 <strong>{player.spiritRounds}</strong></span>
              </div>
              <div className="round-actions">
                <button type="button" disabled={!isActive || saving !== null} onClick={() => void addRound("BEER")}>🍺 +1</button>
                <button type="button" disabled={!isActive || saving !== null} onClick={() => void addRound("SPIRIT")}>🥃 +1</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
