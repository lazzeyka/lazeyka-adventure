/**
 * SoundManager.js
 * Оптимизированный менеджер звуковых эффектов (SFX) для игры «Приключения Лазейки».
 * Особенности:
 * - Основной движок: Web Audio API (AudioBufferSourceNode) для мгновенного воспроизведения без заиканий
 * - Отсутствие накладных расходов сборщика мусора и клонирования DOM-элементов
 * - Троттлинг одинаковых звуков (предотвращение клиппинга при массовом разрушении блоков)
 * - Учет глобального уровня громкости и режима Mute из MusicManager
 * - Graceful fallback на HTMLAudioElement в случае недоступности Web Audio
 */

import Assets from './Assets.js';
import MusicManager from './MusicManager.js';
import { BrickType } from './Brick.js';

export class SoundManager {
  constructor() {
    /** @type {Map<string, number>} */
    this.lastPlayTime = new Map();

    // Индивидуальные коэффициенты громкости для баланса микса
    this.volumeBalances = {
      ui_click: 0.8,
      pause_in: 0.9,
      pause_out: 0.9,
      paddle_hit: 0.85,
      wall_hit: 0.65,
      ball_lost: 0.95,
      player_spawn: 0.9,
      block_normal_hit: 0.85,
      block_strong_hit_1: 0.85,
      block_strong_hit_2: 0.95,
      block_indestructible_hit: 0.75,
      boss_spawn: 1.0,
      boss_death: 1.0,
      level_win: 1.0
    };

    // Фолбек-пулы HTMLAudioElement на случай отсутствия AudioBuffer
    /** @type {Map<string, HTMLAudioElement[]>} */
    this.fallbackPools = new Map();
    this.fallbackPoolSize = 3;

    // Разблокировка AudioContext при первом жесте
    this._setupUnlock();
  }

  _setupUnlock() {
    const unlock = () => {
      const ctx = Assets.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      window.removeEventListener('click', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
    };

    window.addEventListener('click', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('touchstart', unlock, { once: true, capture: true });
  }

  /**
   * Воспроизведение звукового эффекта
   * @param {string} soundId - идентификатор звука
   * @param {object} [options]
   * @param {number} [options.volume=1.0] - дополнительный множитель громкости
   * @param {number} [options.throttleMs=30] - минимальный интервал между одинаковыми звуками
   */
  play(soundId, { volume = 1.0, throttleMs = 30 } = {}) {
    if (!soundId) return;

    // Если игра заглушена, не тратим ресурсы
    if (MusicManager.isMuted()) return;

    const now = performance.now();
    const lastTime = this.lastPlayTime.get(soundId) || 0;

    // Троттлинг одинаковых звуков
    if (throttleMs > 0 && now - lastTime < throttleMs) {
      return;
    }
    this.lastPlayTime.set(soundId, now);

    const masterVol = MusicManager.getVolume();
    const balance = this.volumeBalances[soundId] !== undefined ? this.volumeBalances[soundId] : 1.0;
    const effectiveVol = Math.max(0, Math.min(1, masterVol * balance * volume));

    if (effectiveVol <= 0.001) return;

    // 1. Попытка воспроизведения через сверхбыстрый Web Audio API
    const audioCtx = Assets.getAudioContext();
    const buffer = Assets.getSoundBuffer(soundId);

    if (audioCtx && buffer) {
      try {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(effectiveVol, audioCtx.currentTime);

        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        source.start(0);
        return;
      } catch (err) {
        console.warn(`[SoundManager WebAudio] Ошибка при воспроизведении "${soundId}":`, err.message);
      }
    }

    // 2. Резервное воспроизведение через HTMLAudioElement пул
    this._playFallback(soundId, effectiveVol);
  }

  /**
   * Резервное воспроизведение через HTMLAudioElement
   * @private
   */
  _playFallback(soundId, effectiveVol) {
    try {
      if (!this.fallbackPools.has(soundId)) {
        this.fallbackPools.set(soundId, []);
      }
      const pool = this.fallbackPools.get(soundId);

      let audio = pool.find(a => a.paused || a.ended);
      if (!audio && pool.length < this.fallbackPoolSize) {
        const baseAudio = Assets.getSound(soundId);
        if (baseAudio && typeof baseAudio.cloneNode === 'function') {
          audio = baseAudio.cloneNode(true);
        } else {
          const cleanName = soundId.replace(/\.wav$/, '');
          audio = new Audio(`assets/audio/sfx/${cleanName}.wav`);
        }
        audio.preload = 'auto';
        pool.push(audio);
      } else if (!audio) {
        audio = pool[0];
        pool.push(pool.shift());
      }

      if (audio) {
        audio.volume = effectiveVol;
        audio.currentTime = 0;
        const p = audio.play();
        if (p !== undefined) {
          p.catch(() => {});
        }
      }
    } catch (e) {
      // Игнорируем ошибки резервного воспроизведения
    }
  }

  // =========================================================================
  // УДОБНЫЕ МЕТОДЫ-ХЕЛПЕРЫ ДЛЯ ИГРОВЫХ СОБЫТИЙ
  // =========================================================================

  /** Клик по кнопке или смене экранов/настроек */
  playUiClick() {
    this.play('ui_click', { throttleMs: 50 });
  }

  /** Включение паузы */
  playPauseIn() {
    this.play('pause_in', { throttleMs: 100 });
  }

  /** Снятие с паузы */
  playPauseOut() {
    this.play('pause_out', { throttleMs: 100 });
  }

  /** Отскок мяча от ракетки */
  playPaddleHit() {
    this.play('paddle_hit', { throttleMs: 40 });
  }

  /** Удар мяча о стенку арены */
  playWallHit() {
    this.play('wall_hit', { throttleMs: 35 });
  }

  /** Потеря мяча (падение вниз) */
  playBallLost() {
    this.play('ball_lost', { throttleMs: 200 });
  }

  /** Появление мяча/игрока на поле */
  playPlayerSpawn() {
    this.play('player_spawn', { throttleMs: 150 });
  }

  /** Появление босса */
  playBossSpawn() {
    this.play('boss_spawn', { throttleMs: 200 });
  }

  /** Уничтожение босса */
  playBossDeath() {
    this.play('boss_death', { throttleMs: 200 });
  }

  /** Победа на уровне */
  playLevelWin() {
    this.play('level_win', { throttleMs: 300 });
  }

  /**
   * Воспроизведение звука удара по блоку в зависимости от типа и HP
   * @param {string} type - BrickType (NORMAL, STRONG, INDESTRUCTIBLE)
   * @param {number} hpBefore
   * @param {number} hpAfter
   */
  playBlockHit(type, hpBefore, hpAfter) {
    if (type === BrickType.INDESTRUCTIBLE) {
      this.play('block_indestructible_hit', { throttleMs: 30 });
      return;
    }

    if (type === BrickType.STRONG) {
      if (hpAfter <= 0) {
        // Финальный разрушающий удар
        this.play('block_strong_hit_2', { throttleMs: 30 });
      } else {
        // Первый удар (повреждение / смена вида)
        this.play('block_strong_hit_1', { throttleMs: 30 });
      }
      return;
    }

    // Обычный блок (NORMAL)
    this.play('block_normal_hit', { throttleMs: 30 });
  }
}

// Экспорт синглтона
const soundManager = new SoundManager();
export default soundManager;
