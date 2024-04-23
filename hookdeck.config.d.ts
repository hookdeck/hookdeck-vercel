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

  // for advanced routing scenarios
  host?: string;
  url?: string;

  // Hookdeck basic functionallity
  retry?: Omit<Hookdeck.RetryRule, 'type'>;
  delay?: number;
  filter?: Omit<Hookdeck.FilterRule, 'type'>;
  delivery_rate?: DeliveryRate;

  // source verification
  verification?: Hookdeck.SourceVerification;

  // tweak response
  custom_response?: Hookdeck.SourceCustomResponse;
}

interface HookdeckConfig {
  [source_name: string]: SourceConfig;
}

export type { HookdeckConfig };
