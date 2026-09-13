/** One drawn fruit fly, shared by the room and the screen. `size` is the body length in px. */
export function drawFly(c: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, wingPhase: number, sitting: boolean, alpha = 1): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.globalAlpha = alpha;
  const L = size, W = size * 0.42;
  // wings: two translucent teardrops, beating when airborne, folded flat when sitting
  const beat = sitting ? 0 : Math.sin(wingPhase) * 0.9;
  c.fillStyle = sitting ? 'rgba(246,236,220,0.28)' : 'rgba(246,236,220,0.42)';
  for (const s of [-1, 1]) {
    c.save();
    c.translate(-L * 0.05, 0);
    c.rotate(s * (sitting ? 0.22 : 0.55 + beat * 0.5));
    c.beginPath();
    c.ellipse(-L * 0.55, 0, L * 0.7, W * 0.55, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  // body: abdomen, thorax, head
  c.fillStyle = '#1A1410';
  c.beginPath(); c.ellipse(-L * 0.28, 0, L * 0.42, W * 0.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2A211B';
  c.beginPath(); c.ellipse(L * 0.12, 0, L * 0.26, W * 0.46, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1A1410';
  c.beginPath(); c.arc(L * 0.42, 0, W * 0.34, 0, Math.PI * 2); c.fill();
  // abdomen stripes
  c.strokeStyle = 'rgba(246,236,220,0.18)'; c.lineWidth = Math.max(0.5, size * 0.05);
  for (const k of [-0.2, -0.38, -0.56]) { c.beginPath(); c.moveTo(L * k, -W * 0.36); c.lineTo(L * k, W * 0.36); c.stroke(); }
  // the eyes: a fruit fly's are red, and take up most of its head
  c.fillStyle = '#B8322E';
  c.beginPath(); c.arc(L * 0.47, -W * 0.22, W * 0.17, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(L * 0.47, W * 0.22, W * 0.17, 0, Math.PI * 2); c.fill();
  // legs when sitting
  if (sitting) {
    c.strokeStyle = 'rgba(26,20,16,0.9)'; c.lineWidth = Math.max(0.6, size * 0.06);
    for (const s of [-1, 1]) for (const k of [0.25, 0.05, -0.2]) {
      c.beginPath(); c.moveTo(L * k, s * W * 0.3); c.lineTo(L * (k + 0.12), s * W * 0.95); c.lineTo(L * (k - 0.05), s * W * 1.35); c.stroke();
    }
  }
  c.restore();
}
