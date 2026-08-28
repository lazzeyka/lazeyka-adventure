/**
 * main.js
 * Точка входа в игру «Приключения Лазейки».
 */

import Assets from './Assets.js';
import Game from './Game.js';
import MusicManager from './MusicManager.js';
import SoundManager from './SoundManager.js';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressText = document.getElementById('progressText');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // UI элементы управления звуком
  const muteBtn = document.getElementById('muteBtn');
  const muteIcon = document.getElementById('muteIcon');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');

  // Синхронизация UI громкости
  const updateAudioUI = (volume, isMuted) => {
    if (volumeSlider) {
      volumeSlider.value = Math.round(volume * 100);
    }
    if (volumeValue) {
      volumeValue.textContent = isMuted ? 'ВЫКЛ' : `${Math.round(volume * 100)}%`;
    }
    if (muteIcon) {
      muteIcon.textContent = isMuted || volume === 0 ? '🔇' : (volume < 0.4 ? '🔉' : '🔊');
    }
    if (muteBtn) {
      muteBtn.classList.toggle('muted', isMuted || volume === 0);
    }
  };

  MusicManager.addListener(updateAudioUI);

  if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      MusicManager.unlock();
      SoundManager.playUiClick();
      MusicManager.toggleMute();
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      MusicManager.unlock();
      const val = parseFloat(e.target.value) / 100;
      if (MusicManager.isMuted()) {
        MusicManager.setMuted(false);
      }
      MusicManager.setVolume(val);
    });
  }

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

  // Доступ к экземпляру игры и менеджерам звука в консоли браузера для удобной отладки
  window.__game = game;
  window.__musicManager = MusicManager;
  window.__soundManager = SoundManager;
});
