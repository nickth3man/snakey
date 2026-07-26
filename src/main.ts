import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { CANVAS_WIDTH, CANVAS_HEIGHT, BACKGROUND_COLOR } from "./config";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
  parent: document.body,
  scene: [GameScene],
};

new Phaser.Game(config);
