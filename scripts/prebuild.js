const appRoot = require("app-root-path");
const fs = require("fs").promises;
const { customAlphabet } = require("nanoid");
const hookdeckConfig = require("../hookdeck.config");

const LIBRARY_NAME = 'vercel-integration-demo';
const FUNCTION_NAME = "withHookdeck";
const TUTORIAL_URL = "https://hookdeck.com/docs";
const API_VERSION = "2024-03-01";
const HOOKDECK_API_URL = "https://api.hookdeck.com";
const HOOKDECK_CONFIG = "HOOKDECK_CONFIG";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_length = 16;

function generateId(prefix = "") {
  const nanoid = customAlphabet(ID_ALPHABET, ID_length);
  return `${prefix}${nanoid()}`;
}

async function findMiddlewareFile(basePath) {
  const extensions = [".js", ".mjs", ".ts"]; // Add more if needed
  for (let ext of extensions) {
    const filePath = `${basePath}${ext}`;
    try {
      await fs.access(filePath);
      return filePath; // File exists, return the path
    } catch (error) {
      // File does not exist, continue checking the next extension
    }
  }
  throw new Error("Middleware file not found");
}


function isValidPropertyValue(propValue) {
  return !(
    propValue === undefined ||
    propValue === null ||
    !isString(propValue)
  );
}

function isString(str) {
  return typeof str === "string" || str instanceof String;
}


function validateConfigs(configs) {
  if (!Array.isArray(configs.connections)) {
    return false;
  }

  let valid = true;

  for (const prop of ['vercel_project_id', 'vercel_token']) {
    valid &= isValidPropertyValue(configs[prop]);
  }
  if (!valid) {
    return false;
  }

  const string_props = ["source_name", "destination_url", "match_path"]; 
  for(const config of configs.connections) {
    for (const prop of string_props) {
      valid &= isValidPropertyValue(configs[prop]);
    }
  }

  // TODO: better validation
  
  return valid;
}


async function getSourceByName(api_key, source_name) {
  try {
    const url = `${HOOKDECK_API_URL}/${API_VERSION}/sources?name=${source_name}`;
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      credentials: "include",
    });
    if (response.status !== 200) {
      manageResponseError(response);
      return null;
    }
    const json = await response.json();
    if (json.models.length === 0) {
      return null;
    }
    return json.models[0];
  } catch (e) {
    manageError(e);
  }
}

async function getDestinationByUrl(api_key, destination_url) {
  try {
    const url = `${HOOKDECK_API_URL}/${API_VERSION}/destinations?url=${encodeURI(
      destination_url
    )}`;
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      credentials: "include",
    });
    if (response.status !== 200) {
      manageResponseError(response);
      return null;
    }
    const json = await response.json();
    if (json.models.length === 0) {
      return null;
    }
    return json.models[0];
  } catch (e) {
    manageError(e);
  }
}

async function getConnectionWithSourceAndDestination(
  api_key,
  source,
  destination
) {
  try {
    const url = `${HOOKDECK_API_URL}/${API_VERSION}/webhooks?source_id=${source.id}&destination_id=${destination.id}`;
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      credentials: "include",
    });
    if (response.status !== 200) {
      manageResponseError(response);
      return null;
    }
    const json = await response.json();
    if (json.models.length === 0) {
      return null;
    }
    return json.models[0];
  } catch (e) {
    manageError(e);
  }
}

async function createSource(api_key, source_name) {
  const data = {
    name: source_name,
    // TODO: other configs
  };
  try {
    const url = `${HOOKDECK_API_URL}/${API_VERSION}/sources`;
    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (response.status !== 200) {
      manageResponseError(response);
      return null;
    }
    const json = await response.json();
    console.log("Source created", json);
    return json;
  } catch (e) {
    manageError(e);
  }
}

async function createDestination(api_key, destination_url) {
  const destination_name = generateId("dst-");
  const data = {
    name: destination_name,
    url: destination_url,
    // TODO: other configs
  };
  try {
    const url = `${HOOKDECK_API_URL}/${API_VERSION}/destinations`;
    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (response.status !== 200) {
      manageResponseError(response);
      return null;
    }
    const json = await response.json();
    console.log("Destination created", json);
    return json;
  } catch (e) {
    manageError(e);
  }
}

async function createConnection(api_key, source, destination) {
  const data = {
    source_id: source.id,
    destination_id: destination.id,
    // TODO: other configs
  };
  try {
    const url = `${HOOKDECK_API_URL}/${API_VERSION}/webhooks`;
    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (response.status !== 200) {
      manageResponseError(response);
      return null;
    }
    const json = await response.json();
    console.log("Connection created", json);
    return json;
  } catch (e) {
    manageError(e);
  }
}

function manageError(error) {
  console.error(error);
  process.exit(1);
}

function manageResponseError(response) {
  console.error("Error: ", response.status);
  // TODO: more info
  process.exit(1);
}

async function upsertEnvironmentVariable(key, value, configs) {
  try{
    const vercel_project_id = configs.vercel_project_id;
    const vercel_token = configs.vercel_token;
    const string_value = JSON.stringify(value);
    // TODO: add team id for cases
    const url = `https://api.vercel.com/v10/projects/${vercel_project_id}/env?upsert=true`
    const response =  await fetch(
      url,
      {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${vercel_token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          key: key,
          value: string_value,
          type: "plain",
          target: ["production", "preview", "development"], // TODO: "preview", "development"?
          comment: "autogenerated EV for hookdeck configuration",
        }),
      }
    );
    const json = await response.json();
    if (!response.ok) {
      console.error(`Error creating env variable ${key} in Vercel`, json);
      manageResponseError(response);
      return null;
    }

    console.log(`Created ENV variable ${key} in Vercel`, json);
  }catch (e) {
    manageError(e);
  }

}

// TODO: Convert config to array for multiple connections support
async function checkPrebuild() {
  try {
    // TODO: move checks to functions

    // 1) Check if middleware exists. If not, then there is no need to stop the build.
    const middlewareFilePath = await findMiddlewareFile(
      `${appRoot}/middleware`
    );
    if (!middlewareFilePath) {
      console.warn(
        `Middleware file not found. Consider removing ${LIBRARY_NAME} from your dev dependencies if you are not using it.`
      );
      process.exit(0);
    }

    // 2) Check if library is used in middleware.
    const sourceCode = await fs.readFile(middlewareFilePath, "utf-8");
    const purgedCode = sourceCode.replace(/(\/\*[^*]*\*\/)|(\/\/[^*]*)/g, ""); // removes al comments. May mess with http:// bars but doesn't matter here.
    const hasLibraryName = purgedCode.includes(LIBRARY_NAME);
    const hasFunction = purgedCode.includes(FUNCTION_NAME);

    if (!hasLibraryName && !hasFunction) {
      // If it's not being used, there is no need to stop the build
      console.warn(
        `Usage of ${LIBRARY_NAME} not found at ${middlewareFilePath}. Consider removing ${LIBRARY_NAME} from your dev dependencies if you are not using it.`
      );
      process.exit(0);
    } else {
      console.log(`Usage of ${LIBRARY_NAME} detected`);
    }

    // 3) Check if hookdeckConfig exists and is valid
    if (hookdeckConfig === undefined) {
      console.error(
        `Usage of ${LIBRARY_NAME} detected but hookdeckConfig could not be imported. Please follow the steps in ${TUTORIAL_URL} to export the hookdeckConfig object`
      );
      process.exit(1);
    } else {
      console.log(`hookdeckConfig found`);
    }
    const configs = hookdeckConfig.hookdeckConfig;

    if (!validateConfigs(configs)) {
      console.error("Invalid configuration in hookdeck.config.js");
      process.exit(1);
    } else {
      console.log(`hookdeckConfig validated successfully`);
    }
    const env_configs = [];
    for (const config of configs.connections) {
        const api_key = config.api_key || process.env.HOOKDECK_API_KEY;
        if (!api_key) {
          console.error(
            `HOOKDECK_API_KEY not found. You must set it as a env variable named HOOKDECK_API_KEY or provide it at hookdeckConfig.api_key.Check ${TUTORIAL_URL} for more info.`
          );
          process.exit(1);
        }
        if (!isString(api_key) || api_key.trim().length === 0) {
          console.error(
            `Invalid Hookdeck API KEY format. Check ${TUTORIAL_URL} for more info.`
          );
          process.exit(1);
        }
    
        const source_name = config.source_name;
        const destination_url = config.destination_url;
    
        let source = await getSourceByName(api_key, source_name);
        const sourceExisted = source !== null;
    
        // TODO: this is not transactional. Create cleaup-rollback mechanism?
    
        if (!source) {
          source = await createSource(api_key, source_name);
        }
        let destination = await getDestinationByUrl(api_key, destination_url);
        const destinationExisted = destination !== null;
        if (!destination) {
          destination = await createDestination(api_key, destination_url);
        }
    
        let connection;
        if (!sourceExisted || !destinationExisted) {
          connection = await createConnection(api_key, source, destination);
        } else {
          connection = await getConnectionWithSourceAndDestination(
            api_key,
            source,
            destination
          );
          if (connection === null) {
            connection = await createConnection(api_key, source, destination);
          }
        }

        env_configs.push({
            connection: connection, 
            config: config
        });
        console.log(
          "Hookdeck connection configured successfully ",
          connection.source.url
        );
    }

    await upsertEnvironmentVariable(HOOKDECK_CONFIG, env_configs, configs);
    console.log("Hookdeck successfully configured");
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkPrebuild();
