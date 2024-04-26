# Hookdeck Vercel Middleware

The Hookdeck Vercel Middleware adds the ability to authenticate, delay, filter, queue, throttle, and retry asynchronous HTTP requests (e.g., webhooks) made to a Vercel application. The use cases for this include managing webhooks from API providers such as Stripe, Shopify, and Twilio, or when building asynchronous APIs.

## Get Started

Before you begin:

- Create a [Vercel](https://vercel.com?ref=github-hookdeck-vercel) account and a project.
- [Signup for a Hookdeck account](https://dashboard.hookdeck.com/signup?ref=github-hookdeck-vercel) and create your Hookdeck project.
- Get the Hookdeck API key from your [project secrets](https://dashboard.hookdeck.com/settings/project/secrets?ref=github-hookdeck-vercel).
- Add `HOOKDECK_API_KEY` with a value of your Hookdeck API key as an [env variable](https://vercel.com/docs/projects/environment-variables?ref=github-hookdeck-vercel)
  for your project.

Install the Hookdeck Vercel package:

```bash
npm i @hookdeck/vercel
```

> Once installed, package a `hookdeck.config.js` file and a `.hookdeck` directory are created at the root of your project. Also, the command `node .hookdeck/prebuild.js` is appended to the `prebuild` script of your `package.json`.

Update or create a `middleware.ts` within your application and add the Hookdeck Vercel Middleware:

```typescript
import { withHookdeck } from '@hookdeck/vercel';
import hookdeckConfig from './hookdeck.config';

import { NextResponse } from 'next/server';

export const config = {
  // ... existing or additional your middleware config
};

function middleware(request: Request) {
  // ... existing or additional your middleware logic

  NextResponse.next();
}

// wrap the middleware with Hookdeck wrapper
export default withHookdeck(hookdeckConfig, middleware);
```

Add your Hookdeck Project API Key and Signing Secret to `hookdeck.config.js`:

```js
const hookdeckConfig = {
  api_key: process.env.HOOKDECK_API_KEY
  signing_secret: process.env.HOOKDECK_SIGNING_SECRET,
  match: {
    '/api/webhooks': {},
  },
};

module.exports = hookdeckConfig;
```

Either update the `match` value to your endpoint or create a `app/api/webhooks/route.ts`. If the file does not already exist, create one with the following code:

```typescript

```

## Configuration

The `@hookdeck/vercel` package is supported in the [Vercel's Edge
Middleware](https://vercel.com/docs/functions/edge-middleware) code, that executes before a request is processed on your site. This way, the request can be fordwarded to Hookdeck and then received again by your specified endpoint, but with all the extra features you may need from Hookdeck such as retry strategies and filters.

If you have not implemented Vercel Edge Middleware, check this [quick start
guide](https://vercel.com/docs/functions/edge-middleware) to easily integrate into your project.

You have to change your middleware code from this:

```typescript
export const config = {
  // your middleware config
};

export function middleware(request: Request) {
  // ... your middleware logic
}
```

to this:

```typescript
// add Hookdeck imports
import { withHookdeck } from '@hookdeck/vercel';
import hookdeckConfig from './hookdeck.config';

export const config = {
  // your middleware config
};

// the middleware is not exported anymore
function middleware(request: Request) {
  // ... your middleware logic
  // return `NextResponse.next()` or `next()` to manage the request with Hookdeck
}

// wrap the middleware with Hookdeck wrapper
export default withHookdeck(hookdeckConfig, middleware);
```

When your Edge Middleware is triggered (because your middleware config matches), the `withHookdeck` wrapper acts like this:

- If there is no config file or none of the entries inside `hookdeck.config.js` matches the route, then your `middleware` function is invoked as is.
- If there're matches with the entries of `hookdeck.config.js` then the following can happen:

1.  The received request has not been processed by Hookdeck (yet). In this case, your `middleware` function is invoked to obtain a `response`. If the returned value from your `middleware` is `NextResponse.next()` or `next()`, then the request is bounced back to Hookdeck.

_NOTE_: If you are not using neither `next/server` nor `@vercel/edge`, the just return a new `Response` with a header `x-middleware-next` with value `"1"` if you want you want Hookdeck to manage your request.

2.  The received request comes from Hookdeck and has been processed. Then the request is sent to the final route or url you specified. Your `middleware` function code will not be executed this time.

## Deploy and Test

The first time you install the `@hookdeck/vercel`, a `hookdeck.config.js` file is created at your project's root directory with a stub of a configuration

```javascript
module.exports = {
  vercel_url: '', // optional Uses `VERCEL_BRANCH_URL` env var as default.
  match: {
    '</path/to/match>': {
      // all fields are optional
      retry: {},
      delay: 0,
      filters: [],
      rate: {},
      verification: {},
      custom_response: {},
    },
  },
};
```

This file exports de configuration for one or more potential matches. If you have configured your Hookdeck API key as an environment variable, then you only need the following fields for your connections:

- `/path/to/match`: the matching string or regex that will be compared or tested against the pathname of the url that triggered the middleware. If there is more than one match, then the request is sent to every matching configuration.

> IMPORTANT: if you export a `config` in your `middleware` file, make sure that your middleware's `matcher` configuration includes the routes specified in the Hookdeck's `match` fields. Only routes that match both expressions will trigger the Hookdeck functionality.

So the minimum valid content for `hookdeck.config.js` would be something like this:

```javascript
module.exports = {
  '/api/webhook': {},
};
```

A more elaborated configuration, including request delay, retry and a rate of delivery, would be something like:

```javascript
const { RetryStrategy, DestinationRateLimitPeriod } = require('@hookdeck/sdk/api');

module.exports = {
  vercel_url: 'https://my-vercel-project-eta-five-30.vercel.app',
  match: {
    '/api/webhook': {
      name: 'my-webhook-source-name',
      retry: {
        strategy: RetryStrategy.Linear,
        count: 5,
        interval: 15000, // in ms
      },
      delay: 30000, // in ms
      rate: {
        limit: 100,
        period: DestinationRateLimitPeriod.Minute,
      },
    },
  },
};
```

You can test your configuration commiting the `hookdeck.config.js` to your repo, and [deploying](https://vercel.com/docs/deployments/overview) as usual to Vercel. If something is not correct with the configuration file or your Hookdeck API key, the build will fail as a mechanism to ensure that your Hookdeck connections are ready when your build is.

If you send a request to your normal Vercel's url, it will be forwared to Hookdeck, and eventually will go back again to Vercel's function.

## Advanced Configuration

> If you are not familiar with the API reference for [connections](https://hookdeck.com/docs/api#connections), [sources](https://hookdeck.com/docs/api#sources) and [destinations](https://hookdeck.com/docs/api#sources), please give it a quick look.

In case of advanced scenarios, you may need any of these configuration keys to use all Hookdeck's capabilities directly from Vercel:

- `api_key`: You can specify a Hookdeck API key for every single connection. It will have priority over the general env variable `HOOKDECK_API_KEY`. It's better to use Vercel's env variable insterad of this configuration key. This key is intented for complex setups involving several [Hookdeck organizations](https://hookdeck.com/docs/organizations) or even accounts.
- `signing_secret`: You can specify a Hookdeck Signing Secret for every single connection. It will have priority over the general env variable `HOOKDECK_SIGNING_SECRET`. It's better to use Vercel's env variable insterad of this configuration key. This key is intented for [webhook signature verification](https://hookdeck.com/docs/authentication#hookdeck-webhook-signature-verification).
- `vercel_url`: The Vercel's url that can receive the requests. If not specified, the host stored in env var `VERCEL_BRANCH_URL` will be used.
- `retry`: use the values specified in the [Retry documentation](https://hookdeck.com/docs/api#retry) to configura Hookdeck's retry strategy.
- `delay`: the number of milliseconds to hold the event when it arrives to Hookdeck.
- `filters`: specify different filters to exclude some events from forwarding. Use the syntax specified in the [Filter documentation](https://hookdeck.com/docs/api#filter). For an overview of Filters, check this [Filters guide](https://hookdeck.com/docs/filters).
- `rate`: set the delivery rate to be used for the outcoming traffic. Check the syntax in the `rate_limit_period` key in the [Destination documentation](https://hookdeck.com/docs/api#destination-object).
- `verification`: inbound (source) verification mechanism to use. Check all possible values and syntax in the [Source documentation](https://hookdeck.com/docs/api#source-object).
- `custom_response`: the custom response to send back the webhook origin. Check the syntax in the [Source documentation](https://hookdeck.com/docs/api#source-object).

## How the Hookdeck Vercel Works

Using Hookdeck's Vercel middleware integration, you will be able to turn your Vercel's routes into asynchronous endpoints, taking all the advantage of Hookdeck's benefits.

This package acts in deploy time, checking a configuration file before your project is built:

![Build time](./img/build_time.jpg)

And acts also in runtime by sending to Hookdeck the requests that matches your configuration:

![Run time](./img/run_time.jpg)

## Considerations and Limitations

### Removing the Middleware and Going Direct to Hookdeck

The Hookdeck Vercel middleware adds an additional hop to every process request, so if milliseconds are a factor in processing requests, you may want to use Hookdeck directly and not use the middleware.

With the Hookdeck Vercel Middleware:

1. Request to Vercel URL
2. Redirect request to Hookdeck
3. Request to Vercel URL (which the middleware passes through)

Without the Hookdeck Vercel Middleware:

1. Request to Hookdeck Source URL
2. Request to Vercel URL

You can remove the middleware by uninstalling and removing any configuration and directly using the [Hookdeck Source](https://hookdeck.com/docs/sources) URL where you previously used the Vercel URL, for example, as your Stripe or Shopify webhook URL.

### Parallel Matching

If you have multiple entries in the config file with the same `matcher`, be aware that the middleware will send the request via `fetch` call once per match and will try to do that in parallel. This heavy use is not a common case, but please check [Edge Middleware Limitations](https://vercel.com/docs/functions/edge-middleware/limitations) if you are in this scenario.

## Webhook Signature Verification

It is good practice to verify the signature of the requests that arrive at your Middleware. To ensure that the requests processed from Hookdeck are authentic, include your [Signing Secret](https://dashboard.hookdeck.com/settings/project/secrets) as an environment variable in your Vercel project with the name `HOOKDECK_SIGNING_SECRET`.
