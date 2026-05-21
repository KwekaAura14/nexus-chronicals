// js/main.js
(function () {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 900;
    canvas.height = 600;
    const W = canvas.width, H = canvas.height;

    // ==================== CONFIG ====================
    const WORLD_SIZE = 28;
    const TILE_SIZE = 32;
    const MAP_OFFSET_X = (W - WORLD_SIZE * TILE_SIZE) / 2;
    const MAP_OFFSET_Y = 40;

    let world = Array(WORLD_SIZE).fill().map(() => Array(WORLD_SIZE).fill(0));

    // ==================== GAME DATA ====================
    const FORMS = [
        {name:"BASE", dmg:1.0, spd:1.0, drain:0, aura:"#6a9eff", color:"#88aaff"},
        {name:"RAGE", dmg:1.8, spd:1.32, drain:7, aura:"#ff6633", color:"#ff7744"},
        {name:"ENERGY", dmg:2.5, spd:1.8, drain:15, aura:"#2ad4ff", color:"#44ddff"},
        {name:"GOD", dmg:4.0, spd:2.2, drain:24, aura:"#ffdd66", color:"#ffcc44"},
        {name:"COSMIC", dmg:7.0, spd:2.8, drain:40, aura:"#cc66ff", color:"#cc88ff"}
    ];

    const WEAPONS = [
        {name:"PISTOL", dmg:28, rpm:380, range:180, pellets:1, color:"#ffaa66"},
        {name:"RIFLE", dmg:35, rpm:620, range:210, pellets:1, color:"#ffdd88"},
        {name:"SHOTGUN", dmg:50, rpm:95, range:100, pellets:5, color:"#ff8844"},
        {name:"SNIPER", dmg:130, rpm:45, range:320, pellets:1, color:"#88ddff"},
        {name:"SMG", dmg:22, rpm:880, range:160, pellets:1, color:"#44ffaa"}
    ];

    const ABILITIES = [
        {name:"FIREBALL", dmg:85, cd:2.5, range:150, cost:20, color:"#ff8844"},
        {name:"SHOCKWAVE", dmg:70, cd:3.2, range:70, cost:25, color:"#ffcc44"},
        {name:"BLINK", dmg:0, cd:1.6, range:80, cost:18, color:"#cc88ff"},
        {name:"METEOR", dmg:200, cd:6.5, range:130, cost:55, color:"#ff6644"}
    ];

    const ENEMIES = {
        goblin: {hp:45, dmg:11, spd:1.6, xp:30, gold:8, color:"#8b5a2b", size:14},
        orc: {hp:90, dmg:18, spd:1.3, xp:65, gold:15, color:"#5a6e2a", size:16},
        skeleton: {hp:70, dmg:15, spd:1.9, xp:50, gold:12, color:"#c0c0c0", size:15},
        demon: {hp:150, dmg:28, spd:1.9, xp:120, gold:30, color:"#aa3355", size:18}
    };

    const ZONE_SPAWNS = {
        plains: ["goblin","goblin","orc"],
        forest: ["goblin","skeleton","orc"],
        water: ["skeleton","orc"],
        boss: ["demon"]
    };

    // ==================== GAME STATE ====================
    let player = {};
    let enemies = [];
    let projectiles = [];
    let particles = [];
    let damageNumbers = [];
    let notifications = [];
    let boss = null;
    let gameState = "menu";
    let mouseX = 0, mouseY = 0;
    let highScore = 0;
    let frameTime = 0;

    const keys = {};

    const npcs = [
        {name:"MAYOR", x:12, y:12, lines:["Welcome hero!","Defeat the demon lord!"]},
        {name:"WIZARD", x:20, y:20, lines:["Press Q to transform!","Use abilities with 1-4"]}
    ];

    let chests = [
        {x:15, y:8, rarity:"rare", opened:false},
        {x:8, y:20, rarity:"epic", opened:false},
        {x:22, y:18, rarity:"legendary", opened:false}
    ];

    // ==================== HELPERS ====================
    function notify(text, color, big = false){
        notifications.push({text, color, life:2.5, big});
        if(notifications.length > 5) notifications.shift();
    }

    function addDamageNumber(x, y, val, color){
        damageNumbers.push({x, y, val, color, life:0.8, vy:-30});
    }

    function spawnParticles(x, y, count, color, speed){
        for(let i=0; i<count; i++){
            let ang = Math.random()*Math.PI*2;
            let sp = Math.random()*speed;
            particles.push({x, y, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, life:0.5, color, size:2+Math.random()*3});
        }
    }

    function generateWorld() {
        for(let i=0; i<WORLD_SIZE; i++){
            for(let j=0; j<WORLD_SIZE; j++){
                if(i===0 || i===WORLD_SIZE-1 || j===0 || j===WORLD_SIZE-1) world[i][j]=1;
                else if(Math.random()<0.08 && i>4 && i<WORLD_SIZE-4 && j>4 && j<WORLD_SIZE-4) world[i][j]=1;
                else world[i][j]=0;
            }
        }
        for(let i=2; i<12; i++) for(let j=16; j<27; j++) if(Math.random()<0.3) world[i][j]=3;
        for(let i=16; i<27; i++) for(let j=2; j<12; j++) if(Math.random()<0.25) world[i][j]=2;
        for(let i=12; i<18; i++) for(let j=18; j<24; j++) world[i][j]=0;
        world[10][10]=1; world[10][11]=1; world[11][10]=1; world[11][11]=0;
    }

    function isSolid(x,y){
        let tx = Math.floor(x), ty = Math.floor(y);
        if(tx<0 || tx>=WORLD_SIZE || ty<0 || ty>=WORLD_SIZE) return true;
        return world[ty][tx] === 1;
    }

    function getZone(x,y){
        let tx = Math.floor(x), ty = Math.floor(y);
        if(tx>15 && ty<12) return "forest";
        if(tx<12 && ty>15) return "water";
        if(tx>14 && ty>14) return "boss";
        return "plains";
    }

    // ==================== COMBAT ====================
    function shoot(){
        let wp = player.weapons[player.curWp];
        if(!wp || player.shootCd>0) return;
        if(wp.ammo <= 0){ notify("RELOAD!", "#ffaa66"); return; }
        wp.ammo--;
        player.shootCd = 60/wp.rpm;

        let dmgMult = FORMS[player.formIdx].dmg * (1 + (player.level*0.02));
        for(let p=0; p<wp.pellets; p++){
            let spread = wp.pellets>1 ? 0.15 : 0.03;
            let angle = player.angle + (Math.random()-0.5)*spread;
            let finalDmg = Math.floor(wp.dmg * dmgMult);
            if(Math.random()<0.1) finalDmg = Math.floor(finalDmg*1.7);

            projectiles.push({
                x:player.x, y:player.y, angle:angle, range:wp.range, dmg:finalDmg,
                life:1.0, speed:9, size:5, color:wp.color
            });
        }
        spawnParticles(player.x, player.y, 6, wp.color, 3);
        player.hitFlash = 0.15;
    }

    function updateProjectiles(){
        for(let i=0; i<projectiles.length; i++){
            let p = projectiles[i];
            p.x += Math.cos(p.angle)*p.speed;
            p.y += Math.sin(p.angle)*p.speed;
            p.life -= 0.03;
            if(isSolid(p.x, p.y) || p.life<=0){
                projectiles.splice(i,1); i--; continue;
            }

            let hit = false;
            for(let e of enemies){
                if(!e.alive) continue;
                if(Math.hypot(e.x-p.x, e.y-p.y) < e.size/2 + 4){
                    e.hp -= p.dmg;
                    e.hitTimer = 0.2;
                    addDamageNumber(e.x, e.y, p.dmg, "#ffaa66");
                    if(e.hp <= 0){
                        e.alive = false;
                        player.gold += e.gold;
                        player.kills++;
                        player.xp += e.xp;
                        player.score += e.xp;
                        // Level up logic...
                        while(player.xp >= player.xpNext){
                            player.xp -= player.xpNext;
                            player.level++;
                            player.xpNext = Math.floor(player.xpNext*1.35);
                            player.skillPts += 2;
                            player.maxHp += 12;
                            player.hp = player.maxHp;
                            notify(`✦ LEVEL ${player.level} ✦`, "#ffcc44", true);
                        }
                        spawnParticles(e.x, e.y, 15, "#ff6644", 4);
                    }
                    hit=true; break;
                }
            }
            if(hit){ projectiles.splice(i,1); i--; }
        }
    }

    function useAbility(idx){
        let ab = ABILITIES[idx];
        if(player.abilityCDs[idx] > 0) return;
        if(player.energy < ab.cost){ notify("LOW ENERGY!", "#ff7777"); return; }
        player.energy -= ab.cost;
        player.abilityCDs[idx] = ab.cd;
        notify(ab.name, ab.color);

        if(ab.name === "BLINK"){
            let nx = player.x + Math.cos(player.angle)*ab.range/30;
            let ny = player.y + Math.sin(player.angle)*ab.range/30;
            if(!isSolid(nx, ny)){ player.x = nx; player.y = ny; }
            spawnParticles(player.x, player.y, 20, "#cc88ff", 5);
        } else {
            let dmg = Math.floor(ab.dmg * FORMS[player.formIdx].dmg);
            for(let e of enemies) if(e.alive && Math.hypot(e.x-player.x, e.y-player.y) < ab.range/30) e.hp -= dmg;
            if(boss && boss.alive && Math.hypot(boss.x-player.x, boss.y-player.y) < ab.range/30) boss.hp -= dmg;
            spawnParticles(player.x, player.y, 25, ab.color, 6);
        }
    }

    function transform(){
        if(player.formIdx === 0){
            for(let i=1;i<FORMS.length;i++){
                if(player.unlockedForms.includes(i) && player.level >= (i*5+3)){
                    player.formIdx = i;
                    player.transformTime = 1.2;
                    notify(`${FORMS[i].name} FORM!`, FORMS[i].aura, true);
                    spawnParticles(player.x, player.y, 30, FORMS[i].color, 6);
                    break;
                }
            }
        } else {
            player.formIdx = 0;
            notify("BASE FORM", "#88aaff");
        }
    }

    function ultimate(){
        if(player.formIdx===0){ notify("TRANSFORM FIRST!", "#ff8866"); return; }
        if(player.energy < 45){ notify("NEED 45 ENERGY", "#ff8866"); return; }
        player.energy -= 45;
        let dmg = 380 * FORMS[player.formIdx].dmg;
        for(let e of enemies) if(e.alive) e.hp -= dmg;
        if(boss) boss.hp -= dmg/1.6;
        notify(`✦ ULTIMATE: ${FORMS[player.formIdx].name} STRIKE ✦`, FORMS[player.formIdx].aura, true);
        spawnParticles(player.x, player.y, 55, FORMS[player.formIdx].color, 9);
    }

    function reload(){
        let wp = player.weapons[player.curWp];
        if(wp && wp.ammo < wp.maxAmmo && wp.reserve>0){
            let need = wp.maxAmmo - wp.ammo;
            let take = Math.min(need, wp.reserve);
            wp.ammo += take;
            wp.reserve -= take;
            notify("RELOADED", "#88ffaa");
        }
    }

    function interact(){
        for(let n of npcs){
            if(Math.hypot(n.x - player.x, n.y - player.y) < 1.5){
                notify(n.lines[0], "#ffdd99");
                return;
            }
        }
        for(let c of chests){
            if(!c.opened && Math.hypot(c.x-player.x, c.y-player.y) < 1.2){
                c.opened = true;
                let goldGain = 70 + Math.floor(Math.random()*130);
                player.gold += goldGain;
                notify(`🎁 CHEST! +${goldGain} GOLD`, "#ffcc44");
                if(Math.random()<0.5){
                    let newWp = {...WEAPONS[Math.floor(Math.random()*WEAPONS.length)], ammo:35, maxAmmo:35, reserve:180};
                    player.weapons.push(newWp);
                    notify(`🔫 ${newWp.name} FOUND!`, "#ffaa66", true);
                }
                break;
            }
        }
    }

    function spawnEnemiesForZone(){
        let zone = getZone(player.x, player.y);
        let pool = ZONE_SPAWNS[zone] || ["goblin"];
        let count = 2 + Math.floor(Math.random()*3);
        for(let i=0;i<count;i++){
            let type = pool[Math.floor(Math.random()*pool.length)];
            let tmpl = ENEMIES[type];
            let ang = Math.random()*Math.PI*2;
            let rx = player.x + Math.cos(ang)*(4+Math.random()*5);
            let ry = player.y + Math.sin(ang)*(4+Math.random()*5);
            if(!isSolid(rx,ry)){
                enemies.push({...tmpl, x:rx, y:ry, hp:tmpl.hp, maxHp:tmpl.hp, alive:true, hitTimer:0});
            }
        }
    }

    function checkBossSpawn(){
        let zone = getZone(player.x, player.y);
        if(zone === "boss" && !player.bossKilled && !boss){
            boss = {name:"DEMON LORD", x:16, y:18, hp:2800, maxHp:2800, size:28, color:"#aa3355", alive:true, hitTimer:0, dmg:32};
            notify("🔥 DEMON LORD AWAKENS! 🔥", "#ff6644", true);
        }
    }

    // ==================== MAIN UPDATE ====================
    function updateGame(delta){
        if(gameState !== "playing") return;
        delta = Math.min(0.033, delta);

        // Movement
        let spd = 4.2 * FORMS[player.formIdx].spd;
        let moveX = 0, moveY = 0;
        if(keys.ArrowUp || keys.KeyW) moveY -= 1;
        if(keys.ArrowDown || keys.KeyS) moveY += 1;
        if(keys.ArrowLeft || keys.KeyA) moveX -= 1;
        if(keys.ArrowRight || keys.KeyD) moveX += 1;

        if(moveX !==0 || moveY !==0){
            let len = Math.hypot(moveX, moveY);
            moveX /= len; moveY /= len;
            let newX = player.x + moveX * spd * delta;
            let newY = player.y + moveY * spd * delta;
            if(!isSolid(newX, player.y)) player.x = newX;
            if(!isSolid(player.x, newY)) player.y = newY;

            // Mouse aiming
            let mx = mouseX - MAP_OFFSET_X;
            let my = mouseY - MAP_OFFSET_Y;
            let worldX = (mx / TILE_SIZE) + player.x - (W/2/TILE_SIZE);
            let worldY = (my / TILE_SIZE) + player.y - (H/2/TILE_SIZE);
            player.angle = Math.atan2(worldY - player.y, worldX - player.x);
        }

        // Timers
        player.shootCd = Math.max(0, player.shootCd - delta);
        player.hitFlash = Math.max(0, player.hitFlash - delta*4);
        player.invincible = Math.max(0, player.invincible - delta);
        player.transformTime = Math.max(0, player.transformTime - delta);
        player.abilityCDs = player.abilityCDs.map(c => Math.max(0, c - delta));

        // Regen
        player.hp = Math.min(player.maxHp, player.hp + 6*delta);
        player.energy = Math.min(player.maxEn, player.energy + 8*delta);
        if(FORMS[player.formIdx].drain > 0) player.energy = Math.max(0, player.energy - FORMS[player.formIdx].drain * delta);

        // Enemy AI & Collision (simplified version)
        for(let i = enemies.length-1; i >= 0; i--){
            let e = enemies[i];
            if(!e.alive){ enemies.splice(i,1); continue; }
            // ... (enemy movement and attack logic)
        }

        updateProjectiles();
        checkBossSpawn();

        if(enemies.length < 3) spawnEnemiesForZone();

        // Particles & UI cleanup
        particles = particles.filter(p => { p.life -= delta; p.x += p.vx; p.y += p.vy; return p.life > 0; });
        damageNumbers = damageNumbers.filter(d => { d.life -= delta; d.y += d.vy*delta; return d.life > 0; });
        notifications = notifications.filter(n => { n.life -= delta; return n.life > 0; });
    }

    // ==================== DRAWING ====================
    function drawWorld(){
        let camX = player.x - (W/2)/TILE_SIZE;
        let camY = player.y - (H/2)/TILE_SIZE;

        // Draw tiles
        for(let i=0; i<WORLD_SIZE; i++){
            for(let j=0; j<WORLD_SIZE; j++){
                let screenX = MAP_OFFSET_X + (j - camX)*TILE_SIZE;
                let screenY = MAP_OFFSET_Y + (i - camY)*TILE_SIZE;
                if(screenX < -32 || screenX > W+32 || screenY < -32 || screenY > H+32) continue;

                let type = world[i][j];
                ctx.fillStyle = type===1 ? "#5a4a3a" : type===2 ? "#3a6a9a" : type===3 ? "#2a6a2a" : "#3a543a";
                ctx.fillRect(screenX, screenY, TILE_SIZE-1, TILE_SIZE-1);
            }
        }

        // Draw chests, NPCs, enemies, boss, player, projectiles, particles...
        // (You can expand this part later)
    }

    function drawUI(){
        // Health, Energy, Weapon info, Notifications, etc.
    }

    // ==================== GAME LOOP ====================
    function renderLoop(now){
        let delta = (now - frameTime) / 1000;
        frameTime = now;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#0a0a1a";
        ctx.fillRect(0, 0, W, H);

        if(gameState === "playing"){
            updateGame(delta);
            drawWorld();
            drawUI();
        }

        // Menu, Pause, Death screens...
        requestAnimationFrame(renderLoop);
    }

    // ==================== INPUT ====================
    document.addEventListener('keydown', e => {
        if(keys.hasOwnProperty(e.code)) keys[e.code] = true;
        if(gameState === "playing"){
            if(e.code === "Space") shoot();
            if(e.code === "KeyQ") transform();
            if(e.code === "KeyZ") ultimate();
            if(e.code === "KeyR") reload();
            if(e.code === "KeyE") interact();
        }
    });

    document.addEventListener('keyup', e => {
        if(keys.hasOwnProperty(e.code)) keys[e.code] = false;
    });

    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) * (W / rect.width);
        mouseY = (e.clientY - rect.top) * (H / rect.height);
    });

    canvas.addEventListener('click', () => {
        if(gameState === "playing") shoot();
    });

    // ==================== START ====================
    function init(){
        generateWorld();
        resetGame();
        gameState = "menu";
        frameTime = performance.now();
        requestAnimationFrame(renderLoop);
        console.log("%cNEXUS CHRONICLES Started Successfully!", "color:#ffcc44;font-size:16px");
    }

    window.resetGame = resetGame; // for debugging

    init();
})();
