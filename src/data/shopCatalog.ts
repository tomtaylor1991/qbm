import type { ItemRarity, ItemType, ShopItem } from "../types/arena";

const categories: Record<string, string[]> = {
  "Szerszámok": ["Kalapács","Ásó","Rozsdás fűrész","Csálé gereblye","Betonkeverő kanál","Vakoló lapát","Törött vízmérték","Kábelkötegelő buzogány","Csatornakulcs","Kerti kapa"],
  "Kocsmai cuccok": ["Söröskorsó","Borosüveg","Hamutartó","Kocsmai szék","Kocsmai padlómatrica","Húgyszagú törölköző","Ragacsos söralátét","Csocsófigura","Pultos csengő","Zsíros étlap"],
  "Undorító / szemét": ["Romlott uborka","Szaros cipő","Penészes zsemle","Megolvadt gumikesztyű","Rejtélyes tócsa","Háromnapos gyros","Nyirkos zokni","Kukaalji banán","Ázott kartondoboz","Gyanús szalvéta"],
  "Járművek": ["Lada","Arany Lada","Tuningolt talicska","Bicikli kerék nélkül","Moped a pokolból","Bevásárlókocsi GT","Traktor kulcstartó","Rozsdás roller","Kempingbicikli","Buszmegálló-pad szánkó"],
  "Legendás relikviák": ["Végítélet papucsa","Gábor Zsazsa bugyija","Zámbó Jimmy","Mónika-show mikrofon","Lagzis CD","Műarany nyaklánc","Szent grillsütő","A Nagyi Sodrófája","Kárpát-medencei távkapcsoló","Utolsó ingyenes pálinka"],
  "Állatok": ["Macska","Papagáj","Szent kecske","Kóbor pulyka","Mérges galamb","Támadó hörcsög","Harci csirke","Vad lepke","Mérges tacskó","Kocsmai aranyhal"],
  "Perverz / bizarr": ["Használt dildo","Rózsaszín bilincs","Szőrös tangapáncél","Gumikacsa dominátor","Latex fejfedő","Bajuszos testápoló","Csillámos ostorimitáció","Erotikus kerti törpe","Plüss banán","Gyanús masszírozó"],
  "Celeb / trash ikonok": ["Zámbó Jimmy kazetta","Mónika-show mikrofon","Lagzis CD deluxe","Reality-sztár napszemüveg","Műarany celeb-lánc","Karaoke koronája","Bulvár címlap pajzs","Piros szőnyeg darab","Playback varázspálca","Diszkókirály zakója"],
  "Konyhai fegyverek": ["Fakanál","Fagyasztott hekk","Sodrófa","Levesmerő kard","Reszelőpajzs","Serpenyő","Húsklopfoló","Tésztaszűrő sisak","Kenyérvágó deszka","Habverő lándzsa"],
  "Abszurd tárgyak": ["Betonból készült lufi","Fordított esernyő","Bluetooth krumpli","USB-s patkó","Önmagát kereső térkép","Hangos kavics","Diplomás seprű","Részeg iránytű","Kétbalkezes kesztyű","Hordozható kátyú"],
  "Heal / fogyóeszközök": ["Sör","Bor","Pálinka","Rejtélyes lötty","Kocsmai vitamin","Savanyú leves","Másnaposság elleni uborka","Energiafröccs","Nagyi húslevese","Titkos elektrolit"],
  "Harci állatok": ["Harci csirke","Vad lepke","Támadó hörcsög","Mérges galamb","Kóbor pulyka","Szent kecske","Dühös liba","Utcai menyét","Páncélos mopsz","Nindzsa macska"]
};
const rarities: ItemRarity[] = ["COMMON","UNCOMMON","RARE","EPIC","LEGENDARY"];
const priceBands: Record<ItemRarity,[number,number]> = { COMMON:[10,18], UNCOMMON:[18,28], RARE:[28,42], EPIC:[42,60], LEGENDARY:[60,85] };
const healNames = new Set(["Sör","Bor","Pálinka","Rejtélyes lötty","Kocsmai vitamin","Savanyú leves","Másnaposság elleni uborka","Energiafröccs","Nagyi húslevese","Titkos elektrolit"]);
const petNames = new Set(categories["Harci állatok"]);
const icons: Record<ItemType,string> = { WEAPON:"⚔️", HEAL:"❤️", BATTLE_PET:"🐾" };
function hash(s:string){ return [...s].reduce((a,c)=>((a*31+c.charCodeAt(0))>>>0),7); }
function rarityFor(name:string,index:number): ItemRarity { if (["Arany Lada","Végítélet papucsa","Zámbó Jimmy","Szent kecske"].includes(name)) return "LEGENDARY"; return rarities[(hash(name)+index)%rarities.length]; }
function typeFor(name:string,cat:string): ItemType { if (healNames.has(name)||cat==="Heal / fogyóeszközök") return "HEAL"; if (petNames.has(name)||cat==="Harci állatok") return "BATTLE_PET"; return "WEAPON"; }
function slug(s:string){ return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
const specials: Record<string,Partial<ShopItem>> = {
 "Romlott uborka":{minDamage:5,maxDamage:11}, "Használt dildo":{minDamage:7,maxDamage:15}, "Gábor Zsazsa bugyija":{minDamage:10,maxDamage:19},
 "Papagáj":{minDamage:8,maxDamage:14}, "Macska":{minDamage:6,maxDamage:17}, "Szent kecske":{actionLives:2,minDamage:18,maxDamage:30}, "Zámbó Jimmy":{minDamage:22,maxDamage:36}, "Arany Lada":{minDamage:26,maxDamage:40},
 "Sör":{minHeal:8,maxHeal:14}, "Bor":{minHeal:12,maxHeal:20}, "Pálinka":{minHeal:18,maxHeal:28}, "Rejtélyes lötty":{minHeal:5,maxHeal:30}, "Kocsmai vitamin":{minHeal:10,maxHeal:18},
 "Harci csirke":{actionLives:3,minDamage:4,maxDamage:7}, "Vad lepke":{actionLives:5,minDamage:2,maxDamage:4}, "Támadó hörcsög":{actionLives:2,minDamage:7,maxDamage:11}, "Mérges galamb":{actionLives:3,minDamage:5,maxDamage:8}, "Kóbor pulyka":{actionLives:4,minDamage:3,maxDamage:6}
};
const result: ShopItem[]=[];
Object.entries(categories).forEach(([category,names])=>names.forEach((name,index)=>{
 const type=typeFor(name,category); const rarity=rarityFor(name,index); const [lo,hi]=priceBands[rarity]; const base=hash(category+name);
 const generic = type==="HEAL"
  ? {minHeal:8+(base%8),maxHeal:15+(base%14),defense:1+(base%3)}
  : type==="BATTLE_PET"
    ? {actionLives:2+(base%4),minDamage:3+(base%7),maxDamage:8+(base%12),defense:1+(base%5)}
    : {minDamage:4+(base%10),maxDamage:11+(base%18),defense:base%8};
 const id=`${slug(category)}-${slug(name)}-${index}`;
 result.push({id,name,category,rarity,type,price:lo+(base%(hi-lo+1)),icon:icons[type],image:`/images/items/${id}.svg`,...generic,...specials[name]});
}));
export const shopCatalog = result;
export const shopCategories = Object.keys(categories);
export function getShopItem(id:string){ return shopCatalog.find(i=>i.id===id) ?? null; }
