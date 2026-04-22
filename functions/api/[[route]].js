/**
 * Cloudflare Pages Function - /api/[[route]].js
 *
 * ENV VARS needed in wrangler.toml / Cloudflare dashboard:
 *   API_SECRET          - bot-to-dashboard shared secret
 *   DISCORD_CLIENT_ID   - from Discord Developer Portal
 *   DISCORD_CLIENT_SECRET
 *   SITE_URL            - e.g. https://yoursite.pages.dev
 *   SESSION_SECRET      - any random string for signing sessions
 */
 
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
 
const DISCORD_API = 'https://discord.com/api/v10';
 
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function err(msg, status = 400) { return json({ error: msg }, status); }
 
// ── AUTH HELPERS ──
function isBotRequest(request, env) {
  return request.headers.get('Authorization') === `Bearer ${env.API_SECRET}`;
}
 
async function getSession(request, env) {
  const token = request.headers.get('X-Session-Token') ||
    new URL(request.url).searchParams.get('session');
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`
  ).bind(token).first();
  if (!row) return null;
  const user = await env.DB.prepare(
    `SELECT * FROM users WHERE discord_id = ?`
  ).bind(row.discord_id).first();
  return user ? { ...user, session_token: token } : null;
}
 
async function requireAuth(request, env) {
  if (isBotRequest(request, env)) return { bot: true };
  const session = await getSession(request, env);
  if (!session) return null;
  return session;
}
 
async function userOwnsGuild(discord_id, guild_id, env, request) {
  // Check if the guild exists in our DB (bot is in it)
  const guild = await env.DB.prepare(
    `SELECT * FROM guilds WHERE guild_id = ?`
  ).bind(guild_id).first();
  if (!guild) return false;
 
  // Owner always has access
  if (guild.owner_id === discord_id) return true;
 
  // Otherwise check their Discord guilds via access token
  const sessionRow = await env.DB.prepare(
    `SELECT discord_access_token FROM sessions WHERE token = ?`
  ).bind(request.headers.get('X-Session-Token') || '').first();
 
  const accessToken = sessionRow?.discord_access_token || '';
  if (!accessToken) return false;
 
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return false;
    const guilds = await res.json();
    const ADMIN_PERM = BigInt(0x8);
    return guilds.some(g => g.id === guild_id && (BigInt(g.permissions || 0) & ADMIN_PERM) === ADMIN_PERM);
  } catch(e) {
    return false;
  }
}
 
function randomToken(len = 48) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}
 
// ── ROUTER ──
export async function onRequest(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const path   = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const method = request.method.toUpperCase();
 
  if (method === 'OPTIONS') return new Response(null, { headers: CORS });
 
  // ── AUTH ROUTES (no session required) ──
  if (path === 'auth/login'          && method === 'GET')  return authLogin(env, url);
  if (path === 'auth/callback'       && method === 'GET')  return authCallback(env, url);
  if (path === 'auth/logout'         && method === 'POST') return authLogout(request, env);
  if (path === 'auth/me'             && method === 'GET')  return authMe(request, env);
 
  // ── CLIENT AUTH (no session required) ──
  if (path === 'auth/client-signup'  && method === 'POST') return clientSignup(env, request);
  if (path === 'auth/client-signin'  && method === 'POST') return clientSignin(env, request);
  if (path === 'auth/client-signout' && method === 'POST') return clientSignout(request, env);
  if (path === 'auth/client-me'      && method === 'GET')  return clientMe(request, env);
 
  // ── PUBLIC ROUTES (no auth required) ──
  if (path === 'theme'               && method === 'GET')  return getTheme(env);
  if (path === 'portfolio'           && method === 'GET')  return getPortfolio(env, url);
  if (path === 'lore'                && method === 'GET')  return getLore(env);
  if (path === 'commissions'         && method === 'GET')  return getCommissions(env);
  if (path === 'content'             && method === 'GET')  return getSiteContent(env);
 
 
 
  // ── PORTFOLIO ──
  if (path === 'portfolio'              && method === 'GET')    return getPortfolio(env, url);
  if (path === 'portfolio'              && method === 'POST')   return postPortfolio(env, request);
  if (path === 'portfolio'              && method === 'PUT')    return putPortfolio(env, request);
  if (path === 'portfolio'              && method === 'DELETE') return deletePortfolio(env, url);
  // ── LORE ──
  if (path === 'lore'                   && method === 'GET')    return getLore(env);
  if (path === 'lore'                   && method === 'POST')   return postLore(env, request);
  if (path === 'lore'                   && method === 'PUT')    return putLore(env, request);
  if (path === 'lore'                   && method === 'DELETE') return deleteLore(env, url);
  // ── COMMISSIONS ──
  if (path === 'commissions'            && method === 'GET')    return getCommissions(env);
  if (path === 'commissions'            && method === 'POST')   return postCommission(env, request);
  if (path === 'commissions'            && method === 'PUT')    return putCommission(env, request);
  if (path === 'commissions'            && method === 'DELETE') return deleteCommission(env, url);
  if (path === 'commissions/status'     && method === 'PUT')    return updateCommissionStatus(env, request);
  // ── SITE CONTENT ──
  if (path === 'content'                && method === 'GET')    return getSiteContent(env);
  if (path === 'content'                && method === 'POST')   return postSiteContent(env, request);
 
  // ── CLIENT AUTH ──
  if (path === 'auth/client-signup'  && method === 'POST') return clientSignup(env, request);
  if (path === 'auth/client-signin'  && method === 'POST') return clientSignin(env, request);
  if (path === 'auth/client-signout' && method === 'POST') return clientSignout(request, env);
  if (path === 'auth/client-me'      && method === 'GET')  return clientMe(request, env);
  // ── CLIENT PORTAL ──
  if (path === 'portal/inquiries'    && method === 'GET')  return portalInquiries(request, env);
  if (path === 'portal/messages'     && method === 'GET')  return portalGetMessages(request, env);
  if (path === 'portal/messages'     && method === 'POST') return portalSendMessage(request, env);
  if (path === 'portal/files'        && method === 'GET')  return portalGetFiles(request, env);
  if (path === 'portal/files'        && method === 'POST') return portalAddFile(request, env);
  if (path === 'portal/files'        && method === 'DELETE') return portalDeleteFile(env, url);
  if (path === 'portal/status'       && method === 'PUT')  return updateProjectStatus(request, env);
  if (path === 'portal/admin-inquiries' && method === 'GET') return adminInquiries(request, env);
 
  // ── PORTFOLIO ──
  if (path === 'portfolio'          && method === 'GET')    return getPortfolio(env, url);
  if (path === 'portfolio'          && method === 'POST')   return postPortfolio(env, request);
  if (path === 'portfolio'          && method === 'PUT')    return putPortfolio(env, request);
  if (path === 'portfolio'          && method === 'DELETE') return deletePortfolio(env, url);
  // ── LORE ──
  if (path === 'lore'               && method === 'GET')    return getLore(env);
  if (path === 'lore'               && method === 'POST')   return postLore(env, request);
  if (path === 'lore'               && method === 'PUT')    return putLore(env, request);
  if (path === 'lore'               && method === 'DELETE') return deleteLore(env, url);
  // ── COMMISSIONS CMS ──
  if (path === 'commissions'        && method === 'GET')    return getCommissions(env);
  if (path === 'commissions'        && method === 'POST')   return postCommission(env, request);
  if (path === 'commissions'        && method === 'PUT')    return putCommission(env, request);
  if (path === 'commissions'        && method === 'DELETE') return deleteCommission(env, url);
  if (path === 'commissions/status' && method === 'PUT')    return updateCommissionStatus(env, request);
  // ── SITE CONTENT ──
  if (path === 'content'            && method === 'GET')    return getSiteContent(env);
  if (path === 'content'            && method === 'POST')   return postSiteContent(env, request);
 
  // ── GUILD REGISTRATION (bot posts this when joining a server) ──
  if (path === 'guilds/register' && method === 'POST') {
    if (!isBotRequest(request, env)) return err('Unauthorized', 401);
    return registerGuild(request, env);
  }
 
  // ── ALL OTHER ROUTES REQUIRE AUTH ──
  const auth = await requireAuth(request, env);
  if (!auth) return err('Unauthorized', 401);
 
  // Guild-scoped permission check for non-bot requests
  const guild_id = url.searchParams.get('guild_id') ||
    (method !== 'GET' ? (await request.clone().json().catch(() => ({}))).guild_id : null);
 
  if (!auth.bot && guild_id) {
    const owns = await userOwnsGuild(auth.discord_id, guild_id, env, request);
    if (!owns) return err('Forbidden: you do not manage this guild', 403);
  }
 
  // ── ROUTE TABLE ──
  if (path === 'guilds'              && method === 'GET')    return getUserGuilds(auth, env, request);
  if (path === 'dei-config'          && method === 'GET')    return getDeiConfig(env, url);
  if (path === 'dei-config'          && method === 'POST')   return postDeiConfig(env, request);
  if (path === 'responses'           && method === 'GET')    return getResponses(env, url);
  if (path === 'responses'           && method === 'POST')   return postResponse(env, request);
  if (path === 'responses'           && method === 'PUT')    return putResponse(env, request);
  if (path === 'responses'           && method === 'DELETE') return deleteResponse(env, url);
  if (path === 'logs'                && method === 'GET')    return getLogs(env, url);
  if (path === 'logs'                && method === 'POST')   return postLog(env, request);
  if (path === 'stats'               && method === 'GET')    return getStats(env, url);
  if (path === 'stats'               && method === 'POST')   return postStats(env, request);
  if (path === 'channels'            && method === 'GET')    return getChannels(env, url);
  if (path === 'channels'            && method === 'POST')   return postChannels(env, request);
  if (path === 'warnings'            && method === 'GET')    return getWarnings(env, url);
  if (path === 'warnings'            && method === 'POST')   return postWarning(env, request);
  if (path === 'warnings/clear'      && method === 'POST')   return clearWarnings(env, request);
  if (path === 'reaction-roles'      && method === 'GET')    return getReactionRoles(env, url);
  if (path === 'reaction-roles'      && method === 'POST')   return postReactionRole(env, request);
  if (path === 'reaction-roles'      && method === 'DELETE') return deleteReactionRole(env, url);
  if (path === 'filters'             && method === 'GET')    return getFilters(env, url);
  if (path === 'filters'             && method === 'POST')   return postFilter(env, request);
  if (path === 'filters'             && method === 'DELETE') return deleteFilter(env, url);
  if (path === 'embeds'              && method === 'GET')    return getEmbeds(env, url);
  if (path === 'embeds'              && method === 'POST')   return postEmbed(env, request);
  if (path === 'embeds'              && method === 'DELETE') return deleteEmbed(env, url);
  if (path === 'birthdays'           && method === 'GET')    return getBirthdays(env, url);
  if (path === 'birthdays'           && method === 'GET')    return getBirthdays(env, url);
  if (path === 'birthdays'           && method === 'POST')   return postBirthday(env, request);
  if (path === 'theme'               && method === 'GET')    return getTheme(env);
  if (path === 'theme'               && method === 'POST')   return postTheme(env, request);
  if (path === 'level-config'        && method === 'GET')    return getLevelConfig(env, url);
  if (path === 'level-config'        && method === 'POST')   return postLevelConfig(env, request);
  if (path === 'level-roles'         && method === 'POST')   return postLevelRole(env, request);
  if (path === 'level-roles'         && method === 'DELETE') return deleteLevelRole(env, url);
  if (path === 'giveaways'           && method === 'GET')    return getGiveaways(env, url);
  if (path === 'giveaways'           && method === 'POST')   return postGiveaway(env, request);
  if (path === 'giveaways'           && method === 'DELETE') return deleteGiveaway(env, url);
  if (path === 'announcements'       && method === 'GET')    return getAnnouncements(env, url);
  if (path === 'announcements'       && method === 'POST')   return postAnnouncement(env, request);
  if (path === 'announcements'       && method === 'DELETE') return deleteAnnouncement(env, url);
  if (path === 'social-alerts'       && method === 'GET')    return getSocialAlerts(env, url);
  if (path === 'social-alerts'       && method === 'POST')   return postSocialAlert(env, request);
  if (path === 'social-alerts'       && method === 'PUT')    return putSocialAlert(env, request);
  if (path === 'social-alerts'       && method === 'DELETE') return deleteSocialAlert(env, url);
  if (path === 'social-alerts/subscribe-youtube' && method === 'POST') return subscribeYoutube(env, request);
  if (path === 'social-alerts/subscribe-twitch'  && method === 'POST') return subscribeTwitch(env, request);
 
  return err('Not found', 404);
}
 
// ── DISCORD OAUTH ──
async function authLogin(env, url) {
  const redirect = `${env.SITE_URL}/api/auth/callback`;
  const params   = new URLSearchParams({
    client_id:     env.DISCORD_CLIENT_ID,
    redirect_uri:  redirect,
    response_type: 'code',
    scope:         'identify guilds',
  });
  return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
}
 
async function authCallback(env, url) {
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(`${env.SITE_URL}/login?error=no_code`, 302);
 
  const redirect = `${env.SITE_URL}/api/auth/callback`;
 
  // Exchange code for token
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirect,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return Response.redirect(`${env.SITE_URL}/login?error=token_fail`, 302);
 
  // Fetch Discord user
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const discordUser = await userRes.json();
 
  // Upsert user in DB
  await env.DB.prepare(
    `INSERT INTO users (discord_id, username, avatar)
     VALUES (?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       username = excluded.username,
       avatar   = excluded.avatar`
  ).bind(discordUser.id, discordUser.username, discordUser.avatar || '').run();
 
  // Create session (7 day expiry) - store Discord access token too
  const token   = randomToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  // Add discord_access_token column if schema supports it (safe to ignore error)
  try {
    await env.DB.prepare(`ALTER TABLE sessions ADD COLUMN discord_access_token TEXT`).run();
  } catch(e) {}
  await env.DB.prepare(
    `INSERT INTO sessions (token, discord_id, expires_at, discord_access_token) VALUES (?, ?, ?, ?)`
  ).bind(token, discordUser.id, expires, tokenData.access_token || '').run();
 
  // Redirect to dashboard with session token
  return Response.redirect(`${env.SITE_URL}/admin?session=${token}`, 302);
}
 
async function authLogout(request, env) {
  const session = await getSession(request, env);
  if (session) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(session.session_token).run();
  }
  return json({ ok: true });
}
 
async function authMe(request, env) {
  const session = await getSession(request, env);
  if (!session) return err('Not logged in', 401);
  return json({
    discord_id: session.discord_id,
    username:   session.username,
    avatar:     session.avatar,
  });
}
 
// ── GUILDS ──
async function registerGuild(request, env) {
  const { guild_id, guild_name, guild_icon, owner_id } = await request.json();
  if (!guild_id) return err('guild_id required');
  await env.DB.prepare(
    `INSERT INTO guilds (guild_id, guild_name, guild_icon, owner_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET
       guild_name = excluded.guild_name,
       guild_icon = excluded.guild_icon,
       owner_id   = excluded.owner_id`
  ).bind(guild_id, guild_name || '', guild_icon || '', owner_id || '').run();
  return json({ ok: true });
}
 
async function getUserGuilds(auth, env, request) {
  // Get the user's Discord access token from session
  const sessionRow = await env.DB.prepare(
    `SELECT discord_access_token FROM sessions WHERE token = ?`
  ).bind(request.headers.get('X-Session-Token') || '').first();
 
  const accessToken = sessionRow?.discord_access_token || '';
  let discordGuilds = [];
 
  // Fetch user's guilds from Discord API using their access token
  if (accessToken) {
    try {
      const dgRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (dgRes.ok) {
        const all = await dgRes.json();
        // Filter to guilds where user has Administrator permission (bit 0x8)
        const ADMIN_PERM = BigInt(0x8);
        discordGuilds = all.filter(g => (BigInt(g.permissions || 0) & ADMIN_PERM) === ADMIN_PERM)
                           .map(g => g.id);
      }
    } catch(e) {
      console.error('Discord guild fetch error:', e);
    }
  }
 
  // If we couldn't get Discord guilds, fall back to guilds registered by this user
  let query, params;
  if (discordGuilds.length > 0) {
    // Get guilds that: (1) bot is in, AND (2) user has admin permission
    const placeholders = discordGuilds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT g.*, dc.name as dei_name FROM guilds g
       LEFT JOIN dei_config dc ON dc.guild_id = g.guild_id
       WHERE g.guild_id IN (${placeholders})
       ORDER BY g.registered_at DESC`
    ).bind(...discordGuilds).all();
    return json({ guilds: results || [] });
  } else {
    // Fallback: show guilds they own
    const { results } = await env.DB.prepare(
      `SELECT g.*, dc.name as dei_name FROM guilds g
       LEFT JOIN dei_config dc ON dc.guild_id = g.guild_id
       WHERE g.owner_id = ?
       ORDER BY g.registered_at DESC`
    ).bind(auth.discord_id).all();
    return json({ guilds: results || [] });
  }
}
 
// ── DEI CONFIG ──
async function getDeiConfig(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const row = await env.DB.prepare(`SELECT * FROM dei_config WHERE guild_id = ?`).bind(guild_id).first();
  return json(row || { guild_id, name:'Dei', full_name:'Deivon Talvyrvei', avatar_url:'', color:'c4b0f5', bio:'An alien woman living on Earth, doing her best.', personality_notes:'', response_style:'default' });
}
 
async function postDeiConfig(env, request) {
  const { guild_id, name, full_name, avatar_url, color, bio, personality_notes, response_style } = await request.json();
  if (!guild_id) return err('guild_id required');
  await env.DB.prepare(
    `INSERT INTO dei_config (guild_id, name, full_name, avatar_url, color, bio, personality_notes, response_style)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET
       name=excluded.name, full_name=excluded.full_name, avatar_url=excluded.avatar_url,
       color=excluded.color, bio=excluded.bio, personality_notes=excluded.personality_notes,
       response_style=excluded.response_style, updated_at=datetime('now')`
  ).bind(guild_id, name||'Dei', full_name||'Deivon Talvyrvei', avatar_url||'', color||'c4b0f5', bio||'', personality_notes||'', response_style||'default').run();
  return json({ ok: true });
}
 
// ── RESPONSE RULES ──
async function getResponses(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const { results } = await env.DB.prepare(
    `SELECT * FROM response_rules WHERE guild_id = ? ORDER BY category, created_at DESC`
  ).bind(guild_id).all();
  return json({
    rules: results.map(r => ({
      ...r,
      keywords:  JSON.parse(r.keywords  || '[]'),
      responses: JSON.parse(r.responses || '[]'),
    }))
  });
}
 
async function postResponse(env, request) {
  const { guild_id, category, keywords, responses, is_vent, created_by } = await request.json();
  if (!guild_id || !keywords?.length || !responses?.length) return err('guild_id, keywords, responses required');
  await env.DB.prepare(
    `INSERT INTO response_rules (guild_id, category, keywords, responses, is_vent, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(guild_id, category||'general', JSON.stringify(keywords), JSON.stringify(responses), is_vent?1:0, created_by||null).run();
  return json({ ok: true });
}
 
async function putResponse(env, request) {
  const { id, category, keywords, responses, is_vent, enabled } = await request.json();
  if (!id) return err('id required');
  await env.DB.prepare(
    `UPDATE response_rules SET category=?, keywords=?, responses=?, is_vent=?, enabled=? WHERE id=?`
  ).bind(category||'general', JSON.stringify(keywords||[]), JSON.stringify(responses||[]), is_vent?1:0, enabled!==false?1:0, id).run();
  return json({ ok: true });
}
 
async function deleteResponse(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM response_rules WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
// ── MOD LOGS ──
async function getLogs(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  const limit    = parseInt(url.searchParams.get('limit')||'50');
  if (!guild_id) return err('guild_id required');
  const { results } = await env.DB.prepare(
    `SELECT * FROM mod_logs WHERE guild_id=? ORDER BY created_at DESC LIMIT ?`
  ).bind(guild_id, limit).all();
  return json({ logs: results });
}
 
async function postLog(env, request) {
  const { guild_id, action, moderator, target, reason } = await request.json();
  if (!guild_id||!action||!moderator) return err('guild_id, action, moderator required');
  await env.DB.prepare(
    `INSERT INTO mod_logs (guild_id, action, moderator, target, reason) VALUES (?,?,?,?,?)`
  ).bind(guild_id, action, moderator, target||null, reason||null).run();
  await env.DB.prepare(
    `INSERT INTO server_stats (guild_id, actions_today) VALUES (?,1)
     ON CONFLICT(guild_id) DO UPDATE SET actions_today=actions_today+1, updated_at=datetime('now')`
  ).bind(guild_id).run();
  return json({ ok: true });
}
 
// ── STATS ──
async function getStats(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const row       = await env.DB.prepare(`SELECT * FROM server_stats WHERE guild_id=?`).bind(guild_id).first();
  const warn_count= await env.DB.prepare(`SELECT COUNT(*) as count FROM warnings WHERE guild_id=?`).bind(guild_id).first();
  const log_count = await env.DB.prepare(`SELECT COUNT(*) as count FROM mod_logs WHERE guild_id=?`).bind(guild_id).first();
  return json({ member_count:row?.member_count||0, messages_today:row?.messages_today||0, actions_today:row?.actions_today||0, total_warnings:warn_count?.count||0, total_logs:log_count?.count||0 });
}
 
async function postStats(env, request) {
  const { guild_id, member_count, messages_today } = await request.json();
  if (!guild_id) return err('guild_id required');
  await env.DB.prepare(
    `INSERT INTO server_stats (guild_id, member_count, messages_today)
     VALUES (?,?,?)
     ON CONFLICT(guild_id) DO UPDATE SET member_count=excluded.member_count, messages_today=excluded.messages_today, updated_at=datetime('now')`
  ).bind(guild_id, member_count||0, messages_today||0).run();
  return json({ ok: true });
}
 
// ── CHANNELS ──
async function getChannels(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const row = await env.DB.prepare(`SELECT * FROM channel_config WHERE guild_id=?`).bind(guild_id).first();
  if (!row) return json({ guild_id, log_channel:null, welcome_channel:null, birthday_channel:null, vent_channels:[], active_channels:[] });
  return json({ ...row, vent_channels:JSON.parse(row.vent_channels||'[]'), active_channels:JSON.parse(row.active_channels||'[]') });
}
 
async function postChannels(env, request) {
  const body = await request.json();
  const { guild_id } = body;
  if (!guild_id) return err('guild_id required');
  await env.DB.prepare(
    `INSERT INTO channel_config (guild_id, log_channel, welcome_channel, birthday_channel, vent_channels, active_channels)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(guild_id) DO UPDATE SET
       log_channel=excluded.log_channel, welcome_channel=excluded.welcome_channel,
       birthday_channel=excluded.birthday_channel, vent_channels=excluded.vent_channels,
       active_channels=excluded.active_channels`
  ).bind(guild_id, body.log_channel||null, body.welcome_channel||null, body.birthday_channel||null,
    JSON.stringify(body.vent_channels||[]), JSON.stringify(body.active_channels||[])).run();
  return json({ ok: true });
}
 
// ── WARNINGS ──
async function getWarnings(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  const user_id  = url.searchParams.get('user_id');
  if (!guild_id) return err('guild_id required');
  const stmt = user_id
    ? env.DB.prepare(`SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY created_at DESC`).bind(guild_id, user_id)
    : env.DB.prepare(`SELECT * FROM warnings WHERE guild_id=? ORDER BY created_at DESC LIMIT 100`).bind(guild_id);
  const { results } = await stmt.all();
  return json({ warnings: results });
}
 
async function postWarning(env, request) {
  const { guild_id, user_id, username, reason, moderator } = await request.json();
  if (!guild_id||!user_id||!reason) return err('guild_id, user_id, reason required');
  await env.DB.prepare(`INSERT INTO warnings (guild_id, user_id, username, reason, moderator) VALUES (?,?,?,?,?)`).bind(guild_id, user_id, username||null, reason, moderator||null).run();
  return json({ ok: true });
}
 
async function clearWarnings(env, request) {
  const { guild_id, user_id } = await request.json();
  if (!guild_id||!user_id) return err('guild_id and user_id required');
  await env.DB.prepare(`DELETE FROM warnings WHERE guild_id=? AND user_id=?`).bind(guild_id, user_id).run();
  return json({ ok: true });
}
 
// ── REACTION ROLES ──
async function getReactionRoles(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const { results } = await env.DB.prepare(`SELECT * FROM reaction_roles WHERE guild_id=? ORDER BY created_at DESC`).bind(guild_id).all();
  return json({ reaction_roles: results });
}
 
async function postReactionRole(env, request) {
  const { guild_id, message_id, emoji, role_id, role_name } = await request.json();
  if (!guild_id||!message_id||!emoji||!role_id) return err('guild_id, message_id, emoji, role_id required');
  await env.DB.prepare(`INSERT INTO reaction_roles (guild_id, message_id, emoji, role_id, role_name) VALUES (?,?,?,?,?)`).bind(guild_id, message_id, emoji, role_id, role_name||null).run();
  return json({ ok: true });
}
 
async function deleteReactionRole(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM reaction_roles WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
// ── FILTERS ──
async function getFilters(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const { results } = await env.DB.prepare(`SELECT * FROM filter_overrides WHERE guild_id=? ORDER BY category, keyword`).bind(guild_id).all();
  return json({ filters: results });
}
 
async function postFilter(env, request) {
  const { guild_id, category, keyword, added_by } = await request.json();
  if (!guild_id||!category||!keyword) return err('guild_id, category, keyword required');
  await env.DB.prepare(`INSERT INTO filter_overrides (guild_id, category, keyword, added_by) VALUES (?,?,?,?)`).bind(guild_id, category, keyword.toLowerCase(), added_by||null).run();
  return json({ ok: true });
}
 
async function deleteFilter(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM filter_overrides WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
// ── EMBEDS ──
async function getEmbeds(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const { results } = await env.DB.prepare(`SELECT * FROM embeds WHERE guild_id=? ORDER BY created_at DESC`).bind(guild_id).all();
  return json({ embeds: results });
}
 
async function postEmbed(env, request) {
  const { guild_id, name, title, description, color, footer, created_by } = await request.json();
  if (!guild_id||!name) return err('guild_id and name required');
  await env.DB.prepare(`INSERT INTO embeds (guild_id, name, title, description, color, footer, created_by) VALUES (?,?,?,?,?,?,?)`).bind(guild_id, name, title||null, description||null, color||'blurple', footer||null, created_by||null).run();
  return json({ ok: true });
}
 
async function deleteEmbed(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM embeds WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
// ── BIRTHDAYS ──
async function getBirthdays(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return err('guild_id required');
  const { results } = await env.DB.prepare(`SELECT * FROM birthdays WHERE guild_id=? ORDER BY month, day`).bind(guild_id).all();
  return json({ birthdays: results });
}
 
async function postBirthday(env, request) {
  const { guild_id, user_id, username, month, day } = await request.json();
  if (!guild_id||!user_id||!month||!day) return err('guild_id, user_id, month, day required');
  await env.DB.prepare(
    `INSERT INTO birthdays (guild_id, user_id, username, month, day) VALUES (?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET month=excluded.month, day=excluded.day, username=excluded.username`
  ).bind(guild_id, user_id, username||null, month, day).run();
  return json({ ok: true });
}
 
// ─────────────────────────────────────────────
// SITE THEME (appended)
// ─────────────────────────────────────────────
// These are appended - add these route checks to the router above manually,
// or the full route file handles them via the catch-all below.
 
async function getTheme(env) {
  const { results } = await env.DB.prepare(`SELECT key, value FROM site_theme`).all();
  const theme = {};
  (results||[]).forEach(r => theme[r.key] = r.value);
  return json(theme);
}
 
async function postTheme(env, request) {
  const body = await request.json();
  const stmt = env.DB.prepare(`INSERT INTO site_theme (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`);
  const batch = Object.entries(body).map(([k,v]) => stmt.bind(k, v));
  await env.DB.batch(batch);
  return json({ ok: true });
}
 
async function getLevelConfig(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return json({ enabled:1, xp_per_msg:15, xp_cooldown:60, announce_channel:'', announce_msg:'Congratulations {user}, you reached level {level}!', roles:[] });
  const row = await env.DB.prepare(`SELECT * FROM level_config WHERE guild_id=?`).bind(guild_id).first();
  const { results: roles } = await env.DB.prepare(`SELECT * FROM level_roles WHERE guild_id=? ORDER BY level ASC`).bind(guild_id).all();
  return json({ ...(row||{enabled:1,xp_per_msg:15,xp_cooldown:60}), roles: roles||[] });
}
 
async function postLevelConfig(env, request) {
  const { guild_id, enabled, xp_per_msg, xp_cooldown, announce_channel, announce_msg } = await request.json();
  if (!guild_id) return json({ error:'guild_id required' }, 400);
  await env.DB.prepare(
    `INSERT INTO level_config (guild_id, enabled, xp_per_msg, xp_cooldown, announce_channel, announce_msg)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled, xp_per_msg=excluded.xp_per_msg,
     xp_cooldown=excluded.xp_cooldown, announce_channel=excluded.announce_channel,
     announce_msg=excluded.announce_msg, updated_at=datetime('now')`
  ).bind(guild_id, enabled?1:0, xp_per_msg||15, xp_cooldown||60, announce_channel||null, announce_msg||'Congratulations {user}, you reached level {level}!').run();
  return json({ ok: true });
}
 
async function postLevelRole(env, request) {
  const { guild_id, level, role_id, role_name } = await request.json();
  if (!guild_id||!level||!role_id) return json({ error:'guild_id, level, role_id required' }, 400);
  await env.DB.prepare(`INSERT INTO level_roles (guild_id, level, role_id, role_name) VALUES (?,?,?,?)`).bind(guild_id, level, role_id, role_name||null).run();
  return json({ ok: true });
}
 
async function deleteLevelRole(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error:'id required' }, 400);
  await env.DB.prepare(`DELETE FROM level_roles WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
async function getGiveaways(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return json({ error:'guild_id required' }, 400);
  const { results } = await env.DB.prepare(`SELECT * FROM giveaways WHERE guild_id=? ORDER BY created_at DESC LIMIT 50`).bind(guild_id).all();
  return json({ giveaways: results||[] });
}
 
async function postGiveaway(env, request) {
  const { guild_id, channel_id, prize, winners, ends_at, host } = await request.json();
  if (!guild_id||!channel_id||!prize||!ends_at) return json({ error:'guild_id, channel_id, prize, ends_at required' }, 400);
  const result = await env.DB.prepare(`INSERT INTO giveaways (guild_id, channel_id, prize, winners, ends_at, host) VALUES (?,?,?,?,?,?)`).bind(guild_id, channel_id, prize, winners||1, ends_at, host||null).run();
  return json({ ok: true, id: result.meta?.last_row_id });
}
 
async function deleteGiveaway(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error:'id required' }, 400);
  await env.DB.prepare(`UPDATE giveaways SET status='cancelled' WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
async function getAnnouncements(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  if (!guild_id) return json({ error:'guild_id required' }, 400);
  const { results } = await env.DB.prepare(`SELECT * FROM announcements WHERE guild_id=? ORDER BY created_at DESC LIMIT 50`).bind(guild_id).all();
  return json({ announcements: results||[] });
}
 
async function postAnnouncement(env, request) {
  const { guild_id, channel_id, title, content, color, ping_everyone, scheduled_at } = await request.json();
  if (!guild_id||!channel_id||!content) return json({ error:'guild_id, channel_id, content required' }, 400);
  await env.DB.prepare(`INSERT INTO announcements (guild_id, channel_id, title, content, color, ping_everyone, scheduled_at, status) VALUES (?,?,?,?,?,?,?,?)`).bind(guild_id, channel_id, title||null, content, color||'lavender', ping_everyone?1:0, scheduled_at||null, scheduled_at?'scheduled':'draft').run();
  return json({ ok: true });
}
 
async function deleteAnnouncement(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error:'id required' }, 400);
  await env.DB.prepare(`DELETE FROM announcements WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
// ── SOCIAL ALERTS ──
async function getSocialAlerts(env, url) {
  const guild_id = url.searchParams.get('guild_id');
  const platform = url.searchParams.get('platform');
  if (!guild_id) return json({ error:'guild_id required' }, 400);
  const stmt = platform
    ? env.DB.prepare(`SELECT * FROM social_alerts WHERE guild_id=? AND platform=? ORDER BY platform, created_at DESC`).bind(guild_id, platform)
    : env.DB.prepare(`SELECT * FROM social_alerts WHERE guild_id=? ORDER BY platform, created_at DESC`).bind(guild_id);
  const { results } = await stmt.all();
  return json({ alerts: results||[] });
}
 
async function postSocialAlert(env, request) {
  const { guild_id, platform, target_username, target_id, discord_channel_id, discord_webhook_url, custom_message, include_preview } = await request.json();
  if (!guild_id||!platform||!discord_channel_id) return json({ error:'guild_id, platform, discord_channel_id required' }, 400);
  const result = await env.DB.prepare(
    `INSERT INTO social_alerts (guild_id, platform, target_username, target_id, discord_channel_id, discord_webhook_url, custom_message, include_preview)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(guild_id, platform, target_username||null, target_id||null, discord_channel_id, discord_webhook_url||null, custom_message||null, include_preview!==false?1:0).run();
  return json({ ok:true, id: result.meta?.last_row_id });
}
 
async function putSocialAlert(env, request) {
  const { id, target_username, target_id, discord_channel_id, discord_webhook_url, custom_message, include_preview, enabled } = await request.json();
  if (!id) return json({ error:'id required' }, 400);
  await env.DB.prepare(
    `UPDATE social_alerts SET target_username=?, target_id=?, discord_channel_id=?, discord_webhook_url=?, custom_message=?, include_preview=?, enabled=? WHERE id=?`
  ).bind(target_username||null, target_id||null, discord_channel_id, discord_webhook_url||null, custom_message||null, include_preview!==false?1:0, enabled!==false?1:0, id).run();
  return json({ ok:true });
}
 
async function deleteSocialAlert(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error:'id required' }, 400);
  await env.DB.prepare(`DELETE FROM social_alerts WHERE id=?`).bind(id).run();
  return json({ ok:true });
}
 
// Subscribe to YouTube WebSub for a channel
async function subscribeYoutube(env, request) {
  const { channel_id } = await request.json();
  if (!channel_id) return json({ error:'channel_id required' }, 400);
  const hub = 'https://pubsubhubbub.appspot.com/subscribe';
  const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channel_id}`;
  const callback = `${env.SITE_URL}/webhooks/youtube`;
  const body = new URLSearchParams({ 'hub.mode':'subscribe', 'hub.topic':topic, 'hub.callback':callback, 'hub.lease_seconds':'864000' });
  const res = await fetch(hub, { method:'POST', body, headers:{'Content-Type':'application/x-www-form-urlencoded'} });
  return json({ ok: res.status === 202, status: res.status });
}
 
// Subscribe to Twitch EventSub
async function subscribeTwitch(env, request) {
  const { broadcaster_id } = await request.json();
  if (!broadcaster_id) return json({ error:'broadcaster_id required' }, 400);
  if (!env.TWITCH_CLIENT_ID||!env.TWITCH_ACCESS_TOKEN) return json({ error:'TWITCH_CLIENT_ID and TWITCH_ACCESS_TOKEN env vars required' }, 500);
 
  const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: { 'Client-ID': env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${env.TWITCH_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'stream.online', version: '1',
      condition: { broadcaster_user_id: broadcaster_id },
      transport: { method: 'webhook', callback: `${env.SITE_URL}/webhooks/twitch`, secret: env.TWITCH_SECRET||'changeme' }
    })
  });
  const data = await res.json();
  return json({ ok: res.ok, data });
}
 
// ─────────────────────────────────────────────
// PASSWORD HASHING (Web Crypto API - works in Cloudflare Workers)
// ─────────────────────────────────────────────
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, key, 256);
  const toHex = arr => Array.from(new Uint8Array(arr)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return toHex(salt) + ':' + toHex(bits);
}
 
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b=>parseInt(b,16)));
  const enc  = new TextEncoder();
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, key, 256);
  const computed = Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return computed === hashHex;
}
 
async function getClientSession(request, env) {
  const token = request.headers.get('X-Client-Token') || new URL(request.url).searchParams.get('client_session');
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT cs.*, cu.name, cu.email FROM client_sessions cs
     JOIN client_users cu ON cu.id = cs.user_id
     WHERE cs.token = ? AND cs.expires_at > datetime('now')`
  ).bind(token).first();
  return row || null;
}
 
// ─────────────────────────────────────────────
// CLIENT AUTH
// ─────────────────────────────────────────────
async function clientSignup(env, request) {
  const { name, email, password } = await request.json();
  if (!name || !email || !password) return err('name, email, password required');
  if (password.length < 8) return err('Password must be at least 8 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Invalid email address');
 
  const existing = await env.DB.prepare(`SELECT id FROM client_users WHERE email=?`).bind(email.toLowerCase()).first();
  if (existing) return err('An account with that email already exists', 409);
 
  const hash = await hashPassword(password);
  const result = await env.DB.prepare(
    `INSERT INTO client_users (name, email, password_hash) VALUES (?,?,?)`
  ).bind(name.trim(), email.toLowerCase(), hash).run();
 
  const userId = result.meta?.last_row_id;
 
  // Link any existing inquiries with the same email
  await env.DB.prepare(
    `UPDATE inquiries SET client_user_id=? WHERE email=? AND client_user_id IS NULL`
  ).bind(userId, email.toLowerCase()).run();
 
  // Create session
  const token   = randomToken(56);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,19).replace('T',' ');
  await env.DB.prepare(`INSERT INTO client_sessions (token, user_id, expires_at) VALUES (?,?,?)`).bind(token, userId, expires).run();
 
  return json({ ok:true, token, name: name.trim(), email: email.toLowerCase() });
}
 
async function clientSignin(env, request) {
  const { email, password } = await request.json();
  if (!email || !password) return err('email and password required');
 
  const user = await env.DB.prepare(`SELECT * FROM client_users WHERE email=?`).bind(email.toLowerCase()).first();
  if (!user) return err('Invalid email or password', 401);
 
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return err('Invalid email or password', 401);
 
  const token   = randomToken(56);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,19).replace('T',' ');
  await env.DB.prepare(`INSERT INTO client_sessions (token, user_id, expires_at) VALUES (?,?,?)`).bind(token, user.id, expires).run();
 
  return json({ ok:true, token, name: user.name, email: user.email });
}
 
async function clientSignout(request, env) {
  const session = await getClientSession(request, env);
  if (session) await env.DB.prepare(`DELETE FROM client_sessions WHERE token=?`).bind(session.token).run();
  return json({ ok:true });
}
 
async function clientMe(request, env) {
  const session = await getClientSession(request, env);
  if (!session) return err('Not logged in', 401);
  return json({ id: session.user_id, name: session.name, email: session.email });
}
 
// ─────────────────────────────────────────────
// CLIENT PORTAL - INQUIRIES
// ─────────────────────────────────────────────
async function portalInquiries(request, env) {
  const session = await getClientSession(request, env);
  if (!session) return err('Not logged in', 401);
 
  const { results } = await env.DB.prepare(
    `SELECT inquiry_id, name, email, service_interest, project_status,
            budget_range, timeline, submitted_at, status
     FROM inquiries WHERE client_user_id=? ORDER BY submitted_at DESC`
  ).bind(session.user_id).all();
 
  // Count unread messages per inquiry
  const withUnread = await Promise.all((results||[]).map(async inq => {
    const unread = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM project_messages
       WHERE inquiry_id=? AND sender_type='admin' AND read=0`
    ).bind(inq.inquiry_id).first();
    return { ...inq, unread_messages: unread?.count || 0 };
  }));
 
  return json({ inquiries: withUnread });
}
 
// ─────────────────────────────────────────────
// CLIENT PORTAL - MESSAGES
// ─────────────────────────────────────────────
async function portalGetMessages(request, env) {
  const session    = await getClientSession(request, env);
  const isAdmin    = isBotRequest(request, env) || !!(await getSession(request, env));
  if (!session && !isAdmin) return err('Not logged in', 401);
 
  const url        = new URL(request.url);
  const inquiry_id = url.searchParams.get('inquiry_id');
  if (!inquiry_id) return err('inquiry_id required');
 
  // Clients can only see their own inquiry messages
  if (session && !isAdmin) {
    const inq = await env.DB.prepare(`SELECT inquiry_id FROM inquiries WHERE inquiry_id=? AND client_user_id=?`).bind(inquiry_id, session.user_id).first();
    if (!inq) return err('Forbidden', 403);
    // Mark admin messages as read
    await env.DB.prepare(`UPDATE project_messages SET read=1 WHERE inquiry_id=? AND sender_type='admin'`).bind(inquiry_id).run();
  }
 
  const { results } = await env.DB.prepare(
    `SELECT * FROM project_messages WHERE inquiry_id=? ORDER BY created_at ASC`
  ).bind(inquiry_id).all();
 
  return json({ messages: results||[] });
}
 
async function portalSendMessage(request, env) {
  const session    = await getClientSession(request, env);
  const adminSess  = await getSession(request, env);
  if (!session && !adminSess) return err('Not logged in', 401);
 
  const { inquiry_id, content } = await request.json();
  if (!inquiry_id || !content?.trim()) return err('inquiry_id and content required');
 
  const senderType = adminSess ? 'admin' : 'client';
  const senderName = adminSess ? 'Ajay' : session?.name || 'Client';
 
  // Clients can only message their own inquiries
  if (session && !adminSess) {
    const inq = await env.DB.prepare(`SELECT inquiry_id FROM inquiries WHERE inquiry_id=? AND client_user_id=?`).bind(inquiry_id, session.user_id).first();
    if (!inq) return err('Forbidden', 403);
  }
 
  await env.DB.prepare(
    `INSERT INTO project_messages (inquiry_id, sender_type, sender_name, content) VALUES (?,?,?,?)`
  ).bind(inquiry_id, senderType, senderName, content.trim()).run();
 
  return json({ ok:true });
}
 
// ─────────────────────────────────────────────
// CLIENT PORTAL - FILES
// ─────────────────────────────────────────────
async function portalGetFiles(request, env) {
  const session = await getClientSession(request, env);
  const isAdmin = isBotRequest(request, env) || !!(await getSession(request, env));
  if (!session && !isAdmin) return err('Not logged in', 401);
 
  const url        = new URL(request.url);
  const inquiry_id = url.searchParams.get('inquiry_id');
  if (!inquiry_id) return err('inquiry_id required');
 
  if (session && !isAdmin) {
    const inq = await env.DB.prepare(`SELECT inquiry_id FROM inquiries WHERE inquiry_id=? AND client_user_id=?`).bind(inquiry_id, session.user_id).first();
    if (!inq) return err('Forbidden', 403);
  }
 
  const { results } = await env.DB.prepare(
    `SELECT * FROM project_files WHERE inquiry_id=? ORDER BY created_at DESC`
  ).bind(inquiry_id).all();
 
  return json({ files: results||[] });
}
 
async function portalAddFile(request, env) {
  const adminSess = await getSession(request, env);
  if (!adminSess) return err('Admin only', 403);
 
  const { inquiry_id, name, url, file_type } = await request.json();
  if (!inquiry_id || !name || !url) return err('inquiry_id, name, url required');
 
  await env.DB.prepare(
    `INSERT INTO project_files (inquiry_id, name, url, file_type, uploaded_by) VALUES (?,?,?,?,?)`
  ).bind(inquiry_id, name, url, file_type||'deliverable', adminSess.username||'Ajay').run();
 
  return json({ ok:true });
}
 
async function portalDeleteFile(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM project_files WHERE id=?`).bind(id).run();
  return json({ ok:true });
}
 
// ─────────────────────────────────────────────
// PROJECT STATUS UPDATE (admin only)
// ─────────────────────────────────────────────
async function updateProjectStatus(request, env) {
  const adminSess = await getSession(request, env);
  if (!adminSess) return err('Admin only', 403);
  const { inquiry_id, status } = await request.json();
  if (!inquiry_id || !status) return err('inquiry_id and status required');
  const allowed = ['inquiry','in_review','in_progress','revisions','complete','archived'];
  if (!allowed.includes(status)) return err('Invalid status');
  await env.DB.prepare(`UPDATE inquiries SET project_status=? WHERE inquiry_id=?`).bind(status, inquiry_id).run();
  return json({ ok:true });
}
 
// Admin: get all inquiries with client info
async function adminInquiries(request, env) {
  const adminSess = await getSession(request, env);
  if (!adminSess) return err('Admin only', 403);
  const { results } = await env.DB.prepare(
    `SELECT i.*, cu.name as client_name,
            (SELECT COUNT(*) FROM project_messages pm WHERE pm.inquiry_id=i.inquiry_id AND pm.sender_type='client' AND pm.read=0) as unread_messages
     FROM inquiries i
     LEFT JOIN client_users cu ON cu.id = i.client_user_id
     ORDER BY i.submitted_at DESC`
  ).all();
  return json({ inquiries: results||[] });
}
 
// ─────────────────────────────────────────────
// PORTFOLIO
// ─────────────────────────────────────────────
async function getPortfolio(env, url) {
  const featured = url.searchParams.get('featured');
  const category = url.searchParams.get('category');
  let query = `SELECT * FROM portfolio_items`;
  const conditions = [];
  if (featured) conditions.push(`featured = 1`);
  if (category) conditions.push(`category = '${category.replace(/'/g,"''")}'`);
  if (conditions.length) query += ` WHERE ` + conditions.join(' AND ');
  query += ` ORDER BY sort_order ASC, created_at DESC`;
  const { results } = await env.DB.prepare(query).all();
  return json({ items: results || [] });
}
 
async function postPortfolio(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const { title, category, description, image_url, featured, sort_order } = await request.json();
  if (!title || !image_url) return err('title and image_url required');
  await env.DB.prepare(
    `INSERT INTO portfolio_items (title, category, description, image_url, featured, sort_order)
     VALUES (?,?,?,?,?,?)`
  ).bind(title, category||'character', description||null, image_url, featured?1:0, sort_order||0).run();
  return json({ ok: true });
}
 
async function putPortfolio(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const { id, title, category, description, image_url, featured, sort_order } = await request.json();
  if (!id) return err('id required');
  await env.DB.prepare(
    `UPDATE portfolio_items SET title=?, category=?, description=?, image_url=?, featured=?, sort_order=? WHERE id=?`
  ).bind(title, category||'character', description||null, image_url, featured?1:0, sort_order||0, id).run();
  return json({ ok: true });
}
 
async function deletePortfolio(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM portfolio_items WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
// ─────────────────────────────────────────────
// LORE
// ─────────────────────────────────────────────
async function getLore(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM lore_entries ORDER BY sort_order ASC, created_at ASC`
  ).all();
  return json({ entries: results || [] });
}
 
async function postLore(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const { tag, title, content, sort_order } = await request.json();
  if (!tag || !title || !content) return err('tag, title, content required');
  await env.DB.prepare(
    `INSERT INTO lore_entries (tag, title, content, sort_order) VALUES (?,?,?,?)`
  ).bind(tag, title, content, sort_order||0).run();
  return json({ ok: true });
}
 
async function putLore(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const { id, tag, title, content, sort_order } = await request.json();
  if (!id) return err('id required');
  await env.DB.prepare(
    `UPDATE lore_entries SET tag=?, title=?, content=?, sort_order=? WHERE id=?`
  ).bind(tag, title, content, sort_order||0, id).run();
  return json({ ok: true });
}
 
async function deleteLore(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM lore_entries WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
// ─────────────────────────────────────────────
// COMMISSIONS
// ─────────────────────────────────────────────
async function getCommissions(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM commission_types ORDER BY sort_order ASC`
  ).all();
  const status = await env.DB.prepare(`SELECT * FROM commission_status WHERE id=1`).first();
  return json({ types: results || [], status: status || { status:'open', message:'Currently open!' } });
}
 
async function postCommission(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const { name, description, starting_price, currency, turnaround, included_items, number, sort_order } = await request.json();
  if (!name) return err('name required');
  await env.DB.prepare(
    `INSERT INTO commission_types (name, description, starting_price, currency, turnaround, included_items, number, sort_order)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(name, description||null, starting_price||null, currency||'GBP', turnaround||null, included_items||null, number||1, sort_order||0).run();
  return json({ ok: true });
}
 
async function putCommission(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const { id, name, description, starting_price, currency, turnaround, included_items, enabled, sort_order } = await request.json();
  if (!id) return err('id required');
  await env.DB.prepare(
    `UPDATE commission_types SET name=?, description=?, starting_price=?, currency=?, turnaround=?, included_items=?, enabled=?, sort_order=? WHERE id=?`
  ).bind(name, description||null, starting_price||null, currency||'GBP', turnaround||null, included_items||null, enabled!==false?1:0, sort_order||0, id).run();
  return json({ ok: true });
}
 
async function deleteCommission(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return err('id required');
  await env.DB.prepare(`DELETE FROM commission_types WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
 
async function updateCommissionStatus(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const { status, message } = await request.json();
  await env.DB.prepare(
    `INSERT INTO commission_status (id, status, message) VALUES (1,?,?)
     ON CONFLICT(id) DO UPDATE SET status=excluded.status, message=excluded.message`
  ).bind(status||'open', message||'Currently open!').run();
  return json({ ok: true });
}
 
// ─────────────────────────────────────────────
// SITE CONTENT
// ─────────────────────────────────────────────
async function getSiteContent(env) {
  const { results } = await env.DB.prepare(`SELECT key, value FROM site_content`).all();
  const content = {};
  (results||[]).forEach(r => content[r.key] = r.value);
  return json(content);
}
 
async function postSiteContent(env, request) {
  const auth = await getSession(request, env);
  if (!auth) return err('Admin only', 403);
  const body = await request.json();
  const stmt = env.DB.prepare(
    `INSERT INTO site_content (key, value) VALUES (?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`
  );
  const batch = Object.entries(body).map(([k,v]) => stmt.bind(k, v));
  if (batch.length) await env.DB.batch(batch);
  return json({ ok: true });
}
