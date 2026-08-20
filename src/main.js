/**
 * main.js
 * Точка входа в игру «Приключения Лазейки».
 */

import Assets from './Assets.js';
import Game from './Game.js';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressText = document.getElementById('progressText');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Отключаем сглаживание для отрисовки пиксель-арта
  ctx.imageSmoothingEnabled = false;

  console.log('[Game] Начинаем загрузку ресурсов...');

  // Загружаем все ресурсы с обновлением UI
  await Assets.load((percent, item) => {
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
  });

  // Выводим требуемое сообщение в консоль
  console.log('Загрузка завершена');

  // Обновляем статус в UI
  if (statusDot) statusDot.classList.add('ready');
  if (statusText) statusText.textContent = 'Ресурсы загружены';

  // Плавно скрываем экран загрузки
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }

  // Отрисовываем стартовую сцену на Canvas: фон w-1-jungle.jpeg и character-paddle.png
  const drawInitialScene = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Фон джунглей
    const bg = Assets.getImage('w-1-jungle');
    if (bg) {
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Ракетка / Персонаж Лазейка
    const paddle = Assets.getImage('character-paddle');
    if (paddle) {
      // Сохраняем пропорции спрайта
      const paddleWidth = 140;
      const aspectRatio = paddle.height / paddle.width || 0.3;
      const paddleHeight = paddleWidth * aspectRatio;
      const paddleX = (canvas.width - paddleWidth) / 2;
      const paddleY = canvas.height - paddleHeight - 40;

      ctx.drawImage(paddle, paddleX, paddleY, paddleWidth, paddleHeight);
    }
  };

  drawInitialScene();

  // Создаем и инициализируем основной экземпляр игры
  const game = new Game(canvas);
  game.init();
  game.start();
});
