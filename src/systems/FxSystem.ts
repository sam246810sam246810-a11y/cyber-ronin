import Phaser from 'phaser';
import { DEPTH, FONT } from '../config';
import { goldify, type TextPalette } from '../ui/textStyle';

/** 不用加法混合的特效（實體的煙、液體、地面） */
const SOLID_VFX = new Set(['vfx_poof', 'vfx_poison', 'vfx_lava', 'vfx_magma', 'vfx_vines', 'vfx_shatter']);

/** 佔位用的簡單特效 */
export class FxSystem {
  private numberPool: Phaser.GameObjects.Text[] = [];
  private activeNumbers = 0;

  constructor(private scene: Phaser.Scene) {}

  /** 傷害數字（物件池，同時最多 40 個） */
  damageNumber(x: number, y: number, amount: number, crit: boolean, color?: number): void {
    if (this.activeNumbers >= 40) return;
    let t = this.numberPool.pop();
    if (!t) {
      t = this.scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(DEPTH.fx + 6);
    }
    this.activeNumbers++;
    const v = amount >= 10 ? Math.round(amount) : Math.round(amount * 10) / 10;
    t.setText(crit ? `${v}!` : String(v))
      .setFontSize(crit ? 30 : 20)
      .setPosition(x + (Math.random() - 0.5) * 20, y)
      .setAlpha(1).setScale(crit ? 1.4 : 1).setVisible(true);
    // 依元素上色：火＝暖橘黃、冰＝亮藍、毒＝綠、果凍＝粉、雷＝亮黃；暴擊一律橘紅加大
    goldify(t, crit ? 'crit' : FxSystem.paletteForColor(color), crit ? 6 : 4);
    // 往上飄＋小彈跳（Back.Out 會先超過一點再回來），之後淡出
    this.scene.tweens.add({
      targets: t, y: y - 44, scale: crit ? 1.15 : 1, duration: 460, ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, alpha: 0, duration: 160,
          onComplete: () => {
            t!.setVisible(false);
            this.numberPool.push(t!);
            this.activeNumbers--;
          },
        });
      },
    });
  }

  /** 死亡碎片 */
  shatter(x: number, y: number, color: number, r: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = r * (1.2 + Math.random());
      const sz = 5 + Math.random() * 7;
      const p = this.scene.add.image(x, y, 'square').setTint(color).setDisplaySize(sz, sz).setDepth(DEPTH.fx)
        .setRotation(Math.random() * 3);
      this.scene.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, angle: 360, alpha: 0, duration: 380 + Math.random() * 200,
        ease: 'Quad.Out', onComplete: () => p.destroy(),
      });
    }
  }

  /** 傷害跳字的漸層色 */
  static paletteForColor(color?: number): TextPalette {
    if (color === undefined) return 'gold';
    const k = FxSystem.vfxForColor(color);
    if (k === 'vfx_fire') return 'fire';
    if (k === 'vfx_frost') return 'ice';
    if (k === 'vfx_poison') return 'poison';
    if (k === 'vfx_jelly') return 'jelly';
    if (k === 'vfx_hit') return 'shock';
    return 'gold';
  }

  // ---- 粒子（全部 Additive）----
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private comboHits: number[] = [];
  private lastShake = 0;

  private emitter(color: number, kind: 'burst' | 'trail'): Phaser.GameObjects.Particles.ParticleEmitter | undefined {
    if (!this.scene.textures.exists('proj_orb')) return undefined;
    const key = `${kind}:${color}`;
    let e = this.emitters.get(key);
    if (e && e.scene) return e;
    const burst = kind === 'burst';
    e = this.scene.add.particles(0, 0, 'proj_orb', {
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
      tint: color,
      speed: burst ? { min: 90, max: 260 } : { min: 8, max: 40 },
      angle: { min: 0, max: 360 },
      lifespan: burst ? { min: 180, max: 380 } : { min: 180, max: 300 },
      scale: burst ? { start: 0.17, end: 0 } : { start: 0.1, end: 0 },
      alpha: { start: burst ? 1 : 0.75, end: 0 },
      gravityY: burst ? 260 : 0,
    }).setDepth(DEPTH.fx + 1);
    this.emitters.set(key, e);
    return e;
  }

  /** 命中：元素粒子噴發＋白色核心閃光；連續命中時極輕微鏡頭震動 */
  hitBurst(x: number, y: number, color = 0xfff0c0, crit = false): void {
    this.emitter(color, 'burst')?.explode(crit ? 16 : 9, x, y);
    this.emitter(0xffffff, 'burst')?.explode(crit ? 5 : 2, x, y);
    const now = this.scene.time.now;
    this.comboHits.push(now);
    while (this.comboHits.length && now - this.comboHits[0] > 350) this.comboHits.shift();
    if ((crit || this.comboHits.length >= 7) && now - this.lastShake > 420) {
      this.lastShake = now;
      this.shake(crit ? 60 : 70, crit ? 0.0016 : 0.0019);
    }
  }

  /** 投射物拖尾微粒（每幀呼叫） */
  trail(x: number, y: number, color: number): void {
    this.emitter(color, 'trail')?.emitParticleAt(x, y, 1);
  }

  /** 克制的鏡頭震動（強力技能用 0.004 左右） */
  shake(ms: number, intensity: number): void {
    this.scene.cameras.main.shake(ms, intensity);
  }

  /** 播一次美術特效動畫（沒載入就什麼都不做，回傳 undefined） */
  anim(key: string, x: number, y: number, size: number, opts: { depth?: number; tint?: number; loop?: boolean } = {}):
    Phaser.GameObjects.Sprite | undefined {
    if (!this.scene.anims.exists(key)) return undefined;
    const s = this.scene.add.sprite(x, y, key).setDepth(opts.depth ?? DEPTH.fx);
    // 光暈、火花、冰晶、閃電一律加法混合；煙霧、毒霧、熔岩等有實體感的保持一般混合
    if (!SOLID_VFX.has(key)) s.setBlendMode(Phaser.BlendModes.ADD);
    const f = s.frame;
    s.setScale(size / Math.max(f.width, f.height));
    if (opts.tint !== undefined) s.setTint(opts.tint);
    // 循環類特效（毒霧、熔岩）被拿來當一次性爆炸時，強制只播一輪，避免殘留在場上
    s.play(opts.loop ? key : { key, repeat: 0 });
    if (!opts.loop) s.once('animationcomplete', () => s.destroy());
    return s;
  }

  /** 依顏色挑對應的爆炸特效：火／冰／果凍／毒／其他 */
  static vfxForColor(color: number): string {
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    if (g > 180 && r < 170 && b < 170) return 'vfx_poison';
    if (b > 200 && r < 170) return 'vfx_frost';
    if (r > 220 && b > 150 && g < 170) return 'vfx_jelly';
    if (r > 200 && g < 230 && b < 120) return 'vfx_fire';
    if (r > 220 && g > 200 && b < 120) return 'vfx_hit';
    return 'vfx_poof';
  }

  /** 擴散圓圈爆炸 */
  burst(x: number, y: number, r: number, color: number, duration = 260): void {
    // 有美術特效：大爆炸播動畫，圓圈只留淡淡的範圍提示
    const art = r >= 28 ? this.anim(FxSystem.vfxForColor(color), x, y, r * 2.3) : this.anim('vfx_hit', x, y, Math.max(40, r * 2));
    if (art) {
      const ring = this.scene.add.image(x, y, 'ring').setTint(color).setAlpha(0.45).setDepth(DEPTH.fx)
        .setDisplaySize(r * 0.8, r * 0.8);
      this.scene.tweens.add({
        targets: ring, displayWidth: r * 2.1, displayHeight: r * 2.1, alpha: 0, duration: duration + 80, ease: 'Quad.Out',
        onComplete: () => ring.destroy(),
      });
      return;
    }
    const fill = this.scene.add.image(x, y, 'circle').setTint(color).setAlpha(0.55).setDepth(DEPTH.fx)
      .setDisplaySize(r * 0.6, r * 0.6);
    this.scene.tweens.add({
      targets: fill,
      displayWidth: r * 2,
      displayHeight: r * 2,
      alpha: 0,
      duration,
      ease: 'Quad.Out',
      onComplete: () => fill.destroy(),
    });
    const ring = this.scene.add.image(x, y, 'ring').setTint(color).setAlpha(0.9).setDepth(DEPTH.fx)
      .setDisplaySize(r * 0.8, r * 0.8);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: r * 2.1,
      displayHeight: r * 2.1,
      alpha: 0,
      duration: duration + 80,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
  }

  sparks(x: number, y: number, color: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 20 + Math.random() * 30;
      const s = this.scene.add.image(x, y, 'circle').setTint(color).setDisplaySize(6, 6).setDepth(DEPTH.fx);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        duration: 300,
        onComplete: () => s.destroy(),
      });
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: number, width = 4): void {
    // 有閃電美術：拉長成兩點間的電弧
    if (this.scene.anims.exists('vfx_bolt')) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const s = this.scene.add.sprite(x1, y1, 'vfx_bolt').setOrigin(0, 0.5).setDepth(DEPTH.fx)
        .setRotation(Math.atan2(y2 - y1, x2 - x1)).setBlendMode(Phaser.BlendModes.ADD);
      s.setScale(len / s.frame.width, Math.max(0.35, (width * 9) / s.frame.height));
      if (color !== 0xffffff) s.setTint(color);
      s.play('vfx_bolt');
      s.once('animationcomplete', () => s.destroy());
      return;
    }
    const g = this.scene.add.graphics().setDepth(DEPTH.fx);
    g.lineStyle(width, color, 1).lineBetween(x1, y1, x2, y2);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  floatText(x: number, y: number, text: string, color = '#ffffff', size = 22): void {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 5);
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }
}
