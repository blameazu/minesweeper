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
    if(!data || data.time > time) {
        await set(db, {
            name: name,
            diff: diff,
            time: time
        });
        load();
    }
}

function load() {
    const db = ref(database, "scoreboard/");
    onValue(db, (snapshot) => {
        const data = snapshot.val();
        const board = document.getElementById("scoreboard");
        board.innerHTML = "";

        const sortedData = Object.values(data)
            .sort((a, b) => a.time - b.time);

        sortedData.forEach(player => {
            const score = document.createElement("div");
            score.textContent = `${player.diff} - ${player.name}: ${player.time}s`;
            board.appendChild(score);
        });
    });
}

export {write, load};

load();