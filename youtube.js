/**
 * Cloudflare Pages Function: /webhooks/youtube.js
 * Handles YouTube WebSub (PubSubHubbub) push notifications for new uploads.
 *
 * YouTube sends a GET for verification and POST for new video notifications.
 */
 
function parseAtomFeed(xmlText) {
  // Quick and dirty XML field extraction
  const get = (tag) => {
    const match = xmlText.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
    return match ? match[1].trim() : null;
  };
  const getAttr = (tag, attr) => {
    const match = xmlText.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`));
    return match ? match[1] : null;
  };
 
  return {
    videoId:     get('yt:videoId'),
    channelId:   get('yt:channelId'),
    title:       get('title'),
    link:        getAttr('link', 'href'),
    author:      get('name'),
    published:   get('published'),
  };
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
 
  // Verification challenge (GET)
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const challenge = url.searchParams.get('hub.challenge');
    const mode      = url.searchParams.get('hub.mode');
 
    if (mode === 'subscribe' && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Bad request', { status: 400 });
  }
 
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
 
  const body = await request.text();
  const video = parseAtomFeed(body);
 
  if (!video.videoId || !video.channelId) {
    return new Response('OK', { status: 200 });
  }
 
  // Find all alerts for this YouTube channel
  const { results } = await env.DB.prepare(
    `SELECT sa.discord_webhook_url, sa.custom_message, sa.include_preview, sa.last_post_id
     FROM social_alerts sa
     WHERE sa.platform = 'youtube' AND sa.target_id = ? AND sa.enabled = 1`
  ).bind(video.channelId).all();
 
  for (const alert of results || []) {
    if (!alert.discord_webhook_url) continue;
    if (alert.last_post_id === video.videoId) continue; // deduplicate
 
    const thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`;
 
    const embed = {
      title: `📹 ${video.author || 'New Video'} just uploaded!`,
      description: alert.custom_message
        ? `${alert.custom_message}\n\n**${video.title}**`
        : `**${video.title}**`,
      color: 0xff0000, // YouTube red
      url: video.link || `https://youtube.com/watch?v=${video.videoId}`,
      image: alert.include_preview ? { url: thumbnailUrl } : undefined,
      fields: [{ name: 'Watch Now', value: `[youtube.com/watch?v=${video.videoId}](https://youtube.com/watch?v=${video.videoId})` }],
      timestamp: video.published || new Date().toISOString(),
      footer: { text: 'YouTube' },
    };
 
    await postToDiscord(alert.discord_webhook_url, embed);
 
    // Update last_post_id
    await env.DB.prepare(
      `UPDATE social_alerts SET last_post_id = ? WHERE platform = 'youtube' AND target_id = ?`
    ).bind(video.videoId, video.channelId).run();
  }
 
  return new Response('OK', { status: 200 });
}
