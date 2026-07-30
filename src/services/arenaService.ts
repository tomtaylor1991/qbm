import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { generateBattle } from "./battleEngine";
import { addItem, normalizeInventory, randomGiftItem } from "./shopService";
import { getShopItem, shopCatalog } from "../data/shopCatalog";
import type { BattleLoadout, BattleResult, ChallengeState, InventoryEntry } from "../types/arena";

export interface ArenaPlayer { id:string; name:string; huntPoints:number; inventory:InventoryEntry[]; present:boolean; isGroom:boolean; pvpWins:number; pvpLosses:number; pvpPointsWon:number; pveWins:number; pveLosses:number; }
export interface PvpChallenge { id:string; challengerId:string; challengedId:string; challengerName:string; challengedName:string; stake:number; state:ChallengeState; challengerLoadout:BattleLoadout|null; challengedLoadout:BattleLoadout|null; challengerReady:boolean; challengedReady:boolean; battle:BattleResult|null; battleChallengeId?:string|null; settled:boolean; createdAt:string; expiresAt:string; acceptedAt?:string|null; acceptedBy?:string|null; winnerLost?:string[]; loserLost?:string[]; giftItemId?:string|null; stakeRefunded?:boolean; }
const emptyLoadout:BattleLoadout={weapon1:null,weapon2:null,heal:null,battlePet:null};
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
function isExpiredData(data:any){
  const raw=String(data.expiresAt??"");
  const expires=Date.parse(raw);
  if(Number.isFinite(expires)) return Date.now() >= expires;
  const created=Date.parse(String(data.createdAt??""));
  return Number.isFinite(created) && Date.now() >= created + CHALLENGE_TTL_MS;
}
async function expireChallengeInTransaction(tx:any, roomId:string, ref:any, data:any){
  if(data.settled || data.stakeRefunded || ["FINISHED","DECLINED","CANCELLED","EXPIRED"].includes(String(data.state))) {
    if(data.state!=="EXPIRED" && isExpiredData(data) && !data.settled) tx.update(ref,{state:"EXPIRED"});
    return;
  }
  const challenger=doc(db,"rooms",roomId,"players",String(data.challengerId));
  const ps=await tx.get(challenger);
  if(ps.exists()) tx.update(challenger,{huntPoints:Number(ps.data().huntPoints??0)+Number(data.stake??0)});
  tx.update(ref,{state:"EXPIRED",stakeRefunded:true,expiredAt:new Date().toISOString()});
}
export function challengeExpiresAtMs(challenge:PvpChallenge){
  const explicit=Date.parse(String(challenge.expiresAt??""));
  if(Number.isFinite(explicit)) return explicit;
  const created=Date.parse(String(challenge.createdAt??""));
  return Number.isFinite(created)?created+CHALLENGE_TTL_MS:Date.now();
}
export function challengeIsExpired(challenge:PvpChallenge){ return Date.now() >= challengeExpiresAtMs(challenge); }
export async function expireChallengeIfNeeded(roomId:string,id:string){
  const ref=doc(db,"rooms",roomId,"pvpChallenges",id);
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists()) return false;
    const data=snap.data();
    if(!isExpiredData(data) || ["FIGHTING","FINISHED","DECLINED","CANCELLED","EXPIRED"].includes(String(data.state))) return false;
    await expireChallengeInTransaction(tx,roomId,ref,data);
    return true;
  });
}

function mapArenaPlayer(id:string,d:any):ArenaPlayer{return {id,name:String(d.name??""),huntPoints:Number(d.huntPoints??0),inventory:normalizeInventory(d.inventory),present:d.present!==false,isGroom:d.isGroom===true,pvpWins:Number(d.pvpWins??0),pvpLosses:Number(d.pvpLosses??0),pvpPointsWon:Number(d.pvpPointsWon??0),pveWins:Number(d.pveWins??0),pveLosses:Number(d.pveLosses??0)}}
export function subscribeArenaPlayers(roomId:string,cb:(p:ArenaPlayer[])=>void):Unsubscribe{return onSnapshot(collection(db,"rooms",roomId,"players"),snap=>cb(snap.docs.filter(d=>d.data().archivedDuplicate!==true).map(d=>mapArenaPlayer(d.id,d.data()))));}
export function subscribeChallenges(roomId:string,playerId:string,cb:(c:PvpChallenge[])=>void):Unsubscribe{const q=query(collection(db,"rooms",roomId,"pvpChallenges"),orderBy("createdAt","desc"));return onSnapshot(q,s=>cb(s.docs.map(d=>({id:d.id,...d.data()} as PvpChallenge)).filter(c=>c.challengerId===playerId||c.challengedId===playerId)));}
export async function createChallenge(roomId:string,challenger:ArenaPlayer,challenged:ArenaPlayer,stake:number){const safe=Math.max(0,Math.floor(stake));if(challenger.id===challenged.id)throw new Error("Saját magadat nem hívhatod ki.");const pref=doc(db,"rooms",roomId,"players",challenger.id);const oref=doc(db,"rooms",roomId,"players",challenged.id);return runTransaction(db,async tx=>{const [ps,os]=await Promise.all([tx.get(pref),tx.get(oref)]);if(!ps.exists())throw new Error("Játékos nem található.");if(!os.exists()||os.data().archivedDuplicate===true||os.data().present===false)throw new Error("Az ellenfél már nem aktív.");const bal=Number(ps.data().huntPoints??0);if(bal<safe)throw new Error(`Nincs elég pontod a ${safe} pontos téthez. Egyenleged: ${bal}.`);tx.update(pref,{huntPoints:bal-safe});const cref=doc(collection(db,"rooms",roomId,"pvpChallenges"));tx.set(cref,{challengerId:challenger.id,challengedId:challenged.id,challengerName:challenger.name,challengedName:challenged.name,stake:safe,state:"PENDING",challengerLoadout:null,challengedLoadout:null,challengerReady:false,challengedReady:false,battle:null,battleChallengeId:null,settled:false,acceptedAt:null,acceptedBy:null,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+CHALLENGE_TTL_MS).toISOString(),createdAtServer:serverTimestamp()});return cref.id;});}
export async function setChallengeState(roomId:string,id:string,state:ChallengeState,actorId?:string){
  const ref=doc(db,"rooms",roomId,"pvpChallenges",id);
  if(state==="ACCEPTED"){
    const expired = await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists())throw new Error("Kihívás nem található.");
      const data=snap.data();
      if(data.state!=="PENDING")throw new Error("Ez a kihívás már nem vár elfogadásra.");
      if(!actorId || String(data.challengedId)!==actorId)throw new Error("Csak a kihívott játékos fogadhatja el.");
      if(isExpiredData(data)){
        await expireChallengeInTransaction(tx,roomId,ref,data);
        return true;
      }
      tx.update(ref,{state:"ACCEPTED",acceptedAt:new Date().toISOString(),acceptedBy:actorId});
      return false;
    });
    if(expired) throw new Error("A PvP meghívás lejárt (2 perc). Kérj új kihívást.");
    return;
  }
  if(state!=="DECLINED"&&state!=="CANCELLED"){await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error("Kihívás nem található.");const data=snap.data();if(isExpiredData(data)&&!["FIGHTING","FINISHED"].includes(String(data.state))){await expireChallengeInTransaction(tx,roomId,ref,data);return;}tx.update(ref,{state});});return;}
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())return;const data=snap.data();if(data.stakeRefunded||data.settled)return;if(state==="DECLINED"&&actorId&&String(data.challengedId)!==actorId)throw new Error("Csak a kihívott játékos utasíthatja el.");if(state==="CANCELLED"&&actorId&&String(data.challengerId)!==actorId)throw new Error("Csak a kihívó vonhatja vissza.");const challenger=doc(db,"rooms",roomId,"players",String(data.challengerId));const ps=await tx.get(challenger);if(ps.exists())tx.update(challenger,{huntPoints:Number(ps.data().huntPoints??0)+Number(data.stake??0)});tx.update(ref,{state,stakeRefunded:true});});
}
export async function submitLoadout(roomId:string,id:string,playerId:string,loadout:BattleLoadout){const ref=doc(db,"rooms",roomId,"pvpChallenges",id);let expired=false;await runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists())throw new Error("Kihívás nem található.");const d=s.data();const isC=d.challengerId===playerId;if(!isC&&d.challengedId!==playerId)throw new Error("Nem vagy résztvevő.");if(isExpiredData(d)){expired=true;await expireChallengeInTransaction(tx,roomId,ref,d);return;}if(!d.acceptedAt||d.acceptedBy!==d.challengedId||!["ACCEPTED","LOADOUT","READY"].includes(String(d.state)))throw new Error("A kihívást előbb a kihívott játékosnak el kell fogadnia.");tx.update(ref,{[isC?"challengerLoadout":"challengedLoadout"]:loadout,[isC?"challengerReady":"challengedReady"]:true,state:"READY"});});if(expired)throw new Error("A PvP meghívás lejárt (2 perc). Küldjetek új kihívást.");await maybeFight(roomId,id);}
async function maybeFight(roomId:string,id:string){const ref=doc(db,"rooms",roomId,"pvpChallenges",id);let started=false;await runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists())return;const d=s.data();if(d.battle||["FIGHTING","FINISHED","DECLINED","CANCELLED","EXPIRED"].includes(String(d.state)))return;if(isExpiredData(d)){await expireChallengeInTransaction(tx,roomId,ref,d);return;}if(!d.acceptedAt||d.acceptedBy!==d.challengedId||!d.challengerReady||!d.challengedReady||!["ACCEPTED","LOADOUT","READY"].includes(String(d.state)))return;const battle=generateBattle(String(d.challengerId),String(d.challengedId),d.challengerLoadout??emptyLoadout,d.challengedLoadout??emptyLoadout);tx.update(ref,{battle,battleChallengeId:id,state:"FIGHTING",startedAt:new Date().toISOString()});started=true;});if(started)await settleChallenge(roomId,id);}
function selectedIds(l:BattleLoadout){return [l.weapon1,l.weapon2,l.heal,l.battlePet].filter(Boolean) as string[];}
function removeRandom(inv:InventoryEntry[], ids:string[],count:number){const next=inv.map(x=>({...x}));const candidates=[...ids];const lost:string[]=[];for(let i=0;i<count&&candidates.length;i++){const idx=Math.floor(Math.random()*candidates.length);const id=candidates.splice(idx,1)[0];const e=next.find(x=>x.itemId===id&&x.quantity>0);if(e){e.quantity--;lost.push(id);}}return {inventory:next.filter(x=>x.quantity>0),lost};}
export async function settleChallenge(roomId:string,id:string){const ref=doc(db,"rooms",roomId,"pvpChallenges",id);await runTransaction(db,async tx=>{const cs=await tx.get(ref);if(!cs.exists())return;const c=cs.data();if(c.settled||!c.battle)return;const battle=c.battle as BattleResult;const winner=doc(db,"rooms",roomId,"players",battle.winnerId),loser=doc(db,"rooms",roomId,"players",battle.loserId);const [ws,ls]=await Promise.all([tx.get(winner),tx.get(loser)]);if(!ws.exists()||!ls.exists())throw new Error("Résztvevő hiányzik.");const winnerIsChallenger=battle.winnerId===c.challengerId;const winnerData=ws.data(), loserData=ls.data();const wLoad=winnerIsChallenger?c.challengerLoadout:c.challengedLoadout;const lLoad=winnerIsChallenger?c.challengedLoadout:c.challengerLoadout;const wl=removeRandom(normalizeInventory(winnerData.inventory),selectedIds(wLoad??emptyLoadout),1);const ll=removeRandom(normalizeInventory(loserData.inventory),selectedIds(lLoad??emptyLoadout),2);const gift=randomGiftItem();const winnerInventory=addItem(wl.inventory,gift.id);const stake=Number(c.stake??0);const payout=winnerIsChallenger?stake*2:stake;tx.update(winner,{huntPoints:Number(winnerData.huntPoints??0)+payout,inventory:winnerInventory,pvpWins:Number(winnerData.pvpWins??0)+1,pvpPointsWon:Number(winnerData.pvpPointsWon??0)+stake});tx.update(loser,{inventory:ll.inventory,pvpLosses:Number(loserData.pvpLosses??0)+1});tx.update(ref,{settled:true,state:"FINISHED",winnerLost:wl.lost,loserLost:ll.lost,giftItemId:gift.id,settledAt:new Date().toISOString()});});}
function makeEnemyLoadout(difficulty:"EASY"|"MEDIUM"|"HARD", playerLoadout:BattleLoadout):BattleLoadout{
  const weapons=shopCatalog.filter(i=>i.type==="WEAPON").sort((a,b)=>(b.maxDamage??0)-(a.maxDamage??0));
  const heals=shopCatalog.filter(i=>i.type==="HEAL").sort((a,b)=>(b.maxHeal??0)-(a.maxHeal??0));
  const pets=shopCatalog.filter(i=>i.type==="BATTLE_PET").sort((a,b)=>(b.maxDamage??0)-(a.maxDamage??0));
  // Az NPC továbbra is erős lehet, de ne kapjon több saját heal/pet slotot, mint a játékos.
  // A közös harcmotor mindkét félnek ugyanúgy ad 1 ideiglenes random healt, ezért itt
  // a saját slotok számát tükrözzük.
  const bands=difficulty==="EASY"?[.5,.82]:difficulty==="MEDIUM"?[.25,.6]:[.05,.34];
  const choose=(arr:any[])=>{const start=Math.floor(arr.length*bands[0]);const end=Math.max(start+1,Math.floor(arr.length*bands[1]));return arr[start+Math.floor(Math.random()*Math.max(1,end-start))]?.id??null;};
  return {
    weapon1:choose(weapons),
    weapon2:choose(weapons),
    heal:playerLoadout.heal ? choose(heals) : null,
    battlePet:playerLoadout.battlePet && Math.random()<(difficulty==="EASY"?.3:difficulty==="MEDIUM"?.55:.78) ? choose(pets) : null
  };
}
export async function runPve(roomId:string,player:ArenaPlayer,difficulty:"EASY"|"MEDIUM"|"HARD",loadout:BattleLoadout){const cfg={EASY:{name:"Kocsmai Csótány",hp:85,minDamage:6,maxDamage:11,defense:1,reward:[25,35]},MEDIUM:{name:"Lakótelepi Mutáns",hp:108,minDamage:10,maxDamage:16,defense:2,reward:[45,60]},HARD:{name:"A Szent Kecske Végső Formája",hp:130,minDamage:14,maxDamage:21,defense:4,reward:[70,95]}}[difficulty];const enemyId=`PVE-${difficulty}`;const enemyLoadout=makeEnemyLoadout(difficulty,loadout);const battle=generateBattle(player.id,enemyId,loadout,enemyLoadout,{hp:cfg.hp,minDamage:cfg.minDamage,maxDamage:cfg.maxDamage,defense:cfg.defense,damageMultiplier:difficulty==="EASY"?.86:difficulty==="MEDIUM"?1.02:1.15});const pref=doc(db,"rooms",roomId,"players",player.id);const bref=doc(collection(db,"rooms",roomId,"pveBattles"));let reward=0,giftId:string|null=null,lost:string[]=[];await runTransaction(db,async tx=>{const ps=await tx.get(pref);if(!ps.exists())throw new Error("Játékos nem található.");const d=ps.data();const won=battle.winnerId===player.id;const loss=removeRandom(normalizeInventory(d.inventory),selectedIds(loadout),won?1:2);lost=loss.lost;let inv=loss.inventory;const update:any={inventory:inv,pveWins:Number(d.pveWins??0)+(won?1:0),pveLosses:Number(d.pveLosses??0)+(won?0:1)};if(won){reward=cfg.reward[0]+Math.floor(Math.random()*(cfg.reward[1]-cfg.reward[0]+1));update.huntPoints=Number(d.huntPoints??0)+reward;const chance=difficulty==="EASY"?.25:difficulty==="MEDIUM"?.45:.7;if(Math.random()<chance){const gift=randomGiftItem(difficulty==="HARD"?"RARE":undefined);giftId=gift.id;update.inventory=addItem(inv,gift.id);}}tx.update(pref,update);tx.set(bref,{playerId:player.id,difficulty,enemyName:cfg.name,battle,reward,giftItemId:giftId,lostItems:lost,settled:true,createdAt:new Date().toISOString()});});return {battle,battleId:bref.id,reward,giftItemId:giftId,lostItems:lost,enemyName:cfg.name};}
export function inventoryHas(inv:InventoryEntry[],itemId:string|null){if(!itemId)return true;return inv.some(x=>x.itemId===itemId&&x.quantity>0);}
export function validateLoadout(inv:InventoryEntry[],loadout:BattleLoadout){for(const id of selectedIds(loadout)){if(!inventoryHas(inv,id))throw new Error(`Nincs nálad: ${getShopItem(id)?.name??id}`);}return true;}
