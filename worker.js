// Посредник для XM4 Control → Яндекс Музыка (Cloudflare Workers, бесплатный тариф).
// Пропускает только запросы со страницы XM4 Control и только к нужным методам:
// статус аккаунта, поиск треков, лайки и дизлайки, плейлисты, похожие треки, справочник жанров и карточка исполнителя;
// плюс поиск «вырезки» исполнителя в его публичной странице.
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
  /^\/artists\/\d+(\/brief-info)?$/,
  /^\/rotor\/station\/artist:\d+\/info$/,
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

    // «Вырезка» исполнителя из «Моей волны»: в API её нет, ищем ссылку вида …/<хэш>.c.<id>/… в публичной странице исполнителя.
    // Токен сюда не передаётся.
    const cut = url.pathname.match(/^\/xm4\/artist-cut\/(\d+)$/);
    if (cut) {
      const res = await fetch('https://music.yandex.ru/artist/' + cut[1], {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36',
                   'Accept': 'text/html', 'Accept-Language': 'ru-RU,ru;q=0.9' },
        redirect: 'follow',
      });
      const raw = await res.text();
      const html = raw.replace(/\\u002F/gi, '/').replace(/%2F/gi, '/').replace(/\\\//g, '/');
      const m = html.match(/avatars\.yandex\.net\/get-music-content\/\d+\/[0-9a-f]+\.c\.\d+/);
      // сводка: какие типы картинок вида <хэш>.<буква>.<номер> есть на странице
      const types = {};
      for (const x of html.matchAll(/[0-9a-f]{8}\.([a-z])\.\d+/g)) types[x[1]] = (types[x[1]] || 0) + 1;
      const result = { status: res.status, size: raw.length, captcha: /captcha|showcaptcha/i.test(raw), types,
                       url: m ? 'https://' + m[0] + '/orig' : null };
      return new Response(JSON.stringify({ result }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

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
