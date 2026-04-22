/**
 * Cloudflare Pages Function: /webhooks/twitch.js
 * Handles Twitch EventSub webhook callbacks.
 *
 * Required env vars:
 *   TWITCH_SECRET  — the secret you set when creating the EventSub subscription
 */
 
const TWITCH_MESSAGE_ID               = 'twitch-eventsub-message-id';
const TWITCH_MESSAGE_RETRY            = 'twitch-eventsub-message-retry';
const TWITCH_MESSAGE_TYPE             = 'twitch-eventsub-message-type';
const TWITCH_MESSAGE_SIGNATURE        = 'twitch-eventsub-message-signature';
const TWITCH_MESSAGE_TIMESTAMP        = 'twitch-eventsub-message-timestamp';
const TWITCH_SUBSCRIPTION_TYPE        = 'twitch-eventsub-subscription-type';
const MESSAGE_TYPE_VERIFICATION       = 'webhook_callback_verification';
const MESSAGE_TYPE_REVOCATION         = 'revocation';
const MESSAGE_TYPE_NOTIFICATION       = 'notification';
 
function getHmacMessage(request, body) {
  return (
    request.headers.get(TWITCH_MESSAGE_ID) +
    request.headers.get(TWITCH_MESSAGE_TIMESTAMP) +
    body
  );
}
 
async function getHmac(secret, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgData);
  return 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
 
async function verifyMessage(hmacMessage, signature, secret) {
  const expected = await getHmac(secret, hmacMessage);
  return expected === signature;
}
 
async function postToDiscord(webhookUrl, embed) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
}
 
export async function onRequest(context) {
  const { request, env } = context;
 
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
 
  const body = await request.text();
  const messageType = request.headers.get(TWITCH_MESSAGE_TYPE);
  const signature   = request.headers.get(TWITCH_MESSAGE_SIGNATURE);
  const hmacMessage = getHmacMessage(request, body);
 
  // Verify signature
  const valid = await verifyMessage(hmacMessage, signature, env.TWITCH_SECRET || 'changeme');
  if (!valid) {
    return new Response('Forbidden', { status: 403 });
  }
 
  const payload = JSON.parse(body);
 
  // Verification challenge
  if (messageType === MESSAGE_TYPE_VERIFICATION) {
    return new Response(payload.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
 
  if (messageType === MESSAGE_TYPE_REVOCATION) {
    console.log('Subscription revoked:', payload.subscription.type);
    return new Response('OK', { status: 200 });
  }
 
  if (messageType === MESSAGE_TYPE_NOTIFICATION) {
    const event = payload.event;
    const subType = payload.subscription.type;
 
    if (subType === 'stream.online') {
      const broadcasterId = event.broadcaster_user_id;
      const broadcasterName = event.broadcaster_user_name;
      const broadcasterLogin = event.broadcaster_user_login;
 
      // Find all alerts for this broadcaster
      const { results } = await env.DB.prepare(
        `SELECT sa.discord_webhook_url, sa.custom_message, sa.include_preview
         FROM social_alerts sa
         WHERE sa.platform = 'twitch' AND sa.target_id = ? AND sa.enabled = 1`
      ).bind(broadcasterId).all();
 
      for (const alert of results || []) {
        if (!alert.discord_webhook_url) continue;
 
        const embed = {
          title: `🔴 ${broadcasterName} is now LIVE on Twitch!`,
          description: alert.custom_message || `${broadcasterName} just went live. Go check them out!`,
          color: 0x9146ff, // Twitch purple
          url: `https://twitch.tv/${broadcasterLogin}`,
          thumbnail: { url: `https://static-cdn.jtvnw.net/jtv_user_pictures/${broadcasterLogin}-profile_image-300x300.png` },
          fields: [{ name: 'Watch Now', value: `[twitch.tv/${broadcasterLogin}](https://twitch.tv/${broadcasterLogin})` }],
          timestamp: new Date().toISOString(),
          footer: { text: 'Twitch' },
        };
 
        await postToDiscord(alert.discord_webhook_url, embed);
      }
    }
  }
 
  return new Response('OK', { status: 200 });
}
