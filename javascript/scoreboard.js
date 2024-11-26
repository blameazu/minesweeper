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

async function write(name, diff, time) {
    if(isNaN(time) || time < 0 || !['Easy', 'Medium', 'Hard', 'Hell'].includes(diff)) return;
    const db = ref(database, "scoreboard/"+diff+"/"+name);
    const tmp = await get(db);
    const data = tmp.exists() ? tmp.val() : null;
    const now = new Date();
    const timestamp = now.toISOString();
    if (!data || data.time > time || (data.time === time && data.timestamp > timestamp)) {
        await set(db, { 
            name: name,
            diff: diff,
            time: time,
            timestamp: timestamp
        });
        load(diff);
    }
}

function load(diff) {
    const db = ref(database, "scoreboard/"+diff+"/");
    onValue(db, (tmp) => {
        const data = tmp.val();
        const board = document.getElementById("scoreboard");
        board.innerHTML = "";
        if (!data) {
            board.innerHTML = "<h3>No scores available yet!</h3>";
            return;
        }
        const gd = Object.values(data)
            .filter(player => !isNaN(player.time) && player.time >= 0);
        const sortdata = gd.sort((a, b) => {
            const timestampA = a.timestamp || new Date(0).toISOString();
            const timestampB = b.timestamp || new Date(0).toISOString();
            if (a.time === b.time) {
                return timestampA.localeCompare(timestampB);
            }
            return a.time - b.time;
        });
        board.innerHTML += `<h3>Difficulty: ${diff}</h3>`;
        sortdata.slice(0, 20).forEach((player, index) => {
            const score = document.createElement("div");
            score.style.backgroundColor = ["gold", "#a1a1a1", "orange", "#ebebeb"][index] || "#ebebeb";
            score.style.display = "flex";
            score.style.alignItems = "center";
            const tmp = document.createElement('span');
            tmp.textContent = `No.${index + 1} ${player.name}: ${player.time}s`;
            if(index < 3) tmp.style.fontWeight = "bold";
            score.appendChild(tmp);
            if(!index) {
                const crown = document.createElement('span');
                crown.textContent = "👑";
                crown.style.marginLeft = "10px";
                crown.style.animation = "glow 1.5s infinite alternate, float 2s infinite";
                score.appendChild(crown);
            }
            board.appendChild(score);
        });
        if(sortdata.length > 20) board.innerHTML += `There are ${sortdata.length-20} people out of board!`;
    });
}

export { write, load };
