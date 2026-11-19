import React, { useState } from 'react';
import {
  BASE_PANTRY_CAP,
  getForecastForDay,
  getWholesalePrice,
  MENU_ITEMS,
  MENU_ORDER,
  UPGRADES,
} from '../game/config';
import { soundEngine } from '../game/audio';
import { DayStats, MenuItemId, UpgradeId } from '../game/types';

interface DaySummaryModalProps {
  stats: DayStats;
  money: number;
  rating: number;
  pantry: Record<MenuItemId, number>;
  upgrades: Record<UpgradeId, number>;
  nextDay: number;
  onUpdatePantry: (next: Record<MenuItemId, number>, nextMoney: number) => void;
  onBuyUpgrade: (upgradeId: UpgradeId, cost: number) => void;
  onStartNextDay: () => void;
}

export const DaySummaryModal: React.FC<DaySummaryModalProps> = ({
  stats,
  money,
  rating,
  pantry,
  upgrades,
  nextDay,
  onUpdatePantry,
  onBuyUpgrade,
  onStartNextDay,
}) => {
  const [activeTab, setActiveTab] = useState<'pantry' | 'upgrades'>('pantry');
  const [photoError, setPhotoError] = useState(false);

  const forecast = getForecastForDay(nextDay);
  const netProfit = stats.revenue + stats.tips - stats.emergencySpent - stats.wasteCost;
  const pantryCap = BASE_PANTRY_CAP + (upgrades.convection_oven + upgrades.tea_urn) * 5;

  const buyStock = (id: MenuItemId, delta: number) => {
    const unitPrice = getWholesalePrice(id, forecast);
    const current = pantry[id] ?? 0;
    const clamped = Math.max(0, Math.min(pantryCap, current + delta));
    const actualDelta = clamped - current;
    if (actualDelta <= 0) return;

    const totalCost = actualDelta * unitPrice;
    if (money < totalCost) {
      soundEngine.playError();
      return;
    }
    soundEngine.playPurchase();
    onUpdatePantry({ ...pantry, [id]: clamped }, money - totalCost);
  };

  const autoRestockRecommended = () => {
    const updated = { ...pantry };
    let remainingMoney = money;
    let purchasedAny = false;

    for (const id of MENU_ORDER) {
      if (MENU_ITEMS[id].unlockDay > nextDay) continue;
      const mult = forecast.demandMultipliers[id] ?? 1;
      const target = Math.min(pantryCap, Math.round(14 * mult));
      const needed = Math.max(0, target - (updated[id] ?? 0));
      if (needed === 0) continue;
      const unitPrice = getWholesalePrice(id, forecast);
      const affordable = Math.min(needed, Math.floor(remainingMoney / unitPrice));
      if (affordable > 0) {
        updated[id] = (updated[id] ?? 0) + affordable;
        remainingMoney -= affordable * unitPrice;
        purchasedAny = true;
      }
    }

    if (purchasedAny) {
      soundEngine.playPurchase();
      onUpdatePantry(updated, remainingMoney);
    } else {
      soundEngine.playError();
    }
  };

  const totalUnlockedStock = MENU_ORDER.filter(
    (id) => MENU_ITEMS[id].unlockDay <= nextDay
  ).reduce((acc, id) => acc + (pantry[id] ?? 0), 0);

  return (
    <div className="fixed inset-0 z-40 bg-[#141D25]/92 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#1E2933] border border-[#3B4C5D] rounded-2xl shadow-2xl overflow-hidden text-[#FAF6F0] flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="px-6 py-5 bg-[#253340] border-b border-[#384959] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {!photoError && (
              <img
                src="/assets/aistudio/image_9835346c.png"
                alt="Зал столовой"
                referrerPolicy="no-referrer"
                onError={() => setPhotoError(true)}
                className="hidden sm:block w-16 h-12 rounded-lg object-cover border border-white/15"
              />
            )}
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl text-white">
                Итоги смены · День {stats.day}
              </h2>
              <div className="text-xs md:text-sm text-[#B8C7D6] flex flex-wrap items-center gap-2 mt-0.5">
                <span>Обслужено: {stats.servedCount}</span>
                <span aria-hidden="true">·</span>
                <span>Ушли голодными: {stats.missedCount}</span>
                <span aria-hidden="true">·</span>
                <span>Макс. комбо: ×{stats.maxCombo}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-[#9FB1C2]">Рейтинг столовой</div>
              <div className="font-mono-num font-bold text-lg text-[#F5C469]">
                {rating.toFixed(1)} ★{' '}
                <span
                  className={`text-xs ${
                    stats.ratingDelta >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
                  }`}
                >
                  ({stats.ratingDelta >= 0 ? '+' : ''}
                  {stats.ratingDelta.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#9FB1C2]">Свободная касса</div>
              <div className="font-mono-num font-bold text-xl text-[#4ADE80]">{money} сом</div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Financial Breakdown Row + Tomorrow's Forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 bg-[#25323E] border border-[#364758] rounded-xl p-4 space-y-2.5 text-sm">
              <div className="font-display font-bold text-base text-[#FAF6F0] pb-1 border-b border-white/10">
                Финансовый отчёт смены
              </div>
              <div className="flex justify-between">
                <span className="text-[#B8C7D6]">Выручка с раздачи</span>
                <span className="font-mono-num font-semibold text-white">+{stats.revenue} сом</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#B8C7D6]">Чаевые студентов</span>
                <span className="font-mono-num font-semibold text-[#4ADE80]">+{stats.tips} сом</span>
              </div>
              {stats.emergencySpent > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#B8C7D6]">Срочные доставки</span>
                  <span className="font-mono-num font-semibold text-[#FB923C]">
                    −{stats.emergencySpent} сом
                  </span>
                </div>
              )}
              {stats.wasteCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#B8C7D6]">Списания с подноса</span>
                  <span className="font-mono-num font-semibold text-[#F87171]">
                    −{stats.wasteCost} сом
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-base">
                <span>Чистая прибыль</span>
                <span
                  className={`font-mono-num ${
                    netProfit >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
                  }`}
                >
                  {netProfit >= 0 ? '+' : ''}
                  {netProfit} сом
                </span>
              </div>
            </div>

            {/* Tomorrow's Campus Forecast */}
            <div className="lg:col-span-7 bg-[#25323E] border border-[#364758] rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-white/10">
                  <span className="font-display font-bold text-base text-[#F5C469]">
                    Прогноз на завтра: {forecast.title}
                  </span>
                  <span className="text-xs text-[#A8B8C8]">{forecast.weatherLabel}</span>
                </div>
                <p className="text-sm text-[#E2E8F0] mt-2.5 leading-relaxed">{forecast.headline}</p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#CBD5E1]">
                <span className="text-[#9FB1C2] font-semibold">Ожидаемый спрос:</span>
                {MENU_ORDER.filter((id) => MENU_ITEMS[id].unlockDay <= nextDay).map((id) => {
                  const mult = forecast.demandMultipliers[id] ?? 1;
                  return (
                    <span key={id} className="font-mono-num">
                      {MENU_ITEMS[id].shortName}{' '}
                      <strong
                        className={
                          mult >= 1.3
                            ? 'text-[#F59E0B]'
                            : mult <= 0.9
                            ? 'text-[#94A3B8]'
                            : 'text-[#E2E8F0]'
                        }
                      >
                        ×{mult.toFixed(1)}
                      </strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Interactive Tabs: Pantry vs Upgrades */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="inline-flex items-center gap-1 p-1 bg-[#162028] rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveTab('pantry')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'pantry'
                      ? 'bg-[#FAF6F0] text-[#1C2630]'
                      : 'text-[#CBD5E1] hover:text-white'
                  }`}
                >
                  Закупка склада (макс. {pantryCap} шт.)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('upgrades')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'upgrades'
                      ? 'bg-[#FAF6F0] text-[#1C2630]'
                      : 'text-[#CBD5E1] hover:text-white'
                  }`}
                >
                  Улучшения столовой
                </button>
              </div>

              {activeTab === 'pantry' && (
                <button
                  type="button"
                  onClick={autoRestockRecommended}
                  className="px-4 py-2 rounded-lg bg-[#2E8B57] hover:bg-[#359E63] text-white text-xs md:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Закупить по прогнозу
                </button>
              )}
            </div>

            {activeTab === 'pantry' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {MENU_ORDER.map((id) => {
                  const cfg = MENU_ITEMS[id];
                  const unlocked = cfg.unlockDay <= nextDay;
                  const unitPrice = getWholesalePrice(id, forecast);
                  const priceMult = forecast.priceMultipliers[id] ?? 1;
                  const currentQty = pantry[id] ?? 0;
                  const demandMult = forecast.demandMultipliers[id] ?? 1;
                  const recommended = Math.min(pantryCap, Math.round(14 * demandMult));

                  return (
                    <div
                      key={id}
                      className={`p-4 rounded-xl border transition-colors ${
                        unlocked
                          ? 'bg-[#25323E] border-[#394A5B]'
                          : 'bg-[#1A242D] border-[#2C3A47] opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-display font-bold text-base text-white">
                            {cfg.name}
                          </div>
                          <div className="text-xs text-[#A8B8C8] font-mono-num">
                            Опт: {unitPrice} сом · Продажа: {cfg.sellPrice} сом
                            {priceMult < 0.96 && (
                              <span className="text-[#4ADE80]"> · Скидка</span>
                            )}
                            {priceMult > 1.06 && (
                              <span className="text-[#FB923C]"> · Дороже</span>
                            )}
                          </div>
                        </div>
                        {unlocked && (
                          <div className="text-right font-mono-num">
                            <div
                              className={`text-lg font-bold ${
                                currentQty < 6 ? 'text-[#F87171]' : 'text-[#FAF6F0]'
                              }`}
                            >
                              {currentQty}/{pantryCap}
                            </div>
                            <div className="text-[11px] text-[#9FB1C2]">
                              Совет: ~{recommended}
                            </div>
                          </div>
                        )}
                      </div>

                      {unlocked ? (
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => buyStock(id, 1)}
                            disabled={money < unitPrice || currentQty >= pantryCap}
                            className="flex-1 py-2 rounded-lg bg-[#324353] hover:bg-[#3F5366] disabled:opacity-40 text-xs font-semibold font-mono-num transition-colors cursor-pointer whitespace-nowrap"
                          >
                            +1 ({unitPrice}с)
                          </button>
                          <button
                            type="button"
                            onClick={() => buyStock(id, 5)}
                            disabled={money < unitPrice * 5 || currentQty >= pantryCap}
                            className="flex-1 py-2 rounded-lg bg-[#324353] hover:bg-[#3F5366] disabled:opacity-40 text-xs font-semibold font-mono-num transition-colors cursor-pointer whitespace-nowrap"
                          >
                            +5 ({unitPrice * 5}с)
                          </button>
                          <button
                            type="button"
                            onClick={() => buyStock(id, 10)}
                            disabled={money < unitPrice * 10 || currentQty >= pantryCap}
                            className="flex-1 py-2 rounded-lg bg-[#D9822B] hover:bg-[#E7913A] disabled:opacity-40 text-white text-xs font-semibold font-mono-num transition-colors cursor-pointer whitespace-nowrap"
                          >
                            +10 ({unitPrice * 10}с)
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-[#9FB1C2]">
                          Блюдо откроется в меню на День {cfg.unlockDay}.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {UPGRADES.map((u) => {
                  const level = upgrades[u.id] ?? 0;
                  const maxed = level >= u.maxLevel;
                  const price = Math.round(u.cost * Math.pow(1.45, level));
                  return (
                    <div
                      key={u.id}
                      className="p-4 rounded-xl bg-[#25323E] border border-[#394A5B] flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-display font-bold text-base text-white">
                            {u.name}
                          </div>
                          <span className="font-mono-num text-xs text-[#F5C469]">
                            Ур. {level}/{u.maxLevel}
                          </span>
                        </div>
                        <p className="text-xs text-[#B8C7D6] mt-1.5 leading-relaxed">
                          {u.description}
                        </p>
                        <div className="text-xs font-semibold text-[#4ADE80] mt-2">
                          {u.effectText}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={maxed || money < price}
                        onClick={() => {
                          soundEngine.playPurchase();
                          onBuyUpgrade(u.id, price);
                        }}
                        className={`w-full py-2.5 rounded-lg text-xs font-bold font-mono-num transition-colors cursor-pointer whitespace-nowrap ${
                          maxed
                            ? 'bg-[#2E8B57]/30 text-[#86EFAC] cursor-default'
                            : 'bg-[#E05A3A] hover:bg-[#EE6848] disabled:opacity-40 text-white'
                        }`}
                      >
                        {maxed ? 'Максимальный уровень' : `Улучшить за ${price} сом`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-4 bg-[#19232C] border-t border-[#364758] flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs md:text-sm text-[#B8C7D6]">
            {totalUnlockedStock < 12 ? (
              <span className="text-[#FB923C] font-semibold">
                Внимание: на складе мало продуктов ({totalUnlockedStock} порций). Докупите запасы перед
                сменой!
              </span>
            ) : (
              <span>
                На складе готово <strong className="font-mono-num text-white">{totalUnlockedStock}</strong>{' '}
                порций — можно начинать день.
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onStartNextDay}
            className="px-7 py-3 rounded-xl bg-[#E05A3A] hover:bg-[#EE6848] text-white font-display font-bold text-base transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Открыть смену · День {nextDay}
          </button>
        </div>
      </div>
    </div>
  );
};
