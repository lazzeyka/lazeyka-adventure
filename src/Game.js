/**
 * Game.js
 * Основной игровой класс игры «Приключения Лазейки».
 * Управляет игровым циклом, State Machine, физикой мяча, платформой, сложностью и чит-командами.
 */

import Assets from './Assets.js';
import { LevelManager, Difficulty, DIFFICULTY_SETTINGS, BIOMES_DATA } from './LevelManager.js';

/**
 * Состояния экранов игры
 * @readonly
 * @enum {string}
 */
export const GameState = Object.freeze({
  MENU: 'MENU',                 // Главное меню
  INTRO: 'INTRO',               // Сюжетная катсцена перед новым биомом (1-1, 2-1, 3-1, 4-1)
  LEVEL_START: 'LEVEL_START',   // Чистый экран перехода между подуровнями (1-2, 1-3, ...)
  PLAYING: 'PLAYING',           // Игровой процесс (Арканоид)
  PAUSED: 'PAUSED',             // Пауза
  GAMEOVER: 'GAMEOVER',         // Поражение
  VICTORY: 'VICTORY'            // Финальная победа
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

    // Состояние экранов
    this.state = GameState.PLAYING;
    this.previousState = null;

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
    const arenaY = 35;

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
      y: this.arena.bottom - 44,
      width: this.difficultySettings.paddleWidth,
      height: 28,
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
  }

  /**
   * Загрузка уровня через LevelManager
   */
  loadLevel() {
    this.resetBallOnPaddle();
    const { bricks, boss } = LevelManager.generateLevel(this.currentWorld, this.currentLevel, this.arena);
    this.bricks = bricks;
    this.boss = boss;
  }

  /**
   * Переключение сложности («Прогулка» <-> «Хардкор»)
   */
  toggleDifficulty() {
    this.difficulty = this.difficulty === Difficulty.WALK ? Difficulty.HARDCORE : Difficulty.WALK;
    console.log(`[Game] Сложность: ${this.difficultySettings.name}`);

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
  }

  /**
   * Потеря мяча (падение в пропасть)
   */
  onBallLost() {
    this.lives--;
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
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = true;

      if (e.code === 'Space') {
        this.keys.space = true;
        this.handleActionKey();
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.togglePause();
      }

      // ЧИТ-КЛАВИШИ:
      if (e.code === 'KeyC') this.cheatClearLevel(); // Мгновенная очистка поля
      if (e.code === 'KeyL') this.lives++;            // +1 жизнь
      if (e.code === 'KeyN') this.advanceLevel();     // След. уровень
      if (e.code === 'KeyH') this.toggleDifficulty(); // Смена сложности

      // Переключение экранов для отладки
      if (e.code === 'Digit1') this.setState(GameState.MENU);
      if (e.code === 'Digit2') this.setState(GameState.INTRO);
      if (e.code === 'Digit3') this.setState(GameState.LEVEL_START);
      if (e.code === 'Digit4') this.setState(GameState.PLAYING);
      if (e.code === 'Digit5') this.setState(GameState.GAMEOVER);
      if (e.code === 'Digit6') this.setState(GameState.VICTORY);
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
      this.handleActionKey();
    });
  }

  /**
   * Нажатие кнопки действия (Пробел / Клик)
   */
  handleActionKey() {
    switch (this.state) {
      case GameState.MENU:
        this.setState(GameState.INTRO);
        break;
      case GameState.INTRO:
      case GameState.LEVEL_START:
        this.setState(GameState.PLAYING);
        break;
      case GameState.PLAYING:
        if (this.ball.isStuck) this.ball.isStuck = false;
        break;
      case GameState.GAMEOVER:
      case GameState.VICTORY:
        this.setState(GameState.PLAYING, { reset: true });
        break;
      case GameState.PAUSED:
        this.setState(GameState.PLAYING);
        break;
    }
  }

  togglePause() {
    if (this.state === GameState.PLAYING) this.setState(GameState.PAUSED);
    else if (this.state === GameState.PAUSED) this.setState(GameState.PLAYING);
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

    if (this.state === GameState.PLAYING) {
      this.updatePlaying(dt);
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
      }
      if (this.ball.x + this.ball.radius >= this.arena.right) {
        this.ball.x = this.arena.right - this.ball.radius;
        this.ball.vx = -Math.abs(this.ball.vx);
      }
      if (this.ball.y - this.ball.radius <= this.arena.top) {
        this.ball.y = this.arena.top + this.ball.radius;
        this.ball.vy = Math.abs(this.ball.vy);
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
          this.score += 150;

          if (this.boss.hp <= 0) {
            this.boss.isDefeated = true;
            this.score += 2000;
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
    }
  }

  renderParallaxBackground() {
    const { ctx, width, height } = this;
    const biome = LevelManager.getBiomeData(this.currentWorld);
    const bg = Assets.getImage(biome.bgKey);

    if (bg) {
      const maxOffset = this.bgRenderWidth - width;
      const baseOffset = -maxOffset / 2;
      const parallaxFactor = 0.2;
      const parallaxShift = (this.cameraRatio - 0.5) * (maxOffset * parallaxFactor);
      const bgX = baseOffset - parallaxShift;

      ctx.drawImage(bg, bgX, 0, this.bgRenderWidth, this.bgRenderHeight);

      // Затемнение боковин
      ctx.fillStyle = 'rgba(7, 11, 20, 0.82)';
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
    } else {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);
    }
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
    const { x, y, width, height, hp, maxHp } = this.boss;

    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = '#fef08a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('БОСС', x + width / 2, y + 24);

    const barW = width - 20;
    const barH = 10;
    const barX = x + 10;
    const barY = y + 38;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(barX, barY, barW, barH);

    const fillRatio = Math.max(0, hp / maxHp);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(barX, barY, barW * fillRatio, barH);

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
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

    // Левая панель
    const leftX = 40;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('СЧЕТ', leftX, 70);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.fillText(`${this.score}`, leftX, 98);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('ЛОКАЦИЯ', leftX, 160);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`БИОМ ${this.currentWorld}`, leftX, 188);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '9px "Press Start 2P", monospace';
    this.renderWrappedText(biome.name, leftX, 212, 220, 18);

    ctx.fillStyle = '#34d399';
    ctx.font = '8px "Press Start 2P", monospace';
    const sublevelTitle = LevelManager.getSublevelTitle(this.currentWorld, this.currentLevel);
    this.renderWrappedText(sublevelTitle, leftX, 260, 220, 16);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('РЕЖИМ', leftX, 330);

    ctx.fillStyle = this.difficulty === Difficulty.HARDCORE ? '#ef4444' : '#22c55e';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText(this.difficultySettings.name, leftX, 356);

    // Правая панель
    const rightX = width - 40;
    ctx.textAlign = 'right';

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('ЖИЗНИ', rightX, 70);

    ctx.fillStyle = '#ef4444';
    ctx.font = '15px "Press Start 2P", monospace';
    const hearts = '❤️ '.repeat(Math.max(0, this.lives));
    ctx.fillText(hearts || '☠️', rightX, 98);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('УРОВЕНЬ', rightX, 160);

    ctx.fillStyle = '#34d399';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText(`${this.currentWorld}-${this.currentLevel}`, rightX, 190);

    // Чит-подсказки
    ctx.fillStyle = '#64748b';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('[C] ЧИТ: ОЧИСТИТЬ ПОЛЕ', leftX, 640);
    ctx.fillText('[H] СМЕНА СЛОЖНОСТИ', leftX, 662);

    ctx.textAlign = 'right';
    ctx.fillText('[L] +1 ЖИЗНЬ  [N] СЛЕД. УРОВЕНЬ', rightX, 640);
    ctx.fillText('[P] ПАУЗА', rightX, 662);
  }

  renderMenu() {
    const { ctx, width, height } = this;

    const titleBg = Assets.getImage('title-screen-bg');
    if (titleBg) {
      ctx.drawImage(titleBg, 0, 0, width, height);
      ctx.fillStyle = 'rgba(8, 11, 17, 0.72)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = 'rgba(11, 14, 20, 0.88)';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillText('ПРИКЛЮЧЕНИЯ ЛАЗЕЙКИ', width / 2, height / 2 - 80);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillText('КАМПАНИЯ: 4 БИОМА И БОССЫ', width / 2, height / 2 - 30);

    ctx.fillStyle = this.difficulty === Difficulty.HARDCORE ? '#ef4444' : '#22c55e';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`СЛОЖНОСТЬ: ${this.difficultySettings.name} (НАЖМИТЕ H ДЛЯ СМЕНЫ)`, width / 2, height / 2 + 20);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '15px "Press Start 2P", monospace';
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ ДЛЯ НАЧАЛА', width / 2, height / 2 + 80);
  }

  /**
   * Сюжетный экран катсцены (INTRO) перед новым биомом (1-1, 2-1, 3-1, 4-1)
   */
  renderIntro() {
    const { ctx, width, height } = this;
    const biome = LevelManager.getBiomeData(this.currentWorld);
    const bg = Assets.getImage(biome.bgKey);

    // 1. Фоновое изображение биома
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

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
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

    if (cutsceneImg) {
      ctx.drawImage(cutsceneImg, charX, charY, charWidth, charHeight);
    }

    // 5. Текст диалога: "Лазейка: «...»" с крупным плотным шрифтом
    const textStartX = charX + charWidth + 24;
    const textStartY = boxY + 54;
    const textMaxWidth = boxW - (textStartX - boxX) - 30;
    const dialogueLine = `Лазейка: «${this.introData.text}»`;

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
    ctx.fillText('НАЖМИТЕ P ИЛИ ПРОБЕЛ ДЛЯ ПРОДОЛЖЕНИЯ', width / 2, height / 2 + 35);
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
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillText('ПОБЕДА!', width / 2, height / 2 - 40);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillText(`ИТОГОВЫЙ СЧЕТ: ${this.score}`, width / 2, height / 2);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('ЛАЗЕЙКА НАШЛА ВЫХОД И ВСЕ СОКРОВИЩА!', width / 2, height / 2 + 40);
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ ДЛЯ НОВОЙ ИГРЫ', width / 2, height / 2 + 75);
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
