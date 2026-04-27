/* ohuhu-colors — versão client-only.
 * Estado vive em localStorage (seedeado pela db.json bundled). Sem backend.
 */
(function () {
'use strict';

// ============================================================================
// Constantes / helpers
// ============================================================================
var STORAGE_KEY = 'ohuhu_state_v1';
var THEME_KEY = 'theme';
var AUTO_KEY = 'ohuhu_auto_advance';
var LANG_KEY = 'ohuhu_lang';
var DB_URL = './db.json';

var lang = (function () {
  try { return localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { return 'en'; }
})();
function setLang(code) {
  if (!window.OHUHU_I18N[code]) return;
  lang = code;
  try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
  document.documentElement.setAttribute('lang', code === 'pt' ? 'pt-BR' : 'en');
  // re-translate <nav data-i18n> elements
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  router();
}
function t(key, params) {
  var dict = window.OHUHU_I18N[lang] || window.OHUHU_I18N.en;
  var fallback = window.OHUHU_I18N.en;
  var v = dict[key];
  if (v == null) v = fallback[key];
  if (v == null) return key;
  if (params) Object.keys(params).forEach(function (k) {
    v = v.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
  });
  return v;
}

var CDN = 'https://cdn.shopify.com/s/files/1/0555/4212/0735/files/';
var IMAGE_OVERRIDES = {
  'R19': CDN + 'R19_1068ac22-669d-46da-91a7-fc5a1cb804c9.png',
};

var CODE_RE = /^[A-Za-z0-9]+$/;
var HEX_RE = /^#?([0-9a-fA-F]{6})$/;
var FAMILY_RE = /^[A-Za-z]+/;
var CODES_SPLIT = /[\s,;]+/;

function imgUrls(code, override) {
  if (override) return [override];
  if (IMAGE_OVERRIDES[code]) return [IMAGE_OVERRIDES[code]];
  return [CDN + code + '-color-code.png', CDN + code + '.png'];
}
function imgUrl(code, override) { return imgUrls(code, override)[0]; }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

function hexToHsl(hex) {
  var r = parseInt(hex.slice(0, 2), 16) / 255;
  var g = parseInt(hex.slice(2, 4), 16) / 255;
  var b = parseInt(hex.slice(4, 6), 16) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  var l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  var d = mx - mn;
  var s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  var h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function downloadJson(name, obj) {
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
}

// ============================================================================
// Estado (localStorage)
// ============================================================================
var state = { colors: [], kits: [], _nextKitId: 1 };

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.colors) && Array.isArray(parsed.kits)) {
        state = parsed;
        if (!state._nextKitId) state._nextKitId = computeNextKitId();
        return Promise.resolve();
      }
    }
  } catch (e) { console.warn('localStorage corrompido, recriando do db.json', e); }
  return fetch(DB_URL).then(function (r) {
    if (!r.ok) throw new Error('Falha carregando db.json: ' + r.status);
    return r.json();
  }).then(function (data) {
    importDb(data, /*save=*/ true);
  });
}

function computeNextKitId() {
  var max = 0;
  state.kits.forEach(function (k) { if (k.id > max) max = k.id; });
  return max + 1;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Erro salvando no localStorage: ' + e.message); }
}

function importDb(data, save) {
  var colors = (data.colors || []).map(function (c) {
    return {
      code: String(c.code || '').trim(),
      hex: c.hex || null,
      name: c.name || null,
      old_honolulu: c.old_honolulu || null,
      old_oahu: c.old_oahu || null,
      old_kaala: c.old_kaala || null,
      image_url: c.image_url || null,
      sort_order: c.sort_order || 0,
      has_image: c.has_image == null ? null : !!c.has_image,
    };
  }).filter(function (c) { return c.code && CODE_RE.test(c.code); });
  var existingCodes = {};
  colors.forEach(function (c) { existingCodes[c.code] = true; });
  var kits = (data.kits || []).map(function (k, i) {
    return {
      id: k.id || (i + 1),
      name: String(k.name || '').trim(),
      count: parseInt(k.count || 0, 10) || 0,
      variant: k.variant || null,
      price_brl: k.price_brl == null ? null : Number(k.price_brl),
      sort_order: k.sort_order || 0,
      enabled: k.enabled == null ? true : !!k.enabled,
      color_codes: (k.color_codes || []).filter(function (code) { return existingCodes[code]; }),
    };
  }).filter(function (k) { return k.name; });
  // re-id pra garantir IDs únicos
  kits.forEach(function (k, i) { k.id = i + 1; });
  state = { colors: colors, kits: kits, _nextKitId: kits.length + 1 };
  if (save) saveState();
}

function exportDb() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    colors: state.colors.map(function (c) {
      return {
        code: c.code, hex: c.hex, name: c.name,
        old_honolulu: c.old_honolulu, old_oahu: c.old_oahu, old_kaala: c.old_kaala,
        image_url: c.image_url, sort_order: c.sort_order, has_image: c.has_image,
      };
    }),
    kits: state.kits.map(function (k) {
      return {
        name: k.name, count: k.count, variant: k.variant,
        price_brl: k.price_brl, sort_order: k.sort_order, enabled: k.enabled,
        color_codes: k.color_codes.slice(),
      };
    }),
  };
}

// ============================================================================
// Selectors
// ============================================================================
function findColor(code) {
  for (var i = 0; i < state.colors.length; i++) {
    if (state.colors[i].code === code) return state.colors[i];
  }
  return null;
}
function findKit(id) {
  for (var i = 0; i < state.kits.length; i++) {
    if (state.kits[i].id === id) return state.kits[i];
  }
  return null;
}
function enabledKits() { return state.kits.filter(function (k) { return k.enabled; }); }
function kitsContainingColor(code) {
  return enabledKits()
    .filter(function (k) { return k.color_codes.indexOf(code) !== -1; })
    .sort(function (a, b) { return a.sort_order - b.sort_order; });
}
function kitLabel(k) { return k.variant ? k.count + ' ' + k.variant : String(k.count); }
function pricePerColor(k) { return (k.price_brl != null && k.count) ? k.price_brl / k.count : null; }
function kitColorObjs(k) {
  var idx = {};
  state.colors.forEach(function (c) { idx[c.code] = c; });
  return k.color_codes
    .map(function (c) { return idx[c]; })
    .filter(Boolean)
    .sort(function (a, b) { return a.sort_order - b.sort_order; });
}

// ============================================================================
// Router
// ============================================================================
function parseHash() {
  var h = location.hash.slice(1) || '/';
  if (!h.startsWith('/')) h = '/' + h;
  var parts = h.split('?');
  var path = parts[0];
  var query = {};
  if (parts[1]) {
    parts[1].split('&').forEach(function (p) {
      var kv = p.split('=');
      query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
  }
  return { path: path, query: query };
}

function navigate(path, replace) {
  var url = '#' + path;
  if (replace) location.replace(url);
  else location.hash = path;
}

function buildQuery(obj) {
  var pairs = [];
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (v === '' || v == null || v === false) return;
    pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return pairs.length ? '?' + pairs.join('&') : '';
}

function setActiveNav(path) {
  var navItems = document.querySelectorAll('#primary-nav a[data-route]');
  navItems.forEach(function (a) {
    var r = a.getAttribute('data-route');
    var active = (r === '/' && path === '/') || (r !== '/' && path.indexOf(r) === 0);
    a.classList.toggle('active', active);
  });
}

function router() {
  var p = parseHash();
  setActiveNav(p.path);
  var app = document.getElementById('app');
  app.innerHTML = '';
  if (p.path === '/') return renderIndex(app, p.query);
  if (p.path === '/kits') return renderKits(app);
  if (p.path === '/compare') return renderCompare(app, p.query);
  if (p.path === '/admin') return renderAdmin(app);
  var m;
  if ((m = p.path.match(/^\/colors\/([A-Za-z0-9]+)$/))) return renderColorDetail(app, m[1]);
  if ((m = p.path.match(/^\/kits\/(\d+)\/edit$/))) return renderKitEdit(app, parseInt(m[1], 10));
  app.innerHTML = '<section class="page"><h1>404</h1><p class="muted">Rota não encontrada.</p></section>';
}

// ============================================================================
// Index (color grid)
// ============================================================================
function renderIndex(root, query) {
  var q = (query.q || '').trim();
  var broken = query.broken === '1' || query.broken === 'true';
  var img = (query.img || '').toLowerCase();
  var sort = query.sort || 'default';
  if (['default','code','usage','hue','light'].indexOf(sort) === -1) sort = 'default';

  var all = state.colors.slice();
  var filtered = all.filter(function (c) {
    if (q && c.code.toLowerCase().indexOf(q.toLowerCase()) !== 0) return false;
    if (broken && c.hex) return false;
    if (img === 'missing' && c.has_image !== false) return false;
    if (img === 'ok' && c.has_image !== true) return false;
    return true;
  });

  var usage = {};
  if (sort === 'usage') {
    enabledKits().forEach(function (k) {
      k.color_codes.forEach(function (code) {
        usage[code] = (usage[code] || 0) + 1;
      });
    });
  }
  if (sort === 'code') filtered.sort(function (a, b) { return a.code.localeCompare(b.code); });
  else if (sort === 'usage') filtered.sort(function (a, b) {
    var ua = usage[a.code] || 0, ub = usage[b.code] || 0;
    if (ua !== ub) return ub - ua;
    return a.sort_order - b.sort_order;
  });
  else if (sort === 'hue') filtered.sort(function (a, b) {
    if (!a.hex && !b.hex) return a.sort_order - b.sort_order;
    if (!a.hex) return 1;
    if (!b.hex) return -1;
    var ha = hexToHsl(a.hex), hb = hexToHsl(b.hex);
    var ba = ha[1] < 0.08 ? 1 : 0, bb = hb[1] < 0.08 ? 1 : 0;
    if (ba !== bb) return ba - bb;
    if (ha[0] !== hb[0]) return ha[0] - hb[0];
    if (ha[1] !== hb[1]) return hb[1] - ha[1];
    return ha[2] - hb[2];
  });
  else if (sort === 'light') filtered.sort(function (a, b) {
    if (!a.hex && !b.hex) return a.sort_order - b.sort_order;
    if (!a.hex) return 1;
    if (!b.hex) return -1;
    return hexToHsl(b.hex)[2] - hexToHsl(a.hex)[2];
  });
  else filtered.sort(function (a, b) { return a.sort_order - b.sort_order; });

  var families = {};
  all.forEach(function (c) {
    var m = c.code.match(FAMILY_RE);
    if (m) families[m[0].toUpperCase()] = true;
  });
  var famList = Object.keys(families).sort(function (a, b) {
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });

  var brokenCount = all.filter(function (c) { return !c.hex; }).length;
  var missingImgCount = all.filter(function (c) { return c.has_image === false; }).length;

  var qsBase = {};
  if (q) qsBase.q = q;
  if (broken) qsBase.broken = '1';
  if (img) qsBase.img = img;
  function chipUrl(extra) {
    var merged = Object.assign({}, qsBase, extra);
    return '#/' + buildQuery(merged);
  }

  var html = ''
    + '<section class="page">'
    +   '<header class="page-header">'
    +     '<div>'
    +       '<h1>' + t('index.title') + '</h1>'
    +       '<p class="muted">' + t('index.subtitle', { n: filtered.length, filtered: (q || broken || img) ? t('index.subtitle.filtered') : '' }) + '</p>'
    +     '</div>'
    +     '<form id="searchForm" class="search">'
    +       '<input name="q" value="' + escapeAttr(q) + '" placeholder="' + escapeAttr(t('index.search_placeholder')) + '">'
    +       (q || broken ? '<a href="#/" class="btn-ghost">' + t('common.clear') + '</a>' : '')
    +     '</form>'
    +   '</header>'
    +   '<div class="filter-chips">'
    +     '<a class="chip ' + (!q && !broken && !img ? 'is-on' : '') + '" href="#/">' + t('index.all') + '</a>'
    +     famList.map(function (f) {
            return '<a class="chip ' + (q.toUpperCase() === f ? 'is-on' : '') + '" href="#/?q=' + encodeURIComponent(f) + '">' + f + '</a>';
          }).join('')
    +     (brokenCount ? '<a class="chip chip-warn ' + (broken ? 'is-on' : '') + '" href="#/?broken=1">' + t('index.no_hex') + ' <span class="chip-badge">' + brokenCount + '</span></a>' : '')
    +     (missingImgCount ? '<a class="chip chip-warn ' + (img === 'missing' ? 'is-on' : '') + '" href="#/?img=missing">' + t('index.no_image') + ' <span class="chip-badge">' + missingImgCount + '</span></a>' : '')
    +   '</div>'
    +   '<div class="filter-chips">'
    +     '<span class="muted small" style="align-self:center;margin-right:4px;">' + t('index.sort_label') + '</span>'
    +     ['default','code','usage','hue','light'].map(function (key) {
            return '<a class="chip ' + (sort === key ? 'is-on' : '') + '" href="' + chipUrl({ sort: key }) + '">' + t('index.sort.' + key) + '</a>';
          }).join('')
    +   '</div>'
    +   '<div class="swatch-grid">'
    +     filtered.map(function (c) {
            var imgSrc = imgUrl(c.code, c.image_url);
            return ''
              + '<a class="swatch" href="#/colors/' + c.code + '" title="' + c.code + (c.hex ? ' · #' + c.hex : ' · ' + t('common.no_hex')) + '">'
              +   '<span class="swatch-img-wrap">'
              +     '<img class="swatch-img" loading="lazy" alt="' + c.code + '" src="' + imgSrc + '"'
              +       ' onerror="if(this.src.includes(\'-color-code.png\')){this.src=this.src.replace(\'-color-code.png\',\'.png\');}else{this.classList.add(\'img-missing\');}">'
              +   '</span>'
              +   '<span class="swatch-bar' + (c.hex ? '' : ' swatch-broken') + '"' + (c.hex ? ' style="background:#' + c.hex + '"' : '') + '>'
              +     (c.hex ? '' : '?')
              +   '</span>'
              +   '<span class="swatch-code">' + c.code + (sort === 'usage' ? ' <span class="muted small">' + (usage[c.code] || 0) + '×</span>' : '') + '</span>'
              + '</a>';
          }).join('')
    +     (filtered.length === 0 ? '<p class="muted">' + t('index.no_results') + '</p>' : '')
    +   '</div>'
    + '</section>';

  root.innerHTML = html;
  document.getElementById('searchForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var v = ev.target.q.value.trim();
    var newQs = Object.assign({}, qsBase);
    if (v) newQs.q = v; else delete newQs.q;
    if (sort !== 'default') newQs.sort = sort;
    navigate('/' + buildQuery(newQs));
  });
}

// ============================================================================
// Color detail
// ============================================================================
function renderColorDetail(root, code) {
  var color = findColor(code);
  if (!color) { root.innerHTML = '<section class="page"><h1>404</h1><p>Color ' + escapeHtml(code) + ' not found.</p></section>'; return; }
  var kits = kitsContainingColor(code);
  var src = imgUrl(code, color.image_url);

  var oldsParts = [];
  if (color.old_honolulu) oldsParts.push('<span title="Old Honolulu">' + escapeHtml(color.old_honolulu) + '</span>');
  if (color.old_oahu) oldsParts.push('<span title="Old Oahu">' + escapeHtml(color.old_oahu) + '</span>');
  if (color.old_kaala) oldsParts.push('<span title="Old Kaala">' + escapeHtml(color.old_kaala) + '</span>');

  var html = ''
    + '<section class="page">'
    +   '<header class="page-header">'
    +     '<div>'
    +       '<h1>' + escapeHtml(color.code) + (color.name ? ' <span class="muted" style="font-weight:400;font-size:1rem">· ' + escapeHtml(color.name) + '</span>' : '') + '</h1>'
    +       '<p class="muted">'
    +         (color.hex ? t('detail.hex_stored') + ' <code>#' + color.hex + '</code>' : t('detail.hex_invalid'))
    +         ' · ' + t('common.in_n_kits', { n: kits.length })
    +         (oldsParts.length ? ' · ' + t('detail.olds') + ' ' + oldsParts.join(' / ') : '')
    +       '</p>'
    +     '</div>'
    +     '<a href="#/" class="btn-ghost">' + t('common.back') + '</a>'
    +   '</header>'
    +   '<div class="compare-pair">'
    +     '<figure class="compare-pair-cell">'
    +       '<div class="picker-img-wrap" id="pickerWrap">'
    +         '<img id="pickerImg" class="compare-pair-img picker-img" alt="' + color.code + ' oficial" crossorigin="anonymous"'
    +           ' src="' + src + '"'
    +           ' onerror="if(this.src.includes(\'-color-code.png\')){this.src=this.src.replace(\'-color-code.png\',\'.png\');}else{this.classList.add(\'img-missing\');}">'
    +         '<span class="picker-marker" id="pickerMarker" hidden></span>'
    +       '</div>'
    +       '<figcaption>' + t('detail.click_to_sample') + '</figcaption>'
    +     '</figure>'
    +     '<figure class="compare-pair-cell">'
    +       '<span id="previewChip" class="compare-pair-chip' + (color.hex ? '' : ' swatch-broken') + '"' + (color.hex ? ' style="background:#' + color.hex + '"' : '') + '>' + (color.hex ? '' : '?') + '</span>'
    +       '<figcaption id="previewCaption">' + (color.hex ? '#' + color.hex : t('common.no_hex')) + '</figcaption>'
    +     '</figure>'
    +   '</div>'
    +   '<div class="card">'
    +     '<h2 class="section-title">' + t('detail.edit_hex') + '</h2>'
    +     '<form id="hexForm" class="picker-form">'
    +       '<input type="color" id="colorInput" value="#' + (color.hex || 'ffffff') + '" aria-label="Color picker">'
    +       '<input type="text" id="hexInput" name="hex_value" placeholder="e.g.: a3cbe1" value="' + (color.hex || '') + '" maxlength="7" autocomplete="off">'
    +       '<button type="button" id="eyedropperBtn" class="btn-ghost" hidden>'
    +         '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22l3-1 11-11M14 7l3 3M16 5l3 3M13 8l3 3"/></svg>'
    +         t('detail.eyedropper')
    +       '</button>'
    +       '<button type="submit" class="btn-primary">' + t('common.save') + '</button>'
    +       '<label class="auto-toggle" title="' + escapeAttr(t('detail.fast_mode_tip')) + '">'
    +         '<input type="checkbox" id="autoAdvanceToggle">'
    +         '<span>' + t('detail.fast_mode') + '</span>'
    +       '</label>'
    +       '<span class="muted small">' + t('detail.hint') + '</span>'
    +     '</form>'
    +   '</div>'
    +   '<h2 class="section-title">' + t('detail.appears_in_kits') + '</h2>'
    +   (kits.length ? (
        '<div class="table-wrap"><table class="data-table">'
        + '<thead><tr><th>' + t('detail.kit') + '</th><th class="num">' + t('common.size') + '</th><th class="num">' + t('common.price') + '</th></tr></thead>'
        + '<tbody>'
        + kits.map(function (k) {
            return '<tr>'
              + '<td><a href="#/compare?a=' + k.id + '">' + escapeHtml(k.name) + '</a></td>'
              + '<td class="num">' + kitLabel(k) + '</td>'
              + '<td class="num">' + (k.price_brl != null ? 'R$ ' + k.price_brl.toFixed(2) : '—') + '</td>'
              + '</tr>';
          }).join('')
        + '</tbody></table></div>'
      ) : '<p class="muted">' + t('detail.no_kit') + '</p>')
    + '</section>';

  root.innerHTML = html;
  attachColorDetailHandlers(color);
}

function attachColorDetailHandlers(color) {
  var img = document.getElementById('pickerImg');
  var wrap = document.getElementById('pickerWrap');
  var marker = document.getElementById('pickerMarker');
  var hexInput = document.getElementById('hexInput');
  var colorInput = document.getElementById('colorInput');
  var chip = document.getElementById('previewChip');
  var caption = document.getElementById('previewCaption');
  var dropperBtn = document.getElementById('eyedropperBtn');
  var hexForm = document.getElementById('hexForm');
  var autoToggle = document.getElementById('autoAdvanceToggle');

  try { if (localStorage.getItem(AUTO_KEY) === '1') autoToggle.checked = true; } catch (e) {}
  autoToggle.addEventListener('change', function () {
    try { localStorage.setItem(AUTO_KEY, autoToggle.checked ? '1' : '0'); } catch (e) {}
  });

  function toHex(n) { return n.toString(16).padStart(2, '0'); }
  function applyHex(hex) {
    hex = hex.toLowerCase().replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/.test(hex)) return;
    hexInput.value = hex;
    colorInput.value = '#' + hex;
    chip.style.background = '#' + hex;
    chip.classList.remove('swatch-broken');
    chip.textContent = '';
    caption.textContent = '#' + hex;
  }

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var imgReady = false;
  function prepCanvas() {
    if (img.classList.contains('img-missing') || !img.naturalWidth) return;
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    try { ctx.drawImage(img, 0, 0); imgReady = true; }
    catch (e) { console.warn('canvas tainted, picker desabilitado:', e); }
  }
  if (img.complete) prepCanvas(); else img.addEventListener('load', prepCanvas);

  wrap.addEventListener('click', function (ev) {
    if (!imgReady) return;
    var rect = img.getBoundingClientRect();
    var x = (ev.clientX - rect.left) * (img.naturalWidth / rect.width);
    var y = (ev.clientY - rect.top) * (img.naturalHeight / rect.height);
    if (x < 0 || y < 0 || x >= img.naturalWidth || y >= img.naturalHeight) return;
    var px = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (px[3] === 0) return;
    applyHex(toHex(px[0]) + toHex(px[1]) + toHex(px[2]));
    marker.style.left = (ev.clientX - rect.left) + 'px';
    marker.style.top = (ev.clientY - rect.top) + 'px';
    marker.hidden = false;
    if (autoToggle.checked) submitHex(true);
  });

  colorInput.addEventListener('input', function () { applyHex(colorInput.value); });
  hexInput.addEventListener('input', function () {
    var v = hexInput.value.replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(v)) applyHex(v);
  });
  if (window.EyeDropper) {
    dropperBtn.hidden = false;
    dropperBtn.addEventListener('click', function () {
      var ed = new window.EyeDropper();
      ed.open().then(function (res) { applyHex(res.sRGBHex); }).catch(function () {});
    });
  }
  hexForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    submitHex(autoToggle.checked);
  });

  function submitHex(advance) {
    var v = hexInput.value.trim();
    if (!v) {
      color.hex = null;
    } else {
      var m = HEX_RE.exec(v);
      if (!m) { alert('HEX inválido (use 6 hex chars)'); return; }
      color.hex = m[1].toLowerCase();
    }
    saveState();
    if (advance) {
      var sorted = state.colors.slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
      var idx = sorted.findIndex(function (c) { return c.code === color.code; });
      var nxt = sorted[idx + 1];
      if (nxt) { navigate('/colors/' + nxt.code); return; }
      navigate('/');
      return;
    }
    router(); // re-render same page com novo HEX
  }
}

// ============================================================================
// Kits list
// ============================================================================
function renderKits(root) {
  var kits = state.kits.slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
  var html = ''
    + '<section class="page">'
    +   '<header class="page-header">'
    +     '<div><h1>' + t('kits.title') + '</h1><p class="muted">' + t('kits.subtitle') + '</p></div>'
    +     '<a href="#/compare" class="btn-primary">' + t('kits.compare_kits') + '</a>'
    +   '</header>'
    +   '<details class="card"><summary style="cursor:pointer;font-weight:600;">' + t('kits.add_kit') + '</summary>'
    +     '<form id="kitNewForm" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
    +       '<input type="text" name="name" placeholder="' + escapeAttr(t('kits.name_placeholder')) + '" required style="flex:1;min-width:260px;">'
    +       '<input type="number" name="count" placeholder="' + escapeAttr(t('kits.size_placeholder')) + '" min="0" value="0" required style="width:110px;">'
    +       '<input type="text" name="variant" placeholder="' + escapeAttr(t('kits.variant_placeholder')) + '" style="width:140px;">'
    +       '<input type="text" name="price" inputmode="decimal" placeholder="' + escapeAttr(t('kits.price_placeholder')) + '" style="width:160px;">'
    +       '<button type="submit" class="btn-primary">' + t('kits.create_and_edit') + '</button>'
    +     '</form>'
    +     '<p class="muted small" style="margin-top:8px;">' + t('kits.add_kit_after') + '</p>'
    +   '</details>'
    +   '<div class="table-wrap"><table class="data-table">'
    +     '<thead><tr><th>' + t('detail.kit') + '</th><th class="num">' + t('common.colors') + '</th><th>' + t('kits.price_brl') + '</th><th class="num">' + t('kits.price_per_color') + '</th><th></th></tr></thead>'
    +     '<tbody>'
    +     kits.map(function (k) {
            var actual = k.color_codes.length;
            var ppc = pricePerColor(k);
            return '<tr' + (k.enabled ? '' : ' class="kit-disabled"') + '>'
              + '<td><div class="kit-name">' + escapeHtml(k.name) + (k.enabled ? '' : ' <span class="muted small">· ' + t('kits.disabled') + '</span>') + '</div>'
              +   '<div class="muted small">' + t('kits.label_prefix') + ' ' + kitLabel(k) + '</div></td>'
              + '<td class="num">' + actual + (actual !== k.count ? ' <span class="muted small">' + t('kits.of_n', { n: k.count }) + '</span>' : '') + '</td>'
              + '<td><form class="inline-form" data-kit-price="' + k.id + '">'
              +   '<input type="text" name="price" inputmode="decimal" placeholder="—" value="' + (k.price_brl != null ? k.price_brl.toFixed(2) : '') + '">'
              +   '<button type="submit" class="btn-primary small">' + t('common.save') + '</button>'
              + '</form></td>'
              + '<td class="num">' + (ppc != null ? 'R$ ' + ppc.toFixed(2) : '—') + '</td>'
              + '<td>'
              +   '<a href="#/kits/' + k.id + '/edit" class="btn-ghost small">' + t('kits.edit_colors') + '</a> '
              +   '<a href="#/compare?a=' + k.id + '" class="btn-ghost small">' + t('kits.compare') + '</a> '
              +   '<button type="button" class="btn-ghost small" data-kit-toggle="' + k.id + '">' + (k.enabled ? t('kits.disable') : t('kits.enable')) + '</button>'
              + '</td></tr>';
          }).join('')
    +     '</tbody></table></div>'
    + '</section>';

  root.innerHTML = html;
  document.getElementById('kitNewForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target;
    var name = f.name.value.trim();
    if (!name) return;
    if (state.kits.some(function (k) { return k.name === name; })) {
      alert(t('kits.duplicate_name', { name: name })); return;
    }
    var count = parseInt(f.count.value, 10) || 0;
    var variant = f.variant.value.trim() || null;
    var priceStr = f.price.value.trim().replace(',', '.');
    var price = priceStr ? parseFloat(priceStr) : null;
    if (price != null && (isNaN(price) || price < 0)) { alert(t('kits.price_invalid')); return; }
    var maxSort = state.kits.reduce(function (m, k) { return Math.max(m, k.sort_order); }, 0);
    var newId = state._nextKitId || computeNextKitId();
    state._nextKitId = newId + 1;
    state.kits.push({
      id: newId, name: name, count: count, variant: variant,
      price_brl: price, sort_order: maxSort + 1, enabled: true, color_codes: [],
    });
    saveState();
    navigate('/kits/' + newId + '/edit');
  });
  document.querySelectorAll('form[data-kit-price]').forEach(function (f) {
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var id = parseInt(f.dataset.kitPrice, 10);
      var k = findKit(id); if (!k) return;
      var v = f.price.value.trim().replace(',', '.');
      if (!v) k.price_brl = null;
      else { var p = parseFloat(v); if (isNaN(p) || p < 0) { alert(t('kits.price_invalid')); return; } k.price_brl = p; }
      saveState(); router();
    });
  });
  document.querySelectorAll('button[data-kit-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = parseInt(b.dataset.kitToggle, 10);
      var k = findKit(id); if (!k) return;
      k.enabled = !k.enabled; saveState(); router();
    });
  });
}

// ============================================================================
// Kit edit
// ============================================================================
function renderKitEdit(root, kitId) {
  var k = findKit(kitId);
  if (!k) { root.innerHTML = '<section class="page"><h1>404</h1><p>Kit not found.</p></section>'; return; }
  var allColors = state.colors.slice().sort(function (a, b) { return a.sort_order - b.sort_order; });

  var html = ''
    + '<section class="page">'
    +   '<header class="page-header">'
    +     '<div><h1>' + t('kit_edit.title', { name: escapeHtml(k.name) }) + '</h1>'
    +       '<p class="muted">' + t('kit_edit.declared', { label: kitLabel(k), n: '<span id="kitCountLive">' + k.color_codes.length + '</span>' }) + '</p></div>'
    +     '<a href="#/kits" class="btn-ghost">' + t('common.back') + '</a>'
    +   '</header>'
    +   '<form id="kitForm" class="card">'
    +     '<h2 class="section-title">' + t('kit_edit.codes_list') + '</h2>'
    +     '<p class="muted small">' + t('kit_edit.codes_help') + '</p>'
    +     '<textarea name="codes" id="kitCodes" rows="10" spellcheck="false"'
    +       ' style="width:100%;font-family:ui-monospace,\'SF Mono\',Menlo,Consolas,monospace;font-size:.9rem;padding:10px;border-radius:6px;background:var(--color-surface-alt);color:var(--color-text);border:1px solid var(--color-border);resize:vertical;">'
    +       k.color_codes.join('\n')
    +     '</textarea>'
    +     '<div style="margin-top:12px;display:flex;gap:8px;">'
    +       '<button type="submit" class="btn-primary">' + t('kit_edit.save_list') + '</button>'
    +       '<a href="#/kits/' + k.id + '/edit" class="btn-ghost">' + t('common.reload') + '</a>'
    +     '</div>'
    +   '</form>'
    +   '<h2 class="section-title">' + t('kit_edit.catalog') + '</h2>'
    +   '<div class="search" style="margin-bottom:12px;">'
    +     '<input id="colorSearch" type="search" placeholder="' + escapeAttr(t('kit_edit.search_placeholder')) + '" style="width:100%;max-width:480px;">'
    +     '<span id="searchCount" class="muted small" style="margin-left:8px;align-self:center;"></span>'
    +   '</div>'
    +   '<div class="swatch-grid" id="colorPicker">'
    +     allColors.map(function (c) {
            var src = imgUrl(c.code, c.image_url);
            var inKit = k.color_codes.indexOf(c.code) !== -1;
            var search = [c.code, c.name || '', c.old_honolulu || '', c.old_oahu || '', c.old_kaala || ''].join('|').toLowerCase();
            var titleParts = [c.code];
            if (c.name) titleParts.push(c.name);
            if (c.old_honolulu || c.old_oahu || c.old_kaala) {
              titleParts.push(t('detail.olds') + ' ' + (c.old_honolulu || '–') + '/' + (c.old_oahu || '–') + '/' + (c.old_kaala || '–'));
            }
            return '<button type="button" class="swatch swatch-pickable' + (inKit ? ' is-on' : '') + '"'
              + ' data-code="' + c.code + '" data-search="' + escapeAttr(search) + '" title="' + escapeAttr(titleParts.join(' · ')) + '">'
              + '<span class="swatch-img-wrap"><img class="swatch-img" loading="lazy" alt="' + c.code + '" src="' + src + '"'
              + ' onerror="if(this.src.includes(\'-color-code.png\')){this.src=this.src.replace(\'-color-code.png\',\'.png\');}else{this.classList.add(\'img-missing\');}">'
              + '</span>'
              + '<span class="swatch-bar' + (c.hex ? '' : ' swatch-broken') + '"' + (c.hex ? ' style="background:#' + c.hex + '"' : '') + '>' + (c.hex ? '' : '?') + '</span>'
              + '<span class="swatch-code">' + c.code + (c.name ? ' <span class="muted small">' + escapeHtml(c.name) + '</span>' : '') + '</span>'
              + '</button>';
          }).join('')
    +   '</div>'
    + '</section>';

  root.innerHTML = html;

  var textarea = document.getElementById('kitCodes');
  var picks = Array.from(document.querySelectorAll('.swatch-pickable'));
  var search = document.getElementById('colorSearch');
  var searchCount = document.getElementById('searchCount');
  var liveCount = document.getElementById('kitCountLive');

  function parseCodes() {
    var raw = textarea.value.split(CODES_SPLIT);
    var seen = new Set(); var out = [];
    raw.forEach(function (c) { c = c.trim(); if (c && !seen.has(c)) { seen.add(c); out.push(c); } });
    return { list: out, set: seen };
  }
  function refresh() {
    var p = parseCodes();
    picks.forEach(function (b) { b.classList.toggle('is-on', p.set.has(b.dataset.code)); });
    if (liveCount) liveCount.textContent = p.list.length;
  }
  function toggle(code) {
    var p = parseCodes();
    if (p.set.has(code)) p.list = p.list.filter(function (c) { return c !== code; });
    else p.list.push(code);
    textarea.value = p.list.join('\n');
    refresh();
  }
  picks.forEach(function (b) { b.addEventListener('click', function () { toggle(b.dataset.code); }); });
  textarea.addEventListener('input', refresh);
  search.addEventListener('input', function () {
    var q = search.value.trim().toLowerCase();
    var visible = 0;
    picks.forEach(function (b) {
      var match = !q || b.dataset.search.indexOf(q) !== -1;
      b.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    searchCount.textContent = q ? t('kit_edit.of_n_visible', { visible: visible, total: picks.length }) : '';
  });
  document.getElementById('kitForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var p = parseCodes();
    var existing = {}; state.colors.forEach(function (c) { existing[c.code] = true; });
    var valid = p.list.filter(function (c) { return existing[c]; });
    var invalid = p.list.filter(function (c) { return !existing[c]; });
    k.color_codes = valid;
    saveState();
    var msg = t('kit_edit.saved_n', { n: valid.length });
    if (invalid.length) msg += t('kit_edit.invalid_n', { n: invalid.length, list: invalid.slice(0, 10).join(', ') + (invalid.length > 10 ? '…' : '') });
    alert(msg);
    router();
  });
  refresh();
}

// ============================================================================
// Compare (group A vs B)
// ============================================================================
function renderCompare(root, query) {
  var aIds = parseIds(query.a || query.kits || '');
  var bIds = parseIds(query.b || '');
  var allKits = enabledKits().slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
  var enabledIdSet = new Set(allKits.map(function (k) { return k.id; }));
  aIds = aIds.filter(function (id) { return enabledIdSet.has(id); });
  bIds = bIds.filter(function (id) { return enabledIdSet.has(id); });
  var aSet = new Set(aIds), bSet = new Set(bIds);

  var picker = ''
    + '<form id="kitPicker" class="kit-picker">'
    +   '<div class="kit-picker-list">'
    +     allKits.map(function (k) {
            var inA = aSet.has(k.id), inB = bSet.has(k.id);
            return '<div class="kit-pick' + (inA || inB ? ' is-on' : '') + '">'
              + '<span class="kit-pick-name">' + escapeHtml(k.name) + '</span>'
              + '<span class="kit-pick-meta">' + k.count + (k.variant ? ' ' + k.variant : '') + (k.price_brl != null ? ' · R$ ' + k.price_brl.toFixed(2) : '') + '</span>'
              + '<div class="kit-pick-sides">'
              +   '<label class="kit-pick-side k-a' + (inA ? ' is-on' : '') + '"><input type="checkbox" name="kit_a" value="' + k.id + '"' + (inA ? ' checked' : '') + '><span>A</span></label>'
              +   '<label class="kit-pick-side k-b' + (inB ? ' is-on' : '') + '"><input type="checkbox" name="kit_b" value="' + k.id + '"' + (inB ? ' checked' : '') + '><span>B</span></label>'
              + '</div></div>';
          }).join('')
    +   '</div>'
    +   '<div class="kit-picker-actions"><button type="submit" class="btn-primary">' + t('compare.compare_btn') + '</button> <a href="#/compare" class="btn-ghost">' + t('common.clear') + '</a></div>'
    + '</form>';

  var body = '';
  var mode = (aSet.size && bSet.size) ? 'group' : (aSet.size || bSet.size ? 'legacy' : 'empty');

  if (mode === 'group') {
    body = renderCompareGroup(allKits, aSet, bSet);
  } else if (mode === 'legacy') {
    var sel = aSet.size ? Array.from(aSet) : Array.from(bSet);
    body = renderCompareLegacy(allKits, sel);
  }

  root.innerHTML = ''
    + '<section class="page">'
    +   '<header class="page-header"><div>'
    +     '<h1>' + t('compare.title') + '</h1>'
    +     '<p class="muted">' + t('compare.subtitle') + '</p>'
    +   '</div></header>'
    +   picker
    +   body
    + '</section>';

  document.getElementById('kitPicker').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target;
    var aSel = Array.from(f.querySelectorAll('input[name="kit_a"]:checked')).map(function (i) { return i.value; });
    var bSel = Array.from(f.querySelectorAll('input[name="kit_b"]:checked')).map(function (i) { return i.value; });
    var qs = {};
    if (aSel.length) qs.a = aSel.join(',');
    if (bSel.length) qs.b = bSel.join(',');
    navigate('/compare' + buildQuery(qs));
  });

  attachCompareFilters();
}

function parseIds(s) {
  if (!s) return [];
  return s.split(',').map(function (x) { return parseInt(x.trim(), 10); }).filter(function (n) { return !isNaN(n); });
}

function renderCompareGroup(allKits, aSet, bSet) {
  var aKits = allKits.filter(function (k) { return aSet.has(k.id); });
  var bKits = allKits.filter(function (k) { return bSet.has(k.id); });

  var aCodes = new Set(), bCodes = new Set();
  var aKitsWith = {}, bKitsWith = {};
  var kitMembership = {};

  aKits.forEach(function (k) {
    k.color_codes.forEach(function (code) {
      aCodes.add(code);
      aKitsWith[code] = (aKitsWith[code] || 0) + 1;
      (kitMembership[code] = kitMembership[code] || new Set()).add(k.id);
    });
  });
  bKits.forEach(function (k) {
    k.color_codes.forEach(function (code) {
      bCodes.add(code);
      bKitsWith[code] = (bKitsWith[code] || 0) + 1;
      (kitMembership[code] = kitMembership[code] || new Set()).add(k.id);
    });
  });

  var allCodes = new Set([].concat(Array.from(aCodes), Array.from(bCodes)));
  var rows = Array.from(allCodes).map(function (code) {
    var c = findColor(code); if (!c) return null;
    var inA = aCodes.has(code), inB = bCodes.has(code);
    return {
      color: c, in_a: inA, in_b: inB,
      a_kits_with: aKitsWith[code] || 0,
      b_kits_with: bKitsWith[code] || 0,
      kit_count: kitMembership[code].size,
      shared: (inA ? 1 : 0) + (inB ? 1 : 0),
    };
  }).filter(Boolean).sort(function (x, y) {
    if (x.shared !== y.shared) return y.shared - x.shared;
    if (x.kit_count !== y.kit_count) return y.kit_count - x.kit_count;
    return x.color.sort_order - y.color.sort_order;
  });

  var inter = 0, aOnly = 0, bOnly = 0, overlap = 0, aOverlap = 0, bOverlap = 0;
  rows.forEach(function (r) {
    if (r.in_a && r.in_b) inter++;
    else if (r.in_a) aOnly++;
    else if (r.in_b) bOnly++;
    if (r.kit_count >= 2) overlap++;
    if (r.a_kits_with >= 2) aOverlap++;
    if (r.b_kits_with >= 2) bOverlap++;
  });
  var aTotal = aKits.reduce(function (s, k) { return s + (k.price_brl || 0); }, 0);
  var bTotal = bKits.reduce(function (s, k) { return s + (k.price_brl || 0); }, 0);
  var aHasPrice = aKits.some(function (k) { return k.price_brl != null; });
  var bHasPrice = bKits.some(function (k) { return k.price_brl != null; });

  var summary = '<div class="compare-summary" id="cmpSummary">'
    + statBtn('a', t('compare.selection_a'), aCodes.size, t('compare.n_kits', { n: aKits.length }) + (aHasPrice ? ' · R$ ' + aTotal.toFixed(2) : ''))
    + statBtn('b', t('compare.selection_b'), bCodes.size, t('compare.n_kits', { n: bKits.length }) + (bHasPrice ? ' · R$ ' + bTotal.toFixed(2) : ''))
    + statBtn('both', t('compare.in_both'), inter)
    + statBtn('a-only', t('compare.only_a'), aOnly)
    + statBtn('b-only', t('compare.only_b'), bOnly)
    + (aKits.length >= 2 ? statBtn('a-overlap', t('compare.repeated_a'), aOverlap, t('compare.in_2_plus_of_n', { n: aKits.length })) : '')
    + (bKits.length >= 2 ? statBtn('b-overlap', t('compare.repeated_b'), bOverlap, t('compare.in_2_plus_of_n', { n: bKits.length })) : '')
    + statBtn('overlap', t('compare.repeated_total'), overlap)
    + statBtn('all', t('compare.union'), allCodes.size)
    + '</div>';

  var legend = '<div class="cmp-legend">'
    + '<span class="cmp-legend-item"><span class="cmp-flag k-1 is-on">A</span><span class="cmp-legend-name">' + escapeHtml(aKits.map(function (k) { return k.name; }).join(', ')) + '</span></span>'
    + '<span class="cmp-legend-item"><span class="cmp-flag k-2 is-on">B</span><span class="cmp-legend-name">' + escapeHtml(bKits.map(function (k) { return k.name; }).join(', ')) + '</span></span>'
    + '</div>';

  var grid = '<div class="compare-grid" id="cmpGrid">' + rows.map(function (r) {
    var c = r.color;
    var ttl = c.code + ' · A: ' + r.a_kits_with + '/' + aKits.length + ' · B: ' + r.b_kits_with + '/' + bKits.length + (c.hex ? ' · #' + c.hex : '');
    return '<a class="cmp-cell' + (r.shared === 2 ? ' is-all' : (r.shared === 1 ? ' is-unique' : '')) + '"'
      + ' data-in-a="' + (r.in_a ? '1' : '0') + '" data-in-b="' + (r.in_b ? '1' : '0') + '"'
      + ' data-a-count="' + r.a_kits_with + '" data-b-count="' + r.b_kits_with + '" data-kit-count="' + r.kit_count + '"'
      + ' href="#/colors/' + c.code + '" title="' + escapeAttr(ttl) + '">'
      + '<span class="cmp-chip' + (c.hex ? '' : ' swatch-broken') + '"' + (c.hex ? ' style="background:#' + c.hex + '"' : '') + '>' + (c.hex ? '' : '?') + '</span>'
      + '<span class="cmp-code">' + c.code + '</span>'
      + '<span class="cmp-flags">'
      +   '<span class="cmp-flag k-1' + (r.in_a ? ' is-on' : '') + '" title="' + escapeAttr(t('compare.in_n_a', { n: r.a_kits_with })) + '">A' + (r.a_kits_with > 1 ? '<small>' + r.a_kits_with + '</small>' : '') + '</span>'
      +   '<span class="cmp-flag k-2' + (r.in_b ? ' is-on' : '') + '" title="' + escapeAttr(t('compare.in_n_b', { n: r.b_kits_with })) + '">B' + (r.b_kits_with > 1 ? '<small>' + r.b_kits_with + '</small>' : '') + '</span>'
      + '</span></a>';
  }).join('') + '</div>';

  return summary + '<h2 class="section-title">' + t('compare.colors_section') + '</h2><p class="muted">' + t('compare.legend_help') + '</p>' + legend + grid;
}

function statBtn(filter, label, value, sub) {
  return '<button type="button" class="stat" data-cmp-filter="' + filter + '">'
    + '<div class="stat-label">' + label + '</div>'
    + '<div class="stat-value">' + value + '</div>'
    + (sub ? '<div class="muted small">' + escapeHtml(sub) + '</div>' : '')
    + '</button>';
}

function renderCompareLegacy(allKits, selIds) {
  var sel = allKits.filter(function (k) { return selIds.indexOf(k.id) !== -1; });
  var byColor = {};
  sel.forEach(function (k) {
    k.color_codes.forEach(function (code) {
      var d = byColor[code] || (byColor[code] = { in_kits: new Set() });
      d.in_kits.add(k.id);
    });
  });
  var rows = Object.keys(byColor).map(function (code) {
    var c = findColor(code); if (!c) return null;
    return { color: c, in_kits: byColor[code].in_kits, shared: byColor[code].in_kits.size };
  }).filter(Boolean).sort(function (x, y) {
    if (x.shared !== y.shared) return y.shared - x.shared;
    return x.color.sort_order - y.color.sort_order;
  });
  var union = rows.length;
  var intersection = rows.filter(function (r) { return r.shared === sel.length; }).length;
  var perKit = {};
  sel.forEach(function (k) { perKit[k.id] = { unique: 0, shared: 0, total: 0 }; });
  rows.forEach(function (r) {
    r.in_kits.forEach(function (kid) {
      perKit[kid].total++;
      if (r.shared === 1) perKit[kid].unique++;
      else perKit[kid].shared++;
    });
  });
  var totalPrice = 0, hasPrice = false;
  sel.forEach(function (k) { if (k.price_brl != null) { totalPrice += k.price_brl; hasPrice = true; } });

  var summary = '<div class="compare-summary">'
    + '<div class="stat"><div class="stat-label">' + t('compare.kits_selected') + '</div><div class="stat-value">' + sel.length + '</div></div>'
    + '<div class="stat"><div class="stat-label">' + t('compare.unique_colors') + '</div><div class="stat-value">' + union + '</div></div>'
    + '<div class="stat"><div class="stat-label">' + t('compare.in_all') + '</div><div class="stat-value">' + intersection + '</div></div>'
    + (hasPrice ? '<div class="stat"><div class="stat-label">' + t('compare.total_cost') + '</div><div class="stat-value">R$ ' + totalPrice.toFixed(2) + '</div></div>'
        + '<div class="stat"><div class="stat-label">' + t('compare.cost_per_color') + '</div><div class="stat-value">' + (union ? 'R$ ' + (totalPrice / union).toFixed(2) : '—') + '</div></div>' : '')
    + '</div>';

  var statsTable = '<div class="table-wrap"><table class="data-table"><thead><tr><th>' + t('detail.kit') + '</th><th class="num">' + t('common.colors') + '</th><th class="num">' + t('compare.exclusive_to_this') + '</th><th class="num">' + t('compare.shared') + '</th><th class="num">' + t('common.price') + '</th><th class="num">' + t('kits.price_per_color') + '</th></tr></thead><tbody>'
    + sel.map(function (k) {
        var pk = perKit[k.id]; var ppc = pricePerColor(k);
        return '<tr><td>' + escapeHtml(k.name) + '</td>'
          + '<td class="num">' + pk.total + '</td>'
          + '<td class="num">' + pk.unique + '</td>'
          + '<td class="num">' + pk.shared + '</td>'
          + '<td class="num">' + (k.price_brl != null ? 'R$ ' + k.price_brl.toFixed(2) : '—') + '</td>'
          + '<td class="num">' + (ppc != null ? 'R$ ' + ppc.toFixed(2) : '—') + '</td>'
          + '</tr>';
      }).join('') + '</tbody></table></div>';

  var legend = '<div class="cmp-legend">' + sel.map(function (k, i) {
    return '<span class="cmp-legend-item"><span class="cmp-flag k-' + (i + 1) + ' is-on">' + (i + 1) + '</span><span class="cmp-legend-name">' + escapeHtml(k.name) + '</span></span>';
  }).join('') + '</div>';

  var grid = '<div class="compare-grid">' + rows.map(function (r) {
    var c = r.color;
    return '<a class="cmp-cell' + (r.shared === sel.length ? ' is-all' : '') + (r.shared === 1 ? ' is-unique' : '') + '"'
      + ' href="#/colors/' + c.code + '" title="' + c.code + ' · em ' + r.shared + '/' + sel.length + ' kits' + (c.hex ? ' · #' + c.hex : '') + '">'
      + '<span class="cmp-chip' + (c.hex ? '' : ' swatch-broken') + '"' + (c.hex ? ' style="background:#' + c.hex + '"' : '') + '>' + (c.hex ? '' : '?') + '</span>'
      + '<span class="cmp-code">' + c.code + '</span>'
      + '<span class="cmp-flags">' + sel.map(function (k, i) {
          return '<span class="cmp-flag k-' + (i + 1) + (r.in_kits.has(k.id) ? ' is-on' : '') + '" title="' + escapeAttr(k.name) + '">' + (i + 1) + '</span>';
        }).join('') + '</span></a>';
  }).join('') + '</div>';

  return summary + statsTable + '<h2 class="section-title">' + t('compare.union_section') + '</h2><p class="muted">' + t('compare.legacy_help') + '</p>' + legend + grid;
}

function attachCompareFilters() {
  var summary = document.getElementById('cmpSummary');
  var grid = document.getElementById('cmpGrid');
  if (!summary || !grid) return;
  var stats = summary.querySelectorAll('.stat[data-cmp-filter]');
  var cells = grid.querySelectorAll('.cmp-cell');
  var current = null;
  function matches(cell, f) {
    var a = cell.dataset.inA === '1', b = cell.dataset.inB === '1';
    var ac = parseInt(cell.dataset.aCount || '0', 10);
    var bc = parseInt(cell.dataset.bCount || '0', 10);
    var kc = parseInt(cell.dataset.kitCount || '0', 10);
    if (f === 'a') return a;
    if (f === 'b') return b;
    if (f === 'both') return a && b;
    if (f === 'a-only') return a && !b;
    if (f === 'b-only') return b && !a;
    if (f === 'a-overlap') return ac >= 2;
    if (f === 'b-overlap') return bc >= 2;
    if (f === 'overlap') return kc >= 2;
    return true;
  }
  function apply(f) {
    cells.forEach(function (c) { c.style.display = matches(c, f) ? '' : 'none'; });
    stats.forEach(function (s) { s.classList.toggle('is-active', f != null && s.dataset.cmpFilter === f); });
  }
  stats.forEach(function (s) {
    s.addEventListener('click', function () {
      var f = s.dataset.cmpFilter;
      if (current === f) { current = null; apply(null); }
      else { current = f; apply(f); }
    });
  });
}

// ============================================================================
// Admin (export/import + reset)
// ============================================================================
function renderAdmin(root) {
  root.innerHTML = ''
    + '<section class="page">'
    +   '<header class="page-header"><div><h1>' + t('admin.title') + '</h1><p class="muted">' + t('admin.subtitle') + '</p></div><a href="#/" class="btn-ghost">' + t('common.back') + '</a></header>'
    +   '<div class="card"><h2 class="section-title">' + t('admin.export_title') + '</h2>'
    +     '<p class="muted small">' + t('admin.export_help') + '</p>'
    +     '<button id="btnExport" class="btn-primary">' + t('admin.export_button') + '</button>'
    +   '</div>'
    +   '<div class="card"><h2 class="section-title">' + t('admin.import_title') + '</h2>'
    +     '<p class="muted small">' + t('admin.import_help') + '</p>'
    +     '<input type="file" id="fileImport" accept=".json,application/json">'
    +     '<button id="btnImport" class="btn-primary">' + t('admin.import_button') + '</button>'
    +   '</div>'
    +   '<div class="card"><h2 class="section-title">' + t('admin.reset_title') + '</h2>'
    +     '<p class="muted small">' + t('admin.reset_help') + '</p>'
    +     '<button id="btnReset" class="btn-ghost">' + t('admin.reset_button') + '</button>'
    +   '</div>'
    +   '<div class="card"><h2 class="section-title">' + t('admin.stats_title') + '</h2>'
    +     '<p>' + t('admin.stats_line', { c: state.colors.length, k: state.kits.length, e: enabledKits().length }) + '</p>'
    +   '</div>'
    + '</section>';

  document.getElementById('btnExport').addEventListener('click', function () {
    var d = new Date(); var date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    downloadJson('ohuhu-' + date + '.json', exportDb());
  });
  document.getElementById('btnImport').addEventListener('click', function () {
    var f = document.getElementById('fileImport').files[0];
    if (!f) { alert(t('admin.import_pick')); return; }
    if (!confirm(t('admin.import_confirm'))) return;
    var fr = new FileReader();
    fr.onload = function () {
      try { var data = JSON.parse(fr.result); importDb(data, true); router(); alert(t('admin.import_done')); }
      catch (e) { alert(t('admin.import_invalid', { err: e.message })); }
    };
    fr.readAsText(f);
  });
  document.getElementById('btnReset').addEventListener('click', function () {
    if (!confirm(t('admin.reset_confirm'))) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  });
}

// ============================================================================
// Boot
// ============================================================================
document.getElementById('theme-toggle').addEventListener('click', function () {
  var current = document.documentElement.getAttribute('data-theme') || 'dark';
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
});

(function () {
  var sel = document.getElementById('lang-select');
  if (!sel) return;
  sel.value = lang;
  sel.addEventListener('change', function () { setLang(sel.value); });
  document.documentElement.setAttribute('lang', lang === 'pt' ? 'pt-BR' : 'en');
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
})();

window.addEventListener('hashchange', router);

loadState().then(router).catch(function (err) {
  document.getElementById('app').innerHTML = '<section class="page"><h1>' + t('admin.error') + '</h1><pre>' + escapeHtml(err.message) + '</pre></section>';
});

})();
