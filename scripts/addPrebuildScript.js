#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');

const libraryName = 'vercel-integration-demo';
const prebuildScript = `node .hookdeck/prebuild.js && rm -rf .hookdeck/prebuild.js`;
const green = "color:green;"
const packagePath = path.resolve(`${appRoot}/package.json`);
const hookdeckConfigPath = path.resolve(`${appRoot}/hookdeck.config.js`);


console.log(`[${libraryName}] Post Install Script Running...`);
if (fs.existsSync(packagePath)) {
    const packageJSON = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (!packageJSON.scripts.prebuild) {
        packageJSON.scripts.prebuild = prebuildScript;
        fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
        console.log(`%c[${libraryName}] Prebuild script added to ${packagePath}`, green);
      } else {
         if(packageJSON.scripts.prebuild.includes(prebuildScript) === true) {
          console.log(`%c[${libraryName}] Prebuild script already exists in ${packagePath}`, green);
         } else {
          const addedCommand = `${packageJSON.scripts.prebuild} && ${prebuildScript}`
          packageJSON.scripts.prebuild = addedCommand;
          fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
          console.log(`%c[${libraryName}] Prebuild script updated in ${packagePath}`, green);
         }
      }
      const sourcePath = path.join(__dirname, 'prebuild.js');
      const destDir = `${appRoot}/.hookdeck`;
      const destinationPath = path.join(`${appRoot}/.hookdeck`, 'prebuild.js');
      if (!fs.existsSync(destDir)){
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(sourcePath, destinationPath);
      console.log('prebuild script successfully copied');
  } else {
    console.log('Could not find package.json in the current directory.');
    process.exit(1); // Exit with a failure status code
}

if (fs.existsSync(hookdeckConfigPath) === false) {
    const sourcePath = path.join(__dirname, "hookdeck.config.js");
    const destinationPath = path.join(`${appRoot}`, "hookdeck.config.js");
    fs.copyFileSync(sourcePath, destinationPath);
    console.log("Default hookdeck.config.js added to the root of your project");
} else {
    console.log("hookdeck.config.js was already in your project");
}
