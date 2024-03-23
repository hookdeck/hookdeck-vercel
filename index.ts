type MiddlewareFunction = (request: any, context: any) => any;
type MiddlewareAsyncFunction = (request: any, context: any) => Promise<any>;

type HookdeckConnectionConfig = {
  source_name: string;
  destination_url: string;
  match_path: string;
  api_key: string;
};

type HookdeckConfig = {
  connections: HookdeckConnectionConfig[];
}

const AUTHENTICATED_ENTRY_POINT = 'https://hkdk.events/';


function callMiddleware(middleware: any, request: any, context: any) {
  console.log("Calling middleware...");
  const res = middleware(request, context);
  if (typeof res['then'] === 'function') {
      // probably a promise
      return res;
  } else {
    // definitely not a promise
    return new Promise((resolve) => {
      resolve(res);
    });
  }
}

export function withHookdeck(config: HookdeckConfig, middleware: MiddlewareFunction): MiddlewareAsyncFunction {
  console.log("Installing Hookdeck wrapper...");
  return (request: any, context: any): Promise<any> => {
      console.log("Entering Hookdeck wrapper...");
      if (!config) {
        console.error('Error getting hookdeck.config.js. Using standard middleware...');
        return callMiddleware(middleware, request, context);
      }
      try {
        const pathname = (request.nextUrl ?? {}).pathname;

        // TODO change to regex
        const matching = config.connections.filter((e: HookdeckConnectionConfig) => e.match_path === pathname);

        if (matching.length > 0) {
          if (typeof request.headers['x-hookdeck-eventid'] !== "string") {
            // first call, forward to Hookdeck

            // TODO: more than one match?
            return forwardToHookdeck(request, matching[0]);
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

      return callMiddleware(middleware, request, context);
    } 
}

function forwardToHookdeck(request: any, conn: HookdeckConnectionConfig): Promise<any> {
  const headers = {
    ...request.headers,
    'x-hookdeck-api-key': conn.api_key,
    'x-hookdeck-source-name': conn.source_name,
  }
  console.log("Forwarding to hookdeck...");
  return fetch(AUTHENTICATED_ENTRY_POINT, {
    method: request.method,
    headers,
    body: request.body,
  });
}

