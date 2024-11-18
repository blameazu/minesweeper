const debug = 1; // 0 not debuging 1 is debuging

const sz = 16;
const bombs = 30;

let mp = Array.from({length : sz}, () => Array(sz).fill(0));
let vis = Array.from({length : sz}, () => Array(sz).fill(false));
let flag = Array.from({length : sz}, () => Array(sz).fill(false));

const dir = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const dir2 = [[0, 1], [1, 0], [-1, 0], [0, -1]];

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

function place_bombs() {
    const grid = document.getElementById('grid');
    let now = 0;
    while(now < bombs) {
        const x = Math.floor(Math.random()*16);
        const y = Math.floor(Math.random()*16);
        if(mp[x][y] === 0) {
            mp[x][y] = 1;
            now++;
            const cell = grid.children[x].children[y];
        }
    }
}

function color(x, cell) {
    cell.innerText = x;
    cell.style.color = colorDict[x];
}

function accumulate(arr, x) {
    return arr.reduce((re, now) => {
        return re + now.filter(now2 => now2 === x).length;
    }, 0);
}

function check() {
    const sum = accumulate(vis, true) + accumulate(flag, true);
    if(sum === sz*sz) alert("you win!");
    if(debug) console.log(sum);
}

function generate_map() {
    const grid = document.getElementById('grid');
    for(let i = 0; i < sz; i++) {
        const row = document.createElement('div');
        for(let j = 0; j < sz; j++) {
            const cell = document.createElement('button');
            cell.name = `cell-${i}-${j}`;
            cell.style.display = 'inline-block';
            cell.style.margin = `2px`;
            cell.style.width = `30px`;
            cell.style.height = `30px`;
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

function toggleFlag(x, y, cell) {
    if(vis[x][y]) return;
    cell.innerText = (flag[x][y] ? '' : '🚩');
    flag[x][y] = !flag[x][y];
    check();
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

function beclicked(x, y, cell){
    if(flag[x][y]) return;
    if(mp[x][y]) {
        cell.innerText = '💣';
        alert('Game over!');
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

generate_map();
place_bombs();
if(debug) console.log('map :', mp);