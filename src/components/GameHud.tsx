import React from 'react';
import { Pause, Volume2, VolumeX, Truck, X } from 'lucide-react';
import { CAMPAIGN_DAYS, getEmergencyPrice, MENU_ITEMS } from '../game/config';
import { HudSnapshot, MenuItemId } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onBuyEmergency: (itemId: MenuItemId) => void;
  onDismissEmergency: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  muted,
  onToggleMute,
  onPause,
  onBuyEmergency,
  onDismissEmergency,
}) => {
  const emergencyItem = hud.outOfStockItem ? MENU_ITEMS[hud.outOfStockItem] : null;
  const emergencyCost = hud.outOfStockItem ? getEmergencyPrice(hud.outOfStockItem) * 6 : 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between">
      {/* Compact Perimeter Top Bar (occupies < 8% height, solid world-matched palette, no backdrop-filter) */}
      <div className="w-full bg-[#1E2933] border-b border-[#3A4B5C] px-4 md:px-6 h-13 flex items-center justify-between gap-4 text-[#FAF6F0]">
        {/* Left cluster: Day, Clock & Progress */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <span className="font-display font-bold text-sm md:text-base text-[#F5C469]">
              День {hud.day}
              {hud.mode === 'campaign' ? `/${CAMPAIGN_DAYS}` : ''}
            </span>
            <span className="text-[#7D91A5]" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-num text-sm md:text-base font-bold text-white">
              {hud.clockLabel}
            </span>
          </div>

          {/* Shift timeline bar */}
          <div className="hidden sm:flex items-center gap-2.5 w-32 md:w-44">
            <div className="w-full h-2 bg-[#334454] rounded-full overflow-hidden">
              <div
                className="h-full transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${Math.max(0.02, hud.timeProgress)})`,
                  backgroundColor: hud.isRushHour ? '#E05A3A' : '#6FA2CF',
                }}
              />
            </div>
          </div>

          {hud.isRushHour && (
            <span className="hidden lg:inline text-xs font-bold text-[#F59E0B] whitespace-nowrap shrink-0">
              {hud.rushLabel}
            </span>
          )}
        </div>

        {/* Center cluster: Budget, Rating, Combo, Served */}
        <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm whitespace-nowrap shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[#A8B8C8]">Касса</span>
            <span className="font-mono-num font-bold text-sm md:text-base text-[#4ADE80]">
              {hud.money} сом
            </span>
          </div>

          <span className="text-[#4B5D6F]" aria-hidden="true">
            ·
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-[#A8B8C8]">Рейтинг</span>
            <span
              className={`font-mono-num font-bold text-sm md:text-base ${
                hud.rating >= 3.5
                  ? 'text-[#F5C469]'
                  : hud.rating >= 2.0
                  ? 'text-[#FB923C]'
                  : 'text-[#F87171]'
              }`}
            >
              {hud.rating.toFixed(1)} ★
            </span>
          </div>

          <span className="hidden md:inline text-[#4B5D6F]" aria-hidden="true">
            ·
          </span>

          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-[#A8B8C8]">Обслужено</span>
            <span className="font-mono-num font-bold text-white">{hud.servedToday}</span>
          </div>

          {hud.combo >= 2 && (
            <>
              <span className="text-[#4B5D6F]" aria-hidden="true">
                ·
              </span>
              <span className="font-display font-bold text-[#F59E0B] font-mono-num">
                Комбо ×{hud.combo}
              </span>
            </>
          )}
        </div>

        {/* Right cluster: Interactive Mute & Pause buttons */}
        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="w-9 h-9 rounded-lg bg-[#2B3A47] hover:bg-[#384B5B] text-[#E2E8F0] flex items-center justify-center transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onPause}
            aria-label="Пауза"
            className="px-3 h-9 rounded-lg bg-[#2B3A47] hover:bg-[#384B5B] text-[#FAF6F0] flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Пауза</span>
          </button>
        </div>
      </div>

      {/* Transient Non-Blocking Event Toast */}
      <div className="flex flex-col items-center gap-2 mt-2 px-4">
        {hud.alertBanner && (
          <div className="bg-[#1E2933] border border-[#E05A3A]/70 text-[#FAF6F0] px-4 py-2 rounded-lg text-xs md:text-sm font-semibold shadow-lg">
            {hud.alertBanner}
          </div>
        )}

        {/* Emergency Restock Action Prompt when a station's pantry hits 0 */}
        {emergencyItem && (
          <div className="pointer-events-auto bg-[#2B211A] border-2 border-[#D9822B] text-[#FAF6F0] px-4 py-2.5 rounded-xl shadow-xl flex flex-wrap items-center gap-3 text-xs md:text-sm">
            <Truck className="w-4 h-4 text-[#F5C469] shrink-0" />
            <span>
              Склад пуст: <strong>{emergencyItem.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => onBuyEmergency(emergencyItem.id)}
              disabled={hud.money < emergencyCost}
              className="px-3 py-1.5 rounded-lg bg-[#E05A3A] hover:bg-[#EE6848] disabled:opacity-45 disabled:cursor-not-allowed text-white font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono-num"
            >
              Срочно +6 шт. ({emergencyCost} сом)
            </button>
            <button
              type="button"
              onClick={onDismissEmergency}
              aria-label="Закрыть"
              className="p-1 text-[#C4B5A5] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div />
    </div>
  );
};
