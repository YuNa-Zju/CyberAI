      /* ======================================================
       * 📂 [Config 模块] (全局配置与状态)
       * ====================================================== */
      const isTouchDevice =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const joystickZone = document.getElementById("joystick-zone");
      if (isTouchDevice) joystickZone.style.display = "block";

      const canvas = document.getElementById("gameCanvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      const frameDriver = window.CyberPhaserDriver;
      function requestGameFrame(callback) {
        return frameDriver
          ? frameDriver.requestFrame(callback)
          : requestAnimationFrame(callback);
      }
      function cancelGameFrame(handle) {
        if (frameDriver) frameDriver.cancelFrame(handle);
        else cancelAnimationFrame(handle);
      }


      const COLORS = {
        bgTrail: "rgba(15, 16, 21, 0.85)",
        cyan: "#08f7fe",
        pink: "#fe53bb",
        yellow: "#f5d300",
        green: "#00ff41",
        red: "#ff3333",
        white: "#ffffff",
        purple: "#b026ff",
        slime: "#6bba2f",
      };

      const emojiTextureCache = new Map();
      function getEmojiTexture(emoji, size) {
        const key = `${emoji}:${size}`;
        let texture = emojiTextureCache.get(key);
        if (texture) return texture;

        const padding = Math.ceil(size * 0.35);
        const bitmap = document.createElement("canvas");
        bitmap.width = size + padding * 2;
        bitmap.height = size + padding * 2;
        const bitmapCtx = bitmap.getContext("2d");
        bitmapCtx.font = `${size}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', Arial`;
        bitmapCtx.textAlign = "center";
        bitmapCtx.textBaseline = "middle";
        bitmapCtx.fillStyle = COLORS.white;
        bitmapCtx.fillText(emoji, bitmap.width / 2, bitmap.height / 2);
        texture = {
          bitmap,
          halfWidth: bitmap.width / 2,
          halfHeight: bitmap.height / 2,
        };
        emojiTextureCache.set(key, texture);
        return texture;
      }

      function drawEmoji(emoji, x, y, size) {
        const texture = getEmojiTexture(emoji, size);
        ctx.drawImage(
          texture.bitmap,
          x - texture.halfWidth,
          y - texture.halfHeight,
        );
      }

      function compactLive(list) {
        let write = 0;
        for (let read = 0; read < list.length; read++) {
          const item = list[read];
          if (!item.isDead) list[write++] = item;
        }
        list.length = write;
        return list;
      }

      class SpatialGrid {
        constructor(size) {
          this.size = size;
          this.cells = new Map();
        }
        clear() {
          this.cells.clear();
        }
        key(x, y) {
          return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
        }
        add(obj) {
          const key = this.key(obj.x, obj.y);
          let cell = this.cells.get(key);
          if (!cell) {
            cell = [];
            this.cells.set(key, cell);
          }
          cell.push(obj);
        }
        rebuild(list) {
          this.clear();
          for (let i = 0; i < list.length; i++) {
            const obj = list[i];
            if (!obj.isDead) this.add(obj);
          }
        }
        query(x, y, radius, out) {
          out.length = 0;
          const minX = Math.floor((x - radius) / this.size);
          const maxX = Math.floor((x + radius) / this.size);
          const minY = Math.floor((y - radius) / this.size);
          const maxY = Math.floor((y + radius) / this.size);
          for (let gx = minX; gx <= maxX; gx++) {
            for (let gy = minY; gy <= maxY; gy++) {
              const cell = this.cells.get(`${gx},${gy}`);
              if (!cell) continue;
              for (let i = 0; i < cell.length; i++) out.push(cell[i]);
            }
          }
          return out;
        }
      }

      const enemyGrid = new SpatialGrid(180);
      const obstacleGrid = new SpatialGrid(220);
      const queryBuffer = [];
      const obstacleQueryBuffer = [];

      const mainMenu = document.getElementById("main-menu");
      const upgradeMenu = document.getElementById("upgrade-menu");
      const gameOverMenu = document.getElementById("game-over-menu");
      const pauseMenu = document.getElementById("pause-menu");
      const hud = document.getElementById("hud");
      const hpFill = document.getElementById("hp-fill");
      const expFill = document.getElementById("exp-fill");
      const mpFill = document.getElementById("mp-fill");
      const ultBtn = document.getElementById("ult-btn");
      const scoreDisplay = document.getElementById("score-display");
      const timeDisplay = document.getElementById("time-display");
      const levelDisplay = document.getElementById("level-display");
      const phaseDisplay = document.getElementById("phase-display");
      const crtOverlay = document.getElementById("crt-overlay");
      const bossHpContainer = document.getElementById("boss-hp-container");
      const bossHpFill = document.getElementById("boss-hp-fill");
      const bossWarning = document.getElementById("boss-warning");
      const bossNameText = document.getElementById("boss-name");
      const api = window.CyberApi;

      let animationId;
      let gameState = "MENU";
      let lastTime = 0,
        gameTime = 0,
        accumulator = 0;
      const TIME_STEP = 1 / 60;

      let currentPhase = 1;
      let bossActive = false,
        cutsceneTimer = 0;
      let nextBossSpawnTime = 75;
      let nextBuffSpawnTime = 15;
      let nextStoneSpawnTime = 120;
      let nextBugRainTime = 300;

      let player;
      let pets = [],
        enemies = [],
        bullets = [],
        enemyBullets = [],
        vomitBullets = [],
        curlingStones = [];
      let particles = [],
        expGems = [],
        items = [],
        obstacles = [],
        floatingTexts = [],
        bugDrops = [],
        bugZones = [],
        traps = [],
        tempTraps = [];
      let theBoss = null;

      const keys = {
        w: false,
        a: false,
        s: false,
        d: false,
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        Space: false,
      };
      const joystick = {
        active: false,
        x: 0,
        y: 0,
        originX: 0,
        originY: 0,
        deltaX: 0,
        deltaY: 0,
      };

      function togglePause(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (gameState === "PLAYING") {
          gameState = "PAUSED";
          pauseMenu.classList.remove("hidden");
        } else if (gameState === "PAUSED") {
          gameState = "PLAYING";
          pauseMenu.classList.add("hidden");
          lastTime = performance.now();
        }
      }

      function triggerUltBtn(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (player && gameState === "PLAYING") player.useUltimate();
      }

      /* ======================================================
       * 📂 [Save / Load 模块] (LocalStorage存取)
       * ====================================================== */
      function saveGame(e, silent = false) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (!player) return;
        const state = {
          player: {
            maxHp: player.maxHp,
            hp: player.hp,
            speed: player.speed,
            level: player.level,
            exp: player.exp,
            maxExp: player.maxExp,
            score: player.score,
            fireCooldown: player.fireCooldown,
            bulletDamage: player.bulletDamage,
            bulletSizeMult: player.bulletSizeMult,
            multiShot: player.multiShot,
            pierce: player.pierce,
            pickupRadius: player.pickupRadius,
            expMultiplier: player.expMultiplier,
            critChance: player.critChance,
            vampChance: player.vampChance,
            mpMultiplier: player.mpMultiplier,
            orbitalCount: player.orbitals.length,
            thornsDamage: player.thornsDamage,
          },
          currentPhase,
          gameTime,
          nextBossSpawnTime,
          nextBuffSpawnTime,
          nextStoneSpawnTime,
          nextBugRainTime,
        };
        localStorage.setItem("cyber_save", JSON.stringify(state));
        if (!silent) alert("💾 游戏进度已成功保存！");
      }

      function loadGame(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const stateStr = localStorage.getItem("cyber_save");
        if (!stateStr) return alert("❌ 没有找到任何存档！");

        try {
          const state = JSON.parse(stateStr);
          initGame(null, true);

          Object.assign(player, state.player);
          player.orbitals = [];
          for (let i = 0; i < state.player.orbitalCount; i++)
            player.addOrbital();

          currentPhase = state.currentPhase;
          gameTime = state.gameTime;
          nextBossSpawnTime = state.nextBossSpawnTime;
          nextBuffSpawnTime = state.nextBuffSpawnTime;
          nextStoneSpawnTime = state.nextStoneSpawnTime;
          nextBugRainTime = state.nextBugRainTime || gameTime + 10;

          updateHUD();
          alert("📂 进度读取成功，准备战斗！");
          togglePause();
        } catch (err) {
          alert("❌ 存档损坏，无法读取！");
        }
      }

      /* ======================================================
       * 📂 [Utils 模块] (核心难度引擎与数学算法)
       * ====================================================== */
      function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      function distSq(x1, y1, x2, y2) {
        return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
      }
      function seededRandom(x, y) {
        let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return n - Math.floor(n);
      }

      function getDifficultyScale(phase) {
        if (phase <= 4) {
          return 1 + (phase - 1) * 0.15;
        } else {
          return 1.45 * Math.pow(1.1, phase - 4);
        }
      }

      function checkCollisionFast(entity, obj) {
        let dx = entity.x - obj.x,
          dy = entity.y - obj.y;
        let distSquare = dx * dx + dy * dy;
        let minDist = entity.radius + obj.radius;
        if (distSquare < minDist * minDist) {
          let dist = Math.sqrt(distSquare);
          let overlap = minDist - dist;
          entity.x += (dx / dist) * overlap;
          entity.y += (dy / dist) * overlap;
          return true;
        }
        return false;
      }

      /* ======================================================
       * 📂 [Map 模块] (区块生成逻辑)
       * ====================================================== */
      const CHUNK_SIZE = 800;
      const VISIBLE_CHUNKS = 2;
      let loadedChunks = new Set();
      let chunkObstacles = new Map();
      let chunkTraps = new Map();

      function loadChunk(cx, cy) {
        const chunkKey = `${cx},${cy}`;
        const trapList = [];
        const numTraps = Math.floor(seededRandom(cx + 1.5, cy + 1.5) * 1.8);
        for (let i = 0; i < numTraps; i++) {
          const tx =
            cx * CHUNK_SIZE +
            seededRandom(cx + i * 0.5, cy + i * 0.6) * CHUNK_SIZE;
          const ty =
            cy * CHUNK_SIZE +
            seededRandom(cx + i * 0.7, cy + i * 0.8) * CHUNK_SIZE;
          if (distSq(tx, ty, 0, 0) < 160000) continue;
          trapList.push(new TrapZone(tx, ty));
        }
        chunkTraps.set(chunkKey, trapList);

        const obsList = [];
        const numObstacles = Math.floor(seededRandom(cx, cy) * 4) + 2;
        for (let i = 0; i < numObstacles; i++) {
          const ox =
            cx * CHUNK_SIZE +
            seededRandom(cx + i * 0.1, cy + i * 0.2) * CHUNK_SIZE;
          const oy =
            cy * CHUNK_SIZE +
            seededRandom(cx + i * 0.3, cy + i * 0.4) * CHUNK_SIZE;
          if (distSq(ox, oy, 0, 0) < 40000) continue;
          let inTrap = false;
          for (let trap of trapList) {
            if (
              distSq(ox, oy, trap.x, trap.y) <
              (trap.radius + 40) * (trap.radius + 40)
            ) {
              inTrap = true;
              break;
            }
          }
          if (inTrap) continue;
          obsList.push(new Obstacle(ox, oy));
        }
        chunkObstacles.set(chunkKey, obsList);
      }

      function updateChunks() {
        const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
        const playerChunkY = Math.floor(player.y / CHUNK_SIZE);
        let currentChunks = new Set(),
          chunksChanged = false;
        for (
          let cx = playerChunkX - VISIBLE_CHUNKS;
          cx <= playerChunkX + VISIBLE_CHUNKS;
          cx++
        ) {
          for (
            let cy = playerChunkY - VISIBLE_CHUNKS;
            cy <= playerChunkY + VISIBLE_CHUNKS;
            cy++
          ) {
            const chunkKey = `${cx},${cy}`;
            currentChunks.add(chunkKey);
            if (!loadedChunks.has(chunkKey)) {
              loadChunk(cx, cy);
              chunksChanged = true;
            }
          }
        }
        for (let chunkKey of loadedChunks) {
          if (!currentChunks.has(chunkKey)) {
            chunkObstacles.delete(chunkKey);
            chunkTraps.delete(chunkKey);
            chunksChanged = true;
          }
        }
        loadedChunks = currentChunks;

        if (chunksChanged) {
          obstacles = [];
          for (let obsList of chunkObstacles.values())
            obstacles.push(...obsList.filter((o) => !o.isDead));
          traps = [];
          for (let tList of chunkTraps.values()) traps.push(...tList);
        }
      }

      /* ======================================================
       * 📂 [Entities 模块] (各种游戏实体)
       * ====================================================== */
      class TrapZone {
        constructor(x, y, isTemp = false) {
          this.x = x;
          this.y = y;
          this.isTemp = isTemp;
          this.radius = isTemp ? 50 : 65;
          this.life = isTemp ? 300 : Infinity;
          this.isDead = false;
        }
        draw() {
          if (this.isTemp) ctx.globalAlpha = Math.max(0, this.life / 300);
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(176, 38, 255, 0.15)";
          ctx.fill();
          ctx.strokeStyle = "rgba(176, 38, 255, 0.6)";
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 10]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
          drawEmoji("☣️", this.x, this.y, 26);
          if (this.isTemp) ctx.globalAlpha = 1.0;
        }
        update() {
          if (this.isTemp) {
            this.life--;
            if (this.life <= 0) this.isDead = true;
          }
          if (
            distSq(player.x, player.y, this.x, this.y) <
            this.radius * this.radius
          )
            player.inTrap = true;
        }
      }

      class Obstacle {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 28;
          this.maxHp = 400;
          this.hp = this.maxHp;
          this.isDead = false;
        }
        draw() {
          drawEmoji("🧮", this.x, this.y, 35);
          if (this.hp < this.maxHp) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(this.x - 15, this.y - 22, 30, 4);
            ctx.fillStyle = COLORS.white;
            ctx.fillRect(
              this.x - 15,
              this.y - 22,
              30 * (this.hp / this.maxHp),
              4,
            );
          }
        }
        takeDamage(amount) {
          this.hp -= amount;
          if (this.hp <= 0) {
            this.isDead = true;
            createParticles(this.x, this.y, COLORS.white, 5);
          }
        }
      }

      class BuffItem {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 18;
          this.floatOffset = 0;
          this.isDead = false;
        }
        draw() {
          this.floatOffset = Math.sin(gameTime * 4) * 6;
          drawEmoji("💪", this.x, this.y + this.floatOffset, 28);
          ctx.beginPath();
          ctx.arc(
            this.x,
            this.y + this.floatOffset,
            this.radius + 6,
            0,
            Math.PI * 2,
          );
          ctx.strokeStyle = "rgba(245, 211, 0, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      class ShieldItem {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 18;
          this.floatOffset = 0;
          this.isDead = false;
        }
        draw() {
          this.floatOffset = Math.sin(gameTime * 4) * 6;
          drawEmoji("🛡️", this.x, this.y + this.floatOffset, 28);
          ctx.beginPath();
          ctx.arc(
            this.x,
            this.y + this.floatOffset,
            this.radius + 6,
            0,
            Math.PI * 2,
          );
          ctx.strokeStyle = "rgba(8, 247, 254, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      class StoneItem {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 25;
          this.floatOffset = 0;
          this.isDead = false;
        }
        draw() {
          this.floatOffset = Math.sin(gameTime * 2) * 8;
          drawEmoji("🥌", this.x, this.y + this.floatOffset, 35);
          ctx.beginPath();
          ctx.arc(
            this.x,
            this.y + this.floatOffset,
            this.radius + 10,
            0,
            Math.PI * 2,
          );
          ctx.strokeStyle = "rgba(8, 247, 254, 0.8)";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      class CurlingStone {
        constructor(x, y, vx, vy) {
          this.x = x;
          this.y = y;
          this.vx = vx;
          this.vy = vy;
          this.angle = Math.random() * Math.PI * 2;
          this.spin = (Math.random() - 0.5) * 0.5;
          this.isDead = false;
          this.life = 90;
        }
        draw() {
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.angle);
          drawEmoji("🥌", 0, 0, 60);
          ctx.restore();
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
          this.angle += this.spin;
          this.life--;
          if (this.life <= 0) this.isDead = true;
        }
      }

      class BugDrop {
        constructor(x, targetY) {
          this.x = x;
          this.y = targetY - 650;
          this.targetY = targetY;
          this.radius = 20;
          this.vy = 11 + Math.random() * 4;
          this.spin = (Math.random() - 0.5) * 0.35;
          this.angle = Math.random() * Math.PI * 2;
          this.isDead = false;
        }
        draw() {
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.angle);
          drawEmoji("🐛", 0, 0, 34);
          ctx.restore();
        }
        update() {
          this.y += this.vy;
          this.angle += this.spin;
          if (this.y >= this.targetY) {
            this.isDead = true;
            bugZones.push(new BugZone(this.x, this.targetY));
            floatingTexts.push(
              new FloatingText("线上怎么又有虫啊！🐛", this.x, this.targetY - 40, COLORS.green, true),
            );
          }
        }
      }

      class BugZone {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 95;
          this.life = 360;
          this.tick = 0;
          this.isDead = false;
        }
        draw() {
          const alpha = Math.max(0, this.life / 360);
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 255, 65, 0.12)";
          ctx.fill();
          ctx.strokeStyle = "rgba(0, 255, 65, 0.65)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 10]);
          ctx.stroke();
          ctx.setLineDash([]);
          drawEmoji("🌀", this.x - 24, this.y, 30);
          drawEmoji("🐛", this.x + 18, this.y - 8, 28);
          drawEmoji("💥", this.x + 4, this.y + 22, 24);
          ctx.globalAlpha = 1;
        }
        update() {
          this.life--;
          if (this.life <= 0) {
            this.isDead = true;
            return;
          }
          if (
            distSq(player.x, player.y, this.x, this.y) <
            (this.radius + player.radius) * (this.radius + player.radius)
          ) {
            player.inBugZone = true;
            if (this.tick <= 0) {
              player.takeDamage(3);
              this.tick = 40;
            }
          }
          if (this.tick > 0) this.tick--;
        }
      }

      class HeartItem {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 15;
          this.healAmount = 25;
          this.floatOffset = 0;
          this.isDead = false;
        }
        draw() {
          this.floatOffset = Math.sin(gameTime * 3) * 5;
          drawEmoji("❤️", this.x, this.y + this.floatOffset, 24);
        }
      }

      class VomitBullet {
        constructor(x, y, targetX, targetY, speed) {
          this.x = x;
          this.y = y;
          this.startX = x;
          this.startY = y;
          this.isDead = false;
          const angle = Math.atan2(targetY - y, targetX - x);
          this.vx = Math.cos(angle) * speed;
          this.vy = Math.sin(angle) * speed;
          this.travelSq = distSq(x, y, targetX, targetY);
        }
        draw() {
          drawEmoji("🤮", this.x, this.y, 20);
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
          if (
            distSq(this.startX, this.startY, this.x, this.y) >= this.travelSq
          ) {
            this.isDead = true;
            tempTraps.push(new TrapZone(this.x, this.y, true));
          }
        }
      }

      class Orbital {
        constructor(owner, index) {
          this.owner = owner;
          this.index = index;
          this.radius = 12;
          this.damage = 20;
          this.x = 0;
          this.y = 0;
        }
        update(totalOrbitals) {
          const angle =
            this.owner.orbitalAngle +
            (this.index * Math.PI * 2) / totalOrbitals;
          const distance = 130;
          this.x = this.owner.x + Math.cos(angle) * distance;
          this.y = this.owner.y + Math.sin(angle) * distance;

          let targetList = theBoss ? [theBoss, ...enemies] : enemies;
          for (let e of targetList) {
            if (e.isDead) continue;
            if (
              distSq(this.x, this.y, e.x, e.y) <
              (this.radius + e.radius) ** 2
            ) {
              let currentDamage =
                player.damageBuffTimer > 0 ? this.damage * 2.0 : this.damage;
              player.onHitEnemy(false, e === theBoss);
              if (e === theBoss) {
                theBoss.takeDamage(currentDamage * 0.1);
              } else if (!e.takeDamage(currentDamage, this.x, this.y)) {
                const pushAngle = Math.atan2(e.y - this.y, e.x - this.x);
                e.x += Math.cos(pushAngle) * 5;
                e.y += Math.sin(pushAngle) * 5;
              }
            }
          }

          enemyBullets.forEach((eb) => {
            if (
              !eb.isDead &&
              distSq(this.x, this.y, eb.x, eb.y) <
                (this.radius + eb.radius) ** 2
            ) {
              eb.isDead = true;
              createParticles(eb.x, eb.y, COLORS.white, 0.5);
            }
          });
          vomitBullets.forEach((vb) => {
            if (
              !vb.isDead &&
              distSq(this.x, this.y, vb.x, vb.y) < (this.radius + 10) ** 2
            ) {
              vb.isDead = true;
              createParticles(vb.x, vb.y, COLORS.green, 0.5);
            }
          });
        }
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fillStyle =
            player.damageBuffTimer > 0 ? COLORS.pink : COLORS.cyan;
          ctx.fill();
          ctx.strokeStyle = COLORS.white;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      class Player {
        constructor() {
          this.x = 0;
          this.y = 0;
          this.radius = 20;
          this.maxHp = 100;
          this.hp = this.maxHp;

          this.speed = 3.0;
          this.level = 1;
          this.exp = 0;
          this.maxExp = 10;
          this.score = 0;
          this.fireCooldown = 35;
          this.currentCooldown = 0;
          this.bulletDamage = 40;
          this.bulletSpeed = 14;
          this.bulletSizeMult = 1.0;
          this.multiShot = 1;
          this.pierce = 1;

          this.pickupRadius = 90;
          this.expMultiplier = 1.0;
          this.critChance = 0.0;
          this.critMult = 2.0;
          this.vampChance = 0.0;
          this.orbitals = [];
          this.orbitalAngle = 0;
          this.invincibleTimer = 0;
          this.damageBuffTimer = 0;
          this.inTrap = false;
          this.inBugZone = false;
          this.trapTick = 0;

          this.shieldBuffTimer = 0;
          this.vampCooldown = 0;

          this.mp = 0;
          this.maxMp = 100;
          this.mpMultiplier = 1.0;
        }
        addOrbital() {
          this.orbitals.push(new Orbital(this, this.orbitals.length));
        }

        onHitEnemy(isKill, isBoss) {
          let baseGain = isKill ? 1.5 : 0.2;
          if (isBoss) baseGain = 0.5;

          let penalty = Math.pow(1.1, currentPhase - 1);
          this.mp = Math.min(
            this.maxMp,
            this.mp + (baseGain * this.mpMultiplier) / penalty,
          );
          updateHUD();

          if (
            this.vampChance > 0 &&
            Math.random() < this.vampChance &&
            this.vampCooldown <= 0
          ) {
            this.heal(1);
            this.vampCooldown = 0.5;
          }
        }

        useUltimate() {
          if (this.mp >= this.maxMp) {
            this.mp = 0;
            this.damageBuffTimer = 8;

            for (let i = 0; i < 12; i++) {
              const angle = ((Math.PI * 2) / 12) * i;
              curlingStones.push(
                new CurlingStone(
                  this.x,
                  this.y,
                  Math.cos(angle) * (15 + Math.random() * 5),
                  Math.sin(angle) * (15 + Math.random() * 5),
                ),
              );
            }

            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            floatingTexts.push(
              new FloatingText(
                "✨ 净空矩阵!",
                this.x,
                this.y - 50,
                COLORS.cyan,
                true,
              ),
            );
            updateHUD();
          }
        }

        draw() {
          if (
            this.invincibleTimer > 0 &&
            Math.floor(this.invincibleTimer / 6) % 2 === 0
          )
            return;

          if (this.shieldBuffTimer > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 25, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(8, 247, 254, 0.3)";
            ctx.fill();
            ctx.strokeStyle = "rgba(8, 247, 254, 0.9)";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.lineWidth = 1;
          }

          drawEmoji("🥸", this.x, this.y + 2, 34);
          if (this.damageBuffTimer > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 15, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(245, 211, 0, 0.8)";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.lineWidth = 1;
          }
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.pickupRadius, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
          ctx.stroke();
          this.orbitals.forEach((o) => o.draw());
        }
        update() {
          if (this.invincibleTimer > 0) this.invincibleTimer--;
          if (this.damageBuffTimer > 0) this.damageBuffTimer -= TIME_STEP;
          if (this.shieldBuffTimer > 0) this.shieldBuffTimer -= TIME_STEP;
          if (this.vampCooldown > 0) this.vampCooldown -= TIME_STEP;

          let dx = 0,
            dy = 0;
          if (keys.w || keys.ArrowUp) dy -= 1;
          if (keys.s || keys.ArrowDown) dy += 1;
          if (keys.a || keys.ArrowLeft) dx -= 1;
          if (keys.d || keys.ArrowRight) dx += 1;

          if (keys.Space) {
            keys.Space = false;
            this.useUltimate();
          }

          if (joystick.active) {
            const dist = Math.sqrt(
              joystick.deltaX * joystick.deltaX +
                joystick.deltaY * joystick.deltaY,
            );
            if (dist > 0) {
              dx = joystick.deltaX / dist;
              dy = joystick.deltaY / dist;
              const speedMod = Math.min(dist / 50, 1);
              dx *= speedMod;
              dy *= speedMod;
            }
          } else {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              dx /= dist;
              dy /= dist;
            }
          }

          let currentSpeed = this.speed;
          if (this.inTrap) {
            currentSpeed *= 0.4;
            if (this.trapTick <= 0) {
              this.takeDamage(4);
              this.trapTick = 30;
            } else this.trapTick--;
          } else this.trapTick = 0;
          if (this.inBugZone) currentSpeed *= 0.72;

          this.x += dx * currentSpeed;
          this.y += dy * currentSpeed;
          obstacles.forEach((obs) => checkCollisionFast(this, obs));

          this.orbitalAngle += 0.06;
          this.orbitals.forEach((o) => o.update(this.orbitals.length));
          if (this.currentCooldown > 0) this.currentCooldown--;
          else this.fire();
        }
        fire() {
          let targetList = theBoss ? [theBoss, ...enemies] : enemies;
          if (targetList.length === 0) return;
          let nearestEnemy = null,
            minDistSq = Infinity;
          for (let e of targetList) {
            if (e.isDead) continue;
            const dSq = distSq(e.x, e.y, this.x, this.y);
            if (dSq < minDistSq) {
              minDistSq = dSq;
              nearestEnemy = e;
            }
          }

          if (nearestEnemy && minDistSq < 810000) {
            this.currentCooldown = this.fireCooldown;
            const angleToEnemy = Math.atan2(
              nearestEnemy.y - this.y,
              nearestEnemy.x - this.x,
            );
            const spread = 0.15,
              startAngle = angleToEnemy - (spread * (this.multiShot - 1)) / 2;
            for (let i = 0; i < this.multiShot; i++) {
              const angle = startAngle + i * spread;
              const isCrit = Math.random() < this.critChance;
              let baseDmg = this.bulletDamage;
              if (this.damageBuffTimer > 0) baseDmg *= 2.0;
              const dmg = isCrit ? baseDmg * this.critMult : baseDmg;
              let color = isCrit
                ? COLORS.yellow
                : this.damageBuffTimer > 0
                  ? COLORS.pink
                  : COLORS.white;
              const size = (isCrit ? 8 : 6) * this.bulletSizeMult;
              bullets.push(
                new Bullet(
                  this.x,
                  this.y,
                  Math.cos(angle) * this.bulletSpeed,
                  Math.sin(angle) * this.bulletSpeed,
                  dmg,
                  size,
                  this.pierce,
                  color,
                  isCrit,
                ),
              );
            }
          }
        }
        gainExp(amount) {
          this.exp += amount * this.expMultiplier;
          if (this.exp >= this.maxExp) {
            this.exp -= this.maxExp;
            this.levelUp();
          }
          updateHUD();
        }
        levelUp() {
          this.level++;
          this.maxExp = Math.floor(this.maxExp * 1.25);
          gameState = "UPGRADING";
          generateUpgradeOptions();
        }
        takeDamage(amount) {
          if (gameState !== "PLAYING") return;
          if (this.shieldBuffTimer > 0) {
            floatingTexts.push(
              new FloatingText("免疫", this.x, this.y - 30, COLORS.cyan, true),
            );
            return;
          }
          if (this.invincibleTimer > 0) return;

          this.hp -= amount;
          this.invincibleTimer = 30;
          crtOverlay.classList.remove("damage-glitch");
          void crtOverlay.offsetWidth;
          crtOverlay.classList.add("damage-glitch");
          floatingTexts.push(
            new FloatingText("-" + amount, this.x, this.y, COLORS.red),
          );
          if (this.hp <= 0) {
            this.hp = 0;
            endGame();
          }
          updateHUD();
        }
        heal(amount) {
          if (this.hp >= this.maxHp) return;
          this.hp = Math.min(this.maxHp, this.hp + amount);
          floatingTexts.push(
            new FloatingText("+" + amount, this.x, this.y - 20, COLORS.green),
          );
          updateHUD();
        }
      }

      class Pet {
        constructor(owner) {
          this.owner = owner;
          this.x = owner.x;
          this.y = owner.y;
          this.offsetX = (Math.random() - 0.5) * 100;
          this.offsetY = (Math.random() - 0.5) * 100;
          this.radius = 12;
          this.currentCooldown = 0;
          this.bulletSpeed = 12;
        }
        draw() {
          drawEmoji("🤖", this.x, this.y + 2, 20);
          drawEmoji("💚", this.x + 8, this.y - 10, 10);
        }
        update() {
          const targetX = this.owner.x + this.offsetX;
          const targetY = this.owner.y + this.offsetY;
          this.x += (targetX - this.x) * 0.08;
          this.y += (targetY - this.y) * 0.08;
          obstacles.forEach((obs) => checkCollisionFast(this, obs));
          if (this.currentCooldown > 0) this.currentCooldown--;
          else this.fire();
        }
        fire() {
          let targetList = theBoss ? [theBoss, ...enemies] : enemies;
          if (targetList.length === 0) return;
          let nearestEnemy = null,
            minDistSq = Infinity;
          for (let e of targetList) {
            if (e.isDead) continue;
            const dSq = distSq(this.x, this.y, e.x, e.y);
            if (dSq < minDistSq) {
              minDistSq = dSq;
              nearestEnemy = e;
            }
          }
          if (nearestEnemy && minDistSq < 360000) {
            // 🤖 宠物射速和伤害随主角动态成长
            let dynamicCooldown = Math.max(10, player.fireCooldown * 1.2);
            this.currentCooldown = dynamicCooldown;
            const angle = Math.atan2(
              nearestEnemy.y - this.y,
              nearestEnemy.x - this.x,
            );
            let baseDamage = player.bulletDamage * 0.6 + 10;
            let currentDamage =
              player.damageBuffTimer > 0 ? baseDamage * 2.0 : baseDamage;
            bullets.push(
              new Bullet(
                this.x,
                this.y,
                Math.cos(angle) * this.bulletSpeed,
                Math.sin(angle) * this.bulletSpeed,
                currentDamage,
                5,
                1,
                COLORS.green,
                false,
              ),
            );
          }
        }
      }

      class Enemy {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 20;
          this.isDead = false;

          let diffScale = getDifficultyScale(currentPhase);
          let baseSpeedMult = Math.min(
            1 + (diffScale - 1) * 0.5 + gameTime / 300,
            2.5,
          );

          const timeScale = diffScale + gameTime / 240;

          const rand = Math.random();
          if (rand < 0.15) this.type = 2;
          else if (rand < 0.35) this.type = 1;
          else if (rand < 0.5) this.type = 3;
          else if (rand < 0.6) this.type = 4;
          else this.type = 0;

          this.currentCooldown = Math.random() * 60;
          if (this.type === 1) {
            this.speed = (1.8 + Math.random() * 0.5) * baseSpeedMult * 0.8;
            this.hp = 15 * timeScale;
            this.color = COLORS.pink;
            this.exp = 3;
          } else if (this.type === 2) {
            this.speed = (0.7 + Math.random() * 0.3) * baseSpeedMult * 0.8;
            this.hp = 80 * timeScale;
            this.color = COLORS.yellow;
            this.radius = 28;
            this.exp = 8;
          } else if (this.type === 3) {
            this.speed = (1.2 + Math.random() * 0.3) * baseSpeedMult;
            this.hp = 20 * timeScale;
            this.color = COLORS.purple;
            this.exp = 4;
          } else if (this.type === 4) {
            this.speed = (0.8 + Math.random() * 0.2) * baseSpeedMult;
            this.hp = 35 * timeScale;
            this.color = COLORS.slime;
            this.exp = 5;
          } else {
            this.speed = (1.0 + Math.random() * 0.4) * baseSpeedMult;
            this.hp = 20 * timeScale;
            this.color = COLORS.cyan;
            this.exp = 2;
          }
          this.maxHp = this.hp;
          this.damage = 10 + Math.floor(timeScale * 3);
          this.knockbackX = 0;
          this.knockbackY = 0;
        }
        draw() {
          let emoji = "🤖";
          if (this.type === 4) emoji = "🤢";
          drawEmoji(emoji, this.x, this.y + 4, this.radius * 1.8);

          if (this.hp < this.maxHp) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(this.x - 15, this.y - 25, 30, 4);
            ctx.fillStyle = this.color;
            ctx.fillRect(
              this.x - 15,
              this.y - 25,
              30 * (this.hp / this.maxHp),
              4,
            );
          }
        }
        update() {
          if (
            Math.abs(this.knockbackX) > 0.1 ||
            Math.abs(this.knockbackY) > 0.1
          ) {
            this.x += this.knockbackX;
            this.y += this.knockbackY;
            this.knockbackX *= 0.8;
            this.knockbackY *= 0.8;
          } else {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const dSq = distSq(player.x, player.y, this.x, this.y);

            if (this.type === 3) {
              if (dSq > 122500) {
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;
              } else {
                if (this.currentCooldown > 0) this.currentCooldown--;
                else {
                  this.currentCooldown = 120;
                  enemyBullets.push(
                    new EnemyBullet(
                      this.x,
                      this.y,
                      Math.cos(angle) * 5,
                      Math.sin(angle) * 5,
                      COLORS.purple,
                    ),
                  );
                }
              }
            } else if (this.type === 4) {
              if (dSq > 160000) {
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;
              } else {
                if (this.currentCooldown > 0) this.currentCooldown--;
                else {
                  this.currentCooldown = 180;
                  vomitBullets.push(
                    new VomitBullet(this.x, this.y, player.x, player.y, 6),
                  );
                }
              }
            } else {
              this.x += Math.cos(angle) * this.speed;
              this.y += Math.sin(angle) * this.speed;
            }
          }
          obstacles.forEach((obs) => checkCollisionFast(this, obs));
        }
        takeDamage(amount, sourceX, sourceY, isCrit = false) {
          this.hp -= amount;
          const angle = Math.atan2(this.y - sourceY, this.x - sourceX);
          this.knockbackX = Math.cos(angle) * 3;
          this.knockbackY = Math.sin(angle) * 3;
          floatingTexts.push(
            new FloatingText(
              Math.floor(amount),
              this.x,
              this.y,
              isCrit ? COLORS.yellow : COLORS.white,
              isCrit,
            ),
          );

          if (this.hp <= 0) {
            this.isDead = true;
            createParticles(this.x, this.y, this.color);
            expGems.push(new ExpGem(this.x, this.y, this.exp));
            if (Math.random() < 0.02)
              items.push(new HeartItem(this.x, this.y + 10));
            player.onHitEnemy(true, false);
            player.score++;
            updateHUD();
            return true;
          }
          return false;
        }
      }

      class Boss {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.radius = 70;
          this.maxHp = 4000 * Math.pow(1.5, currentPhase - 1);
          this.hp = this.maxHp;

          this.type = (currentPhase - 1) % 3;

          if (this.type === 1) {
            this.speed = 2.0 + currentPhase * 0.1;
          } else if (this.type === 2) {
            this.speed = 0.8 + currentPhase * 0.1;
            this.maxHp *= 1.5;
            this.hp = this.maxHp;
          } else {
            this.speed = 1.2 + currentPhase * 0.1;
          }

          this.state = 0;
          this.timer = 0;
          this.isDead = false;

          bossHpContainer.style.display = "block";
          const names = ["大模型意志主体 🤖", "赛博猞猁 🐱", "重装数据虾 🦞"];
          bossNameText.innerText = names[this.type];
        }
        draw() {
          let emj = this.type === 1 ? "🐱" : this.type === 2 ? "🦞" : "🤖";
          drawEmoji(emj, this.x, this.y + 10, 120);
          ctx.beginPath();
          ctx.arc(
            this.x,
            this.y,
            this.radius + Math.sin(gameTime * 5) * 10,
            0,
            Math.PI * 2,
          );
          ctx.strokeStyle = "rgba(255, 51, 51, 0.6)";
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        update() {
          this.timer++;
          const angleToPlayer = Math.atan2(
            player.y - this.y,
            player.x - this.x,
          );
          this.x += Math.cos(angleToPlayer) * this.speed;
          this.y += Math.sin(angleToPlayer) * this.speed;

          obstacles.forEach((obs) => {
            if (
              distSq(this.x, this.y, obs.x, obs.y) <
              Math.pow(this.radius + obs.radius, 2)
            ) {
              obs.takeDamage(2);
            }
          });
          obstacles.forEach((obs) => checkCollisionFast(this, obs));

          if (this.type === 0) {
            if (this.timer % 150 === 0) this.state = (this.state + 1) % 2;
            if (this.state === 0) {
              if (this.timer % 70 === 0) {
                const bulletsNum = 16 + currentPhase * 4;
                for (let i = 0; i < bulletsNum; i++) {
                  const angle = ((Math.PI * 2) / bulletsNum) * i;
                  enemyBullets.push(
                    new EnemyBullet(
                      this.x,
                      this.y,
                      Math.cos(angle) * 5,
                      Math.sin(angle) * 5,
                      COLORS.red,
                    ),
                  );
                }
              }
            } else {
              if (this.timer % Math.max(2, 6 - currentPhase) === 0) {
                const angle = this.timer * 0.15;
                enemyBullets.push(
                  new EnemyBullet(
                    this.x,
                    this.y,
                    Math.cos(angle) * 6,
                    Math.sin(angle) * 6,
                    COLORS.red,
                  ),
                );
                enemyBullets.push(
                  new EnemyBullet(
                    this.x,
                    this.y,
                    Math.cos(angle + Math.PI) * 6,
                    Math.sin(angle + Math.PI) * 6,
                    COLORS.red,
                  ),
                );
              }
            }
          } else if (this.type === 1) {
            if (this.timer % 120 === 0) {
              this.state = 10;
            }
            if (this.state > 0 && this.timer % 5 === 0) {
              enemyBullets.push(
                new EnemyBullet(
                  this.x,
                  this.y,
                  Math.cos(angleToPlayer) * 10,
                  Math.sin(angleToPlayer) * 10,
                  COLORS.pink,
                ),
              );
              this.state--;
            }
          } else if (this.type === 2) {
            if (this.timer % 80 === 0) {
              const randTargetX = player.x + (Math.random() - 0.5) * 300;
              const randTargetY = player.y + (Math.random() - 0.5) * 300;
              vomitBullets.push(
                new VomitBullet(this.x, this.y, randTargetX, randTargetY, 8),
              );
              vomitBullets.push(
                new VomitBullet(this.x, this.y, player.x, player.y, 8),
              );
            }
          }

          bossHpFill.style.width = `${Math.max(0, this.hp / this.maxHp) * 100}%`;
        }
        takeDamage(amount) {
          this.hp -= amount;
          floatingTexts.push(
            new FloatingText(
              Math.floor(amount),
              this.x,
              this.y,
              COLORS.yellow,
              true,
            ),
          );

          if (this.hp <= 0) {
            this.isDead = true;
            createParticles(this.x, this.y, COLORS.red, 10);
            bossHpContainer.style.display = "none";
            for (let i = 0; i < 30; i++)
              expGems.push(
                new ExpGem(
                  this.x + (Math.random() - 0.5) * 150,
                  this.y + (Math.random() - 0.5) * 150,
                  10,
                ),
              );
            for (let i = 0; i < 5; i++)
              items.push(
                new HeartItem(
                  this.x + (Math.random() - 0.5) * 100,
                  this.y + (Math.random() - 0.5) * 100,
                ),
              );

            player.onHitEnemy(true, true);
            gameState = "CUTSCENE";
            cutsceneTimer = 0;
            saveGame(null, true);
            updateHUD();
            return true;
          }
          return false;
        }
      }

      class Bullet {
        constructor(x, y, vx, vy, damage, size, pierce, color, isCrit) {
          this.x = x;
          this.y = y;
          this.vx = vx;
          this.vy = vy;
          this.damage = damage;
          this.radius = size;
          this.pierce = pierce;
          this.color = color;
          this.isCrit = isCrit;
          this.hitEnemies = new Set();
          this.isDead = false;
        }
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fillStyle = this.color;
          ctx.fill();
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
          if (Math.random() < 0.2)
            particles.push(new Particle(this.x, this.y, this.color, 0.6));
        }
      }
      class EnemyBullet {
        constructor(x, y, vx, vy, color) {
          this.x = x;
          this.y = y;
          this.vx = vx;
          this.vy = vy;
          this.radius = 9;
          this.color = color;
          this.isDead = false;
        }
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fillStyle = this.color;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.white;
          ctx.fill();
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
        }
      }
      class ExpGem {
        constructor(x, y, value) {
          this.x = x;
          this.y = y;
          this.value = value;
          this.radius = value > 2 ? 6 : 4;
          this.color = value > 2 ? COLORS.yellow : COLORS.cyan;
          this.isMoving = false;
          this.isDead = false;
        }
        draw() {
          ctx.beginPath();
          ctx.moveTo(this.x, this.y - this.radius);
          ctx.lineTo(this.x + this.radius, this.y);
          ctx.lineTo(this.x, this.y + this.radius);
          ctx.lineTo(this.x - this.radius, this.y);
          ctx.closePath();
          ctx.fillStyle = this.color;
          ctx.fill();
        }
        update() {
          const dSq = distSq(player.x, player.y, this.x, this.y);
          if (
            dSq < player.pickupRadius * player.pickupRadius ||
            this.isMoving
          ) {
            this.isMoving = true;
            const speed = 14;
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angle) * speed;
            this.y += Math.sin(angle) * speed;
          }
        }
      }
      class Particle {
        constructor(x, y, color, sizeMultiplier = 1) {
          this.x = x;
          this.y = y;
          this.color = color;
          this.radius = (Math.random() * 3 + 1) * sizeMultiplier;
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 2 + 1;
          this.vx = Math.cos(angle) * speed;
          this.vy = Math.sin(angle) * speed;
          this.life = 1.0;
          this.decay = Math.random() * 0.05 + 0.03;
          this.isDead = false;
        }
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fillStyle = this.color;
          ctx.globalAlpha = this.life;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
          this.life -= this.decay;
          if (this.life <= 0) this.isDead = true;
        }
      }
      class FloatingText {
        constructor(text, x, y, color, isCrit = false) {
          this.text = text;
          this.x = x + (Math.random() - 0.5) * 20;
          this.y = y;
          this.color = color;
          this.life = 1.0;
          this.vy = -1.5;
          this.fontSize = isCrit ? 26 : 16;
          this.isDead = false;
        }
        draw() {
          ctx.font = `bold ${this.fontSize}px 'Share Tech Mono', Arial`;
          ctx.textAlign = "center";
          ctx.fillStyle = this.color;
          ctx.globalAlpha = this.life;
          ctx.fillText(this.text, this.x, this.y);
          ctx.globalAlpha = 1.0;
        }
        update() {
          this.y += this.vy;
          this.life -= 0.025;
          if (this.life <= 0) this.isDead = true;
        }
      }

      function createParticles(x, y, color, multiplier = 1) {
        for (let i = 0; i < 10 * multiplier; i++)
          particles.push(new Particle(x, y, color, multiplier));
      }

      /* ======================================================
       * 📂 [Systems 模块] (核心游戏逻辑系统)
       * ====================================================== */
      function getUpgrades() {
        let p = currentPhase;
        let list = [
          {
            id: "dmg",
            icon: "⚔️",
            title: "逻辑强化",
            desc: `增加子弹杀伤力 (+${15 + p * 5})`,
            apply: () => (player.bulletDamage += 15 + p * 5),
          },
          {
            id: "spd",
            icon: "⚡",
            title: "思维敏捷",
            desc: "加快思考频率 (射速提升10%)",
            apply: () =>
              (player.fireCooldown = Math.max(5, player.fireCooldown * 0.9)),
          },
          {
            id: "mul",
            icon: "🔱",
            title: "多线程思考",
            desc: "同时迸发更多想法 (发射弹道+1)",
            apply: () => (player.multiShot += 1),
          },
          {
            id: "prc",
            icon: "☄️",
            title: "深度洞察",
            desc: "思想可以穿透多个算法 (穿透+1)",
            apply: () => (player.pierce += 1),
          },
          {
            id: "mhp",
            icon: "🛡️",
            title: "认知护盾",
            desc: `强化防线 (生命上限+${20 + p * 10}，立刻恢复)`,
            apply: () => {
              player.maxHp += 20 + p * 10;
              player.heal(20 + p * 10);
            },
          },
          {
            id: "mov",
            icon: "💨",
            title: "反追踪走位",
            desc: "行动更加敏捷 (移动速度+10%)",
            apply: () => (player.speed *= 1.1),
          },
          {
            id: "pet",
            icon: "🤝",
            title: "共存协议",
            desc: "感化一个🤖作为辅助炮塔",
            apply: () => pets.push(new Pet(player)),
          },
          {
            id: "crit",
            icon: "💥",
            title: "致命逻辑",
            desc: `概率造成双倍黄字暴击 (+${10 + p * 2}%)`,
            apply: () => (player.critChance += 0.1 + p * 0.02),
          },
          {
            id: "size",
            icon: "🎯",
            title: "宽泛定义",
            desc: "增加子弹判定范围 (+30%)",
            apply: () => (player.bulletSizeMult += 0.3),
          },
          {
            id: "exp",
            icon: "📚",
            title: "学习效率",
            desc: "更快获取新知识 (+25%)",
            apply: () => (player.expMultiplier += 0.25),
          },
          {
            id: "vamp",
            icon: "💉",
            title: "数据融合",
            desc: "吸收代码碎片 (每次伤害概率回血+5%)",
            apply: () => (player.vampChance += 0.05),
          },
          {
            id: "orbit",
            icon: "🪐",
            title: "自洽闭环",
            desc: "在身边生成分布式高速旋转切割球 (上限3)",
            apply: () => player.addOrbital(),
          },
          {
            id: "range",
            icon: "🧲",
            title: "引力陷阱",
            desc: "扩大拾取范围 (+25%)",
            apply: () => (player.pickupRadius *= 1.25),
          },
          {
            id: "mana",
            icon: "🔋",
            title: "超频充能",
            desc: "大招充能效率提升 (+20%)",
            apply: () => (player.mpMultiplier += 0.2),
          },
        ];

        if (player && player.orbitals.length >= 3) {
          list = list.filter((u) => u.id !== "orbit");
        }
        return list;
      }

      function generateUpgradeOptions() {
        const container = document.getElementById("upgrade-options");
        container.innerHTML = "";
        upgradeMenu.classList.remove("hidden");
        const availableUpgrades = getUpgrades();
        const shuffled = [...availableUpgrades].sort(() => 0.5 - Math.random());
        const options = shuffled.slice(0, 3);
        options.forEach((opt) => {
          const div = document.createElement("div");
          div.className = "upgrade-card";
          const selectUpgrade = (e) => {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            opt.apply();
            upgradeMenu.classList.add("hidden");
            gameState = "PLAYING";
            lastTime = performance.now();
            requestGameFrame(gameLoop);
          };
          div.onclick = selectUpgrade;
          div.ontouchstart = selectUpgrade;
          div.innerHTML = `<div class="upgrade-icon">${opt.icon}</div><div class="upgrade-content"><div class="upgrade-title">${opt.title}</div><div class="upgrade-desc">${opt.desc}</div></div>`;
          container.appendChild(div);
        });
      }

      function initGame(e, isLoading = false) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }

        if (isTouchDevice) {
          document.getElementById("ult-btn").style.display = "flex";
          document.getElementById("joystick-zone").style.display = "block";
        }

        if (!isLoading) {
          player = new Player();
          gameTime = 0;
          currentPhase = 1;
          nextBossSpawnTime = 75;
          nextBuffSpawnTime = 10;
          nextStoneSpawnTime = 105;
          nextBugRainTime = 300;
        }

        pets = [];
        enemies = [];
        bullets = [];
        enemyBullets = [];
        vomitBullets = [];
        curlingStones = [];
        particles = [];
        expGems = [];
        items = [];
        obstacles = [];
        floatingTexts = [];
        bugDrops = [];
        bugZones = [];
        traps = [];
        tempTraps = [];
        theBoss = null;

        lastTime = performance.now();
        accumulator = 0;
        bossActive = false;
        cutsceneTimer = 0;

        mainMenu.classList.add("hidden");
        gameOverMenu.classList.add("hidden");
        upgradeMenu.classList.add("hidden");
        pauseMenu.classList.add("hidden");
        hud.classList.remove("hidden");
        bossHpContainer.style.display = "none";
        bossWarning.style.display = "none";
        loadedChunks.clear();
        chunkObstacles.clear();
        chunkTraps.clear();
        updateChunks();

        if (!isLoading) {
          gameState = "PLAYING";
          updateHUD();
          requestGameFrame(gameLoop);
        }
        fetchLeaderboard();
      }

      function endGame() {
        gameState = "GAMEOVER";
        hud.classList.add("hidden");
        bossHpContainer.style.display = "none";
        gameOverMenu.classList.remove("hidden");
        document.getElementById("final-time").innerText = formatTime(gameTime);
        document.getElementById("final-score").innerText = player.score;
        document.getElementById("final-phase").innerText = currentPhase;
        document.getElementById("ult-btn").style.display = "none";
        localStorage.removeItem("cyber_save");
        submitScore(player.score, currentPhase);
      }

      function returnToHome(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        gameState = "MENU";
        gameOverMenu.classList.add("hidden");
        pauseMenu.classList.add("hidden");
        hud.classList.add("hidden");
        mainMenu.classList.remove("hidden");
        bossHpContainer.style.display = "none";
        bossWarning.style.display = "none";
        document.getElementById("ult-btn").style.display = "none";

        cancelGameFrame(animationId);
        ctx.fillStyle = COLORS.bgTrail;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        fetchLeaderboard();
      }

      // ================= 排行榜调用逻辑 =================
      async function fetchLeaderboard() {
        const list = document.getElementById("leaderboard-list");
        if (!api) {
          list.innerHTML =
            '<li style="text-align:center; color:var(--red); margin-top:20px;">排行榜模块加载失败</li>';
          return;
        }
        try {
          let data = await api.getScores();

          const uniqueData = {};
          data.forEach((record) => {
            const name = record.player_name || "匿名";
            if (!uniqueData[name] || uniqueData[name].score < record.score) {
              uniqueData[name] = record;
            }
          });
          data = Object.values(uniqueData)
            .sort((a, b) => b.score - a.score)
            .slice(0, 50);

          list.innerHTML = "";
          if (data.length === 0) {
            list.innerHTML =
              '<li style="text-align:center; color:#aaa; margin-top:20px;">暂无数据，等你来战！</li>';
            return;
          }
          data.forEach((record, index) => {
            const li = document.createElement("li");
            li.className = "leaderboard-item";
            let rank =
              index === 0
                ? "🥇"
                : index === 1
                  ? "🥈"
                  : index === 2
                    ? "🥉"
                    : `NO.${index + 1}`;
            li.innerHTML = `<span>${rank} ${record.player_name || "匿名"}</span><span>阶段${record.phase || 1} / ${record.score || 0}分</span>`;
            list.appendChild(li);
          });
        } catch (e) {
          console.error("排行榜拉取失败:", e);
          list.innerHTML =
            `<li style="text-align:center; color:var(--red); margin-top:20px;">${e?.message || "无法连接到排行榜服务器"}</li>`;
        }
      }

      function submitScore(score, phase) {
        if (score === 0) return;

        setTimeout(async () => {
          let savedName = localStorage.getItem("playerName") || "🥸 独立思考者";
          let name = prompt(
            "你已被蒸馏！请输入你的代号录入荣誉殿堂：",
            savedName,
          );
          if (!name) return;
          localStorage.setItem("playerName", name);

          if (!api) {
            alert("❌ 成绩提交失败，排行榜模块加载失败。");
            return;
          }

          try {
            await api.submitScore({
              player_name: name,
              score: score,
              phase: phase,
            });
            alert("✅ 成绩记录成功！");
            fetchLeaderboard();
          } catch (e) {
            alert(`❌ 成绩提交失败，${e?.message || "无法连接到后端服务器。"}`);
            console.error(e);
          }
        }, 500);
      }

      if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", fetchLeaderboard, {
          once: true,
        });
      } else {
        fetchLeaderboard();
      }

      function spawnBugRain() {
        const count = Math.min(8, 3 + Math.floor((currentPhase - 5) * 0.8));
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 160 + Math.random() * 520;
          bugDrops.push(
            new BugDrop(
              player.x + Math.cos(angle) * dist,
              player.y + Math.sin(angle) * dist,
            ),
          );
        }
        floatingTexts.push(
          new FloatingText("警告：Bug 开香槟了 🐛🍾", player.x, player.y - 70, COLORS.green, true),
        );
      }

      function spawnEnemy(camX, camY) {
        if (bossActive) return;

        let diffScale = getDifficultyScale(currentPhase);

        let maxEnemies = 30 * diffScale + Math.floor(gameTime / 5);
        if (maxEnemies > 120) maxEnemies = 120;
        if (enemies.length >= maxEnemies) return;

        let baseInterval = 34;
        let spawnInterval =
          baseInterval / diffScale - Math.floor(gameTime / 9);
        if (spawnInterval < 8) spawnInterval = 8;
        if (Math.random() > 1 / spawnInterval) return;

        const margin = 100;
        let ex, ey;
        if (Math.random() < 0.5) {
          ex = camX + (Math.random() < 0.5 ? -margin : canvas.width + margin);
          ey = camY + Math.random() * canvas.height;
        } else {
          ex = camX + Math.random() * canvas.width;
          ey = camY + (Math.random() < 0.5 ? -margin : canvas.height + margin);
        }
        enemies.push(new Enemy(ex, ey));
      }

      function spawnMapBuff() {
        const angle = Math.random() * Math.PI * 2;
        const dist = 500 + Math.random() * 400;
        if (Math.random() < 0.3) {
          items.push(
            new ShieldItem(
              player.x + Math.cos(angle) * dist,
              player.y + Math.sin(angle) * dist,
            ),
          );
        } else {
          items.push(
            new BuffItem(
              player.x + Math.cos(angle) * dist,
              player.y + Math.sin(angle) * dist,
            ),
          );
        }
      }

      function updateHUD() {
        hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
        expFill.style.width = `${(player.exp / player.maxExp) * 100}%`;

        const mpPercent = (player.mp / player.maxMp) * 100;
        mpFill.style.width = `${mpPercent}%`;
        if (player.mp >= player.maxMp) {
          ultBtn.classList.add("ready");
        } else {
          ultBtn.classList.remove("ready");
        }

        scoreDisplay.innerText = `清理数量: ${player.score}`;
        levelDisplay.innerText = `LV: ${player.level}`;
        phaseDisplay.innerText = `阶段: ${currentPhase}`;
      }

      function formatTime(seconds) {
        const m = Math.floor(seconds / 60)
          .toString()
          .padStart(2, "0");
        const s = Math.floor(seconds % 60)
          .toString()
          .padStart(2, "0");
        return `${m}:${s}`;
      }

      /* ======================================================
       * 📂 [Render 模块] (主渲染系统)
       * ====================================================== */
      function drawGrid(camX, camY) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 1;
        const gridSize = 50;
        const offsetX = -((camX % gridSize) + gridSize) % gridSize;
        const offsetY = -((camY % gridSize) + gridSize) % gridSize;
        ctx.beginPath();
        for (let x = offsetX; x < canvas.width; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
        }
        for (let y = offsetY; y < canvas.height; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
      }

      function drawJoystick() {
        if (!joystick.active) return;
        ctx.beginPath();
        ctx.arc(joystick.originX, joystick.originY, 40, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(
          joystick.originX + joystick.deltaX,
          joystick.originY + joystick.deltaY,
          20,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fill();
      }

      function drawBaseGameFrozen() {
        ctx.fillStyle = COLORS.bgTrail;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const drawCamX = player.x - canvas.width / 2,
          drawCamY = player.y - canvas.height / 2;
        drawGrid(drawCamX, drawCamY);

        ctx.save();
        ctx.translate(-drawCamX, -drawCamY);
        traps.forEach((t) => t.draw());
        tempTraps.forEach((t) => t.draw());
        bugZones.forEach((bz) => bz.draw());
        bugDrops.forEach((bd) => bd.draw());
        obstacles.forEach((obs) => obs.draw());
        items.forEach((item) => item.draw());
        expGems.forEach((gem) => gem.draw());
        if (theBoss) theBoss.draw();
        curlingStones.forEach((cs) => cs.draw());
        vomitBullets.forEach((vb) => vb.draw());
        enemyBullets.forEach((eb) => eb.draw());
        bullets.forEach((b) => b.draw());
        enemies.forEach((e) => e.draw());
        pets.forEach((p) => p.draw());
        player.draw();
        particles.forEach((p) => p.draw());
        floatingTexts.forEach((ft) => ft.draw());
        ctx.restore();

        if (isTouchDevice && gameState === "PLAYING") drawJoystick();
      }

      /* ======================================================
       * 📂 [Main 模块] (主循环与核心碰撞管理)
       * ====================================================== */
      function gameLoop(timestamp) {
        if (
          gameState === "MENU" ||
          gameState === "GAMEOVER" ||
          gameState === "UPGRADING" ||
          gameState === "PAUSED"
        ) {
          lastTime = timestamp;
          if (gameState === "UPGRADING" || gameState === "PAUSED")
            animationId = requestGameFrame(gameLoop);
          return;
        }
        if (!lastTime) lastTime = timestamp;
        const dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        if (gameState === "CUTSCENE") {
          cutsceneTimer += dt;
          drawBaseGameFrozen();
          ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const cx = canvas.width / 2,
            cy = canvas.height / 2;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = COLORS.white;

          ctx.save();
          let scale = Math.min(1, canvas.width / 600);
          if (cutsceneTimer < 6.0) {
            ctx.font = `${100 * scale}px 'Segoe UI Emoji', Arial`;
            ctx.fillText("🛕", cx + 120 * scale, cy + 50 * scale);

            if (cutsceneTimer < 2.5) {
              ctx.fillText("🐉", cx + 20 * scale, cy + 50 * scale);
              ctx.font = `${28 * scale}px 'ZCOOL QingKe HuangYou', sans-serif`;
              ctx.fillStyle = COLORS.yellow;
              ctx.fillText(
                "老铁，今天风平浪静啊！",
                cx + 20 * scale,
                cy - 50 * scale,
              );
            } else {
              ctx.fillText("🐉💦", cx + 20 * scale, cy + 50 * scale);
            }

            let bossX = cx - 180 * scale;
            let bossY = cy + 50 * scale;
            let bossAngle = 0;
            if (cutsceneTimer > 1.0 && cutsceneTimer < 2.5) {
              ctx.font = `${100 * scale}px 'Segoe UI Emoji', Arial`;
              ctx.fillText("🤖", bossX, bossY);
              ctx.font = `${28 * scale}px 'ZCOOL QingKe HuangYou', sans-serif`;
              ctx.fillStyle = COLORS.red;
              ctx.fillText("算力无边，不可阻挡！", bossX, bossY - 80 * scale);
            }

            if (cutsceneTimer >= 2.5) {
              let waveX = -600 * scale + (cutsceneTimer - 2.5) * 1500 * scale;

              if (waveX > bossX - 80 * scale) {
                bossX = waveX + 80 * scale;
                bossAngle = (cutsceneTimer - 2.5) * 10;
              }
              ctx.translate(bossX, bossY);
              ctx.rotate(bossAngle);
              ctx.font = `${100 * scale}px 'Segoe UI Emoji', Arial`;
              ctx.fillText("🤖", 0, 0);
              ctx.rotate(-bossAngle);
              ctx.translate(-bossX, -bossY);

              let dragonX = cx + 20 * scale;
              let dragonAngle = 0;
              if (waveX > dragonX - 80 * scale) {
                dragonX = waveX + 60 * scale;
                dragonAngle = (cutsceneTimer - 2.5) * 12;
              }
              ctx.translate(dragonX, cy + 50 * scale);
              ctx.rotate(dragonAngle);
              ctx.font = `${100 * scale}px 'Segoe UI Emoji', Arial`;
              ctx.fillText("🐉", 0, 0);
              ctx.rotate(-dragonAngle);
              ctx.translate(-dragonX, -(cy + 50 * scale));

              ctx.font = `${150 * scale}px 'Segoe UI Emoji', Arial`;
              ctx.fillText("🌊🌊🌊🌊🌊", waveX, cy + 100 * scale);
              ctx.fillText("🌊🌊🌊", waveX - 250 * scale, cy);

              ctx.font = `${35 * scale}px 'ZCOOL QingKe HuangYou', sans-serif`;
              ctx.fillStyle = COLORS.cyan;
              ctx.fillText(
                "🪨🪞🪨🚫，🪡🪨大💦🐛了🐲🫅🐱",
                cx,
                cy - 120 * scale,
              );
            }
          } else {
            gameState = "PLAYING";
            currentPhase++;
            bossActive = false;
            theBoss = null;
            nextBossSpawnTime = gameTime + 75;
            if (currentPhase >= 5) nextBugRainTime = gameTime + 8;
            let phaseText = document.createElement("div");
            phaseText.className = "phase-announce";
            phaseText.innerHTML = `<span>警报暂时解除...</span><br><br><span style="color:var(--pink)">突破进入 阶段 ${currentPhase}</span>`;
            document.body.appendChild(phaseText);
            setTimeout(() => phaseText.remove(), 4000);
          }
          ctx.restore();
          animationId = requestGameFrame(gameLoop);
          return;
        }

        const frameTime = Math.min(dt, 0.1);
        accumulator += frameTime;

        while (accumulator >= TIME_STEP) {
          gameTime += TIME_STEP;
          timeDisplay.innerText = formatTime(gameTime);

          if (currentPhase >= 5 && gameTime >= nextBugRainTime) {
            spawnBugRain();
            nextBugRainTime = gameTime + Math.max(18, 34 - currentPhase * 2);
          }

          if (gameTime >= nextBuffSpawnTime) {
            spawnMapBuff();
            nextBuffSpawnTime = gameTime + 36;
          }

          if (gameTime >= nextStoneSpawnTime) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 300 + Math.random() * 200;
            items.push(
              new StoneItem(
                player.x + Math.cos(angle) * dist,
                player.y + Math.sin(angle) * dist,
              ),
            );
            nextStoneSpawnTime = gameTime + 150;
            floatingTexts.push(
              new FloatingText(
                "高维武器降临！",
                player.x,
                player.y - 60,
                COLORS.cyan,
                true,
              ),
            );
          }

          if (gameTime >= nextBossSpawnTime && !bossActive && !theBoss) {
            bossActive = true;
            bossWarning.style.display = "block";
            setTimeout(() => {
              bossWarning.style.display = "none";
            }, 3000);
            theBoss = new Boss(player.x, player.y - canvas.height);
          }

          const logicCamX = player.x - canvas.width / 2,
            logicCamY = player.y - canvas.height / 2;
          spawnEnemy(logicCamX, logicCamY);
          updateChunks();

          player.inTrap = false;
          player.inBugZone = false;
          traps.forEach((t) => t.update());
          tempTraps.forEach((t) => t.update());
          bugZones.forEach((bz) => bz.update());
          bugDrops.forEach((bd) => bd.update());
          curlingStones.forEach((cs) => cs.update());

          player.update();
          pets.forEach((p) => p.update());

          items.forEach((item) => {
            if (
              distSq(player.x, player.y, item.x, item.y) <
              (player.radius + item.radius) ** 2
            ) {
              if (item instanceof HeartItem) player.heal(item.healAmount);
              else if (item instanceof BuffItem) {
                player.damageBuffTimer = 15;
                floatingTexts.push(
                  new FloatingText(
                    "伤害飙升!",
                    player.x,
                    player.y - 30,
                    COLORS.yellow,
                    true,
                  ),
                );
              } else if (item instanceof ShieldItem) {
                player.shieldBuffTimer = 10;
                floatingTexts.push(
                  new FloatingText(
                    "绝对防御!",
                    player.x,
                    player.y - 30,
                    COLORS.cyan,
                    true,
                  ),
                );
              } else if (item instanceof StoneItem) {
                player.mp = player.maxMp;
                player.useUltimate();
              }
              item.isDead = true;
            }
          });

          curlingStones.forEach((cs) => {
            enemyBullets.forEach((eb) => {
              if (!eb.isDead && distSq(cs.x, cs.y, eb.x, eb.y) < 1600)
                eb.isDead = true;
            });
            vomitBullets.forEach((vb) => {
              if (!vb.isDead && distSq(cs.x, cs.y, vb.x, vb.y) < 1600)
                vb.isDead = true;
            });
          });

          expGems.forEach((gem) => {
            if (distSq(player.x, player.y, gem.x, gem.y) > 6250000)
              gem.isDead = true;
            else {
              gem.update();
              if (
                distSq(player.x, player.y, gem.x, gem.y) <
                player.radius * player.radius
              ) {
                player.gainExp(gem.value);
                gem.isDead = true;
              }
            }
          });

          if (theBoss) {
            theBoss.update();
            if (
              distSq(player.x, player.y, theBoss.x, theBoss.y) <
              (player.radius + theBoss.radius) ** 2
            )
              player.takeDamage(10);
          }

          vomitBullets.forEach((vb) => vb.update());
          enemyGrid.rebuild(enemies);
          obstacleGrid.rebuild(obstacles);

          enemyBullets.forEach((eb) => {
            eb.update();
            if (distSq(player.x, player.y, eb.x, eb.y) > 2250000)
              eb.isDead = true;
            else {
              let hitObstacle = false;
              const nearbyObstacles = obstacleGrid.query(
                eb.x,
                eb.y,
                eb.radius + 40,
                obstacleQueryBuffer,
              );
              for (let obs of nearbyObstacles) {
                let dx = eb.x - obs.x;
                let dy = eb.y - obs.y;
                let maxDist = eb.radius + obs.radius;
                if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
                if (dx * dx + dy * dy < maxDist * maxDist) {
                  hitObstacle = true;
                  obs.takeDamage(15);
                  createParticles(eb.x, eb.y, COLORS.white, 0.5);
                  break;
                }
              }
              if (hitObstacle) eb.isDead = true;
              else if (
                distSq(player.x, player.y, eb.x, eb.y) <
                (player.radius + eb.radius) ** 2
              ) {
                player.takeDamage(15);
                createParticles(eb.x, eb.y, eb.color || COLORS.red);
                eb.isDead = true;
              }
            }
          });

          bullets.forEach((b) => {
            b.update();
            if (distSq(player.x, player.y, b.x, b.y) > 1000000) {
              b.isDead = true;
              return;
            }

            let hitObstacle = false;
            const nearbyObstacles = obstacleGrid.query(
              b.x,
              b.y,
              b.radius + 50,
              obstacleQueryBuffer,
            );
            for (let obs of nearbyObstacles) {
              let dx = b.x - obs.x;
              let dy = b.y - obs.y;
              let maxDist = b.radius + obs.radius;
              if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
              if (dx * dx + dy * dy < maxDist * maxDist) {
                createParticles(b.x, b.y, b.color, 0.5);
                b.pierce--;
                if (b.pierce <= 0) {
                  b.isDead = true;
                  hitObstacle = true;
                  break;
                }
              }
            }
            if (hitObstacle) return;

            if (theBoss && !b.hitEnemies.has(theBoss)) {
              let dx = b.x - theBoss.x;
              let dy = b.y - theBoss.y;
              let maxDist = b.radius + theBoss.radius;
              if (
                Math.abs(dx) <= maxDist &&
                Math.abs(dy) <= maxDist &&
                dx * dx + dy * dy < maxDist * maxDist
              ) {
                b.hitEnemies.add(theBoss);
                createParticles(b.x, b.y, b.color, 0.5);
                player.onHitEnemy(false, true);
                theBoss.takeDamage(b.damage);
                b.pierce--;
                if (b.pierce <= 0) {
                  b.isDead = true;
                  return;
                }
              }
            }

            const nearbyEnemies = enemyGrid.query(
              b.x,
              b.y,
              b.radius + 70,
              queryBuffer,
            );
            for (let e of nearbyEnemies) {
              if (b.hitEnemies.has(e) || e.isDead) continue;
              let dx = b.x - e.x;
              let dy = b.y - e.y;
              let maxDist = b.radius + e.radius;

              if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
              if (dx * dx + dy * dy < maxDist * maxDist) {
                b.hitEnemies.add(e);
                createParticles(b.x, b.y, b.color, 0.5);
                player.onHitEnemy(false, false);
                e.takeDamage(b.damage, b.x, b.y, b.isCrit);
                b.pierce--;
                if (b.pierce <= 0) {
                  b.isDead = true;
                  break;
                }
              }
            }
          });

          enemies.forEach((e) => {
            if (distSq(player.x, player.y, e.x, e.y) > 4000000) {
              e.isDead = true;
              return;
            }
            e.update();
            if (
              distSq(player.x, player.y, e.x, e.y) <
              (player.radius + e.radius) ** 2
            ) {
              player.takeDamage(e.damage);
            }
          });

          particles.forEach((p) => p.update());
          floatingTexts.forEach((ft) => ft.update());

          // 批量回收：原地 compact，避免每帧 filter/slice 制造临时数组。
          compactLive(tempTraps);
          compactLive(bugZones);
          compactLive(bugDrops);
          compactLive(items);
          compactLive(expGems);
          compactLive(vomitBullets);
          compactLive(enemyBullets);
          compactLive(bullets);
          compactLive(enemies);
          compactLive(particles);
          compactLive(floatingTexts);
          compactLive(obstacles);
          compactLive(curlingStones);

          if (particles.length > 250) particles.splice(0, particles.length - 250);
          if (expGems.length > 200) expGems.splice(0, expGems.length - 200);

          accumulator -= TIME_STEP;
        }
        drawBaseGameFrozen();
        animationId = requestGameFrame(gameLoop);
      }

      /* ======================================================
       * 📂 [Input 模块] (输入系统)
       * ====================================================== */
      if (isTouchDevice) {
        function handlePointerDown(e) {
          if (gameState !== "PLAYING") return;
          if (e.target.id === "ult-btn") return;
          if (e.type === "touchstart") e.preventDefault();
          joystick.active = true;
          joystick.originX = e.touches[0].clientX;
          joystick.originY = e.touches[0].clientY;
          joystick.deltaX = 0;
          joystick.deltaY = 0;
        }
        function handlePointerMove(e) {
          if (!joystick.active) return;
          if (e.type === "touchmove") e.preventDefault();
          const currentX = e.touches[0].clientX,
            currentY = e.touches[0].clientY;
          const maxDist = 50;
          let dx = currentX - joystick.originX,
            dy = currentY - joystick.originY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
          }
          joystick.deltaX = dx;
          joystick.deltaY = dy;
        }
        function handlePointerUp(e) {
          joystick.active = false;
          joystick.deltaX = 0;
          joystick.deltaY = 0;
        }
        joystickZone.addEventListener("touchstart", handlePointerDown, {
          passive: false,
        });
        joystickZone.addEventListener("touchmove", handlePointerMove, {
          passive: false,
        });
        window.addEventListener("touchend", handlePointerUp);
        window.addEventListener("touchcancel", handlePointerUp);
      }

      window.addEventListener("keydown", (e) => {
        const key = e.key ? e.key.toLowerCase() : "",
          code = e.code || "",
          keyCode = e.keyCode || e.which;
        if (code === "KeyW" || key === "w" || keyCode === 87) keys.w = true;
        if (code === "KeyA" || key === "a" || keyCode === 65) keys.a = true;
        if (code === "KeyS" || key === "s" || keyCode === 83) keys.s = true;
        if (code === "KeyD" || key === "d" || keyCode === 68) keys.d = true;
        if (code === "ArrowUp" || key === "arrowup" || keyCode === 38)
          keys.ArrowUp = true;
        if (code === "ArrowDown" || key === "arrowdown" || keyCode === 40)
          keys.ArrowDown = true;
        if (code === "ArrowLeft" || key === "arrowleft" || keyCode === 37)
          keys.ArrowLeft = true;
        if (code === "ArrowRight" || key === "arrowright" || keyCode === 39)
          keys.ArrowRight = true;
        if (code === "Space" || keyCode === 32) keys.Space = true;
        if (key === "p" || key === "escape" || keyCode === 80 || keyCode === 27)
          togglePause();
      });

      window.addEventListener("keyup", (e) => {
        const key = e.key ? e.key.toLowerCase() : "",
          code = e.code || "",
          keyCode = e.keyCode || e.which;
        if (code === "KeyW" || key === "w" || keyCode === 87) keys.w = false;
        if (code === "KeyA" || key === "a" || keyCode === 65) keys.a = false;
        if (code === "KeyS" || key === "s" || keyCode === 83) keys.s = false;
        if (code === "KeyD" || key === "d" || keyCode === 68) keys.d = false;
        if (code === "ArrowUp" || key === "arrowup" || keyCode === 38)
          keys.ArrowUp = false;
        if (code === "ArrowDown" || key === "arrowdown" || keyCode === 40)
          keys.ArrowDown = false;
        if (code === "ArrowLeft" || key === "arrowleft" || keyCode === 37)
          keys.ArrowLeft = false;
        if (code === "ArrowRight" || key === "arrowright" || keyCode === 39)
          keys.ArrowRight = false;
        if (code === "Space" || keyCode === 32) keys.Space = false;
      });

      document.getElementById("start-btn").addEventListener("click", initGame);
      document
        .getElementById("restart-btn")
        .addEventListener("click", initGame);

      window.initGame = initGame;
      window.saveGame = saveGame;
      window.loadGame = loadGame;
      window.togglePause = togglePause;
      window.triggerUltBtn = triggerUltBtn;
      window.returnToHome = returnToHome;
