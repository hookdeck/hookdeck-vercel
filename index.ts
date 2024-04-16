import { HookdeckConfig } from './hookdeck.config';
import { createHmac } from 'crypto';

export function withHookdeck(config: HookdeckConfig, f: Function) {
  return async function (...args) {
    const request = args[0];
    if (!config) {
      console.error('Error getting hookdeck.config.js. Using standard middleware...');
      return f.apply(this, args);
    }
    try {
      const pathname = (request.nextUrl ?? {}).pathname;
      const cleanPath = pathname.split('&')[0];

      const connections = Object.values(config);
      const matching = connections.filter(
        (conn_config) => (cleanPath.match(conn_config.matcher) ?? []).length > 0,
      );

      if (matching.length === 0) {
        console.log('No match... calling user middleware');
        return f.apply(this, args);
      }

      const contains_proccesed_header =
        Object.keys(request.headers ?? {})
          .map((e) => e.toLowerCase())
          .filter((e) => e === HOOKDECK_PROCESSED_HEADER).length > 0;

      if (contains_proccesed_header) {
        // Optional Hookdeck webhook signature verification
        let verified = true;
        if (matching.length === 1) {
          const secret = matching[0].signing_secret || process.env.HOOKDECK_SIGNING_SECRET;
          verified = await verifyHookdeckSignature(request, secret);
        } else {
          verified = false;
          for (const match of matching) {
            const secret = match.signing_secret || process.env.HOOKDECK_SIGNING_SECRET;
            if (await verifyHookdeckSignature(request, secret)) {
              verified = true;
            }
          }
        }
        if (!verified) {
          const msg = "Invalid Hookdeck Signature in request.";
          console.error(msg);
          return new Response(msg, { status: 500 });
        }

        // TODO: This makes the request to go through middleware twice, affecting Vercel costs!
        console.log('Request already processed by Hookdeck. Redirecting to middleware');
        return f.apply(this, args);
      }

      // Forward to Hookdeck

      if (matching.length === 1) {
        // single source
        const api_key = matching[0].api_key || process.env.HOOKDECK_API_KEY;
        const source_name = matching[0].source_name;
        return forwardToHookdeck(request, api_key!, source_name!, pathname);
      }

      // multiple sources: check if there are multiple matches with the same api_key and source_name

      const used = new Map<string, [any]>();

      for (const result of matching) {
        const api_key = result.api_key || process.env.HOOKDECK_API_KEY;
        const source_name = result.source_name;

        if (!api_key) {
          console.error(
            "Hookdeck API key doesn't found. You must set it as a env variable named HOOKDECK_API_KEY or include it in your hookdeck.config.js file.",
          );
          return f.apply(this, args);
        }

        if (!source_name) {
          console.error(
            "Hookdeck Source name doesn't found. You must include it in your hookdeck.config.js file.",
          );
          return f.apply(this, args);
        }

        const match_key = `${api_key}/${source_name}`;
        const array = used[match_key] ?? [];
        array.push(result);
        used[match_key] = array;
      }

      const promises: Promise<any>[] = [];
      for (const array of Object.values(used)) {
        const used_connection_ids: string[] = [];
        if ((array as [any]).length > 1) {
          // If there is more than one similar match, we need the connection_id
          // to pick out the right connection
          for (const entry of array) {
            if (!!entry.id && !used_connection_ids.includes(entry.id)) {
              const api_key = entry.api_key || process.env.HOOKDECK_API_KEY;
              const source_name = entry.source_name;
              promises.push(forwardToHookdeck(request, api_key, source_name, pathname));
              used_connection_ids.push(entry.id);
            }
          }
          if (promises.length === 0) {
            console.warn(
              'Found indistinguishable source names, could not process',
              array[0].source_name,
            );
          }
        }
      }

      // If several promises were fullfilled, return the first one as required by the middleware definition
      return Promise.all(promises).then((val) => val[0]);
    } catch (e) {
      // If an error is thrown here, it's better not to continue
      // with default middleware function, as it could lead to more errors
      console.error(e);
      return new Response(JSON.stringify(e), { status: 500 });
    }
  };
}

const AUTHENTICATED_ENTRY_POINT = 'https://hkdk.events';
const HOOKDECK_PROCESSED_HEADER = 'x-hookdeck-signature';
const HOOKDECK_SIGNATURE_HEADER_1 = 'x-hookdeck-signature-1'
const HOOKDECK_SIGNATURE_HEADER_2 = 'x-hookdeck-signature-2'

async function verifyHookdeckSignature(request, secret: string | undefined): Promise<boolean> {
  const signature1 = (request.headers ?? {})[HOOKDECK_SIGNATURE_HEADER_1];
  const signature2 = (request.headers ?? {})[HOOKDECK_SIGNATURE_HEADER_2];

  if (secret && (signature1 || signature2)) {
    // TODO: assumed string body
    const body = await new Response(request.body).text();

    const hash = createHmac("sha256", secret)
      .update(body)
      .digest("base64");

      return (hash === signature1 || hash === signature2);
  }

  return true;
}


async function forwardToHookdeck(
  request: Request,
  api_key: string,
  source_name: string,
  pathname: string,
): Promise<any> {
  const request_headers = {};
  // iterate using forEach because this can be either a Headers object or a plain object
  request.headers.forEach((value, key) => {
    if (!key.startsWith('x-vercel-')) {
      request_headers[key] = value;
    }
  });

  const headers = {
    ...request_headers,
    connection: 'close',
    authorization: `Bearer ${api_key}`,
    'x-hookdeck-api-key': api_key,   // remove when Bearer is in prod
    'x-hookdeck-source-name': source_name,
  };

  // TODO: assumed string body
  const body = await new Response(request.body).text();

  const options = {
    method: request.method,
    headers,
  };

  if (!!body) {
    options['body'] = body;
  }

  console.log(`Forwarding to hookdeck (${!!body ? 'with' : 'without'} body)...`, options);

  return fetch(`${AUTHENTICATED_ENTRY_POINT}${pathname}`, options);
}
