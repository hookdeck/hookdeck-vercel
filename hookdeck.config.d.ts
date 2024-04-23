import { Hookdeck } from '@hookdeck/sdk';

interface DeliveryRate {
  limit?: number;
  period?: Hookdeck.DestinationRateLimitPeriod;
}

export interface SourceConfig {
  // all attributes are optional

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

interface MatchConfig {
  [source_name: string]: SourceConfig;
}

interface HookdeckConfig {
  vercel_url?: string; // optional

  api_key?: string; // not recommended, use HOOKDECK_API_KEY instead
  signing_secret?: string; // not recommended, use HOOKDECK_SIGNING_SECRET instead

  match: MatchConfig;
}

export type { HookdeckConfig };
