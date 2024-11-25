import { start_timer, stop_timer, get_timer } from "./clock.js";
import { write, load } from "./scoreboard.js";

let size = 0, bombs = 0, first_click = true;

let mp, vis, flag;

let mode;

const flag_image = '🚩';
const bomb_image = '💣';

/* toggle flag and open system */
    function togglemode() {
        mode = !mode;
        document.getElementById('togglemode').innerText = (mode ? flag_image : "🧑‍🦯‍➡️");
    }
/* toggle flag and open system */

/* diff system */
    const diff_button = document.getElementById('diff');
    let now_diff = 0;
    const diffsetting = [
        {name : "Easy", size : 8, bombs : 5},
        {name : "Medium", size : 13, bombs : 30},
        {name : "Hard", size :16, bombs : 60},
        {name : "Hell", size : 30, bombs : 500}
    ];
    function togglediff() {
        now_diff = (now_diff+1)%4;
        reload();
    }
/* diff system */

/* initializing map system */
    function pre() {
        mode = 0;
        size = diffsetting[now_diff].size;
        bombs = diffsetting[now_diff].bombs;
        diff_button.classList = diffsetting[now_diff].name.toLowerCase();
        diff_button.innerText = diffsetting[now_diff].name;
        mp = Array.from({length : size}, () => Array(size).fill(false));
        vis = Array.from({length : size}, () => Array(size).fill(false));
        flag = Array.from({length : size}, () => Array(size).fill(false));
        first_click = true;
        upd(`grid size : ${size}\n ${bomb_image} : ${bombs - accumulate(flag, true)} / ${bombs}`);
        grid.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        /* prevent user from reloading the page during gameplay */
        window.onbeforeunload = function() {
            if (!first_click) {
                return 'Are you sure you want to leave the game ?';
            }
        }
    }
    function map_generating() {
        const grid = document.getElementById('grid');
        grid.innerHTML = '';
        grid.style.gridTemplateColumns = `repeat(${size}, 40px)`;
        for(let i = 0; i < size; i++) {
            for(let j = 0; j < size; j++) {
                const cell = document.createElement('button');
                cell.name =  `cell-${i}-${j}`;
                cell.className = 'cell';
                cell.addEventListener('click', () => {
                    clicked(i, j);
                });
                cell.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    toggleflag(i, j);
                });
                grid.appendChild(cell);
            }
        }
    }
    function reload() {
        load(diffsetting[now_diff].name);
        stop_timer();
        pre();
        map_generating();
    }
    function place_bombs(i, j) {
        let now = 0;
        while(now < bombs) {
            const x = Math.floor(Math.random()*size);
            const y = Math.floor(Math.random()*size);
            if(x === i && y === j) continue;
            if(abs(x-i) <= 1 && abs(y-j) <= 1) continue;
            if(!mp[x][y]) {
                mp[x][y] = true;
                now++;
            }
        }
    }
/* initializing map system */

/* algorithm */
    const dir = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    function cnt_around(x, y, arr = mp) {
        let re = 0;
        for(const [dx, dy] of dir) {
            const nx = x + dx;
            const ny = y + dy;
            if(nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
            if(arr[nx][ny]) re++;
        }
        return re;
    }
    function open_around(x, y) {
        for(const [dx, dy] of dir) {
            const nx = x + dx;
            const ny = y + dy;
            if(nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
            if(flag[nx][ny]) continue;
            if(vis[nx][ny]) continue;
            if(mp[nx][ny]) {lose(); return;}
            clicked(nx, ny);
        }
    }
    function bfs(x, y) {
        const queue = [[x, y]];
        while(queue.length) {
            const [xx, yy] = queue.shift();
            for(const [dx, dy] of dir) {
                const nx = xx + dx;
                const ny = yy + dy;
                if(nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                if(vis[nx][ny]) continue;
                open(nx, ny);
                if(!cnt_around(nx, ny)) {
                    queue.push([nx, ny]);
                }
            }
        }
    }
    function accumulate(arr, x) {
        return arr.reduce((re, now) => {
            return re + now.filter(now2 => now2 === x).length;
        }, 0);
    }
    function abs(x) {return x >= 0 ? x : -x;}
/* algorithm */

/* cell interact */
    function display(x, y) {
        const cnt = cnt_around(x, y);
        const cell = document.getElementById('grid').children[x*size + y];
        cell.classList = `cell-${cnt}`;
        cell.innerText = cnt;
    }
    function open(x, y) {
        vis[x][y] = true;
        display(x, y);
        check();
    }
    function clicked(x, y) {
        if(mode) {toggleflag(x, y); return;}
        if(flag[x][y]) return;
        if(mp[x][y]) {
            lose();
            return;
        }
        if(vis[x][y] && cnt_around(x, y, flag) == cnt_around(x, y)) {
            open_around(x, y);
            return;
        }
        if(first_click) {
            place_bombs(x, y);
            first_click = false;
            start_timer();
        }
        open(x, y);
        if(!cnt_around(x, y)) bfs(x, y);
    }
    function toggleflag(x, y) {
        if(vis[x][y]) return;
        document.getElementById('grid').children[x*size + y].innerText = (flag[x][y] ? '' : flag_image);
        flag[x][y] = !flag[x][y];
        check();
        upd(`grid size : ${size}\n ${flag_image} : ${bombs - accumulate(flag, true)} / ${bombs}`);
    }
/* cell interact */

/* game-stop */
    function end() {
        window.onbeforeunload = function () {};

        stop_timer();
        const grid = document.getElementById('grid');
        for(let i = 0; i < size; i++)
            for(let j = 0; j < size; j++) {
                const cell = grid.children[i*size+j];
                const ncell = cell.cloneNode(true);
                if(mp[i][j] && !flag[i][j]) ncell.innerText = bomb_image;
                else if(!mp[i][j]) display(i, j);
                cell.parentNode.replaceChild(ncell, cell);
            }
    }
    function lose() {
        end();
        upd('You lost!', 'warning');
    }
    async function win() {
        const msg = `It seems that you have beated the game with difficulty ${diffsetting[now_diff].name}!\n I want to told you that you are very billiant!\n And I want to write down on the scoreboard!\n please sign down your name in following text!\nbtw : the name should only contain spaces or alphas or digits, others will not be accepted\n`;
        end();
        upd('You won!', 'success');
        await sleep(200);
        const name = prompt(msg, "Enter your name here");
        const timer = get_timer();
        if(!name) name = "Anonymous user";
        write(name, diffsetting[now_diff].name, timer);
    }
/* game-stop */

/* game-checking */
    function check() {
        const sum = accumulate(vis, true);
        if(sum === size*size-bombs) win();
    }
/* game-checking */

/* information sectoin */
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
/* information sectoin */

/* sleep */
    function sleep(time) {
        return new Promise(re => {
            setTimeout(() => {re();}, time);
        });
    }
/* sleep */

/* export */
window.togglediff = togglediff;
window.reload = reload;
window.togglemode = togglemode;
/* export */

reload();
