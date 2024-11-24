/* dont touch */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCrVd2Snli2ss6X3yqR3Iua2Ayl4T25258",
    authDomain: "blame-minesweeper.firebaseapp.com",
    databaseURL: "https://blame-minesweeper-default-rtdb.firebaseio.com",
    projectId: "blame-minesweeper",
    storageBucket: "blame-minesweeper.firebasestorage.app",
    messagingSenderId: "121432736831",
    appId: "1:121432736831:web:d9e3aba68c8cfefcd6648a",
    measurementId: "G-ZVX0L1RR4F"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
/* dont touch*/

async function write(name = 'annoymous', diff, time) {
    const db = ref(database, "scoreboard/" + name + diff);
    const tmp = await get(db);
    const data = tmp.exists() ? tmp.val() : null;
    if (!data || data.time > time) {
        await set(db, {
            name: name,
            diff: diff,
            time: time
        });
        load(diff);
    }
}

function load(diff) {
    const db = ref(database, "scoreboard/");
    onValue(db, (tmp) => {
        const data = tmp.val();
        const board = document.getElementById("scoreboard");
        board.innerHTML = "";

        const gd = Object.values(data).reduce((acc, player) => {
            if (!acc[player.diff]) {
                acc[player.diff] = [];
            }
            acc[player.diff].push(player);
            return acc;
        }, {});

        const difficultyTitle = document.createElement("h3");
        difficultyTitle.textContent = `Difficulty: ${diff}`;
        board.appendChild(difficultyTitle);

        const sortedScores = gd[diff].sort((a, b) => a.time - b.time);

        let rank = 0;
        sortedScores.forEach(player => {
            const score = document.createElement("div");
            score.textContent = `${++rank} ${player.name}: ${player.time}s`;
            if(rank === 1) score.style.backgroundColor = "gold";
            else if(rank === 2) score.style.backgroundColor = "#a1a1a1";
            else if(rank === 3) score.style.backgroundColor = "orange";
            else score.style.backgroundColor = "#ebebeb";
            board.appendChild(score);
        });
    });
}

export { write, load };
