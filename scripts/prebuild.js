const appRoot = require('app-root-path');
const fs = require('fs');
const { customAlphabet } = require('nanoid');
const path = require('path');
const { exit } = require('process');
const hookdeckConfig = require('../hookdeck.config');
const { createHash } = require('crypto');

const LIBRARY_NAME = '@hookdeck/vercel';
const WRAPPER_NAME = 'withHookdeck';
const TUTORIAL_URL = 'https://hookdeck.com/docs';

const { HookdeckEnvironment } = require('@hookdeck/sdk');
const API_ENDPOINT = HookdeckEnvironment.Default;

async function checkPrebuild() {
  try {
    validateMiddleware();

    if (!hookdeckConfig) {
      console.warn(
        `Usage of ${LIBRARY_NAME} detected but hookdeck.config.js could not be imported. Please follow the steps in ${TUTORIAL_URL} to export the hookdeckConfig object`,
      );
      return false;
    }

    const connections = Object.entries(hookdeckConfig).map((e) => {
      const source_name = e[0];
      const conn = e[1];
      return Object.assign(conn, { source_name });
    });

    const validConfigFileResult = validateConfig(connections);
    if (!validConfigFileResult.ok) {
      console.warn(validConfigFileResult.msg);
      return false;
    }

    console.log('hookdeck.config.js validated successfully');

    const env_configs = [];
    const created_connections_pseudo_keys = {};
    for (const conn_config of connections) {
      const api_key = conn_config.api_key || process.env.HOOKDECK_API_KEY;
      if (!api_key) {
        console.warn(
          `Hookdeck's API key doesn't found. You must set it as a env variable named HOOKDECK_API_KEY or include it in your hookdeck.config.js. Check ${TUTORIAL_URL} for more info.`,
        );
        return false;
      }
      if (!isString(api_key) || api_key.trim().length === 0) {
        console.warn(`Invalid Hookdeck API KEY format. Check ${TUTORIAL_URL} for more info.`);
        return false;
      }

      const has_connection_id = !!conn_config.id;

      let connection;
      if (has_connection_id) {
        connection = await updateConnection(api_key, conn_config);
      } else {
        // avoid creting identical connections
        const pseudo_key = `${api_key}*${conn_config.source_name}*${conn_config.host}`;
        const cached_connection_id = created_connections_pseudo_keys[pseudo_key] || null;

        if (cached_connection_id !== null) {
          connection = await updateConnection(
            api_key,
            Object.assign({ connection_id: cached_connection_id }, conn_config),
          );
        } else {
          connection = await autoCreateConnection(api_key, conn_config);
          created_connections_pseudo_keys[pseudo_key] = connection.id;
        }
      }
      env_configs.push({
        connection,
        config: conn_config,
      });

      console.log('Hookdeck connection configured successfully', connection.source.url);
    }

    saveCurrentConfig({ connections: env_configs });

    console.log('Hookdeck successfully configured');
    return true;
  } catch (error) {
    console.error('Error:', error);
    return false;
  }
}

if (!checkPrebuild()) {
  exit(1);
}

function generateId(prefix = '') {
  const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
  const ID_length = 16;

  const nanoid = customAlphabet(ID_ALPHABET, ID_length);
  return `${prefix}${nanoid()}`;
}

function isValidPropertyValue(propValue) {
  return !(propValue === undefined || propValue === null || !isString(propValue));
}

function isString(str) {
  return typeof str === 'string' || str instanceof String;
}

function validateConfig(connections) {
  let valid = true;
  const msgs = [];
  const string_props = ['source_name', 'matcher'];
  let index = 0;

  for (const conn of connections) {
    for (const prop of string_props) {
      if (!isValidPropertyValue(conn[prop])) {
        msgs.push(
          `hookdeck.config[${conn.source_name}]: Undefined or invalid value for key ${prop} in configuration file at hookdeck.config.js`,
        );
        valid = false;
      }
    }
    index++;
  }

  return {
    ok: valid,
    msg: msgs.join(', '),
  };
}

function getDestinationUrl(config) {
  const dest_url = config.url || config.host || `https://${process.env.VERCEL_BRANCH_URL}`;
  return dest_url.endsWith('/') ? dest_url.substring(0, dest_url.length - 1) : dest_url;
}

function getConnectionName(config) {
  const dest_url = getDestinationUrl(config);
  const valueToHash = `${config.source_name}*${dest_url}*${config.matcher}`;
  return createHash('sha256').update(valueToHash).digest('hex');
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

  if ((config.transformation || null) !== null && config.transformation.constructor === Object) {
    const target = config.transformation;
    rules.push({ type: 'transform', transformation: target });
  }

  return rules;
}

async function autoCreateConnection(api_key, config) {
  if (!config.path_forwarding_disabled) {
    // if they set a specific url, path forwarding is disabled by default
    config.path_forwarding_disabled = !!config.url ? true : false;
  }

  const connection_name = getConnectionName(config);
  const dest_url = getDestinationUrl(config);

  const data = {
    name: connection_name,
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
        name: generateId('dst-'),
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
      manageResponseError(response);
      return null;
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

function manageResponseError(response, isFromHookdeck = true) {
  switch (response.status) {
    case 401:
      console.error(
        `Invalid or expired ${isFromHookdeck ? 'hookdeck api_key' : 'vercel token'}`,
        response.status,
        response.statusText,
      );
      break;

    default:
      console.error('Error', response.status, response.statusText);
      break;
  }
  process.exit(1);
}

function saveCurrentConfig({ connections }) {
  // Updates the hookdeck.config.js file with the current connection ids
  //
  // TODO instead of overwriting `hookdeck.config.js`, create a new file called
  // `hookdeck.config.lock.js` and use it from the wrapper.
  try {
    const destinationPath = path.join(`${appRoot}`, `hookdeck.config.js`);

    const updated_config = {};
    for (const conn of connections) {
      updated_config[conn.config.source_name] = Object.assign(conn.config, {
        id: conn.connection.id,
        source_id: conn.connection.source.id,
        destination_id: conn.connection.destination.id,
      });
    }

    const content = JSON.stringify(updated_config, null, 2);
    const text = `module.exports = ${content};`;
    fs.writeFileSync(destinationPath, text, 'utf-8');
    console.log('Saved hookdeck.config.js', text);
  } catch (e) {
    manageError(e);
  }
}

function readMiddlewareFile(basePath) {
  const extensions = ['js', 'mjs', 'ts']; // Add more if needed
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
    return;
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

async function updateConnection(api_key, config) {
  const data = {};
  const rules = getConnectionRules(config);
  if (rules.length > 0) {
    data['rules'] = rules;
  }

  try {
    const url = `${API_ENDPOINT}/connections/${config.id}`;
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
      console.error('Error while updating connection with ID', config.id);
      manageResponseError(response);
      return null;
    }
    const json = await response.json();
    console.log('Connection updated', json);

    // Updates configurations if neeeded
    if (
      (config.allowed_http_methods || null) !== null ||
      (config.custom_response || null) !== null ||
      (config.verification || null) !== null
    ) {
      const source_id = json.source.id;
      await updateSource(api_key, source_id, config);
    }

    if (
      config.path_forwarding_disabled !== null ||
      (config.http_method || null) !== null ||
      (config.auth_method || null) !== null
    ) {
      const destination_id = json.destination.id;
      await updateDestination(api_key, destination_id, config);
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
    throw new Error(`Error while updating source with ID ${id}`);
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
    throw new Error(`Error while updating destination with ID ${id}`);
  }
  const json = await response.json();
  console.log('Destination updated', json);
}
