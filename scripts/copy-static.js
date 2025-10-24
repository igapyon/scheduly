#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const fsPromises = fs.promises;

const sourceDir = path.resolve(__dirname, "..", "public");
const targetDir = path.resolve(__dirname, "..", "dist");

async function copyDirectory(source, destination) {
  await fsPromises.mkdir(destination, { recursive: true });
  const entries = await fsPromises.readdir(source, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);
      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
    })
  );
}

async function main() {
  try {
    await copyDirectory(sourceDir, targetDir);
    process.stdout.write(`Copied static assets from ${sourceDir} to ${targetDir}\n`);
  } catch (error) {
    console.error("Failed to copy static assets", error);
    process.exitCode = 1;
  }
}

main();
