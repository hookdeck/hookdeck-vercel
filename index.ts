import { HookdeckConfig } from './hookdeck.config';
import { next } from '@vercel/edge';

const AUTHENTICATED_ENTRY_POINT = 'https://hkdk.events/publish';
const HOOKDECK_PROCESSED_HEADER = 'x-hookdeck-signature';
const HOOKDECK_SIGNATURE_HEADER_1 = 'x-hookdeck-signature';
const HOOKDECK_SIGNATURE_HEADER_2 = 'x-hookdeck-signature-2';

export function withHookdeck(config: HookdeckConfig, f: Function): (args) => Promise<Response> {
  return async function (...args) {
    const request = args[0];

    try {
      const pathname = getPathnameWithFallback(request);
      const cleanPath = pathname.split('&')[0];

      const connections: Array<any> = [];
      for (const e of Object.entries(config.match)) {
        const key = e[0];
        const value = e[1] as any;

        const conn = Object.assign(value, {
          matcher: key,
          source_name: value.name || (await vercelHash(key)),
        });

        connections.push(conn);
      }

      const matching = connections.filter(
        (conn_config) => (cleanPath.match(conn_config.matcher) ?? []).length > 0,
      );

      if (matching.length === 0) {
        console.debug(`[Hookdeck] No match for path '${cleanPath}'... calling user middleware`);
        return Promise.resolve(f.apply(this, args));
      }

      const api_key = config.api_key || process.env.HOOKDECK_API_KEY;
      if (!api_key) {
        console.warn(
          "[Hookdeck] Hookdeck API key doesn't found. You must set it as a env variable named HOOKDECK_API_KEY or include it in your hookdeck.config.js file.",
        );
        return Promise.resolve(f.apply(this, args));
      }

      // Check if vercel or next env is develoment
      const is_development =
        process &&
        (process.env.VERCEL_ENV === 'development' || process.env.NODE_ENV === 'development');
      if (is_development) {
        console.warn(
          '[Hookdeck] Local development environment detected. Hookdeck middleware is disabled locally. Bypassing the middleware...',
        );
        return Promise.resolve(f.apply(this, args));
      }

      const contains_proccesed_header = !!request.headers.get(HOOKDECK_PROCESSED_HEADER);
      if (contains_proccesed_header) {
        // Optional Hookdeck webhook signature verification
        let verified = true;

        const secret = config.signing_secret || process.env.HOOKDECK_SIGNING_SECRET;
        if (!!secret) {
          verified = await verifyHookdeckSignature(request, secret);
        }

        if (!verified) {
          const msg = '[Hookdeck] Invalid Hookdeck Signature in request.';
          console.error(msg);
          return new Response(msg, { status: 401 });
        }

        // Go to next (Edge function or regular page) in the chain
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
        const source_name = matching[0].source_name;
        return await forwardToHookdeck(request, api_key, source_name, pathname);
      }

      // multiple sources: check if there are multiple matches with the same api_key and source_name

      const used = new Map<string, [any]>();

      for (const result of matching) {
        const source_name = result.source_name;
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

function getPathnameWithFallback(request: any): string {
  if (request.nextUrl) {
    // NextJS url
    return request.nextUrl.pathname;
  }

  if (request.url) {
    // vanilla object
    return new URL(request.url).pathname;
  }

  // unknown
  return '';
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

async function vercelHash(key) {
  // can't use NPM crypto library in Edge Runtime, must
  // use crypto.subtle
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
