import { Hookdeck } from '@hookdeck/sdk';

interface DeliveryRate {
  limit?: number;
  period?: Hookdeck.DestinationRateLimitPeriod;
}

export interface SourceConfig {
  matcher: string;
  api_key?: string; // not recommended, use HOOKDECK_API_KEY instead
  signing_secret?: string; // not recommended, use HOOKDECK_SIGNING_SECRET instead
  source_name?: string;
  host?: string;
  retry?: Omit<Hookdeck.RetryRule, 'type'>;
  delay?: number;
  filter?: Omit<Hookdeck.FilterRule, 'type'>;
  custom_response?: Hookdeck.SourceCustomResponse;
  verification?: Hookdeck.SourceVerification;
  url?: string;
  delivery_rate?: DeliveryRate;
  http_method?: Hookdeck.SourceAllowedHttpMethod;
  auth_method?: Hookdeck.DestinationAuthMethodConfig;
  path_forwarding_disabled?: boolean;
  id?: string;
  source_id?: string;
  destination_id?: string;
}

interface HookdeckConfig {
  [source_name: string]: SourceConfig;
}

export type { HookdeckConfig };
