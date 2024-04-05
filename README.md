# Hookdeck's Vercel Middleware Integration

Using Hookdeck's Vercel middleware integration, you will be able to turn your Vercel's routes into asynchronous endpoints, taking all the advantage of Hookdeck's benefits.

In this quickstart, you'll learn how to integrate Hookdeck seamlessly in your Vercel project. If you are already using URLs of your Vercel project as a webhooks, you don't have to change your code: you will continue receiving the requests, but from Hookdeck (with all the features you may need, such as retries, authentication, transformations, etc).

We will walk you through these steps:

1. Prerequisites
2. Installation
3. Configuration
4. Deploy and Test
5. Advanced Configuration

## 1. Prerequisites

  - [Signup for a Hookdeck account](https://dashboard.hookdeck.com/signup) and create your Hookdeck project.
  - Get the API key from your [project secrets](https://dashboard.hookdeck.com/settings/project/secrets).
  - Have a [Vercel](https://vercel.com/) account and a project. If you don't have one, follow the [Vercel docs](https://vercel.com/docs) to create one.
  - Set the Hookdeck API key you obtained before as a [env variable](https://vercel.com/docs/projects/environment-variables)
for your project. The name of the environment variable must be `HOOKDECK_API_KEY`. Note: you can specify different Hookdeck API keys for your connections. See the advanced configuration section of this guide to know how.


## 2. Installation

In your Vercel project, open a terminal and add the `vercel-integration-demo` package using your prefered package manager:

using `npm`:

```bash
$ npm install --save-dev vercel-integration-demo
```
or using `yarn`

```bash
$ yarn add --dev vercel-integration-demo
```

you can also add the `vercel-integration-demo` package manually to dev dependencies on your `package.json` file.

> Once installed the `vercel-integration-demo` package a `hookdeck.config.js` file and a `.hookdeck` directory are created at the root of your project. Also, the command `node .hookdeck/prebuild.js` is appended to the `prebuild` script of your `package.json`.


## 3. Configuration

The `vercel-integration-demo` package is supported in the [Vercel's Edge
Middleware](https://vercel.com/docs/functions/edge-middleware) code, that executes before a request is processed on your site. This way, the request can be fordwarded to Hookdeck and then received again by your specified endpoint, but with all the extra features you may need from hookdeck such as retry strategies and transformations.

If you have not implemented Vercel Edge Middleware, check this [quick start
guide](https://vercel.com/docs/functions/edge-middleware) to easily integrate into your project.


You have to change your middleware code from this:

```typescript
import { NextFetchEvent } from 'next/server'
// ... other imports

export const config = {
    // your middleware config
};
 
export function middleware(request: Request, ctx: NextFetchEvent) {
    // ... your middleware code goes here
}
```

to this:

```typescript
import { NextFetchEvent } from 'next/server'
// ... other imports

// add hookdeck imports
import { withHookdeck } from "vercel-integration-demo";
import hookdeckConfig from "./hookdeck.config";

export const config = {
    // your middleware config
};
 
// the middleware is not exported anymore
function middleware(request: Request, ctx: NextFetchEvent) {
    // ... your middleware code goes here
}

// wrap the middleware with hookdeck wrapper
export default withHookdeck(hookdeckConfig, middleware);
```


## 4. Deploy and Test

The first time you installed the `vercel-integration-demo`, a `hookdeck.config.js` file is created at your project's root directory with a stub of a configuration

```typescript
module.exports = {
  connections: [
    {
    source_name: "",
    destination_url: "",
    match_path: ""
    }
  ]
};
```

This file exports an array of connections. If you have configured your Hookdeck API key as an environment variable, then you only need the following fields for your connections:

- `source_name`: The name of the source that will receive the request. You don't
have to create it previously in the Hookdecks dashboard, as the package automatically creates it when necessary.
- `destination_url`: The full URL that will receive the processed event, sent by Hookdeck. This is the route that handles your webhook logic inside Vercel (usually as a Vercel Function).
- `match_path`: the matching string or regex that will be compared or tested against the pathname of the url that triggered the middleware. If there is more than one match, then the request is sent to every single source found.
> IMPORTANT: if you export a `config` in your `middleware` file, make sure that your `matcher` configuration includes the routes specified in the `match_path` fields. Only routes that match the `matcher` will trigger the middleware, and therefore the `withHookDeck` functionality.

You can check your configuration file locally by running

```bash
$ npm run prebuild
```
or

```bash
$ yarn prebuild
```

Check the local logs and the [Hookdeck dashboard](https://dashboard.hookdeck.com/connections) to verify your newly created connections. You will see that your `hookdeck.config.js` has been updated with the connection IDs.

You can [deploy](https://vercel.com/docs/deployments/overview) normally to Vercel. If something is not correct with the configuration file or your Hookdeck API key, the build will fail as a mechanism to ensure that your Hookdeck connections are ready when your build is.


## 5. Advanced Configuration

> If you are not familiar with the API reference for [connections](https://hookdeck.com/docs/api#connections), [sources](https://hookdeck.com/docs/api#sources) and [destinations](https://hookdeck.com/docs/api#sources), please give it a quick look.

Configuration objects support other fields:

- `api_key`: You can specify a Hookdeck API key for every single connection. It will have priority over the general env variable `HOOKDECK_API_KEY`. Be careful to not commit these API keys to your repository.
- `connection_id`: The full URL that will receive the processed event, sent by Hookdeck. If this field is specified, the connection will be updated using this ID.
- `rules`: an array of [Rule](https://hookdeck.com/docs/api#rule) objects that will be applied to the connection. All types are supported: `retry`, `delay`, `filter` and `transform`.
- `source_config`: a dictionay containing the [source configuration](https://hookdeck.com/docs/api#createupdate-a-source) for this connection. 
- `destination_config`: a dictionay containing the [destination configuration](https://hookdeck.com/docs/api#createupdate-a-destination) for this connection.

