/*
    valuable
*/

const back_end_url = 'http://127.0.0.1:8000/';

/*
    front-end with back-end 's interactitions
*/

async function load() {
    const re = await fetch(back_end_url);
    const data = await re.json();
    document.getElementById('title').innerText = data.name;
    console.log(`${data.name} Loaded Successfully!`);
}

async function save_record(username, score, diff) {
    const record = {
        username:username,
        score:score,
        diff:diff
    };
    try {
        const re = await fetch(back_end_url+'save_record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(record)
        });
        if(re.ok) {
            const data = await re.json();
            console.log("Record saved successfully:", data);
        } else {
            const error = await re.json();
            console.log("Error saving json:", error);
        }
    } catch(error) {
        console.error("Error:", error);
    }
}

async function scoreboard_load(diff) {
    try {
        const response = await fetch(back_end_url+'scoreboard/'+diff);
        const data = await response.json();

        const board = document.getElementById("scoreboard");
        board.innerHTML = "";

        if (!data || data.length === 0) {
            board.innerHTML = "<h3>No scores available yet!</h3>";
            return;
        }

        board.innerHTML += `<h3>Difficulty: ${diff}</h3>`;

        data.slice(0, 20).forEach((player, index) => {
            const score = document.createElement("div");
            score.style.backgroundColor = ["gold", "#a1a1a1", "orange", "#ebebeb"][index] || "#ebebeb";
            score.style.display = "flex";
            score.style.alignItems = "center";

            const tmp = document.createElement('span');
            tmp.textContent = `No.${index + 1} ${player.username}: ${player.score}s`;
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

        if(data.length > 20) {
            board.innerHTML += `There are ${data.length-20} people out of board!`;
        }
    } catch (error) {
        console.error("Error fetching data:", error);
        const board = document.getElementById("scoreboard");
        board.innerHTML = "<h3>Failed to load scores, please try again later.</h3>";
    }
}

/*
    main
*/

function main() {
    load();
}

main();

export{save_record, scoreboard_load};