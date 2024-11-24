/* clock system */
const time = document.getElementById('time');
let timer = 0, clock = null;
function start_timer() {
    timer = 0;
    if(clock) {
        console.log("timer already on!");
        return;
    }
    clock = setInterval(function() {
        timer++;
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        time.innerText = `times : ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}s`;
    }, 1000);
}
function stop_timer() {
    if(clock) clearInterval(clock);
    clock = null;
}
function get_timer() {
    return timer;
}
/* clock system */

export {start_timer, stop_timer, get_timer};