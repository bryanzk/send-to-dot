# OAuth form Origin correction

Authorization HTML previously inherited Referrer-Policy no-referrer. Real browser form navigation sent Origin null, so the strict approval endpoint rejected its own form. Only the authorization page now uses Referrer-Policy same-origin. Missing, null and foreign Origin remain forbidden; owner approval, PKCE and redirect allowlist are unchanged.

Confirmed by a real browser generated-form reproduction and an HTTP regression that failed before the correction. Full isolated installed candidate tests: 34 passed, 0 failed/skipped. Independent review confirmed the change does not weaken cross-site request checks. This does not prove completion of a user's OAuth callback or phone acceptance.
