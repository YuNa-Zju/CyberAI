(function () {
  "use strict";

  let pendingCallback = null;
  let pendingHandle = 0;
  let fallbackHandle = 0;

  function runFrame(time) {
    if (!pendingCallback) return;
    const callback = pendingCallback;
    pendingCallback = null;
    callback(time);
  }

  function createPhaserLoop() {
    if (!window.Phaser) return null;

    return new Phaser.Game({
      type: Phaser.HEADLESS,
      width: 1,
      height: 1,
      banner: false,
      audio: { noAudio: true },
      fps: {
        target: 60,
        forceSetTimeOut: false,
      },
      scene: {
        update(time) {
          runFrame(time);
        },
      },
    });
  }

  const phaserLoop = createPhaserLoop();

  window.CyberPhaserDriver = {
    requestFrame(callback) {
      pendingHandle += 1;
      pendingCallback = callback;

      if (!phaserLoop) {
        fallbackHandle = window.requestAnimationFrame((time) => {
          pendingCallback = null;
          callback(time);
        });
      }

      return pendingHandle;
    },

    cancelFrame() {
      pendingCallback = null;
      if (fallbackHandle) {
        window.cancelAnimationFrame(fallbackHandle);
        fallbackHandle = 0;
      }
    },
  };
})();
