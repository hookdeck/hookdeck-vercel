#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// npm install is run at the root of the project
// where the module is being installed.
// See: https://github.com/npm/npm/issues/16990
const appRoot = process.env.INIT_CWD;

const libraryName = '@hookdeck/vercel';
const PREBUILD_FILENAME = 'prebuild.js';
const HOOKDECK_CONFIG_FILENAME = 'hookdeck.config.js';
const MIDDLEWARE_FILENAME = 'middleware.ts';
const prebuildScript = `node ./node_modules/${libraryName}/dist/scripts/${PREBUILD_FILENAME}`;
const green = 'color:green;';

const log = (...args) => {
  args.unshift(`[${libraryName}]`);
  console.log.apply(console, args);
};

log(`Post Install Script Running...`);

const packagePath = path.resolve(`${appRoot}/package.json`);
if (fs.existsSync(packagePath)) {
  const packageJSON = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  // adds or update if needed prebuild script
  if (!packageJSON.scripts.prebuild) {
    packageJSON.scripts.prebuild = prebuildScript;
    fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
    log(`Prebuild script added to ${packagePath}`, green);
  } else {
    if (packageJSON.scripts.prebuild.includes(prebuildScript) === true) {
      log(`Prebuild script already exists in ${packagePath}`, green);
    } else {
      const addedCommand = `${packageJSON.scripts.prebuild} && ${prebuildScript}`;
      packageJSON.scripts.prebuild = addedCommand;
      fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
      log(`Prebuild script updated in ${packagePath}`, green);
    }
  }
  // adds build script if needed
  if (!packageJSON.scripts.build) {
    packageJSON.scripts.build = '';
    fs.writeFileSync(packagePath, JSON.stringify(packageJSON, null, 2));
    log(`Build script added to ${packagePath}`, green);
  }
} else {
  log('Could not find package.json in the current directory.');
  process.exit(1);
}

const hookdeckConfigPath = path.resolve(`${appRoot}/${HOOKDECK_CONFIG_FILENAME}`);

if (!fs.existsSync(hookdeckConfigPath)) {
  const sourcePath = path.join(__dirname, HOOKDECK_CONFIG_FILENAME);
  fs.copyFileSync(sourcePath, hookdeckConfigPath);
  log(`Default ${HOOKDECK_CONFIG_FILENAME} added in your project root`);
} else {
  log(`${HOOKDECK_CONFIG_FILENAME} already exists in your project`);
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
  log(
    `Middleware file is not detected. Adding an empty ${MIDDLEWARE_FILENAME} file at ${target} directory for convenience`,
  );
  const sourcePath = path.join(__dirname, MIDDLEWARE_FILENAME);

  if (target === 'src') {
    const targetPath = path.join(appRoot, '/src', MIDDLEWARE_FILENAME);
    const includeFileName = HOOKDECK_CONFIG_FILENAME.replace('.js', '');
    let middlewareSource = fs.readFileSync(sourcePath, 'utf8');
    middlewareSource = middlewareSource.replace(`./${includeFileName}`, `../${includeFileName}`);
    fs.writeFileSync(targetPath, middlewareSource);
  } else {
    const targetPath = path.join(appRoot, MIDDLEWARE_FILENAME);
    fs.copyFileSync(sourcePath, targetPath);
  }
  log('Middleware file created');
}
