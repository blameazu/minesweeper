/* clock system */
const time = document.getElementById('time');
let timer = 0, clock = null;
function start_timer() {
    if(clock) {
        console.log("timer already on!");
        return;
    }
    clock = setInterval(function() {
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        time.innerText = `times : ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}s`;
        timer++;
    }, 1000);
}
function stop_timer() {
    if(clock) clearInterval(clock);
    clock = null;
    timer = 0;
}
function get_timer() {
    return timer;
}
/* clock system */

export {start_timer, stop_timer, get_timer};