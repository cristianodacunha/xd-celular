const form = document.querySelector('#login-form');
const status = document.querySelector('#status');
const installButton = document.querySelector('#install');
const title = document.querySelector('#titulo');
const subtitle = document.querySelector('#subtitle');
const supportLink = document.querySelector('#support-link');
const menu = document.querySelector('#app-menu');
let installPrompt = null;
let unlocked = false;
const installedApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const installedNotice = document.querySelector('#installed-notice');
const iosInstallGuide = document.querySelector('#ios-install-guide');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// O video de abertura pesa 5,5 MB e e puramente decorativo. Ele so comeca a
// baixar depois que a tela ja esta utilizavel, e nunca em conexao lenta ou com
// economia de dados ligada. Antes ele disputava banda com a primeira pintura.
async function carregarVideoDecorativo() {
  const video = document.querySelector('#intro-video');
  if (!video || !video.dataset.video || video.querySelector('source')) return;
  const url = video.dataset.video;
  const rede = navigator.connection;
  const economia = rede && (rede.saveData || /^(slow-2g|2g|3g)$/.test(rede.effectiveType || ''));
  // ATENCAO: o Safari do iOS NAO implementa navigator.connection, entao a
  // checagem acima nunca dispara no iPhone. Por isso a regra que vale para
  // todos e outra: o video so toca se JA estiver guardado. Na primeira vez ele
  // e buscado em segundo plano, bem depois da tela pronta, e aparece na
  // proxima abertura. Assim nenhuma plataforma paga 5,5 MB para abrir o app.
  let guardado = false;
  try { guardado = !!(await caches.match(url)); } catch (_) {}
  if (!guardado) {
    if (!economia) window.setTimeout(() => { fetch(url).catch(() => {}); }, 8000);
    return;
  }
  const fonte = document.createElement('source');
  fonte.src = url;
  fonte.type = video.dataset.tipo || 'video/mp4';
  video.appendChild(fonte);
  video.preload = 'auto';
  video.load();
  video.play().catch(() => {});
}
function agendarVideoDecorativo() {
  if (window.requestIdleCallback) window.requestIdleCallback(carregarVideoDecorativo, { timeout: 4000 });
  else window.setTimeout(carregarVideoDecorativo, 2500);
}
if (document.readyState === 'complete') agendarVideoDecorativo();
else window.addEventListener('load', agendarVideoDecorativo);

const API = 'https://beta.xdcatalogo.com.br/backend/public/api';
const APP_TOKEN_KEY = 'xd_app_token';
function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem(APP_TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
}

// ===================== DIAGNOSTICO TEMPORARIO DE ABERTURA =====================
// Mede a abertura REAL no aparelho (principalmente iPhone) e envia um resumo
// curto para /api/client-errors, visivel no admin em "Erros dos usuarios".
// Nao bloqueia nada: roda depois do load. REMOVER quando a lentidao do iOS
// estiver resolvida.
const DIAG = { menuEm: null, origem: 'nenhum', meMs: null, meStatus: null, swCacheMs: null, swRedeMs: null };
const VERSAO_APP = '20260901-100528';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data && ev.data.tipo === 'diag-sw') {
      DIAG.swCacheMs = ev.data.cacheMs;
      DIAG.swRedeMs = ev.data.redeMs;
    }
  });
}
async function enviarDiagnostico() {
  try {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const r = v => (typeof v === 'number' ? Math.round(v) : -1);
    let caches_ = 'sem';
    try {
      const ks = await caches.keys();
      const qtd = await Promise.all(ks.map(k => caches.open(k).then(c => c.keys()).then(x => x.length)));
      caches_ = ks.map((k, i) => k + ':' + qtd[i]).join(' ');
    } catch (_) {}
    const sw = navigator.serviceWorker;
    const msg = [
      'standalone=' + (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true),
      'workerStart=' + r(n.workerStart), 'fetchStart=' + r(n.fetchStart),
      'responseStart=' + r(n.responseStart), 'responseEnd=' + r(n.responseEnd),
      'domInteractive=' + r(n.domInteractive), 'loadEnd=' + r(n.loadEventEnd),
      'tipoNav=' + (n.type || '?'),
      'menuEm=' + DIAG.menuEm, 'origem=' + DIAG.origem,
      'meMs=' + DIAG.meMs, 'meStatus=' + DIAG.meStatus,
      'swControlado=' + !!(sw && sw.controller),
      'conexaoAPI=' + (typeof navigator.connection),
      'swCacheMs=' + DIAG.swCacheMs, 'swRedeMs=' + DIAG.swRedeMs,
      'caches=[' + caches_ + ']'
    ].join(' | ');
    let sessao = null;
    try { sessao = JSON.parse(localStorage.getItem('xd_session') || 'null'); } catch (_) {}
    let envio = 'nao tentado';
    try {
      const resp = await apiFetch('/client-errors', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'diagnostico-abertura', pageId: 'APPCEL', message: 'v' + VERSAO_APP + ' | ' + msg,
          source: navigator.userAgent.slice(0, 180), userEmail: (sessao && sessao.email) || '' })
      });
      envio = 'HTTP ' + resp.status;
    } catch (e) { envio = 'FALHOU: ' + (e && e.name ? e.name : 'erro'); }
  } catch (_) {}
}
// Relato automatico SILENCIOSO: so envia quando a abertura foi lenta, para nao
// poluir o log. O botao "Enviar diagnostico" no menu envia sempre, sob demanda.
function relatarSeLento() {
  window.setTimeout(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const lento = n && ((n.responseStart || 0) > 3000 || (DIAG.menuEm || 0) > 3000);
    if (lento) enviarDiagnostico();
  }, 3000);
}
if (document.readyState === 'complete') relatarSeLento();
else window.addEventListener('load', relatarSeLento);
// =============================================================================

// admin_level >= 1 identifica administrador, mesmo criterio usado pelo menu do
// site. Consultado em /api/me, que e a fonte autoritativa (nao confiar em nada
// guardado no aparelho para decidir permissao).
async function nivelAdministrador() {
  try {
    const r = await apiFetch('/me', { cache: 'no-store' });
    const d = await r.json().catch(() => null);
    return r.ok && d && typeof d.admin_level === 'number' ? d.admin_level : 0;
  } catch (_) {
    return 0;
  }
}

function enableInstall(user) {
  if (unlocked) return;
  unlocked = true;
  DIAG.menuEm = Math.round(performance.now());
  localStorage.setItem('xd_session', JSON.stringify(user));
  form.hidden = true;
  status.textContent = `Acesso liberado para ${user.full_name || user.email}. Este celular permanecerá conectado.`;
  supportLink.hidden = true;
  installButton.hidden = true;
  status.hidden = true;
  title.textContent = 'XD Catálogos';
  subtitle.textContent = 'Escolha o catálogo que deseja consultar.';
  menu.hidden = false;
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

function showInstalledNotice() { installedNotice.hidden = false; }
window.addEventListener('appinstalled', showInstalledNotice);
document.querySelector('#close-notice').addEventListener('click', () => { installedNotice.hidden = true; });
document.querySelector('#close-ios-guide').addEventListener('click', () => { iosInstallGuide.hidden = true; });

installButton.addEventListener('click', async () => {
  if (!installPrompt) {
    if (isIOS) iosInstallGuide.hidden = false;
    else status.textContent = 'Use o botão Instalar do navegador para concluir.';
    return;
  }
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
  if (choice.outcome === 'accepted') showInstalledNotice();
});

document.querySelector('#logout').addEventListener('click', async () => {
  localStorage.removeItem('xd_session');
  try { await apiFetch('/logout', { method: 'POST' }); } catch (_) {}
  localStorage.removeItem(APP_TOKEN_KEY);
  window.location.reload();
});

document.querySelector('#remove-app').addEventListener('click', async () => {
  try { await apiFetch('/logout', { method: 'POST' }); } catch (_) {}
  // O PWA nao recebe aviso quando o icone e removido pelo sistema.
  try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
  if ('caches' in window) {
    for (const key of await caches.keys()) await caches.delete(key);
  }
  try { indexedDB.deleteDatabase('xd-app-files'); } catch (_) {}
  if ('serviceWorker' in navigator) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      if (new URL(registration.scope).pathname === '/xd-celular/') await registration.unregister();
    }
  }
  const help = document.querySelector('#remove-help');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  help.hidden = false;
  help.textContent = ios
    ? 'Os dados foram removidos. Feche o aplicativo. Depois, toque e segure o ícone do app, toque em Remover App e confirme Remover.'
    : 'Os dados foram removidos. Por favor, feche o aplicativo. Depois, toque e segure o ícone do app e arraste para desinstalar.';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#enter');
  button.disabled = true;
  delete status.dataset.status;
  status.textContent = 'Verificando acesso...';
  try {
    const body = new URLSearchParams(new FormData(form));
    const response = await apiFetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true || !data.user) throw new Error(data.message || 'Não foi possível entrar.');
    if (typeof data.app_token === 'string') localStorage.setItem(APP_TOKEN_KEY, data.app_token);
    // Por enquanto o aplicativo e exclusivo de administradores. A fonte
    // autoritativa e /api/me (mesmo criterio do menu do site: admin_level >= 1).
    const adminLevel = await nivelAdministrador();
    if (adminLevel < 1) {
      try { await apiFetch('/logout', { method: 'POST' }); } catch (_) {}
      localStorage.removeItem(APP_TOKEN_KEY);
      throw new Error('Aplicativo disponível apenas para administradores.');
    }
    // Persistido localmente para a proxima abertura funcionar mesmo offline.
    enableInstall({ ...data.user, admin_level: adminLevel });
  } catch (error) {
    status.dataset.status = 'error';
    status.textContent = error.message || 'Falha de conexão. Tente novamente.';
  } finally {
    button.disabled = false;
  }
});

if (!installedApp) {
  form.hidden = true;
  supportLink.hidden = true;
  installButton.hidden = false;
  title.innerHTML = 'Baixe o app<br>XD Catálogos.';
  subtitle.textContent = 'Instale agora. O login será solicitado apenas na primeira abertura do aplicativo.';
  status.textContent = 'Use o botão abaixo ou o botão Instalar do navegador.';
} else {
  let cachedUser = null;
  try { cachedUser = JSON.parse(localStorage.getItem('xd_session') || 'null'); } catch (_) {}
  // A sessao aprovada fica no proprio aparelho: abrir offline nunca pede
  // login de novo. Sessões antigas do app ainda nao tinham admin_level.
  if (cachedUser?.status === 'active') {
    if (Number(cachedUser.admin_level) < 1) cachedUser.admin_level = 1;
    DIAG.origem = 'sessao-guardada';
    enableInstall(cachedUser);
  }
  const validationController = new AbortController();
  window.setTimeout(() => validationController.abort(), 5000);
  const meT0 = performance.now();
  apiFetch('/me', { cache: 'no-store', signal: validationController.signal })
    .then(response => {
      DIAG.meMs = Math.round(performance.now() - meT0);
      DIAG.meStatus = response.status;
      if (DIAG.origem === 'nenhum') DIAG.origem = 'api-me';
      if (response.status === 401 && cachedUser) {
        localStorage.removeItem('xd_session');
        window.location.reload();
      }
      return response.ok ? response.json() : null;
    })
    .then(data => {
      // mesma trava na reabertura do app instalado: so administrador entra
      const admin = data && typeof data.admin_level === 'number' && data.admin_level >= 1;
      if (data?.ok && data.user?.status === 'active' && admin) enableInstall({...data.user, admin_level: data.admin_level});
    })
    .catch(() => {});
}

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; window.location.reload(); }
  });
    navigator.serviceWorker.register('./service-worker.js?v=20260904-173000', { updateViaCache: 'none' })
    .then(registration => {
      const checkForUpdate = () => registration.update().catch(() => {});
      checkForUpdate();
      window.setInterval(checkForUpdate, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
      window.addEventListener('focus', checkForUpdate);
    })
    .catch(() => {});
}
