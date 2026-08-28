/**
 * SoundManager.js
 * Менеджер звуковых эффектов (SFX) для игры «Приключения Лазейки».
 * Особенности:
 * - Пул аудио-элементов для каждого звука (одновременное воспроизведение без обрывов)
 * - Троттлинг одинаковых звуков (предотвращение перегрузки и клиппинга при массовом разрушении блоков)
 * - Учет глобального уровня громкости и режима Mute из MusicManager
 * - Защита от ошибок воспроизведения и строгой политики браузеров
 */

import Assets from './Assets.js';
import MusicManager from './MusicManager.js';
import { BrickType } from './Brick.js';

export class SoundManager {
  constructor() {
    /** @type {Map<string, HTMLAudioElement[]>} */
    this.pools = new Map();
    this.poolSize = 5;

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
  }

  /**
   * Получить свободный или наименее активный аудио-элемент из пула
   * @param {string} soundId
   * @returns {HTMLAudioElement|null}
   */
  _getAudioFromPool(soundId) {
    if (!this.pools.has(soundId)) {
      this.pools.set(soundId, []);
    }

    const pool = this.pools.get(soundId);

    // 1. Ищем уже завершивший воспроизведение элемент
    for (const audio of pool) {
      if (audio.paused || audio.ended) {
        return audio;
      }
    }

    // 2. Если пул еще не заполнен, получаем из предзагруженного Assets или создаем
    if (pool.length < this.poolSize) {
      let baseAudio = null;
      try {
        if (Assets) {
          if (typeof Assets.getSound === 'function') {
            baseAudio = Assets.getSound(soundId);
          } else if (typeof Assets.getSFX === 'function') {
            baseAudio = Assets.getSFX(soundId);
          } else if (Assets.sounds && typeof Assets.sounds.get === 'function') {
            baseAudio = Assets.sounds.get(soundId);
          }
        }
      } catch (e) {
        baseAudio = null;
      }

      let newAudio = null;
      if (baseAudio && typeof baseAudio.cloneNode === 'function') {
        newAudio = baseAudio.cloneNode(true);
      } else {
        const cleanName = soundId.replace(/\.wav$/, '');
        newAudio = new Audio(`assets/audio/sfx/${cleanName}.wav`);
      }

      newAudio.preload = 'auto';
      pool.push(newAudio);
      return newAudio;
    }

    // 3. Если все заняты, берем самый старый и перезапускаем его
    const oldestAudio = pool[0];
    // Перемещаем в конец пула (round-robin)
    pool.push(pool.shift());
    return oldestAudio;
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

    try {
      const audio = this._getAudioFromPool(soundId);
      if (!audio) return;

      const masterVol = MusicManager.getVolume();
      const balance = this.volumeBalances[soundId] !== undefined ? this.volumeBalances[soundId] : 1.0;
      const effectiveVol = Math.max(0, Math.min(1, masterVol * balance * volume));

      audio.volume = effectiveVol;
      audio.currentTime = 0;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Игнорируем ошибки автовоспроизведения или прерывания браузером
        });
      }
    } catch (err) {
      // Защита: ни одна ошибка аудио не должна прерывать работу игры
      console.warn(`[SoundManager] Ошибка при воспроизведении "${soundId}":`, err.message);
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
