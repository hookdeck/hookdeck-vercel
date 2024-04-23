// TODO: See documentation here https://hookdeck.com/xxxxx

module.exports = {
  '<source_name>': {
    matcher: '',

    // all fields below this line are optional:
    host: '',
    url: '',

    retry: {
      strategy: 'exponential',
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
    delivery_rate: {
      limit: 100,
      period: 'minute',
    },

    verification: {},

    custom_response: {},
  },
};
