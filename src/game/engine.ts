import { soundEngine } from './audio';
import {
  BASE_PANTRY_CAP,
  getEmergencyPrice,
  getForecastForDay,
  MENU_ITEMS,
  MENU_ORDER,
  SHIFT_DURATION_SEC,
  STUDENT_ARCHETYPES,
} from './config';
import {
  CounterStudent,
  DayForecast,
  DayStats,
  FloatingText,
  GameMode,
  HudSnapshot,
  MenuItemId,
  Particle,
  SeatedStudent,
  StationState,
  StudentArchetype,
  UpgradeId,
} from './types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onDayComplete: (stats: DayStats, nextPantry: Record<MenuItemId, number>, endMoney: number, endRating: number) => void;
  onGameOver: (reason: string, stats: DayStats) => void;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hitTest(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export class CanteenGameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private width = 1280;
  private height = 720;
  private dpr = 1;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private running = false;
  private paused = false;

  // Game meta state
  private day = 1;
  private mode: GameMode = 'campaign';
  private forecast: DayForecast = getForecastForDay(1);
  private upgrades: Record<UpgradeId, number> = {
    tea_urn: 0,
    convection_oven: 0,
    dishwasher: 0,
    wide_tray: 0,
    cozy_gazebos: 0,
    plov_cauldron: 0,
  };

  // Economy & shift counters
  private money = 450;
  private startMoney = 450;
  private rating = 4.2;
  private startRating = 4.2;
  private elapsedSec = 0;
  private combo = 0;
  private maxCombo = 0;
  private servedToday = 0;
  private missedToday = 0;
  private revenueToday = 0;
  private tipsToday = 0;
  private emergencySpentToday = 0;
  private wasteCostToday = 0;
  private rushTriggered = false;
  private rush2Triggered = false;

  // Dishes
  private maxPlates = 8;
  private cleanPlates = 8;
  private dirtyPlates = 0;
  private washingTimer = 0;
  private washDuration = 1.05;
  private autoWashAccum = 0;

  // Stations & tray
  private stations!: Record<MenuItemId, StationState>;
  private trayItems: MenuItemId[] = [];
  private trayCapacity = 3;
  private trayFlash = 0;

  // Entities
  private nextStudentId = 1;
  private counterStudents: (CounterStudent | null)[] = [null, null, null, null];
  private leavingStudents: CounterStudent[] = [];
  private seatedStudents: SeatedStudent[] = [];
  private spawnTimer = 1.4;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private nextTextId = 1;

  // Juice
  private shakeIntensity = 0;
  private hitstopTimer = 0;
  private alertBanner: string | null = null;
  private alertTimer = 0;
  private outOfStockItem: MenuItemId | null = null;
  private hudSyncTimer = 0;

  // Pointer & layout hitboxes
  private mouseX = -1000;
  private mouseY = -1000;
  private stationRects: Record<MenuItemId, Rect> = {} as Record<MenuItemId, Rect>;
  private refillRects: Record<MenuItemId, Rect> = {} as Record<MenuItemId, Rect>;
  private studentRects: Rect[] = [];
  private trayRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private clearTrayRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private sinkRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D context');
    }
    this.ctx = context;
    this.callbacks = callbacks;
    this.initStations({ tea: 16, bun: 14, egg: 12, samsa: 12, plov: 0 });
    this.resize();
  }

  private getUnlockedItems(): MenuItemId[] {
    return MENU_ORDER.filter((id) => MENU_ITEMS[id].unlockDay <= this.day);
  }

  private initStations(pantry: Record<MenuItemId, number>) {
    const teaBonus = this.upgrades.tea_urn * 3;
    const teaSpeed = Math.pow(0.75, this.upgrades.tea_urn);
    const ovenBonus = this.upgrades.convection_oven * 2;
    const ovenSpeed = Math.pow(0.7, this.upgrades.convection_oven);
    const plovBonus = this.upgrades.plov_cauldron * 2;
    const plovSpeed = Math.pow(0.72, this.upgrades.plov_cauldron);

    const makeStation = (id: MenuItemId): StationState => {
      const cfg = MENU_ITEMS[id];
      let maxBatch = cfg.batchSize;
      let cookDuration = cfg.cookDuration;
      if (id === 'tea') {
        maxBatch += teaBonus;
        cookDuration *= teaSpeed;
      } else if (id === 'bun' || id === 'samsa') {
        maxBatch += ovenBonus;
        cookDuration *= ovenSpeed;
      } else if (id === 'plov') {
        maxBatch += plovBonus;
        cookDuration *= plovSpeed;
      }

      const unlocked = cfg.unlockDay <= this.day;
      const stock = pantry[id] ?? 0;
      const initialReady = unlocked ? Math.min(maxBatch, stock) : 0;
      return {
        itemId: id,
        readyCount: initialReady,
        maxBatch,
        pantryStock: Math.max(0, stock - initialReady),
        cookingTimer: 0,
        cookDuration: Math.max(0.85, cookDuration),
        flashTimer: 0,
        bounceTimer: 0,
      };
    };

    this.stations = {
      tea: makeStation('tea'),
      bun: makeStation('bun'),
      egg: makeStation('egg'),
      samsa: makeStation('samsa'),
      plov: makeStation('plov'),
    };
  }

  public startDay(params: {
    day: number;
    mode: GameMode;
    money: number;
    rating: number;
    pantry: Record<MenuItemId, number>;
    upgrades: Record<UpgradeId, number>;
  }) {
    this.day = params.day;
    this.mode = params.mode;
    this.money = params.money;
    this.startMoney = params.money;
    this.rating = params.rating;
    this.startRating = params.rating;
    this.upgrades = { ...params.upgrades };
    this.forecast = getForecastForDay(this.day);

    this.elapsedSec = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.servedToday = 0;
    this.missedToday = 0;
    this.revenueToday = 0;
    this.tipsToday = 0;
    this.emergencySpentToday = 0;
    this.wasteCostToday = 0;
    this.rushTriggered = false;
    this.rush2Triggered = false;

    this.maxPlates = 8 + this.upgrades.dishwasher * 5;
    this.cleanPlates = this.maxPlates;
    this.dirtyPlates = 0;
    this.washingTimer = 0;
    this.autoWashAccum = 0;

    this.trayCapacity = 3 + this.upgrades.wide_tray;
    this.trayItems = [];
    this.trayFlash = 0;

    this.counterStudents = [null, null, null, null];
    this.leavingStudents = [];
    this.seatedStudents = [];
    this.particles = [];
    this.floatingTexts = [];
    this.spawnTimer = 1.0;
    this.shakeIntensity = 0;
    this.hitstopTimer = 0;
    this.outOfStockItem = null;

    this.initStations(params.pantry);

    this.showBanner(`Смена ${this.day} открыта · ${this.forecast.title}`, 3.2);
    soundEngine.playRushBell();

    this.paused = false;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.pushHudSnapshot();

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = requestAnimationFrame(this.loop);
  }

  public setPaused(p: boolean) {
    this.paused = p;
    if (!p && this.running) {
      this.lastTimestamp = performance.now();
    }
  }

  public stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.width = Math.max(320, Math.floor(rect.width));
    this.height = Math.max(320, Math.floor(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.computeLayout();
  }

  private computeLayout() {
    const W = this.width;
    const H = this.height;

    const counterTop = H * 0.62;
    const counterH = H - counterTop;
    const padX = Math.max(16, W * 0.025);
    const usableW = W - padX * 2;
    const deckTop = counterTop + Math.max(18, counterH * 0.12);
    const deckH = Math.min(counterH * 0.78, 215);

    // Divide bottom deck: 5 stations (60%) + Active Tray (22%) + Dish Sink (18%)
    const gap = Math.max(8, usableW * 0.01);
    const stationsAreaW = usableW * 0.59;
    const trayW = usableW * 0.21;
    const sinkW = usableW - stationsAreaW - trayW - gap * 2;

    const singleStationW = (stationsAreaW - gap * 4) / 5;
    MENU_ORDER.forEach((id, idx) => {
      const sx = padX + idx * (singleStationW + gap);
      this.stationRects[id] = { x: sx, y: deckTop, w: singleStationW, h: deckH };
      this.refillRects[id] = {
        x: sx + singleStationW - 34,
        y: deckTop + 6,
        w: 28,
        h: 26,
      };
    });

    const trayX = padX + stationsAreaW + gap;
    this.trayRect = { x: trayX, y: deckTop, w: trayW, h: deckH };
    this.clearTrayRect = {
      x: trayX + trayW - 84,
      y: deckTop + 8,
      w: 76,
      h: 26,
    };

    const sinkX = trayX + trayW + gap;
    this.sinkRect = { x: sinkX, y: deckTop, w: sinkW, h: deckH };

    // Student 4 slots aligned nicely above counter
    const slotRegionW = W * 0.84;
    const slotStartX = (W - slotRegionW) / 2;
    const slotW = slotRegionW / 4;
    this.studentRects = [0, 1, 2, 3].map((i) => ({
      x: slotStartX + i * slotW + slotW * 0.08,
      y: H * 0.25,
      w: slotW * 0.84,
      h: H * 0.37,
    }));

    // Update student target positions
    this.counterStudents.forEach((st, i) => {
      if (st) {
        const r = this.studentRects[i];
        st.targetX = r.x + r.w / 2;
        if (st.state === 'waiting') {
          st.x = st.targetX;
        }
        st.y = counterTop - 4;
      }
    });
  }

  public handlePointerMove(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = clientX - rect.left;
    this.mouseY = clientY - rect.top;
  }

  public handlePointerLeave() {
    this.mouseX = -1000;
    this.mouseY = -1000;
  }

  public handleClick(clientX: number, clientY: number, isRightClick = false) {
    if (!this.running || this.paused) return;
    if (isRightClick) {
      this.clearTray();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    this.mouseX = x;
    this.mouseY = y;

    // 1. Check clear tray button
    if (this.trayItems.length > 0 && hitTest(x, y, this.clearTrayRect)) {
      this.clearTray();
      return;
    }

    // 2. Check clicking on tray itself -> auto serve best matching student
    if (this.trayItems.length > 0 && hitTest(x, y, this.trayRect)) {
      this.autoServeTray();
      return;
    }

    // 3. Check dish sink
    if (hitTest(x, y, this.sinkRect)) {
      this.triggerWash();
      return;
    }

    // 4. Check station refill button or main station click
    for (const id of MENU_ORDER) {
      const st = this.stations[id];
      if (MENU_ITEMS[id].unlockDay > this.day) continue;
      if (
        st.readyCount < st.maxBatch &&
        st.cookingTimer <= 0 &&
        hitTest(x, y, this.refillRects[id])
      ) {
        this.startCooking(id);
        return;
      }
      if (hitTest(x, y, this.stationRects[id])) {
        this.interactStation(id);
        return;
      }
    }

    // 5. Check clicking a student slot
    for (let i = 0; i < 4; i++) {
      if (hitTest(x, y, this.studentRects[i])) {
        this.serveStudentAtSlot(i);
        return;
      }
    }
  }

  public interactStation(id: MenuItemId, forceCook = false) {
    if (!this.running || this.paused) return;
    const cfg = MENU_ITEMS[id];
    if (cfg.unlockDay > this.day) {
      this.showBanner(`${cfg.name} откроется на день ${cfg.unlockDay}`, 2.0);
      soundEngine.playError();
      return;
    }
    const st = this.stations[id];

    if (forceCook) {
      this.startCooking(id);
      return;
    }

    if (st.readyCount > 0) {
      if (this.trayItems.length >= this.trayCapacity) {
        this.showBanner('Поднос заполнен! Отдайте блюда студенту (Пробел) или очистите (X).', 2.0);
        this.trayFlash = 0.35;
        soundEngine.playError();
        return;
      }
      st.readyCount -= 1;
      st.bounceTimer = 0.22;
      this.trayItems.push(id);
      soundEngine.playPlatePick(this.trayItems.length - 1);

      const sr = this.stationRects[id];
      this.spawnBurst(sr.x + sr.w / 2, sr.y + sr.h * 0.35, 'steam', 5, '#FFF8EE');

      // Auto-start cooking if counter emptied and pantry has stock
      if (st.readyCount === 0 && st.pantryStock > 0 && st.cookingTimer <= 0) {
        this.startCooking(id);
      }
      this.pushHudSnapshot();
      return;
    }

    // Station is empty on counter -> start cooking or prompt emergency restock
    if (st.cookingTimer > 0) {
      this.showBanner(`${cfg.shortName} ещё готовится...`, 1.4);
      soundEngine.playError();
      return;
    }

    if (st.pantryStock > 0) {
      this.startCooking(id);
    } else {
      this.outOfStockItem = id;
      this.showBanner(`На складе закончилось: ${cfg.shortName}! Закажите срочную доставку.`, 2.8);
      soundEngine.playError();
      this.pushHudSnapshot();
    }
  }

  public startCooking(id: MenuItemId) {
    const st = this.stations[id];
    const cfg = MENU_ITEMS[id];
    if (cfg.unlockDay > this.day) return;
    if (st.cookingTimer > 0) return;
    if (st.readyCount >= st.maxBatch) return;
    if (st.pantryStock <= 0) {
      this.outOfStockItem = id;
      this.showBanner(`Нет запасов для «${cfg.shortName}» — закажите доставку.`, 2.5);
      soundEngine.playError();
      this.pushHudSnapshot();
      return;
    }
    st.cookingTimer = st.cookDuration;
    st.bounceTimer = 0.18;
    soundEngine.playCookStart();
    const sr = this.stationRects[id];
    this.spawnBurst(sr.x + sr.w / 2, sr.y + sr.h * 0.4, 'steam', 6, '#FFF5E0');
    this.pushHudSnapshot();
  }

  public buyEmergencyStock(id: MenuItemId, qty = 6): boolean {
    const unit = getEmergencyPrice(id);
    const total = unit * qty;
    if (this.money < total) {
      this.showBanner(`Недостаточно средств (${total} сом) для срочной доставки!`, 2.2);
      soundEngine.playError();
      return false;
    }
    this.money -= total;
    this.emergencySpentToday += total;
    const st = this.stations[id];
    st.pantryStock += qty;
    if (this.outOfStockItem === id) {
      this.outOfStockItem = null;
    }
    soundEngine.playPurchase();
    const sr = this.stationRects[id];
    this.addFloatingText(sr.x + sr.w / 2, sr.y, `+${qty} склад (−${total} сом)`, '#F59E0B', 1.0);
    if (st.readyCount === 0 && st.cookingTimer <= 0) {
      this.startCooking(id);
    }
    this.pushHudSnapshot();
    return true;
  }

  public dismissOutOfStock() {
    this.outOfStockItem = null;
    this.pushHudSnapshot();
  }

  public clearTray() {
    if (!this.running || this.paused) return;
    if (this.trayItems.length === 0) return;
    let waste = 0;
    for (const id of this.trayItems) {
      waste += Math.round(MENU_ITEMS[id].baseWholesalePrice * 0.65);
    }
    this.wasteCostToday += waste;
    this.trayItems = [];
    this.trayFlash = 0.25;
    soundEngine.playError();
    this.addFloatingText(
      this.trayRect.x + this.trayRect.w / 2,
      this.trayRect.y + 20,
      `Списано (${waste} сом)`,
      '#E05A3A',
      0.95
    );
    this.pushHudSnapshot();
  }

  public triggerWash() {
    if (!this.running || this.paused) return;
    if (this.dirtyPlates <= 0) {
      this.showBanner('Все тарелки уже чистые!', 1.4);
      return;
    }
    if (this.washingTimer > 0) return;
    this.washingTimer = this.washDuration;
    soundEngine.playWashSplash();
    this.spawnBurst(
      this.sinkRect.x + this.sinkRect.w / 2,
      this.sinkRect.y + this.sinkRect.h * 0.45,
      'bubble',
      10,
      '#B8E6FF'
    );
    this.pushHudSnapshot();
  }

  public autoServeTray() {
    if (!this.running || this.paused) return;
    if (this.trayItems.length === 0) return;

    // Pick most urgent waiting student who can accept at least 1 item (prefer full match!)
    let bestSlot = -1;
    let bestScore = -1;

    for (let i = 0; i < 4; i++) {
      const st = this.counterStudents[i];
      if (!st || st.state !== 'waiting') continue;
      const matches = this.countTrayMatches(st);
      if (matches <= 0) continue;

      const remainingUnserved = st.order.filter((o) => !o.delivered).length;
      const completesOrder = matches === remainingUnserved && matches === this.trayItems.length;
      const urgency = 1 - st.patience / st.maxPatience;
      const score = (completesOrder ? 100 : matches * 15) + urgency * 20;
      if (score > bestScore) {
        bestScore = score;
        bestSlot = i;
      }
    }

    if (bestSlot >= 0) {
      this.serveStudentAtSlot(bestSlot);
    } else {
      this.showBanner('Никто не заказывал блюда с подноса! Очистите поднос (X).', 2.0);
      this.trayFlash = 0.35;
      soundEngine.playError();
    }
  }

  private countTrayMatches(student: CounterStudent): number {
    const needed = student.order.filter((o) => !o.delivered).map((o) => o.itemId);
    let count = 0;
    const pool = [...needed];
    for (const item of this.trayItems) {
      const idx = pool.indexOf(item);
      if (idx !== -1) {
        pool.splice(idx, 1);
        count++;
      }
    }
    return count;
  }

  public serveStudentAtSlot(slotIndex: number) {
    if (!this.running || this.paused) return;
    const st = this.counterStudents[slotIndex];
    if (!st || st.state !== 'waiting') return;

    if (this.trayItems.length === 0) {
      this.showBanner('Сначала соберите блюда на поднос (клавиши 1–5 или клик по витрине).', 2.0);
      soundEngine.playError();
      return;
    }

    if (this.cleanPlates <= 0) {
      this.showBanner('Закончились чистые тарелки! Нажмите на мойку (R).', 2.4);
      this.shakeIntensity = Math.max(this.shakeIntensity, 5);
      soundEngine.playError();
      return;
    }

    // Match as many tray items as the student needs
    let matchedCount = 0;
    const remainingTray: MenuItemId[] = [];
    for (const item of this.trayItems) {
      const orderEntry = st.order.find((o) => !o.delivered && o.itemId === item);
      if (orderEntry) {
        orderEntry.delivered = true;
        matchedCount++;
      } else {
        remainingTray.push(item);
      }
    }

    if (matchedCount === 0) {
      this.showBanner(`Студент ждёт другой заказ!`, 1.8);
      this.trayFlash = 0.35;
      soundEngine.playError();
      return;
    }

    this.trayItems = remainingTray;
    st.squash = 0.24;

    const allDone = st.order.every((o) => o.delivered);
    if (!allDone) {
      // Partial delivery — restores a small bit of patience!
      st.patience = Math.min(st.maxPatience, st.patience + 3.5);
      soundEngine.playServePartial();
      this.spawnBurst(st.x, st.y - 95, 'spark', 6, '#F7D060');
      this.addFloatingText(st.x, st.y - 120, 'Принято!', '#34D399', 0.9);
      this.pushHudSnapshot();
      return;
    }

    // Complete order served! Consume 1 clean plate
    this.cleanPlates = Math.max(0, this.cleanPlates - 1);
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.servedToday += 1;

    const baseTotal = st.order.reduce((acc, o) => acc + MENU_ITEMS[o.itemId].sellPrice, 0);
    const speedRatio = st.patience / st.maxPatience;
    const gazeboTipBoost = 1 + this.upgrades.cozy_gazebos * 0.18;
    const comboMult = 1 + Math.min(this.combo - 1, 8) * 0.08;
    const tip = Math.round(
      baseTotal * (0.1 + speedRatio * 0.28) * st.archetype.tipMultiplier * gazeboTipBoost * comboMult
    );
    const totalEarned = baseTotal + tip;

    this.money += totalEarned;
    this.revenueToday += baseTotal;
    this.tipsToday += tip;
    this.rating = Math.min(5.0, +(this.rating + st.archetype.reputationWeight * (0.6 + speedRatio * 0.5)).toFixed(2));

    soundEngine.playServeComplete(this.combo);
    this.spawnBurst(st.x, st.y - 90, 'coin', 9, '#FBBF24');
    this.spawnBurst(st.x, st.y - 105, 'spark', 7, '#4ADE80');

    if (this.combo >= 4) {
      this.hitstopTimer = 0.042; // Crisp juicy hitstop on high combos
      this.addFloatingText(st.x, st.y - 155, `КОМБО ×${this.combo}!`, '#F97316', 1.18);
    }
    this.addFloatingText(st.x, st.y - 122, `+${totalEarned} сом`, '#34D399', 1.08);

    // Move student to a dining table (or leave happily if tables full)
    this.seatStudentAtTable(st);
    st.state = 'leaving_happy';
    st.speechText = speedRatio > 0.55 ? 'Рахмат!' : 'Спасибо!';
    st.speechTimer = 1.2;
    this.leavingStudents.push(st);
    this.counterStudents[slotIndex] = null;

    this.pushHudSnapshot();
  }

  private seatStudentAtTable(st: CounterStudent) {
    // 4 tables x 2 seats
    const occupied = new Set(this.seatedStudents.map((s) => `${s.tableIndex}-${s.seatIndex}`));
    for (let t = 0; t < 4; t++) {
      for (let seat = 0; seat < 2; seat++) {
        if (!occupied.has(`${t}-${seat}`)) {
          const eatTime = 8 + Math.random() * 5;
          this.seatedStudents.push({
            id: st.id,
            tableIndex: t,
            seatIndex: seat,
            jacketColor: st.jacketColor,
            hairColor: st.hairColor,
            skinTone: st.skinTone,
            hairStyle: st.hairStyle,
            items: st.order.map((o) => o.itemId),
            eatTimer: eatTime,
            maxEatTimer: eatTime,
          });
          return;
        }
      }
    }
    // If all 8 seats are occupied, plate returns to dirty stack shortly
    this.dirtyPlates = Math.min(this.maxPlates - this.cleanPlates, this.dirtyPlates + 1);
  }

  private showBanner(text: string, duration = 2.2) {
    this.alertBanner = text;
    this.alertTimer = duration;
    this.pushHudSnapshot();
  }

  private addFloatingText(x: number, y: number, text: string, color: string, scale = 1) {
    this.floatingTexts.push({
      id: this.nextTextId++,
      x,
      y,
      vy: -42,
      text,
      color,
      life: 1.15,
      maxLife: 1.15,
      scale,
    });
  }

  private spawnBurst(
    x: number,
    y: number,
    kind: Particle['kind'],
    count: number,
    color: string
  ) {
    for (let i = 0; i < count; i++) {
      const angle =
        kind === 'steam'
          ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9
          : Math.random() * Math.PI * 2;
      const speed =
        kind === 'steam'
          ? 18 + Math.random() * 28
          : kind === 'bubble'
          ? 24 + Math.random() * 48
          : 45 + Math.random() * 95;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (kind === 'coin' ? 65 : 10),
        size: kind === 'steam' ? 5 + Math.random() * 5 : 3 + Math.random() * 4,
        color,
        alpha: 1,
        life: 0.45 + Math.random() * 0.45,
        maxLife: 0.9,
        kind,
      });
    }
  }

  private isRushHourNow(): { active: boolean; label: string } {
    const p = this.elapsedSec / SHIFT_DURATION_SEC;
    // Morning break (09:50-10:40 -> p 0.25..0.38) and Big Lunch Break (12:00-13:45 -> p 0.57..0.82)
    if (p >= 0.25 && p <= 0.39) {
      return { active: true, label: 'Перемена после 1-й пары!' };
    }
    if (p >= 0.57 && p <= 0.83) {
      return { active: true, label: 'Большая перемена · Час пик!' };
    }
    return { active: false, label: '' };
  }

  private spawnStudent() {
    const openSlots: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (this.counterStudents[i] === null) openSlots.push(i);
    }
    if (openSlots.length === 0) return;

    const slot = openSlots[Math.floor(Math.random() * openSlots.length)];
    const unlocked = this.getUnlockedItems();

    // Pick archetype weighted by day
    const pool: StudentArchetype[] =
      this.day === 1
        ? [STUDENT_ARCHETYPES[0], STUDENT_ARCHETYPES[0], STUDENT_ARCHETYPES[1], STUDENT_ARCHETYPES[2]]
        : STUDENT_ARCHETYPES;
    const archetype = pool[Math.floor(Math.random() * pool.length)];

    // Build order using forecast demand weights
    const maxItems = Math.min(archetype.maxItems, this.day === 1 ? 2 : 3);
    const itemCount =
      archetype.minItems +
      Math.floor(Math.random() * (Math.max(0, maxItems - archetype.minItems) + 1));

    const order: { itemId: MenuItemId; delivered: boolean }[] = [];
    for (let k = 0; k < itemCount; k++) {
      const weights = unlocked.map((id) => {
        let w = this.forecast.demandMultipliers[id] ?? 1;
        if (archetype.preferredItems.includes(id)) w *= 1.65;
        // Slight reduction for duplicates so orders feel varied & fun
        if (order.some((o) => o.itemId === id)) w *= 0.35;
        return Math.max(0.15, w);
      });
      const sum = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * sum;
      let chosen = unlocked[0];
      for (let u = 0; u < unlocked.length; u++) {
        roll -= weights[u];
        if (roll <= 0) {
          chosen = unlocked[u];
          break;
        }
      }
      order.push({ itemId: chosen, delivered: false });
    }

    const gazeboBonus = 1 + this.upgrades.cozy_gazebos * 0.22;
    const patience = archetype.patienceSec * gazeboBonus;
    const slotRect = this.studentRects[slot];

    this.counterStudents[slot] = {
      id: this.nextStudentId++,
      slotIndex: slot,
      archetype,
      x: -60,
      y: this.height * 0.62 - 4,
      targetX: slotRect.x + slotRect.w / 2,
      state: 'entering',
      order,
      patience,
      maxPatience: patience,
      jacketColor:
        archetype.jacketColors[Math.floor(Math.random() * archetype.jacketColors.length)],
      hairColor: archetype.hairColors[Math.floor(Math.random() * archetype.hairColors.length)],
      skinTone: archetype.skinTones[Math.floor(Math.random() * archetype.skinTones.length)],
      hairStyle: Math.floor(Math.random() * 4),
      walkPhase: Math.random() * Math.PI * 2,
      squash: 0,
      speechTimer: 0,
    };
  }

  private loop = (timestamp: number) => {
    if (!this.running) return;
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);

    if (!this.paused) {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else {
        this.update(dt);
      }
    }

    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.elapsedSec += dt;

    // Rush hour alerts
    const rush = this.isRushHourNow();
    const progress = this.elapsedSec / SHIFT_DURATION_SEC;
    if (progress >= 0.25 && !this.rushTriggered) {
      this.rushTriggered = true;
      this.showBanner('Звонок с 1-й пары! Поток студентов усилился.', 2.8);
      this.shakeIntensity = Math.max(this.shakeIntensity, 4);
      soundEngine.playRushBell();
    }
    if (progress >= 0.57 && !this.rush2Triggered) {
      this.rush2Triggered = true;
      this.showBanner('Большая перемена! Аншлаг на раздаче!', 3.2);
      this.shakeIntensity = Math.max(this.shakeIntensity, 6);
      soundEngine.playRushBell();
    }

    // Check end of shift (stop spawning new students in last 5s, finish once queue clears or +6s overtime)
    const spawningOpen = this.elapsedSec < SHIFT_DURATION_SEC - 4;
    if (spawningOpen) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnStudent();
        const baseInterval = 4.9 / this.forecast.studentRateMultiplier;
        const rushDiv = rush.active ? this.forecast.rushBonus : 1;
        this.spawnTimer = Math.max(1.35, (baseInterval / rushDiv) * (0.82 + Math.random() * 0.36));
      }
    }

    // Update stations cooking & ambient steam
    for (const id of MENU_ORDER) {
      const st = this.stations[id];
      if (st.flashTimer > 0) st.flashTimer = Math.max(0, st.flashTimer - dt);
      if (st.bounceTimer > 0) st.bounceTimer = Math.max(0, st.bounceTimer - dt);

      if (st.cookingTimer > 0) {
        st.cookingTimer -= dt;
        if (Math.random() < dt * 4.5) {
          const r = this.stationRects[id];
          this.spawnBurst(r.x + r.w / 2, r.y + r.h * 0.35, 'steam', 1, '#FFF6E8');
        }
        if (st.cookingTimer <= 0) {
          st.cookingTimer = 0;
          const space = st.maxBatch - st.readyCount;
          const cooked = Math.min(space, st.pantryStock);
          st.readyCount += cooked;
          st.pantryStock -= cooked;
          st.flashTimer = 0.45;
          st.bounceTimer = 0.24;
          soundEngine.playCookReady();
          const r = this.stationRects[id];
          this.addFloatingText(r.x + r.w / 2, r.y + 8, `+${cooked} готово`, '#FBBF24', 0.9);
        }
      } else if (
        (id === 'tea' || id === 'plov') &&
        st.readyCount > 0 &&
        Math.random() < dt * 1.4
      ) {
        const r = this.stationRects[id];
        this.spawnBurst(r.x + r.w / 2, r.y + r.h * 0.3, 'steam', 1, 'rgba(255,255,255,0.7)');
      }
    }

    // Update manual dish washing
    if (this.washingTimer > 0) {
      this.washingTimer -= dt;
      if (Math.random() < dt * 10) {
        this.spawnBurst(
          this.sinkRect.x + this.sinkRect.w * 0.5,
          this.sinkRect.y + this.sinkRect.h * 0.45,
          'bubble',
          1,
          '#C2ECFF'
        );
      }
      if (this.washingTimer <= 0) {
        this.washingTimer = 0;
        const washed = Math.min(3, this.dirtyPlates);
        this.dirtyPlates -= washed;
        this.cleanPlates = Math.min(this.maxPlates, this.cleanPlates + washed);
        this.addFloatingText(
          this.sinkRect.x + this.sinkRect.w / 2,
          this.sinkRect.y + 12,
          `+${washed} чистых`,
          '#60A5FA',
          0.95
        );
        soundEngine.playCookReady();
      }
    }

    // Auto dishwasher passive effect
    if (this.upgrades.dishwasher > 0 && this.dirtyPlates > 0 && this.washingTimer <= 0) {
      this.autoWashAccum += dt;
      const interval = this.upgrades.dishwasher === 1 ? 3.8 : 2.1;
      if (this.autoWashAccum >= interval) {
        this.autoWashAccum = 0;
        this.dirtyPlates -= 1;
        this.cleanPlates = Math.min(this.maxPlates, this.cleanPlates + 1);
        this.spawnBurst(
          this.sinkRect.x + this.sinkRect.w * 0.5,
          this.sinkRect.y + this.sinkRect.h * 0.5,
          'bubble',
          4,
          '#93C5FD'
        );
      }
    }

    // Update seated students -> finish eating -> produce dirty plate
    for (let i = this.seatedStudents.length - 1; i >= 0; i--) {
      const s = this.seatedStudents[i];
      s.eatTimer -= dt;
      if (s.eatTimer <= 0) {
        this.seatedStudents.splice(i, 1);
        this.dirtyPlates = Math.min(this.maxPlates - this.cleanPlates, this.dirtyPlates + 1);
      }
    }

    // Update counter students
    for (let i = 0; i < 4; i++) {
      const st = this.counterStudents[i];
      if (!st) continue;
      st.squash = Math.max(0, st.squash - dt * 1.4);

      if (st.state === 'entering') {
        st.walkPhase += dt * 11;
        const dx = st.targetX - st.x;
        const step = Math.min(Math.abs(dx), 310 * dt);
        st.x += Math.sign(dx) * step;
        if (Math.abs(st.targetX - st.x) < 2) {
          st.x = st.targetX;
          st.state = 'waiting';
        }
      } else if (st.state === 'waiting') {
        st.patience -= dt;
        if (st.patience <= 0) {
          // Student leaves angry!
          this.missedToday += 1;
          this.combo = 0;
          this.rating = Math.max(0, +(this.rating - st.archetype.reputationWeight * 2.1).toFixed(2));
          st.state = 'leaving_angry';
          st.speechText = 'Опаздываю!';
          st.speechTimer = 1.4;
          this.leavingStudents.push(st);
          this.counterStudents[i] = null;
          this.shakeIntensity = Math.max(this.shakeIntensity, 7);
          soundEngine.playAngryLeave();
          this.addFloatingText(st.x, st.y - 120, 'Ушёл голодным!', '#EF4444', 1.05);

          if (this.rating <= 0.5) {
            this.triggerGameOver('Рейтинг столовой упал ниже 0.5 ★ — студенты ушли в буфет соседнего корпуса.');
            return;
          }
        }
      }
    }

    // Update leaving students
    for (let i = this.leavingStudents.length - 1; i >= 0; i--) {
      const st = this.leavingStudents[i];
      st.walkPhase += dt * 12;
      st.speechTimer = Math.max(0, st.speechTimer - dt);
      const dir = st.state === 'leaving_happy' ? 1 : -1;
      st.x += dir * 290 * dt;
      if (st.x < -120 || st.x > this.width + 120) {
        this.leavingStudents.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'coin') p.vy += 240 * dt;
      if (p.kind === 'bubble') p.vy -= 18 * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }

    // Update floating text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.96;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Shake & alerts
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 22);
    if (this.trayFlash > 0) this.trayFlash = Math.max(0, this.trayFlash - dt);
    if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) {
        this.alertBanner = null;
      }
    }

    // Check day finish condition
    const anyWaiting = this.counterStudents.some((s) => s !== null);
    if (this.elapsedSec >= SHIFT_DURATION_SEC && (!anyWaiting || this.elapsedSec >= SHIFT_DURATION_SEC + 7)) {
      this.finishDay();
      return;
    }

    // Periodic HUD sync (~12Hz)
    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.pushHudSnapshot();
    }
  }

  private buildDayStats(): DayStats {
    return {
      day: this.day,
      servedCount: this.servedToday,
      missedCount: this.missedToday,
      revenue: this.revenueToday,
      tips: this.tipsToday,
      emergencySpent: this.emergencySpentToday,
      wasteCost: this.wasteCostToday,
      maxCombo: this.maxCombo,
      ratingDelta: +(this.rating - this.startRating).toFixed(2),
      startMoney: this.startMoney,
      endMoney: this.money,
    };
  }

  private finishDay() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    soundEngine.playDayComplete();

    // Unsold ready portions don't spoil completely: raw pantry stock carries over!
    // Leftover cooked items on counter count as slight end-of-day shrinkage (realistic resource sim!)
    const nextPantry: Record<MenuItemId, number> = {
      tea: this.stations.tea.pantryStock,
      bun: this.stations.bun.pantryStock,
      egg: this.stations.egg.pantryStock,
      samsa: this.stations.samsa.pantryStock,
      plov: this.stations.plov.pantryStock,
    };

    const stats = this.buildDayStats();
    this.callbacks.onDayComplete(stats, nextPantry, this.money, this.rating);
  }

  private triggerGameOver(reason: string) {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.onGameOver(reason, this.buildDayStats());
  }

  private formatClock(): string {
    const p = Math.min(1, this.elapsedSec / SHIFT_DURATION_SEC);
    const totalMinutes = Math.floor(8 * 60 + p * 7 * 60); // 08:00 -> 15:00
    const hh = Math.floor(totalMinutes / 60);
    const mm = Math.floor((totalMinutes % 60) / 5) * 5;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  private pushHudSnapshot() {
    const rush = this.isRushHourNow();
    const stationSummary = {} as HudSnapshot['stations'];
    for (const id of MENU_ORDER) {
      const st = this.stations[id];
      stationSummary[id] = {
        unlocked: MENU_ITEMS[id].unlockDay <= this.day,
        ready: st.readyCount,
        maxBatch: st.maxBatch,
        pantry: st.pantryStock,
        cookingProgress: st.cookingTimer > 0 ? 1 - st.cookingTimer / st.cookDuration : 0,
      };
    }

    this.callbacks.onHudUpdate({
      day: this.day,
      mode: this.mode,
      money: this.money,
      rating: this.rating,
      timeProgress: Math.min(1, this.elapsedSec / SHIFT_DURATION_SEC),
      clockLabel: this.formatClock(),
      isRushHour: rush.active,
      rushLabel: rush.label,
      combo: this.combo,
      servedToday: this.servedToday,
      missedToday: this.missedToday,
      cleanPlates: this.cleanPlates,
      maxPlates: this.maxPlates,
      dirtyPlates: this.dirtyPlates,
      washingProgress: this.washingTimer > 0 ? 1 - this.washingTimer / this.washDuration : 0,
      trayItems: [...this.trayItems],
      trayCapacity: this.trayCapacity,
      stations: stationSummary,
      pantryCap: BASE_PANTRY_CAP,
      alertBanner: this.alertBanner,
      outOfStockItem: this.outOfStockItem,
    });
  }

  // ==================== RENDERING ====================

  private render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    if (this.shakeIntensity > 0.2) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      ctx.translate(sx, sy);
    }

    this.drawDiningHall(ctx);
    this.drawSeatedTables(ctx);
    this.drawFloralPlanters(ctx);
    this.drawStudents(ctx);
    this.drawCounterDeck(ctx);
    this.drawParticles(ctx);
    this.drawFloatingTexts(ctx);

    ctx.restore();
  }

  private drawDiningHall(ctx: CanvasRenderingContext2D) {
    const W = this.width;
    const H = this.height;
    const p = Math.min(1, this.elapsedSec / SHIFT_DURATION_SEC);
    const ceilingH = H * 0.11;
    const floorTop = H * 0.43;
    const counterTop = H * 0.62;

    // 1. White suspended tiled ceiling (faithful to interior photo)
    ctx.fillStyle = '#EFECE6';
    ctx.fillRect(0, 0, W, ceilingH);
    ctx.strokeStyle = 'rgba(155, 145, 130, 0.26)';
    ctx.lineWidth = 1;
    const tileW = 68;
    for (let x = 0; x < W; x += tileW) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 14, ceilingH);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, ceilingH * 0.55);
    ctx.lineTo(W, ceilingH * 0.55);
    ctx.stroke();

    // Glowing fluorescent ceiling tubes
    const lampCount = 4;
    for (let i = 0; i < lampCount; i++) {
      const lx = W * (0.14 + i * 0.24);
      const ly = ceilingH * 0.68;
      ctx.fillStyle = '#FFFFFF';
      roundRectPath(ctx, lx - 48, ly - 4, 96, 8, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 250, 232, 0.22)';
      roundRectPath(ctx, lx - 64, ly - 10, 128, 22, 10);
      ctx.fill();
    }

    // 2. Warm cream dining room back wall
    ctx.fillStyle = '#E8DFCF';
    ctx.fillRect(0, ceilingH, W, floorTop - ceilingH);

    // 3. Panoramic Campus Windows showing the real blue-white curved building & mountains!
    const winY = ceilingH + 14;
    const winH = floorTop - ceilingH - 26;
    const winStartX = W * 0.05;
    const winW = W * 0.52;

    // Sky shifts smoothly from crisp morning sky to warm golden afternoon
    const skyGrad = ctx.createLinearGradient(0, winY, 0, winY + winH);
    if (p < 0.65) {
      skyGrad.addColorStop(0, '#6FA2CF');
      skyGrad.addColorStop(1, '#BCD9EE');
    } else {
      skyGrad.addColorStop(0, '#6B99C4');
      skyGrad.addColorStop(0.65, '#C8D8E4');
      skyGrad.addColorStop(1, '#F3CE9C');
    }
    ctx.fillStyle = skyGrad;
    roundRectPath(ctx, winStartX, winY, winW, winH, 6);
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, winStartX, winY, winW, winH, 6);
    ctx.clip();

    // Distant Ala-Too snow-capped peaks (right side of exterior photo)
    ctx.fillStyle = '#B8CCE0';
    ctx.beginPath();
    ctx.moveTo(winStartX + winW * 0.62, winY + winH);
    ctx.lineTo(winStartX + winW * 0.76, winY + winH * 0.42);
    ctx.lineTo(winStartX + winW * 0.87, winY + winH * 0.58);
    ctx.lineTo(winStartX + winW * 0.96, winY + winH * 0.36);
    ctx.lineTo(winStartX + winW + 10, winY + winH);
    ctx.closePath();
    ctx.fill();

    // Snow caps
    ctx.fillStyle = '#F3F7FB';
    ctx.beginPath();
    ctx.moveTo(winStartX + winW * 0.76, winY + winH * 0.42);
    ctx.lineTo(winStartX + winW * 0.72, winY + winH * 0.56);
    ctx.lineTo(winStartX + winW * 0.79, winY + winH * 0.54);
    ctx.closePath();
    ctx.fill();

    // Iconic Pale-Blue & White Curved University Block (from Photo #2!)
    const bX = winStartX + winW * 0.34;
    const bY = winY + winH * 0.14;
    const bW = winW * 0.38;
    const bH = winH * 0.86;
    // Blue end facade with arched roof
    ctx.fillStyle = '#7FA5C3';
    ctx.beginPath();
    ctx.moveTo(bX, bY + 18);
    ctx.quadraticCurveTo(bX + bW * 0.24, bY - 6, bX + bW * 0.46, bY + 14);
    ctx.lineTo(bX + bW * 0.46, bY + bH);
    ctx.lineTo(bX, bY + bH);
    ctx.closePath();
    ctx.fill();
    // White curved sunlit side wing
    ctx.fillStyle = '#F5F4F0';
    ctx.beginPath();
    ctx.moveTo(bX + bW * 0.46, bY + 14);
    ctx.lineTo(bX + bW, bY + 34);
    ctx.lineTo(bX + bW, bY + bH);
    ctx.lineTo(bX + bW * 0.46, bY + bH);
    ctx.closePath();
    ctx.fill();
    // Subtle facade windows
    ctx.fillStyle = '#4B647A';
    for (let row = 0; row < 3; row++) {
      ctx.fillRect(bX + bW * 0.15, bY + 26 + row * 22, 16, 12);
      for (let col = 0; col < 4; col++) {
        ctx.fillRect(bX + bW * 0.53 + col * 18, bY + 32 + row * 19 + col * 3, 9, 10);
      }
    }

    // Green campus lawn & birch trees & wooden gazebo
    ctx.fillStyle = '#6B8F4E';
    ctx.fillRect(winStartX, winY + winH * 0.72, winW, winH * 0.28);

    // Wooden campus gazebo silhouette (enhanced when cozy_gazebos upgraded)
    const gzCount = 1 + this.upgrades.cozy_gazebos;
    for (let g = 0; g < gzCount; g++) {
      const gx = winStartX + 38 + g * 95;
      const gy = winY + winH * 0.62;
      ctx.fillStyle = '#6C4224';
      ctx.beginPath();
      ctx.moveTo(gx - 28, gy + 14);
      ctx.lineTo(gx, gy);
      ctx.lineTo(gx + 28, gy + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(gx - 20, gy + 14, 4, 28);
      ctx.fillRect(gx + 16, gy + 14, 4, 28);
    }

    // Window mullions
    ctx.strokeStyle = '#F7F3EC';
    ctx.lineWidth = 4;
    for (let m = 1; m < 4; m++) {
      const mx = winStartX + (winW / 4) * m;
      ctx.beginPath();
      ctx.moveTo(mx, winY);
      ctx.lineTo(mx, winY + winH);
      ctx.stroke();
    }
    ctx.restore();

    // Window wood trim frame
    ctx.strokeStyle = '#9D6938';
    ctx.lineWidth = 4;
    roundRectPath(ctx, winStartX, winY, winW, winH, 6);
    ctx.stroke();

    // 4. Vertical Honey-Wood Slatted Partition (Signature detail from Photo #1!)
    const partX = W * 0.61;
    const partW = W * 0.34;
    const partY = ceilingH + 8;
    const partH = floorTop - partY + 6;
    ctx.fillStyle = '#C99B67';
    roundRectPath(ctx, partX, partY, partW, partH, 4);
    ctx.fill();

    const slatCount = Math.floor(partW / 14);
    for (let i = 0; i < slatCount; i++) {
      const sx = partX + 6 + i * 14;
      ctx.fillStyle = i % 2 === 0 ? '#8E5B31' : '#7C4E28';
      ctx.fillRect(sx, partY + 6, 7, partH - 12);
    }

    // Wooden architectural columns spanning ceiling to floor
    const pillarPositions = [W * 0.03, W * 0.59, W * 0.96];
    for (const px of pillarPositions) {
      const grad = ctx.createLinearGradient(px - 8, 0, px + 8, 0);
      grad.addColorStop(0, '#B98047');
      grad.addColorStop(0.5, '#996332');
      grad.addColorStop(1, '#754821');
      ctx.fillStyle = grad;
      ctx.fillRect(px - 8, ceilingH, 16, counterTop - ceilingH);
    }

    // 5. Warm Dining Hall Floor (Terrazzo / Light Beige Tile)
    const floorGrad = ctx.createLinearGradient(0, floorTop, 0, counterTop);
    floorGrad.addColorStop(0, '#DDD2BF');
    floorGrad.addColorStop(1, '#CBBBA3');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorTop, W, counterTop - floorTop);

    // Subtle floor tile lines
    ctx.strokeStyle = 'rgba(130, 110, 88, 0.14)';
    ctx.lineWidth = 1;
    for (let fy = floorTop + 26; fy < counterTop; fy += 28) {
      ctx.beginPath();
      ctx.moveTo(0, fy);
      ctx.lineTo(W, fy);
      ctx.stroke();
    }
  }

  private drawSeatedTables(ctx: CanvasRenderingContext2D) {
    const W = this.width;
    const H = this.height;
    const tableY = H * 0.445;
    const tableXs = [W * 0.14, W * 0.38, W * 0.63, W * 0.85];

    tableXs.forEach((tx, tIdx) => {
      // Chairs left & right
      ctx.fillStyle = '#2B3038';
      roundRectPath(ctx, tx - 50, tableY - 22, 16, 26, 4);
      ctx.fill();
      roundRectPath(ctx, tx + 34, tableY - 22, 16, 26, 4);
      ctx.fill();

      // Seated students at this table
      const seatedHere = this.seatedStudents.filter((s) => s.tableIndex === tIdx);
      for (const s of seatedHere) {
        const sx = s.seatIndex === 0 ? tx - 38 : tx + 38;
        this.drawMiniSeatedStudent(ctx, sx, tableY - 6, s);
      }

      // Patterned round tablecloth (matching photo #1's crisp white/gray patterned tablecloths!)
      ctx.fillStyle = '#F6F2EA';
      ctx.beginPath();
      ctx.ellipse(tx, tableY + 2, 42, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#B8ACA0';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Decorative tablecloth motif rings
      ctx.strokeStyle = 'rgba(150, 128, 112, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(tx - 16, tableY + 2, 7, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(tx + 16, tableY + 2, 7, 3, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Tablecloth front drape
      ctx.fillStyle = '#E8E0D2';
      ctx.fillRect(tx - 38, tableY + 4, 76, 18);

      // Plates of food currently being eaten on the table!
      seatedHere.forEach((s) => {
        const px = s.seatIndex === 0 ? tx - 14 : tx + 14;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(px, tableY + 1, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        if (s.items[0]) {
          this.drawFoodIcon(ctx, s.items[0], px, tableY - 1, 12);
        }
      });
    });
  }

  private drawMiniSeatedStudent(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    s: SeatedStudent
  ) {
    // Torso
    ctx.fillStyle = s.jacketColor;
    roundRectPath(ctx, x - 11, y - 14, 22, 22, 8);
    ctx.fill();
    // Head
    ctx.fillStyle = s.skinTone;
    ctx.beginPath();
    ctx.arc(x, y - 24, 10, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    ctx.fillStyle = s.hairColor;
    ctx.beginPath();
    ctx.arc(x, y - 26, 10.5, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  private drawFloralPlanters(ctx: CanvasRenderingContext2D) {
    // Iconic vibrant coral-red & green floral planters from Photo #1 separating dining tables and service line
    const W = this.width;
    const H = this.height;
    const y = H * 0.49;
    const positions = [W * 0.06, W * 0.27, W * 0.51, W * 0.74, W * 0.94];

    for (const px of positions) {
      // Wooden planter trough
      ctx.fillStyle = '#7C4F29';
      roundRectPath(ctx, px - 26, y, 52, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#9A673B';
      ctx.fillRect(px - 24, y + 2, 48, 4);

      // Lush emerald foliage blades
      ctx.fillStyle = '#2E7D32';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(px + i * 7, y - 6, 4.5, 11, i * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bright coral-orange blossoms (matching Photo #1's distinctive coral flowers!)
      const bloomColors = ['#F06449', '#FF8360', '#E84F38'];
      for (let b = -1; b <= 1; b++) {
        ctx.fillStyle = bloomColors[b + 1];
        ctx.beginPath();
        ctx.arc(px + b * 13, y - 13 - Math.abs(b) * 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFD1A9';
        ctx.beginPath();
        ctx.arc(px + b * 13, y - 13 - Math.abs(b) * 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawStudents(ctx: CanvasRenderingContext2D) {
    const allStudents: { st: CounterStudent; slotIdx: number }[] = [];
    this.counterStudents.forEach((st, idx) => {
      if (st) allStudents.push({ st, slotIdx: idx });
    });
    this.leavingStudents.forEach((st) => allStudents.push({ st, slotIdx: -1 }));

    const hotkeys = ['A', 'S', 'D', 'F'];

    for (const { st, slotIdx } of allStudents) {
      const isHovered =
        slotIdx >= 0 &&
        st.state === 'waiting' &&
        hitTest(this.mouseX, this.mouseY, this.studentRects[slotIdx]);
      const canReceiveTray =
        st.state === 'waiting' &&
        this.trayItems.length > 0 &&
        this.countTrayMatches(st) > 0;

      const bob =
        st.state === 'waiting'
          ? Math.sin(this.elapsedSec * 2.8 + st.id) * 2.2
          : Math.abs(Math.sin(st.walkPhase)) * 7;

      const scaleX = 1 + st.squash * 0.35;
      const scaleY = 1 - st.squash * 0.28;

      ctx.save();
      ctx.translate(st.x, st.y - bob);
      ctx.scale(scaleX, scaleY);

      // Subtle floor shadow
      ctx.fillStyle = 'rgba(30, 22, 16, 0.16)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 34, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Highlight aura if hovered or matches active tray
      if (canReceiveTray) {
        ctx.strokeStyle = isHovered ? '#10B981' : 'rgba(16, 185, 129, 0.55)';
        ctx.lineWidth = isHovered ? 4 : 2.5;
        ctx.beginPath();
        ctx.ellipse(0, -45, 42, 54, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Shoulders & Jacket (inspired by denim blue shirt, red jacket, black hoodie in Photo #1)
      ctx.fillStyle = st.jacketColor;
      roundRectPath(ctx, -28, -68, 56, 70, 18);
      ctx.fill();

      // Shirt collar / v-neck accent
      ctx.fillStyle = '#F8F4EC';
      ctx.beginPath();
      ctx.moveTo(-10, -68);
      ctx.lineTo(0, -52);
      ctx.lineTo(10, -68);
      ctx.closePath();
      ctx.fill();

      // Neck
      ctx.fillStyle = st.skinTone;
      ctx.fillRect(-7, -77, 14, 12);

      // Head
      ctx.fillStyle = st.skinTone;
      ctx.beginPath();
      ctx.arc(0, -94, 22, 0, Math.PI * 2);
      ctx.fill();

      // Hair styles (bob cut, ponytail, short cropped, professor side-part)
      ctx.fillStyle = st.hairColor;
      if (st.hairStyle === 0) {
        // Bob cut (like the student carrying a tray in Photo #1!)
        ctx.beginPath();
        ctx.arc(0, -97, 23.5, Math.PI * 0.9, Math.PI * 2.1);
        ctx.fill();
        ctx.fillRect(-23, -98, 7, 21);
        ctx.fillRect(16, -98, 7, 21);
      } else if (st.hairStyle === 1) {
        // Long hair + bangs
        ctx.beginPath();
        ctx.arc(0, -98, 23, Math.PI * 0.95, Math.PI * 2.05);
        ctx.fill();
        ctx.fillRect(-22, -97, 6, 28);
        ctx.fillRect(16, -97, 6, 28);
      } else {
        // Clean short cut
        ctx.beginPath();
        ctx.arc(0, -99, 22.5, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
      }

      // Expressive Face based on patience ratio
      const pRatio = st.patience / st.maxPatience;
      ctx.fillStyle = '#1E1C1A';
      // Eyes
      ctx.beginPath();
      ctx.arc(-8, -94, 2.3, 0, Math.PI * 2);
      ctx.arc(8, -94, 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Brows & mouth
      ctx.strokeStyle = '#2B211C';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (st.state === 'leaving_happy' || pRatio > 0.55) {
        // Warm smile
        ctx.beginPath();
        ctx.arc(0, -86, 6, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      } else if (pRatio > 0.28) {
        // Neutral / waiting
        ctx.beginPath();
        ctx.moveTo(-5, -83);
        ctx.lineTo(5, -83);
        ctx.stroke();
      } else {
        // Anxious / frustrated eyebrows + frown + sweat drop
        ctx.beginPath();
        ctx.moveTo(-12, -101);
        ctx.lineTo(-5, -98);
        ctx.moveTo(12, -101);
        ctx.lineTo(5, -98);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -79, 5.5, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();

        // Sweat drop telegraph
        ctx.fillStyle = '#60A5FA';
        ctx.beginPath();
        ctx.arc(17, -102 + Math.sin(this.elapsedSec * 9) * 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glasses for honors/professor
      if (st.archetype.id === 'professor' || st.archetype.id === 'honors') {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-13, -98, 10, 7);
        ctx.strokeRect(3, -98, 10, 7);
        ctx.beginPath();
        ctx.moveTo(-3, -95);
        ctx.lineTo(3, -95);
        ctx.stroke();
      }

      // Student's held tray in front
      ctx.fillStyle = '#D9CBB8';
      roundRectPath(ctx, -26, -16, 52, 10, 4);
      ctx.fill();
      ctx.strokeStyle = '#9D8B74';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Draw Order Bubble for waiting students
      if (st.state === 'waiting') {
        this.drawOrderBubble(ctx, st, slotIdx >= 0 ? hotkeys[slotIdx] : '', canReceiveTray, isHovered);
      } else if (st.speechText && st.speechTimer > 0) {
        this.drawSpeechTag(
          ctx,
          st.x,
          st.y - 134,
          st.speechText,
          st.state === 'leaving_happy' ? '#16A34A' : '#DC2626'
        );
      }
    }
  }

  private drawOrderBubble(
    ctx: CanvasRenderingContext2D,
    st: CounterStudent,
    hotkey: string,
    canReceive: boolean,
    isHovered: boolean
  ) {
    const itemCount = st.order.length;
    const bubbleW = Math.max(108, itemCount * 42 + 24);
    const bubbleH = 66;
    const bx = Math.max(12, Math.min(this.width - bubbleW - 12, st.x - bubbleW / 2));
    const by = st.y - 196;

    // Shadow
    ctx.fillStyle = 'rgba(20, 26, 32, 0.18)';
    roundRectPath(ctx, bx + 2, by + 4, bubbleW, bubbleH, 12);
    ctx.fill();

    // Card background
    ctx.fillStyle = isHovered && canReceive ? '#ECFDF5' : '#FFFDF9';
    roundRectPath(ctx, bx, by, bubbleW, bubbleH, 12);
    ctx.fill();

    ctx.strokeStyle =
      canReceive && isHovered
        ? '#10B981'
        : canReceive
        ? '#34D399'
        : '#D4C5B0';
    ctx.lineWidth = canReceive ? 2.5 : 1.6;
    ctx.stroke();

    // Tail pointer
    ctx.fillStyle = isHovered && canReceive ? '#ECFDF5' : '#FFFDF9';
    ctx.beginPath();
    ctx.moveTo(st.x - 7, by + bubbleH - 1);
    ctx.lineTo(st.x, by + bubbleH + 8);
    ctx.lineTo(st.x + 7, by + bubbleH - 1);
    ctx.closePath();
    ctx.fill();

    // Header label (Archetype + hotkey)
    ctx.fillStyle = '#5C4F43';
    ctx.font = '600 10px Manrope, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(st.archetype.label, bx + 10, by + 14);

    if (hotkey) {
      ctx.fillStyle = canReceive ? '#059669' : '#8B7D6E';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`[${hotkey}]`, bx + bubbleW - 9, by + 14);
    }

    // Order item icons
    const spacing = 40;
    const startX = bx + bubbleW / 2 - ((itemCount - 1) * spacing) / 2;
    const iconY = by + 36;
    st.order.forEach((entry, idx) => {
      const ix = startX + idx * spacing;
      ctx.save();
      if (entry.delivered) {
        ctx.globalAlpha = 0.35;
      }
      this.drawFoodIcon(ctx, entry.itemId, ix, iconY, 26);
      ctx.restore();

      if (entry.delivered) {
        // Crisp green checkmark
        ctx.fillStyle = '#16A34A';
        ctx.beginPath();
        ctx.arc(ix + 10, iconY + 8, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ix + 6.5, iconY + 8);
        ctx.lineTo(ix + 9.2, iconY + 10.7);
        ctx.lineTo(ix + 13.5, iconY + 5.5);
        ctx.stroke();
      }
    });

    // Patience gauge bar (non-hue-only: includes seconds readout when low)
    const barX = bx + 10;
    const barY = by + bubbleH - 11;
    const barW = bubbleW - 20;
    const ratio = Math.max(0, Math.min(1, st.patience / st.maxPatience));
    ctx.fillStyle = '#E7DDD0';
    roundRectPath(ctx, barX, barY, barW, 6, 3);
    ctx.fill();

    ctx.fillStyle = ratio > 0.5 ? '#2E8B57' : ratio > 0.25 ? '#D9822B' : '#DC2626';
    if (ratio > 0) {
      roundRectPath(ctx, barX, barY, Math.max(6, barW * ratio), 6, 3);
      ctx.fill();
    }
  }

  private drawSpeechTag(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string
  ) {
    ctx.font = '700 12px Rubik, sans-serif';
    const w = ctx.measureText(text).width + 20;
    ctx.fillStyle = '#FFFFFF';
    roundRectPath(ctx, x - w / 2, y - 14, w, 26, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 3);
  }

  private drawCounterDeck(ctx: CanvasRenderingContext2D) {
    const W = this.width;
    const H = this.height;
    const counterTop = H * 0.62;

    // Stainless steel top rail lip
    const railGrad = ctx.createLinearGradient(0, counterTop - 6, 0, counterTop + 14);
    railGrad.addColorStop(0, '#E3E7EC');
    railGrad.addColorStop(0.5, '#C5CCD4');
    railGrad.addColorStop(1, '#9BA4AE');
    ctx.fillStyle = railGrad;
    ctx.fillRect(0, counterTop - 5, W, 16);

    // Rich honey-wood counter apron (matching interior architecture)
    const bodyGrad = ctx.createLinearGradient(0, counterTop + 11, 0, H);
    bodyGrad.addColorStop(0, '#4E3726');
    bodyGrad.addColorStop(1, '#342419');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(0, counterTop + 11, W, H - counterTop - 11);

    // Subtle wood plank seams
    ctx.strokeStyle = 'rgba(255, 224, 185, 0.06)';
    ctx.lineWidth = 1;
    for (let y = counterTop + 34; y < H; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Draw 5 food stations
    for (const id of MENU_ORDER) {
      this.drawStationCard(ctx, id);
    }

    // Draw Active Serving Tray
    this.drawActiveTray(ctx);

    // Draw Dishwashing Sink
    this.drawDishSink(ctx);
  }

  private drawStationCard(ctx: CanvasRenderingContext2D, id: MenuItemId) {
    const r = this.stationRects[id];
    const cfg = MENU_ITEMS[id];
    const st = this.stations[id];
    const unlocked = cfg.unlockDay <= this.day;
    const isHovered = unlocked && hitTest(this.mouseX, this.mouseY, r);
    const bounceOffset = st.bounceTimer > 0 ? Math.sin(st.bounceTimer * Math.PI * 8) * 4 : 0;

    ctx.save();
    ctx.translate(0, -bounceOffset);

    // Panel surface
    ctx.fillStyle = !unlocked
      ? '#2B211A'
      : st.flashTimer > 0
      ? '#FFF3D1'
      : isHovered
      ? '#FAF4EA'
      : '#F2E9DB';
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();

    // Border highlights
    const lowStock = unlocked && st.readyCount === 0 && st.pantryStock === 0;
    ctx.strokeStyle = !unlocked
      ? '#5C4738'
      : lowStock
      ? '#DC2626'
      : isHovered
      ? '#D9822B'
      : '#C6B39A';
    ctx.lineWidth = isHovered || lowStock ? 2.5 : 1.5;
    ctx.stroke();

    // Hotkey badge top-left
    ctx.fillStyle = unlocked ? '#2B3744' : '#4E4036';
    roundRectPath(ctx, r.x + 8, r.y + 8, 22, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#FAF6F0';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.hotkey, r.x + 19, r.y + 23);

    if (!unlocked) {
      ctx.fillStyle = '#B8A692';
      ctx.font = '700 13px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cfg.shortName, r.x + r.w / 2, r.y + r.h * 0.48);
      ctx.font = '500 11px Manrope, sans-serif';
      ctx.fillStyle = '#8F7D6A';
      ctx.fillText(`Откроется: День ${cfg.unlockDay}`, r.x + r.w / 2, r.y + r.h * 0.63);
      ctx.restore();
      return;
    }

    // Early refill button top-right when partially depleted & pantry available
    if (st.readyCount < st.maxBatch && st.cookingTimer <= 0 && st.pantryStock > 0) {
      const rr = this.refillRects[id];
      const hoverRefill = hitTest(this.mouseX, this.mouseY, rr);
      ctx.fillStyle = hoverRefill ? '#D9822B' : '#E5D5BE';
      roundRectPath(ctx, rr.x, rr.y, rr.w, rr.h, 6);
      ctx.fill();
      ctx.fillStyle = hoverRefill ? '#FFFFFF' : '#5E4229';
      ctx.font = '700 14px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('↻', rr.x + rr.w / 2, rr.y + 18);
    }

    // Center food illustration
    const iconY = r.y + r.h * 0.4;
    ctx.save();
    if (st.readyCount === 0) ctx.globalAlpha = 0.42;
    this.drawFoodIcon(ctx, id, r.x + r.w / 2, iconY, Math.min(54, r.w * 0.44));
    ctx.restore();

    // Cooking progress overlay bar
    if (st.cookingTimer > 0) {
      const prog = 1 - st.cookingTimer / st.cookDuration;
      const bw = r.w - 22;
      const bx = r.x + 11;
      const by = r.y + r.h * 0.56;
      ctx.fillStyle = '#3B2D22';
      roundRectPath(ctx, bx, by, bw, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#E05A3A';
      roundRectPath(ctx, bx + 2, by + 2, Math.max(8, (bw - 4) * prog), 8, 4);
      ctx.fill();

      ctx.fillStyle = '#7C3E18';
      ctx.font = '700 10px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Готовится...', r.x + r.w / 2, by - 4);
    }

    // Station Name & Price
    ctx.fillStyle = '#251D17';
    ctx.font = '700 13px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.shortName, r.x + r.w / 2, r.y + r.h - 46);

    // Ready counter dots / numeric
    const readyText =
      st.readyCount > 0
        ? `На раздаче: ${st.readyCount}/${st.maxBatch}`
        : st.pantryStock > 0
        ? 'Нажмите: Готовить'
        : 'Нет на складе!';
    ctx.fillStyle =
      st.readyCount > 0 ? '#1E6B45' : st.pantryStock > 0 ? '#B45309' : '#DC2626';
    ctx.font = '700 11px Manrope, sans-serif';
    ctx.fillText(readyText, r.x + r.w / 2, r.y + r.h - 28);

    // Pantry stock line
    ctx.fillStyle = st.pantryStock <= 3 ? '#B91C1C' : '#6A5B4D';
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.fillText(`Склад: ${st.pantryStock} · ${cfg.sellPrice}с`, r.x + r.w / 2, r.y + r.h - 11);

    ctx.restore();
  }

  private drawActiveTray(ctx: CanvasRenderingContext2D) {
    const r = this.trayRect;
    const hasItems = this.trayItems.length > 0;
    const isHovered = hasItems && hitTest(this.mouseX, this.mouseY, r);

    // Outer tray bezel
    ctx.fillStyle = this.trayFlash > 0 ? '#FDE8E8' : isHovered ? '#FFFDF7' : '#F6EFE3';
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.strokeStyle = this.trayFlash > 0 ? '#DC2626' : hasItems ? '#2E8B57' : '#B5A188';
    ctx.lineWidth = hasItems ? 2.5 : 1.6;
    ctx.stroke();

    // Inner recessed tray mat
    ctx.fillStyle = '#E9DFCF';
    roundRectPath(ctx, r.x + 10, r.y + 38, r.w - 20, r.h - 74, 10);
    ctx.fill();

    // Header
    ctx.fillStyle = '#2B211A';
    ctx.font = '700 13px Rubik, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Поднос (${this.trayItems.length}/${this.trayCapacity})`, r.x + 12, r.y + 24);

    // Clear button
    if (hasItems) {
      const cr = this.clearTrayRect;
      const hoverClear = hitTest(this.mouseX, this.mouseY, cr);
      ctx.fillStyle = hoverClear ? '#DC2626' : '#E7D8C6';
      roundRectPath(ctx, cr.x, cr.y, cr.w, cr.h, 6);
      ctx.fill();
      ctx.fillStyle = hoverClear ? '#FFFFFF' : '#6B3427';
      ctx.font = '700 11px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Сброс [X]', cr.x + cr.w / 2, cr.y + 17);
    }

    // Tray item slots
    const slots = this.trayCapacity;
    const slotGap = 8;
    const innerW = r.w - 32;
    const slotSize = Math.min(48, (innerW - slotGap * (slots - 1)) / slots);
    const totalSlotsW = slots * slotSize + (slots - 1) * slotGap;
    const startX = r.x + (r.w - totalSlotsW) / 2;
    const cy = r.y + 38 + (r.h - 74) / 2;

    for (let i = 0; i < slots; i++) {
      const sx = startX + i * (slotSize + slotGap) + slotSize / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.beginPath();
      ctx.arc(sx, cy, slotSize * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160, 140, 118, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const item = this.trayItems[i];
      if (item) {
        this.drawFoodIcon(ctx, item, sx, cy, slotSize * 0.82);
      }
    }

    // Bottom hint
    ctx.fillStyle = hasItems ? '#1E6B45' : '#7A6B5C';
    ctx.font = '700 11px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      hasItems ? 'Клик по студенту или [Пробел]' : 'Выберите блюда слева (1–5)',
      r.x + r.w / 2,
      r.y + r.h - 14
    );
  }

  private drawDishSink(ctx: CanvasRenderingContext2D) {
    const r = this.sinkRect;
    const needsWash = this.dirtyPlates > 0;
    const urgent = this.cleanPlates <= 2 && needsWash;
    const isHovered = hitTest(this.mouseX, this.mouseY, r);

    ctx.fillStyle = urgent
      ? '#FEE2E2'
      : isHovered
      ? '#EAF4FC'
      : '#DDE7EE';
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.strokeStyle = urgent ? '#DC2626' : isHovered ? '#2563EB' : '#8FA7BA';
    ctx.lineWidth = urgent || isHovered ? 2.5 : 1.6;
    ctx.stroke();

    // Title & hotkey
    ctx.fillStyle = '#1E2D3A';
    ctx.font = '700 13px Rubik, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Мойка', r.x + 12, r.y + 24);

    ctx.fillStyle = '#2B3744';
    roundRectPath(ctx, r.x + r.w - 32, r.y + 8, 24, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('R', r.x + r.w - 20, r.y + 23);

    // Basin illustration
    const basinX = r.x + 12;
    const basinY = r.y + 40;
    const basinW = r.w - 24;
    const basinH = r.h - 90;
    ctx.fillStyle = '#B8CAD8';
    roundRectPath(ctx, basinX, basinY, basinW, basinH, 10);
    ctx.fill();

    // Water surface inside basin
    ctx.fillStyle = this.washingTimer > 0 ? '#7CC4FA' : '#96BDD9';
    roundRectPath(ctx, basinX + 5, basinY + 6, basinW - 10, basinH - 12, 7);
    ctx.fill();

    // Stack of clean white plates (left inside basin)
    const cleanVisual = Math.min(6, this.cleanPlates);
    for (let i = 0; i < cleanVisual; i++) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(basinX + basinW * 0.3, basinY + basinH - 16 - i * 4.5, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Stack of dirty plates (right inside basin)
    const dirtyVisual = Math.min(6, this.dirtyPlates);
    for (let i = 0; i < dirtyVisual; i++) {
      ctx.fillStyle = '#D9CFC0';
      ctx.beginPath();
      ctx.ellipse(basinX + basinW * 0.72, basinY + basinH - 16 - i * 4.5, 19, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8C765C';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Washing progress bar
    if (this.washingTimer > 0) {
      const prog = 1 - this.washingTimer / this.washDuration;
      ctx.fillStyle = '#1E3A5F';
      roundRectPath(ctx, basinX + 10, basinY + basinH / 2 - 6, basinW - 20, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#38BDF8';
      roundRectPath(
        ctx,
        basinX + 12,
        basinY + basinH / 2 - 4,
        Math.max(8, (basinW - 24) * prog),
        8,
        4
      );
      ctx.fill();
    }

    // Status lines
    ctx.fillStyle = this.cleanPlates <= 2 ? '#DC2626' : '#1E3A5F';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Чистых: ${this.cleanPlates}/${this.maxPlates}`, r.x + r.w / 2, r.y + r.h - 29);

    ctx.fillStyle = needsWash ? '#B45309' : '#475569';
    ctx.font = '700 11px Manrope, sans-serif';
    ctx.fillText(
      this.washingTimer > 0
        ? 'Моем посуду...'
        : needsWash
        ? `Грязных: ${this.dirtyPlates} · Мыть`
        : 'Раковина чистая',
      r.x + r.w / 2,
      r.y + r.h - 11
    );
  }

  private drawFoodIcon(
    ctx: CanvasRenderingContext2D,
    id: MenuItemId,
    cx: number,
    cy: number,
    size: number
  ) {
    const s = size / 44;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);

    if (id === 'tea') {
      // Paper cup of hot tea (just like the white paper cups on the table in Photo #1!)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(-12, -11);
      ctx.lineTo(12, -11);
      ctx.lineTo(9, 14);
      ctx.lineTo(-9, 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Tea sleeve band
      ctx.fillStyle = '#D97736';
      ctx.fillRect(-10.5, -2, 21, 7);
      // Hot amber tea surface
      ctx.fillStyle = '#9A3F16';
      ctx.beginPath();
      ctx.ellipse(0, -11, 11.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Steam curls
      ctx.strokeStyle = 'rgba(200, 120, 60, 0.65)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-4, -17);
      ctx.quadraticCurveTo(-7, -21, -3, -24);
      ctx.moveTo(4, -17);
      ctx.quadraticCurveTo(1, -21, 5, -24);
      ctx.stroke();
    } else if (id === 'bun') {
      // Golden round cafeteria bun (prominently visible on every plate in Photo #1!)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(0, 9, 19, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const grad = ctx.createRadialGradient(-5, -6, 2, 0, 0, 17);
      grad.addColorStop(0, '#F6C667');
      grad.addColorStop(0.65, '#DC9335');
      grad.addColorStop(1, '#A86219');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 1, 15, Math.PI * 0.92, Math.PI * 2.08);
      ctx.quadraticCurveTo(15, 11, 0, 11);
      ctx.quadraticCurveTo(-15, 11, -15, 1);
      ctx.closePath();
      ctx.fill();
      // Glossy crust highlight
      ctx.fillStyle = 'rgba(255, 248, 220, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-5, -6, 5, 2.5, -0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'egg') {
      // Boiled egg + fresh red tomato garnish (directly from Photo #1!)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(0, 9, 19, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Tomato slice behind
      ctx.fillStyle = '#E04638';
      ctx.beginPath();
      ctx.arc(9, 4, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Boiled egg oval
      ctx.fillStyle = '#FAF7F0';
      ctx.beginPath();
      ctx.ellipse(-4, 1, 10.5, 13, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#D6CFC2';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Golden yolk peek
      ctx.fillStyle = '#F5B82E';
      ctx.beginPath();
      ctx.arc(-4, 3, 5.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'samsa') {
      // Golden flaky triangular samsa with sesame seeds (seen on plates in Photo #1!)
      const grad = ctx.createLinearGradient(-15, -14, 15, 14);
      grad.addColorStop(0, '#F0B354');
      grad.addColorStop(0.6, '#C97B27');
      grad.addColorStop(1, '#945212');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(17, -2, 16, 12);
      ctx.quadraticCurveTo(0, 16, -16, 12);
      ctx.quadraticCurveTo(-17, -2, 0, -16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7C3F0D';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Sesame seeds
      ctx.fillStyle = '#FFF4D4';
      const seeds = [
        [-4, -3],
        [3, -4],
        [0, 3],
        [-6, 5],
        [6, 4],
      ];
      for (const [sx, sy] of seeds) {
        ctx.beginPath();
        ctx.ellipse(sx, sy, 1.8, 1, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === 'plov') {
      // Steaming plate of golden rice plov with carrots & tender meat
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(0, 7, 20, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Mound of spiced rice
      ctx.fillStyle = '#EAB862';
      ctx.beginPath();
      ctx.arc(0, 4, 15, Math.PI, Math.PI * 2);
      ctx.quadraticCurveTo(15, 11, 0, 11);
      ctx.quadraticCurveTo(-15, 11, -15, 4);
      ctx.closePath();
      ctx.fill();

      // Carrot strips
      ctx.strokeStyle = '#E86A1F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-7, 2);
      ctx.lineTo(-2, -3);
      ctx.moveTo(2, 4);
      ctx.lineTo(8, 0);
      ctx.moveTo(-3, 6);
      ctx.lineTo(3, 5);
      ctx.stroke();

      // Meat chunks
      ctx.fillStyle = '#6E351A';
      ctx.beginPath();
      ctx.arc(-4, -4, 3.2, 0, Math.PI * 2);
      ctx.arc(4, -2, 3.4, 0, Math.PI * 2);
      ctx.arc(0, 2, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.kind === 'bubble') {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    for (const ft of this.floatingTexts) {
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${Math.round(15 * ft.scale)}px Rubik, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20, 22, 26, 0.8)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}
