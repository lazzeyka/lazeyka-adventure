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
    sublevels: ['Вход в Чащу', 'Древние Руины', 'Тотем Джунглей'],
    intro: {
      speaker: 'Лазейка',
      text: 'Опять решила срезать дорогу через незнакомую тропу… И куда это меня занесло? Ладно, где наша не пропадала — выберемся!',
      title: 'Дикие Джунгли'
    },
    postBossText: 'Уф, ну и махина! Зато за ним открылся темный спуск в пещеры… Идем дальше!'
  },
  2: {
    id: 'cave',
    name: 'ЗАБРОШЕННАЯ ШАХТА',
    bgKey: 'w-2-cave',
    sublevels: ['Штреки и Кристаллы', 'Глубокие Шурфы', 'Шахтный Бур'],
    intro: {
      speaker: 'Лазейка',
      text: 'Бр-р-р, тут прохладно, а ещё темно. Не зацепить бы головой вагонетку!',
      title: 'Заброшенная Шахта'
    },
    postBossText: 'Бур сломан, путь свободен! Ого, а что это за ледяной сквозняк вырывается из трещины?'
  },
  3: {
    id: 'mountains',
    name: 'ЛЕДЯНЫЕ ПИКИ',
    bgKey: 'w-3-mountains',
    sublevels: ['Ледяной Мост', 'Замерзшая Цитадель', 'Ледяной Страж'],
    intro: {
      speaker: 'Лазейка',
      text: 'Скользко! Без хорошего сцепления тут делать нечего.',
      title: 'Ледяные Пики'
    },
    postBossText: 'Вот это разминка, я даже согрелась! Лёд растаял, а под ним… подземелья замка!'
  },
  4: {
    id: 'treasury',
    name: 'СОКРОВИЩНИЦА',
    bgKey: 'w-4-treasury',
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
 */
const LEVEL_PATTERNS = {
  // Биом 1: Джунгли
  '1-1': [
    ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
    ['N', 'S', 'N', 'N', 'S', 'N', 'N', 'S', 'N'],
    ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
    ['.', 'N', 'N', 'S', 'N', 'S', 'N', 'N', '.'],
    ['.', '.', 'N', 'N', 'N', 'N', 'N', '.', '.']
  ],
  '1-2': [
    ['S', 'N', 'S', 'N', 'I', 'N', 'S', 'N', 'S'],
    ['N', 'S', 'N', 'S', 'N', 'S', 'N', 'S', 'N'],
    ['S', 'N', 'I', 'N', 'S', 'N', 'I', 'N', 'S'],
    ['N', 'S', 'N', 'S', 'N', 'S', 'N', 'S', 'N'],
    ['.', 'N', 'S', 'N', 'I', 'N', 'S', 'N', '.']
  ],

  // Биом 2: Шахта
  '2-1': [
    ['N', 'S', 'N', 'S', 'N', 'S', 'N', 'S', 'N'],
    ['S', 'I', 'S', 'N', 'S', 'N', 'S', 'I', 'S'],
    ['N', 'S', 'N', 'S', 'I', 'S', 'N', 'S', 'N'],
    ['S', 'N', 'S', 'N', 'S', 'N', 'S', 'N', 'S'],
    ['.', 'S', 'N', 'N', 'S', 'N', 'N', 'S', '.']
  ],
  '2-2': [
    ['I', 'S', 'S', 'I', 'S', 'I', 'S', 'S', 'I'],
    ['S', 'N', 'S', 'N', 'S', 'N', 'S', 'N', 'S'],
    ['S', 'S', 'I', 'S', 'I', 'S', 'I', 'S', 'S'],
    ['N', 'S', 'N', 'S', 'S', 'S', 'N', 'S', 'N'],
    ['.', 'I', 'S', 'N', 'I', 'N', 'S', 'I', '.']
  ],

  // Биом 3: Ледяные Пики
  '3-1': [
    ['S', 'S', 'S', 'N', 'I', 'N', 'S', 'S', 'S'],
    ['N', 'S', 'N', 'S', 'N', 'S', 'N', 'S', 'N'],
    ['I', 'N', 'S', 'S', 'S', 'S', 'S', 'N', 'I'],
    ['N', 'S', 'N', 'I', 'N', 'I', 'N', 'S', 'N'],
    ['.', 'N', 'S', 'S', 'N', 'S', 'S', 'N', '.']
  ],
  '3-2': [
    ['S', 'I', 'S', 'S', 'I', 'S', 'S', 'I', 'S'],
    ['S', 'S', 'I', 'S', 'S', 'S', 'I', 'S', 'S'],
    ['I', 'S', 'S', 'I', 'S', 'I', 'S', 'S', 'I'],
    ['S', 'N', 'S', 'S', 'I', 'S', 'S', 'N', 'S'],
    ['.', 'S', 'I', 'S', 'S', 'S', 'I', 'S', '.']
  ],

  // Биом 4: Сокровищница
  '4-1': [
    ['S', 'S', 'S', 'I', 'S', 'I', 'S', 'S', 'S'],
    ['S', 'I', 'S', 'S', 'S', 'S', 'S', 'I', 'S'],
    ['S', 'S', 'I', 'S', 'I', 'S', 'I', 'S', 'S'],
    ['N', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'N'],
    ['.', 'S', 'I', 'S', 'I', 'S', 'I', 'S', '.']
  ],
  '4-2': [
    ['I', 'S', 'I', 'S', 'I', 'S', 'I', 'S', 'I'],
    ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
    ['I', 'S', 'S', 'I', 'S', 'I', 'S', 'S', 'I'],
    ['S', 'S', 'I', 'S', 'S', 'S', 'I', 'S', 'S'],
    ['S', 'I', 'S', 'S', 'I', 'S', 'S', 'I', 'S']
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
    const brickHeight = 28;
    const startX = arena.left + paddingX;
    const startY = arena.top + 130;

    // Защитные блоки свиты босса
    const bossLayout = [
      ['S', 'I', 'S', 'S', 'S', 'I', 'S'],
      ['.', 'S', 'I', 'S', 'I', 'S', '.']
    ];

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

    const boss = {
      name: bossName,
      hp: 10 + (world - 1) * 3, // HP масштабируется по биомам (10, 13, 16, 19)
      maxHp: 10 + (world - 1) * 3,
      x: arena.left + (playableWidth - 160) / 2,
      y: arena.top + 40,
      width: 160,
      height: 60,
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
