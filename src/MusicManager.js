/**
 * MusicManager.js
 * Глобальный фоновый менеджер музыки для «Приключений Лазейки».
 * Обеспечивает:
 * - Плавные переходы (Crossfade / Fade-in / Fade-out)
 * - Уникальные треки для миров/биомов, катсцен, меню и финала
 * - Управление общей громкостью и режимом Mute с сохранением в localStorage
 * - Корректную обработку политики автовоспроизведения браузеров
 */

import Assets from './Assets.js';

const STORAGE_KEY_VOLUME = 'lazeyka_music_volume';
const STORAGE_KEY_MUTED = 'lazeyka_music_muted';

export class MusicManager {
  constructor() {
    this.currentTrackKey = null;
    this.currentAudio = null;
    this.currentGain = 1.0; // 0..1 внутренний множитель плавного перехода (Fade)

    /** @type {Array<{ audio: HTMLAudioElement, key: string, currentGain: number, startGain: number, targetGain: number, duration: number, elapsed: number }>} */
    this.fadingTracks = [];

    // =========================================================================
    // НАСТРОЙКИ ГРОМКОСТИ МУЗЫКИ:
    // musicGain: общий баланс музыки относительно звуков (0.75 = на 25% тише)
    // =========================================================================
    this.musicGain = 0.75;

    // Загрузка настроек общей громкости (по умолчанию 0.5)
    const savedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
    this.masterVolume = savedVolume !== null ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 0.5;

    const savedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
    this.isMutedState = savedMuted !== null ? savedMuted === 'true' : false;

    // =========================================================================
    // DUCK ПРИ ПАУЗЕ:
    // pauseDuckGain: текущее значение плавного приглушения (1 = норма, 0.25 = пауза)
    // pauseDuckTarget: целевое значение (меняется в duckForPause / unduck)
    // =========================================================================
    this.pauseDuckGain = 1.0;
    this.pauseDuckTarget = 1.0;
    this.pauseDuckSpeed = 4.0; // скорость интерполяции (единиц/сек; 4.0 ≈ 0.25 с)

    // Состояние разблокировки аудиоконтекста/браузера
    this.unlocked = false;
    this.pendingTrack = null;

    // Подписчики на изменение громкости/mute для синхронизации с UI
    this.listeners = new Set();

    // Запуск цикла интерполяции плавных переходов
    this.lastFrameTime = performance.now();
    this.rafId = null;
    this._startFadeLoop();

    // Автоматическая привязка обработчиков первого взаимодействия
    this._setupUnlockListeners();
  }

  /**
   * Настройка слушателей пользовательского ввода для разблокировки аудио
   */
  _setupUnlockListeners() {
    const unlockHandler = () => {
      this.unlock();
      window.removeEventListener('click', unlockHandler, true);
      window.removeEventListener('keydown', unlockHandler, true);
      window.removeEventListener('pointerdown', unlockHandler, true);
      window.removeEventListener('touchstart', unlockHandler, true);
    };

    window.addEventListener('click', unlockHandler, { once: true, capture: true });
    window.addEventListener('keydown', unlockHandler, { once: true, capture: true });
    window.addEventListener('pointerdown', unlockHandler, { once: true, capture: true });
    window.addEventListener('touchstart', unlockHandler, { once: true, capture: true });
  }

  /**
   * Разблокировать воспроизведение аудио после жеста пользователя
   */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;

    if (this.pendingTrack) {
      const { key, options } = this.pendingTrack;
      this.pendingTrack = null;
      this.play(key, options);
    }
  }

  /**
   * Добавить подписчика на изменение громкости / mute
   * @param {Function} callback (volume: number, isMuted: boolean)
   */
  addListener(callback) {
    this.listeners.add(callback);
    callback(this.masterVolume, this.isMutedState);
  }

  /**
   * Удалить подписчика
   * @param {Function} callback
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Уведомить всех подписчиков об изменении настроек звука
   */
  _notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.masterVolume, this.isMutedState);
      } catch (err) {
        console.error('[MusicManager] Ошибка в слушателе:', err);
      }
    }
  }

  /**
   * Плавно приглушить музыку при паузе (до 25% текущего уровня)
   */
  duckForPause() {
    this.pauseDuckTarget = 0.25;
  }

  /**
   * Восстановить полную громкость после паузы
   */
  unduck() {
    this.pauseDuckTarget = 1.0;
  }

  /**
   * Текущий коэффициент duck-приглушения (используется SoundManager для SFX)
   * @returns {number} 0..1
   */
  getPauseDuckGain() {
    return this.pauseDuckGain;
  }

  /**
   * Вычисление и применение эффективной громкости к аудио-элементу
   * @param {HTMLAudioElement} audio
   * @param {number} gain 0..1
   */
  _applyVolume(audio, gain) {
    if (!audio) return;
    const effective = this.isMutedState
      ? 0
      : Math.max(0, Math.min(1, this.masterVolume * this.musicGain * gain * this.pauseDuckGain));
    try {
      audio.volume = effective;
    } catch {
      // Игнорируем ограничения некоторых платформ
    }
  }

  /**
   * Применить текущую громкость ко всем активным аудио
   */
  _updateAllVolumes() {
    if (this.currentAudio) {
      this._applyVolume(this.currentAudio, this.currentGain);
    }
    for (const item of this.fadingTracks) {
      this._applyVolume(item.audio, item.currentGain);
    }
  }

  /**
   * Установить уровень общей громкости (0.0 .. 1.0)
   * @param {number} volume
   */
  setVolume(volume) {
    const clamped = Math.max(0, Math.min(1, volume));
    this.masterVolume = clamped;
    localStorage.setItem(STORAGE_KEY_VOLUME, clamped.toString());
    this._updateAllVolumes();
    this._notifyListeners();
  }

  /**
   * Получить текущий уровень громкости (0.0 .. 1.0)
   * @returns {number}
   */
  getVolume() {
    return this.masterVolume;
  }

  /**
   * Переключить режим Mute (Без звука)
   */
  toggleMute() {
    this.setMuted(!this.isMutedState);
  }

  /**
   * Установить состояние Mute
   * @param {boolean} isMuted
   */
  setMuted(isMuted) {
    this.isMutedState = Boolean(isMuted);
    localStorage.setItem(STORAGE_KEY_MUTED, this.isMutedState.toString());
    this._updateAllVolumes();
    this._notifyListeners();
  }

  /**
   * Проверить, включен ли режим без звука
   * @returns {boolean}
   */
  isMuted() {
    return this.isMutedState;
  }

  /**
   * Получить аудио-элемент трека из Assets
   * @param {string} key
   * @returns {HTMLAudioElement|null}
   */
  _getAudioElement(key) {
    let audio = Assets.getMusic(key);
    if (!audio) {
      console.warn(`[MusicManager] Трек "${key}" не найден в Assets, пробуем загрузить...`);
      audio = new Audio(`assets/audio/music/${key}.mp3`);
    }
    return audio;
  }

  /**
   * Запустить воспроизведение музыкального трека с плавным переходом (Crossfade)
   * @param {string} trackKey - ключ трека (например, 'title-screen', 'level-1', 'cutscenes', 'Ending')
   * @param {object} [options]
   * @param {number} [options.fadeDuration=1.0] - длительность перехода в секундах
   * @param {boolean} [options.loop=true] - зацикливать ли трек
   * @param {boolean} [options.forceRestart=false] - перезапускать ли, если трек уже играет
   */
  play(trackKey, { fadeDuration = 1.0, loop = true, forceRestart = false } = {}) {
    if (!trackKey) {
      this.stop({ fadeDuration });
      return;
    }

    // Если трек уже играет и не требуется принудительный перезапуск
    if (this.currentTrackKey === trackKey && !forceRestart && this.currentAudio) {
      if (this.currentAudio.paused) {
        this.currentAudio.play().catch(() => { });
      }
      // Если трек находился в процессе затухания, возвращаем его на fade-in
      this.currentGain = Math.max(this.currentGain, 0.05);
      return;
    }

    const nextAudio = this._getAudioElement(trackKey);
    if (!nextAudio) {
      console.warn(`[MusicManager] Не удалось получить аудио для трека "${trackKey}"`);
      return;
    }

    // 1. Старый текущий трек отправляем на Fade-Out
    if (this.currentAudio && this.currentTrackKey !== trackKey) {
      const oldAudio = this.currentAudio;
      const oldKey = this.currentTrackKey;
      const startGain = this.currentGain;

      // Удаляем из fadingTracks, если он там уже был
      this.fadingTracks = this.fadingTracks.filter(t => t.audio !== oldAudio);

      if (fadeDuration > 0 && startGain > 0.01) {
        this.fadingTracks.push({
          audio: oldAudio,
          key: oldKey,
          currentGain: startGain,
          startGain: startGain,
          targetGain: 0,
          duration: Math.max(0.2, fadeDuration),
          elapsed: 0
        });
      } else {
        oldAudio.pause();
        oldAudio.currentTime = 0;
      }
    }

    // 2. Инициализируем новый трек
    this.currentTrackKey = trackKey;
    this.currentAudio = nextAudio;
    this.currentAudio.loop = loop;

    const initialGain = fadeDuration > 0 ? 0 : 1.0;
    this.currentGain = initialGain;
    this._applyVolume(this.currentAudio, initialGain);

    // Запуск воспроизведения
    const playPromise = this.currentAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        // Браузер заблокировал автоплей — сохраняем трек как отложенный
        if (err.name === 'NotAllowedError') {
          this.unlocked = false;
          this.pendingTrack = { key: trackKey, options: { fadeDuration, loop, forceRestart } };
        }
      });
    }

    // Настраиваем Fade-In для нового трека
    if (fadeDuration > 0) {
      // Удаляем новый трек из списка затухающих, если он там был
      this.fadingTracks = this.fadingTracks.filter(t => t.audio !== this.currentAudio);

      this.fadingTracks.push({
        audio: this.currentAudio,
        key: trackKey,
        currentGain: initialGain,
        startGain: initialGain,
        targetGain: 1.0,
        duration: fadeDuration,
        elapsed: 0
      });
    } else {
      this.currentGain = 1.0;
      this._applyVolume(this.currentAudio, 1.0);
    }
  }

  /**
   * Плавно остановить текущий трек (Fade-out до тишины)
   * @param {object} [options]
   * @param {number} [options.fadeDuration=0.8]
   */
  stop({ fadeDuration = 0.8 } = {}) {
    if (!this.currentAudio) {
      this.currentTrackKey = null;
      return;
    }

    const oldAudio = this.currentAudio;
    const oldKey = this.currentTrackKey;
    const startGain = this.currentGain;

    this.currentTrackKey = null;
    this.currentAudio = null;
    this.currentGain = 0;

    this.fadingTracks = this.fadingTracks.filter(t => t.audio !== oldAudio);

    if (fadeDuration > 0 && startGain > 0.01) {
      this.fadingTracks.push({
        audio: oldAudio,
        key: oldKey,
        currentGain: startGain,
        startGain: startGain,
        targetGain: 0,
        duration: fadeDuration,
        elapsed: 0
      });
    } else {
      oldAudio.pause();
      oldAudio.currentTime = 0;
    }
  }

  /**
   * Получить подходящий музыкальный трек для состояния игры и мира
   * @param {string} state - GameState (LOGO, TITLE, MENU, INTRO, LEVEL_START, PLAYING, VICTORY, GAMEOVER)
   * @param {number} [world=1] - текущий биом (1..4)
   * @returns {string|null} - ключ трека или null для тишины
   */
  getTrackForGameState(state, world = 1) {
    switch (state) {
      case 'TITLE':
      case 'MENU':
        return 'title-screen';
      case 'INTRO':
        return 'cutscenes';
      case 'LEVEL_START':
      case 'PLAYING':
      case 'PAUSED': {
        const clampedWorld = Math.max(1, Math.min(4, world || 1));
        return `level-${clampedWorld}`;
      }
      case 'VICTORY':
      case 'CREDITS':
        return 'Ending';
      case 'GAMEOVER':
      case 'LOGO':
      default:
        return null;
    }
  }

  /**
   * Обновление состояния игры и плавное переключение музыки
   * @param {string} state
   * @param {number} [world=1]
   * @param {number} [fadeDuration=1.0]
   */
  syncWithGameState(state, world = 1, fadeDuration = 1.0) {
    const targetTrack = this.getTrackForGameState(state, world);
    if (targetTrack) {
      this.play(targetTrack, { fadeDuration, loop: true });
    } else {
      this.stop({ fadeDuration });
    }
  }

  /**
   * Внутренний цикл интерполяции громкости (requestAnimationFrame)
   */
  _startFadeLoop() {
    const tick = (now) => {
      const dt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      // Плавная интерполяция duck-множителя паузы
      if (this.pauseDuckGain !== this.pauseDuckTarget) {
        const step = this.pauseDuckSpeed * Math.min(dt, 0.05);
        if (Math.abs(this.pauseDuckTarget - this.pauseDuckGain) <= step) {
          this.pauseDuckGain = this.pauseDuckTarget;
        } else {
          this.pauseDuckGain += Math.sign(this.pauseDuckTarget - this.pauseDuckGain) * step;
        }
        this._updateAllVolumes();
      }

      if (this.fadingTracks.length > 0) {
        const remaining = [];

        for (const item of this.fadingTracks) {
          item.elapsed += dt;
          const progress = Math.min(1, item.elapsed / item.duration);
          // Плавная кривая (ease-in-out)
          const ease = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

          item.currentGain = item.startGain + (item.targetGain - item.startGain) * ease;
          this._applyVolume(item.audio, item.currentGain);

          if (item.audio === this.currentAudio) {
            this.currentGain = item.currentGain;
          }

          if (progress < 1) {
            remaining.push(item);
          } else {
            // Завершение перехода
            item.currentGain = item.targetGain;
            this._applyVolume(item.audio, item.targetGain);

            if (item.targetGain <= 0.001) {
              item.audio.pause();
              item.audio.currentTime = 0;
            }
          }
        }

        this.fadingTracks = remaining;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }
}

// Экспорт синглтона
const musicManager = new MusicManager();
export default musicManager;
