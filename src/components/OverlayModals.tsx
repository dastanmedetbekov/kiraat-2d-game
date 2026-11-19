import React from 'react';
import { DayStats } from '../game/types';

interface PauseModalProps {
  day: number;
  onResume: () => void;
  onRestartShift: () => void;
  onExitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  day,
  onResume,
  onRestartShift,
  onExitToMenu,
}) => {
  return (
    <div className="fixed inset-0 z-40 bg-[#121A22]/85 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1E2933] border border-[#3B4C5D] rounded-2xl p-6 text-[#FAF6F0] shadow-2xl space-y-5">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Пауза · День {day}</h2>
          <p className="text-sm text-[#B8C7D6] mt-1">Смена временно остановлена.</p>
        </div>

        <div className="bg-[#25323E] border border-[#364758] rounded-xl p-4 space-y-2 text-xs text-[#CBD5E1]">
          <div className="font-semibold text-[#F5C469] mb-1">Управление на смене</div>
          <div className="flex justify-between">
            <span>Взять блюдо / готовить</span>
            <span className="font-mono-num text-white">1–5 или клик</span>
          </div>
          <div className="flex justify-between">
            <span>Отдать заказ студенту</span>
            <span className="font-mono-num text-white">A / S / D / F или Пробел</span>
          </div>
          <div className="flex justify-between">
            <span>Помыть тарелки</span>
            <span className="font-mono-num text-white">R или клик по мойке</span>
          </div>
          <div className="flex justify-between">
            <span>Очистить поднос</span>
            <span className="font-mono-num text-white">X или ПКМ</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 rounded-xl bg-[#E05A3A] hover:bg-[#EE6848] text-white font-display font-bold text-base transition-colors cursor-pointer"
          >
            Продолжить смену
          </button>
          <button
            type="button"
            onClick={onRestartShift}
            className="w-full py-2.5 rounded-xl bg-[#2D3C4B] hover:bg-[#3A4D60] text-[#FAF6F0] text-sm font-semibold transition-colors cursor-pointer"
          >
            Начать день заново
          </button>
          <button
            type="button"
            onClick={onExitToMenu}
            className="w-full py-2.5 rounded-xl bg-transparent hover:bg-white/5 border border-white/15 text-[#CBD5E1] text-sm font-semibold transition-colors cursor-pointer"
          >
            В главное меню
          </button>
        </div>
      </div>
    </div>
  );
};

interface EndGameModalProps {
  variant: 'victory' | 'game_over';
  reason?: string;
  stats: DayStats | null;
  totalServed: number;
  money: number;
  rating: number;
  onContinueEndless?: () => void;
  onPlayAgain: () => void;
  onExitToMenu: () => void;
}

export const EndGameModal: React.FC<EndGameModalProps> = ({
  variant,
  reason,
  stats,
  totalServed,
  money,
  rating,
  onContinueEndless,
  onPlayAgain,
  onExitToMenu,
}) => {
  const isVictory = variant === 'victory';

  return (
    <div className="fixed inset-0 z-40 bg-[#121A22]/88 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#1E2933] border border-[#3B4C5D] rounded-2xl overflow-hidden text-[#FAF6F0] shadow-2xl">
        <div className="relative h-36 overflow-hidden">
          <img
            src={
              isVictory
                ? '/assets/aistudio/image_dfcaff8e.png'
                : '/assets/aistudio/image_9835346c.png'
            }
            alt="Столовая кампуса"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1E2933] via-[#1E2933]/55 to-transparent" />
          <div className="absolute bottom-3 left-6 right-6">
            <h2 className="font-display font-bold text-2xl md:text-3xl text-white">
              {isVictory ? 'Зачётная неделя пройдена!' : 'Смена закрыта'}
            </h2>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-[#D6E0EA] leading-relaxed">
            {isVictory
              ? 'Столовая кампуса выдержала все 5 дней аншлага! Студенты сыты, касса полна, а преподаватели рекомендуют ваш плов всему университету.'
              : reason || 'Очередь оказалась слишком длинной. Попробуйте лучше распределять запасы и вовремя мыть посуду.'}
          </p>

          <div className="grid grid-cols-3 gap-3 bg-[#25323E] border border-[#364758] rounded-xl p-4 text-center">
            <div>
              <div className="text-xs text-[#9FB1C2]">Всего обслужено</div>
              <div className="font-mono-num font-bold text-xl text-white mt-1">{totalServed}</div>
            </div>
            <div>
              <div className="text-xs text-[#9FB1C2]">Итоговая касса</div>
              <div className="font-mono-num font-bold text-xl text-[#4ADE80] mt-1">
                {money} сом
              </div>
            </div>
            <div>
              <div className="text-xs text-[#9FB1C2]">Рейтинг</div>
              <div className="font-mono-num font-bold text-xl text-[#F5C469] mt-1">
                {rating.toFixed(1)} ★
              </div>
            </div>
          </div>

          {stats && (
            <div className="text-xs text-[#9FB1C2] flex items-center justify-center gap-3 font-mono-num">
              <span>Последний день: {stats.day}</span>
              <span aria-hidden="true">·</span>
              <span>Макс. комбо: ×{stats.maxCombo}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {isVictory && onContinueEndless && (
              <button
                type="button"
                onClick={onContinueEndless}
                className="flex-1 py-3 px-4 rounded-xl bg-[#2E8B57] hover:bg-[#359E63] text-white font-display font-bold text-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                Продолжить семестр
              </button>
            )}
            <button
              type="button"
              onClick={onPlayAgain}
              className="flex-1 py-3 px-4 rounded-xl bg-[#E05A3A] hover:bg-[#EE6848] text-white font-display font-bold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              Играть снова
            </button>
            <button
              type="button"
              onClick={onExitToMenu}
              className="py-3 px-4 rounded-xl bg-[#2B3A47] hover:bg-[#374A5B] text-[#E2E8F0] font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              Меню
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
