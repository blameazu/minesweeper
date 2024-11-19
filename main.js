// all const stuff

const debug = 0; // 0 not debuging 1 is debuging

let sz = 8;
let bombs = 5;
let nowdiff = 0;

const flag_image = '🚩';
const bomb_image = '💣';

let mp;
let vis;
let flag;

let now_timer = 0;
let clock = null;

let firstclick = true;

// timer system

function start_timer() {
    stop_timer();
    now_timer = 0;
    clock = setInterval(function() {
        const timer = document.getElementById('timer');
        timer.innerText = `times : ${Math.floor(now_timer/60)}:${now_timer%60}`;
        now_timer++;
    }, 1000);
}

function stop_timer() {
    clearInterval(clock);
}

// diff toggle system

const diffsetting = {
    1: {name:'Easy', size: 8, bombs: 5, color: "green"},
    2: { name:'Medium', size: 13, bombs: 40, color: "orange" },
    3: { name:'Hard', size : 16, bombs: 60, color: "red"}
};

const diff = document.getElementById('diff');
diff.addEventListener('click', togglediff);

function togglediff() {
    stop_game();
    nowdiff = (nowdiff+1)%3;
    const now = diffsetting[nowdiff+1];
    diff.textContent = `${now.name}`;
    diff.style.backgroundColor = `${now.color}`;
    sz = now.size;
    bombs = now.bombs;
    startgame();
}

// game-initializer

function generate_map() {
    const grid = document.getElementById('grid');
    grid.style.gridTemplateColumns = `repeat(${sz}, 40px)`;
    grid.innerHTML = '';
    for(let i = 0; i < sz; i++) {
        const row = document.createElement('div');
        for(let j = 0; j < sz; j++) {
            const cell = document.createElement('button');
            cell.name = `cell-${i}-${j}`;
            cell.className = `grid-button`;
            cell.addEventListener('click', () => {
                beclicked(i, j, cell);
            });
            cell.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                toggleFlag(i, j, cell);
            });
            row.appendChild(cell);
        }
        grid.appendChild(row);
    }
}

function place_bombs(i, j) {
    const grid = document.getElementById('grid');
    let now = 0;
    while(now < bombs) {
        const x = Math.floor(Math.random()*sz);
        const y = Math.floor(Math.random()*sz);
        if(x === i && y === j) continue;
        if(mp[x][y] === 0) {
            mp[x][y] = 1;
            now++;
            const cell = grid.children[x].children[y];
        }
    }
}

function startgame() {
    mp = Array.from({length : sz}, () => Array(sz).fill(0));
    vis = Array.from({length : sz}, () => Array(sz).fill(false));
    flag = Array.from({length : sz}, () => Array(sz).fill(false));
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    generate_map();
    firstclick = true;
    if(debug) console.log('map :', mp);
    upd(`grid size : ${sz}\n remaining bombs amount : ${bombs - accumulate(flag, true)}`);
}

// game-ender

function stop_game() {
    const grid = document.getElementById('grid');
    for(let i = 0; i < sz; i++)
        for(let j = 0; j < sz; j++) {
            const cell = grid.children[i].children[j];
            const ncell = cell.cloneNode(true);
            if(mp[i][j]) ncell.innerText = bomb_image;
            else color(cnt_bombs_around(i, j), ncell);
            cell.parentNode.replaceChild(ncell, cell);
        }
    stop_timer();
}

// small tool

function accumulate(arr, x) {
    return arr.reduce((re, now) => {
        return re + now.filter(now2 => now2 === x).length;
    }, 0);
}

//------ main-game-operation --------

// end

function make_play_again() {
    const information = document.getElementById('information');
    const button = document.createElement('button');
    button.innerText = 'Play Again!';
    button.className = 'play-again';
    button.addEventListener('click', () => {
        startgame();
    });
    information.append(button);
}

function lose() {
    upd('Game over!', 'warning');
    stop_game();
    make_play_again();
}

function win() {
    upd('You win!', 'success');
    stop_game();
    make_play_again();
}

// check

function check() {
    const sum = accumulate(vis, true);
    if(sum === sz*sz-bombs) win();
    if(debug) console.log(sum);
}

function toggleFlag(x, y, cell) {
    if(vis[x][y]) return;
    cell.innerText = (flag[x][y] ? '' : flag_image);
    flag[x][y] = !flag[x][y];
    check();
    upd(`grid size : ${sz}\n remaining bombs amount : ${bombs - accumulate(flag, true)}`);
}

// find-path-system

const dir = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const dir2 = [[0, 1], [1, 0], [-1, 0], [0, -1]];

function beclicked(x, y, cell){
    if(firstclick) {
        start_timer();
        firstclick = false;
        place_bombs(x, y);
    }
    if(flag[x][y]) return;
    if(mp[x][y]) {
        lose();
    } else {        
        const cnt = cnt_bombs_around(x, y);
        vis[x][y] = true;
        color(cnt, cell);
        if(!cnt) bfs(x, y);
        check();
    }
}

function cnt_bombs_around(x, y) {
    let re = 0;
    for(let [dx, dy] of dir) {
        const nx = x + dx;
        const ny = y + dy;
        if(nx < 0 || nx >= sz || ny < 0 || ny >= sz) continue;
        if(mp[nx][ny]) re++;
    }
    return re;
}

function bfs(x, y) {
    const qq = [[x, y]];
    while(qq.length) {
        const [xx, yy] = qq.shift();
        for(const [dx, dy] of dir2) {
            const nx = xx + dx;
            const ny = yy + dy;
            if(nx < 0 || nx >= sz || ny < 0 || ny >= sz) continue;
            if(vis[nx][ny]) continue;
            vis[nx][ny] = true;
            const cnt = cnt_bombs_around(nx, ny);
            const grid = document.getElementById('grid');
            color(cnt, grid.children[nx].children[ny]);
            if(!cnt) {
                qq.push([nx, ny]);
            }
        }
    }
}

// color

const colorDict = {
    0: "gray",
    1: "lime",
    2: "orange",
    3: "red",
    4: "purple",
    5: "darkblue",
    6: "darkred",
    7: "black",
    8: "gold"
};

function color(x, cell) {
    cell.innerText = x;
    cell.style.color = colorDict[x];
}

//------ main-game-operation --------

// update information div

function upd(text, type = 'normal') {
    const information = document.getElementById('information');
    information.innerText = text;

    if (type === 'warning') {
        information.style.backgroundColor = '#f8d7da';
        information.style.color = '#721c24';
        information.style.borderColor = '#f5c6cb';
    } else if (type === 'success') {
        information.style.backgroundColor = '#d4edda';
        information.style.color = '#155724';
        information.style.borderColor = '#c3e6cb';
    } else {
        information.style.backgroundColor = '#ffffff';
        information.style.color = '#495057';
        information.style.borderColor = '#ced4da';
    }
}

// main

function main() {
    startgame();
}

main();