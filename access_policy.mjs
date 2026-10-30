// New access grants only. Existing stored deadlines are never migrated implicitly.
export const ACCESS_DAYS=30;
export const ACCESS_MS=ACCESS_DAYS*24*60*60*1000;
export const ACCESS_SECONDS=ACCESS_MS/1000;
export const SUBSCRIPTION_MS=60*60*1000; // Server policy, not a platform-imposed account lifetime.
