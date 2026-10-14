const assert = require('node:assert/strict');
const { createHmac, webcrypto } = require('node:crypto');
const { afterEach, before, beforeEach, describe, it } = require('node:test');

const secret = 'test-only-signing-secret';
const body = Buffer.from('{"invoice":"inv_test","amount":123}');
const signature = (value = body, key = secret) =>
  createHmac('sha256', key).update(value).digest('base64');
const originalEnv = { ...process.env };

// The package uses Web Crypto in the Edge runtime; also support Node 18 test runs.
if (!globalThis.crypto) globalThis.crypto = webcrypto;

for (const entry of ['../dist/index.js', '../dist/index.mjs']) {
  describe(entry, () => {
    let withHookdeck;

    before(async () => {
      ({ withHookdeck } = await import(entry));
    });

    beforeEach((t) => {
      process.env.NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      delete process.env.HOOKDECK_SIGNING_SECRET;
      delete process.env.HOOKDECK_API_KEY;
      for (const method of ['debug', 'warn', 'error']) {
        t.mock.method(console, method, () => {});
      }
    });

    afterEach(() => {
      for (const key of ['NODE_ENV', 'VERCEL_ENV', 'HOOKDECK_SIGNING_SECRET', 'HOOKDECK_API_KEY']) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
      }
    });

    function setup(t, overrides = {}) {
      const middleware = t.mock.fn(
        () => new Response(null, { headers: { 'x-middleware-next': '1' } }),
      );
      const fetch = t.mock.method(
        globalThis,
        'fetch',
        async () => new Response('forwarded', { status: 202 }),
      );
      const handler = withHookdeck(
        {
          api_key: 'test-only-api-key',
          signing_secret: secret,
          match: { '/api/webhooks': { name: 'test-source' } },
          ...overrides,
        },
        middleware,
      );
      return { handler, middleware, fetch };
    }

    function request(headers, value = body, path = '/api/webhooks') {
      return new Request(`https://example.test${path}`, {
        method: 'POST',
        headers,
        body: value,
      });
    }

    for (const [name, headers, value = body] of [
      ['forged signature', { 'x-hookdeck-signature': 'totally-bogus-not-a-signature' }],
      ['malformed base64', { 'x-hookdeck-signature': '!!!' }],
      ['short digest', { 'x-hookdeck-signature': 'YQ==' }],
      ['wrong secret', { 'x-hookdeck-signature': signature(body, 'wrong-secret') }],
      ['tampered payload', { 'x-hookdeck-signature': signature() }, Buffer.from('tampered')],
      [
        'different invalid UTF-8 bytes',
        { 'x-hookdeck-signature': signature(Buffer.from([0xff])) },
        Buffer.from([0xfe]),
      ],
      [
        'two invalid signatures',
        { 'x-hookdeck-signature': '!!!', 'x-hookdeck-signature-2': 'invalid' },
      ],
      [
        'duplicate primary signatures',
        [
          ['x-hookdeck-signature', signature()],
          ['x-hookdeck-signature', 'forged'],
        ],
      ],
    ]) {
      it(`rejects ${name} without continuing or forwarding`, async (t) => {
        const { handler, middleware, fetch } = setup(t);
        const response = await handler(request(headers, value));
        assert.equal(response.status, 401);
        assert.equal(await response.text(), '[Hookdeck] Invalid Hookdeck Signature in request.');
        assert.equal(response.headers.get('x-middleware-next'), null);
        assert.equal(middleware.mock.callCount(), 0);
        assert.equal(fetch.mock.callCount(), 0);
      });
    }

    for (const [name, headers, value = body] of [
      ['valid primary', { 'x-hookdeck-signature': signature() }],
      ['mixed-case header', { 'X-Hookdeck-Signature': signature() }],
      [
        'valid primary with malformed secondary',
        { 'x-hookdeck-signature': signature(), 'x-hookdeck-signature-2': '!!!' },
      ],
      [
        'valid secondary with malformed primary',
        { 'x-hookdeck-signature': '!!!', 'x-hookdeck-signature-2': signature() },
      ],
      [
        'valid secondary with old primary secret',
        {
          'x-hookdeck-signature': signature(body, 'old-secret'),
          'x-hookdeck-signature-2': signature(),
        },
      ],
      [
        'binary payload',
        { 'x-hookdeck-signature': signature(Buffer.from([0, 0xff, 0xfe, 128, 1])) },
        Buffer.from([0, 0xff, 0xfe, 128, 1]),
      ],
      [
        'Unicode payload',
        { 'x-hookdeck-signature': signature(Buffer.from('Hello, 世界 🌍')) },
        Buffer.from('Hello, 世界 🌍'),
      ],
      ['empty payload', { 'x-hookdeck-signature': signature(Buffer.alloc(0)) }, Buffer.alloc(0)],
    ]) {
      it(`accepts ${name} and preserves the original body`, async (t) => {
        const { handler, middleware, fetch } = setup(t);
        const req = request(headers, value);
        const response = await handler(req);
        assert.equal(response.headers.get('x-middleware-next'), '1');
        assert.equal(middleware.mock.callCount(), 0);
        assert.equal(fetch.mock.callCount(), 0);
        assert.equal(req.bodyUsed, false);
        assert.deepEqual(Buffer.from(await req.arrayBuffer()), value);
      });
    }

    it('verifies the environment signing secret and API key', async (t) => {
      process.env.HOOKDECK_SIGNING_SECRET = secret;
      process.env.HOOKDECK_API_KEY = 'environment-api-key';
      const { handler } = setup(t, { signing_secret: undefined, api_key: undefined });
      assert.equal((await handler(request({ 'x-hookdeck-signature': 'forged' }))).status, 401);
      assert.equal(
        (await handler(request({ 'x-hookdeck-signature': signature() }))).headers.get(
          'x-middleware-next',
        ),
        '1',
      );
    });

    it('gives the configured secret precedence over the environment', async (t) => {
      process.env.HOOKDECK_SIGNING_SECRET = 'environment-secret';
      const { handler } = setup(t);
      assert.equal(
        (await handler(request({ 'x-hookdeck-signature': signature() }))).headers.get(
          'x-middleware-next',
        ),
        '1',
      );
      assert.equal(
        (await handler(request({ 'x-hookdeck-signature': signature(body, 'environment-secret') })))
          .status,
        401,
      );
    });

    for (const [name, headers] of [
      ['unsigned requests', {}],
      ['empty primary signatures', { 'x-hookdeck-signature': '' }],
      ['secondary-only signatures', { 'x-hookdeck-signature-2': signature() }],
    ]) {
      it(`preserves ingestion for ${name}`, async (t) => {
        const { handler, middleware, fetch } = setup(t);
        const response = await handler(request(headers));
        assert.equal(response.status, 202);
        assert.equal(middleware.mock.callCount(), 1);
        assert.equal(fetch.mock.callCount(), 1);
        const [url, options] = fetch.mock.calls[0].arguments;
        assert.equal(url, 'https://hkdk.events/publish/api/webhooks');
        assert.equal(options.body, body.toString());
        assert.equal(options.headers.authorization, 'Bearer test-only-api-key');
      });
    }

    it('preserves middleware denial before ingestion', async (t) => {
      const { handler, middleware, fetch } = setup(t);
      middleware.mock.mockImplementation(() => new Response('denied', { status: 403 }));
      assert.equal((await handler(request({}))).status, 403);
      assert.equal(fetch.mock.callCount(), 0);
    });

    it('preserves the documented optional no-secret mode', async (t) => {
      const { handler, middleware, fetch } = setup(t, { signing_secret: undefined });
      const req = request({ 'x-hookdeck-signature': 'not-verified-in-this-mode' });
      assert.equal((await handler(req)).headers.get('x-middleware-next'), '1');
      assert.equal(middleware.mock.callCount(), 0);
      assert.equal(fetch.mock.callCount(), 0);
      assert.deepEqual(Buffer.from(await req.arrayBuffer()), body);
    });

    for (const name of ['unmatched path', 'missing API key', 'local development']) {
      it(`preserves the ${name} bypass`, async (t) => {
        const { handler, middleware, fetch } = setup(
          t,
          name === 'missing API key' ? { api_key: undefined } : {},
        );
        if (name === 'local development') process.env.NODE_ENV = 'development';
        const req = request(
          { 'x-hookdeck-signature': 'forged' },
          body,
          name === 'unmatched path' ? '/unmatched' : '/api/webhooks',
        );
        assert.equal((await handler(req)).headers.get('x-middleware-next'), '1');
        assert.equal(middleware.mock.callCount(), 1);
        assert.equal(fetch.mock.callCount(), 0);
      });
    }
  });
}
