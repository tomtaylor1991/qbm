import { useEffect, useMemo, useState } from "react";
import { challengeExpiresAtMs, challengeIsExpired, expireChallengeIfNeeded, setChallengeState, subscribeChallenges, type PvpChallenge } from "../../services/arenaService";
import "./arena.css";

export default function ChallengePopup({ roomId, playerId, onOpenArena }: { roomId: string; playerId: string; onOpenArena?: () => void }) {
  const [challenges, setChallenges] = useState<PvpChallenge[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeChallenges(roomId, playerId, setChallenges), [roomId, playerId]);
  useEffect(() => {
    const pending = challenges.filter((challenge) => challenge.state === "PENDING" && !challengeIsExpired(challenge));
    const expiries = pending.map(challengeExpiresAtMs).filter(Number.isFinite);
    if (!expiries.length) return;
    const delay = Math.max(50, Math.min(...expiries) - Date.now() + 50);
    const timer = window.setTimeout(() => {
      void Promise.all(pending.map((challenge) => expireChallengeIfNeeded(roomId, challenge.id)));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [challenges, roomId]);
  const incoming = useMemo(() => challenges.find((challenge) => challenge.challengedId === playerId && challenge.state === "PENDING" && !challengeIsExpired(challenge)), [challenges, playerId]);
  if (!incoming) return null;
  const act = async (state: "ACCEPTED" | "DECLINED") => {
    if (busy) return;
    setBusy(true);
    try {
      await setChallengeState(roomId, incoming.id, state, playerId);
      if (state === "ACCEPTED") onOpenArena?.();
    } finally {
      setBusy(false);
    }
  };
  return <div className="challenge-popup-backdrop" role="presentation">
    <aside className="challenge-popup" role="dialog" aria-modal="true" aria-label="Beérkező PvP kihívás">
      <div className="challenge-popup-icon">⚔️</div>
      <small>BEÉRKEZŐ KIHÍVÁS</small>
      <h2>{incoming.challengerName} kihívott!</h2>
      <p>Tét: <b>{incoming.stake} pont</b></p>
      <div className="challenge-popup-actions">
        <button type="button" disabled={busy} onClick={() => void act("ACCEPTED")}>🔥 Elfogadom</button>
        <button type="button" disabled={busy} onClick={() => void act("DECLINED")}>✋ Elutasítom</button>
      </div>
    </aside>
  </div>;
}
