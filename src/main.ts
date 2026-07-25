import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 640,
  height: 480,
  backgroundColor: "#1a1a2e",
  parent: document.body,
  scene: [GameScene],
};

new Phaser.Game(config);
