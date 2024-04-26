import { Hookdeck } from '@hookdeck/sdk';

export interface DeliveryRate {
  limit?: number;
  period?: Hookdeck.DestinationRateLimitPeriod;
}

export interface HookdeckConfig {
  vercel_url?: string; // optional

  api_key?: string; // not recommended, use HOOKDECK_API_KEY instead
  signing_secret?: string; // not recommended, use HOOKDECK_SIGNING_SECRET instead

  match: {
    [key: string]: {
      // all attributes are optional

      // source name
      name?: string;

      // Hookdeck basic functionality
      retry?: Omit<Hookdeck.RetryRule, 'type'>;
      delay?: number;
      filters?: Array<Omit<Hookdeck.FilterRule, 'type'>>;
      rate?: DeliveryRate;

      // source verification
      verification?: Hookdeck.SourceVerification;

      // tweak response
      custom_response?: Hookdeck.SourceCustomResponse;
    };
  };
}

export type { HookdeckConfig };
