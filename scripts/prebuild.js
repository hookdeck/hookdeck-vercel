#!/usr/bin/env node
const appRoot = require('app-root-path');
const fs = require('fs');
const path = require('path');
const process = require('process');
const crypto = require('crypto');

const modulePath = path.join(process.cwd(), 'hookdeck.config');
let hookdeckConfig;
try {
  hookdeckConfig = require(modulePath);
  console.log(`Module ${modulePath} successfully loaded`, hookdeckConfig);
} catch (error) {
  console.error(`Error loading module ${modulePath}`, error);
  process.exit(1);
}

const LIBRARY_NAME = '@hookdeck/vercel';
const WRAPPER_NAME = 'withHookdeck';
const TUTORIAL_URL = 'https://hookdeck.com/docs';

const HookdeckEnvironment = require('@hookdeck/sdk').HookdeckEnvironment;
const API_ENDPOINT = HookdeckEnvironment.Default;

const args = process.argv.slice(2);

switch (args[0]) {
  case 'deploy':
    if (!checkPrebuild()) {
      process.exit(1);
    }
    break;
  default:
    console.log(`invalid command ${args[0]}`);
}

async function checkPrebuild() {
  try {
    if (!validateMiddleware()) {
      return false;
    }
    if (!validateConfig(hookdeckConfig)) {
      return false;
    }

    const { match, api_key, signing_secret, vercel_url } = hookdeckConfig;

    const connections = [];
    for (const e of Object.entries(match)) {
      const key = e[0];
      const value = e[1];

      let env_url = process.env.VERCEL_BRANCH_URL;
      if (env_url && !env_url.startsWith('http')) {
        env_url = `https://${env_url}`;
      }

      let conf_url = vercel_url;
      if (conf_url && !conf_url.startsWith('http')) {
        conf_url = `https://${conf_url}`;
      }

      const conn = Object.assign(value, {
        api_key: api_key || process.env.HOOKDECK_API_KEY,
        signing_secret: signing_secret || process.env.HOOKDECK_SIGNING_SECRET,
        host: conf_url || env_url,
        matcher: key,
        source_name: value.name || (await vercelHash(key)),
        destination_name: slugify(key),
      });

      connections.push(conn);
    }

    if (connections.length === 0) {
      console.warn(
        'hookdeck.config.js file seems to be invalid. Please follow the steps in ${TUTORIAL_URL}.',
      );
      return false;
    }

    console.log('hookdeck.config.js is valid');

    const created_connections_pseudo_keys = {};
    for (const conn_config of connections) {
      const has_connection_id = !!conn_config.id;

      let connection;
      if (has_connection_id) {
        connection = await updateConnection(conn_config.api_key, conn_config.id, conn_config);
      } else {
        // avoid creating identical connections
        const pseudo_key = `${conn_config.api_key}*${conn_config.source_name}`;
        const cached_connection_id = created_connections_pseudo_keys[pseudo_key] || null;

        if (cached_connection_id) {
          connection = await updateConnection(
            conn_config.api_key,
            cached_connection_id,
            conn_config,
          );
        } else {
          const source = await getSourceByName(conn_config.api_key, conn_config.source_name);
          if (source) {
            const destination = await getDestinationByName(
              conn_config.api_key,
              conn_config.destination_name,
            );
            if (destination) {
              connection = await getConnectionWithSourceAndDestination(
                conn_config.api_key,
                source,
                destination,
              );
              if (connection) {
                connection = await updateConnection(
                  conn_config.api_key,
                  connection.id,
                  conn_config,
                );
              }
            }
          }
          if (!connection) {
            connection = await autoCreateConnection(conn_config.api_key, conn_config);
          }
          created_connections_pseudo_keys[pseudo_key] = connection.id;
        }
      }

      console.log('Hookdeck connection configured successfully', connection.source.url);
    }

    console.log('Hookdeck successfully configured');
    return true;
  } catch (error) {
    console.error('Error:', error);
    return false;
  }
}

function generateId(prefix = '') {
  const ID_length = 16;

  const randomAlphaNumeric = (length) => {
    let s = '';
    Array.from({ length }).some(() => {
      s += Math.random().toString(36).slice(2);
      return s.length >= length;
    });
    return s.slice(0, length);
  };

  const nanoid = randomAlphaNumeric(ID_length);
  return `${prefix}${nanoid}`;
}

function isValidPropertyValue(propValue) {
  return !(propValue === undefined || propValue === null || !isString(propValue));
}

function isString(str) {
  return typeof str === 'string' || str instanceof String;
}

function getDestinationUrl(config) {
  let dest_url = config.url || config.host || `https://${process.env.VERCEL_BRANCH_URL}`;
  dest_url = dest_url.endsWith('/') ? dest_url.slice(0, -1) : dest_url;
  dest_url = dest_url.startsWith('http') ? dest_url : `https://${dest_url}`;
  return dest_url;
}

function getConnectionRules(config) {
  const rules = [];

  if ((config.retry || null) !== null && config.retry.constructor === Object) {
    const target = config.retry;
    rules.push(Object.assign(target, { type: 'retry' }));
  }
  if ((config.delay || null) !== null && isNaN(config.delay) === false) {
    rules.push({ type: 'delay', delay: config.delay });
  }
  if (typeof (config.alert || null) === 'string' || config.alert instanceof String) {
    // 'each_attempt' or 'last_attempt'
    rules.push({ type: 'alert', strategy: config.alert });
  }
  if (Array.isArray(config.filters)) {
    for (const filter of config.filters.map((e) => Object.assign(e, { type: 'filter' }))) {
      rules.push(filter);
    }
  }

  // Transformations disabled for now
  //  if ((config.transformation || null) !== null && config.transformation.constructor === Object) {
  //    const target = config.transformation;
  //    rules.push({ type: 'transform', transformation: target });
  //  }

  return rules;
}

async function autoCreateConnection(api_key, config) {
  if (!config.path_forwarding_disabled) {
    // if they set a specific url, path forwarding is disabled by default
    config.path_forwarding_disabled = !!config.url ? true : false;
  }

  const dest_url = getDestinationUrl(config);

  const data = {
    source: Object.assign(
      {
        description: 'Autogenerated from Vercel integration',
        name: config.source_name,
      },
      config.source_config || {},
    ),
    destination: Object.assign(
      {
        description: 'Autogenerated from Vercel integration',
        url: dest_url,
        name: config.destination_name,
      },
      config.destination_config || {},
    ),
    rules: config.rules || [],
    description: 'Autogenerated from Vercel integration',
  };

  const rules = getConnectionRules(config);
  if (rules.length > 0) {
    data['rules'] = rules;
  }

  if (!!config.allowed_http_methods) {
    data.source.allowed_http_methods = config.allowed_http_methods;
  }

  if (!!config.custom_response) {
    data.source.custom_response = config.custom_response;
  }

  if (!!config.verification) {
    data.source.verification = config.verification;
  }

  if (config.path_forwarding_disabled !== null) {
    data.destination.path_forwarding_disabled = config.path_forwarding_disabled;
  }
  if (!!config.http_method) {
    data.destination.http_method = config.http_method;
  }
  if (!!config.auth_method) {
    data.destination.auth_method = config.auth_method;
  }
  if (!!config.rate) {
    data.destination.delivery_rate = config.rate;
  }

  try {
    const url = `${API_ENDPOINT}/connections`;
    const response = await fetch(url, {
      method: 'PUT',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api_key}`,
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (response.status !== 200) {
      manageResponseError('Error getting connections', response, JSON.stringify(data));
    }
    const json = await response.json();
    console.log('Connection created', json);
    return json;
  } catch (e) {
    manageError(e);
  }
}

function manageError(error) {
  console.error(error);
  process.exit(1);
}

function manageResponseError(msg, response, body) {
  switch (response.status) {
    case 401:
      console.error(`${msg}: Invalid or expired api_key`, response.status, response.statusText);
      break;

    default:
      console.error(msg, response.status, response.statusText, body);
      break;
  }
  process.exit(1);
}

function readMiddlewareFile(basePath) {
  const extensions = ['js', 'mjs', 'ts']; // Supported by now
  for (const ext of extensions) {
    const filePath = `${basePath}.${ext}`;
    try {
      const middlewareSourceCode = fs.readFileSync(filePath, 'utf-8');
      if (middlewareSourceCode) {
        const purgedCode = middlewareSourceCode.replace(/(\/\*[^*]*\*\/)|(\/\/[^*]*)/g, ''); // removes al comments. May mess with http:// bars but doesn't matter here.
        if (purgedCode.length > 0) {
          return purgedCode;
        } else {
          console.warn(`File ${filePath} is empty`);
        }
      }
    } catch (error) {
      // File does not exist, continue checking the next extension
    }
  }
  return null;
}

function validateMiddleware() {
  // 1) Check if middleware exists. If not, just shows a warning
  const middlewareSourceCode =
    readMiddlewareFile(`${appRoot}/middleware`) || readMiddlewareFile(`${appRoot}/src/middleware`);
  if (!middlewareSourceCode) {
    console.warn(
      `Middleware file not found. Consider removing ${LIBRARY_NAME} from your dev dependencies if you are not using it.`,
    );
  }

  // 2) Check if library is used in middleware.
  const hasLibraryName = middlewareSourceCode.includes(LIBRARY_NAME);
  const hasWrapper = middlewareSourceCode.includes(WRAPPER_NAME);

  if (!hasLibraryName || !hasWrapper) {
    // If it's not being used, just shows a warning
    console.warn(
      `Usage of ${LIBRARY_NAME} not found in the middleware file. Consider removing ${LIBRARY_NAME} from your dev dependencies if you are not using it.`,
    );
  } else {
    console.log(`Usage of ${LIBRARY_NAME} detected`);
  }
}

function validateConfig(config) {
  if (!config) {
    console.error(
      `Usage of ${LIBRARY_NAME} detected but hookdeck.config.js could not be imported. Please follow the steps in ${TUTORIAL_URL} to export the hookdeckConfig object`,
    );
    return false;
  }

  const api_key = config.api_key || process.env.HOOKDECK_API_KEY;
  if (!api_key) {
    console.error(
      `Hookdeck's API key not found. You must set it as a env variable named HOOKDECK_API_KEY or include it in your hookdeck.config.js. Check ${TUTORIAL_URL} for more info.`,
    );
    return false;
  }
  if (!isString(api_key) || api_key.trim().length === 0) {
    console.error(`Invalid Hookdeck API KEY format. Check ${TUTORIAL_URL} for more info.`);
    return false;
  }

  if (!(config.signing_secret || process.env.HOOKDECK_SIGNING_SECRET)) {
    console.warn(
      "Signing secret key is not present neither in `hookdeckConfig.signing_secret` nor `process.env.HOOKDECK_SIGNING_SECRET`. You won't be able to validate webhooks' signatures. " +
        `Please follow the steps in ${TUTORIAL_URL}.`,
    );
  }

  if (
    (config.vercel_url || '').trim() === '' &&
    (process.env.VERCEL_BRANCH_URL || '').trim() === ''
  ) {
    console.error(
      '`VERCEL_BRANCH_URL` env var and `vercel_url` config key are empty. ' +
        'It seems that this project is not connected to a Git repository. ' +
        "In such case, can must define the env var `VERCEL_BRANCH_URL` or `vercel_url` key in `hookdeck.config` file pointing to your Vercel's public url." +
        'Check this documentation for more information about Vercel url: https://vercel.com/docs/deployments/generated-urls',
    );
    return false;
  }

  return true;
}

async function updateConnection(api_key, id, config) {
  const data = {};
  const rules = getConnectionRules(config);
  if (rules.length > 0) {
    data['rules'] = rules;
  }

  try {
    const url = `${API_ENDPOINT}/connections/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api_key}`,
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (response.status !== 200) {
      manageResponseError(`Error updating connection with ID ${id}`, JSON.stringify(data));
    }
    const json = await response.json();
    console.log('Connection updated', json);

    // Updates configurations if neeeded
    if (
      (config.allowed_http_methods || null) !== null ||
      (config.custom_response || null) !== null ||
      (config.verification || null) !== null
    ) {
      await updateSource(api_key, json.source.id, config);
    }

    if (
      config.path_forwarding_disabled !== null ||
      (config.http_method || null) !== null ||
      (config.auth_method || null) !== null ||
      (config.rate || null) !== null
    ) {
      await updateDestination(api_key, json.destination.id, config);
    }

    return json;
  } catch (e) {
    manageError(e);
  }
}

async function updateSource(api_key, id, config) {
  const data = {};

  data.allowed_http_methods = config.allowed_http_methods || [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ];

  if ((config.custom_response || null) !== null) {
    data.custom_response = config.custom_response;
  }
  if ((config.verification || null) !== null) {
    data.verification = config.verification;
  }

  const url = `${API_ENDPOINT}/sources/${id}`;
  const response = await fetch(url, {
    method: 'PUT',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${api_key}`,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (response.status !== 200) {
    manageResponseError(
      `Error while updating source with ID ${id}`,
      response,
      JSON.stringify(data),
    );
  }
  const json = await response.json();
  console.log('Source updated', json);
}

async function updateDestination(api_key, id, config) {
  const data = {};
  if (config.path_forwarding_disabled !== null) {
    data.path_forwarding_disabled = config.path_forwarding_disabled;
  }
  if ((config.http_method || null) !== null) {
    data.http_method = config.http_method;
  }
  if ((config.auth_method || null) !== null) {
    data.auth_method = config.auth_method;
  }
  if ((config.rate || null) !== null) {
    data.rate_limit = config.rate.limit;
    data.rate_limit_period = config.rate.period;
  }

  const url = `${API_ENDPOINT}/destinations/${id}`;
  const response = await fetch(url, {
    method: 'PUT',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${api_key}`,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (response.status !== 200) {
    manageResponseError(
      `Error while updating destination with ID ${id}`,
      response,
      JSON.stringify(data),
    );
  }
  const json = await response.json();
  console.log('Destination updated', json);
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\//g, '-') // Replace / with -
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

async function getConnectionWithSourceAndDestination(api_key, source, destination) {
  try {
    const url = `${API_ENDPOINT}/connections?source_id=${source.id}&destination_id=${destination.id}`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api_key}`,
      },
      credentials: 'include',
    });
    if (response.status !== 200) {
      manageResponseError(
        `Error getting connection for source ${source.id} and destination ${destination.id}`,
        response,
      );
    }
    const json = await response.json();
    if (json.models.length === 0) {
      return null;
    }

    console.info(
      `Connection for source ${source.id} and destination ${destination.id} found`,
      json.models[0],
    );
    return json.models[0];
  } catch (e) {
    manageError(e);
  }
}

async function getSourceByName(api_key, source_name) {
  try {
    const url = `${API_ENDPOINT}/sources?name=${source_name}`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api_key}`,
      },
      credentials: 'include',
    });
    if (response.status !== 200) {
      manageResponseError(`Error getting source '${source_name}'`, response);
    }
    const json = await response.json();
    if (json.models.length === 0) {
      return null;
    }

    console.info(`Source '${source_name}' found`, json.models[0]);
    return json.models[0];
  } catch (e) {
    manageError(e);
  }
}

async function getDestinationByName(api_key, name) {
  try {
    const url = `${API_ENDPOINT}/destinations?name=${name}`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Authorization: `Bearer ${api_key}`,
      },
      credentials: 'include',
    });
    if (response.status !== 200) {
      manageResponseError(`Error getting destination by name ${name}`, response);
    }
    const json = await response.json();
    if (json.models.length === 0) {
      return null;
    }

    console.info(`Destination '${name}' found`, json.models[0]);
    return json.models[0];
  } catch (e) {
    manageError(e);
  }
}

async function vercelHash(key) {
  const hash = await sha1(key);
  return `vercel-${hash.slice(0, 9)}`;
}

async function sha1(str) {
  // credits to: https://gist.github.com/GaspardP/fffdd54f563f67be8944
  // Get the string as arraybuffer.
  const buffer = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-1', buffer);
  return hex(hash);
}

function hex(buffer) {
  let digest = '';
  const view = new DataView(buffer);
  for (let i = 0; i < view.byteLength; i += 4) {
    // We use getUint32 to reduce the number of iterations (notice the `i += 4`)
    const value = view.getUint32(i);
    // toString(16) will transform the integer into the corresponding hex string
    // but will remove any initial "0"
    const stringValue = value.toString(16);
    // One Uint32 element is 4 bytes or 8 hex chars (it would also work with 4
    // chars for Uint16 and 2 chars for Uint8)
    const padding = '00000000';
    const paddedValue = (padding + stringValue).slice(-padding.length);
    digest += paddedValue;
  }

  return digest;
}
