"use strict";

const clear = require('rollup-plugin-clear');
const commonjs = require('@rollup/plugin-commonjs');
const resolve = require('@rollup/plugin-node-resolve');
const screeps = require('rollup-plugin-screeps');
const typescript = require('rollup-plugin-typescript2');

let cfg;
const dest = process.env.DEST;
if (!dest) {
  console.log("No destination specified - code will be compiled but not uploaded");
} else if ((cfg = require("./screeps.json")[dest]) == null) {
  throw new Error("Invalid upload destination");
}

module.exports = {
  input: "src/main.ts",
  output: {
    file: "dist/main.js",
    format: "cjs",
    sourcemap: true
  },

  plugins: [
    clear({ targets: ["dist"] }),
    resolve({ rootDir: "src" }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json", include: ["src/**/*.ts"], exclude: ["node_modules/**", "test/**"] }),
    screeps({config: cfg, dryRun: cfg == null})
  ]
}
