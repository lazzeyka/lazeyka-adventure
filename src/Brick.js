/**
 * Brick.js
 * Класс игрового блока и перечисление типов блоков для игры «Приключения Лазейки».
 */

/**
 * Типы блоков
 * @readonly
 * @enum {string}
 */
export const BrickType = Object.freeze({
  NORMAL: 'NORMAL',                   // 1 удар, исчезает
  STRONG: 'STRONG',                   // 2 удара, после 1 удара меняет вид/цвет
  DURABLE: 'STRONG',                  // Алиас для обратной совместимости
  INDESTRUCTIBLE: 'INDESTRUCTIBLE'   // Неразрушаемый монолит
});

export class Brick {
  /**
   * @param {number} x - Координата X левого верхнего угла
   * @param {number} y - Координата Y левого верхнего угла
   * @param {number} width - Ширина блока
   * @param {number} height - Высота блока
   * @param {string} [type=BrickType.NORMAL] - Тип блока
   * @param {number} [biome=1] - Номер биома для цветовой схемы
   */
  constructor(x, y, width, height, type = BrickType.NORMAL, biome = 1) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.type = type === 'DURABLE' ? BrickType.STRONG : type;
    this.biome = biome;

    // Прочность (HP) и базовые очки в зависимости от типа
    switch (this.type) {
      case BrickType.STRONG:
        this.maxHp = 2;
        this.hp = 2;
        this.scoreValue = 200;
        break;
      case BrickType.INDESTRUCTIBLE:
        this.maxHp = Infinity;
        this.hp = Infinity;
        this.scoreValue = 0;
        break;
      case BrickType.NORMAL:
      default:
        this.maxHp = 1;
        this.hp = 1;
        this.scoreValue = 100;
        break;
    }

    this.isDestroyed = false;
    this.flashTimer = 0; // Вспышка при попадании
  }

  get isDestructible() {
    return this.type !== BrickType.INDESTRUCTIBLE;
  }

  /**
   * Обработка попадания по блоку
   * @returns {{ destroyed: boolean, score: number, hitSuccess: boolean }}
   */
  hit() {
    this.flashTimer = 0.12; // Вспышка на 120ms

    if (!this.isDestructible) {
      return { destroyed: false, score: 0, hitSuccess: true };
    }

    this.hp--;

    if (this.hp <= 0) {
      this.isDestroyed = true;
      return { destroyed: true, score: this.scoreValue, hitSuccess: true };
    }

    // Блок STRONG поврежден после 1-го удара
    return { destroyed: false, score: 60, hitSuccess: true };
  }

  /**
   * Обновление таймеров
   * @param {number} dt
   */
  update(dt) {
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
    }
  }

  /**
   * Отрисовка блока с учетом биома, типа и текущего HP
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (this.isDestroyed) return;

    const { x, y, width, height, biome } = this;

    ctx.save();

    // Палитры по биомам
    let baseColor = '#eab308';
    let topBevel = '#fef08a';
    let bottomBevel = '#ca8a04';
    let borderColor = '#713f12';

    if (biome === 1) {
      // Биом 1: Дикие Джунгли
      if (this.type === BrickType.NORMAL) {
        baseColor = '#d97706';
        topBevel = '#fcd34d';
        bottomBevel = '#92400e';
        borderColor = '#451a03';
      } else if (this.type === BrickType.STRONG) {
        if (this.hp === 2) {
          baseColor = '#10b981';
          topBevel = '#6ee7b7';
          bottomBevel = '#047857';
          borderColor = '#064e3b';
        } else {
          baseColor = '#059669';
          topBevel = '#34d399';
          bottomBevel = '#065f46';
          borderColor = '#022c22';
        }
      } else if (this.type === BrickType.INDESTRUCTIBLE) {
        baseColor = '#475569';
        topBevel = '#94a3b8';
        bottomBevel = '#1e293b';
        borderColor = '#0f172a';
      }
    } else if (biome === 2) {
      // Биом 2: Заброшенная Шахта (Кристаллы и руда)
      if (this.type === BrickType.NORMAL) {
        baseColor = '#8b5cf6';
        topBevel = '#c4b5fd';
        bottomBevel = '#6d28d9';
        borderColor = '#4c1d95';
      } else if (this.type === BrickType.STRONG) {
        if (this.hp === 2) {
          baseColor = '#f59e0b';
          topBevel = '#fde68a';
          bottomBevel = '#b45309';
          borderColor = '#78350f';
        } else {
          baseColor = '#ea580c';
          topBevel = '#fdba74';
          bottomBevel = '#9a3412';
          borderColor = '#431407';
        }
      } else if (this.type === BrickType.INDESTRUCTIBLE) {
        baseColor = '#334155';
        topBevel = '#64748b';
        bottomBevel = '#0f172a';
        borderColor = '#020617';
      }
    } else if (biome === 3) {
      // Биом 3: Ледяные Пики
      if (this.type === BrickType.NORMAL) {
        baseColor = '#38bdf8';
        topBevel = '#bae6fd';
        bottomBevel = '#0284c7';
        borderColor = '#0369a1';
      } else if (this.type === BrickType.STRONG) {
        if (this.hp === 2) {
          baseColor = '#0284c7';
          topBevel = '#7dd3fc';
          bottomBevel = '#0369a1';
          borderColor = '#0c4a6e';
        } else {
          baseColor = '#0369a1';
          topBevel = '#38bdf8';
          bottomBevel = '#082f49';
          borderColor = '#021e33';
        }
      } else if (this.type === BrickType.INDESTRUCTIBLE) {
        baseColor = '#1e293b';
        topBevel = '#38bdf8';
        bottomBevel = '#0f172a';
        borderColor = '#0284c7';
      }
    } else {
      // Биом 4: Сокровищница
      if (this.type === BrickType.NORMAL) {
        baseColor = '#f43f5e';
        topBevel = '#fecdd3';
        bottomBevel = '#be123c';
        borderColor = '#881337';
      } else if (this.type === BrickType.STRONG) {
        if (this.hp === 2) {
          baseColor = '#fbbf24';
          topBevel = '#fef08a';
          bottomBevel = '#d97706';
          borderColor = '#78350f';
        } else {
          baseColor = '#d97706';
          topBevel = '#fde68a';
          bottomBevel = '#92400e';
          borderColor = '#451a03';
        }
      } else if (this.type === BrickType.INDESTRUCTIBLE) {
        baseColor = '#1e1b4b';
        topBevel = '#fbbf24';
        bottomBevel = '#0f172a';
        borderColor = '#f59e0b';
      }
    }

    // Вспышка при ударе
    if (this.flashTimer > 0) {
      baseColor = '#ffffff';
      topBevel = '#ffffff';
      bottomBevel = '#e2e8f0';
    }

    // 2. Основной прямоугольник
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, width, height);

    // 3. Пиксельная фаска (Bevel)
    const bevelSize = 3;

    // Верхняя/левая грань
    ctx.fillStyle = topBevel;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width - bevelSize, y + bevelSize);
    ctx.lineTo(x + bevelSize, y + bevelSize);
    ctx.lineTo(x + bevelSize, y + height - bevelSize);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    ctx.fill();

    // Нижняя/правая грань
    ctx.fillStyle = bottomBevel;
    ctx.beginPath();
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + bevelSize, y + height - bevelSize);
    ctx.lineTo(x + width - bevelSize, y + height - bevelSize);
    ctx.lineTo(x + width - bevelSize, y + bevelSize);
    ctx.closePath();
    ctx.fill();

    // 4. Контур
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);

    // 5. Детализация по типам
    if (this.type === BrickType.STRONG && this.hp === 1) {
      // Трещины на поврежденном блоке
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + width * 0.28, y + 4);
      ctx.lineTo(x + width * 0.46, y + height * 0.55);
      ctx.lineTo(x + width * 0.72, y + height - 4);
      ctx.moveTo(x + width * 0.46, y + height * 0.55);
      ctx.lineTo(x + width * 0.22, y + height - 5);
      ctx.stroke();
    } else if (this.type === BrickType.INDESTRUCTIBLE) {
      // Золотая/руническая инкрустация
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + width / 2 - 4, y + height / 2 - 4, 8, 8);
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + width / 2 - 4, y + height / 2 - 4, 8, 8);
    } else if (this.type === BrickType.NORMAL) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(x + 8, y + height / 2 - 1, width - 16, 2);
    }

    ctx.restore();
  }
}
