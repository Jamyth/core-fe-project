/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const childProcess = require("child_process");
const fs = require("fs-extra");
const yargs = require("yargs");

function spawn(command, args, errorMessage) {
    const isWindows = process.platform === "win32"; // spawn with {shell: true} can solve .cmd resolving, but prettier doesn't run correctly on mac/linux
    const result = childProcess.spawnSync(isWindows ? command + ".cmd" : command, args, {stdio: "inherit"});
    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }
    if (result.status !== 0) {
        console.error(errorMessage);
        console.error(`non-zero exit code returned, code=${result.status}, command=${command} ${args.join(" ")}`);
        process.exit(1);
    }
}

function checkCodeStyle() {
    console.info("[task] check code style");
    return spawn("prettier", ["--config", "config/prettier.json", "--list-different", "{src,test}/**/*.{ts,tsx}"], "check code style failed, please format above files");
}

function test() {
    console.info("[task] test");
    return spawn("jest", ["--config", "config/jest.json"], "test failed, please fix");
}

function lint() {
    console.info("[task] eslint");
    return spawn("eslint", ["{src,test}/**/*.{ts,tsx}"], "lint failed, please fix");
}

function cleanup() {
    console.info("[task] cleanup");
    fs.emptyDirSync("build");
}

function compile() {
    console.info("[task] tsc compile");
    return spawn("tsc", ["-p", "config/tsconfig.json"], "compile failed, please fix");
}

function distribute() {
    console.info("[task] distribute");
    fs.mkdirsSync("build/dist/lib");
    fs.copySync("build/out/src", "build/dist/lib/", {dereference: true});
    fs.copySync("package.json", "build/dist/package.json", {dereference: true});
    fs.copySync("README.md", "build/dist/README.md", {dereference: true});
    fs.copySync("src", "build/dist/src", {dereference: true});
    fs.removeSync("build/out");
}

function build() {
    const isFastMode = yargs.argv.mode === "fast";

    if (!isFastMode) {
        checkCodeStyle();
        test();
        lint();
    }

    cleanup();
    compile();
    distribute();
}

build();
