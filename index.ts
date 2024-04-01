export function withHookdeck(config: any, f: Function) {
  return function (...args) {
    const request = args[0];
    if (!config) {
      console.error('Error getting hookdeck.config.js. Using standard middleware...');
      return f.apply(this, args)
    }
    try {
      const pathname = (request.nextUrl ?? {}).pathname;

      // TODO change to regex
      const matching = config.connections.filter((e: HookdeckConnectionConfig) => e.match_path === pathname);

      if (matching.length > 0) {
        if (typeof request.headers['x-hookdeck-eventid'] !== "string") {
          // first call, forward to Hookdeck

          // TODO: more than one match?
          const api_key = matching[0].api_key || process.env.HOOKDECK_API_KEY;
          const source_name = matching[0].source_name;

          if (!api_key) {
            console.error("Hookdeck API key doesn't found. You must set it as a env variable named HOOKDECK_API_KEY or include it in your hookdeck.config.js file.");
            return f.apply(this, args)
          }

          if (!source_name) {
            console.error("Hookdeck Source name doesn't found. You must include it in your hookdeck.config.js file.");
            return f.apply(this, args)
          }

          return forwardToHookdeck(request, api_key, source_name);
        } else {
          console.log("Hookdeck's return... calling user middleware");
          // second call, bypass Hookdeck
        }
      } else {
        console.log("No match... calling user middleware");
        // no match, regular call
      }
    } catch(e) {
      // TODO: manage error
      console.error(e);
    }

    return f.apply(this, args)
  };
}

type HookdeckConnectionConfig = {
  source_name: string;
  destination_url: string;
  match_path: string;
  api_key?: string;
};

const AUTHENTICATED_ENTRY_POINT = 'https://hkdk.events/';


async function forwardToHookdeck(request: Request, api_key: string, source_name: string): Promise<any> {
  const request_headers = {}
  // iterate using forEach because this can be either a Headers object or a plain object
  request.headers.forEach((value, key) => {
    if (!key.startsWith('x-vercel-')) {
      request_headers[key] = value;
    }
  });

  const headers = {
    ...request_headers,
    'connection': 'close',
    'x-hookdeck-api-key': api_key,
    'x-hookdeck-source-name': source_name,
  }

  // TODO assumed string body
  const body = await new Response(request.body).text();

  const options = {
    method: request.method,
    headers,
  };

  if (body) {
    options['body'] = body;
  }

  console.log("Forwarding to hookdeck...", options);

  return fetch(AUTHENTICATED_ENTRY_POINT, options);
}
