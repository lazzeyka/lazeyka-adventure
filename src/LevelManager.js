/**
 * LevelManager.js
 * Менеджер структуры кампании, биомов, сложности и генерации уровней.
 * Игра: «Приключения Лазейки».
 */

import { Brick, BrickType } from './Brick.js';

/**
 * Режимы сложности игры
 * @readonly
 * @enum {string}
 */
export const Difficulty = Object.freeze({
  WALK: 'WALK',          // «Прогулка» — больше жизней, плавный мяч
  HARDCORE: 'HARDCORE'   // «Хардкор» — меньше жизней, быстрый мяч, x1.5 очки
});

/**
 * Настройки для каждого режима сложности
 */
export const DIFFICULTY_SETTINGS = Object.freeze({
  [Difficulty.WALK]: {
    name: 'ПРОГУЛКА',
    lives: 5,
    ballSpeed: 380,
    paddleWidth: 130,
    paddleSpeed: 580,
    scoreMultiplier: 1.0
  },
  [Difficulty.HARDCORE]: {
    name: 'ХАРДКОР',
    lives: 2,
    ballSpeed: 480,
    paddleWidth: 105,
    paddleSpeed: 540,
    scoreMultiplier: 1.5
  }
});

/**
 * Сюжетные описания, фоны и названия уровней для 4 биомов кампании
 */
export const BIOMES_DATA = Object.freeze({
  1: {
    id: 'jungle',
    name: 'ДИКИЕ ДЖУНГЛИ',
    bgKey: 'w-1-jungle',
    fallbackColors: { top: '#081710', bottom: '#030805', arena: '#09150d' },
    sublevels: ['Вход в Чащу', 'Древние Руины', 'Тотем Джунглей'],
    intro: {
      speaker: 'Лазейка',
      text: 'Опять решила срезать дорогу через незнакомую тропу… И куда это меня занесло? Ладно, где наша не пропадала!',
      title: 'Дикие Джунгли'
    },
    postBossText: 'Уф, ну и махина! Зато за ним открылся темный спуск в пещеры… Идем дальше!'
  },
  2: {
    id: 'cave',
    name: 'ЗАБРОШЕННАЯ ШАХТА',
    bgKey: 'w-2-cave',
    fallbackColors: { top: '#12141f', bottom: '#06070b', arena: '#0e1018' },
    sublevels: ['Штреки и Кристаллы', 'Глубокие Шурфы', 'Шахтный Бур'],
    intro: {
      speaker: 'Лазейка',
      text: 'Бр-р-р, тут прохладно, а ещё темно. Не споткнуться бы о вагонетку!',
      title: 'Заброшенная Шахта'
    },
    postBossText: 'Бур сломан, а путь — свободен! Ого, а что это за ледяной сквозняк вырывается из трещины?'
  },
  3: {
    id: 'mountains',
    name: 'ЛЕДЯНЫЕ ПИКИ',
    bgKey: 'w-3-mountains',
    fallbackColors: { top: '#0e1c2e', bottom: '#050a12', arena: '#0b1624' },
    sublevels: ['Ледяной Мост', 'Замерзшая Цитадель', 'Ледяной Страж'],
    intro: {
      speaker: 'Лазейка',
      text: 'Ой-ой-ой! Скользко! Без хорошего сцепления тут делать нечего.',
      title: 'Ледяные Пики'
    },
    postBossText: 'Вот это разминка, я даже согрелась! Лёд растаял, а под ним… проход в подземелья замка!'
  },
  4: {
    id: 'treasury',
    name: 'СОКРОВИЩНИЦА',
    bgKey: 'w-4-treasury',
    fallbackColors: { top: '#211322', bottom: '#090509', arena: '#170d18' },
    sublevels: ['Тронный Зал', 'Хранилище Золота', 'Хранитель Доспех'],
    intro: {
      speaker: 'Лазейка',
      text: 'Похоже, я у цели. Осталось пройти через главный зал сокровищницы!',
      title: 'Сокровищница'
    },
    postBossText: 'Есть! Вот она, лазейка наружу! А сокровища… ну, захвачу пару сувениров на память!'
  }
});

/**
 * Библиотека раскладок блоков для каждого уровня
 * 'N' - NORMAL (1 удар)
 * 'S' - STRONG (2 удара)
 * 'I' - INDESTRUCTIBLE (неразрушимый)
 * '.' - пустота
 * 
 * Баланс: стандартные уровни сделаны более доступными и динамичными,
 * с преобладанием быстрых блоков (NORMAL) и умеренным количеством крепких.
 */
const LEVEL_PATTERNS = {
  // Биом 1: Джунгли (Учебный биом, легкий и приятный темп)
  '1-1': [
    ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
    ['N', 'N', 'N', 'S', 'N', 'S', 'N', 'N', 'N'],
    ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
    ['.', 'N', 'N', 'N', 'S', 'N', 'N', 'N', '.'],
    ['.', '.', 'N', 'N', 'N', 'N', 'N', '.', '.']
  ],
  '1-2': [
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['N', 'S', 'N', 'N', 'I', 'N', 'N', 'S', 'N'],
    ['N', 'N', 'N', 'N', 'S', 'N', 'N', 'N', 'N'],
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['.', 'N', 'N', 'N', 'N', 'N', 'N', 'N', '.']
  ],

  // Биом 2: Шахта (Кристаллы и редкие монолитные опоры)
  '2-1': [
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['N', 'S', 'N', 'N', 'S', 'N', 'N', 'S', 'N'],
    ['N', 'N', 'N', 'N', 'I', 'N', 'N', 'N', 'N'],
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['.', 'N', 'N', 'N', 'S', 'N', 'N', 'N', '.']
  ],
  '2-2': [
    ['N', 'S', 'N', 'I', 'N', 'I', 'N', 'S', 'N'],
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['S', 'N', 'N', 'N', 'S', 'N', 'N', 'N', 'S'],
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['.', 'N', 'N', 'N', 'I', 'N', 'N', 'N', '.']
  ],

  // Биом 3: Ледяные Пики (Скользкий лед, динамичные коридоры)
  '3-1': [
    ['N', 'S', 'N', 'N', 'I', 'N', 'N', 'S', 'N'],
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['S', 'N', 'N', 'S', 'N', 'S', 'N', 'N', 'S'],
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['.', 'N', 'N', 'N', 'S', 'N', 'N', 'N', '.']
  ],
  '3-2': [
    ['S', 'N', 'N', 'I', 'N', 'I', 'N', 'N', 'S'],
    ['N', 'S', 'N', 'N', 'S', 'N', 'N', 'S', 'N'],
    ['N', 'N', 'S', 'N', 'N', 'N', 'S', 'N', 'N'],
    ['N', 'S', 'N', 'N', 'I', 'N', 'N', 'S', 'N'],
    ['.', 'N', 'N', 'S', 'N', 'S', 'N', 'N', '.']
  ],

  // Биом 4: Сокровищница (Золотые залы замка, умеренное сопротивление)
  '4-1': [
    ['N', 'S', 'N', 'I', 'N', 'I', 'N', 'S', 'N'],
    ['S', 'N', 'S', 'N', 'S', 'N', 'S', 'N', 'S'],
    ['N', 'N', 'N', 'S', 'I', 'S', 'N', 'N', 'N'],
    ['N', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'N'],
    ['.', 'N', 'S', 'N', 'I', 'N', 'S', 'N', '.']
  ],
  '4-2': [
    ['S', 'N', 'I', 'N', 'S', 'N', 'I', 'N', 'S'],
    ['N', 'S', 'N', 'S', 'N', 'S', 'N', 'S', 'N'],
    ['I', 'N', 'N', 'N', 'S', 'N', 'N', 'N', 'I'],
    ['N', 'S', 'N', 'S', 'N', 'S', 'N', 'S', 'N'],
    ['N', 'N', 'S', 'N', 'I', 'N', 'S', 'N', 'N']
  ]
};

/**
 * Уникальные защитные раскладки блоков для уровней с боссами (X-3)
 * Ровно 10 блоков в каждом паттерне (7 колонок сетки):
 * Босс 1 (Тотем Джунглей): фланговые защитные крылья
 * Босс 2 (Шахтный Бур): V-образный клин-наконечник бура
 * Босс 3 (Ледяной Страж): симметричный ледяной мост с просветом в центре
 * Босс 4 (Хранитель Доспех): королевская корона / защитный бастион
 */
const BOSS_PATTERNS = {
  1: [
    ['S', 'I', 'S', 'S', 'S', 'I', 'S'],
    ['.', 'S', 'I', '.', 'I', 'S', '.']
  ],
  2: [
    ['S', '.', 'S', 'I', 'S', '.', 'S'],
    ['.', 'I', 'S', 'I', 'S', 'I', '.']
  ],
  3: [
    ['I', 'S', '.', 'I', '.', 'S', 'I'],
    ['S', 'I', 'S', '.', 'S', 'I', 'S']
  ],
  4: [
    ['S', 'I', 'S', 'I', 'S', 'I', 'S'],
    ['.', '.', 'I', 'S', 'I', '.', '.']
  ]
};

export class LevelManager {
  /**
   * Генерация уровня (сетка блоков или арена босса)
   * @param {number} world - Номер биома (1..4)
   * @param {number} level - Номер подуровня (1..3)
   * @param {Object} arena - Границы арены { left, right, top, bottom }
   * @returns {{ bricks: Brick[], boss: Object|null }}
   */
  static generateLevel(world, level, arena) {
    if (level === 3) {
      return this._generateBossLevel(world, arena);
    }
    return this._generateStandardLevel(world, level, arena);
  }

  /**
   * Генерация сетки для подуровней X-1 и X-2
   * @private
   */
  static _generateStandardLevel(world, level, arena) {
    const bricks = [];
    const playableWidth = arena.right - arena.left;
    const paddingX = 20;
    const gapX = 8;
    const gapY = 8;
    const cols = 9;

    const availableWidth = playableWidth - paddingX * 2 - (cols - 1) * gapX;
    const brickWidth = Math.floor(availableWidth / cols);
    const brickHeight = 26;
    const startY = arena.top + 32;
    const startX = arena.left + paddingX;

    const key = `${world}-${level}`;
    const layout = LEVEL_PATTERNS[key] || LEVEL_PATTERNS['1-1'];

    for (let r = 0; r < layout.length; r++) {
      for (let c = 0; c < layout[r].length; c++) {
        const char = layout[r][c];
        if (char === '.') continue;

        let type = BrickType.NORMAL;
        if (char === 'S') type = BrickType.STRONG;
        else if (char === 'I') type = BrickType.INDESTRUCTIBLE;

        const bx = startX + c * (brickWidth + gapX);
        const by = startY + r * (brickHeight + gapY);

        bricks.push(new Brick(bx, by, brickWidth, brickHeight, type, world));
      }
    }

    return { bricks, boss: null };
  }

  /**
   * Генерация уровня босса (X-3)
   * @private
   */
  static _generateBossLevel(world, arena) {
    const bricks = [];
    const playableWidth = arena.right - arena.left;
    const paddingX = 40;
    const cols = 7;
    const gapX = 10;

    const availableWidth = playableWidth - paddingX * 2 - (cols - 1) * gapX;
    const brickWidth = Math.floor(availableWidth / cols);
    const brickHeight = 26;
    // Настройка масштаба босса: количество рядов блоков по высоте (по умолчанию 9, можно менять от 8 до 10+)
    const BOSS_SIZE_BRICK_ROWS = 10;
    const bossHeight = brickHeight * BOSS_SIZE_BRICK_ROWS; // ~234px
    const bossWidth = bossHeight; // 1:1 соотношение сторон спрайта

    const bossY = arena.top + 16;
    // Смещаем ряды блоков ниже босса с небольшим зазором
    const startY = bossY + bossHeight + 20;
    const startX = arena.left + paddingX;

    // Уникальные защитные блоки свиты босса для каждого мира (равное количество — 10 блоков)
    const bossLayout = BOSS_PATTERNS[world] || BOSS_PATTERNS[1];

    for (let r = 0; r < bossLayout.length; r++) {
      for (let c = 0; c < bossLayout[r].length; c++) {
        const char = bossLayout[r][c];
        if (char === '.') continue;

        const type = char === 'I' ? BrickType.INDESTRUCTIBLE : BrickType.STRONG;
        const bx = startX + c * (brickWidth + gapX);
        const by = startY + r * (brickHeight + 8);

        bricks.push(new Brick(bx, by, brickWidth, brickHeight, type, world));
      }
    }

    const biome = BIOMES_DATA[world] || BIOMES_DATA[1];
    const bossName = biome.sublevels[2] || 'Босс Биома';
    const initialBossX = arena.left + (playableWidth - bossWidth) / 2;

    const boss = {
      world,
      name: bossName,
      hp: 10 + (world - 1) * 3, // HP масштабируется по биомам (10, 13, 16, 19)
      maxHp: 10 + (world - 1) * 3,
      x: initialBossX,
      y: bossY,
      width: bossWidth,
      height: bossHeight,
      baseX: initialBossX,
      patrolDistance: 70,       // Амплитуда патрулирования влево/вправо
      patrolSpeed: 65,          // Скорость патрулирования (px/сек)
      patrolDirection: 1,       // 1 = вправо, -1 = влево
      flashTimer: 0,            // Таймер эффекта вспышки урона
      isDefeated: false
    };

    return { bricks, boss };
  }

  /**
   * Получить метаданные текущего биома
   * @param {number} world
   */
  static getBiomeData(world) {
    return BIOMES_DATA[world] || BIOMES_DATA[1];
  }

  /**
   * Получить чистое название текущего подуровня: «УРОВЕНЬ X-Y — НАЗВАНИЕ»
   * @param {number} world
   * @param {number} level
   */
  static getSublevelTitle(world, level) {
    const biome = this.getBiomeData(world);
    const sublevelName = (biome.sublevels && biome.sublevels[level - 1]) || 'АРКАДА';
    return `УРОВЕНЬ ${world}-${level} — ${sublevelName.toUpperCase()}`;
  }
}
