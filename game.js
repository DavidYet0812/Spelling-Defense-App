// game.js

// --- 1. 初始化與 DOM 元素 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hpDisplay = document.getElementById('hp-display');
const scoreDisplay = document.getElementById('score-display');
const feverBar = document.getElementById('fever-bar-fill');

let logicalWidth, logicalHeight;
let gameLoopId;
let vocabList = [];

// 遊戲狀態
let gameMode = 'defense'; // 'defense' 或 'practice'

const gameState = {
    hp: 3,
    score: 0,
    isPlaying: false,
    activeWords: [],
    level: 1,
    baseSpeed: 1.0,
    lastSpawnTime: 0,
    spawnInterval: 2000 // 毫秒
};

// 練習模式狀態
const practiceState = {
    currentWord: null,
    completedCount: 0,
    totalAttempts: 0,
    correctAttempts: 0,
    usedIndices: [],
    typedIndex: 0
};

// ============================
// --- 音效系統 (Web Audio API) ---
// ============================
const SFX = {
    ctx: null,
    sfxMuted: false,
    musicMuted: false,

    // BGM 相關
    bgmNodes: [],
    bgmInterval: null,
    bgmPlaying: false,

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._bindButtons();
    },

    _bindButtons() {
        const soundBtn = document.getElementById('sound-toggle');
        const musicBtn = document.getElementById('music-toggle');

        if (soundBtn) {
            soundBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.sfxMuted = !this.sfxMuted;
                soundBtn.textContent = this.sfxMuted ? '🔇' : '🔊';
                soundBtn.classList.toggle('muted', this.sfxMuted);
            });
        }
        if (musicBtn) {
            musicBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.musicMuted = !this.musicMuted;
                musicBtn.textContent = this.musicMuted ? '🎵' : '🎵';
                musicBtn.classList.toggle('muted', this.musicMuted);
                if (this.musicMuted) this.stopBGM();
                else this.startBGM();
            });
        }
    },

    // ====== 背景音樂 ======
    startBGM() {
        if (!this.ctx || this.bgmPlaying || this.musicMuted) return;
        this.bgmPlaying = true;

        // 和弦進行 (Am - F - C - G) 的根音與和弦音
        const chords = [
            [220, 261.63, 329.63],  // Am
            [174.61, 220, 261.63],  // F
            [261.63, 329.63, 392],  // C
            [196, 246.94, 293.66],  // G
        ];
        let chordIndex = 0;
        let noteIndex = 0;

        const playNote = () => {
            if (!this.ctx || this.musicMuted || !this.bgmPlaying) return;

            const chord = chords[chordIndex];
            const freq = chord[noteIndex];
            const t = this.ctx.currentTime;

            // 琶音音符
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            o.type = 'sine';
            o.frequency.setValueAtTime(freq, t);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, t);

            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.06, t + 0.05);
            g.gain.setValueAtTime(0.06, t + 0.2);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

            o.connect(filter);
            filter.connect(g);
            g.connect(this.ctx.destination);
            o.start(t);
            o.stop(t + 0.65);

            // 低沉的底音 pad（每拍一次，較柔和）
            if (noteIndex === 0) {
                const pad = this.ctx.createOscillator();
                const padG = this.ctx.createGain();
                pad.type = 'triangle';
                pad.frequency.setValueAtTime(chord[0] / 2, t);
                padG.gain.setValueAtTime(0, t);
                padG.gain.linearRampToValueAtTime(0.035, t + 0.1);
                padG.gain.setValueAtTime(0.035, t + 0.8);
                padG.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
                pad.connect(padG);
                padG.connect(this.ctx.destination);
                pad.start(t);
                pad.stop(t + 1.85);
            }

            noteIndex++;
            if (noteIndex >= chord.length) {
                noteIndex = 0;
                chordIndex = (chordIndex + 1) % chords.length;
            }
        };

        // 每 220ms 播放一個音符（琶音節奏）
        playNote();
        this.bgmInterval = setInterval(playNote, 220);
    },

    stopBGM() {
        this.bgmPlaying = false;
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    },

    // ====== 音效 ======

    // 打字正確音（短促清脆的高音）
    playType() {
        if (!this.ctx || this.sfxMuted) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(880, this.ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.05);
        g.gain.setValueAtTime(0.13, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        o.start(); o.stop(this.ctx.currentTime + 0.1);
    },

    // 單字消除音（上升音階 + 閃亮感）
    playEliminate() {
        if (!this.ctx || this.sfxMuted) return;
        const t = this.ctx.currentTime;
        [523, 659, 784, 1047].forEach((freq, i) => {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.connect(g); g.connect(this.ctx.destination);
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, t + i * 0.06);
            g.gain.setValueAtTime(0.1, t + i * 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
            o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.15);
        });
        // 附加高頻閃光音
        const sparkle = this.ctx.createOscillator();
        const sg = this.ctx.createGain();
        sparkle.connect(sg); sg.connect(this.ctx.destination);
        sparkle.type = 'sine';
        sparkle.frequency.setValueAtTime(2093, t + 0.2);
        sg.gain.setValueAtTime(0.06, t + 0.2);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        sparkle.start(t + 0.2); sparkle.stop(t + 0.5);
    },

    // 打錯音（低沉短促的嗡嗡聲）
    playError() {
        if (!this.ctx || this.sfxMuted) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(150, this.ctx.currentTime);
        g.gain.setValueAtTime(0.08, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        o.start(); o.stop(this.ctx.currentTime + 0.15);
    },

    // 受傷音（重擊感）
    playHurt() {
        if (!this.ctx || this.sfxMuted) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.type = 'square';
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.start(); o.stop(t + 0.3);
    },

    // 狂暴模式啟動音（能量蓄滿的升頻）
    playFever() {
        if (!this.ctx || this.sfxMuted) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(300, t);
        o.frequency.exponentialRampToValueAtTime(1500, t + 0.4);
        g.gain.setValueAtTime(0.12, t);
        g.gain.setValueAtTime(0.12, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.start(); o.stop(t + 0.6);
    },

    // 遊戲結束音（下降的悲傷音階）
    playGameOver() {
        if (!this.ctx || this.sfxMuted) return;
        const t = this.ctx.currentTime;
        [523, 440, 349, 262].forEach((freq, i) => {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.connect(g); g.connect(this.ctx.destination);
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, t + i * 0.2);
            g.gain.setValueAtTime(0.1, t + i * 0.2);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.4);
            o.start(t + i * 0.2); o.stop(t + i * 0.2 + 0.4);
        });
    }
};

// ============================
// --- 進階特效系統 ---
// ============================
const particles = [];       // 基礎粒子
const shockwaves = [];      // 衝擊波環
const floatingTexts = [];   // 飄字 (+10, +20)
const sparkles = [];        // 星芒閃爍
const letterExplosions = []; // 字母爆炸碎片
let screenFlash = 0;        // 螢幕閃光強度

// --- 基礎圓形粒子 ---
function spawnParticles(x, y, color, count, opts = {}) {
    const { speedMult = 1, sizeMult = 1, gravityMult = 1, trail = false } = opts;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (1 + Math.random() * 5) * speedMult;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            life: 1.0,
            decay: 0.015 + Math.random() * 0.025,
            size: (2 + Math.random() * 4) * sizeMult,
            color,
            gravity: 0.08 * gravityMult,
            trail
        });
    }
}

// --- 衝擊波（擴散圓環）---
function spawnShockwave(x, y, color, maxRadius = 60) {
    shockwaves.push({
        x, y, radius: 5, maxRadius,
        life: 1.0, color,
        speed: 3 + Math.random() * 2
    });
}

// --- 飄字（+10 分數上浮）---
function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({
        x, y, text, color,
        vy: -2.5,
        life: 1.0,
        decay: 0.018,
        scale: 0.5,
        targetScale: 1.2
    });
}

// --- 星芒閃爍粒子 ---
function spawnSparkles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 40;
        sparkles.push({
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            life: 1.0,
            decay: 0.03 + Math.random() * 0.02,
            size: 3 + Math.random() * 5,
            rotation: Math.random() * Math.PI,
            rotSpeed: 0.05 + Math.random() * 0.1,
            color
        });
    }
}

// --- 字母爆炸（每個字母往外飛散）---
function spawnLetterExplosion(x, y, text, charWidth, gap) {
    const colors = ['#4CAF50', '#ffcc00', '#ff9f43', '#7B68EE', '#00ff88'];
    const totalWidth = text.length * charWidth + (text.length - 1) * gap;
    const startX = x - totalWidth / 2;
    
    for (let i = 0; i < text.length; i++) {
        const cx = startX + i * (charWidth + gap) + charWidth / 2;
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const speed = 3 + Math.random() * 4;
        letterExplosions.push({
            x: cx, y,
            char: text[i],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 1.0,
            decay: 0.02,
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.3,
            color: colors[i % colors.length],
            size: 20
        });
    }
}

// --- 完整消除特效（一次觸發所有效果）---
function triggerEliminateEffect(centerX, wordY, word, isFever) {
    const color1 = isFever ? '#ff9f43' : '#4CAF50';
    const color2 = '#ffcc00';
    const color3 = '#7B68EE';
    const points = isFever ? 20 : 10;
    
    // 1. 大量粒子爆發（三色）
    spawnParticles(centerX, wordY, color1, 18, { speedMult: 1.3 });
    spawnParticles(centerX, wordY, color2, 12, { speedMult: 1.0 });
    spawnParticles(centerX, wordY, color3, 8, { speedMult: 0.8, sizeMult: 0.7 });
    
    // 2. 衝擊波環
    spawnShockwave(centerX, wordY, color1, 80);
    if (isFever) spawnShockwave(centerX, wordY, '#e94560', 100);
    
    // 3. 分數飄字
    spawnFloatingText(centerX, wordY - 20, `+${points}`, color2);
    
    // 4. 星芒閃爍
    spawnSparkles(centerX, wordY, 8, color2);
    
    // 5. 字母爆炸飛散
    ctx.font = "22px 'Courier New', monospace";
    const cw = ctx.measureText('M').width;
    spawnLetterExplosion(centerX, wordY + 34, word.text, cw, 6);
    
    // 6. 螢幕閃光
    screenFlash = isFever ? 0.4 : 0.25;
}

// --- 受傷特效 ---
function triggerHurtEffect(wordX, wordY) {
    spawnParticles(wordX, wordY, '#e94560', 12, { speedMult: 1.2 });
    spawnShockwave(wordX, wordY, '#e94560', 70);
    screenFlash = 0.3;
}

// --- 更新所有特效 ---
function updateAllEffects() {
    // 基礎粒子
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.99; // 空氣阻力
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }
    // 衝擊波
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const s = shockwaves[i];
        s.radius += s.speed;
        s.life = 1 - (s.radius / s.maxRadius);
        if (s.life <= 0) shockwaves.splice(i, 1);
    }
    // 飄字
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const f = floatingTexts[i];
        f.y += f.vy;
        f.vy *= 0.97;
        f.life -= f.decay;
        f.scale += (f.targetScale - f.scale) * 0.15;
        if (f.life <= 0) floatingTexts.splice(i, 1);
    }
    // 星芒
    for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.life -= s.decay;
        s.rotation += s.rotSpeed;
        if (s.life <= 0) sparkles.splice(i, 1);
    }
    // 字母爆炸
    for (let i = letterExplosions.length - 1; i >= 0; i--) {
        const l = letterExplosions[i];
        l.x += l.vx;
        l.y += l.vy;
        l.vy += 0.12;
        l.rotation += l.rotSpeed;
        l.life -= l.decay;
        if (l.life <= 0) letterExplosions.splice(i, 1);
    }
    // 螢幕閃光衰減
    if (screenFlash > 0) screenFlash *= 0.88;
    if (screenFlash < 0.01) screenFlash = 0;
}

// --- 繪製所有特效 ---
function drawAllEffects() {
    // 1. 基礎粒子（帶拖尾效果）
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 2;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;
    
    // 2. 衝擊波環
    shockwaves.forEach(s => {
        ctx.globalAlpha = s.life * 0.6;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2 + s.life * 3;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
    });
    ctx.shadowBlur = 0;
    
    // 3. 星芒閃爍（四角星形）
    sparkles.forEach(s => {
        ctx.globalAlpha = s.life;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 6;
        // 繪製四角星
        const sz = s.size * s.life;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
            const outerX = Math.cos(angle) * sz;
            const outerY = Math.sin(angle) * sz;
            const innerAngle = angle + Math.PI / 4;
            const innerX = Math.cos(innerAngle) * sz * 0.3;
            const innerY = Math.sin(innerAngle) * sz * 0.3;
            if (i === 0) ctx.moveTo(outerX, outerY);
            else ctx.lineTo(outerX, outerY);
            ctx.lineTo(innerX, innerY);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });
    ctx.shadowBlur = 0;
    
    // 4. 字母爆炸碎片
    letterExplosions.forEach(l => {
        ctx.globalAlpha = l.life;
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rotation);
        ctx.font = `bold ${l.size}px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = l.color;
        ctx.shadowColor = l.color;
        ctx.shadowBlur = 8;
        ctx.fillText(l.char, 0, 0);
        ctx.restore();
    });
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'top';
    
    // 5. 飄字（+10 漂浮）
    floatingTexts.forEach(f => {
        ctx.globalAlpha = f.life;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(f.scale, f.scale);
        ctx.font = "bold 24px Arial";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 10;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
    });
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'top';
    
    // 6. 螢幕閃光
    if (screenFlash > 0) {
        ctx.globalAlpha = screenFlash;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    }
    
    ctx.globalAlpha = 1;
}

// ============================
// --- 星空背景系統 ---
// ============================
const stars = [];
const meteors = [];

function initStars() {
    stars.length = 0;
    for (let i = 0; i < 80; i++) {
        stars.push({
            x: Math.random() * logicalWidth,
            y: Math.random() * logicalHeight,
            size: 0.5 + Math.random() * 2,
            twinkleSpeed: 0.01 + Math.random() * 0.03,
            twinklePhase: Math.random() * Math.PI * 2
        });
    }
}

function spawnMeteor() {
    if (Math.random() < 0.005) { // 每幀 0.5% 機率產生流星
        meteors.push({
            x: Math.random() * logicalWidth,
            y: -10,
            speed: 3 + Math.random() * 4,
            angle: Math.PI / 4 + Math.random() * 0.3,
            life: 1.0,
            length: 30 + Math.random() * 40
        });
    }
}

function drawBackground(timestamp) {
    // 漸層底色
    const bgGrad = ctx.createLinearGradient(0, 0, 0, logicalHeight);
    bgGrad.addColorStop(0, '#0a0a1a');
    bgGrad.addColorStop(0.5, '#12122e');
    bgGrad.addColorStop(1, '#1a1a3e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // 繪製星星（閃爍動畫）
    const time = timestamp || Date.now();
    stars.forEach(s => {
        const alpha = 0.3 + 0.7 * Math.abs(Math.sin(time * s.twinkleSpeed + s.twinklePhase));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 流星
    spawnMeteor();
    for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.life -= 0.015;

        if (m.life <= 0 || m.y > logicalHeight) {
            meteors.splice(i, 1);
            continue;
        }

        const tailX = m.x - Math.cos(m.angle) * m.length;
        const tailY = m.y - Math.sin(m.angle) * m.length;
        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(200,220,255,${m.life})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
    }

    // 狂暴模式特效 — 底部紅色光暈
    if (feverState.isActive) {
        const feverGrad = ctx.createLinearGradient(0, logicalHeight * 0.6, 0, logicalHeight);
        feverGrad.addColorStop(0, 'rgba(233, 69, 96, 0)');
        feverGrad.addColorStop(1, 'rgba(233, 69, 96, 0.15)');
        ctx.fillStyle = feverGrad;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    }
}

// ============================
// --- 巫師角色系統 ---
// ============================
const wizard = {
    x: 0,
    y: 0,
    state: 'idle',     // idle, cast, hurt
    stateTimer: 0,
    frameTime: 0,
    bobPhase: 0,

    // 設定位置（在 Canvas 底部中央）
    updatePosition() {
        this.x = logicalWidth / 2;
        this.y = logicalHeight - 50;
    },

    setState(newState, duration = 400) {
        this.state = newState;
        this.stateTimer = duration;
    },

    update(dt) {
        this.bobPhase += 0.04;
        if (this.stateTimer > 0) {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.state = 'idle';
            }
        }
    },

    draw() {
        const bobY = Math.sin(this.bobPhase) * 3;
        const cx = this.x;
        const cy = this.y + bobY;

        ctx.save();

        // 受傷狀態閃爍
        if (this.state === 'hurt') {
            ctx.globalAlpha = Math.sin(Date.now() * 0.02) > 0 ? 1 : 0.3;
        }

        // --- 繪製巫師角色 ---
        // 身體（藍紫色長袍）
        const robeGrad = ctx.createLinearGradient(cx, cy - 25, cx, cy + 20);
        robeGrad.addColorStop(0, '#4a3fa0');
        robeGrad.addColorStop(1, '#2a1f60');
        ctx.fillStyle = robeGrad;
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy - 10);
        ctx.lineTo(cx + 15, cy - 10);
        ctx.lineTo(cx + 20, cy + 20);
        ctx.lineTo(cx - 20, cy + 20);
        ctx.closePath();
        ctx.fill();

        // 頭部
        ctx.fillStyle = '#FFE0BD';
        ctx.beginPath();
        ctx.arc(cx, cy - 18, 10, 0, Math.PI * 2);
        ctx.fill();

        // 眼睛
        ctx.fillStyle = this.state === 'hurt' ? '#e94560' : '#333';
        if (this.state === 'hurt') {
            // X 形眼睛
            ctx.lineWidth = 2; ctx.strokeStyle = '#e94560';
            ctx.beginPath(); ctx.moveTo(cx-6, cy-21); ctx.lineTo(cx-2, cy-17); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx-2, cy-21); ctx.lineTo(cx-6, cy-17); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx+2, cy-21); ctx.lineTo(cx+6, cy-17); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx+6, cy-21); ctx.lineTo(cx+2, cy-17); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.arc(cx - 4, cy - 19, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + 4, cy - 19, 2, 0, Math.PI * 2); ctx.fill();
        }

        // 巫師帽
        const hatGrad = ctx.createLinearGradient(cx, cy - 48, cx, cy - 10);
        hatGrad.addColorStop(0, '#6c4dc4');
        hatGrad.addColorStop(1, '#3a2875');
        ctx.fillStyle = hatGrad;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 48);
        ctx.lineTo(cx + 16, cy - 10);
        ctx.lineTo(cx - 16, cy - 10);
        ctx.closePath();
        ctx.fill();

        // 帽子星星裝飾
        ctx.fillStyle = '#ffcc00';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('★', cx + 3, cy - 28);

        // 法杖
        const staffAngle = this.state === 'cast' ? -0.4 : 0.15;
        ctx.save();
        ctx.translate(cx + 18, cy);
        ctx.rotate(staffAngle);
        ctx.strokeStyle = '#8B5E3C';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.lineTo(0, -35);
        ctx.stroke();

        // 法杖寶珠（施法時發光）
        const orbColor = this.state === 'cast' ? '#00ff88' : '#7B68EE';
        const orbGlow = this.state === 'cast' ? 12 : 6;
        ctx.shadowColor = orbColor;
        ctx.shadowBlur = orbGlow;
        ctx.fillStyle = orbColor;
        ctx.beginPath();
        ctx.arc(0, -38, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();

        // 施法時的魔法粒子
        if (this.state === 'cast') {
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = ['#00ff88', '#ffcc00', '#7B68EE'][i];
                ctx.globalAlpha = 0.6 + Math.random() * 0.4;
                ctx.beginPath();
                ctx.arc(
                    cx + 18 + (Math.random() - 0.5) * 20,
                    cy - 35 + (Math.random() - 0.5) * 20,
                    1.5 + Math.random() * 2,
                    0, Math.PI * 2
                );
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }
};

// 狂暴模式狀態機
const feverState = {
    isActive: false,
    combo: 0,
    lastHitTime: 0,
    
    addCombo() {
        const now = Date.now();
        if (now - this.lastHitTime < 5000) { // 5秒內連擊有效
            this.combo++;
        } else {
            this.combo = 1;
        }
        this.lastHitTime = now;
        
        let progress = Math.min((this.combo / 5) * 100, 100);
        feverBar.style.width = `${progress}%`;

        if (this.combo >= 5 && !this.isActive) {
            this.activate();
        }
    },
    resetCombo() {
        if (this.isActive) return;
        this.combo = 0;
        feverBar.style.width = '0%';
    },
    activate() {
        this.isActive = true;
        document.body.classList.add('fever-mode');
        // 狂暴模式：速度變慢
        gameState.baseSpeed = 0.5; 
        SFX.playFever();
        
        setTimeout(() => this.deactivate(), 10000); // 維持 10 秒
    },
    deactivate() {
        this.isActive = false;
        this.combo = 0;
        feverBar.style.width = '0%';
        document.body.classList.remove('fever-mode');
        gameState.baseSpeed = 1.0;
    }
};

// --- 2. Canvas 高畫質校正 ---
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    logicalWidth = rect.width;
    logicalHeight = rect.height;

    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.textBaseline = "top";

    wizard.updatePosition();
    if (stars.length === 0) initStars();
}
window.addEventListener('resize', resizeCanvas);

// --- 3. 虛擬鍵盤生成 ---
function initKeyboard() {
    const container = document.getElementById('keyboard-container');
    const layout = [
        ['q','w','e','r','t','y','u','i','o','p'],
        ['a','s','d','f','g','h','j','k','l'],
        ['z','x','c','v','b','n','m']
    ];
    
    layout.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'keyboard-row';
        row.forEach(key => {
            const btn = document.createElement('button');
            btn.className = 'key-btn';
            btn.textContent = key;
            btn.setAttribute('data-key', key);
            
            // 觸控與點擊事件
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(key); });
            btn.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput(key); });
            
            rowDiv.appendChild(btn);
        });
        container.appendChild(rowDiv);
    });

    // 監聽實體鍵盤
    document.addEventListener('keydown', (e) => {
        if (/^[a-zA-Z]$/.test(e.key)) {
            handleInput(e.key.toLowerCase());
            // 讓虛擬按鍵閃爍一下
            const btn = document.querySelector(`.key-btn[data-key="${e.key.toLowerCase()}"]`);
            if (btn) {
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 100);
            }
        }
    });
}

// --- 4. 核心遊戲邏輯 ---
function spawnWord() {
    const randomVocab = vocabList[Math.floor(Math.random() * vocabList.length)];
    
    // 用中文翻譯的寬度來計算水平位置（因為畫面主要顯示中文）
    ctx.font = "28px Arial";
    const translationWidth = ctx.measureText(randomVocab.translation).width;
    // 同時預估底線拼寫區的寬度
    ctx.font = "22px 'Courier New', monospace";
    const spellWidth = ctx.measureText(randomVocab.word.replace(/./g, '_ ')).width;
    const maxWidth = Math.max(translationWidth, spellWidth);
    
    // 確保不會超出邊界
    const xPos = Math.max(10, Math.random() * (logicalWidth - maxWidth - 20));

    gameState.activeWords.push({
        text: randomVocab.word,
        translation: randomVocab.translation,
        x: xPos,
        y: -40,
        speed: gameState.baseSpeed + (Math.random() * 0.5),
        typedIndex: 0
    });
}

// --- 練習模式：生成單字（不動，置中）---
function spawnPracticeWord() {
    // 避免重複出題（用完再重置）
    if (practiceState.usedIndices.length >= vocabList.length) {
        practiceState.usedIndices = [];
    }
    let idx;
    do {
        idx = Math.floor(Math.random() * vocabList.length);
    } while (practiceState.usedIndices.includes(idx) && practiceState.usedIndices.length < vocabList.length);
    practiceState.usedIndices.push(idx);

    const vocab = vocabList[idx];
    practiceState.currentWord = {
        text: vocab.word,
        translation: vocab.translation,
        typedIndex: 0
    };
}

let lastTimestamp = 0;

function update(timestamp) {
    const dt = timestamp - lastTimestamp || 16;
    lastTimestamp = timestamp;

    if (gameMode === 'practice') {
        // 練習模式：只更新角色和特效，不移動單字
        wizard.update(dt);
        updateAllEffects();
        return;
    }

    // === 以下為防禦模式邏輯 ===
    const now = Date.now();

    // 難度遞增邏輯
    gameState.baseSpeed = 1.0 + Math.floor(gameState.score / 100) * 0.2;

    // 生成新單字
    if (now - gameState.lastSpawnTime > gameState.spawnInterval) {
        spawnWord();
        gameState.lastSpawnTime = now;
    }

    // 更新位置與觸底判定
    for (let i = gameState.activeWords.length - 1; i >= 0; i--) {
        let word = gameState.activeWords[i];
        word.y += word.speed;

        // 觸底判定（留出角色空間）
        if (word.y > logicalHeight - 70) {
            // 受傷特效
            triggerHurtEffect(word.x + 40, word.y);
            
            gameState.activeWords.splice(i, 1);
            gameState.hp--;
            updateHPDisplay();
            feverState.resetCombo();
            
            // 角色受傷 + 音效
            wizard.setState('hurt', 600);
            SFX.playHurt();
            
            // 畫面震動效果
            document.getElementById('game-container').style.transform = 'translate(-10px, 0)';
            setTimeout(() => document.getElementById('game-container').style.transform = 'translate(0, 0)', 100);

            if (gameState.hp <= 0) gameOver();
        }
    }

    // 更新角色與所有特效
    wizard.update(dt);
    updateAllEffects();
}

// --- 繪製共用的單字拼寫卡 ---
function drawWordCard(word, centerX, wordY) {
    // 畫中文翻譯
    ctx.font = "28px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = feverState.isActive ? "#ff9f43" : "#ffcc00";
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(word.translation, centerX, wordY);
    ctx.shadowBlur = 0;

    // 逐字元繪製拼寫進度
    ctx.font = "22px 'Courier New', monospace";
    const charWidth = ctx.measureText("M").width;
    const gap = 6;
    const totalLen = word.text.length;
    const totalWidth = totalLen * charWidth + (totalLen - 1) * gap;
    const startX = centerX - totalWidth / 2;

    for (let i = 0; i < totalLen; i++) {
        const charX = startX + i * (charWidth + gap) + charWidth / 2;

        if (i < word.typedIndex) {
            ctx.textAlign = "center";
            ctx.fillStyle = feverState.isActive ? "#ff9f43" : "#4CAF50";
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 6;
            ctx.fillText(word.text[i], charX, wordY + 34);
            ctx.shadowBlur = 0;
        } else {
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
            ctx.fillText("_", charX, wordY + 34);
        }
    }
}

function draw(timestamp) {
    // 繪製星空背景
    drawBackground(timestamp);
    
    if (gameMode === 'practice') {
        // === 練習模式繪製 ===
        const word = practiceState.currentWord;
        if (word) {
            const centerX = logicalWidth / 2;
            const wordY = logicalHeight * 0.3;

            // 背景裝飾光暈
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = '#7B68EE';
            ctx.beginPath();
            ctx.arc(centerX, wordY + 20, 80, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // 繪製大字中文 + 拼寫底線
            ctx.font = "36px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ffcc00";
            ctx.shadowColor = 'rgba(255,204,0,0.3)';
            ctx.shadowBlur = 12;
            ctx.fillText(word.translation, centerX, wordY);
            ctx.shadowBlur = 0;

            // 拼寫進度
            ctx.font = "26px 'Courier New', monospace";
            const charWidth = ctx.measureText("M").width;
            const gap = 8;
            const totalLen = word.text.length;
            const totalWidth = totalLen * charWidth + (totalLen - 1) * gap;
            const startX = centerX - totalWidth / 2;

            for (let i = 0; i < totalLen; i++) {
                const charX = startX + i * (charWidth + gap) + charWidth / 2;
                if (i < word.typedIndex) {
                    ctx.textAlign = "center";
                    ctx.fillStyle = "#4CAF50";
                    ctx.shadowColor = '#4CAF50';
                    ctx.shadowBlur = 8;
                    ctx.fillText(word.text[i], charX, wordY + 50);
                    ctx.shadowBlur = 0;
                } else {
                    ctx.textAlign = "center";
                    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                    ctx.fillText("_", charX, wordY + 50);
                }
            }

            // 練習模式計數器
            ctx.font = "16px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            const acc = practiceState.totalAttempts > 0
                ? Math.round(practiceState.correctAttempts / practiceState.totalAttempts * 100)
                : 100;
            ctx.fillText(`已完成: ${practiceState.completedCount}  |  正確率: ${acc}%`, centerX, wordY + 90);
        }
    } else {
        // === 防禦模式繪製 ===
        gameState.activeWords.forEach(word => {
            ctx.font = "28px Arial";
            const centerX = word.x + ctx.measureText(word.translation).width / 2;
            drawWordCard(word, centerX, word.y);
        });
    }

    // 繪製所有特效
    drawAllEffects();

    // 繪製巫師角色
    wizard.draw();
}

function gameLoop(timestamp) {
    if (!gameState.isPlaying) return;
    update(timestamp);
    draw(timestamp);
    gameLoopId = requestAnimationFrame(gameLoop);
}

// --- 5. 輸入判定邏輯 ---
function handleInput(letter) {
    if (!gameState.isPlaying) return;

    if (gameMode === 'practice') {
        handlePracticeInput(letter);
        return;
    }

    // === 防禦模式輸入 ===
    let targetWord = gameState.activeWords.find(w => w.typedIndex > 0);
    
    if (!targetWord) {
        const candidates = gameState.activeWords.filter(w => w.text[0] === letter);
        if (candidates.length > 0) {
            targetWord = candidates.reduce((prev, current) => (prev.y > current.y) ? prev : current);
        }
    }

    if (targetWord && targetWord.text[targetWord.typedIndex] === letter) {
        targetWord.typedIndex++;
        SFX.playType();
        wizard.setState('cast', 300);
        
        ctx.font = "22px 'Courier New', monospace";
        const cw = ctx.measureText('M').width;
        const tLen = targetWord.text.length;
        const tTotalW = tLen * cw + (tLen - 1) * 6;
        const tStartX = (targetWord.x + 40) - tTotalW / 2;
        const hitCharX = tStartX + (targetWord.typedIndex - 1) * (cw + 6) + cw / 2;
        spawnParticles(hitCharX, targetWord.y + 40, '#4CAF50', 4, { speedMult: 0.5, sizeMult: 0.5 });
        
        if (targetWord.typedIndex === targetWord.text.length) {
            const idx = gameState.activeWords.indexOf(targetWord);
            ctx.font = "28px Arial";
            const wordCenterX = targetWord.x + ctx.measureText(targetWord.translation).width / 2;
            const wordY = targetWord.y;
            triggerEliminateEffect(wordCenterX, wordY, targetWord, feverState.isActive);
            gameState.activeWords.splice(idx, 1);
            let points = feverState.isActive ? 20 : 10;
            gameState.score += points;
            scoreDisplay.innerText = gameState.score;
            feverState.addCombo();
            SFX.playEliminate();
        }
    } else {
        SFX.playError();
        feverState.resetCombo();
    }
}

// --- 練習模式輸入 ---
function handlePracticeInput(letter) {
    const word = practiceState.currentWord;
    if (!word) return;

    practiceState.totalAttempts++;

    if (word.text[word.typedIndex] === letter) {
        // 拼對
        word.typedIndex++;
        practiceState.correctAttempts++;
        SFX.playType();
        wizard.setState('cast', 300);

        // 字母粒子回饋
        const centerX = logicalWidth / 2;
        const wordY = logicalHeight * 0.3;
        ctx.font = "26px 'Courier New', monospace";
        const cw = ctx.measureText('M').width;
        const gap = 8;
        const totalW = word.text.length * cw + (word.text.length - 1) * gap;
        const startX = centerX - totalW / 2;
        const hitCharX = startX + (word.typedIndex - 1) * (cw + gap) + cw / 2;
        spawnParticles(hitCharX, wordY + 55, '#4CAF50', 4, { speedMult: 0.5, sizeMult: 0.5 });

        if (word.typedIndex === word.text.length) {
            // 完整拼出！
            practiceState.completedCount++;

            // 消除特效
            triggerEliminateEffect(centerX, wordY, word, false);
            SFX.playEliminate();

            // 短暫延遲後生成下一個單字
            practiceState.currentWord = null;
            setTimeout(() => {
                if (gameState.isPlaying && gameMode === 'practice') {
                    spawnPracticeWord();
                }
            }, 600);
        }
    } else {
        // 拼錯
        SFX.playError();
        // 畫面小震動
        document.getElementById('game-container').style.transform = 'translate(-4px, 0)';
        setTimeout(() => document.getElementById('game-container').style.transform = 'translate(0, 0)', 80);
    }
}

// --- 6. 遊戲流程控制 ---
function updateHPDisplay() {
    if (gameMode === 'practice') {
        hpDisplay.innerText = '📖';
    } else {
        hpDisplay.innerText = '❤️'.repeat(Math.max(0, gameState.hp));
    }
}

function hideAllScreens() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('practice-end-screen').style.display = 'none';
    document.getElementById('category-screen').style.display = 'none';
    document.getElementById('dictionary-screen').style.display = 'none';
    document.getElementById('batch-screen').style.display = 'none';
}

function showMainMenu() {
    gameState.isPlaying = false;
    cancelAnimationFrame(gameLoopId);
    SFX.stopBGM();
    hideAllScreens();
    document.getElementById('start-screen').style.display = 'flex';
    // 重置顯示
    hpDisplay.innerText = '❤️❤️❤️';
    scoreDisplay.innerText = '0';
}

function gameOver() {
    gameState.isPlaying = false;
    cancelAnimationFrame(gameLoopId);
    SFX.playGameOver();
    SFX.stopBGM();
    document.getElementById('final-score').innerText = gameState.score;
    document.getElementById('game-over-screen').style.display = 'flex';
    
    // 非同步上傳分數
    let playerName = prompt("請輸入您的名字記錄排行榜：", "Player");
    if(playerName) uploadScore(playerName, gameState.score);
}

function endPractice() {
    gameState.isPlaying = false;
    cancelAnimationFrame(gameLoopId);
    SFX.stopBGM();

    const acc = practiceState.totalAttempts > 0
        ? Math.round(practiceState.correctAttempts / practiceState.totalAttempts * 100)
        : 0;
    document.getElementById('practice-count').innerText = practiceState.completedCount;
    document.getElementById('practice-accuracy').innerText = acc;
    document.getElementById('practice-end-screen').style.display = 'flex';
}

function clearEffects() {
    particles.length = 0;
    shockwaves.length = 0;
    floatingTexts.length = 0;
    sparkles.length = 0;
    letterExplosions.length = 0;
    screenFlash = 0;
}

let allVocabData = [];     // 從 API 取得的完整題庫
let selectedCategory = null; // 目前選擇的分類（null = 全部）
let selectedBatchRange = null; // 目前選擇的批次範圍 {start, end}
let pendingMode = 'defense'; // 等待分類選擇的模式

// --- 顯示分類選擇畫面 ---
async function showCategoryScreen(mode) {
    pendingMode = mode;
    SFX.init();

    // 先取得完整題庫
    hideAllScreens();
    document.getElementById('category-screen').style.display = 'flex';
    
    let titleStr = '📚 選擇題庫';
    if (mode === 'practice') titleStr = '📖 選擇練習題庫';
    if (mode === 'defense') titleStr = '⚔️ 選擇對戰題庫';
    if (mode === 'dictionary') titleStr = '👀 選擇預覽題庫';
    document.getElementById('category-title').textContent = titleStr;

    const listEl = document.getElementById('category-list');
    listEl.innerHTML = '<p style="color:#888; font-size:0.9rem;">⏳ 載入題庫中...</p>';

    allVocabData = await fetchVocab();

    // 提取所有分類並統計數量
    const categoryMap = {};
    allVocabData.forEach(v => {
        const cat = v.category || '未分類';
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const categories = Object.keys(categoryMap);

    // 生成按鈕
    let html = '';

    // 「全部」按鈕
    html += `<button class="category-btn all-btn" data-category="__all__">
        <span class="category-name">📦 全部單字</span>
        <span class="category-count">${allVocabData.length} 個</span>
    </button>`;

    // 各分類按鈕
    categories.sort().forEach(cat => {
        html += `<button class="category-btn" data-category="${cat}">
            <span class="category-name">📁 ${cat}</span>
            <span class="category-count">${categoryMap[cat]} 個</span>
        </button>`;
    });

    listEl.innerHTML = html;

    // 綁定點擊事件
    listEl.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.getAttribute('data-category');
            selectedCategory = cat === '__all__' ? null : cat;
            
            if (pendingMode === 'dictionary') {
                showDictionaryScreen();
            } else if (pendingMode === 'practice') {
                showBatchScreen();
            } else {
                selectedBatchRange = null;
                startGame(pendingMode);
            }
        });
    });
}

// --- 顯示批次範圍選擇畫面 (練習模式專用) ---
function showBatchScreen() {
    hideAllScreens();
    document.getElementById('batch-screen').style.display = 'flex';
    
    let listData = allVocabData;
    if (selectedCategory) {
        listData = allVocabData.filter(v => (v.category || '未分類') === selectedCategory);
    }
    if (listData.length === 0) listData = [...allVocabData];
    
    const listEl = document.getElementById('batch-list');
    let html = '';
    
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(listData.length / BATCH_SIZE);

    // 「全部」按鈕
    html += `<button class="category-btn all-btn" data-start="0" data-end="${listData.length}">
        <span class="category-name">📦 全部練習</span>
        <span class="category-count">${listData.length} 個</span>
    </button>`;

    // 各批次按鈕
    for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min((i + 1) * BATCH_SIZE, listData.length);
        html += `<button class="category-btn" data-start="${start}" data-end="${end}">
            <span class="category-name">🔖 第 ${start + 1} ~ ${end} 題</span>
            <span class="category-count">${end - start} 個</span>
        </button>`;
    }
    
    listEl.innerHTML = html;

    listEl.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const start = parseInt(btn.getAttribute('data-start'));
            const end = parseInt(btn.getAttribute('data-end'));
            selectedBatchRange = { start, end };
            startGame('practice');
        });
    });
}

// --- 顯示單字圖鑑畫面 ---
function showDictionaryScreen() {
    hideAllScreens();
    document.getElementById('dictionary-screen').style.display = 'flex';
    
    let listData = allVocabData;
    if (selectedCategory) {
        listData = allVocabData.filter(v => (v.category || '未分類') === selectedCategory);
    }
    
    // 防呆
    if (listData.length === 0) listData = [...allVocabData];
    
    const listEl = document.getElementById('dictionary-list');
    let html = '';
    
    listData.forEach(v => {
        html += `<div class="dict-card">
            <span class="dict-word">${v.word}</span>
            <span class="dict-trans">${v.translation}</span>
        </div>`;
    });
    
    listEl.innerHTML = html;
}

async function startGame(mode) {
    gameMode = mode || 'defense';

    // 初始化音效
    SFX.init();
    hideAllScreens();

    // 篩選題庫
    if (allVocabData.length === 0) {
        allVocabData = await fetchVocab();
    }

    if (selectedCategory) {
        vocabList = allVocabData.filter(v => (v.category || '未分類') === selectedCategory);
    } else {
        vocabList = [...allVocabData];
    }

    // 防呆：篩選後題庫為空
    if (vocabList.length === 0) {
        vocabList = [...allVocabData];
    }

    // 處理批次範圍擷取
    if (selectedBatchRange) {
        vocabList = vocabList.slice(selectedBatchRange.start, selectedBatchRange.end);
    }

    // 重置共用狀態
    gameState.score = 0;
    gameState.activeWords = [];
    gameState.baseSpeed = 1.0;
    gameState.isPlaying = true;
    gameState.lastSpawnTime = Date.now();
    lastTimestamp = 0;
    clearEffects();
    feverState.deactivate();
    wizard.setState('idle');

    if (gameMode === 'practice') {
        // 練習模式初始化
        gameState.hp = 999;
        practiceState.currentWord = null;
        practiceState.completedCount = 0;
        practiceState.totalAttempts = 0;
        practiceState.correctAttempts = 0;
        practiceState.usedIndices = [];
        updateHPDisplay();
        const label = selectedCategory ? `📖 ${selectedCategory}` : '📖 練習';
        scoreDisplay.innerText = label;
        spawnPracticeWord();
    } else {
        // 防禦模式初始化
        gameState.hp = 3;
        updateHPDisplay();
        scoreDisplay.innerText = '0';
    }

    resizeCanvas();
    initStars();
    SFX.startBGM();
    gameLoop(performance.now());
}

// --- 初始化綁定 ---
initKeyboard();

// 模式選擇 → 進入分類選擇畫面
document.getElementById('start-defense-btn').addEventListener('click', () => showCategoryScreen('defense'));
document.getElementById('start-practice-btn').addEventListener('click', () => showCategoryScreen('practice'));
document.getElementById('start-dictionary-btn').addEventListener('click', () => showCategoryScreen('dictionary'));

// 分類畫面返回
document.getElementById('category-back-btn').addEventListener('click', showMainMenu);

// 批次選擇畫面返回分類畫面
document.getElementById('batch-back-btn').addEventListener('click', () => showCategoryScreen('practice'));

// 單字圖鑑返回分類畫面
document.getElementById('dictionary-back-btn').addEventListener('click', () => showCategoryScreen('dictionary'));

// 防禦模式結束畫面
document.getElementById('restart-btn').addEventListener('click', () => showCategoryScreen('defense'));
document.getElementById('back-menu-btn').addEventListener('click', showMainMenu);

// 練習模式結束畫面
document.getElementById('practice-restart-btn').addEventListener('click', () => showCategoryScreen('practice'));
document.getElementById('practice-menu-btn').addEventListener('click', showMainMenu);

// 監聽 ESC 鍵 — 練習模式中按 ESC 結束練習
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gameState.isPlaying && gameMode === 'practice') {
        endPractice();
    }
});

resizeCanvas(); // 初次載入預先校正