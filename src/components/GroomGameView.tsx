import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import XpEvolution from "./XpEvolution";
import QuestCompleteAnimation from "./QuestCompleteAnimation";
import CertificateExportButton from "./CertificateExportButton";

import type { Room } from "../services/roomService";
import type { Quest } from "../types/game";

interface GroomPlayerView {
  id: string;
  name: string;
  xp: number;
  huntPoints: number;
  catches: number;
  joinedAt: string;
}

interface GroomGameViewProps {
  room: Room;
  quests: Quest[];
  players: GroomPlayerView[];
  activeNormalQuest: Quest | null;
  activeEnvelopeQuest: Quest | null;
  activePunishmentQuest: Quest | null;
}

interface CompletionAnimationState {
  visible: boolean;
  title: string;
  awardedXp: number;
  doubleXp: boolean;
}

function formatSeconds(
  totalSeconds: number
): string {
  const safe = Math.max(
    0,
    totalSeconds
  );

  const minutes = Math.floor(
    safe / 60
  );

  const seconds = safe % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function QuestDisplay({
  quest,
  label
}: {
  quest: Quest;
  label: string;
}) {
  const [now, setNow] = useState(
    Date.now()
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => {
        setNow(Date.now());
      },
      500
    );

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const remaining =
    quest.timerEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(
              quest.timerEndsAt
            ).getTime() -
              now) /
              1000
          )
        )
      : null;

  const maximum =
    quest.maximumCount ??
    quest.targetCount ??
    1;

  const count =
    quest.currentCount ?? 0;

  return (
    <article className="groom-quest-card">
      <div className="groom-quest-label">
        {label}
      </div>

      <h2>{quest.title}</h2>

      <p>{quest.description}</p>

      {quest.completionMode ===
        "COUNTER" && (
        <div className="groom-big-value">
          {count} /{" "}
          {quest.targetCount ?? 1}
        </div>
      )}

      {quest.completionMode ===
        "TIMER" && (
        <div className="groom-big-value">
          {quest.timerEndsAt
            ? formatSeconds(
                remaining ?? 0
              )
            : "INDÍTÁSRA VÁR"}
        </div>
      )}

      {quest.completionMode ===
        "TIMED_SCORE" && (
        <div className="groom-timed-score">
          <div>
            <span>
              HÁTRALÉVŐ IDŐ
            </span>

            <strong>
              {quest.timerEndsAt
                ? formatSeconds(
                    remaining ?? 0
                  )
                : "INDÍTÁSRA VÁR"}
            </strong>
          </div>

          <div>
            <span>FELISMERT</span>

            <strong>
              {count} / {maximum}
            </strong>
          </div>

          <div>
            <span>MINIMUM CÉL</span>

            <strong>
              {quest.targetCount ?? 1}
            </strong>
          </div>

          <div>
            <span>
              AKTUÁLIS ALAPPONT
            </span>

            <strong>
              {count *
                (quest.pointsPerCount ??
                  1)}{" "}
              XP
            </strong>
          </div>
        </div>
      )}

      {quest.completionMode !==
        "TIMED_SCORE" && (
        <div className="groom-reward">
          Jutalom: +{quest.points} XP
        </div>
      )}
    </article>
  );
}

export default function GroomGameView({
  room,
  quests,
  players,
  activeNormalQuest,
  activeEnvelopeQuest,
  activePunishmentQuest
}: GroomGameViewProps) {
  const initializedRef =
    useRef(false);

  const knownCompletedIdsRef =
    useRef<Set<string>>(
      new Set()
    );

  const xpSectionRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const [
    animation,
    setAnimation
  ] =
    useState<CompletionAnimationState>({
      visible: false,
      title: "",
      awardedXp: 0,
      doubleXp: false
    });

  const handleAnimationFinished =
    useCallback(() => {
      setAnimation(
        (previous) => ({
          ...previous,
          visible: false
        })
      );

      window.setTimeout(() => {
        xpSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 100);
    }, []);

  /*
   * Szobaváltáskor minden helyi
   * animációs állapot alaphelyzetbe kerül.
   */
  useEffect(() => {
    initializedRef.current = false;

    knownCompletedIdsRef.current =
      new Set();

    setAnimation({
      visible: false,
      title: "",
      awardedXp: 0,
      doubleXp: false
    });
  }, [room.id]);

  /*
   * Az első VALÓDI Firestore snapshot
   * csak inicializálja az ismert feladatokat.
   *
   * Emiatt oldalfrissítéskor a korábban
   * teljesített feladatok nem indítanak
   * új animációt.
   */
  useEffect(() => {
    if (quests.length === 0) {
      return;
    }

    const completedQuests =
      quests.filter(
        (quest) => quest.completed
      );

    if (!initializedRef.current) {
      knownCompletedIdsRef.current =
        new Set(
          completedQuests.map(
            (quest) => quest.id
          )
        );

      initializedRef.current = true;
      return;
    }

    const newlyCompletedQuests =
      completedQuests
        .filter(
          (quest) =>
            !knownCompletedIdsRef.current.has(
              quest.id
            )
        )
        .sort(
          (first, second) => {
            const firstTime =
              first.completedAt
                ? new Date(
                    first.completedAt
                  ).getTime()
                : 0;

            const secondTime =
              second.completedAt
                ? new Date(
                    second.completedAt
                  ).getTime()
                : 0;

            return (
              secondTime -
              firstTime
            );
          }
        );

    completedQuests.forEach(
      (quest) => {
        knownCompletedIdsRef.current.add(
          quest.id
        );
      }
    );

    const latestCompletedQuest =
      newlyCompletedQuests[0];

    if (!latestCompletedQuest) {
      return;
    }

    const awardedXp =
      latestCompletedQuest.awardedPoints ??
      latestCompletedQuest.points;

    setAnimation({
      visible: true,
      title:
        latestCompletedQuest.title,
      awardedXp,
      doubleXp:
        awardedXp >
        latestCompletedQuest.points
    });
  }, [quests]);

  const activeQuests = [
    activePunishmentQuest && {
      quest:
        activePunishmentQuest,
      label:
        "😈 AKTÍV BÜNTETÉS"
    },

    activeEnvelopeQuest && {
      quest:
        activeEnvelopeQuest,
      label:
        "📩 AKTÍV BORÍTÉK"
    },

    activeNormalQuest && {
      quest:
        activeNormalQuest,
      label:
        "🎯 AKTUÁLIS KÜLDETÉS"
    }
  ].filter(Boolean) as Array<{
    quest: Quest;
    label: string;
  }>;

  return (
    <main className="groom-view">
      <header className="groom-view-header">
        <div>
          <span>
            QUEST BEFORE MARRIAGE
          </span>

          <h1>
            {room.groomName} KÜLDETÉSE
          </h1>

          <p>
            Szobakód:{" "}
            <strong>
              {room.roomCode}
            </strong>
          </p>
        </div>

      </header>

      <div
        ref={xpSectionRef}
        className="xp-scroll-target"
      >
        <XpEvolution
          currentXp={room.currentXp}
          targetXp={room.targetXp}
        />
      </div>

      {room.doubleXpActive && (
        <section className="groom-active-joker">
          ✨ DOUBLE XP AKTÍV — a
          következő teljesítés kétszeres
          pontot ér.
        </section>
      )}

      <CertificateExportButton
        room={room}
        quests={quests}
        players={players}
      />

      <section className="groom-current-missions">
        {activeQuests.length === 0 ? (
          <div className="groom-waiting-card">
            <div>⌛</div>

            <h2>
              A KÍSÉRŐK
              TANÁCSKOZNAK...
            </h2>

            <p>
              A következő küldetés
              hamarosan megjelenik.
            </p>
          </div>
        ) : (
          activeQuests.map(
            ({
              quest,
              label
            }) => (
              <QuestDisplay
                key={quest.id}
                quest={quest}
                label={label}
              />
            )
          )
        )}
      </section>

      <QuestCompleteAnimation
        visible={animation.visible}
        title={animation.title}
        awardedXp={
          animation.awardedXp
        }
        doubleXp={
          animation.doubleXp
        }
        onFinished={
          handleAnimationFinished
        }
      />

      <footer className="landing-footer">
        ⚔ CREATED BY TAMÁS SZABO ⚔
      </footer>
    </main>
  );
}