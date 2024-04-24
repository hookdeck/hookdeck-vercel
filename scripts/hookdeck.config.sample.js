const {
  RetryStrategy,
  DestinationRateLimitPeriod,
  SourceCustomResponseContentType,
} = require('@hookdeck/sdk/api');

const hookdeckConfig = {
  vercel_url: '',
  match: {
    '/path/to/match': {
      // all fields below this line are optional
      retry: {
        strategy: RetryStrategy.Linear,
        count: 0,
        interval: 0,
      },
      delay: 0,
      filters: [
        {
          headers: {},
          body: {},
          query: {},
          path: {},
        },
      ],
      rate: {
        limit: 100,
        period: DestinationRateLimitPeriod.Minute,
      },

      verification: {},

      custom_response: {
        contentType: SourceCustomResponseContentType.Json,
        body: '',
      },
    },
  },
};

module.exports = hookdeckConfig;
