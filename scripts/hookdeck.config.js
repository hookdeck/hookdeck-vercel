// TODO: See documentation here https://hookdeck.com/xxxxx

module.exports = {
  '<source_name>': {
    match: '',
    host: '',
    // all fields are optional below this line:
    api_key: '',
    id: '',
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
    // source configuration
    allowed_http_methods: [],
    custom_response: {},
    verification: {},
    // destination configuration
    path_forwarding_disabled: false,
    delivery_rate: {
      limit: 100,
      period: 'minute',
    },
    url: '',
    http_method: '',
    auth_method: {},
  },
};
