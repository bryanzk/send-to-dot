# OAuth callback navigation correction

A real generated browser form reproduced CSP form-action self blocking a POST303 navigation to the approved external callback. Repeated successful approval submissions could then reach the existing ten-per-minute limit before any token exchange.

Only OAuth authorization HTML now adds the configured exact HTTPS callbacks to form-action. It rejects wildcard/encoded-wildcard, whitespace, directive injection, non-HTTPS, credentials, query and fragment sources. Other pages keep self-only forms. Origin/owner approval/PKCE/exact redirect checks and the rate limit remain in force;429 includes Retry-After60. No secret values, authorization URLs, codes or tokens are logged; optional local audit reports only fixed stage/outcome labels.

Generated real-browser callback navigation passed. New fixture integration covers registration→approval→code exchange→actual MCP SDK discovery/events list. Full isolated installed candidate:36 tests passed,0 failed/skipped. The real user's ChatGPT connection and image response still require separate confirmation.
