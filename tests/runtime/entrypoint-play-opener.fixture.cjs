// Preloaded only by the Play.cmd test. Keep the Windows shell association closed.
require('node:child_process').execFile = (file, args, options, callback) => {
  console.log(JSON.stringify({ file, args, shell: options.shell ?? false }));
  callback(new Error('fixture browser unavailable'));
  process.stdin.once('data', () => {
    process.stdin.pause();
    process.emit('SIGINT');
  });
};
require('node:module').syncBuiltinESMExports();
