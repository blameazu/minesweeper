// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

// Firebase configuration
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

// Initialize Firebase and Database
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Write data to the database
function writeScore(playerName, diff, time) {
    const dbRef = ref(database, "scoreboard/" + playerName);
    set(dbRef, {
        name: playerName,
        diff: diff,
        time: time
    }).then(() => {
        console.log("Data written successfully!");
        loadScoreboard();
    }).catch((error) => {
        console.error("Error writing data:", error);
    });
}

// Read data from the database and update scoreboard
function loadScoreboard() {
    const dbRef = ref(database, "scoreboard/");
    onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        console.log("Scoreboard:", data);

        // Update the scoreboard display
        const scoreboardDiv = document.getElementById("scoreboard");
        scoreboardDiv.innerHTML = "";

        for (const key in data) {
            const player = data[key];
            const playerDiv = document.createElement("div");
            playerDiv.textContent = `${player.diff} - ${player.name}: ${player.time}s`;
            scoreboardDiv.appendChild(playerDiv);
        }
    });
}

loadScoreboard();

export {writeScore};