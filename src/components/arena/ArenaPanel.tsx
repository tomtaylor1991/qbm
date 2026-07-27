import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getShopItem, shopCatalog, shopCategories } from "../../data/shopCatalog";
import { buyItem, buyRandomFromCategory } from "../../services/shopService";
import {
  challengeExpiresAtMs,
  challengeIsExpired,
  createChallenge,
  expireChallengeIfNeeded,
  runPve,
  setChallengeState,
  submitLoadout,
  subscribeArenaPlayers,
  subscribeChallenges,
  validateLoadout,
  type ArenaPlayer,
  type PvpChallenge
} from "../../services/arenaService";
import { skinVictory, skinVisual } from "../../services/battleEngine";
import type { BattleLoadout, BattleLogEntry, BattleResult, ShopItem } from "../../types/arena";
import "./arena.css";

type Mode = "SHOP" | "INVENTORY" | "PVP" | "PVE";
const empty: BattleLoadout = { weapon1: null, weapon2: null, heal: null, battlePet: null };

function itemPower(item: ShopItem) {
  if (item.type === "HEAL") return item.maxHeal ?? 0;
  return item.maxDamage ?? 0;
}
function statLabel(item: ShopItem) {
  if (item.type === "HEAL") return `❤️ ${item.minHeal ?? 0}–${item.maxHeal ?? 0} heal · 🛡 ${item.defense ?? 0}`;
  if (item.type === "BATTLE_PET") return `⚔ ${item.minDamage ?? 0}–${item.maxDamage ?? 0} · 🛡 ${item.defense ?? 0} · 💨 ${item.actionLives ?? 0} élet`;
  return `⚔ ${item.minDamage ?? 0}–${item.maxDamage ?? 0} · 🛡 ${item.defense ?? 0}`;
}
function categoryId(category: string) { return `shop-${category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`; }

function LoadoutPicker({ player, value, onChange }: { player: ArenaPlayer; value: BattleLoadout; onChange: (v: BattleLoadout) => void }) {
  const items = player.inventory.flatMap((entry) => {
    const item = getShopItem(entry.itemId);
    return item ? [item] : [];
  });
  const options = (type: string) => items
    .filter((item) => item.type === type)
    .sort((a,b) => itemPower(b)-itemPower(a) || (b.defense ?? 0)-(a.defense ?? 0) || a.name.localeCompare(b.name, "hu"));
  const randomizeOwnLoadout = () => {
    const weaponPool = player.inventory.flatMap((entry) => {
      const item = getShopItem(entry.itemId);
      return item?.type === "WEAPON" ? Array.from({ length: entry.quantity }, () => item.id) : [];
    });
    const healPool = player.inventory.flatMap((entry) => {
      const item = getShopItem(entry.itemId);
      return item?.type === "HEAL" ? Array.from({ length: entry.quantity }, () => item.id) : [];
    });
    const petPool = player.inventory.flatMap((entry) => {
      const item = getShopItem(entry.itemId);
      return item?.type === "BATTLE_PET" ? Array.from({ length: entry.quantity }, () => item.id) : [];
    });
    const pickOne = (pool: string[]) => pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    const w1 = pickOne(weaponPool);
    const remainingWeapons = [...weaponPool];
    if (w1) remainingWeapons.splice(remainingWeapons.indexOf(w1), 1);
    const w2 = pickOne(remainingWeapons);
    onChange({ weapon1: w1, weapon2: w2, heal: pickOne(healPool), battlePet: petPool.length && Math.random() < 0.65 ? pickOne(petPool) : null });
  };
  const select = (label: string, key: keyof BattleLoadout, type: string) => (
    <label>
      {label}
      <select value={value[key] ?? ""} onChange={(event) => onChange({ ...value, [key]: event.target.value || null })}>
        <option value="">— üres —</option>
        {options(type).map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name} · {statLabel(item)} · {item.rarity}</option>)}
      </select>
      {value[key] && <small className="selected-stats">{statLabel(getShopItem(value[key])!)}</small>}
    </label>
  );
  return <>
    <div className="loadout-note">🎒 Te választasz 2 fegyvert + 1 healt. A csatához ezen felül kapsz <b>2 random fegyvert + 1 random healt</b>. A pet csak saját választás lehet.</div>
    <div className="loadout-actions"><button type="button" onClick={randomizeOwnLoadout}>🎲 Saját loadout random kitöltése</button></div>
    <div className="loadout-grid">
      {select("⚔ Weapon slot 1", "weapon1", "WEAPON")}
      {select("⚔ Weapon slot 2", "weapon2", "WEAPON")}
      {select("❤️ Heal slot", "heal", "HEAL")}
      {select("🐾 Battle Pet (opcionális)", "battlePet", "BATTLE_PET")}
    </div>
  </>;
}

function SlotCard({ label, itemId, emptyText, bonus=false }: { label: string; itemId: string | null | undefined; emptyText: string; bonus?: boolean }) {
  const item = itemId ? getShopItem(itemId) : null;
  return <div className={`preview-slot preview-slot-compact ${bonus ? "preview-slot-bonus" : ""} ${item ? `rarity-${item.rarity.toLowerCase()}` : "preview-slot-empty"}`}>
    <span className="preview-slot-label">{label}</span>
    {item ? <>
      <img src={item.image} alt={item.name} />
      <b>{item.name}</b>
      <small>{statLabel(item)}</small>
    </> : <><span className="preview-fist">{label.includes("🐾") ? "—" : "👊"}</span><b>{emptyText}</b></>}
  </div>;
}

function actionName(action: BattleLogEntry) {
  if (action.itemId) return getShopItem(action.itemId)?.name ?? action.actionType;
  return action.actionType === "FIST" ? "Ököl" : action.actionType;
}

function LoadoutPreview({ battle, names, ids }: { battle: BattleResult; names: Record<string,string>; ids: string[] }) {
  const loadouts = battle.loadouts ?? {};
  const bonuses = battle.bonusLoadouts ?? {};
  return <div className="battle-preview battle-preview-compact">
    <div className="preview-title">🎰 VÉGLEGES CSATA-LOADOUT</div>
    <p className="preview-subtitle">Saját felszerelés + csak erre a csatára sorsolt 2 fegyver és 1 heal. Random pet nincs.</p>
    <div className="preview-versus">
      {ids.map((id) => {
        const loadout = loadouts[id] ?? empty;
        const bonus = bonuses[id] ?? empty;
        return <div className="preview-player" key={id}>
          <h3>{names[id] ?? id}</h3><small>{battle.skins[id]}</small>
          <div className="slot-group-title">SAJÁT</div>
          <div className="preview-slots">
            <SlotCard label="⚔ 1" itemId={loadout.weapon1} emptyText="Ököl" />
            <SlotCard label="⚔ 2" itemId={loadout.weapon2} emptyText="Ököl" />
            <SlotCard label="❤️ Heal" itemId={loadout.heal} emptyText="Nincs heal" />
            <SlotCard label="🐾 Pet" itemId={loadout.battlePet} emptyText="Nincs pet" />
          </div>
          {(bonus.weapon1 || bonus.weapon2 || bonus.heal) && <>
            <div className="slot-group-title bonus-title">🎲 SORSOLT — CSAK ERRE A CSATÁRA</div>
            <div className="preview-slots preview-bonus-slots">
              <SlotCard bonus label="🎲 ⚔ 1" itemId={bonus.weapon1} emptyText="—" />
              <SlotCard bonus label="🎲 ⚔ 2" itemId={bonus.weapon2} emptyText="—" />
              <SlotCard bonus label="🎲 ❤️" itemId={bonus.heal} emptyText="—" />
            </div>
          </>}
        </div>;
      })}
    </div>
    <div className="preview-countdown">⚡ 3… 2… 1… HARC!</div>
  </div>;
}

function hpFromLog(battle: BattleResult, visible: BattleLogEntry[], ids: string[]) {
  const initial = battle.initialHp ?? Object.fromEntries(ids.map((id) => [id, 100]));
  const hp: Record<string, number> = { ...initial };
  visible.forEach((entry) => {
    if (entry.actionType === "HEAL") hp[entry.actorId] = entry.hpAfter;
    else hp[entry.defenderId] = entry.hpAfter;
  });
  return { hp, initial };
}

function BattleEvent({ action, names, active }: { action: BattleLogEntry; names: Record<string,string>; active:boolean }) {
  const item=action.itemId?getShopItem(action.itemId):null;
  return <div className={`battle-event ${active?"battle-event-active":""}`}>
    <div className="event-art">{item?<img src={item.image} alt={item.name}/>:<span>{action.actionType==="FIST"?"👊":"✨"}</span>}</div>
    <div className="event-copy">
      <small>#{action.turn} · {names[action.actorId] ?? action.actorId}</small>
      <strong>{actionName(action)}</strong>
      <div className={action.heal ? "event-number heal-number" : "event-number damage-number"}>
        {action.heal ? `+${action.heal} HP` : `−${action.damage ?? 0} HP`}
      </div>
      {action.blocked ? <b className="blocked-number">🛡 {action.blocked} blokkolva</b> : null}
      {action.finisher ? <b className="finisher-label">💀 KIVÉGZŐ CSAPÁS</b> : null}{action.crit && !action.finisher ? <b className="crit-label">⚡ CRIT</b> : null}
    </div>
  </div>;
}

function BattleView({ battle, names, footer }: { battle: BattleResult; names: Record<string, string>; footer?: ReactNode }) {
  const ids = Object.keys(battle.skins);
  const [phase, setPhase] = useState<"PREVIEW"|"FIGHT"|"DONE">("PREVIEW");
  const [index, setIndex] = useState(0);
  const battleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPhase("PREVIEW"); setIndex(0);
    const previewTimer = window.setTimeout(() => setPhase("FIGHT"), 3600);
    return () => window.clearTimeout(previewTimer);
  }, [battle]);

  useEffect(() => {
    if (phase !== "FIGHT") return;
    window.requestAnimationFrame(() => battleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (!battle.log.length) { setPhase("DONE"); return; }
    const stepMs = 1020;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = Math.min(current + 1, battle.log.length);
        if (next >= battle.log.length) { window.clearInterval(timer); window.setTimeout(() => setPhase("DONE"), 120); }
        return next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [phase, battle]);

  if (phase === "PREVIEW") return <LoadoutPreview battle={battle} names={names} ids={ids} />;

  const visible = battle.log.slice(0, index);
  const last = visible[visible.length - 1];
  const { hp, initial } = hpFromLog(battle, visible, ids);
  const intensity = last?.rarity ? `rarity-hit-${String(last.rarity).toLowerCase()}` : "";
  const item = last?.itemId ? getShopItem(last.itemId) : null;
  const attackerSide = last && last.actorId === ids[0] ? "left" : "right";
  const winnerSkin = battle.skins[battle.winnerId];

  if (phase === "DONE") {
    const loserName = names[battle.loserId] ?? battle.loserId;
    const finisher = battle.log[battle.log.length - 1];
    const finisherItem = finisher?.itemId ? getShopItem(finisher.itemId) : null;
    return <>
      <div className="battle-result battle-result-final" role="status" aria-live="polite">
        <div className="result-burst">🏆</div>
        <div className="result-stamp">GYŐZTES</div>
        <h1>{names[battle.winnerId] ?? battle.winnerId}</h1>
        <p className="result-ko">💀 {loserName} — 0 HP · KIÜTVE</p>
        {finisher && <div className="result-finisher">
          {finisherItem ? <img src={finisherItem.image} alt={finisherItem.name} /> : <span>👊</span>}
          <div><small>VÉGSŐ CSAPÁS</small><b>{finisherItem?.name ?? "Ököl"}</b><strong>−{finisher.damage ?? 0} HP</strong></div>
        </div>}
        <p className="result-quote">{skinVictory[winnerSkin] ?? "A csata véget ért."}</p>
      </div>
      {footer}
    </>;
  }

  return <>
    <div ref={battleRef} className={`battle-stage battle-stage-anchor ${intensity} ${last?.crit ? "crit-hit" : ""}`}>
      {ids.map((id, sideIndex) => <div key={id} className={`fighter fighter-${sideIndex === 0 ? "left" : "right"} ${last?.defenderId === id && last.damage ? "fighter-hit" : ""} ${last?.actorId === id && last.heal ? "fighter-heal" : ""}`}>
        <strong>{names[id] ?? id}</strong><small>{battle.skins[id]}</small>
        <div className="hp-shell"><div className="hp-fill" style={{ width: `${Math.max(0, Math.min(100, ((hp[id] ?? 0) / Math.max(1, initial[id] ?? 100)) * 100))}%` }} /></div>
        <b className="hp-number">{hp[id] ?? 0} / {initial[id] ?? 100} HP</b>
        <div className="pixel-fighter" aria-label={battle.skins[id]}>{skinVisual[battle.skins[id]] ?? "⚔️"}</div>
      </div>)}
      <div className="battle-center">
        {phase === "FIGHT" && last && <div key={`p-${last.turn}`} className={`projectile projectile-${attackerSide} ${last.actionType.toLowerCase()} ${last.crit ? "projectile-crit" : ""}`}>
          {item ? <img src={item.image} alt={item.name} /> : <span>👊</span>}
        </div>}
        {last && <div key={`f-${last.turn}`} className={`floating-number ${last.heal ? "floating-heal" : "floating-damage"} float-${last.defenderId === ids[0] ? "left" : "right"}`}>{last.heal ? `+${last.heal}` : `−${last.damage ?? 0}`}{last.crit ? " CRIT!" : ""}</div>}
        <div className="battle-status">⚔ AKCIÓ {Math.max(1,index)}/{battle.log.length}</div>
        <div className="battle-log-rich">{visible.slice(-3).map((action, idx, arr) => <BattleEvent key={action.turn} action={action} names={names} active={idx===arr.length-1}/>)}</div>
      </div>
    </div>
  </>;
}

function ArenaHelp() {
  return <details className="arena-help"><summary>📖 Hogyan működik az Aréna?</summary><p>Te választasz 2 weapon slotot, 1 heal slotot és opcionálisan 1 battle petet. Minden csatára ezen felül jár 2 véletlen fegyver + 1 véletlen heal, amelyek csak az adott csatában léteznek és nem kerülnek inventoryba. Random pet nincs. A pet minden támadással 1 életet veszít. A csata legfeljebb 15 akciós; ha a normál körök végéig nincs KO, az utolsó akció kivégző csapás, így mindig pontosan egy győztes marad talpon. PvP-ben a challenger teszi fel a tétet; PvE-ben a nehézség valóban növeli az ellenfél HP-ját, sebzését és védelmét. Győzelemkor 1, vereségkor 2 saját, ténylegesen betett tárgy veszhet el — a sorsolt ideiglenes itemek soha.</p></details>;
}

export default function ArenaPanel({ roomId, playerId, mode }: { roomId: string; playerId: string; mode: Mode }) {
  const [players, setPlayers] = useState<ArenaPlayer[]>([]);
  const [challenges, setChallenges] = useState<PvpChallenge[]>([]);
  const [loadout, setLoadout] = useState<BattleLoadout>(empty);
  const [stake, setStake] = useState(50);
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [pveResult, setPveResult] = useState<any>(null);
  const [purchaseFx, setPurchaseFx] = useState<{item:ShopItem;paid:number}|null>(null);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);

  useEffect(() => subscribeArenaPlayers(roomId, setPlayers), [roomId]);
  useEffect(() => subscribeChallenges(roomId, playerId, setChallenges), [roomId, playerId]);
  useEffect(() => {
    if (mode !== "PVP") return;
    const expirable = challenges.filter((challenge) =>
      ["PENDING", "ACCEPTED", "LOADOUT", "READY"].includes(challenge.state) &&
      !challengeIsExpired(challenge)
    );
    const expiries = expirable.map(challengeExpiresAtMs).filter(Number.isFinite);
    if (!expiries.length) return;
    const delay = Math.max(50, Math.min(...expiries) - Date.now() + 50);
    const timer = window.setTimeout(() => {
      void Promise.all(expirable.map((challenge) => expireChallengeIfNeeded(roomId, challenge.id)));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [challenges, mode, roomId]);
  useEffect(()=>{if(!purchaseFx)return;const t=window.setTimeout(()=>setPurchaseFx(null),1800);return()=>window.clearTimeout(t)},[purchaseFx]);
  useEffect(() => { setPveResult(null); setActiveChallengeId(null); setMessage(""); }, [roomId, playerId, mode]);
  useEffect(() => {
    if (mode !== "PVP") return;

    // If the user has explicitly focused a challenge (including a freshly-created
    // PENDING challenge that has not reached this snapshot yet), never replace it
    // with an older READY/FIGHTING document from a stale realtime snapshot.
    if (activeChallengeId) return;

    const current = challenges.find((challenge) =>
      ["ACCEPTED", "LOADOUT", "READY", "FIGHTING"].includes(challenge.state) &&
      (challenge.state === "FIGHTING" || !challengeIsExpired(challenge)) &&
      Boolean(challenge.acceptedAt) &&
      challenge.acceptedBy === challenge.challengedId &&
      !challenge.settled
    );
    if (current) setActiveChallengeId(current.id);
  }, [challenges, mode, activeChallengeId]);

  const me = players.find((player) => player.id === playerId);
  useEffect(() => {
    if (!me) return;
    setStake((current) => Math.min(Math.max(0, current), Math.max(0, me.huntPoints)));
  }, [me?.huntPoints]);
  const active = players.filter((player) => player.present && player.id !== playerId).sort((a,b) => a.name.localeCompare(b.name, "hu"));
  const inventory = me?.inventory ?? [];
  const ranked = useMemo(() => [...players].sort((first, second) => second.pvpWins - first.pvpWins || second.pvpPointsWon - first.pvpPointsWon), [players]);
  const owned = (item: ShopItem) => inventory.find((entry) => entry.itemId === item.id)?.quantity ?? 0;
  if (!me) return <section className="arena-panel">Játékos betöltése…</section>;

  const buy = async (item: ShopItem) => {
    try { const paid = await buyItem(roomId, me.id, item.id); setMessage(`${item.name} megvásárolva ${paid} pontért.`); setPurchaseFx({item,paid}); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Hiba"); }
  };

  if (mode === "SHOP") return <section className="arena-panel">
    <h2>🛒 Abszurd Shop</h2><p>Egyenleg: <b>{me.huntPoints}</b> személyes pont</p>
    <nav className="shop-category-nav" aria-label="Shop kategóriák">{shopCategories.map(category=><button key={category} onClick={()=>document.getElementById(categoryId(category))?.scrollIntoView({behavior:"smooth",block:"start"})}>{category}</button>)}</nav>
    {shopCategories.map((category) => <div key={category} id={categoryId(category)} className="shop-category">
      <div className="shop-heading"><h3>{category}</h3><button className="random-buy-button" onClick={async () => {
        try { const result = await buyRandomFromCategory(roomId, me.id, category); setMessage(`🎲 ${result.item.name} — ${result.paid} pont`); setPurchaseFx({item:result.item,paid:result.paid}); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Hiba"); }
      }}>🎲 Random kérek</button></div>
      <div className="shop-grid">{shopCatalog.filter((item) => item.category === category).map((item) => <article key={item.id} className={`item-card rarity-${item.rarity.toLowerCase()}`}>
        <img className="item-art" src={item.image} alt={item.name} loading="lazy" />
        <div className="item-card-body"><strong>{item.name}</strong><small>{item.type} · {item.rarity}</small><span className="item-stats">{statLabel(item)}</span><span className="item-price">{item.price} pont · nálad: {owned(item)}</span></div>
        <button className="buy-button" onClick={() => void buy(item)}>Megveszem</button>
      </article>)}</div>
    </div>)}
    {purchaseFx && <div className="purchase-toast" role="status"><div className="purchase-spark">✨</div><img src={purchaseFx.item.image} alt={purchaseFx.item.name}/><div><small>MEGSZEREZTED!</small><strong>{purchaseFx.item.name}</strong><b>−{purchaseFx.paid} pont · {purchaseFx.item.rarity}</b></div></div>}
    <p>{message}</p>
  </section>;

  if (mode === "INVENTORY") return <section className="arena-panel"><h2>🎒 Inventory</h2><p>Egyenleg: <b>{me.huntPoints}</b></p><p className="inventory-note">A csata-loadoutot közvetlenül a PvP vagy PvE Arénában állítod össze.</p><div className="inventory-grid">{inventory.map((entry) => {
    const item = getShopItem(entry.itemId); return item ? <article className="item-card inventory-card" key={entry.itemId}><img className="item-art" src={item.image} alt={item.name} /><div className="item-card-body"><strong>{item.name}</strong><small>{item.rarity} · {item.type}</small><span className="item-stats">{statLabel(item)}</span><b>×{entry.quantity}</b></div></article> : null;
  })}</div></section>;

  if (mode === "PVE") return <section className="arena-panel"><h2>👹 PvE Aréna</h2><LoadoutPicker player={me} value={loadout} onChange={setLoadout} />
    <div className="difficulty-row">{([ ["EASY", "🟢 Könnyű"], ["MEDIUM", "🟠 Közepes"], ["HARD", "🔴 Nehéz"] ] as const).map(([difficulty, label]) => <button key={difficulty} onClick={async () => {
      try { validateLoadout(me.inventory, loadout); setPveResult(null); setMessage("🎲 Saját loadout lezárva, 2 fegyver + 1 heal sorsolása…"); setPveResult(await runPve(roomId, me, difficulty, loadout)); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Hiba"); }
    }}>{label}</button>)}</div>
    {pveResult && <BattleView battle={pveResult.battle} names={{ [me.id]: me.name, "PVE-EASY": pveResult.enemyName, "PVE-MEDIUM": pveResult.enemyName, "PVE-HARD": pveResult.enemyName }} footer={<div className="loss-scene compact-settlement"><h3>{pveResult.battle.winnerId === me.id ? "🏆 Győzelem ára" : "💀 A vereség ára"}</h3><p>{pveResult.lostItems.map((id: string) => getShopItem(id)?.name ?? id).join(", ") || "Nem volt elveszíthető tárgy."}</p><b>Jutalom: {pveResult.reward} pont</b>{pveResult.giftItemId && <p>🎁 Ajándék: {getShopItem(pveResult.giftItemId)?.name ?? pveResult.giftItemId}</p>}</div>} />}
    <ArenaHelp /><p>{message}</p></section>;

  const incoming = challenges.filter((challenge) => challenge.challengedId === me.id && challenge.state === "PENDING" && !challengeIsExpired(challenge));
  const activeChallenge = activeChallengeId ? challenges.find((challenge) => challenge.id === activeChallengeId) ?? null : null;
  return <section className="arena-panel"><h2>⚔ PvP Aréna</h2>
    <div className="challenge-create"><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Válassz ellenfelet</option>{active.map((player) => <option key={player.id} value={player.id}>{player.isGroom ? "🤵 " : ""}{player.name}</option>)}</select><input aria-label="PvP tét" type="number" min={0} max={Math.max(0, me.huntPoints)} value={stake} onChange={(event) => setStake(Math.min(Math.max(0, Number(event.target.value) || 0), Math.max(0, me.huntPoints)))} /><button onClick={async () => {
      const opponent = players.find((player) => player.id === target) ?? active[Math.floor(Math.random() * active.length)];
      if (!opponent) { setMessage("Nincs elérhető ellenfél."); return; }
      const openChallenge = challenges.find((challenge) =>
        ["PENDING", "ACCEPTED", "LOADOUT", "READY", "FIGHTING"].includes(challenge.state) &&
        (challenge.state === "FIGHTING" || !challengeIsExpired(challenge)) && !challenge.settled
      );
      if (openChallenge) { setActiveChallengeId(openChallenge.id); setMessage("Már van folyamatban lévő PvP kihívásod. Előbb azt fejezd be vagy vond vissza."); return; }
      try {
        // Focus the newly-created document immediately. The selection effect will
        // deliberately keep this id even until its first realtime snapshot arrives.
        const challengeId = await createChallenge(roomId, me, opponent, stake);
        setLoadout(empty);
        setActiveChallengeId(challengeId);
        setMessage("Kihívás elküldve. A csata csak az ellenfél elfogadása után nyílik meg.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Hiba"); }
    }}>{target ? "Kihívás" : "🎲 Random ellenfél"}</button></div>
    <div className="pvp-quick-status"><span>💰 Egyenleg: <b>{me.huntPoints}</b></span><span>👥 Aktív ellenfelek: <b>{active.length}</b></span><span>🎯 Tét: <b>{stake}</b></span></div>
    {active.length > 0 && <div className="pvp-opponent-chips" aria-label="Gyors ellenfélválasztás">{active.map((player) => <button key={player.id} type="button" className={target === player.id ? "is-selected" : ""} onClick={() => setTarget(player.id)}>{player.isGroom ? "🤵 " : "⚔️ "}{player.name}</button>)}</div>}
    {incoming.map((challenge) => <div className="challenge-card" key={challenge.id}><b>{challenge.challengerName}</b> kihívott {challenge.stake} pontért · 2 percig érvényes <button onClick={() => { setActiveChallengeId(challenge.id); void setChallengeState(roomId, challenge.id, "ACCEPTED", me.id); }}>Elfogadom</button><button onClick={() => void setChallengeState(roomId, challenge.id, "DECLINED", me.id)}>Elutasítom</button></div>)}
    {activeChallenge && activeChallenge.state === "EXPIRED" && <div className="challenge-card"><b>⌛ A PvP meghívás lejárt.</b><span> A tét visszajár, új kihívást kell küldeni.</span></div>}
    {activeChallenge && activeChallenge.state === "PENDING" && activeChallenge.challengerId === me.id && <div className="challenge-card"><b>⏳ Kihívás elküldve: {activeChallenge.challengedName}</b><span> · {activeChallenge.stake} pont · 2 percig érvényes</span><button onClick={async()=>{try{await setChallengeState(roomId,activeChallenge.id,"CANCELLED",me.id);setActiveChallengeId(null);setLoadout(empty);setMessage("Kihívás visszavonva.");}catch(error){setMessage(error instanceof Error?error.message:"Hiba");}}}>Visszavonás</button></div>}
    {activeChallenge && activeChallenge.state !== "PENDING" && !["DECLINED","CANCELLED","EXPIRED"].includes(activeChallenge.state) && <div key={activeChallenge.id} className="challenge-card active-battle-card"><h3>{activeChallenge.challengerName} vs {activeChallenge.challengedName} · {activeChallenge.stake} pont</h3>
      {!activeChallenge.battle && <><LoadoutPicker player={me} value={loadout} onChange={setLoadout} /><div className="ready-row"><span>{activeChallenge.challengerName}: {activeChallenge.challengerReady ? "✅ KÉSZ" : "⏳ választ"}</span><span>{activeChallenge.challengedName}: {activeChallenge.challengedReady ? "✅ KÉSZ" : "⏳ választ"}</span></div><button onClick={async () => {
        try { validateLoadout(me.inventory, loadout); await submitLoadout(roomId, activeChallenge.id, me.id, loadout); setMessage("KÉSZ — a csata csak akkor indul, ha a kihívást elfogadták és mindketten készek."); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Hiba"); }
      }}>KÉSZ</button></>}
      {activeChallenge.battle && activeChallenge.battleChallengeId === activeChallenge.id && Boolean(activeChallenge.acceptedAt) && activeChallenge.acceptedBy === activeChallenge.challengedId && activeChallenge.challengerReady && activeChallenge.challengedReady && <BattleView battle={activeChallenge.battle} names={{ [activeChallenge.challengerId]: activeChallenge.challengerName, [activeChallenge.challengedId]: activeChallenge.challengedName }} footer={activeChallenge.state === "FINISHED" ? <div className="loss-scene compact-settlement"><h3>{activeChallenge.battle.winnerId === me.id ? "🏆 Győzelem ára" : "💀 A vereség ára"}</h3><p>{(activeChallenge.battle.winnerId === me.id ? activeChallenge.winnerLost : activeChallenge.loserLost)?.map((id) => getShopItem(id)?.name ?? id).join(", ") || "Nem veszett el saját tárgy."}</p>{activeChallenge.battle.winnerId === me.id && activeChallenge.giftItemId && <b>🎁 {getShopItem(activeChallenge.giftItemId)?.name ?? activeChallenge.giftItemId}</b>}</div> : <div className="settlement-wait">⏳ Eredmény elszámolása…</div>} />}
    </div>}
    <h3>🏆 Dicsőség fala</h3><ol className="ranking">{ranked.map((player, index) => <li key={player.id}><span>{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}</span><b>{player.name}</b><span>{player.pvpWins} győzelem · {player.pvpPointsWon} pont</span></li>)}</ol>
    <ArenaHelp /><p>{message}</p>
  </section>;
}
