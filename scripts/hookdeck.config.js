// TODO: See documentation here https://hookdeck.com/xxxxx

module.exports = {
  '<source_name>': {
    matcher: '',

    // all fields below this line are optional:
    host: '',
    retry: {
      strategy: 'exponential',
      count: 0,
      interval: 0,
    },
    delay: 0,
    alert: '',
    filters: [
      {
        headers: {},
        body: {},
        query: {},
        path: {},
      },
    ],
    transformation: {
      name: '',
      code: '',
      env: {},
    },
    // source configuration
    custom_response: {},
    verification: {},
    // destination configuration
    url: '',
    delivery_rate: {
      limit: 100,
      period: 'minute',
    },
    http_method: '',
    auth_method: {},
  },
};
