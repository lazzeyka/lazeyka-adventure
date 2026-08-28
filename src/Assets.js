/**
 * Assets.js
 * Модуль предварительной загрузки игровых ресурсов (изображения, музыка, звуки).
 */

class AssetsManager {
  constructor() {
    this.images = new Map();
    this.music = new Map();
    this.videos = new Map();
    this.sounds = new Map();
    this.loaded = false;
  }

  /**
   * Список всех игровых ресурсов для предзагрузки
   */
  get manifest() {
    return {
      images: [
        { id: 'intro-logo', aliases: ['intro.png', 'intro'], src: 'assets/images/intro.png' },
        { id: 'w-1-jungle', aliases: ['backgrounds/w-1-jungle.jpeg', 'w-1-jungle.jpeg', 'jungle'], src: 'assets/images/backgrounds/w-1-jungle.jpeg' },
        { id: 'w-2-cave', aliases: ['backgrounds/w-2-cave.jpeg', 'w-2-cave.jpeg', 'cave'], src: 'assets/images/backgrounds/w-2-cave.jpeg' },
        { id: 'w-3-mountains', aliases: ['backgrounds/w-3-mountains.jpeg', 'w-3-mountains.jpeg', 'mountains'], src: 'assets/images/backgrounds/w-3-mountains.jpeg' },
        { id: 'w-4-treasury', aliases: ['backgrounds/w-4-treasury.jpeg', 'w-4-treasury.jpeg', 'treasury'], src: 'assets/images/backgrounds/w-4-treasury.jpeg' },
        { id: 'title-screen-bg', aliases: ['backgrounds/title-screen.png', 'title-screen.png'], src: 'assets/images/backgrounds/title-screen.png' },
        { id: 'character-cutscene', aliases: ['character/character-cutscene.png', 'character-cutscene.png'], src: 'assets/images/character/character-cutscene.png' },
        { id: 'character-paddle', aliases: ['character/character-paddle.png', 'character-paddle.png', 'paddle'], src: 'assets/images/character/character-paddle.png' },
        { id: 'laz2', aliases: ['character/laz2.png', 'laz2.png'], src: 'assets/images/character/laz2.png' },
        { id: 'qqqqqqqq', aliases: ['character/qqqqqqqq.png', 'qqqqqqqq.png'], src: 'assets/images/character/qqqqqqqq.png' }
      ],
      music: [
        { id: 'cutscenes', aliases: ['cutscenes.mp3'], src: 'assets/audio/music/cutscenes.mp3' },
        { id: 'Ending', aliases: ['Ending.mp3', 'ending', 'ending.mp3'], src: 'assets/audio/music/Ending.mp3' },
        { id: 'level-1', aliases: ['level-1.mp3'], src: 'assets/audio/music/level-1.mp3' },
        { id: 'level-2', aliases: ['level-2.mp3'], src: 'assets/audio/music/level-2.mp3' },
        { id: 'level-3', aliases: ['level-3.mp3'], src: 'assets/audio/music/level-3.mp3' },
        { id: 'level-4', aliases: ['level-4.mp3'], src: 'assets/audio/music/level-4.mp3' },
        { id: 'title-screen', aliases: ['title-screen.mp3', 'title'], src: 'assets/audio/music/title-screen.mp3' }
      ],
      videos: [
        { id: 'title-screen-video', aliases: ['backgrounds/title-screen.mp4', 'title-screen.mp4', 'title-video'], src: 'assets/images/backgrounds/title-screen.mp4' }
      ],
      sounds: [
        { id: 'ui_click', aliases: ['ui_click.wav', 'click'], src: 'assets/audio/sfx/ui_click.wav' },
        { id: 'pause_in', aliases: ['pause_in.wav'], src: 'assets/audio/sfx/pause_in.wav' },
        { id: 'pause_out', aliases: ['pause_out.wav'], src: 'assets/audio/sfx/pause_out.wav' },
        { id: 'paddle_hit', aliases: ['paddle_hit.wav'], src: 'assets/audio/sfx/paddle_hit.wav' },
        { id: 'wall_hit', aliases: ['wall_hit.wav'], src: 'assets/audio/sfx/wall_hit.wav' },
        { id: 'ball_lost', aliases: ['ball_lost.wav'], src: 'assets/audio/sfx/ball_lost.wav' },
        { id: 'player_spawn', aliases: ['player_spawn.wav'], src: 'assets/audio/sfx/player_spawn.wav' },
        { id: 'block_normal_hit', aliases: ['block_normal_hit.wav'], src: 'assets/audio/sfx/block_normal_hit.wav' },
        { id: 'block_strong_hit_1', aliases: ['block_strong_hit_1.wav'], src: 'assets/audio/sfx/block_strong_hit_1.wav' },
        { id: 'block_strong_hit_2', aliases: ['block_strong_hit_2.wav'], src: 'assets/audio/sfx/block_strong_hit_2.wav' },
        { id: 'block_indestructible_hit', aliases: ['block_indestructible_hit.wav'], src: 'assets/audio/sfx/block_indestructible_hit.wav' },
        { id: 'boss_spawn', aliases: ['boss_spawn.wav'], src: 'assets/audio/sfx/boss_spawn.wav' },
        { id: 'boss_death', aliases: ['boss_death.wav'], src: 'assets/audio/sfx/boss_death.wav' },
        { id: 'level_win', aliases: ['level_win.wav', 'level_win.wav.wav'], src: 'assets/audio/sfx/level_win.wav.wav' }
      ]
    };
  }

  /**
   * Загрузка отдельного изображения
   * @param {string} src
   * @returns {Promise<HTMLImageElement>}
   */
  _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error(`Не удалось загрузить изображение: ${src}`));
      img.src = src;
    });
  }

  /**
   * Загрузка отдельного видео
   * @param {string} src
   * @returns {Promise<HTMLVideoElement>}
   */
  _loadVideo(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';

      let resolved = false;
      const cleanup = () => {
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('canplaythrough', onReady);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
      };

      const onReady = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          video.play().catch(() => {});
          resolve(video);
        }
      };

      const onError = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Не удалось загрузить видео: ${src}`));
        }
      };

      video.addEventListener('canplay', onReady, { once: true });
      video.addEventListener('canplaythrough', onReady, { once: true });
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });

      // Таймаут на случай задержки загрузки
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          video.play().catch(() => {});
          resolve(video);
        }
      }, 4000);

      video.src = src;
      video.load();
    });
  }

  /**
   * Загрузка отдельного аудиофайла
   * @param {string} src
   * @returns {Promise<HTMLAudioElement>}
   */
  _loadAudio(src) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      let resolved = false;

      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('loadeddata', onReady);
        audio.removeEventListener('error', onError);
      };

      const onReady = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(audio);
        }
      };

      const onError = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Не удалось загрузить аудио: ${src}`));
        }
      };

      audio.addEventListener('canplaythrough', onReady, { once: true });
      audio.addEventListener('loadeddata', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
      
      // Таймаут на случай непредвиденных проблем с автовоспроизведением браузера
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(audio);
        }
      }, 4000);

      audio.preload = 'auto';
      audio.src = src;
      audio.load();
    });
  }

  /**
   * Параллельная загрузка всех ресурсов с прогрессом и Graceful Degradation
   * @param {Function} [onProgress] - callback(percent: number, item: object)
   * @returns {Promise<void>}
   */
  async load(onProgress = () => {}) {
    const { images = [], music = [], videos = [], sounds = [] } = this.manifest;
    const totalItems = images.length + music.length + videos.length + sounds.length;
    let completedItems = 0;

    const reportProgress = (item) => {
      completedItems++;
      const percent = Math.min(100, Math.round((completedItems / totalItems) * 100));
      onProgress(percent, item);
    };

    // Запуск параллельной загрузки изображений
    const imagePromises = images.map(async (item) => {
      try {
        const img = await this._loadImage(item.src);
        this.images.set(item.id, img);
        if (item.aliases) {
          for (const alias of item.aliases) {
            this.images.set(alias, img);
          }
        }
      } catch (err) {
        console.warn(`[Assets] Ошибка загрузки изображения "${item.src}":`, err.message);
      } finally {
        reportProgress(item);
      }
    });

    // Запуск параллельной загрузки видео
    const videoPromises = videos.map(async (item) => {
      try {
        const video = await this._loadVideo(item.src);
        this.videos.set(item.id, video);
        if (item.aliases) {
          for (const alias of item.aliases) {
            this.videos.set(alias, video);
          }
        }
      } catch (err) {
        console.warn(`[Assets] Ошибка загрузки видео "${item.src}":`, err.message);
      } finally {
        reportProgress(item);
      }
    });

    // Запуск параллельной загрузки музыки
    const musicPromises = music.map(async (item) => {
      try {
        const audio = await this._loadAudio(item.src);
        this.music.set(item.id, audio);
        if (item.aliases) {
          for (const alias of item.aliases) {
            this.music.set(alias, audio);
          }
        }
      } catch (err) {
        console.warn(`[Assets] Ошибка загрузки музыки "${item.src}":`, err.message);
      } finally {
        reportProgress(item);
      }
    });

    // Запуск параллельной загрузки звуковых эффектов (SFX)
    const soundPromises = sounds.map(async (item) => {
      try {
        const audio = await this._loadAudio(item.src);
        this.sounds.set(item.id, audio);
        if (item.aliases) {
          for (const alias of item.aliases) {
            this.sounds.set(alias, audio);
          }
        }
      } catch (err) {
        console.warn(`[Assets] Ошибка загрузки звука "${item.src}":`, err.message);
      } finally {
        reportProgress(item);
      }
    });

    await Promise.allSettled([...imagePromises, ...videoPromises, ...musicPromises, ...soundPromises]);
    this.loaded = true;
  }

  /**
   * Получить загруженное изображение по ключу или имени файла
   * @param {string} key
   * @returns {HTMLImageElement|null}
   */
  getImage(key) {
    return this.images.get(key) || null;
  }

  /**
   * Получить загруженное видео по ключу или имени файла
   * @param {string} key
   * @returns {HTMLVideoElement|null}
   */
  getVideo(key) {
    return this.videos.get(key) || null;
  }

  /**
   * Получить загруженный аудиофайл музыки по ключу или имени файла
   * @param {string} key
   * @returns {HTMLAudioElement|null}
   */
  getMusic(key) {
    return this.music.get(key) || null;
  }

  /**
   * Получить загруженный звуковой эффект (SFX) по ключу или имени файла
   * @param {string} key
   * @returns {HTMLAudioElement|null}
   */
  getSound(key) {
    return (this.sounds && this.sounds.get(key)) || null;
  }

  /**
   * Алиас для getSound
   * @param {string} key
   * @returns {HTMLAudioElement|null}
   */
  getSFX(key) {
    return (this.sounds && this.sounds.get(key)) || null;
  }
}

// Экспорт синглтона
const Assets = new AssetsManager();
export default Assets;
