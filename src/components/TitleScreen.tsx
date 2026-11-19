import React, { useEffect, useState } from 'react';
import { GameMode } from '../game/types';

interface TitleScreenProps {
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  onStart: () => void;
  bestMoney: number;
  bestDays: number;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  mode,
  onModeChange,
  onStart,
  bestMoney,
  bestDays,
}) => {
  const [extError, setExtError] = useState(false);
  const [intError, setIntError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1B2631] text-[#FAF6F0]">
      {/* Real Campus Exterior Backdrop with subtle slow pan */}
      {!extError ? (
        <img
          src="/assets/aistudio/image_dfcaff8e.png"
          alt="Студенческая столовая и корпус университета"
          referrerPolicy="no-referrer"
          onError={() => setExtError(true)}
          className="absolute inset-0 w-full h-full object-cover object-center animate-campus-pan"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#2B4358] via-[#4C6E8A] to-[#233240]" />
      )}

      {/* Measured contrast scrim over upper-left sky negative space */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(108deg, rgba(18, 28, 38, 0.90) 0%, rgba(22, 34, 46, 0.72) 44%, rgba(22, 34, 46, 0.28) 78%, rgba(18, 28, 38, 0.62) 100%)',
        }}
      />

      {/* Main Content Layout */}
      <div className="relative z-10 h-full w-full max-w-[1400px] mx-auto px-8 md:px-14 py-10 flex flex-col justify-between">
        {/* Top quiet record metadata (zero pills) */}
        <div className="flex items-center justify-between text-xs md:text-sm text-[#D7E2EC]/85 tracking-wide">
          <div className="flex items-center gap-3">
            <span>Университетский кампус</span>
            <span aria-hidden="true">·</span>
            <span>Смена 08:00–15:00</span>
          </div>
          {bestDays > 0 && (
            <div className="flex items-center gap-3 font-mono-num text-[#F5D08A]">
              <span>Рекорд: {bestDays} дн.</span>
              <span aria-hidden="true">·</span>
              <span>Касса {bestMoney} сом</span>
            </div>
          )}
        </div>

        {/* Center Hero Lockup + Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end my-auto">
          <div className="lg:col-span-7 max-w-2xl">
            {/* Bespoke inline SVG Title Lockup */}
            <svg
              viewBox="0 0 560 148"
              className="w-full max-w-[540px] h-auto mb-5"
              role="img"
              aria-label="Столовая Кампуса"
            >
              {/* Stylized campus arch + steaming tea cup crest */}
              <g transform="translate(8, 12)">
                <rect
                  x="0"
                  y="0"
                  width="82"
                  height="82"
                  rx="18"
                  fill="#243442"
                  stroke="#E5B263"
                  strokeWidth="2.5"
                />
                {/* Campus arched roof line */}
                <path
                  d="M14 34 Q41 14 68 34"
                  fill="none"
                  stroke="#8EB7D9"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Warm cup & steam */}
                <path
                  d="M26 42 L56 42 L52 67 L30 67 Z"
                  fill="#FAF6F0"
                />
                <rect x="28" y="51" width="26" height="8" fill="#E05A3A" />
                <path
                  d="M35 35 Q32 28 36 24 M46 35 Q43 28 47 24"
                  fill="none"
                  stroke="#F5D08A"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </g>

              {/* Title wordmark */}
              <text
                x="110"
                y="56"
                fill="#FAF6F0"
                fontFamily="Rubik, sans-serif"
                fontWeight="800"
                fontSize="44"
                letterSpacing="0.5"
              >
                СТОЛОВАЯ
              </text>
              <text
                x="110"
                y="102"
                fill="#F5C469"
                fontFamily="Rubik, sans-serif"
                fontWeight="800"
                fontSize="44"
                letterSpacing="1.2"
              >
                КАМПУСА
              </text>
              <line
                x1="110"
                y1="120"
                x2="455"
                y2="120"
                stroke="#E05A3A"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>

            <p className="text-base md:text-lg text-[#E8EEF4] leading-relaxed max-w-xl mb-7">
              Успейте накормить поток студентов на большой перемене: собирайте подносы с горячим
              чаем, свежими булочками, самсой и пловом, мойте тарелки и планируйте закупки продуктов
              на каждый день семестра.
            </p>

            {/* Mode selector (functional buttons) */}
            <div className="inline-flex items-center gap-1 p-1 bg-[#141E27]/85 border border-white/15 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => onModeChange('campaign')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'campaign'
                    ? 'bg-[#FAF6F0] text-[#1C2630]'
                    : 'text-[#CBD5E1] hover:text-white'
                }`}
              >
                Зачётная неделя (5 дней)
              </button>
              <button
                type="button"
                onClick={() => onModeChange('endless')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'endless'
                    ? 'bg-[#FAF6F0] text-[#1C2630]'
                    : 'text-[#CBD5E1] hover:text-white'
                }`}
              >
                Бесконечный семестр
              </button>
            </div>

            {/* Primary CTA */}
            <div className="flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={onStart}
                className="px-8 py-4 rounded-xl bg-[#E05A3A] hover:bg-[#EE6848] active:scale-[0.98] text-white font-display font-bold text-lg tracking-wide shadow-lg shadow-[#E05A3A]/30 transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C469]"
              >
                Начать смену
              </button>
              <span className="text-sm text-[#CBD5E1]">
                или нажмите <kbd className="font-mono-num text-[#F5C469]">Enter</kbd>
              </span>
            </div>
          </div>

          {/* Authentic Interior Photo Postcard Preview (lower-right desktop) */}
          <div className="hidden lg:flex lg:col-span-5 justify-end">
            <div className="w-[340px] bg-[#FAF6F0] p-2.5 rounded-xl shadow-2xl shadow-black/45 rotate-2 border border-white/40">
              {!intError ? (
                <img
                  src="/assets/aistudio/image_9835346c.png"
                  alt="Зал студенческой столовой на перемене"
                  referrerPolicy="no-referrer"
                  onError={() => setIntError(true)}
                  className="w-full h-[210px] object-cover rounded-lg"
                />
              ) : (
                <div className="w-full h-[210px] rounded-lg bg-[#DFD3C0]" />
              )}
              <div className="pt-2.5 pb-1 px-1 flex items-center justify-between text-xs text-[#4A3B2F] font-medium">
                <span>Обеденный зал · Большая перемена</span>
                <span className="font-mono-num text-[#8B5A2B]">12:15</span>
              </div>
            </div>
          </div>
        </div>

        {/* Single flat control-hint line */}
        <div className="pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-4 text-xs md:text-sm text-[#D6E0EA]/90">
          <div className="font-mono-num tracking-tight">
            1–5 Блюда · A/S/D/F или Пробел Выдача · R Мойка · X Сброс подноса · Esc Пауза
          </div>
          <div className="text-[#D6E0EA]/70">Управление мышью или клавиатурой</div>
        </div>
      </div>
    </div>
  );
};
