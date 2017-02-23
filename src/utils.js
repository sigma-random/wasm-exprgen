
export function waitUntilDone(proc, {getOutput} = {}) {
  return new Promise((resolve, reject) => {
    if (getOutput) {
      proc.stdout.on("data", data => {getOutput.stdout += data.toString();});
      proc.stderr.on("data", data => {getOutput.stderr += data.toString();});
    }
    proc.on("exit", code => {
      if (code !== 0) {
        return reject(new Error(`Command terminated with exit code ${code}\n${proc.spawnargs.join(" ")}`));
      }
      resolve();
    });
    proc.on("error", err => reject(err));
  });
}
