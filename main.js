const { COORDINATOR_MODULE_PATH } = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const StreamMultiplexer = require("./src/StreamMultiplexer");
const fs = require("fs");

async function get_webpack_started(cfg) {
  try {
    fs.rmSync("./TYPECODE.out", { recursive: true });
  } catch (error) {
    //Sometimes throws if file doesnt exist
    //We want it to not exist, so we ignore it
  }
  if (cfg.enable_TYPECODE) {
    //TODO make this configurable
    const webpack_log_output = [
      [
        "node",
        "./node_modules/logrotate-stream/bin/logrotate-stream",
        "./logs/webpack.log",
        "--keep",
        "3",
        "--size",
        "1500000",
      ],
      null,
    ];
    //Run webpack once so we are guaranteed to have the compiled files
    let wp_seed;
    console.log("Starting Initial WebPack");
    //initially we do not use log_pipes because when the process terminates it will close our stdin/out
    wp_seed = StreamMultiplexer.spawn_sink(
      "node",
      "./node_modules/webpack/bin/webpack",
      "--no-color",
    );

    await new Promise((resolve) => {
      wp_seed.on("close", resolve);
    });
    console.log("Initial WebPack is done");
    wp_seed = StreamMultiplexer.setup_log_pipes(
      webpack_log_output,
      "./node_modules/webpack/bin/webpack",
      "--no-color",
      "--watch",
      //stdin is a pipe from us, so webpack quits once we are gone
      "--watch-options-stdin",
    );
    return wp_seed;
  }
}

//terminal ctrl+c reaches every process in our group at once.
//we stay alive until the coordinator rounded up its characters,
//so its last log lines still make it through our pipes
function setup_shutdown(children) {
  let shutting_down = false;
  function shutdown(signal) {
    if (shutting_down) return;
    shutting_down = true;
    console.log(`Received ${signal}, waiting for caracAL to stop`);
    const alive = children.filter(
      (child) => child && child.exitCode === null && child.signalCode === null,
    );
    //last resort if a child refuses to die
    setTimeout(() => {
      alive.forEach((child) => child.kill("SIGKILL"));
      process.exit(1);
    }, 10000).unref();
    alive.forEach((child) => child.kill(signal));
    Promise.all(
      alive.map((child) => new Promise((resolve) => child.on("close", resolve))),
    ).then(() => {
      //the log sinks hold an ipc channel to us and only end once their stdin
      //closes, so we leave instead of waiting for them. short grace period
      //so our pipes can flush what is buffered
      setTimeout(() => process.exit(0), 200);
    });
  }
  ["SIGINT", "SIGTERM", "SIGQUIT", "SIGHUP"].forEach((signal) =>
    process.on(signal, () => shutdown(signal)),
  );
}

(async () => {
  await ConfigUtil.interactive();

  const cfg = require("./config");
  const webpack_watcher = await get_webpack_started(cfg);

  const log_sinks = cfg.log_sinks || [
    [
      "node",
      "./node_modules/logrotate-stream/bin/logrotate-stream",
      "./logs/caracAL.log.jsonl",
      "--keep",
      "3",
      "--size",
      "4500000",
    ],
    ["node", "./standalones/LogPrinter.js"],
  ];
  const coordinator = StreamMultiplexer.setup_log_pipes(
    log_sinks,
    COORDINATOR_MODULE_PATH,
  );
  setup_shutdown([coordinator, webpack_watcher]);
})();
