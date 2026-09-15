/**
 * Game.js
 * Основной игровой класс игры «Приключения Лазейки».
 * Управляет игровым циклом, State Machine, физикой мяча, платформой, сложностью и чит-командами.
 */

import Assets from './Assets.js';
import MusicManager from './MusicManager.js';
import SoundManager from './SoundManager.js';
import { LevelManager, Difficulty, DIFFICULTY_SETTINGS, BIOMES_DATA } from './LevelManager.js';

/**
 * Состояния экранов игры
 * @readonly
 * @enum {string}
 */
export const GameState = Object.freeze({
  LOGO: 'LOGO',                 // Лого разработчика (интро-заставка)
  TITLE: 'TITLE',               // Титульный экран с названием игры
  MENU: 'MENU',                 // Главное меню (выбор сложности)
  INTRO: 'INTRO',               // Сюжетная катсцена перед новым биомом (1-1, 2-1, 3-1, 4-1)
  LEVEL_START: 'LEVEL_START',   // Чистый экран перехода между подуровнями (1-2, 1-3, ...)
  PLAYING: 'PLAYING',           // Игровой процесс (Арканоид)
  PAUSED: 'PAUSED',             // Пауза
  GAMEOVER: 'GAMEOVER',         // Поражение
  VICTORY: 'VICTORY',           // Финальная победа
  CREDITS: 'CREDITS'            // Экран финальных титров
});

export default class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Разрешение холста 1280x720 (16:9)
    this.width = 1280;
    this.height = 720;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Игровой цикл
    this.isRunning = false;
    this.lastTime = 0;
    this.animationFrameId = null;

    // Сложность (по умолчанию «Прогулка»)
    this.difficulty = Difficulty.WALK;

    // Состояние экранов (игра стартует с лого-заставки)
    this.state = GameState.LOGO;
    this.previousState = null;

    // Таймеры для анимации стартовых экранов
    this.logoTimer = 0;        // fade-in + задержка лого
    this.logoDuration = 2.8;   // сек: 0.6 fade-in + 1.2 показ + 1.0 fade-out
    this.logoAlpha = 0;        // 0..1, управляется в update

    // Таймер мигания «Нажмите любую клавишу» на Title
    this.titleBlinkTimer = 0;
    // Флаг активации главного экрана: до нажатия показывается чистая статичная картинка title-screen.png,
    // после любого нажатия/клика запускается видео title-screen.mp4 и музыка
    this.isTitleActivated = false;

    // Экран финальных титров
    this.creditsScrollY = 0;        // текущая позиция прокрутки (px, увеличивается со временем)
    this.CREDITS_SCROLL_SPEED = 60; // px/сек — скорость прокрутки (параметр)
    this.CREDITS_VIDEO_DIM = 0.72;  // [0..1] — сила затемнения видео на экране титров (параметр)

    // Прогресс кампании
    this.currentWorld = 1; // 1..4 (Биомы)
    this.currentLevel = 1; // 1..3 (Подуровни)
    this.score = 0;
    this.lives = this.difficultySettings.lives;
    this.maxLives = this.difficultySettings.lives;

    // Контекст сюжета INTRO
    this.introData = {
      speaker: BIOMES_DATA[1].intro.speaker,
      text: BIOMES_DATA[1].intro.text,
      biomeTitle: BIOMES_DATA[1].intro.title
    };

    // Геометрия П-образной арены
    const wallThickness = 16;
    const arenaWidth = 720;
    const arenaHeight = 650;
    const arenaX = (this.width - arenaWidth) / 2;
    const arenaY = 70; // Подбери число, чтобы арена встала ровно на фон

    this.arena = {
      x: arenaX,
      y: arenaY,
      width: arenaWidth,
      height: arenaHeight,
      left: arenaX + wallThickness,
      right: arenaX + arenaWidth - wallThickness,
      top: arenaY + wallThickness,
      bottom: arenaY + arenaHeight,
      wallThickness: wallThickness
    };

    // Параллакс фона (overscan 1400x720)
    this.bgRenderWidth = 1400;
    this.bgRenderHeight = 720;
    this.cameraRatio = 0.5;

    // Игровые сущности
    this.paddle = {
      x: this.arena.left + (this.arena.right - this.arena.left - this.difficultySettings.paddleWidth) / 2,
      y: this.arena.bottom - 80,
      width: this.difficultySettings.paddleWidth,
      height: Math.round(this.difficultySettings.paddleWidth * (308 / 512)),
      speed: this.difficultySettings.paddleSpeed
    };

    this.ball = {
      x: 0,
      y: 0,
      radius: 8,
      vx: 240,
      vy: -320,
      speed: this.difficultySettings.ballSpeed,
      isStuck: true
    };

    this.bricks = [];
    this.boss = null;
    this.levelClearBannerTimer = 0;

    // Управление
    this.keys = {
      left: false,
      right: false,
      space: false
    };

    this.resetBallOnPaddle();
    this.loadLevel();
  }

  get difficultySettings() {
    return DIFFICULTY_SETTINGS[this.difficulty] || DIFFICULTY_SETTINGS[Difficulty.WALK];
  }

  /**
   * Инициализация
   */
  init() {
    this.ctx.imageSmoothingEnabled = false;
    this.setupInputListeners();
    MusicManager.syncWithGameState(this.state, this.currentWorld);
  }

  /**
   * Загрузка уровня через LevelManager
   */
  loadLevel() {
    this.resetBallOnPaddle();
    const { bricks, boss } = LevelManager.generateLevel(this.currentWorld, this.currentLevel, this.arena);
    this.bricks = bricks;
    this.boss = boss;
    if (this.boss) {
      SoundManager.playBossSpawn();
    }
  }

  /**
   * Переключение сложности («Прогулка» <-> «Хардкор»)
   */
  toggleDifficulty() {
    this.difficulty = this.difficulty === Difficulty.WALK ? Difficulty.HARDCORE : Difficulty.WALK;
    console.log(`[Game] Сложность: ${this.difficultySettings.name}`);
    SoundManager.playUiClick();

    this.paddle.width = this.difficultySettings.paddleWidth;
    this.paddle.speed = this.difficultySettings.paddleSpeed;
    this.maxLives = this.difficultySettings.lives;
    this.lives = Math.min(this.lives, this.maxLives);
    this.ball.speed = this.difficultySettings.ballSpeed;
  }

  /**
   * ЧИТ-КЛАВИША C: Мгновенная очистка поля
   */
  cheatClearLevel() {
    console.log('[Cheat] Клавиша C: Очистка поля и переход на следующий этап!');
    for (const brick of this.bricks) {
      if (brick.isDestructible) {
        brick.isDestroyed = true;
      }
    }
    if (this.boss) {
      this.boss.hp = 0;
    }
    this.advanceLevel();
  }

  /**
   * Переход на следующий уровень или биом
   */
  advanceLevel() {
    this.levelClearBannerTimer = 1.0;
    SoundManager.playLevelWin();

    if (this.currentLevel < 3) {
      // Переход между подуровнями внутри одного биома (например, 1-1 -> 1-2)
      // Катсцену не показываем, открываем чистый экран подуровня LEVEL_START
      this.currentLevel++;
      this.loadLevel();
      this.setState(GameState.LEVEL_START);
    } else {
      // Завершен уровень босса (X-3)
      if (this.currentWorld < 4) {
        // Переход в следующий биом (например, с 1 на 2) -> показываем полноценную сюжетную катсцену INTRO
        this.currentWorld++;
        this.currentLevel = 1;
        const biome = LevelManager.getBiomeData(this.currentWorld);

        this.loadLevel();
        this.setState(GameState.INTRO, {
          intro: {
            speaker: biome.intro.speaker,
            text: biome.intro.text,
            biomeTitle: biome.intro.title
          }
        });
      } else {
        // После победы над последним боссом — сначала показываем экран Победы
        this.setState(GameState.VICTORY);
      }
    }
  }

  /**
   * Проверка условий завершения уровня
   */
  checkLevelComplete() {
    const remainingDestructible = this.bricks.filter(b => b.isDestructible && !b.isDestroyed);

    if (this.currentLevel === 3) {
      if (remainingDestructible.length === 0 || (this.boss && this.boss.hp <= 0)) {
        this.advanceLevel();
      }
    } else {
      if (remainingDestructible.length === 0) {
        this.advanceLevel();
      }
    }
  }

  /**
   * Смена состояния игры (State Machine)
   */
  setState(newState, params = {}) {
    if (!GameState[newState]) return;

    this.previousState = this.state;
    this.state = newState;

    // Управление воспроизведением фонового видео титульного экрана
    const titleVideo = Assets.getVideo('title-screen-video');
    if (titleVideo) {
      const videoActive = (newState === GameState.TITLE && this.isTitleActivated)
        || newState === GameState.MENU
        || newState === GameState.CREDITS;
      if (videoActive) {
        if (titleVideo.paused) {
          titleVideo.play().catch(() => { });
        }
      } else {
        if (!titleVideo.paused) {
          titleVideo.pause();
        }
      }
    }

    // При переходе на экран титров — сбрасываем прокрутку
    if (newState === GameState.CREDITS) {
      this.creditsScrollY = 0;
    }

    // Синхронизация фоновой музыки с новым состоянием игры и биомом
    // Если мы на экране TITLE, но игрок еще не нажал кнопку — музыка не играет
    if (newState === GameState.TITLE && !this.isTitleActivated) {
      MusicManager.stop(0);
    } else {
      MusicManager.syncWithGameState(newState, this.currentWorld);
    }

    // Управление видимостью надписи над экраном:
    // «Приключения Лазейки» отображается только во время игры (PLAYING, PAUSED, LEVEL_START)
    const gameHeader = document.getElementById('gameHeader');
    if (gameHeader) {
      const isIngame = (newState === GameState.PLAYING || newState === GameState.PAUSED || newState === GameState.LEVEL_START);
      gameHeader.classList.toggle('header-hidden', !isIngame);
    }

    if (this.state === GameState.INTRO && params.intro) {
      this.introData = { ...this.introData, ...params.intro };
    } else if (this.state === GameState.PLAYING && params.reset) {
      this.resetGame();
    }
  }

  /**
   * Сброс мяча на ракетку
   */
  resetBallOnPaddle() {
    this.ball.isStuck = true;
    this.ball.x = this.paddle.x + this.paddle.width / 2;
    this.ball.y = this.paddle.y - this.ball.radius - 2;
    this.ball.speed = this.difficultySettings.ballSpeed;
    this.ball.vx = (this.ball.speed * 0.6) * (Math.random() > 0.5 ? 1 : -1);
    this.ball.vy = -this.ball.speed * 0.8;
    SoundManager.playPlayerSpawn();
  }

  /**
   * Полный перезапуск кампании
   */
  resetGame() {
    this.lives = this.difficultySettings.lives;
    this.maxLives = this.difficultySettings.lives;
    this.score = 0;
    this.currentWorld = 1;
    this.currentLevel = 1;
    this.paddle.width = this.difficultySettings.paddleWidth;
    this.paddle.x = this.arena.left + (this.arena.right - this.arena.left - this.paddle.width) / 2;
    this.resetBallOnPaddle();
    this.loadLevel();
    this.cameraRatio = 0.5;
    MusicManager.syncWithGameState(this.state, this.currentWorld);
  }

  /**
   * Потеря мяча (падение в пропасть)
   */
  onBallLost() {
    this.lives--;
    SoundManager.playBallLost();
    if (this.lives <= 0) {
      this.setState(GameState.GAMEOVER);
    } else {
      this.resetBallOnPaddle();
    }
  }

  /**
   * Слушатели управления и горячих клавиш
   */
  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      MusicManager.unlock();

      // Если мы на экране TITLE в статичном режиме — любое нажатие клавиши активирует видео и музыку
      if (this.state === GameState.TITLE && !this.isTitleActivated) {
        this.activateTitleScreen();
        return;
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = true;

      if (e.code === 'Space') {
        this.keys.space = true;
        this.handleActionKey();
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.togglePause();
      }

      // Управление музыкой (Mute / громкость)
      if (e.code === 'KeyM') {
        MusicManager.toggleMute();
      }
      if (e.code === 'BracketLeft' || e.code === 'Minus') {
        MusicManager.setVolume(MusicManager.getVolume() - 0.05);
      }
      if (e.code === 'BracketRight' || e.code === 'Equal') {
        MusicManager.setVolume(MusicManager.getVolume() + 0.05);
      }

      // ЧИТ-КЛАВИШИ:
      if (e.code === 'KeyC') this.cheatClearLevel(); // Мгновенная очистка поля
      if (e.code === 'KeyL') this.lives++;            // +1 жизнь
      if (e.code === 'KeyN') this.advanceLevel();     // След. уровень
      if (e.code === 'KeyH') this.toggleDifficulty(); // Смена сложности

      // Переключение экранов для отладки
      if (e.code === 'Digit1') this.setState(GameState.LOGO);
      if (e.code === 'Digit2') this.setState(GameState.TITLE);
      if (e.code === 'Digit3') this.setState(GameState.MENU);
      if (e.code === 'Digit4') this.setState(GameState.INTRO);
      if (e.code === 'Digit5') this.setState(GameState.LEVEL_START);
      if (e.code === 'Digit6') this.setState(GameState.PLAYING);
      if (e.code === 'Digit7') this.setState(GameState.GAMEOVER);
      if (e.code === 'Digit8') this.setState(GameState.VICTORY);
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
      if (e.code === 'Space') this.keys.space = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.state !== GameState.PLAYING) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const mouseCanvasX = (e.clientX - rect.left) * scaleX;

      const targetX = mouseCanvasX - this.paddle.width / 2;
      this.paddle.x = Math.max(this.arena.left, Math.min(this.arena.right - this.paddle.width, targetX));
    });

    this.canvas.addEventListener('click', () => {
      MusicManager.unlock();
      if (this.state === GameState.TITLE && !this.isTitleActivated) {
        this.activateTitleScreen();
        return;
      }
      this.handleActionKey();
    });
  }

  /**
   * Активация титульного экрана по первому действию пользователя
   */
  activateTitleScreen() {
    this.isTitleActivated = true;
    SoundManager.playUiClick();

    // Запуск фонового видео
    const titleVideo = Assets.getVideo('title-screen-video') || Assets.getVideo('title-screen.mp4');
    if (titleVideo) {
      titleVideo.currentTime = 0;
      titleVideo.play().catch(() => { });
    }

    // Запуск фоновой музыки титульного экрана
    MusicManager.syncWithGameState(GameState.TITLE, this.currentWorld, 0.6);
  }

  /**
   * Нажатие кнопки действия (Пробел / Клик)
   */
  handleActionKey() {
    switch (this.state) {
      case GameState.LOGO:
        // Пропуск лого-заставки по нажатию
        this.logoAlpha = 0;
        this.logoTimer = this.logoDuration;
        SoundManager.playUiClick();
        this.setState(GameState.TITLE);
        break;
      case GameState.TITLE:
        if (!this.isTitleActivated) {
          this.activateTitleScreen();
        } else {
          SoundManager.playUiClick();
          this.setState(GameState.MENU);
        }
        break;
      case GameState.MENU:
        SoundManager.playUiClick();
        // Сбрасываем прогресс кампании перед новой игрой (на случай возврата с Game Over)
        this.resetGame();
        this.setState(GameState.INTRO, {
          intro: {
            speaker: BIOMES_DATA[1].intro.speaker,
            text: BIOMES_DATA[1].intro.text,
            biomeTitle: BIOMES_DATA[1].intro.title
          }
        });
        break;
      case GameState.INTRO:
      case GameState.LEVEL_START:
        SoundManager.playUiClick();
        this.setState(GameState.PLAYING);
        break;
      case GameState.PLAYING:
        if (this.ball.isStuck) {
          this.ball.isStuck = false;
          SoundManager.playPaddleHit();
        }
        break;
      case GameState.GAMEOVER:
        // После Game Over — возврат на главный (титульный) экран
        SoundManager.playUiClick();
        this.isTitleActivated = false;
        this.setState(GameState.TITLE);
        break;
      case GameState.VICTORY:
        // После экрана Победы — запуск финальных титров
        SoundManager.playUiClick();
        this.setState(GameState.CREDITS);
        break;
      case GameState.CREDITS:
        // Нажатие пробела/клика на титрах — возврат на главный экран
        SoundManager.playUiClick();
        this.isTitleActivated = false;
        this.setState(GameState.TITLE);
        break;
      case GameState.PAUSED:
        SoundManager.playPauseOut();
        this.setState(GameState.PLAYING);
        break;
    }
  }

  togglePause() {
    if (this.state === GameState.PLAYING) {
      SoundManager.playPauseIn();
      this.setState(GameState.PAUSED);
    } else if (this.state === GameState.PAUSED) {
      SoundManager.playPauseOut();
      this.setState(GameState.PLAYING);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  loop(currentTime) {
    if (!this.isRunning) return;

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  // =========================================================================
  // ОБНОВЛЕНИЕ ЛОГИКИ (UPDATE)
  // =========================================================================

  update(dt) {
    this.updateParallaxCamera(dt);

    if (this.state === GameState.LOGO) {
      this.updateLogo(dt);
    } else if (this.state === GameState.TITLE) {
      this.titleBlinkTimer += dt;
    } else if (this.state === GameState.CREDITS) {
      this.updateCredits(dt);
    } else if (this.state === GameState.PLAYING) {
      this.updatePlaying(dt);
    }
  }

  /**
   * Логика fade-in / показ / fade-out лого-заставки
   */
  updateLogo(dt) {
    this.logoTimer += dt;
    const t = this.logoTimer;

    const fadeInEnd = 0.6;   // 0s — 0.6s: fade-in
    const holdEnd = 1.8;   // 0.6s — 1.8s: показ
    const fadeOutEnd = this.logoDuration; // 1.8s — 2.8s: fade-out

    if (t < fadeInEnd) {
      this.logoAlpha = t / fadeInEnd;
    } else if (t < holdEnd) {
      this.logoAlpha = 1;
    } else if (t < fadeOutEnd) {
      this.logoAlpha = 1 - (t - holdEnd) / (fadeOutEnd - holdEnd);
    } else {
      // Автоматически переходим на Title Screen
      this.logoAlpha = 0;
      this.setState(GameState.TITLE);
    }
  }

  updateParallaxCamera(dt) {
    const playWidth = this.arena.right - this.paddle.width - this.arena.left;
    const currentPaddleOffset = this.paddle.x - this.arena.left;
    const targetRatio = playWidth > 0 ? currentPaddleOffset / playWidth : 0.5;
    const clampedTarget = Math.max(0, Math.min(1, targetRatio));

    const lerpSpeed = 5.0;
    this.cameraRatio += (clampedTarget - this.cameraRatio) * Math.min(1, dt * lerpSpeed);
  }

  updatePlaying(dt) {
    if (this.levelClearBannerTimer > 0) {
      this.levelClearBannerTimer -= dt;
    }

    for (const brick of this.bricks) {
      brick.update(dt);
    }

    // Логика движения и таймеров босса (X-3)
    if (this.boss && !this.boss.isDefeated) {
      if (this.boss.flashTimer > 0) {
        this.boss.flashTimer = Math.max(0, this.boss.flashTimer - dt);
      }

      // Плавное циклическое движение (патрулирование)
      const speed = this.boss.patrolSpeed || 70;
      const dir = this.boss.patrolDirection || 1;
      const minX = Math.max(this.arena.left + 15, this.boss.baseX - (this.boss.patrolDistance || 80));
      const maxX = Math.min(this.arena.right - 15 - this.boss.width, this.boss.baseX + (this.boss.patrolDistance || 80));

      this.boss.x += speed * dir * dt;

      if (this.boss.x >= maxX) {
        this.boss.x = maxX;
        this.boss.patrolDirection = -1;
      } else if (this.boss.x <= minX) {
        this.boss.x = minX;
        this.boss.patrolDirection = 1;
      }
    }

    // Движение ракетки
    if (this.keys.left) this.paddle.x -= this.paddle.speed * dt;
    if (this.keys.right) this.paddle.x += this.paddle.speed * dt;

    this.paddle.x = Math.max(
      this.arena.left,
      Math.min(this.arena.right - this.paddle.width, this.paddle.x)
    );

    // Движение мяча
    if (this.ball.isStuck) {
      this.ball.x = this.paddle.x + this.paddle.width / 2;
      this.ball.y = this.paddle.y - this.ball.radius - 2;
    } else {
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;

      // 1. Отскоки от стен
      if (this.ball.x - this.ball.radius <= this.arena.left) {
        this.ball.x = this.arena.left + this.ball.radius;
        this.ball.vx = Math.abs(this.ball.vx);
        SoundManager.playWallHit();
      }
      if (this.ball.x + this.ball.radius >= this.arena.right) {
        this.ball.x = this.arena.right - this.ball.radius;
        this.ball.vx = -Math.abs(this.ball.vx);
        SoundManager.playWallHit();
      }
      if (this.ball.y - this.ball.radius <= this.arena.top) {
        this.ball.y = this.arena.top + this.ball.radius;
        this.ball.vy = Math.abs(this.ball.vy);
        SoundManager.playWallHit();
      }

      // 2. Столкновения с блоками
      for (const brick of this.bricks) {
        if (brick.isDestroyed) continue;

        const closestX = Math.max(brick.x, Math.min(brick.x + brick.width, this.ball.x));
        const closestY = Math.max(brick.y, Math.min(brick.y + brick.height, this.ball.y));
        const distX = this.ball.x - closestX;
        const distY = this.ball.y - closestY;
        const distanceSq = distX * distX + distY * distY;

        if (distanceSq <= this.ball.radius * this.ball.radius) {
          const result = brick.hit();
          SoundManager.playBlockHit(brick.type, result.hpBefore, result.hpAfter);

          if (result.score > 0) {
            this.score += Math.round(result.score * this.difficultySettings.scoreMultiplier);
          }

          const overlapX = this.ball.radius - Math.abs(distX);
          const overlapY = this.ball.radius - Math.abs(distY);

          if (overlapX < overlapY) {
            this.ball.vx = distX >= 0 ? Math.abs(this.ball.vx) : -Math.abs(this.ball.vx);
            this.ball.x = closestX + (distX >= 0 ? this.ball.radius : -this.ball.radius);
          } else {
            this.ball.vy = distY >= 0 ? Math.abs(this.ball.vy) : -Math.abs(this.ball.vy);
            this.ball.y = closestY + (distY >= 0 ? this.ball.radius : -this.ball.radius);
          }

          this.checkLevelComplete();
          break;
        }
      }

      // 3. Столкновение с боссом (X-3)
      if (this.boss && !this.boss.isDefeated) {
        const closestX = Math.max(this.boss.x, Math.min(this.boss.x + this.boss.width, this.ball.x));
        const closestY = Math.max(this.boss.y, Math.min(this.boss.y + this.boss.height, this.ball.y));
        const distX = this.ball.x - closestX;
        const distY = this.ball.y - closestY;
        const distanceSq = distX * distX + distY * distY;

        if (distanceSq <= this.ball.radius * this.ball.radius) {
          this.boss.hp--;
          this.boss.flashTimer = 0.16; // Вспышка урона 160мс
          this.score += 150;

          if (this.boss.hp <= 0) {
            this.boss.isDefeated = true;
            this.score += 2000;
            SoundManager.playBossDeath();
          } else {
            SoundManager.playPaddleHit();
          }

          const overlapX = this.ball.radius - Math.abs(distX);
          const overlapY = this.ball.radius - Math.abs(distY);

          if (overlapX < overlapY) {
            this.ball.vx = distX >= 0 ? Math.abs(this.ball.vx) : -Math.abs(this.ball.vx);
            this.ball.x = closestX + (distX >= 0 ? this.ball.radius : -this.ball.radius);
          } else {
            this.ball.vy = distY >= 0 ? Math.abs(this.ball.vy) : -Math.abs(this.ball.vy);
            this.ball.y = closestY + (distY >= 0 ? this.ball.radius : -this.ball.radius);
          }

          this.checkLevelComplete();
        }
      }

      // 4. Столкновение с ракеткой
      if (
        this.ball.vy > 0 &&
        this.ball.y + this.ball.radius >= this.paddle.y &&
        this.ball.y - this.ball.radius <= this.paddle.y + this.paddle.height &&
        this.ball.x >= this.paddle.x - this.ball.radius &&
        this.ball.x <= this.paddle.x + this.paddle.width + this.ball.radius
      ) {
        this.ball.y = this.paddle.y - this.ball.radius;
        SoundManager.playPaddleHit();

        const hitOffset = (this.ball.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2);
        const clampedHit = Math.max(-0.9, Math.min(0.9, hitOffset));
        const maxBounceAngle = (75 * Math.PI) / 180;
        const bounceAngle = clampedHit * maxBounceAngle;

        const currentSpeed = Math.hypot(this.ball.vx, this.ball.vy);
        this.ball.vx = currentSpeed * Math.sin(bounceAngle);
        this.ball.vy = -currentSpeed * Math.cos(bounceAngle);
      }

      // 5. Пропасть (потеря жизни)
      if (this.ball.y - this.ball.radius > this.arena.bottom) {
        this.onBallLost();
      }
    }
  }

  // =========================================================================
  // ОТРИСОВКА (RENDER)
  // =========================================================================

  render() {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);

    // На экранах LOGO и TITLE не нужны фон арены и HUD
    if (this.state === GameState.LOGO) {
      this.renderLogo();
      return;
    }
    if (this.state === GameState.TITLE) {
      this.renderTitle();
      return;
    }

    this.renderParallaxBackground();
    this.renderSideHUD();

    switch (this.state) {
      case GameState.MENU:
        this.renderMenu();
        break;
      case GameState.INTRO:
        this.renderIntro();
        break;
      case GameState.LEVEL_START:
        this.renderLevelStart();
        break;
      case GameState.PLAYING:
        this.renderPlaying();
        break;
      case GameState.PAUSED:
        this.renderPlaying();
        this.renderPausedOverlay();
        break;
      case GameState.GAMEOVER:
        this.renderPlaying();
        this.renderGameOverOverlay();
        break;
      case GameState.VICTORY:
        this.renderPlaying();
        this.renderVictoryOverlay();
        break;
      case GameState.CREDITS:
        this.renderCredits();
        break;
    }
  }

  renderParallaxBackground() {
    const { ctx, width, height } = this;
    const biome = LevelManager.getBiomeData(this.currentWorld);
    const colors = biome?.fallbackColors || { top: '#0f172a', bottom: '#020617', arena: '#0b1120' };

    // 1. Базовый цветной градиент-заглушка (гарантирует отсутствие пустот при задержке загрузки или медленной сети)
    const baseGradient = ctx.createLinearGradient(0, 0, 0, height);
    baseGradient.addColorStop(0, colors.top);
    baseGradient.addColorStop(1, colors.bottom);
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, width, height);

    // Подложка под саму арену
    ctx.fillStyle = colors.arena;
    ctx.fillRect(
      this.arena.left,
      this.arena.top,
      this.arena.right - this.arena.left,
      this.arena.bottom - this.arena.top
    );

    // 2. Наложение фонового изображения биома с параллаксом (если загружено)
    const bg = Assets.getImage(biome.bgKey);

    if (bg) {
      const maxOffset = this.bgRenderWidth - width;
      const baseOffset = -maxOffset / 2;
      const parallaxFactor = 0.2;
      const parallaxShift = (this.cameraRatio - 0.5) * (maxOffset * parallaxFactor);
      const bgX = baseOffset - parallaxShift;

      ctx.drawImage(bg, bgX, 0, this.bgRenderWidth, this.bgRenderHeight);
    }

    // Затемнение боковин
    ctx.fillStyle = 'rgba(7, 11, 20, 0.6)';
    ctx.fillRect(0, 0, this.arena.x, height);
    ctx.fillRect(this.arena.x + this.arena.width, 0, width - (this.arena.x + this.arena.width), height);
    ctx.fillRect(this.arena.x, 0, this.arena.width, this.arena.y);
    ctx.fillRect(this.arena.x, this.arena.bottom, this.arena.width, height - this.arena.bottom);

    // Затемнение арены
    ctx.fillStyle = 'rgba(10, 15, 26, 0.30)';
    ctx.fillRect(
      this.arena.left,
      this.arena.top,
      this.arena.right - this.arena.left,
      this.arena.bottom - this.arena.top
    );
  }

  renderPlaying() {
    const { ctx } = this;

    // 1. Блоки
    for (const brick of this.bricks) {
      brick.render(ctx);
    }

    // 2. Босс (X-3)
    if (this.boss && !this.boss.isDefeated) {
      this.renderBoss(ctx);
    }

    // 3. Стены
    this.renderArenaWalls();

    // 4. Ракетка
    const paddleImg = Assets.getImage('character-paddle');
    if (paddleImg) {
      ctx.drawImage(paddleImg, this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);
    } else {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);
    }

    // 5. Мяч
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = 'rgba(254, 240, 138, 0.9)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 6. Подсказка
    if (this.ball.isStuck) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ПРОБЕЛ / КЛИК — ЗАПУСК МЯЧА', this.width / 2, this.paddle.y - 30);
    }

    // 7. Баннер прохождения
    if (this.levelClearBannerTimer > 0) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('УРОВЕНЬ ПРОЙДЕН!', this.width / 2, this.arena.top + 200);
    }
  }

  renderBoss(ctx) {
    const { x, y, width, height, flashTimer, world } = this.boss;

    ctx.save();

    // 1. Отрисовка спрайта босса
    const bossImg = Assets.getImage(`boss-${world}`) || Assets.getImage(`B-${world}.png`);

    if (bossImg) {
      if (flashTimer > 0) {
        // Эффект вспышки строго по непрозрачным пикселям текстуры (без прямоугольной рамки):
        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const offCtx = offscreen.getContext('2d');
        offCtx.imageSmoothingEnabled = false;

        // Рисуем базовый спрайт
        offCtx.drawImage(bossImg, 0, 0, width, height);

        // Накладываем красный цвет ТОЛЬКО по существующим непрозрачным пикселям
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        offCtx.fillRect(0, 0, width, height);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offscreen, x, y);
      } else {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bossImg, x, y, width, height);
      }
    } else {
      // Запасной вариант (фоллбек), если изображение еще не подгрузилось
      ctx.fillStyle = flashTimer > 0 ? '#ef4444' : '#7f1d1d';
      ctx.fillRect(x, y, width, height);
    }

    ctx.restore();
  }

  renderArenaWalls() {
    const { ctx } = this;
    const { x, y, width, height, wallThickness } = this.arena;

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;

    ctx.fillRect(x, y, wallThickness, height);
    ctx.strokeRect(x, y, wallThickness, height);

    ctx.fillRect(x + width - wallThickness, y, wallThickness, height);
    ctx.strokeRect(x + width - wallThickness, y, wallThickness, height);

    ctx.fillRect(x, y, width, wallThickness);
    ctx.strokeRect(x, y, width, wallThickness);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + wallThickness - 3, y + wallThickness, 3, height - wallThickness);
    ctx.fillRect(x + width - wallThickness, y + wallThickness, 3, height - wallThickness);
    ctx.fillRect(x + wallThickness, y + wallThickness - 3, width - wallThickness * 2, 3);
  }

  renderSideHUD() {
    const { ctx, width } = this;
    const biome = LevelManager.getBiomeData(this.currentWorld);

    // =========================================================================
    // ПАРАМЕТР ШРИФТА БОКОВЫХ ПАНЕЛЕЙ:
    // Изменяйте HUD_FONT_SIZE для масштабирования всего текста на боковых панелях
    // =========================================================================
    const HUD_FONT_SIZE = 13; // Базовый единый размер шрифта для всех надписей в панелях
    const hudFontRegular = `${HUD_FONT_SIZE}px "Press Start 2P", monospace`;
    const hudFontBold = `bold ${HUD_FONT_SIZE}px "Press Start 2P", monospace`;
    const lineGap = HUD_FONT_SIZE + 10; // Отступ между строками

    // -------------------------------------------------------------------------
    // ЛЕВАЯ ПАНЕЛЬ
    // -------------------------------------------------------------------------
    const leftX = 40;
    ctx.textAlign = 'left';

    // 1. СЧЕТ
    ctx.fillStyle = '#94a3b8';
    ctx.font = hudFontRegular;
    ctx.fillText('СЧЕТ', leftX, 70);

    ctx.fillStyle = '#fbbf24';
    ctx.font = hudFontBold;
    ctx.fillText(`${this.score}`, leftX, 70 + lineGap);

    // 2. БИОМ И НАЗВАНИЕ (без надписи "ЛОКАЦИЯ")
    const biomeStartY = 160;
    ctx.fillStyle = '#38bdf8';
    ctx.font = hudFontBold;
    ctx.fillText(`БИОМ ${this.currentWorld}`, leftX, biomeStartY);

    ctx.fillStyle = '#f8fafc';
    ctx.font = hudFontRegular;
    this.renderWrappedText(biome.name, leftX, biomeStartY + lineGap, 220, HUD_FONT_SIZE + 6);

    ctx.fillStyle = '#34d399';
    ctx.font = hudFontRegular;
    const sublevelTitle = LevelManager.getSublevelTitle(this.currentWorld, this.currentLevel);
    this.renderWrappedText(sublevelTitle, leftX, biomeStartY + lineGap * 2.2, 220, HUD_FONT_SIZE + 6);

    // 3. СЛОЖНОСТЬ (вместо "РЕЖИМ")
    const diffStartY = 330;
    ctx.fillStyle = '#94a3b8';
    ctx.font = hudFontRegular;
    ctx.fillText('СЛОЖНОСТЬ', leftX, diffStartY);

    ctx.fillStyle = this.difficulty === Difficulty.HARDCORE ? '#ef4444' : '#22c55e';
    ctx.font = hudFontBold;
    ctx.fillText(this.difficultySettings.name, leftX, diffStartY + lineGap);

    // -------------------------------------------------------------------------
    // ПРАВАЯ ПАНЕЛЬ
    // -------------------------------------------------------------------------
    const rightX = width - 40;
    ctx.textAlign = 'right';

    // 1. ЖИЗНИ
    ctx.fillStyle = '#94a3b8';
    ctx.font = hudFontRegular;
    ctx.fillText('ЖИЗНИ', rightX, 70);

    ctx.fillStyle = '#ef4444';
    ctx.font = hudFontBold;
    const hearts = '❤️ '.repeat(Math.max(0, this.lives));
    ctx.fillText(hearts || '☠️', rightX, 70 + lineGap);

    // (Надпись "УРОВЕНЬ Х-Х" удалена)

    // 2. БОСС И ПОЛОСКА HP (на уровне середины экрана, без имени и цифр HP)
    if (this.boss && !this.boss.isDefeated) {
      const bossPanelW = 210;
      const bossPanelX = width - 40 - bossPanelW;
      const bossCenterY = 360; // Примерно середина экрана по высоте (высота холста 720)

      ctx.textAlign = 'right';
      ctx.fillStyle = '#f87171';
      ctx.font = hudFontBold;
      ctx.fillText('БОСС', rightX, bossCenterY);

      // Полоса здоровья (без имени и цифр HP)
      const barH = 14;
      const barY = bossCenterY + 14;

      // Фон полосы
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(bossPanelX, barY, bossPanelW, barH);

      const fillRatio = Math.max(0, Math.min(1, this.boss.hp / this.boss.maxHp));
      let barColor = '#22c55e';
      if (fillRatio < 0.3) {
        barColor = '#ef4444';
      } else if (fillRatio < 0.6) {
        barColor = '#eab308';
      }

      ctx.fillStyle = barColor;
      ctx.fillRect(bossPanelX + 1, barY + 1, Math.max(0, (bossPanelW - 2) * fillRatio), barH - 2);

      // Рамка полосы HP
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bossPanelX, barY, bossPanelW, barH);
    }
    // Подсказка управления движением
    ctx.fillStyle = '#64748b';
    ctx.font = hudFontRegular;
    ctx.textAlign = 'right';
    ctx.fillText('A / D — ДВИЖЕНИЕ', rightX, 638);

    // 3. Подсказка внизу: только ESC — ПАУЗА (описание читов убрано, читы активны)
    ctx.fillStyle = '#64748b';
    ctx.font = hudFontRegular;
    ctx.textAlign = 'right';
    ctx.fillText('ESC — ПАУЗА', rightX, 662);
  }

  /**
   * Лого-заставка разработчика с плавным fade-in/fade-out
   */
  renderLogo() {
    const { ctx, width, height } = this;

    // Белый фон для экрана логотипа
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const logo = Assets.getImage('intro-logo');
    if (logo) {
      const maxW = 640;
      const maxH = 400;
      const aspect = logo.naturalWidth / logo.naturalHeight;
      let drawW = maxW;
      let drawH = drawW / aspect;
      if (drawH > maxH) { drawH = maxH; drawW = drawH * aspect; }

      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      ctx.globalAlpha = Math.max(0, Math.min(1, this.logoAlpha));
      ctx.drawImage(logo, drawX, drawY, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Титульный экран с названием игры, анимированным текстом и мигающей подсказкой
   */
  renderTitle() {
    const { ctx, width, height } = this;

    // 1. Если экран еще не активирован (до нажатия клавиши или клика):
    // Всегда сначала отрисовываем базовый цветной фон-заглушку, затем накладываем изображение
    const titleBaseGradient = ctx.createLinearGradient(0, 0, 0, height);
    titleBaseGradient.addColorStop(0, '#0c1527');
    titleBaseGradient.addColorStop(1, '#030712');
    ctx.fillStyle = titleBaseGradient;
    ctx.fillRect(0, 0, width, height);

    if (!this.isTitleActivated) {
      const bg = Assets.getImage('title-screen-bg') || Assets.getImage('title-screen.png');
      if (bg) {
        ctx.drawImage(bg, 0, 0, width, height);
      }

      // Текст названия игры и подсказка для старта
      const pulse = Math.sin(this.titleBlinkTimer * 1.4) * 0.5 + 0.5; // 0..1
      const r = Math.round(251 + (255 - 251) * pulse);
      const g = Math.round(191 + (215 - 191) * pulse);
      const b = Math.round(36 + (0 - 36) * pulse);

      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.75)`;
      ctx.shadowBlur = 24 + pulse * 12;

      ctx.textAlign = 'center';
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.font = '40px "Press Start 2P", monospace';
      ctx.fillText('ПРИКЛЮЧЕНИЯ', width / 2, height / 2 - 55);
      ctx.fillText('ЛАЗЕЙКИ', width / 2, height / 2 + 15);

      ctx.shadowBlur = 0;

      // Мигающая подсказка о начале игры
      const blinkVisible = Math.floor(this.titleBlinkTimer * 1.8) % 2 === 0;
      if (blinkVisible) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillText('НАЖМИТЕ ЛЮБУЮ КЛАВИШУ', width / 2, height / 2 + 100);
      }
      return;
    }

    // 2. После клика / нажатия: запускается фоновое видео title-screen.mp4
    const video = Assets.getVideo('title-screen-video') || Assets.getVideo('title-screen.mp4');
    let hasBg = false;

    if (video) {
      if (video.paused) {
        video.play().catch(() => { });
      }
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, width, height);
        hasBg = true;
      }
    }

    if (!hasBg) {
      const bg = Assets.getImage('title-screen-bg') || Assets.getImage('title-screen.png');
      if (bg) {
        ctx.drawImage(bg, 0, 0, width, height);
        hasBg = true;
      }
    }

    // Мягкое переливание цвета заголовка: золото <-> янтарь
    const pulse = Math.sin(this.titleBlinkTimer * 1.4) * 0.5 + 0.5; // 0..1
    const r = Math.round(251 + (255 - 251) * pulse);
    const g = Math.round(191 + (215 - 191) * pulse);
    const b = Math.round(36 + (0 - 36) * pulse);

    // Тень / glow
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.65)`;
    ctx.shadowBlur = 24 + pulse * 12;

    ctx.textAlign = 'center';
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.font = '40px "Press Start 2P", monospace';
    ctx.fillText('ПРИКЛЮЧЕНИЯ', width / 2, height / 2 - 55);
    ctx.fillText('ЛАЗЕЙКИ', width / 2, height / 2 + 15);

    ctx.shadowBlur = 0;

    // Мигающая надпись «Нажмите пробел для продолжения»
    const blinkVisible = Math.floor(this.titleBlinkTimer * 1.8) % 2 === 0;
    if (blinkVisible) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText('НАЖМИТЕ ПРОБЕЛ', width / 2, height / 2 + 100);
    }
  }

  renderMenu() {
    const { ctx, width, height } = this;

    // Базовая фоновая заглушка для меню
    const menuBaseGradient = ctx.createLinearGradient(0, 0, 0, height);
    menuBaseGradient.addColorStop(0, '#0f172a');
    menuBaseGradient.addColorStop(1, '#020617');
    ctx.fillStyle = menuBaseGradient;
    ctx.fillRect(0, 0, width, height);

    const video = Assets.getVideo('title-screen-video') || Assets.getVideo('title-screen.mp4');
    let hasBg = false;

    if (video) {
      if (video.paused) {
        video.play().catch(() => { });
      }
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, width, height);
        hasBg = true;
      }
    }

    if (!hasBg) {
      const titleBg = Assets.getImage('title-screen-bg');
      if (titleBg) {
        ctx.drawImage(titleBg, 0, 0, width, height);
        hasBg = true;
      }
    }

    if (hasBg) {
      ctx.fillStyle = 'rgba(8, 11, 17, 0.72)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = 'rgba(11, 14, 20, 0.88)';
      ctx.fillRect(0, 0, width, height);
    }

    // =========================================================================
    // ПАРАМЕТРЫ РАЗМЕРА ШРИФТОВ МЕНЮ ВЫБОРА СЛОЖНОСТИ:
    // MENU_FONT_BASE - базовый размер шрифта для элементов меню (увеличен)
    // =========================================================================
    const MENU_FONT_BASE = 16; // Было 12-13px. Можно менять (например, 14..20)
    const titleSize = Math.round(MENU_FONT_BASE * 1.85); // ~30px
    const subSize = Math.round(MENU_FONT_BASE * 0.95);   // ~15px
    const diffSize = MENU_FONT_BASE;                     // ~16px
    const actionSize = Math.round(MENU_FONT_BASE * 1.15); // ~18px

    ctx.textAlign = 'center';

    // Заголовок игры
    ctx.fillStyle = '#fbbf24';
    ctx.font = `${titleSize}px "Press Start 2P", monospace`;
    ctx.fillText('ПРИКЛЮЧЕНИЯ ЛАЗЕЙКИ', width / 2, height / 2 - 95);

    // Подзаголовок кампании
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${subSize}px "Press Start 2P", monospace`;
    ctx.fillText('КАМПАНИЯ: 4 БИОМА И БОССЫ', width / 2, height / 2 - 35);

    // Выбор сложности
    ctx.fillStyle = this.difficulty === Difficulty.HARDCORE ? '#ef4444' : '#22c55e';
    ctx.font = `bold ${diffSize}px "Press Start 2P", monospace`;
    ctx.fillText(`СЛОЖНОСТЬ: ${this.difficultySettings.name}`, width / 2, height / 2 + 22);

    // Подсказка по смене сложности
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `${Math.round(MENU_FONT_BASE * 0.75)}px "Press Start 2P", monospace`;
    ctx.fillText('(НАЖМИТЕ H ДЛЯ СМЕНЫ)', width / 2, height / 2 + 50);

    // Кнопка начала игры
    ctx.fillStyle = '#38bdf8';
    ctx.font = `${actionSize}px "Press Start 2P", monospace`;
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ ДЛЯ НАЧАЛА', width / 2, height / 2 + 105);
  }

  /**
   * Сюжетный экран катсцены (INTRO) перед новым биомом (1-1, 2-1, 3-1, 4-1)
   */
  renderIntro() {
    const { ctx, width, height } = this;
    const biome = LevelManager.getBiomeData(this.currentWorld);
    const colors = biome?.fallbackColors || { top: '#0f172a', bottom: '#020617' };

    // Базовая фоновая заглушка биома
    const introBgGradient = ctx.createLinearGradient(0, 0, 0, height);
    introBgGradient.addColorStop(0, colors.top);
    introBgGradient.addColorStop(1, colors.bottom);
    ctx.fillStyle = introBgGradient;
    ctx.fillRect(0, 0, width, height);

    const bg = Assets.getImage(biome.bgKey);

    // 1. Фоновое изображение биома (если загружено)
    if (bg) {
      ctx.drawImage(bg, 0, 0, width, height);
      ctx.fillStyle = 'rgba(8, 11, 17, 0.78)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = 'rgba(11, 14, 20, 0.90)';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Заголовок по центру экрана без слова "СЛЕДУЮЩИЙ": «УРОВЕНЬ 1-1 — ВХОД В ЧАЩУ»
    const levelTitle = LevelManager.getSublevelTitle(this.currentWorld, this.currentLevel);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
    ctx.shadowBlur = 14;
    ctx.fillText(levelTitle, width / 2, 340);
    ctx.shadowBlur = 0;

    // 3. Компактная диалоговая плашка
    const boxW = 1060;
    const boxH = 200;
    const boxX = (width - boxW) / 2;
    const boxY = height - boxH - 55; // = 465px

    const boxGradient = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
    boxGradient.addColorStop(0, '#51627dff'); // Посветлее сверху
    boxGradient.addColorStop(1, '#2d364cff'); // Потемнее снизу
    ctx.fillStyle = boxGradient;
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);

    // 4. Персонаж Лазейки (голова выглядывает на 45px выше плашки)
    const cutsceneImg = Assets.getImage('character-cutscene') || Assets.getImage('laz2') || Assets.getImage('character-paddle');
    let charWidth = 170;
    let charHeight = 220;

    if (cutsceneImg && cutsceneImg.naturalWidth && cutsceneImg.naturalHeight) {
      const charAspect = cutsceneImg.naturalWidth / cutsceneImg.naturalHeight;
      charHeight = 230;
      charWidth = charHeight * charAspect;
    }

    const charX = boxX + 24;
    const charY = boxY - 45;

    // Подложка под силуэт персонажа Лазейки
    ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
    ctx.fillRect(charX, charY, charWidth, charHeight);

    if (cutsceneImg) {
      ctx.drawImage(cutsceneImg, charX, charY, charWidth, charHeight);
    }

    // 5. Текст диалога: "ЛАЗЕЙКА: «...»" с крупным плотным шрифтом
    const textStartX = charX + charWidth + 24;
    const textStartY = boxY + 54;
    const textMaxWidth = boxW - (textStartX - boxX) - 30;
    const dialogueLine = `ЛАЗЕЙКА: «${this.introData.text}»`;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '17px "Press Start 2P", monospace';
    this.renderWrappedText(dialogueLine, textStartX, textStartY, textMaxWidth, 36);

    // 6. Кнопка продолжения
    ctx.fillStyle = '#34d399';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ПРОБЕЛ: НАЧАТЬ УРОВЕНЬ ▶', boxX + boxW - 22, boxY + boxH - 20);
  }

  /**
   * Чистый экран перехода между подуровнями внутри биома (без сюжетной плашки)
   */
  renderLevelStart() {
    const { ctx, width, height } = this;
    const biome = LevelManager.getBiomeData(this.currentWorld);
    const colors = biome?.fallbackColors || { top: '#0f172a', bottom: '#020617' };

    // Базовая фоновая заглушка биома
    const levelStartGradient = ctx.createLinearGradient(0, 0, 0, height);
    levelStartGradient.addColorStop(0, colors.top);
    levelStartGradient.addColorStop(1, colors.bottom);
    ctx.fillStyle = levelStartGradient;
    ctx.fillRect(0, 0, width, height);

    const bg = Assets.getImage(biome.bgKey);

    if (bg) {
      ctx.drawImage(bg, 0, 0, width, height);
      ctx.fillStyle = 'rgba(8, 11, 17, 0.82)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = 'rgba(11, 14, 20, 0.92)';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.textAlign = 'center';

    // Название уровня крупно: «УРОВЕНЬ X-Y — НАЗВАНИЕ»
    const levelTitle = LevelManager.getSublevelTitle(this.currentWorld, this.currentLevel);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '26px "Press Start 2P", monospace';
    ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
    ctx.shadowBlur = 14;
    ctx.fillText(levelTitle, width / 2, height / 2 - 30);
    ctx.shadowBlur = 0;

    // Локация / Биом
    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`ЛОКАЦИЯ: ${biome.name}`, width / 2, height / 2 + 20);

    // Подсказка для старта
    ctx.fillStyle = '#34d399';
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ ДЛЯ СТАРТА ▶', width / 2, height / 2 + 80);
  }

  renderPausedOverlay() {
    const { ctx, width, height } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '26px "Press Start 2P", monospace';
    ctx.fillText('ПАУЗА', width / 2, height / 2 - 15);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('НАЖМИТЕ ESC ИЛИ ПРОБЕЛ ДЛЯ ПРОДОЛЖЕНИЯ', width / 2, height / 2 + 35);
  }

  renderGameOverOverlay() {
    const { ctx, width, height } = this;
    ctx.fillStyle = 'rgba(20, 0, 0, 0.85)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillText('ИГРА ОКОНЧЕНА', width / 2, height / 2 - 25);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ, ЧТОБЫ ПОПРОБОВАТЬ СНОВА', width / 2, height / 2 + 35);
  }

  renderVictoryOverlay() {
    const { ctx, width, height } = this;
    ctx.fillStyle = 'rgba(0, 20, 10, 0.88)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#34d399';
    ctx.font = '48px "Press Start 2P", monospace';
    ctx.fillText('ПОБЕДА!', width / 2, height / 2 - 40);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillText(`ИТОГОВЫЙ СЧЕТ: ${this.score}`, width / 2, height / 2);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('ЛАЗЕЙКА НАШЛА ВЫХОД И ВСЕ СОКРОВИЩА!', width / 2, height / 2 + 40);
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ', width / 2, height / 2 + 75);
  }

  // =========================================================================
  // ЭКРАН ФИНАЛЬНЫХ ТИТРОВ
  // =========================================================================

  /**
   * Строки титров (текст выравнивается по центру)
   * @private
   */
  get _creditsLines() {
    return [
      { text: 'НАД ИГРОЙ РАБОТАЛИ', style: 'header' },
      { text: '', style: 'spacer' },
      { text: 'ГЕЙМДИЗАЙН И СЮЖЕТ:', style: 'label' },
      { text: 'АРТЁМ КОЗОРИЗ', style: 'value' },
      { text: '', style: 'spacer' },
      { text: 'РАЗРАБОТКА И КОД:', style: 'label' },
      { text: 'АРТЁМ КОЗОРИЗ / GOOGLE ANTIGRAVITY', style: 'value' },
      { text: '', style: 'spacer' },
      { text: 'ГРАФИКА И АНИМАЦИЯ:', style: 'label' },
      { text: 'АРТЁМ КОЗОРИЗ / GOOGLE GEMINI', style: 'value' },
      { text: '', style: 'spacer' },
      { text: 'ЗВУК И МУЗЫКА:', style: 'label' },
      { text: 'JUHANI JUNKALA', style: 'value' },
      { text: '', style: 'spacer' },
      { text: '', style: 'spacer' },
      { text: 'СДЕЛАНО В ЛАЙФХАКЕРЕ В 2026 ГОДУ', style: 'footer' },
      { text: '', style: 'spacer' },
      { text: 'LIFEHACKER.RU', style: 'site' },
    ];
  }

  /**
   * Обновление позиции прокрутки титров
   * @param {number} dt - дельта времени (сек)
   */
  updateCredits(dt) {
    const lineHeight = 52; // высота строки в пикселях
    const totalHeight = this._creditsLines.length * lineHeight + this.height;
    this.creditsScrollY += this.CREDITS_SCROLL_SPEED * dt;
    // После полной прокрутки — остановиться
    if (this.creditsScrollY > totalHeight) {
      this.creditsScrollY = totalHeight;
    }
  }

  /**
   * Отрисовка финальных титров:
   * притемнённое видео title-screen.mp4 в качестве фона + прокручивающийся текст
   */
  renderCredits() {
    const { ctx, width, height } = this;

    // Базовый цветной фон-заглушка под титры
    const creditsBaseGradient = ctx.createLinearGradient(0, 0, 0, height);
    creditsBaseGradient.addColorStop(0, '#0d1322');
    creditsBaseGradient.addColorStop(1, '#03050a');
    ctx.fillStyle = creditsBaseGradient;
    ctx.fillRect(0, 0, width, height);

    // 1. Фоновое видео (то же, что и на Title-экране)
    const video = Assets.getVideo('title-screen-video') || Assets.getVideo('title-screen.mp4');
    if (video) {
      if (video.paused) video.play().catch(() => { });
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, width, height);
      }
    }

    // 2. Затемнение поверх видео (CREDITS_VIDEO_DIM — параметр)
    ctx.fillStyle = `rgba(0, 0, 20, ${this.CREDITS_VIDEO_DIM})`;
    ctx.fillRect(0, 0, width, height);

    // 3. Прокручивающийся текст
    ctx.save();
    ctx.textAlign = 'center';

    const lines = this._creditsLines;
    const lineHeight = 52;
    // Начало первой строки: снизу холста → проматывается вверх
    const startY = height - this.creditsScrollY;

    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;
      // Не рисуем строки, которые вышли за пределы экрана
      if (y < -60 || y > height + 60) return;

      switch (line.style) {
        case 'header':
          ctx.font = 'bold 26px "Press Start 2P", monospace';
          ctx.fillStyle = '#fbbf24';  // золотой
          break;
        case 'label':
          ctx.font = '14px "Press Start 2P", monospace';
          ctx.fillStyle = '#94a3b8';  // серый
          break;
        case 'value':
          ctx.font = 'bold 16px "Press Start 2P", monospace';
          ctx.fillStyle = '#f1f5f9';  // белый
          break;
        case 'footer':
          ctx.font = '13px "Press Start 2P", monospace';
          ctx.fillStyle = '#64748b';  // тёмно-серый
          break;
        case 'site':
          ctx.font = 'bold 18px "Press Start 2P", monospace';
          ctx.fillStyle = '#38bdf8';  // голубой
          break;
        default:
          // spacer — пустая строка, пропускаем
          return;
      }
      ctx.fillText(line.text, width / 2, y);
    });

    ctx.restore();

    // 4. Подсказка внизу экрана
    const hintAlpha = Math.abs(Math.sin(performance.now() * 0.001));
    ctx.globalAlpha = hintAlpha * 0.7 + 0.3;
    ctx.textAlign = 'center';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ ИЛИ КЛИКНИТЕ ДЛЯ ВЫХОДА', width / 2, height - 24);
    ctx.globalAlpha = 1;
  }

  renderWrappedText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = this.ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        this.ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    this.ctx.fillText(line, x, y);
  }
}
