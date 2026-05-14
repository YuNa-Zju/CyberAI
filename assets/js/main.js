import * as Phaser from "phaser";
import { getScores, healthCheck, submitScore } from "../ts/api";

window.Phaser = Phaser;
window.CyberApi = {
  getScores,
  healthCheck,
  submitScore,
};

await import("./phaser-driver.js");
await import("./game.js");
