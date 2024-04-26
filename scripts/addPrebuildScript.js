#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');

const libraryName = '@hookdeck/vercel';
const prebuildScript = `node .hookdeck/prebuild.js`;
const green = 'color:green;';

console.log(`[${libraryName}] Post Install Script Running...`);

const packagePath = path.resolve(`${appRoot}/package.json`);
if (fs.existsSync(packagePath)) {
  const packageJSON = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  // adds or update if needed prebuild script
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
  // adds build script if needed
  if (!packageJSON.scripts.build) {
    packageJSON.scripts.build = '';
    fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
    console.log(`%c[${libraryName}] Build script added to ${packagePath}`, green);
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

function existsMiddlewareFileAt(basePath) {
  const extensions = ['js', 'mjs', 'ts']; // Add more if needed
  for (const ext of extensions) {
    const filePath = `${basePath}.${ext}`;
    try {
      const middlewareSourceCode = fs.readFileSync(filePath, 'utf-8');
      if (middlewareSourceCode) {
        return true;
      }
    } catch (error) {
      // File does not exist, continue checking the next extension
    }
  }
  return false;
}

const existsMiddlewareFile =
  existsMiddlewareFileAt(`${appRoot}/middleware`) ||
  existsMiddlewareFileAt(`${appRoot}/src/middleware`);

if (!existsMiddlewareFile) {
  const target = fs.existsSync(`${appRoot}/src`) ? 'src' : 'root';
  console.log(
    `Middleware file is not detected. Adding an empty middleware.ts file at ${target} directory for convenience`,
  );
  const sourcePath = path.join(`${__dirname}${target === 'src' ? '/src' : ''}`, 'middleware.ts');
  fs.copyFileSync(sourcePath, path.resolve(`${appRoot}/middleware.ts`));
  console.log('Middleware file created');
}
