/**
 * Builds the PM2 process helpers on top of a pm2 API object (injected so it can be mocked).
 * @param {object} pm2 pm2 module (connect, start, restart, stop, delete)
 * @param {{log: Function}} logger
 */
const createPM2Processes = (pm2, logger = console) => {
  const promisify = (fn, ...args) => new Promise((resolve, reject) => {
    fn.call(pm2, ...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  const connect = () => promisify(pm2.connect);
  const start = (app, cwd = undefined) => promisify(pm2.start, { cwd, ...app });
  const restart = (name) => promisify(pm2.restart, name, { updateEnv: true });
  const stop = (name) => promisify(pm2.stop, name);
  const kill = (name) => promisify(pm2.delete, name);

  /** Reloads changed services in place. */
  const managePM2Processes = async (toRestart, toStop, toStart, cwd = undefined) => {
    for (const arg of toStop) {
      await stop(arg.name);
    }
    for (const arg of toRestart) {
      await restart(arg.name);
    }
    for (const arg of toStart) {
      await start(arg, cwd);
    }
  };

  /** Deletes and starts services again (used when no checksum exists yet). */
  const removeAndStartServices = async (toRestart, toStop, toStart, cwd = undefined) => {
    for (const arg of toStop) {
      logger.log('Will stop', arg, cwd);
      await stop(arg.name).catch(() => { });
    }
    for (const arg of toRestart) {
      logger.log('Will kill', arg, cwd);
      await kill(arg.name).catch(() => { });
      logger.log('Will start');
      await start(arg, cwd);
      logger.log('Finish', arg);
    }
    for (const arg of toStart) {
      logger.log('Will start new', arg, cwd);
      await start(arg, cwd);
      logger.log('Finish new', arg);
    }
  };

  return {
    connect,
    start,
    restart,
    stop,
    kill,
    managePM2Processes,
    removeAndStartServices,
  };
};

module.exports = { createPM2Processes };
