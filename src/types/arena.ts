export type ItemRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
export type ItemType = "WEAPON" | "HEAL" | "BATTLE_PET";

export interface ShopItem {
  id: string;
  name: string;
  category: string;
  rarity: ItemRarity;
  type: ItemType;
  price: number;
  icon: string;
  image: string;
  defense?: number;
  minDamage?: number;
  maxDamage?: number;
  minHeal?: number;
  maxHeal?: number;
  actionLives?: number;
}

export interface InventoryEntry { itemId: string; quantity: number; }
export interface BattleLoadout { weapon1: string | null; weapon2: string | null; heal: string | null; battlePet: string | null; }
export type BattleActionType = "WEAPON" | "HEAL" | "PET" | "FIST";
export interface BattleLogEntry {
  turn: number; actorId: string; defenderId: string; actionType: BattleActionType;
  itemId: string | null; damage?: number; blocked?: number; heal?: number; hpAfter: number; crit?: boolean; rarity?: ItemRarity; finisher?: boolean;
}
export interface BattleResult {
  winnerId: string;
  loserId: string;
  log: BattleLogEntry[];
  skins: Record<string,string>;
  createdAt: string;
  /** A replayhez eltároljuk a csata induló HP-ját is. Régi dokumentumoknál opcionális. */
  initialHp?: Record<string, number>;
  /** A végleges loadout snapshot: mindkét kliens ugyanazt az előnézetet látja. */
  loadouts?: Record<string, BattleLoadout>;
  /** Csak erre a csatára sorsolt 2 fegyver + 1 heal. Pet sosem sorsolt. */
  bonusLoadouts?: Record<string, BattleLoadout>;
  /** A csata végi HP. A vesztes minden esetben 0 HP-n zár. */
  finalHp?: Record<string, number>;
}
export type ChallengeState = "PENDING" | "ACCEPTED" | "LOADOUT" | "READY" | "FIGHTING" | "FINISHED" | "DECLINED" | "CANCELLED" | "EXPIRED";
