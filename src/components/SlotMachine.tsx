import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { playSlotMachine, type Player, type SlotSpinResult } from "../services/playerService";

interface Props {
  roomId: string;
  player: Player | null;
}

const SLOT_IMAGES = Array.from({ length: 9 }, (_, index) => `/images/slot/slot-${index + 1}.png`);
const LEVER_MAX_TRAVEL = 104;
const LEVER_TRIGGER_DISTANCE = 72;

export default function SlotMachine({ roomId, player }: Props) {
  const [symbols, setSymbols] = useState<[number, number, number]>([0, 1, 2]);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState("Húzd le a kart a pörgetéshez.");
  const [leverOffset, setLeverOffset] = useState(0);
  const [displayedBalance, setDisplayedBalance] = useState(player?.huntPoints ?? 0);
  const dragStartY = useRef<number | null>(null);
  const triggeredDuringDrag = useRef(false);

  useEffect(() => {
    setDisplayedBalance(player?.huntPoints ?? 0);
  }, [player?.huntPoints]);

  const canSpin = Boolean(player && displayedBalance >= 10 && !spinning);

  async function spin() {
    if (spinning) return;
    if (!player) {
      setMessage("Előbb lépj be játékosként.");
      return;
    }
    if (displayedBalance < 10) {
      setMessage("Nincs elég pontod. Egy pörgetés ára 10 pont.");
      return;
    }

    try {
      setSpinning(true);
      setMessage("A hengerek forognak...");
      const result: SlotSpinResult = await playSlotMachine(roomId, player.id);
      setDisplayedBalance(result.balanceAfter);

      const animation = window.setInterval(() => {
        setSymbols([
          Math.floor(Math.random() * 9),
          Math.floor(Math.random() * 9),
          Math.floor(Math.random() * 9)
        ]);
      }, 90);

      window.setTimeout(() => {
        window.clearInterval(animation);
        setSymbols(result.symbols);
        setMessage(
          result.jackpot
            ? "🎉 JACKPOT! +100 pont"
            : result.payout > 0
              ? `Nyeremény: +${result.payout} pont`
              : "Most nem nyertél."
        );
        setSpinning(false);
      }, 1500);
    } catch (error) {
      setSpinning(false);
      setMessage(error instanceof Error ? error.message : "A pörgetés sikertelen volt.");
    }
  }

  function beginLeverPull(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!canSpin) return;
    dragStartY.current = event.clientY;
    triggeredDuringDrag.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveLever(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragStartY.current === null || spinning) return;
    const distance = Math.max(0, Math.min(LEVER_MAX_TRAVEL, event.clientY - dragStartY.current));
    setLeverOffset(distance);

    if (distance >= LEVER_TRIGGER_DISTANCE) {
      triggeredDuringDrag.current = true;
    }
  }

  function endLeverPull(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragStartY.current === null) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const shouldSpin = triggeredDuringDrag.current && canSpin;
    dragStartY.current = null;
    triggeredDuringDrag.current = false;
    setLeverOffset(0);

    if (shouldSpin) void spin();
  }

  function handleLeverKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if ((event.key === "Enter" || event.key === " ") && canSpin) {
      event.preventDefault();
      setLeverOffset(LEVER_TRIGGER_DISTANCE);
      window.setTimeout(() => setLeverOffset(0), 180);
      void spin();
    }
  }

  return (
    <section className="mini-game-panel slot-panel">
      <h2>🎰 Félkarú rabló</h2>
      <div className="slot-balance">Egyenleg: <strong>{displayedBalance} pont</strong></div>

      <div className="slot-machine-layout">
        <div className={`slot-machine${spinning ? " slot-machine--spinning" : ""}`}>
          {symbols.map((symbol, index) => (
            <div className="slot-reel" key={index}>
              <img src={SLOT_IMAGES[symbol]} alt={`Szimbólum ${symbol + 1}`} />
            </div>
          ))}
        </div>

        <div className={`slot-lever-shell${canSpin ? "" : " slot-lever-shell--disabled"}`}>
          <button
            type="button"
            className="slot-lever"
            aria-label="Húzd le a félkarú rabló karját. Egy pörgetés 10 pont."
            disabled={!canSpin}
            onPointerDown={beginLeverPull}
            onPointerMove={moveLever}
            onPointerUp={endLeverPull}
            onPointerCancel={endLeverPull}
            onKeyDown={handleLeverKeyDown}
          >
            <span className="slot-lever__track" aria-hidden="true" />
            <span
              className="slot-lever__arm"
              style={{ transform: `translateY(${leverOffset}px)` }}
              aria-hidden="true"
            >
              <span className="slot-lever__handle" />
              <span className="slot-lever__rod" />
            </span>
          </button>
          <strong>{spinning ? "PÖRGÉS..." : "HÚZD LE"}</strong>
        </div>
      </div>

      <p className="slot-message" aria-live="polite">{message}</p>

      <div className="slot-rules">
        <h3>📜 Szabályok</h3>
        <ul>
          <li>Egy pörgetés ára 10 pont.</li>
          <li>Két azonos szimbólum: nettó +10 pont.</li>
          <li>Három gyakori szimbólum: nettó +30 pont.</li>
          <li>Három ritka szimbólum: nettó +50 pont.</li>
          <li>Három jackpot szimbólum: nettó +100 pont.</li>
          <li>Nyerésnél a 10 pontos tét automatikusan visszajár.</li>
          <li>Legalább 10 pont szükséges a kar meghúzásához.</li>
          <li>A gép bulibarát módban működik: nagyjából minden második pörgetés nyer.</li>
        </ul>
      </div>

      {player && (
        <div className="slot-stats">
          <span>Pörgetés: {player.slotSpins}</span>
          <span>Elköltve: {player.slotPointsSpent}</span>
          <span>Nyert: {player.slotPointsWon}</span>
          <span>Jackpot: {player.slotJackpots}</span>
        </div>
      )}
    </section>
  );
}
