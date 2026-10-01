import Phaser from 'phaser';

type Snapshot = Readonly<{ scene: string; clicks: number; x: number; y: number }>;
let snapshot: Snapshot = Object.freeze({ scene: 'loading', clicks: 0, x: 0, y: 0 });
const observation = document.querySelector('[data-testid="debug-state"]');

Object.defineProperty(window, 'cosmosDebug', {
  get: () => snapshot,
  configurable: false,
});

function observe(scene: string, clicks = 0, x = 0, y = 0): void {
  snapshot = Object.freeze({ scene, clicks, x: Math.round(x), y: Math.round(y) });
  if (observation) observation.textContent = JSON.stringify(snapshot);
}

function button(scene: Phaser.Scene, x: number, y: number, label: string, action: () => void): void {
  const background = scene.add.rectangle(x, y, 200, 48, 0x31475e).setInteractive({ useHandCursor: true });
  scene.add.text(x, y, label, { fontFamily: 'system-ui', fontSize: '16px', color: '#eef4ff' }).setOrigin(0.5);
  background.on('pointerover', () => background.setFillStyle(0x415d79));
  background.on('pointerout', () => background.setFillStyle(0x31475e));
  background.on('pointerdown', action);
}

class Playground extends Phaser.Scene {
  constructor() { super('playground'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#1d2b3d');
    this.add.text(32, 32, '01 / PLAYGROUND', { fontFamily: 'system-ui', fontSize: '14px', color: '#81e4cb' });
    this.add.text(32, 60, 'A sprite and a place to move.', { fontFamily: 'system-ui', fontSize: '21px', color: '#eef4ff' });
    const grid = this.add.graphics().lineStyle(1, 0x2a3b50);
    for (let x = 40; x < 800; x += 40) grid.lineBetween(x, 120, x, 460);
    for (let y = 140; y <= 460; y += 40) grid.lineBetween(40, y, 760, y);
    if (!this.textures.exists('marker')) {
      const shape = this.add.graphics();
      shape.fillStyle(0xffffff).fillRoundedRect(0, 0, 56, 56, 16);
      shape.fillStyle(0x172637).fillCircle(19, 24, 3).fillCircle(37, 24, 3);
      shape.lineStyle(2, 0x172637).lineBetween(22, 36, 34, 36);
      shape.generateTexture('marker', 56, 56);
      shape.destroy();
    }
    const sprite = this.add.sprite(240, 250, 'marker').setTint(0x81e4cb).setInteractive({ useHandCursor: true });
    let clicks = 0;
    const counter = this.add.text(32, 468, 'Sprite clicks: 0', { fontFamily: 'system-ui', fontSize: '14px', color: '#adbed2' });
    const publish = () => observe('playground', clicks, sprite.x, sprite.y);
    sprite.on('pointerdown', () => {
      clicks += 1;
      sprite.setTint(clicks % 2 ? 0xb5a2ff : 0x81e4cb);
      counter.setText(`Sprite clicks: ${clicks}`);
      publish();
    });
    const move = (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (objects.length || pointer.y < 120 || pointer.y > 448) return;
      sprite.setPosition(Phaser.Math.Clamp(pointer.x, 68, 732), Phaser.Math.Clamp(pointer.y, 148, 432));
      publish();
    };
    this.input.on('pointerdown', move);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.off('pointerdown', move));
    button(this, 660, 70, 'Next scene →', () => this.scene.start('gallery'));
    publish();
  }
}

class Gallery extends Phaser.Scene {
  constructor() { super('gallery'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#253344');
    this.add.text(400, 90, '02 / ANOTHER SCENE', { fontFamily: 'system-ui', fontSize: '14px', color: '#81e4cb' }).setOrigin(0.5);
    this.add.sprite(400, 185, 'marker').setTint(0xb5a2ff).setScale(1.4);
    this.add.text(400, 270, 'The same sprite. A different scene.', {
      fontFamily: 'system-ui', fontSize: '23px', color: '#eef4ff',
    }).setOrigin(0.5);
    button(this, 400, 340, '← Back to stage', () => this.scene.start('playground'));
    observe('gallery');
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 800,
  height: 500,
  backgroundColor: '#1d2b3d',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Playground, Gallery],
});
