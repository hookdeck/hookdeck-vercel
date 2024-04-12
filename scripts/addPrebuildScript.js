#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');

const libraryName = 'vercel-integration-demo';
const prebuildScript = `node .hookdeck/prebuild.js`;
const green = 'color:green;';

console.log(`[${libraryName}] Post Install Script Running...`);

const packagePath = path.resolve(`${appRoot}/package.json`);
if (fs.existsSync(packagePath)) {
  const packageJSON = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (!packageJSON.scripts.prebuild) {
    packageJSON.scripts.prebuild = prebuildScript;
    fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
    console.log(`%c[${libraryName}] Prebuild script added to ${packagePath}`, green);
  } else {
    if (packageJSON.scripts.prebuild.includes(prebuildScript) === true) {
      console.log(`%c[${libraryName}] Prebuild script already exists in ${packagePath}`, green);
    } else {
      const addedCommand = `${packageJSON.scripts.prebuild} && ${prebuildScript}`;
      packageJSON.scripts.prebuild = addedCommand;
      fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
      console.log(`%c[${libraryName}] Prebuild script updated in ${packagePath}`, green);
    }
  }
  const sourcePath = path.join(__dirname, 'prebuild.js');
  const destDir = `${appRoot}/.hookdeck`;
  const destinationPath = path.join(`${appRoot}/.hookdeck`, 'prebuild.js');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(sourcePath, destinationPath);
  console.log('prebuild script successfully copied');
} else {
  console.log('Could not find package.json in the current directory.');
  process.exit(1);
}

const hookdeckConfigPath = path.resolve(`${appRoot}/hookdeck.config.js`);

if (!fs.existsSync(hookdeckConfigPath)) {
  const sourcePath = path.join(__dirname, 'hookdeck.config.js');
  fs.copyFileSync(sourcePath, hookdeckConfigPath);
  console.log('Default hookdeck.config.js added in your project root');
} else {
  console.log('hookdeck.config.js already exists in your project');
}
