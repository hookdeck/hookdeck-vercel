// Using same definitions as Core version

interface RetryConfig {
  strategy: 'linear' | 'exponential';
  count: number;
  interval: number;
}

type WebhookFilterProperty = string | number | boolean | 'null' | object;

interface FilterConfig {
  headers: WebhookFilterProperty;
  body: WebhookFilterProperty;
  query: WebhookFilterProperty;
  path: WebhookFilterProperty;
}
type source_allowed_http_methods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type source_custom_response_content_types = 'json' | 'text' | 'xml';

interface TransformationConfig {
  name: string;
  code: string;
  env: Record<string, string>;
}

type IntegrationProvider =
  | 'EBAY'
  | 'TWITTER'
  | 'TWILIO'
  | 'STRIPE'
  | 'RECHARGE'
  | 'GITHUB'
  | 'SHOPIFY'
  | 'POSTMARK'
  | 'TYPEFORM'
  | 'HMAC'
  | 'BASIC_AUTH'
  | 'API_KEY'
  | 'XERO'
  | 'SVIX'
  | 'ADYEN'
  | 'AKENEO'
  | 'ZOOM'
  | 'OURA'
  | 'GITLAB'
  | 'PROPERTY-FINDER'
  | 'WOOCOMMERCE'
  | 'COMMERCELAYER'
  | 'HUBSPOT'
  | 'MAILGUN'
  | 'PERSONA'
  | 'PIPEDRIVE'
  | 'SENDGRID'
  | 'WORKOS'
  | 'SYNCTERA'
  | 'AWS_SNS'
  | 'THREE_D_EYE'
  | 'ENODE'
  | 'FAVRO'
  | 'LINEAR'
  | 'TWITCH'
  | 'WIX'
  | 'NMI'
  | 'ORB'
  | 'PYLON'
  | 'TRELLO'
  | 'REPAY'
  | 'SANITY'
  | 'SHOPLINE'
  | 'SQUARE'
  | 'SOLIDGATE'
  | 'CLOUDSIGNAL'
  | 'COURIER';

interface SourceCustomResponse {
  content_type: source_custom_response_content_types;
  body: string;
}

interface VerificationConfig {
  type: IntegrationProvider;
  configs?: IntegrationConfig;
}

type IntegrationConfig =
  | APIKeyIntegrationConfigs
  | EbayIntegrationConfigs
  | HandledAPIKeyIntegrationConfigs
  | HandledHMACConfigs
  | HMACIntegrationConfigs
  | APIKeyIntegrationConfigs
  | BasicAuthIntegrationConfigs
  | ShopifyIntegrationConfigs;

interface HandledHMACConfigs extends Pick<HMACIntegrationConfigs, 'webhook_secret_key'> {}

interface BasicAuthIntegrationConfigs {
  username: string;
  password: string;
}

interface APIKeyIntegrationConfigs {
  header_key: string;
  api_key: string;
}

interface EbayIntegrationConfigs {
  client_id: string;
  client_secret: string;
  dev_id: string;
  verification_token: string;
  environment: string;
}

interface HandledAPIKeyIntegrationConfigs extends Pick<APIKeyIntegrationConfigs, 'api_key'> {
  api_key: string;
}

interface HMACIntegrationConfigs {
  webhook_secret_key: string;
  algorithm: HMACAlgorithms;
  header_key: string;
  encoding: 'base64' | 'base64url' | 'hex';
}

interface ShopifyIntegrationConfigs extends Pick<HMACIntegrationConfigs, 'webhook_secret_key'> {
  rate_limit_period?: 'minute' | 'second';
  rate_limit?: number;
  api_key?: string;
  api_secret?: string;
  shop?: string;
}

type HMACAlgorithms = 'md5' | 'sha1' | 'sha256' | 'sha512';

interface DeliveryRateConfig {
  limit: number;
  period: 'minute' | 'hour' | 'day';
}

type destination_auth_method_types =
  | 'HOOKDECK_SIGNATURE'
  | 'BASIC_AUTH'
  | 'API_KEY'
  | 'BEARER_TOKEN'
  | 'CUSTOM_SIGNATURE'
  | 'OAUTH2_CLIENT_CREDENTIALS'
  | 'OAUTH2_AUTHORIZATION_CODE';

interface DestinationAuthMethod {
  type: destination_auth_method_types;
  config: DestinationAuthMethodConfig;
}

type DestinationAuthMethodConfig =
  | DestinationAuthMethodHookdeckSignatureConfig
  | DestinationAuthMethodBasicAuthConfig
  | DestinationAuthMethodApiKeyConfig
  | DestinationAuthMethodBearerTokenConfig
  | DestinationAuthMethodCustomSignatureConfig
  | DestinationAuthMethodOAuth2ClientCredentialsConfig
  | DestinationAuthMethodOAuth2AuthorizationCodeConfig;

interface DestinationAuthMethodHookdeckSignatureConfig {}

interface DestinationAuthMethodBasicAuthConfig {
  username: string;
  password: string;
}

interface DestinationAuthMethodApiKeyConfig {
  key: string;
  api_key: string;
  to: 'header' | 'query';
}

interface DestinationAuthMethodBearerTokenConfig {
  token: string;
}

interface DestinationAuthMethodCustomSignatureConfig {
  key: string;
  signing_secret: string;
}

interface DestinationAuthMethodOAuth2ClientCredentialsConfig {
  client_id: string;
  client_secret: string;
  scope: string;
  auth_server: string;
}

interface DestinationAuthMethodOAuth2AuthorizationCodeConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  scope: string;
  auth_server: string;
}

export interface SourceConfig {
  matcher: string;
  api_key?: string;
  source_name?: string;
  host?: string;
  retry?: RetryConfig;
  delay?: number;
  filter?: FilterConfig;
  transformation?: TransformationConfig;
  custom_response?: SourceCustomResponse;
  verification?: VerificationConfig;
  url?: string;
  delivery_rate?: DeliveryRateConfig;
  http_method?: source_allowed_http_methods;
  auth_method?: DestinationAuthMethod;
  path_forwarding_disabled?: boolean;
  id?: string;
  source_id?: string;
  destination_id?: string;
}

interface HookdeckConfig {
  [source_name: string]: SourceConfig;
}

export type { HookdeckConfig };
