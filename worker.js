// Посредник для XM4 Control → Яндекс Музыка (Cloudflare Workers, бесплатный тариф).
// Пропускает только запросы со страницы XM4 Control и только к нужным методам:
// статус аккаунта, поиск треков, лайки и дизлайки, плейлисты, похожие треки, справочник жанров.
// Токен не хранит: он приходит в заголовке каждого запроса и уходит дальше в api.music.yandex.net.

const ALLOWED_ORIGIN = 'https://evonext.github.io';
const API = 'https://api.music.yandex.net';
const ALLOWED_PATHS = [
  /^\/account\/status$/,
  /^\/search$/,
  /^\/users\/\d+\/(likes|dislikes)\/tracks$/,
  /^\/users\/\d+\/(likes|dislikes)\/tracks\/(add-multiple|remove)$/,
  /^\/users\/\d+\/playlists\/list$/,
  /^\/users\/\d+\/playlists\/\d+\/change-relative$/,
  /^\/tracks\/\d+\/similar$/,
  /^\/genres$/,
];

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });

    const url = new URL(request.url);

    if (!ALLOWED_PATHS.some(re => re.test(url.pathname))) return new Response('Not found', { status: 404, headers: cors });
    if (request.method !== 'GET' && request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const headers = { 'Authorization': request.headers.get('Authorization') || '', 'Accept': 'application/json' };
    const init = { method: request.method, headers };
    if (request.method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = await request.text();
    }

    const upstream = await fetch(API + url.pathname + url.search, init);
    const out = new Response(upstream.body, { status: upstream.status, headers: cors });
    out.headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return out;
  },
};
