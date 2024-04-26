const hookdeckConfig = {
  vercel_url: '', // optional Uses `VERCEL_BRANCH_URL` env var as default.
  match: {
    '/path/to/match': {
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

module.exports = hookdeckConfig;
