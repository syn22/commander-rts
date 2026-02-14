//
// Landing Page Animation - Simplified game preview
//

interface AnimatedUnit {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: string;
  size: number;
  speed: number;
}

interface AnimatedBase {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  color: string;
}

export class LandingAnimation {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private units: AnimatedUnit[] = [];
  private bases: AnimatedBase[] = [];
  private animationId: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.init();
    this.animate();
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private init(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Create two bases
    this.bases = [
      { x: w * 0.15, y: h * 0.5, hp: 1000, maxHp: 1000, color: '#4caf50' },
      { x: w * 0.85, y: h * 0.5, hp: 1000, maxHp: 1000, color: '#f44336' },
    ];

    // Create some friendly units (green) moving right
    for (let i = 0; i < 8; i++) {
      this.units.push({
        x: w * 0.2 + Math.random() * 50,
        y: h * 0.3 + i * 30 + Math.random() * 20,
        targetX: w * 0.7,
        targetY: h * 0.3 + i * 30,
        color: '#4caf50',
        size: 6,
        speed: 0.5 + Math.random() * 0.3,
      });
    }

    // Create some enemy units (red) moving left
    for (let i = 0; i < 6; i++) {
      this.units.push({
        x: w * 0.8 + Math.random() * 50,
        y: h * 0.6 + i * 35 + Math.random() * 20,
        targetX: w * 0.3,
        targetY: h * 0.6 + i * 35,
        color: '#f44336',
        size: 6,
        speed: 0.4 + Math.random() * 0.3,
      });
    }
  }

  private animate = (): void => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid background
    this.drawGrid();

    // Update and draw units
    for (const unit of this.units) {
      // Move towards target
      const dx = unit.targetX - unit.x;
      const dy = unit.targetY - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        unit.x += (dx / dist) * unit.speed;
        unit.y += (dy / dist) * unit.speed;
      } else {
        // Reached target, pick new target
        const w = this.canvas.width;
        const h = this.canvas.height;

        if (unit.color === '#4caf50') {
          // Friendly unit - move to enemy base area
          unit.targetX = w * 0.7 + Math.random() * 100;
          unit.targetY = h * 0.3 + Math.random() * h * 0.4;
        } else {
          // Enemy unit - move to friendly base area
          unit.targetX = w * 0.2 + Math.random() * 100;
          unit.targetY = h * 0.3 + Math.random() * h * 0.4;
        }
      }

      // Draw unit
      this.ctx.fillStyle = unit.color;
      this.ctx.beginPath();
      this.ctx.arc(unit.x, unit.y, unit.size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Draw bases
    for (const base of this.bases) {
      // Base circle
      this.ctx.strokeStyle = base.color;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(base.x, base.y, 20, 0, Math.PI * 2);
      this.ctx.stroke();

      // HP bar
      const barWidth = 60;
      const barHeight = 6;
      const hpPercent = base.hp / base.maxHp;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(base.x - barWidth / 2, base.y - 35, barWidth, barHeight);

      this.ctx.fillStyle = base.color;
      this.ctx.fillRect(base.x - barWidth / 2, base.y - 35, barWidth * hpPercent, barHeight);

      // Slowly decrease HP for drama
      base.hp = Math.max(100, base.hp - 0.1);
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  private drawGrid(): void {
    const gridSize = 40;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    this.ctx.lineWidth = 1;

    for (let x = 0; x < this.canvas.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    for (let y = 0; y < this.canvas.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }

  public stop(): void {
    cancelAnimationFrame(this.animationId);
  }
}
