export type GamePhase =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'DAY_SUMMARY'
  | 'VICTORY'
  | 'GAME_OVER';

export type GameMode = 'campaign' | 'endless';

export type MenuItemId = 'tea' | 'bun' | 'egg' | 'samsa' | 'plov';

export interface MenuItemConfig {
  id: MenuItemId;
  name: string;
  shortName: string;
  hotkey: string;
  sellPrice: number;
  baseWholesalePrice: number;
  batchSize: number;
  cookDuration: number; // seconds
  unlockDay: number;
  accentColor: string;
  stationTitle: string;
}

export type StudentArchetypeId =
  | 'freshman'
  | 'honors'
  | 'hurried'
  | 'athlete'
  | 'professor';

export interface StudentArchetype {
  id: StudentArchetypeId;
  label: string;
  patienceSec: number;
  minItems: number;
  maxItems: number;
  tipMultiplier: number;
  reputationWeight: number;
  preferredItems: MenuItemId[];
  jacketColors: string[];
  hairColors: string[];
  skinTones: string[];
}

export type UpgradeId =
  | 'tea_urn'
  | 'convection_oven'
  | 'dishwasher'
  | 'wide_tray'
  | 'cozy_gazebos'
  | 'plov_cauldron';

export interface UpgradeConfig {
  id: UpgradeId;
  name: string;
  description: string;
  effectText: string;
  cost: number;
  maxLevel: number;
}

export interface DayForecast {
  day: number;
  title: string;
  weatherLabel: string;
  headline: string;
  demandMultipliers: Partial<Record<MenuItemId, number>>;
  priceMultipliers: Partial<Record<MenuItemId, number>>;
  studentRateMultiplier: number;
  rushBonus: number;
}

export interface StationState {
  itemId: MenuItemId;
  readyCount: number;
  maxBatch: number;
  pantryStock: number;
  cookingTimer: number; // >0 means currently preparing batch
  cookDuration: number;
  flashTimer: number;
  bounceTimer: number;
}

export interface CounterStudent {
  id: number;
  slotIndex: number;
  archetype: StudentArchetype;
  x: number;
  y: number;
  targetX: number;
  state: 'entering' | 'waiting' | 'leaving_happy' | 'leaving_angry';
  order: { itemId: MenuItemId; delivered: boolean }[];
  patience: number;
  maxPatience: number;
  jacketColor: string;
  hairColor: string;
  skinTone: string;
  hairStyle: number;
  walkPhase: number;
  squash: number;
  speechText?: string;
  speechTimer: number;
}

export interface SeatedStudent {
  id: number;
  tableIndex: number;
  seatIndex: number;
  jacketColor: string;
  hairColor: string;
  skinTone: string;
  hairStyle: number;
  items: MenuItemId[];
  eatTimer: number;
  maxEatTimer: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'steam' | 'coin' | 'bubble' | 'spark' | 'crumb';
}

export interface DayStats {
  day: number;
  servedCount: number;
  missedCount: number;
  revenue: number;
  tips: number;
  emergencySpent: number;
  wasteCost: number;
  maxCombo: number;
  ratingDelta: number;
  startMoney: number;
  endMoney: number;
}

export interface HudSnapshot {
  day: number;
  mode: GameMode;
  money: number;
  rating: number; // 0.0 to 5.0
  timeProgress: number; // 0 to 1
  clockLabel: string; // e.g. "11:45"
  isRushHour: boolean;
  rushLabel: string;
  combo: number;
  servedToday: number;
  missedToday: number;
  cleanPlates: number;
  maxPlates: number;
  dirtyPlates: number;
  washingProgress: number; // 0..1
  trayItems: MenuItemId[];
  trayCapacity: number;
  stations: Record<
    MenuItemId,
    {
      unlocked: boolean;
      ready: number;
      maxBatch: number;
      pantry: number;
      cookingProgress: number; // 0..1, 0 when idle
    }
  >;
  pantryCap: number;
  alertBanner: string | null;
  outOfStockItem: MenuItemId | null;
}
