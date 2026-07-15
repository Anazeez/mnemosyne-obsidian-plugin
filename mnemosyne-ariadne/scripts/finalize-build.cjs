"use strict";

const { copyFileSync, existsSync } = require("node:fs");

if (!existsSync("main.css")) {
  throw new Error("Expected generated main.css was not produced");
}

copyFileSync("main.css", "styles.css");
