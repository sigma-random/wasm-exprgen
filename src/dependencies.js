import {binDirectory, outputDir, thirdParties, isWindows} from "./init";
import path from "path";
import fs from "fs-extra";
import execa from "execa";
import which from "which";

async function fromPath(bin, opt = {}) {
  try {
    const rPath = await which.async(bin, opt);
    return rPath;
  } catch (e) {
    if (e.message.indexOf("not found") === -1) {
      throw e;
    }
  }
  return null;
}

let msbuildCache;
async function searchForMsBuild() {
  if (!isWindows) {
    return null;
  }
  if (msbuildCache) {
    return msbuildCache;
  }
  const cache = p => {
    msbuildCache = p;
    console.log(`MsBuild path: ${p}`);
    return msbuildCache;
  };

  const getPaths = () => {
    const dev15Paths = ["15.0"].map(version => {
      const binFolders = ["bin", "bin/x86", "bin/amd64"];
      const vsVersions = ["2017", "Preview"];
      const roots = [
        path.resolve(process.env.ProgramFiles, "Microsoft Visual Studio"),
        path.resolve(process.env["ProgramFiles(x86)"], "Microsoft Visual Studio"),
      ];
      const allPaths = [];
      for (const root of roots) {
        for (const vsVersion of vsVersions) {
          const folder = path.join(root, vsVersion);
          try {
            const content = fs.readdirSync(folder);
            for (const dir of content) {
              for (const binFolder of binFolders) {
                allPaths.push(path.join(folder, dir, "msbuild", version, binFolder));
              }
            }
          } catch (e) {
            // ignore
          }
        }
      }
      return allPaths.join(";");
    }).join(";");

    const oldDevPaths = ["14.0", "12.0", "10.0"].map(version => [
      path.resolve(process.env.ProgramFiles, "msbuild", version, "bin/x86"),
      path.resolve(process.env["ProgramFiles(x86)"], "msbuild", version, "bin"),
      path.resolve(process.env["ProgramFiles(x86)"], "msbuild", version, "bin/amd64"),
    ].join(";")).join(";");
    return dev15Paths + oldDevPaths;
  };
  const rPath = (await fromPath("msbuild.exe")) || (await fromPath("msbuild.exe", {path: getPaths()}));
  if (rPath) {
    return cache(rPath);
  }
  throw new Error("MsBuild is missing");
}

export async function csmithDependencies() {
  const dependencies = {
    msbuild: await searchForMsBuild(),
    cmake: await which.async("cmake"),
  };
  if (isWindows) {
    dependencies.m4 = path.join(thirdParties.m4, "m4.exe");
  } else {
    dependencies.m4 = await which.async("m4");
  }
  return dependencies;
}

export async function llvmDependencies() {
  const dependencies = {
    cmake: await which.async("cmake"),
    msbuild: await searchForMsBuild(),
    make: isWindows ? null : await which.async("make"),
  };
  return dependencies;
}

async function validatePythonVersion(python) {
  if (python) {
    try {
      const info = await execa(python, ["--version"], {
        timeout: 30000
      });
      try {
        const version = parseFloat(/python (\d+\.\d+)/ig.exec(info.stdout + info.stderr)[1]);
        if (version >= 2.7 && version < 3) {
          return python;
        }
      } catch (e) {
        // ignore
      }
    } catch (e) {
      console.error(e);
    }
  }
  return null;
}
let pythonCache;
async function searchPython() {
  if (pythonCache) {
    return pythonCache;
  }

  const locations = [
    undefined, // Use current path
    process.env.PYTHON,
  ];
  if (isWindows) {
    locations.push("C:\\Python27");
  }
  for (const loc of locations) {
    for (const bin of ["python", "python2"]) {
      const python = await validatePythonVersion(await fromPath(bin, {path: loc}));
      if (python) {
        pythonCache = python;
        console.log(`Python path: ${python}`);
        return python;
      }
    }
  }
  throw new Error("Python 2 is missing");
}
let emCache;
export async function emscriptenDependencies() {
  emCache = emCache || await emscriptenDependenciesInternal();
  return emCache;
}
async function emscriptenDependenciesInternal() {
  const python = await searchPython();
  const emscriptenRoot = thirdParties.emscripten;
  const emcc = path.join(emscriptenRoot, "emcc.py");
  const empp = path.join(emscriptenRoot, "em++.py");
  const runFn = bin => (args = [], opt = {}) => {
    const proc = execa(python, [bin, ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        // Change home to tell emscripten to use our .emscripten file
        HOME: outputDir,
        USERPROFILE: outputDir,
      },
      ...opt
    });
    return proc;
  };
  return {
    python,
    emcc,
    empp,
    runEmcc: runFn(emcc),
    runEmpp: runFn(empp)
  };
}
let specCache;
export async function specInterpreterDependencies() {
  specCache = specCache || await specInterpreterDependenciesInternal();
  return specCache;
}
async function specInterpreterDependenciesInternal() {
  // todo:: check for ocaml
  if (isWindows) {
    return {
      cmd: "cmd",
    };
  }
  return {
    make: await which.async("make")
  };
}

let genDepCache;
export async function generateDependencies() {
  genDepCache = genDepCache || await generateDependenciesInternal();
  return genDepCache;
}

async function generateDependenciesInternal() {
  const wasmExe = await fromPath("wasm") || await which.async("wasm", {path: binDirectory.spec});
  const csmithExe = await fromPath("csmith") || await which.async("csmith", {path: binDirectory.csmith});
  const clangExe = await fromPath("clang") || await which.async("clang", {path: binDirectory.llvm});

  return {
    wasm: wasmExe,
    csmith: csmithExe,
    clang: clangExe,
    ...(await emscriptenDependencies())
  };
}
