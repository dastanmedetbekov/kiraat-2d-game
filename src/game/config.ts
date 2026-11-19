import {
  DayForecast,
  MenuItemConfig,
  MenuItemId,
  StudentArchetype,
  UpgradeConfig,
  UpgradeId,
} from './types';

export const SHIFT_DURATION_SEC = 85; // 08:00 -> 15:00 (7 campus hours)
export const CAMPAIGN_DAYS = 5;
export const BASE_PANTRY_CAP = 35;

export const MENU_ORDER: MenuItemId[] = ['tea', 'bun', 'egg', 'samsa', 'plov'];

export const MENU_ITEMS: Record<MenuItemId, MenuItemConfig> = {
  tea: {
    id: 'tea',
    name: 'Горячий чай',
    shortName: 'Чай',
    hotkey: '1',
    sellPrice: 30,
    baseWholesalePrice: 8,
    batchSize: 6,
    cookDuration: 2.2,
    unlockDay: 1,
    accentColor: '#C4622D',
    stationTitle: 'Титан с чаем',
  },
  bun: {
    id: 'bun',
    name: 'Свежая булочка',
    shortName: 'Булочка',
    hotkey: '2',
    sellPrice: 45,
    baseWholesalePrice: 14,
    batchSize: 5,
    cookDuration: 2.6,
    unlockDay: 1,
    accentColor: '#D99B38',
    stationTitle: 'Выпечка',
  },
  egg: {
    id: 'egg',
    name: 'Варёное яйцо',
    shortName: 'Яйцо',
    hotkey: '3',
    sellPrice: 40,
    baseWholesalePrice: 13,
    batchSize: 5,
    cookDuration: 2.3,
    unlockDay: 1,
    accentColor: '#E5B85B',
    stationTitle: 'Завтрак',
  },
  samsa: {
    id: 'samsa',
    name: 'Слоёная самса',
    shortName: 'Самса',
    hotkey: '4',
    sellPrice: 75,
    baseWholesalePrice: 28,
    batchSize: 4,
    cookDuration: 3.1,
    unlockDay: 1,
    accentColor: '#C87428',
    stationTitle: 'Тандыр-витрина',
  },
  plov: {
    id: 'plov',
    name: 'Казан плова',
    shortName: 'Плов',
    hotkey: '5',
    sellPrice: 135,
    baseWholesalePrice: 52,
    batchSize: 4,
    cookDuration: 3.8,
    unlockDay: 2,
    accentColor: '#B84B27',
    stationTitle: 'Горячий казан',
  },
};

export const STUDENT_ARCHETYPES: StudentArchetype[] = [
  {
    id: 'freshman',
    label: 'Первокурсник',
    patienceSec: 25,
    minItems: 1,
    maxItems: 2,
    tipMultiplier: 1.0,
    reputationWeight: 0.14,
    preferredItems: ['tea', 'bun', 'egg'],
    jacketColors: ['#5B7FA6', '#4A6D8C', '#6F8874', '#7C6D8A'],
    hairColors: ['#1B1A1E', '#2A221E', '#3A2C22'],
    skinTones: ['#F2CFB6', '#E8BC9E', '#DFAD8C'],
  },
  {
    id: 'honors',
    label: 'Отличница',
    patienceSec: 23,
    minItems: 2,
    maxItems: 3,
    tipMultiplier: 1.35,
    reputationWeight: 0.18,
    preferredItems: ['tea', 'bun', 'egg', 'samsa'],
    jacketColors: ['#D4433B', '#2F3640', '#5E7C99', '#8E4A5C'],
    hairColors: ['#161518', '#2C211C', '#3B281E'],
    skinTones: ['#F5D6C0', '#ECC4A8', '#E1B291'],
  },
  {
    id: 'hurried',
    label: 'Опаздывает на пару',
    patienceSec: 16,
    minItems: 1,
    maxItems: 2,
    tipMultiplier: 1.5,
    reputationWeight: 0.16,
    preferredItems: ['samsa', 'bun', 'tea'],
    jacketColors: ['#22272E', '#37474F', '#C04832', '#3A6B7C'],
    hairColors: ['#17171B', '#28221F'],
    skinTones: ['#EFC8AC', '#E2B493', '#F3D2BA'],
  },
  {
    id: 'athlete',
    label: 'Спортсмен',
    patienceSec: 21,
    minItems: 2,
    maxItems: 3,
    tipMultiplier: 1.25,
    reputationWeight: 0.2,
    preferredItems: ['plov', 'samsa', 'egg', 'tea'],
    jacketColors: ['#2C5282', '#2E6F40', '#8C2D2D', '#2D3748'],
    hairColors: ['#1A191D', '#2F2620'],
    skinTones: ['#E5B795', '#D9A682', '#EECCAF'],
  },
  {
    id: 'professor',
    label: 'Преподаватель',
    patienceSec: 27,
    minItems: 2,
    maxItems: 3,
    tipMultiplier: 1.7,
    reputationWeight: 0.28,
    preferredItems: ['plov', 'tea', 'samsa', 'bun'],
    jacketColors: ['#4A5568', '#5C4D42', '#3B4C5E'],
    hairColors: ['#4A4B50', '#6E7178', '#2B2B30'],
    skinTones: ['#EBC2A4', '#E1B292'],
  },
];

export const UPGRADES: UpgradeConfig[] = [
  {
    id: 'tea_urn',
    name: 'Большой титан',
    description: 'Увеличивает объём заварки чая и ускоряет кипячение.',
    effectText: '+3 кружки в партии, −25% время заварки',
    cost: 420,
    maxLevel: 2,
  },
  {
    id: 'convection_oven',
    name: 'Конвекционная печь',
    description: 'Булочки и слоёная самса готовятся значительно быстрее и крупнее партиями.',
    effectText: '+2 шт. в партии, −30% время выпечки',
    cost: 560,
    maxLevel: 2,
  },
  {
    id: 'dishwasher',
    name: 'Посудомойка',
    description: 'Расширяет стопку чистых тарелок и автоматически подмывает грязную посуду.',
    effectText: '+5 чистых тарелок и автомойка',
    cost: 620,
    maxLevel: 2,
  },
  {
    id: 'wide_tray',
    name: 'Широкий поднос',
    description: 'Позволяет носить больше блюд за один раз и ускоряет раздачу в час пик.',
    effectText: 'Вместимость подноса +1 блюдо',
    cost: 480,
    maxLevel: 2,
  },
  {
    id: 'cozy_gazebos',
    name: 'Цветы и уютные беседки',
    description: 'Свежие клумбы и столики на газоне поднимают настроение всей очереди.',
    effectText: '+22% терпения студентов и +18% к чаевым',
    cost: 520,
    maxLevel: 2,
  },
  {
    id: 'plov_cauldron',
    name: 'Чугунный казан плова',
    description: 'Держит жар лучше: больше порций плова за закладку и быстрее готовка.',
    effectText: '+2 порции плова, −28% время готовки',
    cost: 680,
    maxLevel: 2,
  },
];

export const DAY_FORECASTS: DayForecast[] = [
  {
    day: 1,
    title: 'Понедельник · Утренний заезд',
    weatherLabel: 'Ясно, +19°C',
    headline: 'Первая смена недели: студенты берут булочки, яйца, самсу и горячий чай.',
    demandMultipliers: { tea: 1.2, bun: 1.25, egg: 1.1, samsa: 1.0 },
    priceMultipliers: { tea: 1.0, bun: 1.0, egg: 1.0, samsa: 1.0, plov: 1.0 },
    studentRateMultiplier: 1.0,
    rushBonus: 1.35,
  },
  {
    day: 2,
    title: 'Вторник · Открытие казана',
    weatherLabel: 'Прохладно, +13°C',
    headline: 'В меню появляется горячий плов! В пасмурную погоду чай разбирают мгновенно.',
    demandMultipliers: { tea: 1.45, plov: 1.35, samsa: 1.15, bun: 0.9 },
    priceMultipliers: { tea: 0.85, bun: 1.0, egg: 1.0, samsa: 1.1, plov: 0.95 },
    studentRateMultiplier: 1.12,
    rushBonus: 1.45,
  },
  {
    day: 3,
    title: 'Среда · Спартакиада кампуса',
    weatherLabel: 'Солнечно, +22°C',
    headline: 'После соревнований придут спортсмены: огромный спрос на плов, самсу и яйца.',
    demandMultipliers: { plov: 1.5, samsa: 1.4, egg: 1.3, tea: 0.9 },
    priceMultipliers: { tea: 1.0, bun: 0.85, egg: 0.9, samsa: 1.15, plov: 1.1 },
    studentRateMultiplier: 1.22,
    rushBonus: 1.55,
  },
  {
    day: 4,
    title: 'Четверг · День коллоквиумов',
    weatherLabel: 'Дождь, +11°C',
    headline: 'Все спешат между парами! Высокий спрос на быструю выпечку и чай; запаситесь тарелками.',
    demandMultipliers: { tea: 1.5, bun: 1.45, samsa: 1.35, plov: 1.1 },
    priceMultipliers: { tea: 1.15, bun: 0.9, egg: 0.85, samsa: 1.0, plov: 0.9 },
    studentRateMultiplier: 1.3,
    rushBonus: 1.65,
  },
  {
    day: 5,
    title: 'Пятница · Аншлаг перед выходными',
    weatherLabel: 'Ясно, горный ветер +18°C',
    headline: 'Полная посадка в зале и беседках! Преподаватели и старшекурсники ждут идеальный сервис.',
    demandMultipliers: { plov: 1.55, samsa: 1.4, bun: 1.25, tea: 1.35, egg: 1.15 },
    priceMultipliers: { tea: 1.0, bun: 1.05, egg: 1.0, samsa: 0.9, plov: 0.95 },
    studentRateMultiplier: 1.42,
    rushBonus: 1.75,
  },
];

export function getForecastForDay(day: number): DayForecast {
  if (day <= DAY_FORECASTS.length) {
    return DAY_FORECASTS[day - 1];
  }
  const cycle = DAY_FORECASTS[(day - 1) % DAY_FORECASTS.length];
  const scale = 1 + (day - 5) * 0.08;
  return {
    ...cycle,
    day,
    title: `День ${day} · Семестр в разгаре`,
    studentRateMultiplier: Math.min(2.1, cycle.studentRateMultiplier * scale),
    rushBonus: Math.min(2.2, cycle.rushBonus * (1 + (day - 5) * 0.04)),
  };
}

export function getWholesalePrice(itemId: MenuItemId, forecast: DayForecast): number {
  const base = MENU_ITEMS[itemId].baseWholesalePrice;
  const mult = forecast.priceMultipliers[itemId] ?? 1;
  return Math.max(4, Math.round(base * mult));
}

export function getEmergencyPrice(itemId: MenuItemId): number {
  return Math.round(MENU_ITEMS[itemId].baseWholesalePrice * 1.75);
}

export function createInitialPantry(): Record<MenuItemId, number> {
  return {
    tea: 16,
    bun: 14,
    egg: 12,
    samsa: 12,
    plov: 0,
  };
}

export function createInitialUpgrades(): Record<UpgradeId, number> {
  return {
    tea_urn: 0,
    convection_oven: 0,
    dishwasher: 0,
    wide_tray: 0,
    cozy_gazebos: 0,
    plov_cauldron: 0,
  };
}
