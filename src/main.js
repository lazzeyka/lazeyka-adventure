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

  // Отключаем сглаживание для отрисовки четкого пиксель-арта
  ctx.imageSmoothingEnabled = false;

  console.log('[Game] Начинаем предзагрузку ресурсов...');

  // Загружаем все ресурсы с обновлением UI
  await Assets.load((percent, item) => {
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
  });

  console.log('Загрузка завершена');

  // Обновляем статус в UI
  if (statusDot) statusDot.classList.add('ready');
  if (statusText) statusText.textContent = 'Готово к игре';

  // Плавно скрываем экран загрузки
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }

  // Создаем, инициализируем и запускаем игру
  const game = new Game(canvas);
  game.init();
  game.start();

  // Доступ к экземпляру игры в консоли браузера для удобной отладки
  window.__game = game;
});
