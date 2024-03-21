// See documentation here https://hookdeck.com/xxxxx

module.exports.hookdeckConfig = {
  // TODO these values are sensitive and should be stored in a secure way
  vercel_token: "",
  vercel_project_id: "",

  connections: [
    {
      source_name: "",
      destination_url: "",
      match_path: "",
      api_key: "",
      source_config : {
        allowed_http_methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      },
    },
  ],
};