import { getShopItem, shopCatalog } from "../data/shopCatalog";
import type { BattleLoadout, BattleLogEntry, BattleResult, ItemRarity, ShopItem } from "../types/arena";

export const MAX_HP = 100;
const MAX_ACTIONS = 15;
const skins = ["Pusztító Nagymama","Kerti Törpe Hadúr","Szandálos Barbár","Bajszos Hentes","Diszkókirály","Lakótelepi Ninja","Kocsmatündér","Wellness Guru","Orbán Viktor","Magyar Péter","Mészáros Lőrinc","Gyurcsány Ferenc"];
export const skinVictory: Record<string,string> = {"Pusztító Nagymama":"A húsleves kihűlt, de az ellenfél még jobban.","Kerti Törpe Hadúr":"Kicsi a törpe, nagy a pusztítás.","Szandálos Barbár":"Zokni. Szandál. Győzelem.","Bajszos Hentes":"A mérleg ma egyértelműen az ő javára billent.","Diszkókirály":"A parkett után az arénát is meghódította.","Lakótelepi Ninja":"Senki sem látta jönni. Pedig papucsban volt.","Kocsmatündér":"Egy korsó, egy varázslat, egy kiütött ellenfél.","Wellness Guru":"A belső béke megérkezett. Az ellenfél nem.","Orbán Viktor":"A meccs véget ért. A győzelem itt maradt.","Magyar Péter":"Újabb kör, újabb ellenfél, ugyanaz a végeredmény.","Mészáros Lőrinc":"Legyetek bátorak!","Gyurcsány Ferenc":"A csata véget ért. A történet biztosan folytatódik."};
export const skinVisual: Record<string,string> = {"Pusztító Nagymama":"👵","Kerti Törpe Hadúr":"🧙","Szandálos Barbár":"🩴","Bajszos Hentes":"🥩","Diszkókirály":"🕺","Lakótelepi Ninja":"🥷","Kocsmatündér":"🧚","Wellness Guru":"🧘","Orbán Viktor":"🧔","Magyar Péter":"🧑","Mészáros Lőrinc":"👷","Gyurcsány Ferenc":"🕴️"};

type EnemyConfig = { hp:number; minDamage:number; maxDamage:number; defense?:number; damageMultiplier?:number };
type CombatantState = {
  weapons: string[];
  heals: string[];
  usedHeals: Set<string>;
  petId: string | null;
  petLives: number;
  defense: number;
};

function rnd(a:number,b:number){ return a+Math.floor(Math.random()*(b-a+1)); }
function pick<T>(items:T[]){ return items[Math.floor(Math.random()*items.length)]; }
function skinPair(){ const first=pick(skins); let second=pick(skins); while(second===first) second=pick(skins); return [first,second]; }
function cloneLoadout(loadout: BattleLoadout): BattleLoadout { return { weapon1:loadout.weapon1, weapon2:loadout.weapon2, heal:loadout.heal, battlePet:loadout.battlePet }; }
function capDefense(loadout:BattleLoadout){
  const total=[loadout.weapon1,loadout.weapon2,loadout.heal,loadout.battlePet]
    .filter((id): id is string => Boolean(id))
    .reduce((sum,id)=>sum+(getShopItem(id)?.defense??0),0);
  return Math.min(5,Math.floor(total/4));
}
function randomItem(type:"WEAPON"|"HEAL"): ShopItem {
  const pool=shopCatalog.filter(item=>item.type===type);
  return pick(pool);
}
export function rollBattleBonus(): BattleLoadout {
  const w1=randomItem("WEAPON"); let w2=randomItem("WEAPON");
  while(w2.id===w1.id) w2=randomItem("WEAPON");
  const heal=randomItem("HEAL");
  return {weapon1:w1.id,weapon2:w2.id,heal:heal.id,battlePet:null};
}
function stateFor(loadout:BattleLoadout, bonus:BattleLoadout, enemy?:EnemyConfig):CombatantState{
  const weapons=[loadout.weapon1,loadout.weapon2,bonus.weapon1,bonus.weapon2].filter((id):id is string=>Boolean(id));
  const heals=[loadout.heal,bonus.heal].filter((id):id is string=>Boolean(id));
  const petId=loadout.battlePet;
  return {
    weapons,
    heals,
    usedHeals:new Set<string>(),
    petId,
    petLives:petId?(getShopItem(petId)?.actionLives??2):0,
    defense:enemy?.defense??capDefense(loadout)
  };
}
function damageEntry(base: Omit<BattleLogEntry,"damage"|"hpAfter">, rawDamage:number, defenderHp:number, defense:number): BattleLogEntry {
  const blocked=Math.min(Math.max(0,defense),Math.max(0,Math.floor(rawDamage*.35)));
  const damage=Math.max(1,rawDamage-blocked);
  return {...base,damage,...(blocked>0?{blocked}:{}),hpAfter:Math.max(0,defenderHp-damage)};
}
function chooseAction(state:CombatantState,hp:number,maxHp:number){
  const usableHeal=state.heals.find(id=>!state.usedHeals.has(id));
  if(usableHeal && hp/maxHp<=0.62 && Math.random()<0.78) return {type:"HEAL" as const,itemId:usableHeal};
  if(state.petId && state.petLives>0 && Math.random()<0.22) return {type:"PET" as const,itemId:state.petId};
  if(state.weapons.length && Math.random()<0.88) return {type:"WEAPON" as const,itemId:pick(state.weapons)};
  return {type:"FIST" as const,itemId:null};
}

export function generateBattle(aId:string,bId:string,a:BattleLoadout,b:BattleLoadout,enemy?:EnemyConfig):BattleResult{
  const bonusA=rollBattleBonus();
  const bonusB=enemy?rollBattleBonus():rollBattleBonus();
  const initialHp:Record<string,number>={[aId]:MAX_HP,[bId]:enemy?.hp??MAX_HP};
  const hp:Record<string,number>={...initialHp};
  const states:Record<string,CombatantState>={
    [aId]:stateFor(a,bonusA),
    [bId]:enemy?stateFor(b,bonusB,enemy):stateFor(b,bonusB)
  };
  const log:BattleLogEntry[]=[];
  let actor=Math.random()<.5?aId:bId;
  let defender=actor===aId?bId:aId;

  // Legfeljebb 14 normál akció, a 15. helyet szükség esetén a látványos kivégző csapásnak tartjuk fenn.
  for(let turn=1;turn<MAX_ACTIONS && hp[aId]>0 && hp[bId]>0;turn++){
    const state=states[actor];
    const action=chooseAction(state,hp[actor],initialHp[actor]);
    const item=action.itemId?getShopItem(action.itemId):null;
    if(action.type==="HEAL" && item){
      state.usedHeals.add(item.id);
      const mult=enemy && actor===bId ? Math.max(.85,enemy.damageMultiplier??1) : 1;
      const amount=Math.max(1,Math.round(rnd(item.minHeal??8,item.maxHeal??18)*Math.min(1.15,mult)));
      hp[actor]=Math.min(initialHp[actor],hp[actor]+amount);
      log.push({turn,actorId:actor,defenderId:defender,actionType:"HEAL",itemId:item.id,heal:amount,hpAfter:hp[actor],rarity:item.rarity});
    } else {
      if(action.type==="PET") state.petLives=Math.max(0,state.petLives-1);
      const crit=Math.random()<(item?.rarity==="LEGENDARY"?.16:.09);
      let baseMin=item?.minDamage??3, baseMax=item?.maxDamage??8;
      if(enemy && actor===bId && !item){ baseMin=enemy.minDamage; baseMax=enemy.maxDamage; }
      const mult=enemy && actor===bId ? (enemy.damageMultiplier??1) : 1;
      const raw=Math.max(1,Math.round((rnd(baseMin,baseMax)+(crit?rnd(3,7):0))*mult));
      const entry=damageEntry({turn,actorId:actor,defenderId:defender,actionType:action.type,itemId:item?.id??null,...(crit?{crit:true}:{}),...(item?.rarity?{rarity:item.rarity as ItemRarity}:{})},raw,hp[defender],states[defender].defense);
      hp[defender]=entry.hpAfter; log.push(entry);
    }
    [actor,defender]=[defender,actor];
  }

  let winnerId:string;
  if(hp[aId]===0 || hp[bId]===0) {
    winnerId=hp[aId]>0?aId:bId;
  } else {
    winnerId=hp[aId]===hp[bId]?(Math.random()<.5?aId:bId):(hp[aId]>hp[bId]?aId:bId);
    const loserId=winnerId===aId?bId:aId;
    const winnerState=states[winnerId];
    const weaponId=winnerState.weapons.length?pick(winnerState.weapons):null;
    const weapon=weaponId?getShopItem(weaponId):null;
    const remaining=Math.max(1,hp[loserId]);
    // A döntetlen/időlimit soha nem hagy két túlélőt: az utolsó akció tényleges KO.
    log.push({
      turn:Math.min(MAX_ACTIONS,log.length+1),
      actorId:winnerId,
      defenderId:loserId,
      actionType:weapon?"WEAPON":"FIST",
      itemId:weapon?.id??null,
      damage:remaining,
      hpAfter:0,
      finisher:true,
      crit:true,
      ...(weapon?.rarity?{rarity:weapon.rarity as ItemRarity}:{})
    });
    hp[loserId]=0;
  }
  const [skinA,skinB]=skinPair();
  return {
    winnerId,
    loserId:winnerId===aId?bId:aId,
    log,
    skins:{[aId]:skinA,[bId]:skinB},
    initialHp,
    loadouts:{[aId]:cloneLoadout(a),[bId]:cloneLoadout(b)},
    bonusLoadouts:{[aId]:cloneLoadout(bonusA),[bId]:cloneLoadout(bonusB)},
    finalHp:{[aId]:hp[aId],[bId]:hp[bId]},
    createdAt:new Date().toISOString()
  };
}
