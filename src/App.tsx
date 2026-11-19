import { useCallback, useEffect, useRef, useState } from 'react';
import { DaySummaryModal } from './components/DaySummaryModal';
import { GameHud } from './components/GameHud';
import { EndGameModal, PauseModal } from './components/OverlayModals';
import { TitleScreen } from './components/TitleScreen';
import { soundEngine } from './game/audio';
import {
  BASE_PANTRY_CAP,
  CAMPAIGN_DAYS,
  createInitialPantry,
  createInitialUpgrades,
} from './game/config';
import { CanteenGameEngine } from './game/engine';
import { DayStats, GameMode, GamePhase, HudSnapshot, MenuItemId, UpgradeId } from './game/types';

const STORAGE_KEY = 'campus_canteen_records_v1';

function loadRecords(): { bestMoney: number; bestDays: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestMoney: 0, bestDays: 0 };
    const parsed = JSON.parse(raw);
    return {
      bestMoney: Number(parsed.bestMoney) || 0,
      bestDays: Number(parsed.bestDays) || 0,
    };
  } catch {
    return { bestMoney: 0, bestDays: 0 };
  }
}

function saveRecords(bestMoney: number, bestDays: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestMoney, bestDays }));
  } catch {
    // ignore storage failures
  }
}

const INITIAL_HUD: HudSnapshot = {
  day: 1,
  mode: 'campaign',
  money: 450,
  rating: 4.2,
  timeProgress: 0,
  clockLabel: '08:00',
  isRushHour: false,
  rushLabel: '',
  combo: 0,
  servedToday: 0,
  missedToday: 0,
  cleanPlates: 8,
  maxPlates: 8,
  dirtyPlates: 0,
  washingProgress: 0,
  trayItems: [],
  trayCapacity: 3,
  stations: {
    tea: { unlocked: true, ready: 6, maxBatch: 6, pantry: 10, cookingProgress: 0 },
    bun: { unlocked: true, ready: 5, maxBatch: 5, pantry: 9, cookingProgress: 0 },
    egg: { unlocked: true, ready: 5, maxBatch: 5, pantry: 7, cookingProgress: 0 },
    samsa: { unlocked: true, ready: 4, maxBatch: 4, pantry: 8, cookingProgress: 0 },
    plov: { unlocked: false, ready: 0, maxBatch: 4, pantry: 0, cookingProgress: 0 },
  },
  pantryCap: BASE_PANTRY_CAP,
  alertBanner: null,
  outOfStockItem: null,
};

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [mode, setMode] = useState<GameMode>('campaign');
  const [muted, setMuted] = useState(false);

  // Persistent campaign state across days
  const [day, setDay] = useState(1);
  const [money, setMoney] = useState(450);
  const [rating, setRating] = useState(4.2);
  const [pantry, setPantry] = useState<Record<MenuItemId, number>>(createInitialPantry);
  const [upgrades, setUpgrades] = useState<Record<UpgradeId, number>>(createInitialUpgrades);
  const [totalServed, setTotalServed] = useState(0);
  const [lastDayStats, setLastDayStats] = useState<DayStats | null>(null);
  const [gameOverReason, setGameOverReason] = useState<string>('');
  const [records, setRecords] = useState(loadRecords);

  // Snapshot for restarting the current day cleanly
  const dayStartSnapshotRef = useRef<{
    day: number;
    money: number;
    rating: number;
    pantry: Record<MenuItemId, number>;
    upgrades: Record<UpgradeId, number>;
  } | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanteenGameEngine | null>(null);
  const phaseRef = useRef<GamePhase>(phase);
  const modeRef = useRef<GameMode>(mode);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const updateRecords = useCallback((finalMoney: number, completedDays: number) => {
    setRecords((prev) => {
      const next = {
        bestMoney: Math.max(prev.bestMoney, finalMoney),
        bestDays: Math.max(prev.bestDays, completedDays),
      };
      saveRecords(next.bestMoney, next.bestDays);
      return next;
    });
  }, []);

  // Initialize isolated 60fps Canvas engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new CanteenGameEngine(canvas, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onDayComplete: (stats, nextPantry, endMoney, endRating) => {
        setLastDayStats(stats);
        setMoney(endMoney);
        setRating(endRating);
        setTotalServed((prev) => prev + stats.servedCount);
        updateRecords(endMoney, stats.day);

        // Give a starter welcome supply of Plov when Day 2 unlocks!
        const preparedPantry = { ...nextPantry };
        if (stats.day === 1 && preparedPantry.plov === 0) {
          preparedPantry.plov = 8;
        }
        setPantry(preparedPantry);

        if (modeRef.current === 'campaign' && stats.day >= CAMPAIGN_DAYS) {
          setPhase('VICTORY');
        } else {
          setPhase('DAY_SUMMARY');
        }
      },
      onGameOver: (reason, stats) => {
        setGameOverReason(reason);
        setLastDayStats(stats);
        setTotalServed((prev) => prev + stats.servedCount);
        setPhase('GAME_OVER');
      },
    });

    engineRef.current = engine;

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      engine.stop();
      engineRef.current = null;
    };
  }, [updateRecords]);

  const launchShift = useCallback(
    (params: {
      dayNum: number;
      gameMode: GameMode;
      startMoney: number;
      startRating: number;
      startPantry: Record<MenuItemId, number>;
      startUpgrades: Record<UpgradeId, number>;
    }) => {
      dayStartSnapshotRef.current = {
        day: params.dayNum,
        money: params.startMoney,
        rating: params.startRating,
        pantry: { ...params.startPantry },
        upgrades: { ...params.startUpgrades },
      };

      setDay(params.dayNum);
      setMoney(params.startMoney);
      setRating(params.startRating);
      setPantry({ ...params.startPantry });
      setUpgrades({ ...params.startUpgrades });
      setPhase('PLAYING');

      // Resize & start on next frame so canvas dimensions are fresh
      requestAnimationFrame(() => {
        engineRef.current?.resize();
        engineRef.current?.startDay({
          day: params.dayNum,
          mode: params.gameMode,
          money: params.startMoney,
          rating: params.startRating,
          pantry: params.startPantry,
          upgrades: params.startUpgrades,
        });
      });
    },
    []
  );

  const handleStartNewGame = useCallback(() => {
    setTotalServed(0);
    setLastDayStats(null);
    setGameOverReason('');
    launchShift({
      dayNum: 1,
      gameMode: mode,
      startMoney: 450,
      startRating: 4.2,
      startPantry: createInitialPantry(),
      startUpgrades: createInitialUpgrades(),
    });
  }, [launchShift, mode]);

  const handleStartNextDay = useCallback(() => {
    const nextDay = day + 1;
    launchShift({
      dayNum: nextDay,
      gameMode: mode,
      startMoney: money,
      startRating: rating,
      startPantry: pantry,
      startUpgrades: upgrades,
    });
  }, [day, launchShift, mode, money, pantry, rating, upgrades]);

  const handleContinueEndless = useCallback(() => {
    setMode('endless');
    modeRef.current = 'endless';
    setPhase('DAY_SUMMARY');
  }, []);

  const handleRestartShift = useCallback(() => {
    const snap = dayStartSnapshotRef.current;
    if (!snap) {
      handleStartNewGame();
      return;
    }
    launchShift({
      dayNum: snap.day,
      gameMode: mode,
      startMoney: snap.money,
      startRating: snap.rating,
      startPantry: snap.pantry,
      startUpgrades: snap.upgrades,
    });
  }, [handleStartNewGame, launchShift, mode]);

  const handleTogglePause = useCallback(() => {
    if (phaseRef.current === 'PLAYING') {
      engineRef.current?.setPaused(true);
      setPhase('PAUSED');
    } else if (phaseRef.current === 'PAUSED') {
      engineRef.current?.setPaused(false);
      setPhase('PLAYING');
    }
  }, []);

  const handleExitToMenu = useCallback(() => {
    engineRef.current?.stop();
    setPhase('TITLE_MENU');
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  // Keyboard controls + blur safety
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'PLAYING' && phaseRef.current !== 'PAUSED') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      if (phaseRef.current !== 'PLAYING') return;
      const engine = engineRef.current;
      if (!engine) return;

      const code = e.code;
      const forceCook = e.shiftKey;

      if (code === 'Digit1') {
        e.preventDefault();
        engine.interactStation('tea', forceCook);
      } else if (code === 'Digit2') {
        e.preventDefault();
        engine.interactStation('bun', forceCook);
      } else if (code === 'Digit3') {
        e.preventDefault();
        engine.interactStation('egg', forceCook);
      } else if (code === 'Digit4') {
        e.preventDefault();
        engine.interactStation('samsa', forceCook);
      } else if (code === 'Digit5') {
        e.preventDefault();
        engine.interactStation('plov', forceCook);
      } else if (code === 'KeyA') {
        e.preventDefault();
        engine.serveStudentAtSlot(0);
      } else if (code === 'KeyS') {
        e.preventDefault();
        engine.serveStudentAtSlot(1);
      } else if (code === 'KeyD') {
        e.preventDefault();
        engine.serveStudentAtSlot(2);
      } else if (code === 'KeyF') {
        e.preventDefault();
        engine.serveStudentAtSlot(3);
      } else if (code === 'Space') {
        e.preventDefault();
        engine.autoServeTray();
      } else if (code === 'KeyR') {
        e.preventDefault();
        engine.triggerWash();
      } else if (code === 'KeyX' || code === 'Backspace') {
        e.preventDefault();
        engine.clearTray();
      }
    };

    const onBlur = () => {
      if (phaseRef.current === 'PLAYING') {
        engineRef.current?.setPaused(true);
        setPhase('PAUSED');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleTogglePause]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1C252E]">
      {/* Isolated Canvas Container — mounted stably so React HUD updates never tear down canvas */}
      <div
        className={`absolute inset-0 ${
          phase === 'TITLE_MENU' ? 'invisible pointer-events-none' : 'visible'
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => engineRef.current?.handlePointerMove(e.clientX, e.clientY)}
          onMouseLeave={() => engineRef.current?.handlePointerLeave()}
          onClick={(e) => engineRef.current?.handleClick(e.clientX, e.clientY, false)}
          onContextMenu={(e) => {
            e.preventDefault();
            engineRef.current?.handleClick(e.clientX, e.clientY, true);
          }}
          className="block w-full h-full cursor-pointer touch-manipulation"
        />
      </div>

      {/* Title Screen */}
      {phase === 'TITLE_MENU' && (
        <TitleScreen
          mode={mode}
          onModeChange={setMode}
          onStart={handleStartNewGame}
          bestMoney={records.bestMoney}
          bestDays={records.bestDays}
        />
      )}

      {/* Active Play HUD */}
      {(phase === 'PLAYING' || phase === 'PAUSED') && (
        <GameHud
          hud={hud}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handleTogglePause}
          onBuyEmergency={(itemId) => engineRef.current?.buyEmergencyStock(itemId, 6)}
          onDismissEmergency={() => engineRef.current?.dismissOutOfStock()}
        />
      )}

      {/* Pause Overlay */}
      {phase === 'PAUSED' && (
        <PauseModal
          day={day}
          onResume={handleTogglePause}
          onRestartShift={handleRestartShift}
          onExitToMenu={handleExitToMenu}
        />
      )}

      {/* Between-Days Resource Procurement & Upgrades */}
      {phase === 'DAY_SUMMARY' && lastDayStats && (
        <DaySummaryModal
          stats={lastDayStats}
          money={money}
          rating={rating}
          pantry={pantry}
          upgrades={upgrades}
          nextDay={day + 1}
          onUpdatePantry={(nextPantry, nextMoney) => {
            setPantry(nextPantry);
            setMoney(nextMoney);
          }}
          onBuyUpgrade={(upgradeId, cost) => {
            if (money < cost) return;
            setMoney((m) => m - cost);
            setUpgrades((prev) => ({
              ...prev,
              [upgradeId]: (prev[upgradeId] ?? 0) + 1,
            }));
          }}
          onStartNextDay={handleStartNextDay}
        />
      )}

      {/* Victory & Game Over Modals */}
      {(phase === 'VICTORY' || phase === 'GAME_OVER') && (
        <EndGameModal
          variant={phase === 'VICTORY' ? 'victory' : 'game_over'}
          reason={gameOverReason}
          stats={lastDayStats}
          totalServed={totalServed}
          money={money}
          rating={rating}
          onContinueEndless={phase === 'VICTORY' ? handleContinueEndless : undefined}
          onPlayAgain={handleStartNewGame}
          onExitToMenu={handleExitToMenu}
        />
      )}
    </main>
  );
}
