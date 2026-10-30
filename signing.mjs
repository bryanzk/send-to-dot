import {createHmac,timingSafeEqual} from 'node:crypto';
function fail(message) { throw new Error(message); }
function nonempty(s) { return typeof s === 'string' && s.length > 0 && s.length <= 512; }
export function equalText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function signingKey(secret) {
  if (typeof secret !== 'string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) fail('Invalid signing secret');
  const encoded = secret.slice(6), key = Buffer.from(encoded, 'base64');
  if (key.length < 24 || key.length > 64 || key.toString('base64') !== encoded) fail('Invalid signing secret');
  return key;
}
export function signedRequest(subscription, messageId, body, unixSeconds) {
  if (!nonempty(messageId) || !Number.isSafeInteger(unixSeconds) || unixSeconds < 0) fail('Invalid signing parameters');
  if (typeof body !== 'string' || Buffer.byteLength(body) > 262144) fail('Payload too large or invalid');
  const signature = createHmac('sha256', signingKey(subscription.secret))
    .update(`${messageId}.${unixSeconds}.${body}`).digest('base64');
  return { body, headers: { 'Content-Type': 'application/json', 'webhook-id': messageId,
    'webhook-timestamp': String(unixSeconds), 'webhook-signature': `v1,${signature}`,
    'X-MCP-Subscription-Id': subscription.id } };
}
