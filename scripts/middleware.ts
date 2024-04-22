import { next } from '@vercel/edge';
import { withHookdeck } from '@hookdeck/vercel';
import hookdeckConfig from './hookdeck.config';


export const config = {
  matcher: 'your-match-config-here',
};

async function middleware(request: Request) {
   /**
    * Your middleware function here
    * See https://vercel.com/docs/functions/edge-middleware
    */

   // Hookdeck will process the request only if `next()` is returned
   return next();
}

export default withHookdeck(hookdeckConfig, middleware);
