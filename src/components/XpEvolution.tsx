interface XpEvolutionProps {
  currentXp: number;
  targetXp: number;
}

interface KnightStage {
  title: string;
  knight: string;
  equipment: string;
  message: string;
}

const knightStages: KnightStage[] = [
  {
    title: "Falusi újonc",
    knight: "🧑",
    equipment: "🪵",
    message: "Egyelőre csak egy botja és rengeteg önbizalma van."
  },
  {
    title: "Kezdő kalandor",
    knight: "🧑",
    equipment: "🗡️",
    message: "Megszerezte az első kardját."
  },
  {
    title: "Kocsmák őre",
    knight: "🪖",
    equipment: "🍺",
    message: "Már sisakban indul minden veszélyes küldetésre."
  },
  {
    title: "Pajzsos lovag",
    knight: "🪖",
    equipment: "🛡️",
    message: "Megkapta első pajzsát, és egyre nehezebb feldönteni."
  },
  {
    title: "Acélharcos",
    knight: "♞",
    equipment: "⚔️",
    message: "A könnyű felszerelést teljes páncélra cserélte."
  },
  {
    title: "A mulatság bajnoka",
    knight: "🏇",
    equipment: "🍻",
    message: "Már lóháton járja a legénybúcsú veszélyes vidékeit."
  },
  {
    title: "Ezüstlovag",
    knight: "🏇",
    equipment: "🛡️",
    message: "Fényes páncélban közelít a sárkány birodalma felé."
  },
  {
    title: "Sárkányvadász",
    knight: "🏇",
    equipment: "⚔️🔥",
    message: "Már a sárkány leheletét is érzi a távolból."
  },
  {
    title: "Legendás vőlegény",
    knight: "🤴",
    equipment: "🛡️⚔️",
    message: "A királyság minden kocsmájában ismerik a nevét."
  },
  {
    title: "A házasság bajnoka",
    knight: "🤴",
    equipment: "⚔️🐉",
    message: "Már csak az utolsó próba választja el a végső sorstól."
  }
];

function clamp(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function getProgressPercent(
  currentXp: number,
  targetXp: number
): number {
  const safeTargetXp = Math.max(1, targetXp);

  return clamp(
    (Math.max(0, currentXp) / safeTargetXp) * 100,
    0,
    100
  );
}

function getKnightStageIndex(
  currentXp: number,
  targetXp: number
): number {
  const progressPercent = getProgressPercent(
    currentXp,
    targetXp
  );

  const calculatedIndex = Math.floor(
    (progressPercent / 100) * knightStages.length
  );

  return clamp(
    calculatedIndex,
    0,
    knightStages.length - 1
  );
}

function getLevel(currentXp: number): number {
  return Math.floor(
    Math.max(0, currentXp) / 10
  ) + 1;
}

function getNextEvolutionXp(
  currentXp: number,
  targetXp: number
): number {
  const safeTargetXp = Math.max(1, targetXp);

  const currentStageIndex = getKnightStageIndex(
    currentXp,
    safeTargetXp
  );

  if (
    currentStageIndex >=
    knightStages.length - 1
  ) {
    return safeTargetXp;
  }

  const nextStageProgress =
    (currentStageIndex + 1) /
    knightStages.length;

  return Math.min(
    safeTargetXp,
    Math.ceil(
      safeTargetXp * nextStageProgress
    )
  );
}

export default function XpEvolution({
  currentXp,
  targetXp
}: XpEvolutionProps) {
  const safeCurrentXp = Math.max(0, currentXp);
  const safeTargetXp = Math.max(1, targetXp);

  const progressPercent = getProgressPercent(
    safeCurrentXp,
    safeTargetXp
  );

  const victoryReached =
    safeCurrentXp >= safeTargetXp;

  const stageIndex = getKnightStageIndex(
    safeCurrentXp,
    safeTargetXp
  );

  const stage = knightStages[stageIndex];

  const currentLevel = getLevel(
    safeCurrentXp
  );

  const nextEvolutionXp =
    getNextEvolutionXp(
      safeCurrentXp,
      safeTargetXp
    );

  if (victoryReached) {
    return (
      <section className="xp-evolution xp-evolution--victory">
        <div className="pixel-window-title">
          FINAL BOSS
        </div>

        <div className="victory-scene">
          <div className="victory-moon" />

          <div
            className="victory-dragon"
            aria-label="Sárkány"
          >
            🐉
          </div>

          <div
            className="victory-chain victory-chain--left"
            aria-hidden="true"
          >
            ⛓️
          </div>

          <div
            className="victory-knight"
            aria-label="Láncra vert lovag"
          >
            🛡️

            <span className="victory-knight-character">
              🧎
            </span>
          </div>

          <div
            className="victory-chain victory-chain--right"
            aria-hidden="true"
          >
            ⛓️
          </div>
        </div>

        <div className="victory-dialogue">
          <div className="dialogue-avatar">
            🐉
          </div>

          <div>
            <strong>
              A SÁRKÁNY LÁNCRA VERTE A LOVAGOT
            </strong>

            <p>
              A lovag teljesítette az összes próbát,
              ezért a házasság sárkánya örökre
              magához láncolta.
            </p>

            <div className="victory-score">
              {safeCurrentXp} / {safeTargetXp} XP
              {safeCurrentXp > safeTargetXp && (
                <span className="overtime-xp"> +{safeCurrentXp - safeTargetXp} túlóra XP</span>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="xp-evolution">
      <div className="pixel-window-title">
        LOVAG FEJLŐDÉSE
      </div>

      <div className="xp-hud">
        <div className="knight-portrait">
          <div className="knight-level">
            LVL {currentLevel}
          </div>

          <div className="knight-sprite">
            <span className="knight-character">
              {stage.knight}
            </span>

            <span className="knight-equipment">
              {stage.equipment}
            </span>
          </div>
        </div>

        <div className="knight-information">
          <h2>{stage.title}</h2>

          <p>{stage.message}</p>

          <div className="xp-numbers">
            <span>XP</span>

            <strong>
              {safeCurrentXp} / {safeTargetXp}
            </strong>
          </div>
        </div>
      </div>

      <div className="xp-adventure-map">
        <div className="map-cloud map-cloud--one">
          ░░
        </div>

        <div className="map-cloud map-cloud--two">
          ░░░
        </div>

        <div className="map-mountain map-mountain--one">
          ▲
        </div>

        <div className="map-mountain map-mountain--two">
          ▲
        </div>

        <div className="map-castle">
          ▥
        </div>

        <div
          className="map-dragon"
          aria-label="A célnál várakozó sárkány"
        >
          🐉
        </div>

        <div className="xp-track">
          <div
            className="xp-track-fill"
            style={{
              width: `${progressPercent}%`
            }}
          />

          {Array.from(
            {
              length:
                knightStages.length + 1
            },
            (_, index) => (
              <span
                key={index}
                className="xp-track-marker"
                style={{
                  left: `${
                    (index /
                      knightStages.length) *
                    100
                  }%`
                }}
              />
            )
          )}

          <div
            className="travelling-knight"
            style={{
              left: `clamp(10px, ${progressPercent}%, calc(100% - 38px))`
            }}
          >
            <div className="travelling-knight-bubble">
              {safeCurrentXp}
            </div>

            <div className="travelling-knight-sprite">
              {stage.knight}
            </div>
          </div>
        </div>
      </div>

      <div className="xp-footer">
        <span>
          Következő páncélfejlődés:
        </span>

        <strong>
          {nextEvolutionXp} XP
        </strong>
      </div>
    </section>
  );
}