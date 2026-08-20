/**
 * Game.js
 * Основной игровой класс и цикл игры «Приключения Лазейки».
 */

import Assets from './Assets.js';

export default class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Внутреннее логическое разрешение игры (соотношение 4:3 или аркадный ретро-формат)
    this.width = canvas.width || 800;
    this.height = canvas.height || 600;

    this.isRunning = false;
    this.lastTime = 0;
    this.animationFrameId = null;

    // Состояние игры: 'loading' | 'title' | 'intro' | 'playing' | 'paused' | 'gameover' | 'victory'
    this.state = 'loading';
    
    // Текущий биом и уровень
    this.currentWorld = 1;
    this.currentLevel = 1;
    this.score = 0;
    this.lives = 3;
  }

  /**
   * Инициализация игры
   */
  init() {
    // Включаем сглаживание выключенным для чистого пиксель-арта
    this.ctx.imageSmoothingEnabled = false;
    this.setupListeners();
  }

  /**
   * Настройка обработчиков ввода
   */
  setupListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP') {
        this.togglePause();
      }
    });
  }

  /**
   * Запуск игрового цикла
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  /**
   * Остановка игрового цикла
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Пауза
   */
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  /**
   * Основной игровой цикл с подсчетом Delta Time
   * @param {DOMHighResTimeStamp} currentTime
   */
  loop(currentTime) {
    if (!this.isRunning) return;

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Ограничиваем dt
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  /**
   * Обновление игровой логики
   * @param {number} dt - Дельта времени в секундах
   */
  update(dt) {
    // Будущая логика движения ракетки, шарика, коллизий и боссов
  }

  /**
   * Отрисовка игрового кадра
   */
  render() {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);

    // Отрисовка фона биома
    const bg = Assets.getImage('w-1-jungle');
    if (bg) {
      ctx.drawImage(bg, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
    }

    // Отрисовка персонажа/ракетки по центру внизу
    const paddle = Assets.getImage('character-paddle');
    if (paddle) {
      const paddleWidth = 140;
      const paddleHeight = (paddle.height / paddle.width) * paddleWidth || 40;
      const paddleX = (width - paddleWidth) / 2;
      const paddleY = height - paddleHeight - 30;

      ctx.drawImage(paddle, paddleX, paddleY, paddleWidth, paddleHeight);
    }
  }
}
