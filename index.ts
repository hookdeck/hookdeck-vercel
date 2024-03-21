
// TODO do I need async and non-async versions? 
type MiddlewareFunction = (request: any, context: any) => Request;
type MiddlewareAsyncFunction = (request: any, context: any) => Promise<any>;

export function withHookdeck(middleware: MiddlewareAsyncFunction): MiddlewareAsyncFunction {
    return (request: any, context: any): Promise<any> => {
      const hookdeckConfig = process.env.HOOKDECK_CONFIG;
      if (!hookdeckConfig) {
        console.error('Error reading HOOKDECK_CONFIG env variable');
        console.error(JSON.stringify(process.env));
        // TODO: manage error
        console.log("Calling middleware");
        return new Promise((resolve) => {
          resolve(middleware(request, context));
        });
      }
      try {
        const json = JSON.parse(hookdeckConfig);
        const pathname = (request.nextUrl ?? {}).pathname;
    
        const matching = json.filter((e: any) => {
          return e.config.match_path === pathname;
        });
        // TODO: more than one match?
        if (matching.length > 0) {
          console.log(JSON.stringify(request.headers));
          if (typeof request.headers['X-Hookdeck-EventID'] !== "string") {
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

      console.log("Calling middleware");
      return new Promise((resolve) => {
        resolve(middleware(request, context));
      });
    } 
}