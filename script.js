const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elements
const startScreen = document.getElementById('start-screen');
const countdownScreen = document.getElementById('countdown-screen');
const countdownText = document.getElementById('countdown-text');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endMessage = document.getElementById('end-message');
const hud = document.getElementById('hud');
const distanceTxt = document.getElementById('distance-txt');
const timeTxt = document.getElementById('time-txt');
const countdownSound = document.getElementById('countdown_full');
const gameplayMusic = document.getElementById('gameplay_music');

const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// Game Settings
const TARGET_DISTANCE = 1000; 
const START_TIME = 4.5 * 60; // 4.5 minutes in seconds
const NORMAL_SPEED = 4; // 4 meters per second
const BOOST_SPEED = 6; // 6 meters per second

// Game State variables
let distanceCovered = 0;
let timeRemaining = START_TIME;
let currentSpeed = NORMAL_SPEED;
let gameState = 'START'; // START, COUNTDOWN, PLAYING, GAMEOVER, VICTORY
let lastTime = 0;
let countdownVal = 3;
let countdownTimer = null;
let gameTimer = null;
let boostTimer = 0;

// Player data
const player = {
    lane: 1,      // 0: Left, 1: Center, 2: Right
    targetLane: 1,
    laneProgress: 0.5, // Interp value for lane switching
    isDucking: false,
    duckCounter: 0,
    yOffset: 0,
    victoryPose: false,
    crashFrame: 0
};

// Road Segments logic (Pseudo-3D pseudo tracking)
let trackPosition = 0;
const segmentLength = 20;
const totalSegments = 150;
let obstacles = [];

// Input handler
window.addEventListener('keydown', e => {
    if (gameState !== 'PLAYING') return;
    
    if ((e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') && player.targetLane > 0) {
        player.targetLane--;
    }
    if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') && player.targetLane < 2) {
        player.targetLane++;
    }
    if ((e.key === 'ArrowDown' || e.key.toLowerCase() === 's') && !player.isDucking) {
        player.isDucking = true;
        player.duckCounter = 30; // duck frames duration
    }
});

// Start Game Flow
startBtn.addEventListener('click', startCountdown);
restartBtn.addEventListener('click', resetToStart);

function resetToStart() {
    distanceCovered = 0;
    timeRemaining = START_TIME;
    currentSpeed = NORMAL_SPEED;
    player.lane = 1;
    player.targetLane = 1;
    player.isDucking = false;
    player.victoryPose = false;
    player.crashFrame = 0;
    obstacles = [];
    trackPosition = 0;
    
    // Stop and reset the gameplay music if it's currently running
    if (gameplayMusic) {
        gameplayMusic.pause();
        gameplayMusic.currentTime = 0;
    }
    if (countdownSound) {
        countdownSound.pause();
        countdownSound.currentTime = 0;
    }
    if (countdownTimer) clearInterval(countdownTimer);
    if (gameTimer) clearInterval(gameTimer);

    endScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    hud.classList.add('hidden');
    gameState = 'START';
    renderStaticBackground();
}

function startCountdown() {
    startScreen.classList.add('hidden');
    countdownScreen.classList.remove('hidden');
    gameState = 'COUNTDOWN';
    countdownVal = 3;
    countdownText.innerText = countdownVal;
    
    // Play the full audio tracking track (3, 2, 1, GO!) right away
    if (countdownSound) {
        countdownSound.currentTime = 0;
        countdownSound.play();
    }
    
    generateObstacles();

    countdownTimer = setInterval(() => {
        countdownVal--;
        if (countdownVal > 0) {
            countdownText.innerText = countdownVal;
        } else {
            clearInterval(countdownTimer);
            countdownScreen.classList.add('hidden');
            hud.classList.remove('hidden');
            gameState = 'PLAYING';
            lastTime = performance.now();
            
            // Start background driving music right as racing begins
            if (gameplayMusic) {
                gameplayMusic.currentTime = 0;
                gameplayMusic.play();
            }

            // Start clock timer
            gameTimer = setInterval(() => {
                if (gameState === 'PLAYING') {
                    timeRemaining--;
                    if (timeRemaining <= 0) {
                        endGame(false, "Time's up! The client cancelled.");
                    }
                }
            }, 1000);

            requestAnimationFrame(gameLoop);
        }
    }, 1000);
}

// Generate road hurdles based on distance milestones
function generateObstacles() {
    obstacles = []; // Clear old items
    
    // Spawns first hurdle 5 seconds in (5s * 4m/s = 20m)
    let currentZ = 20; 
    
    while (currentZ < 940) {
        if (currentZ > 20) {
            currentZ += Math.floor(Math.random() * 14) + 8;
        } else {
            currentZ += 40; 
        }
        
        // Don't spawn exactly over a checkpoint zone (Every 200m)
        if (Math.abs(currentZ % 200) < 15) {
            currentZ += 20; 
        }

        const types = ['car', 'truck', 'barrier', 'branch'];
        const type = types[Math.floor(Math.random() * types.length)];
        let lane = Math.floor(Math.random() * 3);

        if (type === 'truck') {
            const wide = Math.random() > 0.8;
            obstacles.push({ type, z: currentZ, lane: lane, wide: wide });
        } else {
            obstacles.push({ type, z: currentZ, lane: lane });
        }
    }
}

function endGame(success, message) {
    gameState = success ? 'VICTORY' : 'GAMEOVER';
    clearInterval(gameTimer);
    
    // Stop the gameplay music immediately upon win or crash
    if (gameplayMusic) {
        gameplayMusic.pause();
    }

    setTimeout(() => {
        hud.classList.add('hidden');
        endScreen.classList.remove('hidden');
        if (success) {
            endTitle.innerText = "Delivery Successful!";
            endTitle.style.color = "#00ff00";
        } else {
            endTitle.innerText = "Oh no! Crash!";
            endTitle.style.color = "#ff0000";
        }
        endMessage.innerText = message;
    }, success ? 2000 : 1000);
}

// Main Game Loop
function gameLoop(timestamp) {
    if (gameState !== 'PLAYING' && gameState !== 'VICTORY' && gameState !== 'GAMEOVER') return;

    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; 
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (gameState === 'PLAYING') {
        let baseSpeed = NORMAL_SPEED;
        
        let checkInterval = Math.floor(distanceCovered / 200);
        let currentMilestone = (checkInterval + 1) * 200;
        
        if (boostTimer > 0) {
            boostTimer -= dt;
            baseSpeed = BOOST_SPEED;
        }

        if (Math.abs(distanceCovered - currentMilestone) < 2 && boostTimer <= 0 && currentMilestone < TARGET_DISTANCE) {
            boostTimer = 3; 
        }

        currentSpeed = baseSpeed;
        
        // Progress positions
        distanceCovered += currentSpeed * dt;
        trackPosition += currentSpeed * 25 * dt; // Fast rendering scroll warp velocity

        // Check Victory
        if (distanceCovered >= TARGET_DISTANCE) {
            distanceCovered = TARGET_DISTANCE;
            gameState = 'VICTORY';
            player.victoryPose = true;
            endGame(true, "Great job! You delivered the parcel safely!");
        }

        player.lane += (player.targetLane - player.lane) * 0.2;

        if (player.isDucking) {
            player.duckCounter--;
            if (player.duckCounter <= 0) player.isDucking = false;
        }

        checkCollisions();
    } else if (gameState === 'GAMEOVER') {
        player.crashFrame++;
    }
}

function checkCollisions() {
    const playerLaneInt = Math.round(player.lane);
    const exactLane = player.lane; 

    obstacles.forEach(obs => {
        let zDiff = (obs.z - distanceCovered) * 1.5;

        if (zDiff >= -0.05 && zDiff < 0.8) {
            let hits = false;
            
            if (obs.type === 'truck' && obs.wide) {
                let lane2 = obs.lane === 2 ? 1 : obs.lane + 1;
                if (playerLaneInt === obs.lane || playerLaneInt === lane2) {
                    if (Math.abs(exactLane - obs.lane) < 0.6 || Math.abs(exactLane - lane2) < 0.6) {
                        hits = true;
                    }
                }
            } 
            else {
                if (playerLaneInt === obs.lane) {
                    if (Math.abs(exactLane - obs.lane) < 0.55) {
                        hits = true;
                    }
                }
            }

            if (hits && obs.type === 'branch' && player.isDucking) {
                hits = false; 
            }

            if (hits) {
                endGame(false, "Oh no! You didn't make it to your destination.");
            }
        }
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let metersLeft = Math.max(0, Math.ceil(TARGET_DISTANCE - distanceCovered));
    distanceTxt.innerText = metersLeft + "m";
    
    let mins = Math.floor(timeRemaining / 60);
    let secs = timeRemaining % 60;
    timeTxt.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    let horizon = 180;

    ctx.save();
    if (boostTimer > 0 && gameState === 'PLAYING') {
        ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    }

    // Sky Background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, horizon);
    
    // Background Ground layer
    ctx.fillStyle = '#654321';
    ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

    drawSuburbanScenery(horizon);
    drawRoad(horizon);
    drawCheckpoints(horizon);
    drawObstacles(horizon);
    drawPlayer(horizon);

    ctx.restore();
}

function renderStaticBackground() {
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSuburbanScenery(horizon) {
    ctx.fillStyle = '#228B22'; // Grass
    ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

    // Left Side Houses
    ctx.fillStyle = '#cc6666';
    for (let i = -1; i < 5; i++) {
        let z = (i * 180) - (trackPosition % 180);
        let scale = 150 / (z + 100);
        if (scale > 0 && scale < 3) {
            let x = 80 - (scale * 100);
            let y = horizon + (scale * 20);
            let w = 70 * scale;
            let h = 50 * scale;
            ctx.fillRect(x, y - h, w, h);
            
            ctx.fillStyle = '#993333';
            ctx.beginPath();
            ctx.moveTo(x, y - h);
            ctx.lineTo(x + w/2, y - h - (15 * scale));
            ctx.lineTo(x + w, y - h);
            ctx.fill();
            ctx.fillStyle = '#cc6666';
        }
    }

    // Roadside Trees flanking both horizons
    for (let i = -1; i < 6; i++) {
        let z = (i * 120) - (trackPosition % 120);
        let scale = 150 / (z + 100);
        if (scale > 0 && scale < 3) {
            let xRight = 720 + (scale * 40);
            let yRight = horizon + (scale * 25);
            
            // Right Side Trees
            ctx.fillStyle = '#5c4033'; 
            ctx.fillRect(xRight - (5 * scale), yRight - (40 * scale), 10 * scale, 40 * scale);
            ctx.fillStyle = '#1e5e1e'; 
            ctx.beginPath();
            ctx.arc(xRight, yRight - (40 * scale), 20 * scale, 0, Math.PI * 2);
            ctx.fill();
            
            // Left Side Trees interspersed
            let xLeft = 190 - (scale * 80);
            ctx.fillStyle = '#5c4033';
            ctx.fillRect(xLeft - (4 * scale), yRight - (35 * scale), 8 * scale, 35 * scale);
            ctx.fillStyle = '#1e5e1e';
            ctx.beginPath();
            ctx.arc(xLeft, yRight - (35 * scale), 15 * scale, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (distanceCovered >= TARGET_DISTANCE - 80) {
        ctx.fillStyle = '#ffd700'; 
        ctx.fillRect(300, horizon - 60, 200, 110);
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(380, horizon, 40, 50); 
    }
}

function drawRoad(horizon) {
    ctx.fillStyle = '#555555'; 
    ctx.beginPath();
    ctx.moveTo(350, horizon);
    ctx.lineTo(450, horizon);
    ctx.lineTo(750, canvas.height);
    ctx.lineTo(50, canvas.height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(350, horizon); ctx.lineTo(50, canvas.height);
    ctx.moveTo(450, horizon); ctx.lineTo(750, canvas.height);
    ctx.stroke();

    if (distanceCovered > 300) {
        ctx.fillStyle = '#e6c280'; 
        ctx.beginPath();
        ctx.moveTo(50, canvas.height);
        ctx.lineTo(120, canvas.height);
        ctx.lineTo(365, horizon);
        ctx.lineTo(350, horizon);
        ctx.fill();
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    let dashOffset = (trackPosition % 40);
    
    for (let y = horizon; y < canvas.height; y += 10) {
        let percent = (y - horizon) / (canvas.height - horizon);
        if (Math.floor((y + dashOffset) / 20) % 2 === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(350 + (200 * percent) - 2, y, 4, 3);
            ctx.fillRect(350 + (270 * percent) + 40, y, 4, 3);
        }
    }
}

function drawCheckpoints(horizon) {
    for (let m = 200; m < TARGET_DISTANCE; m += 200) {
        let zDiff = m - distanceCovered;
        if (zDiff > -10 && zDiff < 70) {
            let percent = 1 - (zDiff / 70);
            if (percent >= 0 && percent <= 1) {
                let y = horizon + (canvas.height - horizon) * percent;
                let w = 100 + (500 * percent);
                let x = canvas.width / 2 - w / 2;
                
                ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
                ctx.fillRect(x, y, w, 15 * percent);
            }
        }
    }
}

function drawObstacles(horizon) {
    obstacles.forEach(obs => {
        let zDiff = (obs.z - distanceCovered) * 1.5; 
        
        if (zDiff > 0 && zDiff < 70) { 
            let percent = 1 - (zDiff / 70);
            let y = horizon + (canvas.height - horizon) * percent;
            
            let roadWidth = 100 + (600 * percent);
            let startX = canvas.width / 2 - roadWidth / 2;
            let laneWidth = roadWidth / 3;
            let x = startX + (obs.lane * laneWidth) + laneWidth / 2;
            
            let size = 25 * percent * 2.5; 

            ctx.save();
            if (obs.type === 'car') {
                ctx.fillStyle = '#ff3333'; 
                ctx.fillRect(x - size, y - size, size * 2, size);
                ctx.fillStyle = '#000'; 
                ctx.fillRect(x - size, y, size * 0.4, size * 0.3);
                ctx.fillRect(x + size - (size * 0.4), y, size * 0.4, size * 0.3);
            } else if (obs.type === 'truck') {
                ctx.fillStyle = '#3333cc'; 
                let truckWidth = obs.wide ? size * 3.5 : size * 2.2;
                ctx.fillRect(x - truckWidth/2, y - size * 2, truckWidth, size * 2);
                ctx.fillStyle = '#aaaaaa'; 
                ctx.fillRect(x - truckWidth/2 + 4, y - size * 1.6, truckWidth - 8, size * 0.4);
            } else if (obs.type === 'barrier') {
                ctx.fillStyle = '#ff6600'; 
                ctx.fillRect(x - size, y - size * 0.7, size * 2, size * 0.7);
                ctx.fillStyle = '#ffffff'; 
                ctx.fillRect(x - size + 5, y - size * 0.5, size * 0.4, size * 0.2);
                ctx.fillRect(x + size - 15, y - size * 0.5, size * 0.4, size * 0.2);
            } else if (obs.type === 'branch') {
                ctx.fillStyle = '#5c4033'; 
                ctx.fillRect(startX + (obs.lane * laneWidth) - 40, y - size * 2.2, laneWidth + 80, size * 0.3);
                ctx.fillStyle = '#228b22'; 
                ctx.fillRect(startX + (obs.lane * laneWidth) - 10, y - size * 2.5, laneWidth * 0.8, size * 0.7);
                ctx.fillStyle = '#1e5e1e';
                ctx.fillRect(startX + (obs.lane * laneWidth) + 5, y - size * 2.1, laneWidth * 0.5, size * 0.4);
            }
            ctx.restore();
        }
    });
}

function drawPlayer(horizon) {
    let roadWidth = 100 + (600 * 0.9); 
    let startX = canvas.width / 2 - roadWidth / 2;
    let laneWidth = roadWidth / 3;
    let playerX = startX + (player.lane * laneWidth) + laneWidth / 2;
    let playerY = canvas.height - 30;

    if (gameState === 'GAMEOVER') {
        ctx.fillStyle = player.crashFrame % 2 === 0 ? '#ff4500' : '#ffcc00';
        ctx.beginPath();
        ctx.arc(playerX, playerY - 30, 40 + player.crashFrame, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    ctx.save();
    let scale = 1.3;
    
    if (player.isDucking) {
        ctx.translate(0, 20); 
    }

    // Cargo Box
    ctx.fillStyle = '#d2b772'; 
    ctx.fillRect(playerX - 25 * scale, playerY - 75 * scale, 50 * scale, 50 * scale);
    ctx.strokeStyle = '#776a49';
    ctx.lineWidth = 3;
    ctx.strokeRect(playerX - 25 * scale, playerY - 75 * scale, 50 * scale, 50 * scale);

    // Rear Tire Assembly
    ctx.fillStyle = '#222'; 
    ctx.fillRect(playerX - 8 * scale, playerY - 30 * scale, 16 * scale, 32 * scale);
    
    // Safety Frame
    ctx.fillStyle = '#888888';
    ctx.fillRect(playerX - 28 * scale, playerY - 35 * scale, 6 * scale, 12 * scale);
    ctx.fillRect(playerX + 22 * scale, playerY - 35 * scale, 6 * scale, 12 * scale);

    // Rider
    ctx.fillStyle = '#ff3333'; 
    if (player.victoryPose) {
        ctx.fillRect(playerX - 15 * scale, playerY - 95 * scale, 30 * scale, 20 * scale);
        ctx.fillStyle = '#ffccaa'; 
        ctx.fillRect(playerX - 35 * scale, playerY - 115 * scale, 10 * scale, 15 * scale);
        ctx.fillRect(playerX + 25 * scale, playerY - 115 * scale, 10 * scale, 15 * scale);
    } else {
        ctx.fillRect(playerX - 12 * scale, playerY - 90 * scale, 24 * scale, 18 * scale);
        ctx.fillStyle = '#111'; 
        ctx.fillRect(playerX - 12 * scale, playerY - 86 * scale, 24 * scale, 6 * scale);
    }

    ctx.restore();
}

// Render base initial scene structure
renderStaticBackground();