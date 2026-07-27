import { useState } from "react";
import { awardPlayerPoints, type Player } from "../services/playerService";

interface Props {
  roomId: string;
  players: Player[];
}

const SURVIVOR_REWARD = 10;

export default function SurvivorDraw({ roomId, players }: Props) {
  const [task, setTask] = useState("Ki hoz vizet a vőlegénynek?");
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [winner, setWinner] = useState<Player | null>(null);
  const [running, setRunning] = useState(false);
  const [rewardMessage, setRewardMessage] = useState("");

  const eligiblePlayers = players.filter((player) => !player.isGroom);

  function startDraw() {
    if (eligiblePlayers.length < 2) {
      alert("A sorsoláshoz legalább két kísérő szükséges.");
      return;
    }

    const selected = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    const losers = eligiblePlayers.filter((player) => player.id !== selected.id);
    const shuffled = [...losers].sort(() => Math.random() - 0.5);

    setEliminated([]);
    setWinner(null);
    setRewardMessage("");
    setRunning(true);

    shuffled.forEach((player, index) => {
      window.setTimeout(() => {
        setEliminated((current) => [...current, player.id]);
      }, 550 * (index + 1));
    });

    window.setTimeout(() => {
      setWinner(selected);
      void awardPlayerPoints(roomId, selected.id, SURVIVOR_REWARD)
        .then(() => {
          setRewardMessage(`+${SURVIVOR_REWARD} pont jóváírva`);
        })
        .catch((error: unknown) => {
          setRewardMessage(
            error instanceof Error
              ? `A pont jóváírása sikertelen: ${error.message}`
              : "A pont jóváírása sikertelen."
          );
        })
        .finally(() => {
          setRunning(false);
        });
    }, 550 * (shuffled.length + 1));
  }

  return (
    <section className="mini-game-panel survivor-panel">
      <h2>🎲 A szakadék sorsolása</h2>
      <label className="draw-task-label">
        <span>Mi a feladat?</span>
        <input value={task} onChange={(event) => setTask(event.target.value)} maxLength={100} />
      </label>

      <div className="cliff-stage">
        <div className="cliff-people">
          {eligiblePlayers.map((player) => {
            const isOut = eliminated.includes(player.id);
            const isWinner = winner?.id === player.id;
            return (
              <div className={`stick-person${isOut ? " stick-person--falling" : ""}${isWinner ? " stick-person--winner" : ""}`} key={player.id}>
                <span className="stick-person__icon">🧍</span>
                <strong>{player.name}</strong>
              </div>
            );
          })}
        </div>
        <div className="cliff-gap" aria-hidden="true"><span>▼ SZAKADÉK ▼</span></div>
      </div>

      <button type="button" onClick={startDraw} disabled={running || eligiblePlayers.length < 2}>
        {running ? "A SORS DÖNT..." : "⚔ SORSOLÁS INDÍTÁSA"}
      </button>

      <p className="draw-reward-note">A túlélő jutalma: +{SURVIVOR_REWARD} pont.</p>

      {winner && (
        <div className="survivor-winner" aria-live="polite">
          <span>🏆 AZ EGYETLEN TÚLÉLŐ 🏆</span>
          <strong>{winner.name}</strong>
          <p>{task.trim() || "A kiválasztott teljesíti a feladatot."}</p>
          <b className="survivor-reward">🎖 +{SURVIVOR_REWARD} pont</b>
          {rewardMessage && <small>{rewardMessage}</small>}
        </div>
      )}
    </section>
  );
}
