import { HookdeckConfig } from './hookdeck.config';
import { next } from '@vercel/edge';

const AUTHENTICATED_ENTRY_POINT = 'https://hkdk.events/publish';
const HOOKDECK_PROCESSED_HEADER = 'x-hookdeck-signature';
const HOOKDECK_SIGNATURE_HEADER_1 = 'x-hookdeck-signature';
const HOOKDECK_SIGNATURE_HEADER_2 = 'x-hookdeck-signature-2';

export function withHookdeck(config: HookdeckConfig, f: Function): (args) => Promise<Response> {
  return async function (...args) {
    const request = args[0];

    if (!config) {
      console.error('[Hookdeck] Error getting hookdeck.config.js. Using standard middleware...');
      return Promise.resolve(f.apply(this, args));
    }

    try {
      const pathname = getPathStringWithFallback(request);
      const cleanPath = pathname.split('&')[0];

      const connections = Object.values(config);
      const matching = connections.filter(
        (conn_config) => (cleanPath.match(conn_config.matcher) ?? []).length > 0,
      );

      if (matching.length === 0) {
        console.debug('[Hookdeck] No match... calling user middleware');
        return Promise.resolve(f.apply(this, args));
      }

      if (!process.env.HOOKDECK_API_KEY) {
        console.warn(
          "[Hookdeck] Hookdeck API key doesn't found. You must set it as a env variable named HOOKDECK_API_KEY or include it in your hookdeck.config.js file.",
        );
        return Promise.resolve(f.apply(this, args));
      }

      const contains_proccesed_header = !!request.headers.get(HOOKDECK_PROCESSED_HEADER);

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
          const msg = '[Hookdeck] Invalid Hookdeck Signature in request.';
          console.error(msg);
          return new Response(msg, { status: 401 });
        }

        // This makes the request to go through middleware twice, affecting Vercel costs!
        const url = new URL(request.url);
        url.pathname = cleanPath;

        // TODO test without NextJS
        return next();
      }

      const middlewareResponse = await Promise.resolve(f.apply(this, args));
      // invoke middleware if it returns something different to `next()`
      if (
        middlewareResponse &&
        middlewareResponse.headers.get('x-middleware-next') !== '1' &&
        middlewareResponse.headers.get('x-from-middleware') !== '1'
      ) {
        return middlewareResponse;
      }

      // Forward to Hookdeck

      if (matching.length === 1) {
        // single source
        const api_key = matching[0].api_key || process.env.HOOKDECK_API_KEY;
        const source_name = matching[0].source_name;
        return await forwardToHookdeck(request, api_key, source_name!, pathname);
      }

      // multiple sources: check if there are multiple matches with the same api_key and source_name

      const used = new Map<string, [any]>();

      for (const result of matching) {
        const api_key = result.api_key || process.env.HOOKDECK_API_KEY;
        const source_name = result['source_name'];

        if (!source_name) {
          console.error(
            "Hookdeck Source name doesn't found. You must include it in your hookdeck.config.js file.",
          );
          return middlewareResponse;
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
              '[Hookdeck] Found indistinguishable source names, could not process',
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
      console.error('[Hookdeck] Exception on withHookdeck', e);
      return new Response(JSON.stringify(e), { status: 500 });
    }
  };
}

function getPathStringWithFallback(request: any): string {
  // try with Next's object
  let pathname = request.nextUrl;
  if (!pathname) {
    // try with vanilla's request object
    const url = request.url;
    if (url) {
      pathname = new URL(url).pathname;
    }
  }
  return pathname ?? '';
}
async function verifyHookdeckSignature(request, secret: string | undefined): Promise<boolean> {
  const signature1 = (request.headers ?? {})[HOOKDECK_SIGNATURE_HEADER_1];
  const signature2 = (request.headers ?? {})[HOOKDECK_SIGNATURE_HEADER_2];

  if (secret && (signature1 || signature2)) {
    // TODO: assumed string body
    const body = await new Response(request.body).text();
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(body);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      false,
      ['sign'],
    );
    const hmac = await crypto.subtle.sign('HMAC', cryptoKey, bodyData);
    const hash = btoa(String.fromCharCode(...new Uint8Array(hmac)));

    return hash === signature1 || hash === signature2;
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

  console.debug(
    `[Hookdeck] Forwarding to hookdeck (${!!body ? 'with' : 'without'} body)...`,
    options,
  );

  return fetch(`${AUTHENTICATED_ENTRY_POINT}${pathname}`, options);
}
