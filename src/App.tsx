import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";

import "./App.css";

import XpEvolution from "./components/XpEvolution";
import ScrollToTopButton from "./components/ScrollToTopButton";
import QuestCompleteAnimation from "./components/QuestCompleteAnimation";
import RoundCounterPanel from "./components/RoundCounterPanel";
import SlotMachine from "./components/SlotMachine";
import SurvivorDraw from "./components/SurvivorDraw";
import GroomGameView from "./components/GroomGameView";
import ArenaPanel from "./components/arena/ArenaPanel";
import ChallengePopup from "./components/arena/ChallengePopup";
import PiggyBankPanel from "./components/PiggyBankPanel";

import {
  createRoom,
  drawEnvelope,
  findRoomByCode,
  registerPervyComment,
  subscribeRoom,
  setActiveNormalQuest,
  type Room
} from "./services/roomService";

import {
  addHuntPoints,
  addPlayer,
  ensureGroomPlayer,
  setPlayerPresence,
  subscribePlayers
} from "./services/playerService";

import {
  addQuest,
  changeTimedScoreCount,
  completeQuest,
  finishTimedScoreQuest,
  incrementQuestCounter,
  resetTimedQuest,
  startTimedQuest,
  subscribeQuests,
  type CompletionMode,
  type NewQuest,
  type Quest,
  type QuestType
} from "./services/questService";

import {
  activateDoubleXp,
  consumeJoker,
  seedDefaultJokers,
  subscribeJokers,
  useEnvelopeRedraw,
  useShield,
  type Joker
} from "./services/jokerService";

interface PlayerView {
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

interface CompletionAnimationState {
  visible: boolean;
  title: string;
  awardedXp: number;
  doubleXp: boolean;
}

type AppViewMode = "COMPANION" | "GROOM";

type GameTab =
  | "NORMAL"
  | "ENVELOPE"
  | "PUNISHMENT"
  | "JOKERS"
  | "ROUNDS"
  | "SLOT"
  | "DRAW"
  | "SHOP"
  | "INVENTORY"
  | "PVP"
  | "PVE"
  | "PIGGY"
  | "COMPLETED"
  | "ADD";

const SESSION_ROOM_CODE = "qbm-room-code";
const SESSION_PLAYER_NAME = "qbm-player-name";
const SESSION_PLAYER_ID = "qbm-player-id";
const SESSION_VIEW_MODE = "qbm-view-mode";
const LOCAL_REMEMBERED_SESSION = "qbm-remembered-session";

interface RememberedSession {
  roomCode: string;
  playerId: string;
  playerName: string;
  mode: AppViewMode;
}

function readRememberedSession(): RememberedSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_REMEMBERED_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedSession>;
    if (!parsed.roomCode || !parsed.playerId || !parsed.mode) return null;
    return {
      roomCode: String(parsed.roomCode),
      playerId: String(parsed.playerId),
      playerName: String(parsed.playerName ?? ""),
      mode: parsed.mode === "GROOM" ? "GROOM" : "COMPANION"
    };
  } catch {
    return null;
  }
}

function rememberSession(session: RememberedSession): void {
  localStorage.setItem(LOCAL_REMEMBERED_SESSION, JSON.stringify(session));
}

const GROOM_REWARD_POINTS = 10;
const GROOM_MIN_WAIT_MS = 120 * 1000;
const GROOM_MAX_WAIT_MS = 240 * 1000;
const GROOM_VISIBLE_MS = 7000;

const theme = {
  panel: "#1a2338",
  panel2: "#222d45",
  border: "#4c648d",
  borderSoft: "#33425f",
  text: "#e7efff",
  muted: "#9fb0d1",
  accent: "#6e8ec9",
  accent2: "#8eabdf",
  success: "#68b08a",
  warning: "#d1b36b",
  danger: "#b9687f",
  shadow: "#05070d",
  gold: "#f0d38a"
};

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
}

function formatDate(dateValue: string | null): string {
  if (!dateValue) {
    return "";
  }

  const timestamp = new Date(dateValue);

  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }

  return timestamp.toLocaleString("hu-HU");
}

function getQuestMode(quest: Quest): CompletionMode {
  return quest.completionMode ?? "SIMPLE";
}

function getQuestTypeLabel(type: QuestType): string {
  switch (type) {
    case "ENVELOPE":
      return "Borítékos";

    case "PUNISHMENT":
      return "Büntetés";

    default:
      return "Normál";
  }
}

function getCompletionModeLabel(
  mode: CompletionMode
): string {
  switch (mode) {
    case "COUNTER":
      return "Számlálós";

    case "TIMER":
      return "Időzítős";

    case "TIMED_SCORE":
      return "Időzített pontgyűjtő";

    default:
      return "Egyszerű";
  }
}

function App() {
  const rememberedAtBoot = useMemo(() => readRememberedSession(), []);
  const initialMode = (sessionStorage.getItem(SESSION_VIEW_MODE) as AppViewMode | null) ?? rememberedAtBoot?.mode ?? "COMPANION";
  const [viewMode, setViewMode] = useState<AppViewMode>(initialMode);

  const [roomGroomName, setRoomGroomName] = useState("Vőlegény");
  const [roomTargetXp, setRoomTargetXp] = useState("500");
  const [roomStartingPoints, setRoomStartingPoints] = useState("500");

  const [createdRoomCode, setCreatedRoomCode] =
    useState("");

  const [joinCode, setJoinCode] = useState(
    sessionStorage.getItem(SESSION_ROOM_CODE) ?? rememberedAtBoot?.roomCode ?? ""
  );

  const [joinedRoom, setJoinedRoom] =
    useState<Room | null>(null);

  const [playerName, setPlayerName] = useState(
    sessionStorage.getItem(SESSION_PLAYER_NAME) ?? rememberedAtBoot?.playerName ?? ""
  );

  const [activePlayerId, setActivePlayerId] = useState(
    sessionStorage.getItem(SESSION_PLAYER_ID) ?? rememberedAtBoot?.playerId ?? ""
  );

  const [activePlayerName, setActivePlayerName] =
    useState(
      initialMode === "GROOM"
        ? ""
        : sessionStorage.getItem(SESSION_PLAYER_NAME) ?? rememberedAtBoot?.playerName ?? ""
    );

  const [players, setPlayers] =
    useState<PlayerView[]>([]);

  const [quests, setQuests] =
    useState<Quest[]>([]);

  const [jokers, setJokers] =
    useState<Joker[]>([]);

  const [activeTab, setActiveTab] =
    useState<GameTab>("NORMAL");

  const navigateFromMenu = useCallback((tab: GameTab, anchorId: string) => {
    setActiveTab(tab);
    setMenuOpen(false);
    window.setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);

  const [newQuestTitle, setNewQuestTitle] =
    useState("");

  const [
    newQuestDescription,
    setNewQuestDescription
  ] = useState("");

  const [newQuestPoints, setNewQuestPoints] =
    useState("20");

  const [newQuestType, setNewQuestType] =
    useState<QuestType>("NORMAL");

  const [
    newCompletionMode,
    setNewCompletionMode
  ] = useState<CompletionMode>("SIMPLE");

  const [newTargetCount, setNewTargetCount] =
    useState("5");

  const [
    newDurationSeconds,
    setNewDurationSeconds
  ] = useState("60");

  const [loading, setLoading] =
    useState(false);

  const [
    questActionId,
    setQuestActionId
  ] = useState<string | null>(null);

  const [
    jokerActionId,
    setJokerActionId
  ] = useState<string | null>(null);

  const [currentTime, setCurrentTime] =
    useState(Date.now());

  const [groomVisible, setGroomVisible] =
    useState(false);

  const [groomSaving, setGroomSaving] =
    useState(false);

  const [groomCycle, setGroomCycle] =
    useState(0);

  const [groomPosition, setGroomPosition] =
    useState({ left: 50, top: 50 });

  const xpSectionRef =
    useRef<HTMLDivElement | null>(null);

  const [
    completionAnimation,
    setCompletionAnimation
  ] = useState<CompletionAnimationState>({
    visible: false,
    title: "",
    awardedXp: 0,
    doubleXp: false
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 500);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!joinedRoom || !activePlayerName || viewMode !== "COMPANION") {
      setGroomVisible(false);
      return;
    }

    const randomWait =
      GROOM_MIN_WAIT_MS +
      Math.floor(
        Math.random() *
          (GROOM_MAX_WAIT_MS -
            GROOM_MIN_WAIT_MS +
            1)
      );

    let hideTimer: number | null = null;

    const spawnTimer = window.setTimeout(() => {
      setGroomPosition({
        left: 14 + Math.random() * 72,
        top: 18 + Math.random() * 60
      });

      setGroomVisible(true);

      hideTimer = window.setTimeout(() => {
        setGroomVisible(false);
        setGroomCycle((current) => current + 1);
      }, GROOM_VISIBLE_MS);
    }, randomWait);

    return () => {
      window.clearTimeout(spawnTimer);

      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [joinedRoom?.id, activePlayerName, groomCycle, viewMode]);

  const normalQuests = useMemo(
    () =>
      quests.filter(
        (quest) =>
          quest.type === "NORMAL" &&
          !quest.completed
      ),
    [quests]
  );

  const completedQuests = useMemo(
    () =>
      quests
        .filter((quest) => quest.completed)
        .slice()
        .sort((first, second) => {
          const firstTime = first.completedAt
            ? new Date(first.completedAt).getTime()
            : 0;

          const secondTime = second.completedAt
            ? new Date(second.completedAt).getTime()
            : 0;

          return secondTime - firstTime;
        }),
    [quests]
  );

  const activeNormalQuest = useMemo(() => {
    if (!joinedRoom?.activeNormalQuestId) {
      return null;
    }

    return (
      quests.find(
        (quest) => quest.id === joinedRoom.activeNormalQuestId
      ) ?? null
    );
  }, [joinedRoom?.activeNormalQuestId, quests]);

  const activeEnvelopeQuest = useMemo(() => {
    if (!joinedRoom?.activeEnvelopeQuestId) {
      return null;
    }

    return (
      quests.find(
        (quest) =>
          quest.id ===
          joinedRoom.activeEnvelopeQuestId
      ) ?? null
    );
  }, [joinedRoom?.activeEnvelopeQuestId, quests]);

  const activePunishmentQuest = useMemo(() => {
    if (!joinedRoom?.activePunishmentQuestId) {
      return null;
    }

    return (
      quests.find(
        (quest) =>
          quest.id ===
          joinedRoom.activePunishmentQuestId
      ) ?? null
    );
  }, [joinedRoom?.activePunishmentQuestId, quests]);

  const availableJokers = useMemo(
    () =>
      jokers.filter(
        (joker) => joker.remainingUses > 0
      ),
    [jokers]
  );

  const activePlayer = useMemo(
    () =>
      players.find((player) => player.id === activePlayerId) ??
      players.find(
        (player) =>
          player.name.toLocaleLowerCase("hu-HU") ===
          activePlayerName.toLocaleLowerCase("hu-HU")
      ) ?? null,
    [players, activePlayerId, activePlayerName]
  );

  const groomPlayer = useMemo(
    () =>
      joinedRoom
        ? players.find((player) => player.isGroom) ??
          players.find(
            (player) =>
              player.name.toLocaleLowerCase("hu-HU") ===
              joinedRoom.groomName.toLocaleLowerCase("hu-HU")
          ) ?? null
        : null,
    [players, joinedRoom]
  );

  const rankedPlayers = useMemo(
    () =>
      [...players].sort(
        (first, second) =>
          (second.huntPoints ?? 0) -
            (first.huntPoints ?? 0) ||
          first.name.localeCompare(
            second.name,
            "hu-HU"
          )
      ),
    [players]
  );

  const playerStatistics = useMemo(() => {
    const statistics = new Map<
      string,
      {
        name: string;
        completedCount: number;
        earnedXp: number;
      }
    >();

    completedQuests.forEach((quest) => {
      const name =
        quest.completedBy?.trim() || "Ismeretlen";

      const existing = statistics.get(name);

      const earnedXp =
        quest.awardedPoints ?? quest.points;

      if (existing) {
        existing.completedCount += 1;
        existing.earnedXp += earnedXp;
      } else {
        statistics.set(name, {
          name,
          completedCount: 1,
          earnedXp
        });
      }
    });

    return Array.from(statistics.values()).sort(
      (first, second) =>
        second.earnedXp - first.earnedXp
    );
  }, [completedQuests]);

  const handleCompletionSuccess =
    useCallback(
      (
        quest: Quest,
        doubleXpWasActive: boolean
      ) => {
        const awardedXp =
          doubleXpWasActive
            ? quest.points * 2
            : quest.points;

        setCompletionAnimation({
          visible: true,
          title: quest.title,
          awardedXp,
          doubleXp: doubleXpWasActive
        });
      },
      []
    );

  const handleCompletionAnimationFinished =
    useCallback(() => {
      setCompletionAnimation((previous) => ({
        ...previous,
        visible: false
      }));

      window.setTimeout(() => {
        xpSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 100);
    }, []);

  function getRemainingSeconds(
    quest: Quest
  ): number | null {
    if (!quest.timerEndsAt) {
      return null;
    }

    const endTime = new Date(
      quest.timerEndsAt
    ).getTime();

    if (!Number.isFinite(endTime)) {
      return null;
    }

    return Math.max(
      0,
      Math.ceil((endTime - currentTime) / 1000)
    );
  }

  async function handleCatchGroom() {
    if (!joinedRoom || !activePlayer) {
      alert(
        "A pontszerzéshez előbb lépj be játékosként."
      );
      return;
    }

    if (groomSaving || !groomVisible) {
      return;
    }

    try {
      setGroomSaving(true);

      await addHuntPoints(
        joinedRoom.id,
        activePlayer.id,
        GROOM_REWARD_POINTS
      );

      setGroomVisible(false);
      setGroomCycle((current) => current + 1);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült jóváírni a pontot."
      );
    } finally {
      setGroomSaving(false);
    }
  }

  async function handleCreateRoom() {
    try {
      setLoading(true);

      const room = await createRoom(
        "Legénybúcsú RPG",
        roomGroomName,
        Number(roomTargetXp),
        Math.max(0, Number(roomStartingPoints) || 0)
      );

      setViewMode("COMPANION");
      sessionStorage.setItem(SESSION_VIEW_MODE, "COMPANION");

      await ensureGroomPlayer(room.id, room.groomName);

      setCreatedRoomCode(room.roomCode);
      setJoinCode(room.roomCode);
      setJoinedRoom(room);

      sessionStorage.setItem(
        SESSION_ROOM_CODE,
        room.roomCode
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült létrehozni a játékot."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinRoom(
    requestedCode = joinCode,
    requestedMode: AppViewMode = viewMode
  ) {
    const normalizedCode = requestedCode
      .trim()
      .toUpperCase();

    if (!normalizedCode) {
      alert("Add meg a szobakódot.");
      return;
    }

    try {
      setLoading(true);

      const room = await findRoomByCode(
        normalizedCode
      );

      if (!room) {
        alert("Nincs ilyen szobakód.");
        return;
      }

      setJoinedRoom(room);
      setJoinCode(room.roomCode);
      setViewMode(requestedMode);
      sessionStorage.setItem(SESSION_VIEW_MODE, requestedMode);
      if (requestedMode === "GROOM") {
        setPlayerName(room.groomName);
        setActivePlayerName("");
        setActiveTab("NORMAL");
        sessionStorage.removeItem(SESSION_PLAYER_NAME);
        const groomPlayerId = await ensureGroomPlayer(room.id, room.groomName);
        setActivePlayerId(groomPlayerId);
        sessionStorage.setItem(SESSION_PLAYER_ID, groomPlayerId);
        rememberSession({ roomCode: room.roomCode, playerId: groomPlayerId, playerName: room.groomName, mode: "GROOM" });
      }

      sessionStorage.setItem(
        SESSION_ROOM_CODE,
        room.roomCode
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült csatlakozni a játékhoz."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinAsPlayer() {
    if (!joinedRoom) {
      alert("Előbb csatlakozz egy játékhoz.");
      return;
    }

    const normalizedName = playerName.trim();

    if (!normalizedName) {
      alert("Adj meg egy játékosnevet.");
      return;
    }

    const duplicatePlayer = players.some(
      (player) =>
        player.name.toLocaleLowerCase("hu-HU") ===
        normalizedName.toLocaleLowerCase("hu-HU")
    );

    try {
      setLoading(true);

      const isGroomName = normalizedName.toLocaleLowerCase("hu-HU") === joinedRoom.groomName.toLocaleLowerCase("hu-HU");
      let resolvedPlayerId = "";
      if (isGroomName) {
        resolvedPlayerId = await ensureGroomPlayer(joinedRoom.id, joinedRoom.groomName);
      } else if (!duplicatePlayer) {
        resolvedPlayerId = await addPlayer(joinedRoom.id, normalizedName, joinedRoom.startingPoints);
      } else {
        const existingPlayer = players.find((player) => player.name.toLocaleLowerCase("hu-HU") === normalizedName.toLocaleLowerCase("hu-HU"));
        if (existingPlayer) {
          resolvedPlayerId = existingPlayer.id;
          await setPlayerPresence(joinedRoom.id, existingPlayer.id, true);
        }
      }
      if (!resolvedPlayerId) throw new Error("A játékos azonosítása sikertelen.");

      setActivePlayerId(resolvedPlayerId);
      setActivePlayerName(normalizedName);
      setPlayerName(normalizedName);

      sessionStorage.setItem(SESSION_PLAYER_ID, resolvedPlayerId);
      sessionStorage.setItem(SESSION_PLAYER_NAME, normalizedName);
      sessionStorage.setItem(SESSION_ROOM_CODE, joinedRoom.roomCode);
      sessionStorage.setItem(SESSION_VIEW_MODE, "COMPANION");
      rememberSession({ roomCode: joinedRoom.roomCode, playerId: resolvedPlayerId, playerName: normalizedName, mode: "COMPANION" });
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült belépni játékosként."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSimpleCompletion(
    quest: Quest
  ) {
    if (!joinedRoom) {
      return;
    }

    if (!activePlayerName) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    const awardedPoints = joinedRoom.doubleXpActive
      ? quest.points * 2
      : quest.points;

    const confirmed = window.confirm(
      `Biztosan teljesítettétek?\n\n${quest.title}\n+${awardedPoints} XP${
        joinedRoom.doubleXpActive
          ? "\n\n✨ Double XP aktív!"
          : ""
      }`
    );

    if (!confirmed) {
      return;
    }

    const doubleXpWasActive =
      joinedRoom.doubleXpActive;

    try {
      setQuestActionId(quest.id);

      const completed = await completeQuest(
        joinedRoom.id,
        quest.id,
        activePlayerName
      );

      if (!completed) {
        alert(
          "Ezt a feladatot már valaki más teljesítette."
        );

        return;
      }

      handleCompletionSuccess(
        quest,
        doubleXpWasActive
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült teljesíteni a feladatot."
      );
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleCounterIncrement(
    quest: Quest
  ) {
    if (!joinedRoom) {
      return;
    }

    if (!activePlayerName) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    const doubleXpWasActive =
      joinedRoom.doubleXpActive;

    try {
      setQuestActionId(quest.id);

      const result =
        await incrementQuestCounter(
          joinedRoom.id,
          quest.id,
          activePlayerName
        );

      if (result.completed) {
        handleCompletionSuccess(
          quest,
          doubleXpWasActive
        );
      }
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült növelni a számlálót."
      );
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleStartTimer(
    quest: Quest
  ) {
    if (!joinedRoom) {
      return;
    }

    if (!activePlayerName) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    const confirmed = window.confirm(
      `Induljon az időzítő?\n\n${quest.title}`
    );

    if (!confirmed) {
      return;
    }

    try {
      setQuestActionId(quest.id);

      await startTimedQuest(
        joinedRoom.id,
        quest.id,
        activePlayerName
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült elindítani az időzítőt."
      );
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleTimedSuccess(
    quest: Quest
  ) {
    if (!joinedRoom) {
      return;
    }

    if (!activePlayerName) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    const doubleXpWasActive =
      joinedRoom.doubleXpActive;

    try {
      setQuestActionId(quest.id);

      const completed = await completeQuest(
        joinedRoom.id,
        quest.id,
        activePlayerName
      );

      if (!completed) {
        alert(
          "A feladatot már valaki más lezárta."
        );

        return;
      }

      handleCompletionSuccess(
        quest,
        doubleXpWasActive
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült lezárni a feladatot."
      );
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleTimedFailure(
    quest: Quest
  ) {
    if (!joinedRoom) {
      return;
    }

    try {
      setQuestActionId(quest.id);

      await resetTimedQuest(
        joinedRoom.id,
        quest.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült újraindíthatóvá tenni a feladatot."
      );
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleDrawEnvelope() {
    if (!joinedRoom) {
      return;
    }

    if (!activePlayerName) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    try {
      setLoading(true);

      await drawEnvelope(joinedRoom.id);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült borítékot húzni."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePervyComment() {
    if (!joinedRoom) {
      return;
    }

    if (!activePlayerName) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    try {
      setLoading(true);

      const result =
        await registerPervyComment(
          joinedRoom.id
        );

      if (result.punishmentTriggered) {
        setActiveTab("PUNISHMENT");

        alert(
          "😈 Elérte a határt! Büntetés aktiválva."
        );
      }
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült rögzíteni a megjegyzést."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedJokers() {
    if (!joinedRoom) {
      return;
    }

    try {
      setLoading(true);

      await seedDefaultJokers(
        joinedRoom.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült létrehozni a jokereket."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUseJoker(joker: Joker) {
    if (!joinedRoom) {
      return;
    }

    if (!activePlayerName) {
      alert("Előbb lépj be játékosként.");
      return;
    }

    if (joker.remainingUses <= 0) {
      alert("Ez a joker már elfogyott.");
      return;
    }

    try {
      setJokerActionId(joker.id);

      switch (joker.type) {
        case "DOUBLE_XP": {
          const confirmed = window.confirm(
            "Aktiváljátok a Double XP jokert?\n\nA következő sikeresen teljesített feladat dupla XP-t ér."
          );

          if (!confirmed) {
            return;
          }

          await activateDoubleXp(
            joinedRoom.id,
            joker.id,
            activePlayerName
          );

          alert(
            "✨ Double XP aktiválva! A következő teljesített feladat dupla pontot ér."
          );

          break;
        }

        case "SHIELD": {
          if (!activePunishmentQuest) {
            alert(
              "Nincs aktív büntetés, amit kivédhetnétek."
            );

            return;
          }

          const confirmed = window.confirm(
            `Semlegesítitek ezt a büntetést?\n\n${activePunishmentQuest.title}`
          );

          if (!confirmed) {
            return;
          }

          await useShield(
            joinedRoom.id,
            joker.id
          );

          alert(
            "🛡️ A büntetést kivédtétek."
          );

          break;
        }

        case "REDRAW": {
          if (!activeEnvelopeQuest) {
            alert(
              "Nincs aktív borítékos feladat."
            );

            return;
          }

          const confirmed = window.confirm(
            `Eldobjátok ezt a borítékot?\n\n${activeEnvelopeQuest.title}`
          );

          if (!confirmed) {
            return;
          }

          await useEnvelopeRedraw(
            joinedRoom.id,
            joker.id
          );

          setActiveTab("ENVELOPE");

          alert(
            "🔄 Új borítékot húztatok."
          );

          break;
        }

        case "DELEGATE": {
          const delegatedPlayer = window.prompt(
            "Ki teljesíti a feladatot a vőlegény helyett?"
          );

          if (!delegatedPlayer?.trim()) {
            return;
          }

          const confirmed = window.confirm(
            `Delegált játékos: ${delegatedPlayer.trim()}\n\nA kártya felhasználásra kerül.`
          );

          if (!confirmed) {
            return;
          }

          await consumeJoker(
            joinedRoom.id,
            joker.id
          );

          alert(
            `🫵 Delegálás aktiválva. A feladatot ${delegatedPlayer.trim()} teljesíti.`
          );

          break;
        }

        case "COOP": {
          const helper = window.prompt(
            "Ki segít a vőlegénynek?"
          );

          if (!helper?.trim()) {
            return;
          }

          const confirmed = window.confirm(
            `Segítő játékos: ${helper.trim()}\n\nA kártya felhasználásra kerül.`
          );

          if (!confirmed) {
            return;
          }

          await consumeJoker(
            joinedRoom.id,
            joker.id
          );

          alert(
            `🤝 Co-op mód aktiválva. Segítő: ${helper.trim()}.`
          );

          break;
        }

        case "REVERSE": {
          const targetPlayer = window.prompt(
            "Ki kapja meg a feladatot?"
          );

          if (!targetPlayer?.trim()) {
            return;
          }

          const confirmed = window.confirm(
            `A feladat új gazdája: ${targetPlayer.trim()}\n\nA kártya felhasználásra kerül.`
          );

          if (!confirmed) {
            return;
          }

          await consumeJoker(
            joinedRoom.id,
            joker.id
          );

          alert(
            `🔁 Reverse Card aktiválva. A feladatot ${targetPlayer.trim()} kapta.`
          );

          break;
        }
      }
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült felhasználni a jokert."
      );
    } finally {
      setJokerActionId(null);
    }
  }

  async function handleSelectNormalQuest(quest: Quest) {
    if (!joinedRoom) return;
    try {
      setQuestActionId(quest.id);
      await setActiveNormalQuest(joinedRoom.id, quest.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nem sikerült kijelölni a feladatot.");
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleTimedScoreChange(quest: Quest, delta: 1 | -1) {
    if (!joinedRoom) return;
    try {
      setQuestActionId(quest.id);
      await changeTimedScoreCount(joinedRoom.id, quest.id, delta);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nem sikerült módosítani a számlálót.");
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleFinishTimedScore(quest: Quest) {
    if (!joinedRoom || !activePlayerName) return;
    if (!window.confirm(`Lezárjátok a kihívást?\n\n${quest.title}`)) return;
    try {
      setQuestActionId(quest.id);
      const result = await finishTimedScoreQuest(joinedRoom.id, quest.id, activePlayerName);
      if (result.completed) {
        setCompletionAnimation({ visible: true, title: quest.title, awardedXp: result.awardedPoints, doubleXp: joinedRoom.doubleXpActive });
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nem sikerült lezárni a kihívást.");
    } finally {
      setQuestActionId(null);
    }
  }

  async function handleAddQuest(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!joinedRoom) {
      return;
    }

    const quest: NewQuest = {
      title: newQuestTitle,
      description: newQuestDescription,
      points: Number(newQuestPoints),
      type: newQuestType,
      completionMode: newCompletionMode,

      targetCount:
        newCompletionMode === "COUNTER"
          ? Number(newTargetCount)
          : undefined,

      durationSeconds:
        newCompletionMode === "TIMER"
          ? Number(newDurationSeconds)
          : undefined
    };

    try {
      setLoading(true);

      await addQuest(
        joinedRoom.id,
        quest
      );

      setNewQuestTitle("");
      setNewQuestDescription("");
      setNewQuestPoints("20");
      setNewQuestType("NORMAL");
      setNewCompletionMode("SIMPLE");
      setNewTargetCount("5");
      setNewDurationSeconds("60");

      alert("Feladat hozzáadva.");
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült hozzáadni a feladatot."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleLeaveRoom() {
    if (joinedRoom && activePlayer) {
      void setPlayerPresence(joinedRoom.id, activePlayer.id, false);
    }
    setJoinedRoom(null);
    setPlayers([]);
    setQuests([]);
    setJokers([]);
    setActivePlayerName("");
    setActivePlayerId("");
    setCreatedRoomCode("");
    setActiveTab("NORMAL");
    setGroomVisible(false);
    setGroomCycle(0);

    sessionStorage.removeItem(
      SESSION_ROOM_CODE
    );

    sessionStorage.removeItem(
      SESSION_PLAYER_NAME
    );
    sessionStorage.removeItem(SESSION_PLAYER_ID);
    sessionStorage.removeItem(SESSION_VIEW_MODE);
  }

  function handleForgetAndLeave() {
    localStorage.removeItem(LOCAL_REMEMBERED_SESSION);
    handleLeaveRoom();
  }

  useEffect(() => {
    const remembered = readRememberedSession();
    const savedRoomCode = sessionStorage.getItem(SESSION_ROOM_CODE) ?? remembered?.roomCode ?? "";
    const savedMode = (sessionStorage.getItem(SESSION_VIEW_MODE) as AppViewMode | null) ?? remembered?.mode ?? "COMPANION";
    if (!sessionStorage.getItem(SESSION_ROOM_CODE) && remembered) {
      sessionStorage.setItem(SESSION_ROOM_CODE, remembered.roomCode);
      sessionStorage.setItem(SESSION_VIEW_MODE, remembered.mode);
      sessionStorage.setItem(SESSION_PLAYER_ID, remembered.playerId);
      if (remembered.mode === "COMPANION" && remembered.playerName) sessionStorage.setItem(SESSION_PLAYER_NAME, remembered.playerName);
      setActivePlayerId(remembered.playerId);
      if (remembered.mode === "COMPANION") {
        setPlayerName(remembered.playerName);
        setActivePlayerName(remembered.playerName);
      }
    }

    if (savedRoomCode) {
      void handleJoinRoom(savedRoomCode, savedMode);
    }
  }, []);

  useEffect(() => {
    if (!joinedRoom || !activePlayerId || viewMode !== "COMPANION") return;
    void setPlayerPresence(joinedRoom.id, activePlayerId, true).catch(() => undefined);
  }, [joinedRoom?.id, activePlayerId, viewMode]);

  useEffect(() => {
    if (!joinedRoom) {
      return;
    }

    const roomId = joinedRoom.id;

    const unsubscribeRoom = subscribeRoom(
      roomId,
      (updatedRoom) => {
        if (!updatedRoom) {
          alert(
            "A játék már nem létezik."
          );

          handleLeaveRoom();
          return;
        }

        setJoinedRoom(updatedRoom);
      }
    );

    const unsubscribePlayers =
      subscribePlayers(
        roomId,
        (updatedPlayers) => {
          const nextPlayers = updatedPlayers as PlayerView[];
          setPlayers(nextPlayers);
          const rememberedId = sessionStorage.getItem(SESSION_PLAYER_ID) ?? activePlayerId;
          if (viewMode === "COMPANION" && rememberedId) {
            const rememberedPlayer = nextPlayers.find((player) => player.id === rememberedId);
            if (rememberedPlayer) {
              setActivePlayerId(rememberedPlayer.id);
              setActivePlayerName(rememberedPlayer.name);
              setPlayerName(rememberedPlayer.name);
            } else {
              setActivePlayerId("");
              setActivePlayerName("");
              sessionStorage.removeItem(SESSION_PLAYER_ID);
              sessionStorage.removeItem(SESSION_PLAYER_NAME);
              localStorage.removeItem(LOCAL_REMEMBERED_SESSION);
            }
          }
        }
      );

    const unsubscribeQuests =
      subscribeQuests(
        roomId,
        setQuests
      );

    const unsubscribeJokers =
      subscribeJokers(
        roomId,
        setJokers
      );

    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
      unsubscribeQuests();
      unsubscribeJokers();
    };
  }, [joinedRoom?.id, activePlayerId, viewMode]);

  function renderQuestCard(
    quest: Quest
  ) {
	   if (quest.completed) {
    return null;
  }
  
    const mode = getQuestMode(quest);

    const isDoubleXpActive = Boolean(
      joinedRoom?.doubleXpActive
    );

    const remainingSeconds =
      getRemainingSeconds(quest);

    const timerRunning =
      remainingSeconds !== null &&
      remainingSeconds > 0;

    const timerExpired =
      remainingSeconds === 0 &&
      Boolean(quest.timerEndsAt);

    const currentCount = Number(
      quest.currentCount ?? 0
    );

    const targetCount = Math.max(
      1,
      Number(quest.targetCount ?? 1)
    );

    const countPercent = Math.min(
      100,
      Math.round(
        (currentCount / targetCount) * 100
      )
    );

    return (
      <article
        key={quest.id}
        style={{
          padding: 18,
          marginBottom: 16,
          border: `3px solid ${theme.border}`,
          borderRadius: 4,
          background: theme.panel2,
          boxShadow: `6px 6px 0 ${theme.shadow}`
        }}
      >
        <img
          src={
            quest.photoUrl ??
            quest.fallbackImageUrl
          }
          alt={quest.title}
          loading="lazy"
          className="quest-image"
        />

        <small
          style={{
            display: "block",
            marginTop: 12,
            color: theme.muted
          }}
        >
          {getQuestTypeLabel(quest.type)}
          {" · "}
          {getCompletionModeLabel(mode)}
        </small>

        <h3 style={{ color: theme.text }}>
          {quest.title}
        </h3>

        <p style={{ color: theme.muted }}>
          {quest.description}
        </p>

        <strong style={{ color: theme.gold }}>
          +
          {isDoubleXpActive
            ? quest.points * 2
            : quest.points}{" "}
          XP
        </strong>

        {isDoubleXpActive && (
          <p style={{ color: theme.gold }}>
            ✨ A Double XP ennél a sikeres
            teljesítésnél használódik fel.
          </p>
        )}

        {quest.type === "NORMAL" && (
          <div className="active-quest-selector">
            <button type="button" onClick={() => void handleSelectNormalQuest(quest)} disabled={questActionId === quest.id}>
              {joinedRoom?.activeNormalQuestId === quest.id ? "📡 A VŐLEGÉNY EZT LÁTJA" : "📺 MUTASD A VŐLEGÉNYNEK"}
            </button>
          </div>
        )}

        {mode === "SIMPLE" && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() =>
                void handleSimpleCompletion(
                  quest
                )
              }
              disabled={
                questActionId === quest.id ||
                !activePlayerName
              }
            >
              {questActionId === quest.id
                ? "Mentés..."
                : "✅ Teljesítve"}
            </button>
          </div>
        )}

        {mode === "COUNTER" && (
          <div style={{ marginTop: 16 }}>
            <strong>
              {currentCount} / {targetCount}
            </strong>

            <div
              style={{
                height: 18,
                margin: "10px 0",
                overflow: "hidden",
                background: "#0d1320",
                border: `3px solid ${theme.borderSoft}`,
                boxShadow:
                  "inset 2px 2px 0 #05070d"
              }}
            >
              <div
                style={{
                  width: `${countPercent}%`,
                  height: "100%",
                  background:
                    "repeating-linear-gradient(90deg, #507f6b 0, #507f6b 12px, #68b08a 12px, #68b08a 24px)",
                  transition:
                    "width 250ms steps(10, end)"
                }}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                void handleCounterIncrement(
                  quest
                )
              }
              disabled={
                questActionId === quest.id ||
                !activePlayerName
              }
            >
              {questActionId === quest.id
                ? "Mentés..."
                : "➕ Megvan egy"}
            </button>

            <p style={{ color: theme.muted }}>
              Az XP csak {targetCount} darab
              elérésekor jár.
            </p>
          </div>
        )}

        {mode === "TIMED_SCORE" && (
          <div className="timed-score-panel">
            <div className="timed-score-stats">
              <strong>{currentCount} / {quest.maximumCount ?? targetCount}</strong>
              <span>Minimum: {targetCount}</span>
              <span>{quest.pointsPerCount ?? 1} XP / találat</span>
              <span>Időbónusz: +{quest.timeBonusPercent ?? 30}%</span>
            </div>
            {!quest.timerEndsAt ? (
              <button type="button" onClick={() => void handleStartTimer(quest)} disabled={questActionId === quest.id || !activePlayerName}>⏱️ Kihívás indítása</button>
            ) : (
              <>
                <div className={`timed-score-clock ${timerExpired ? "timed-score-clock--expired" : ""}`}>{formatSeconds(remainingSeconds ?? 0)}</div>
                <div className="timed-score-controls">
                  <button type="button" onClick={() => void handleTimedScoreChange(quest, -1)} disabled={questActionId === quest.id || currentCount <= 0}>−</button>
                  <button type="button" onClick={() => void handleTimedScoreChange(quest, 1)} disabled={questActionId === quest.id || currentCount >= (quest.maximumCount ?? targetCount)}>+ HELYES</button>
                </div>
                <p>Aktuális alappont: {currentCount * (quest.pointsPerCount ?? 1)} XP</p>
                <button type="button" onClick={() => void handleFinishTimedScore(quest)} disabled={questActionId === quest.id}>🏁 Kihívás lezárása</button>
              </>
            )}
          </div>
        )}

        {mode === "TIMER" && (
          <div style={{ marginTop: 16 }}>
            {!quest.timerEndsAt && (
              <button
                type="button"
                onClick={() =>
                  void handleStartTimer(quest)
                }
                disabled={
                  questActionId === quest.id ||
                  !activePlayerName
                }
              >
                {questActionId === quest.id
                  ? "Indítás..."
                  : "⏱️ Időzítő indítása"}
              </button>
            )}

            {timerRunning && (
              <div>
                <div
                  style={{
                    marginTop: 14,
                    fontSize: 30,
                    fontWeight: "bold",
                    color: theme.accent2,
                    textShadow:
                      `3px 3px 0 ${theme.shadow}`,
                    fontVariantNumeric:
                      "tabular-nums"
                  }}
                >
                  {formatSeconds(
                    remainingSeconds ?? 0
                  )}
                </div>

                <p style={{ color: theme.muted }}>
                  Indította:{" "}
                  {quest.timerStartedBy ??
                    "ismeretlen"}
                </p>
              </div>
            )}

            {timerExpired && (
              <div
                style={{
                  padding: 16,
                  marginTop: 12,
                  border: `3px solid ${theme.warning}`,
                  borderRadius: 4,
                  background: "#2a2332",
                  boxShadow:
                    `4px 4px 0 ${theme.shadow}`
                }}
              >
                <h3
                  style={{
                    color: theme.warning
                  }}
                >
                  ⏰ Lejárt az idő!
                </h3>

                <p
                  style={{
                    color: theme.text
                  }}
                >
                  Sikerült a feladat?
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void handleTimedSuccess(
                      quest
                    )
                  }
                  disabled={
                    questActionId === quest.id
                  }
                >
                  ✅ Igen
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleTimedFailure(
                      quest
                    )
                  }
                  disabled={
                    questActionId === quest.id
                  }
                  style={{
                    marginLeft: 8,
                    background: theme.danger
                  }}
                >
                  ❌ Nem
                </button>
              </div>
            )}
          </div>
        )}
      </article>
    );
  }

  const panelStyle = {
    marginTop: 24,
    padding: 20,
    border: `3px solid ${theme.border}`,
    borderRadius: 4,
    background: theme.panel,
    boxShadow:
      `6px 6px 0 ${theme.shadow}, inset 2px 2px 0 #61779b`
  } as const;

  if (!joinedRoom) {
    return (
      <main className="landing-page">
        <div className="pixel-title-box"><h1>🎮 Quest Before Marriage</h1><p>Legénybúcsú RPG</p></div>
        <section style={panelStyle}>
          <h2>🛡️ Új küldetés indítása</h2>
          <div className="landing-form-grid">
            <label><span>Vőlegény neve</span><input value={roomGroomName} onChange={(event) => setRoomGroomName(event.target.value)} maxLength={30} /></label>
            <label><span>Győzelmi cél (XP)</span><input type="number" min={100} max={5000} step={50} value={roomTargetXp} onChange={(event) => setRoomTargetXp(event.target.value)} /></label>
            <label><span>Kezdő pont (kísérők)</span><input type="number" min={0} value={roomStartingPoints} onChange={(event) => setRoomStartingPoints(String(Math.max(0, Number(event.target.value) || 0)))} /></label>
          </div>
          <button type="button" onClick={handleCreateRoom} disabled={loading}>{loading ? "Létrehozás..." : "Új játék létrehozása"}</button>
          {createdRoomCode && <p>Szobakód: <strong className="pixel-code">{createdRoomCode}</strong></p>}
        </section>
        <section style={panelStyle}>
          <h2>🚪 Belépés a szobába</h2>
          <input className="landing-room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="SZOBKÓD" maxLength={6} autoComplete="off" />
          <div className="landing-role-buttons">
            <button type="button" onClick={() => void handleJoinRoom(joinCode, "COMPANION")} disabled={loading || joinCode.length !== 6}>🧙 Kísérők felülete</button>
            <button type="button" onClick={() => void handleJoinRoom(joinCode, "GROOM")} disabled={loading || joinCode.length !== 6}>🤴 Vőlegény felülete</button>
          </div>
        </section>
        <section className="retro-rules" style={panelStyle}>
          <h2>📜 Kalandorkézikönyv</h2>
          <p>Üdv, bátor kalandor! Juttassátok el a vőlegényt a házasság végső boss harcáig.</p>
          <div className="retro-rules-grid">
            <article><strong>1. KÜLDETÉSEK</strong><span>Teljesítsetek próbákat és gyűjtsetek XP-t.</span></article>
            <article><strong>2. JOKEREK</strong><span>Használjatok ritka varázstárgyakat.</span></article>
            <article><strong>3. BÜNTETÉSEK</strong><span>A perverz számláló veszélyes dolgokat idézhet meg.</span></article>
            <article><strong>4. VŐLEGÉNYVADÁSZAT</strong><span>Ha felugrik az arca, csapj le rá személyes pontokért.</span></article>
            <article><strong>5. FINAL BOSS</strong><span>A cél-XP után is folytatható a játék.</span></article>
          </div>
        </section>
        <footer className="landing-footer">⚔ CREATED BY TAMÁS SZABO ⚔</footer>
      </main>
    );
  }

  if (viewMode === "GROOM") {
    const groomCertificateUnlocked = joinedRoom.currentXp >= joinedRoom.targetXp;
    const groomMainMenuItems = [
      ["NORMAL", "🎯", groomCertificateUnlocked ? "Aktuális feladat & kalandlevél" : "Aktuális feladat"]
    ] as const;
    const groomMiniGameItems = [
      ["SHOP", "🛒", "Shop"],
      ["INVENTORY", "🎒", "Inventory"],
      ["PVP", "⚔️", "PvP Aréna"],
      ["PVE", "👹", "PvE Aréna"],
      ["SLOT", "🎰", "Kaszinó"]
    ] as const;

    return (
      <div className="groom-shell">
        <header className="groom-menu-header">
          <button
            type="button"
            className="hamburger-button"
            aria-label="Vőlegény menü megnyitása"
            aria-expanded={menuOpen}
            aria-controls="groom-menu"
            onClick={() => setMenuOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
        </header>

        {menuOpen && (
          <div
            className="hamburger-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setMenuOpen(false);
            }}
          >
            <aside id="groom-menu" className="hamburger-drawer" aria-label="Vőlegény menü">
              <div className="hamburger-drawer__header">
                <div>
                  <small>Quest Before Marriage</small>
                  <strong>🤴 Vőlegény menü</strong>
                </div>
                <button type="button" className="hamburger-close" aria-label="Menü bezárása" onClick={() => setMenuOpen(false)}>✕</button>
              </div>

              <div className="hamburger-room-summary">
                <span>Szoba</span>
                <strong>{joinedRoom.roomCode}</strong>
                <span>{joinedRoom.currentXp} / {joinedRoom.targetXp} XP</span>
              </div>

              <nav className="hamburger-menu-list">
                {groomMainMenuItems.map(([tab, icon, label]) => (
                  <button key={tab} type="button" className={activeTab === tab ? "is-active" : ""} onClick={() => navigateFromMenu(tab, "groom-active-view-anchor")}>
                    <span aria-hidden="true">{icon}</span><span>{label}</span>{activeTab === tab && <b>●</b>}
                  </button>
                ))}
                <div className="hamburger-separator" aria-hidden="true" />
                {groomMiniGameItems.map(([tab, icon, label]) => (
                  <button key={tab} type="button" className={activeTab === tab ? "is-active" : ""} onClick={() => navigateFromMenu(tab, "groom-active-view-anchor")}>
                    <span aria-hidden="true">{icon}</span><span>{label}</span>{activeTab === tab && <b>●</b>}
                  </button>
                ))}
              </nav>

              <div className="hamburger-separator" aria-hidden="true" />
              <button
                type="button"
                className="hamburger-logout"
                onClick={() => { setMenuOpen(false); handleLeaveRoom(); }}
              >
                🚪 Kilépés a szobából
              </button>
              <button type="button" className="hamburger-logout" onClick={() => { setMenuOpen(false); handleForgetAndLeave(); }}>🔄 Játékosváltás / elfelejtés</button>
            </aside>
          </div>
        )}

        {groomPlayer && (
          <ChallengePopup
            roomId={joinedRoom.id}
            playerId={groomPlayer.id}
            onOpenArena={() => setActiveTab("PVP")}
          />
        )}

        <div id="groom-active-view-anchor" className="active-view-anchor" />
        {activeTab === "NORMAL" && (
          <GroomGameView
            room={joinedRoom}
            quests={quests}
            players={players}
            activeNormalQuest={activeNormalQuest}
            activeEnvelopeQuest={activeEnvelopeQuest}
            activePunishmentQuest={activePunishmentQuest}
          />
        )}

        {groomPlayer && activeTab === "SHOP" && (
          <main className="groom-arena-view"><ArenaPanel roomId={joinedRoom.id} playerId={groomPlayer.id} mode="SHOP" /></main>
        )}
        {groomPlayer && activeTab === "INVENTORY" && (
          <main className="groom-arena-view"><ArenaPanel roomId={joinedRoom.id} playerId={groomPlayer.id} mode="INVENTORY" /></main>
        )}
        {groomPlayer && activeTab === "PVP" && (
          <main className="groom-arena-view"><ArenaPanel roomId={joinedRoom.id} playerId={groomPlayer.id} mode="PVP" /></main>
        )}
        {groomPlayer && activeTab === "PVE" && (
          <main className="groom-arena-view"><ArenaPanel roomId={joinedRoom.id} playerId={groomPlayer.id} mode="PVE" /></main>
        )}
        {groomPlayer && activeTab === "SLOT" && (
          <main className="groom-arena-view"><SlotMachine roomId={joinedRoom.id} player={groomPlayer} /></main>
        )}
        {!groomPlayer && activeTab !== "NORMAL" && (
          <main className="groom-arena-view"><section className="arena-panel">Vőlegény játékosrekord betöltése…</section></main>
        )}

        <ScrollToTopButton />
      </div>
    );
  }

  return (
    <main
      style={{
        width:
          "min(960px, calc(100% - 24px))",

        margin: "0 auto",
        padding: "24px 0 80px",
        color: theme.text
      }}
    >
      <header
        style={{
          ...panelStyle,
          position: "relative",
          textAlign: "center"
        }}
      >
        <button
          type="button"
          className="hamburger-button"
          aria-label="Menü megnyitása"
          aria-expanded={menuOpen}
          aria-controls="companion-menu"
          onClick={() => setMenuOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>

        <h1>
          🎮 Quest Before Marriage
        </h1>

        <p>
          Szobakód:{" "}
          <strong className="pixel-code">
            {joinedRoom.roomCode}
          </strong>
        </p>

        {activePlayerName ? (
          <p>
            Játékos:{" "}
            <strong>
              {activePlayerName}
            </strong>
          </p>
        ) : (
          <div className="player-login">
			  <input
				className="player-login__input"
				value={playerName}
				onChange={(event) =>
				  setPlayerName(event.target.value)
				}
				onKeyDown={(event) => {
				  if (event.key === "Enter") {
					void handleJoinAsPlayer();
				  }
				}}
				placeholder="Játékos neve"
				maxLength={30}
			  />


			  <button
				className="player-login__button"
				type="button"
				onClick={handleJoinAsPlayer}
				disabled={loading}
			  >
				{loading ? "Belépés..." : "Belépés"}
			  </button>
			</div>
        )}
      </header>

      <div
        ref={xpSectionRef}
        className="xp-scroll-target"
      >
        <XpEvolution
          currentXp={
            joinedRoom.currentXp
          }
          targetXp={
            joinedRoom.targetXp
          }
        />
      </div>

      {joinedRoom.doubleXpActive && (
        <section className="double-xp-panel">
          <div className="double-xp-icon">
            ✨
          </div>

          <div>
            <strong>
              DOUBLE XP AKTÍV
            </strong>

            <p>
              A következő sikeresen
              teljesített feladat
              kétszeres pontot ér.
            </p>

            {joinedRoom.doubleXpActivatedBy && (
              <small>
                Aktiválta:{" "}
                {
                  joinedRoom.doubleXpActivatedBy
                }
              </small>
            )}
          </div>
        </section>
      )}

      <section style={panelStyle}>
        <h2>
          👥 Játékosok ({players.length})
        </h2>

        {players.length === 0 ? (
          <p style={{ color: theme.muted }}>
            Még senki sem lépett be
            játékosként.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap"
            }}
          >
            {rankedPlayers.map((player, index) => (
              <span
                key={player.id}
                style={{
                  padding: "8px 12px",

                  border:
                    `3px solid ${theme.borderSoft}`,

                  borderRadius: 2,
                  background: theme.panel2,

                  boxShadow:
                    `3px 3px 0 ${theme.shadow}`
                }}
              >
                {index === 0 &&
                (player.huntPoints ?? 0) > 0
                  ? "🏆"
                  : "👤"}{" "}
                {player.name} ·{" "}
                <strong
                  style={{
                    color: theme.gold
                  }}
                >
                  {player.huntPoints ?? 0} pont
                </strong>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="current-section-bar">
        <span>Aktív nézet</span>
        <strong>
          {activeTab === "NORMAL" && "🎯 Normál feladatok"}
          {activeTab === "ENVELOPE" && "📩 Boríték"}
          {activeTab === "PUNISHMENT" && "😈 Büntetés"}
          {activeTab === "JOKERS" && "🃏 Jokerek"}
          {activeTab === "ROUNDS" && "🍻 Körök"}
          {activeTab === "SLOT" && "🎰 Kaszinó"}
          {activeTab === "DRAW" && "🎲 Sorsolás"}
          {activeTab === "SHOP" && "🛒 Shop"}
          {activeTab === "INVENTORY" && "🎒 Inventory"}
          {activeTab === "PVP" && "⚔️ PvP Aréna"}
          {activeTab === "PVE" && "👹 PvE Aréna"}
          {activeTab === "PIGGY" && "🐷 Persely"}
          {activeTab === "COMPLETED" && "📜 Teljesítve"}
          {activeTab === "ADD" && "➕ Új feladat"}
        </strong>
        <button type="button" onClick={() => setMenuOpen(true)}>☰ Menü</button>
      </div>

      {menuOpen && (
        <div
          className="hamburger-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setMenuOpen(false);
            }
          }}
        >
          <aside
            id="companion-menu"
            className="hamburger-drawer"
            aria-label="Játék menü"
          >
            <div className="hamburger-drawer__header">
              <div>
                <small>Quest Before Marriage</small>
                <strong>⚔ Kalandor menü</strong>
              </div>
              <button
                type="button"
                className="hamburger-close"
                aria-label="Menü bezárása"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="hamburger-room-summary">
              <span>Szoba</span>
              <strong>{joinedRoom.roomCode}</strong>
              {activePlayerName && <span>👤 {activePlayerName}</span>}
            </div>

            <nav className="hamburger-menu-list">
              {([
                ["NORMAL", "🎯", "Feladatok"],
                ["ENVELOPE", "📩", "Boríték"],
                ["PUNISHMENT", "😈", "Büntetés"],
                ["JOKERS", "🃏", "Jokerek"],
                ["ROUNDS", "🍻", "Ital körök"],
                ["COMPLETED", "📜", "Teljesített"],
                ["ADD", "➕", "Új feladat"],
                ["PIGGY", "🐷", "Persely"]
              ] as const).map(([tab, icon, label]) => (
                <button key={tab} type="button" className={activeTab === tab ? "is-active" : ""} onClick={() => navigateFromMenu(tab, "companion-active-view-anchor")}>
                  <span aria-hidden="true">{icon}</span><span>{label}</span>{activeTab === tab && <b>●</b>}
                </button>
              ))}
              <div className="hamburger-separator" aria-hidden="true" />
              {([
                ["SHOP", "🛒", "Shop"],
                ["INVENTORY", "🎒", "Inventory"],
                ["PVP", "⚔️", "PvP Aréna"],
                ["PVE", "👹", "PvE Aréna"],
                ["SLOT", "🎰", "Kaszinó"],
                ["DRAW", "🎲", "Survivor draw"]
              ] as const).map(([tab, icon, label]) => (
                <button key={tab} type="button" className={activeTab === tab ? "is-active" : ""} onClick={() => navigateFromMenu(tab, "companion-active-view-anchor")}>
                  <span aria-hidden="true">{icon}</span><span>{label}</span>{activeTab === tab && <b>●</b>}
                </button>
              ))}
            </nav>

            <div className="hamburger-separator" aria-hidden="true" />
            <button
              type="button"
              className="hamburger-logout"
              onClick={() => {
                setMenuOpen(false);
                handleLeaveRoom();
              }}
            >
              🚪 Kilépés a szobából
            </button>
            <button type="button" className="hamburger-logout" onClick={() => { setMenuOpen(false); handleForgetAndLeave(); }}>🔄 Játékosváltás / elfelejtés</button>
          </aside>
        </div>
      )}

        <div id="companion-active-view-anchor" className="active-view-anchor" />
        {activePlayer && <ChallengePopup roomId={joinedRoom.id} playerId={activePlayer.id} onOpenArena={() => { setActiveTab("PVP"); setMenuOpen(false); }} />}

        {activePlayer && activeTab === "SHOP" && <ArenaPanel roomId={joinedRoom.id} playerId={activePlayer.id} mode="SHOP" />}
        {activePlayer && activeTab === "INVENTORY" && <ArenaPanel roomId={joinedRoom.id} playerId={activePlayer.id} mode="INVENTORY" />}
        {activePlayer && activeTab === "PVP" && <ArenaPanel roomId={joinedRoom.id} playerId={activePlayer.id} mode="PVP" />}
        {activePlayer && activeTab === "PVE" && <ArenaPanel roomId={joinedRoom.id} playerId={activePlayer.id} mode="PVE" />}
        {activePlayer && activeTab === "PIGGY" && <PiggyBankPanel roomId={joinedRoom.id} activePlayer={activePlayer} players={players} />}
        {["SHOP","INVENTORY","PVP","PVE","PIGGY"].includes(activeTab) && !activePlayer && <section style={panelStyle}><p>Az aréna és a shop használatához előbb lépj be játékosként.</p></section>}

		{activeTab === "NORMAL" && (
		  <section style={{ marginTop: 24 }}>
			<h2>
			  🎯 Normál feladatok ({normalQuests.length})
			</h2>

			{normalQuests.length === 0 ? (
			  <div style={panelStyle}>
				<p>
				  Nincs több aktív normál feladat.
				</p>
			  </div>
			) : (
			  normalQuests.map(renderQuestCard)
			)}
		  </section>
		)}

      {activeTab === "ENVELOPE" && (
        <section
          style={{
            ...panelStyle,
            border:
              `3px solid ${theme.accent2}`
          }}
        >
          <h2>📩 Borítékos feladat</h2>

          {!activeEnvelopeQuest ? (
            <>
              <p style={{ color: theme.muted }}>
                Jelenleg nincs aktív
                boríték.
              </p>

              <button
                type="button"
                onClick={
                  handleDrawEnvelope
                }
                disabled={
                  loading ||
                  !activePlayerName
                }
              >
                {loading
                  ? "Húzás..."
                  : "🎲 Véletlenszerű boríték húzása"}
              </button>
            </>
          ) : (
            renderQuestCard(
              activeEnvelopeQuest
            )
          )}
        </section>
      )}

      {activeTab === "PUNISHMENT" && (
        <section
          style={{
            ...panelStyle,
            border:
              `3px solid ${theme.danger}`
          }}
        >
          <h2>😈 Büntetés</h2>

          <div
            style={{
              padding: 16,
              marginBottom: 20,

              border:
                `3px solid ${theme.danger}`,

              borderRadius: 4,
              textAlign: "center",
              background: "#2e2230",

              boxShadow:
                `4px 4px 0 ${theme.shadow}`
            }}
          >
            <h3>Perverz számláló</h3>

            <div
              style={{
                fontSize: 28,
                fontWeight: "bold",
                color: theme.text
              }}
            >
              {joinedRoom.pervyCount} /{" "}
              {joinedRoom.pervyThreshold}
            </div>

            <div
              style={{
                height: 18,
                margin: "14px 0",
                overflow: "hidden",
                background: "#0d1320",

                border:
                  `3px solid ${theme.borderSoft}`
              }}
            >
              <div
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (joinedRoom.pervyCount /
                        Math.max(
                          1,
                          joinedRoom.pervyThreshold
                        )) *
                        100
                    )
                  )}%`,

                  height: "100%",

                  background:
                    "repeating-linear-gradient(90deg, #8a4a5e 0, #8a4a5e 12px, #b9687f 12px, #b9687f 24px)"
                }}
              />
            </div>

            <button
              type="button"
              onClick={
                handlePervyComment
              }
              disabled={
                loading ||
                !activePlayerName ||
                Boolean(
                  activePunishmentQuest
                )
              }
              style={{
                marginTop: 12,
                background: theme.danger
              }}
            >
              🔞 Perverz megjegyzés
              történt
            </button>

            {activePunishmentQuest && (
              <p>
                Előbb teljesítsétek vagy
                védjétek ki az aktív
                büntetést.
              </p>
            )}
          </div>

          {!activePunishmentQuest ? (
            <p style={{ color: theme.muted }}>
              Jelenleg nincs aktív
              büntetés.
            </p>
          ) : (
            renderQuestCard(
              activePunishmentQuest
            )
          )}
        </section>
      )}

      {activeTab === "JOKERS" && (
        <section style={{ marginTop: 24 }}>
          <h2>
            🃏 Joker inventory (
            {availableJokers.length} aktív)
          </h2>

          {jokers.length === 0 ? (
            <div style={panelStyle}>
              <p>
                Ebben a szobában még
                nincsenek jokerek.
              </p>

              <button
                type="button"
                onClick={handleSeedJokers}
                disabled={loading}
              >
                🃏 Alap joker csomag
                létrehozása
              </button>
            </div>
          ) : (
            jokers.map((joker) => {
              const isAvailable =
                joker.remainingUses > 0;

              return (
                <article
                  key={joker.id}
                  style={{
                    padding: 20,
                    marginBottom: 16,

                    border: `3px solid ${
                      isAvailable
                        ? theme.accent2
                        : theme.borderSoft
                    }`,

                    borderRadius: 4,

                    opacity:
                      isAvailable ? 1 : 0.5,

                    background:
                      theme.panel2,

                    boxShadow:
                      `6px 6px 0 ${theme.shadow}`
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "center"
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        placeItems: "center",

                        width: 70,
                        minWidth: 70,
                        height: 70,

                        fontSize: 40,

                        background: "#111827",

                        border:
                          `3px solid ${theme.border}`,

                        boxShadow:
                          `4px 4px 0 ${theme.shadow}`
                      }}
                    >
                      {joker.icon}
                    </div>

                    <div style={{ flex: 1 }}>
                      <h3
                        style={{
                          marginTop: 0,
                          marginBottom: 8
                        }}
                      >
                        {joker.title}
                      </h3>

                      <strong
                        style={{
                          color: theme.gold
                        }}
                      >
                        Felhasználható:{" "}
                        {joker.remainingUses} /{" "}
                        {joker.initialUses}
                      </strong>
                    </div>
                  </div>

                  <p
                    style={{
                      color: theme.muted
                    }}
                  >
                    {joker.description}
                  </p>

                  {joker.type ===
                    "DOUBLE_XP" &&
                    joinedRoom.doubleXpActive && (
                      <p
                        style={{
                          color: theme.gold
                        }}
                      >
                        ✨ Jelenleg már aktív
                        egy Double XP.
                      </p>
                    )}

                  {joker.type ===
                    "SHIELD" &&
                    !activePunishmentQuest && (
                      <p>
                        A pajzs használatához
                        aktív büntetés
                        szükséges.
                      </p>
                    )}

                  {joker.type ===
                    "REDRAW" &&
                    !activeEnvelopeQuest && (
                      <p>
                        Az újrahúzáshoz aktív
                        boríték szükséges.
                      </p>
                    )}

                  <button
                    type="button"
                    onClick={() =>
                      void handleUseJoker(
                        joker
                      )
                    }
                    disabled={
                      !isAvailable ||
                      !activePlayerName ||
                      jokerActionId ===
                        joker.id ||
                      (joker.type ===
                        "DOUBLE_XP" &&
                        joinedRoom.doubleXpActive) ||
                      (joker.type ===
                        "SHIELD" &&
                        !activePunishmentQuest) ||
                      (joker.type ===
                        "REDRAW" &&
                        !activeEnvelopeQuest)
                    }
                  >
                    {jokerActionId ===
                    joker.id
                      ? "Használat..."
                      : isAvailable
                        ? "Joker használata"
                        : "Elfogyott"}
                  </button>
                </article>
              );
            })
          )}
        </section>
      )}

      {activeTab === "ROUNDS" && (
        <RoundCounterPanel
          roomId={joinedRoom.id}
          players={players}
          activePlayer={activePlayer}
        />
      )}

      {activeTab === "SLOT" && (
        <SlotMachine
          roomId={joinedRoom.id}
          player={activePlayer}
        />
      )}

      {activeTab === "DRAW" && (
        <SurvivorDraw roomId={joinedRoom.id} players={players} />
      )}

      {activeTab === "COMPLETED" && (
        <section style={{ marginTop: 24 }}>
          <h2>
            📜 Teljesített feladatok (
            {completedQuests.length})
          </h2>

          {playerStatistics.length > 0 && (
            <div style={panelStyle}>
              <h3>🏅 Játékos statisztika</h3>

              {playerStatistics.map(
                (statistic, index) => (
                  <div
                    key={statistic.name}
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 12,
                      padding: "10px 0",

                      borderBottom:
                        index <
                        playerStatistics.length -
                          1
                          ? `2px solid ${theme.borderSoft}`
                          : "none"
                    }}
                  >
                    <span>
                      {index === 0
                        ? "🏆"
                        : "👤"}{" "}
                      {statistic.name}
                    </span>

                    <strong
                      style={{
                        color: theme.gold
                      }}
                    >
                      {
                        statistic.completedCount
                      }{" "}
                      feladat ·{" "}
                      {statistic.earnedXp} XP
                    </strong>
                  </div>
                )
              )}
            </div>
          )}

          {completedQuests.length === 0 ? (
            <div style={panelStyle}>
              <p>
                Még nincs teljesített
                feladat.
              </p>
            </div>
          ) : (
            completedQuests.map((quest) => (
              <article
                key={quest.id}
                style={{
                  padding: 16,
                  marginBottom: 12,

                  border:
                    `3px solid ${theme.success}`,

                  borderRadius: 4,
                  background: theme.panel2,

                  boxShadow:
                    `5px 5px 0 ${theme.shadow}`
                }}
              >
                <img
                  src={
                    quest.photoUrl ??
                    quest.fallbackImageUrl
                  }
                  alt={quest.title}
                  loading="lazy"
                  className="quest-image"
                />

                <h3>
                  ✅ {quest.title}
                </h3>

                <p>
                  Típus:{" "}
                  {getQuestTypeLabel(
                    quest.type
                  )}
                </p>

                <p>
                  Teljesítette:{" "}
                  <strong>
                    {quest.completedBy ??
                      "Ismeretlen"}
                  </strong>
                </p>

                <p>
                  Megszerzett pont:{" "}
                  <strong
                    style={{
                      color: theme.gold
                    }}
                  >
                    +
                    {quest.awardedPoints ??
                      quest.points}{" "}
                    XP
                  </strong>
                </p>

                {quest.awardedPoints !== null &&
                  quest.awardedPoints >
                    quest.points && (
                    <p
                      style={{
                        color: theme.gold
                      }}
                    >
                      ✨ Double XP feladat
                    </p>
                  )}

                {quest.completedAt && (
                  <small
                    style={{
                      color: theme.muted
                    }}
                  >
                    {formatDate(
                      quest.completedAt
                    )}
                  </small>
                )}
              </article>
            ))
          )}
        </section>
      )}

      {activeTab === "ADD" && (
        <section style={panelStyle}>
          <h2>
            ➕ Új feladat hozzáadása
          </h2>

          <form
            onSubmit={handleAddQuest}
          >
            <label
              style={{
                display: "block",
                marginBottom: 8
              }}
            >
              Feladat címe
            </label>

            <input
              value={newQuestTitle}
              onChange={(event) =>
                setNewQuestTitle(
                  event.target.value
                )
              }
              placeholder="Például: Közös kép..."
              required
              style={{
                width: "100%",
                marginBottom: 18
              }}
            />

            <label
              style={{
                display: "block",
                marginBottom: 8
              }}
            >
              Leírás
            </label>

            <textarea
              value={
                newQuestDescription
              }
              onChange={(event) =>
                setNewQuestDescription(
                  event.target.value
                )
              }
              placeholder="A feladat részletes leírása"
              rows={5}
              style={{
                width: "100%",
                marginBottom: 18,
                resize: "vertical"
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))",

                gap: 18
              }}
            >
              <label>
                <span
                  style={{
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Pont
                </span>

                <input
                  type="number"
                  min={1}
                  max={500}
                  value={newQuestPoints}
                  onChange={(event) =>
                    setNewQuestPoints(
                      event.target.value
                    )
                  }
                  style={{
                    width: "100%"
                  }}
                />
              </label>

              <label>
                <span
                  style={{
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Kategória
                </span>

                <select
                  value={newQuestType}
                  onChange={(event) =>
                    setNewQuestType(
                      event.target
                        .value as QuestType
                    )
                  }
                  style={{
                    width: "100%"
                  }}
                >
                  <option value="NORMAL">
                    Normál
                  </option>

                  <option value="ENVELOPE">
                    Borítékos
                  </option>

                  <option value="PUNISHMENT">
                    Büntetés
                  </option>
                </select>
              </label>

              <label>
                <span
                  style={{
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Teljesítési mód
                </span>

                <select
                  value={
                    newCompletionMode
                  }
                  onChange={(event) =>
                    setNewCompletionMode(
                      event.target
                        .value as CompletionMode
                    )
                  }
                  style={{
                    width: "100%"
                  }}
                >
                  <option value="SIMPLE">
                    Egyszerű
                  </option>

                  <option value="COUNTER">
                    Számlálós
                  </option>

                  <option value="TIMER">
                    Időzítős
                  </option>
                </select>
              </label>
            </div>

            {newCompletionMode ===
              "COUNTER" && (
              <label
                style={{
                  display: "block",
                  marginTop: 18
                }}
              >
                <span
                  style={{
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Elérendő darabszám
                </span>

                <input
                  type="number"
                  min={1}
                  max={100}
                  value={
                    newTargetCount
                  }
                  onChange={(event) =>
                    setNewTargetCount(
                      event.target.value
                    )
                  }
                  style={{
                    width: "100%"
                  }}
                />
              </label>
            )}

            {newCompletionMode ===
              "TIMER" && (
              <label
                style={{
                  display: "block",
                  marginTop: 18
                }}
              >
                <span
                  style={{
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Időtartam másodpercben
                </span>

                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={
                    newDurationSeconds
                  }
                  onChange={(event) =>
                    setNewDurationSeconds(
                      event.target.value
                    )
                  }
                  style={{
                    width: "100%"
                  }}
                />
              </label>
            )}

            <div
              style={{
                marginTop: 24
              }}
            >
              <button
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Mentés..."
                  : "Feladat hozzáadása"}
              </button>
            </div>
          </form>
        </section>
      )}

      {groomVisible && activePlayer && viewMode === "COMPANION" && (
        <div className="groom-hunt-popup" style={{ left: `${groomPosition.left}%`, top: `${groomPosition.top}%` }}>
          <div className="groom-hunt-alert">⚠ VŐLEGÉNY ÉSZLELVE! ⚠</div>
          <button
            type="button"
            onClick={() =>
              void handleCatchGroom()
            }
            disabled={groomSaving}
            aria-label="Kapd el a vőlegényt 10 pontért"
            className="groom-hunt-target"
          >
            <img
              src="/images/groom.jpg"
              alt="A vőlegény"
              draggable={false}
              className="groom-hunt-image"
            />

            <strong
              style={{
                fontSize: 12,
                color: theme.text
              }}
            >
              {groomSaving
                ? "MENTÉS..."
                : "KAPD EL!"}
            </strong>

            <span>
              +{GROOM_REWARD_POINTS} PONT
            </span>
          </button>
        </div>
      )}

      <QuestCompleteAnimation
        visible={completionAnimation.visible}
        title={completionAnimation.title}
        awardedXp={completionAnimation.awardedXp}
        doubleXp={completionAnimation.doubleXp}
        onFinished={
          handleCompletionAnimationFinished
        }
      />

      <ScrollToTopButton />
    </main>
  );
}

export default App;