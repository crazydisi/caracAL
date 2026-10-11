//walks back and forth between the bank and the mainland spawn
//demonstrates smart_move() transparently handling map transitions

const destinations = ["bank", "main"];
let next = 0;

setInterval(function () {
  if (character.rip) {
    respawn();
  }
}, 2e3);

async function loop() {
  while (true) {
    const destination = destinations[next];
    try {
      log(`moving to ${destination}`);
      await smart_move(destination);
      log(`arrived at ${destination} (${character.map})`);
      next = (next + 1) % destinations.length;
    } catch (error: any) {
      log(`smart_move to ${destination} failed: ${error?.reason ?? error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5e3));
  }
}

loop();
