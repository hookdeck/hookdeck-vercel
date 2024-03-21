
type MiddlewareFunction = (request: any, context: any) => any;
type MiddlewareAsyncFunction = (request: any, context: any) => Promise<any>;

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

export function withHookdeck(middleware: MiddlewareFunction): MiddlewareAsyncFunction {
  console.log("Installing Hookdeck wrapper...");
  return (request: any, context: any): Promise<any> => {
      console.log("Entering Hookdeck wrapper...");
      const hookdeckConfig = process.env.HOOKDECK_CONFIG;
      if (!hookdeckConfig) {
        console.error('Error reading HOOKDECK_CONFIG env variable');
        console.error(JSON.stringify(process.env));
        // TODO: manage error
        return callMiddleware(middleware, request, context);
      }
      try {
        const json = JSON.parse(hookdeckConfig!);
        const pathname = (request.nextUrl ?? {}).pathname;
    
        const matching = json.filter((e: any) => {
          return e.config.match_path === pathname;
        });
        // TODO: more than one match?
        if (matching.length > 0) {
          // console.log(JSON.stringify(request.headers));
          if (typeof request.headers['x-hookdeck-eventid'] !== "string") {
            // first call, forward to Hookdeck
            const url = matching[0].connection.source.url;

            console.log("Calling hookdeck...", url);
            return fetch(url, {
              method: request.method,
              headers: request.headers,
              body: request.body,
            });
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
