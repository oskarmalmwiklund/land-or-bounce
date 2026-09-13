/**
 * The room: a kitchen at night, one lamp, a bowl of fruit past its best, and a dozen
 * fruit flies. Flies fly the way fruit flies do, in straight runs broken by sharp
 * saccades, and they are drawn to whatever is brightest. At rest that is the lamp. When a
 * page is on the screen, the screen is the lamp. When the page lands, they sit on it;
 * when it bounces, they leave.
 */
import { drawFly } from './fly';

export type Mood = 'idle' | 'judging' | 'landed' | 'bounced';
interface Rect { x: number; y: number; w: number; h: number }
interface Fly {
  x: number; y: number; vx: number; vy: number; heading: number; speed: number; size: number;
  nextSaccade: number; wing: number; sitting: boolean; sitUntil: number; perch: { x: number; y: number; a: number } | null;
  px: number; py: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Room {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1; private height = 1; private ratio = 1;
  private flies: Fly[] = [];
  private last = performance.now();
  /** The screen's rectangle in canvas CSS pixels, when a page is up. */
  screen: Rect | null = null;
  mood: Mood = 'idle';
  reduced = false;

  constructor(readonly canvas: HTMLCanvasElement, count = 18) {
    this.ctx = canvas.getContext('2d')!;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < count; i++) this.flies.push(this.spawn());
  }

  private spawn(): Fly {
    const x = rand(0, this.width || 800), y = rand(0, (this.height || 600) * 0.7);
    return { x, y, px: x, py: y, vx: 0, vy: 0, heading: rand(0, Math.PI * 2), speed: rand(90, 220), size: rand(10, 15), nextSaccade: 0, wing: rand(0, 6), sitting: false, sitUntil: 0, perch: null };
  }

  resize(width: number, height: number): void {
    const first = this.width === 1;
    this.width = width; this.height = height;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.ratio);
    this.canvas.height = Math.round(height * this.ratio);
    this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    if (first) this.flies = this.flies.map(() => this.spawn());
  }

  private lamp(): { x: number; y: number } { return { x: this.width * 0.5, y: -this.height * 0.02 }; }

  /** Where this fly wants to be right now. */
  private attractor(f: Fly, now: number): { x: number; y: number; radius: number } {
    const lamp = this.lamp();
    if (!this.screen || this.mood === 'idle') return { x: lamp.x, y: lamp.y + this.height * 0.12, radius: this.width * 0.16 };
    const r = this.screen;
    if (this.mood === 'bounced') {
      // scatter: away from the screen, back toward the lamp, with a wide orbit
      return { x: lamp.x + Math.sin(now / 900 + f.size) * this.width * 0.3, y: this.height * 0.08, radius: this.width * 0.22 };
    }
    // judging or landed: orbit the screen edges
    const a = now / 1400 + f.size * 2.1;
    return { x: r.x + r.w / 2 + Math.cos(a) * (r.w / 2 + 40), y: r.y + r.h / 2 + Math.sin(a) * (r.h / 2 + 40), radius: 60 };
  }

  private perchFor(f: Fly): { x: number; y: number; a: number } | null {
    const r = this.screen;
    if (!r) return null;
    // sit on the frame edge nearest the fly
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = (f.x - cx) / r.w, dy = (f.y - cy) / r.h;
    if (Math.abs(dx) > Math.abs(dy)) { const s = Math.sign(dx) || 1; return { x: cx + s * (r.w / 2 + 4), y: cy + dy * r.h * 0.9, a: s > 0 ? -Math.PI / 2 : Math.PI / 2 }; }
    const s = Math.sign(dy) || 1;
    return { x: cx + dx * r.w * 0.9, y: cy + s * (r.h / 2 + 4), a: s > 0 ? Math.PI : 0 };
  }

  private step(dt: number, now: number): void {
    const W = this.width, H = this.height;
    for (const f of this.flies) {
      f.px = f.x; f.py = f.y;
      if (f.sitting) {
        if (now > f.sitUntil || this.mood === 'bounced' || this.mood === 'idle') { f.sitting = false; f.perch = null; f.heading = rand(0, Math.PI * 2); f.nextSaccade = now; }
        else continue;
      }
      f.wing += dt * 55;
      const at = this.attractor(f, now);
      const dx = at.x - f.x, dy = at.y - f.y, dist = Math.hypot(dx, dy);
      if (now >= f.nextSaccade) {
        // a saccade: a sharp turn, biased toward the attractor when far from it
        const toward = Math.atan2(dy, dx);
        const pull = dist > at.radius ? 0.75 : 0.25;
        let diff = toward - f.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        f.heading += diff * pull + rand(-1.4, 1.4) * (1 - pull * 0.5);
        f.speed = rand(80, 240) * (this.mood === 'judging' ? 1.25 : 1);
        f.nextSaccade = now + rand(120, 520);
      }
      // gentle curve between saccades
      f.heading += rand(-0.6, 0.6) * dt;
      f.vx = Math.cos(f.heading) * f.speed; f.vy = Math.sin(f.heading) * f.speed;
      f.x += f.vx * dt; f.y += f.vy * dt;
      // stay in the room
      if (f.x < -20) { f.x = -20; f.heading = Math.PI - f.heading; }
      if (f.x > W + 20) { f.x = W + 20; f.heading = Math.PI - f.heading; }
      if (f.y < -30) { f.y = -30; f.heading = -f.heading; }
      if (f.y > H * 0.86) { f.y = H * 0.86; f.heading = -f.heading; }
      // landing: sit on the screen's frame for a while
      if (this.screen && (this.mood === 'landed' || this.mood === 'judging') && dist < 70 && Math.random() < (this.mood === 'landed' ? 0.05 : 0.008)) {
        const p = this.perchFor(f);
        if (p) { f.sitting = true; f.perch = p; f.x = p.x; f.y = p.y; f.sitUntil = now + (this.mood === 'landed' ? rand(3000, 9000) : rand(600, 1600)); }
      }
    }
  }

  private paintRoom(now: number): void {
    const c = this.ctx, W = this.width, H = this.height;
    c.fillStyle = '#17110E'; c.fillRect(0, 0, W, H);
    // the lamp: a warm cone from above, flickering very slightly like a tired bulb
    const lamp = this.lamp();
    const flicker = 0.92 + Math.sin(now / 230) * 0.02 + Math.sin(now / 1370) * 0.04;
    const g = c.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, Math.max(W, H) * 0.75);
    g.addColorStop(0, `rgba(255,179,71,${0.42 * flicker})`);
    g.addColorStop(0.25, `rgba(255,158,44,${0.14 * flicker})`);
    g.addColorStop(0.6, 'rgba(255,140,30,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // a cone of light
    c.save();
    c.globalAlpha = 0.08 * flicker;
    const cone = c.createLinearGradient(0, 0, 0, H);
    cone.addColorStop(0, '#FFB347'); cone.addColorStop(1, 'rgba(255,179,71,0)');
    c.fillStyle = cone;
    c.beginPath(); c.moveTo(lamp.x - W * 0.06, 0); c.lineTo(lamp.x + W * 0.06, 0); c.lineTo(lamp.x + W * 0.62, H); c.lineTo(lamp.x - W * 0.62, H); c.closePath(); c.fill();
    c.restore();
    // the table
    const ty = H * 0.86;
    const table = c.createLinearGradient(0, ty, 0, H);
    table.addColorStop(0, '#2A1F18'); table.addColorStop(1, '#17110E');
    c.fillStyle = table; c.fillRect(0, ty, W, H - ty);
    c.fillStyle = 'rgba(255,179,71,0.10)'; c.fillRect(0, ty, W, 2);
    // the fruit bowl, bottom left, a little past its best
    const bx = Math.min(W * 0.16, 220), by = ty;
    c.save();
    c.translate(bx, by);
    // banana
    c.strokeStyle = '#B79A2A'; c.lineWidth = 16; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-70, -34); c.quadraticCurveTo(-10, -78, 62, -46); c.stroke();
    c.strokeStyle = 'rgba(70,45,10,0.7)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-60, -40); c.quadraticCurveTo(-8, -70, 40, -50); c.stroke();
    c.fillStyle = '#3A2A12'; c.beginPath(); c.arc(-72, -33, 6, 0, Math.PI * 2); c.fill();
    // a plum and an apple
    c.fillStyle = '#6A2C4F'; c.beginPath(); c.arc(-30, -34, 24, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,220,240,0.10)'; c.beginPath(); c.arc(-38, -44, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8A3A2A'; c.beginPath(); c.arc(28, -30, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,200,160,0.10)'; c.beginPath(); c.arc(18, -42, 9, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3A2A12'; c.lineWidth = 3; c.beginPath(); c.moveTo(28, -56); c.lineTo(31, -68); c.stroke();
    // the bowl
    c.fillStyle = '#332620';
    c.beginPath(); c.ellipse(0, -18, 96, 22, 0, 0, Math.PI, false); c.lineTo(96, -18); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,179,71,0.12)'; c.beginPath(); c.ellipse(0, -18, 96, 22, 0, Math.PI, Math.PI * 2); c.fill();
    c.restore();
    // vignette
    const v = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.max(W, H) * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }

  render(now = performance.now()): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.reduced) this.step(dt, now);
    this.paintRoom(now);
    const c = this.ctx;
    for (const f of this.flies) {
      if (f.sitting && f.perch) { drawFly(c, f.perch.x, f.perch.y, f.perch.a, f.size * 1.1, 0, true); continue; }
      // a faint motion trail
      c.strokeStyle = 'rgba(26,20,16,0.35)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(f.px, f.py); c.lineTo(f.x, f.y); c.stroke();
      drawFly(c, f.x, f.y, f.heading, f.size, f.wing, false, 0.95);
    }
  }
}
