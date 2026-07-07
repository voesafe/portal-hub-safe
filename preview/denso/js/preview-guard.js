// ============================================================
// preview-guard.js — SOMENTE PARA O AMBIENTE DE PREVIEW
// Não faz parte do Hub real. Objetivos:
//  1. Bloquear QUALQUER gravação (salvar/excluir/editar/importar…)
//     para que o preview jamais altere dados de produção.
//  2. Mostrar um switcher flutuante entre os 3 modelos + selo read-only.
// Leitura (GET e POST de consulta) passa normalmente => dados reais.
// ============================================================
(function () {
  'use strict';

  var MODELS = { refinado: 'Refinado', clean: 'Clean', denso: 'Denso' };
  var seg = (location.pathname.match(/\/preview\/(refinado|clean|denso)\//) || [])[1] || '';
  var LABEL = MODELS[seg] || 'Preview';

  // Verbos de escrita — se a "action" bater aqui, a requisição é bloqueada.
  var WRITE = /(^|[-_/])(criar|create|add|adicionar|novo|editar|edit|update|atualizar|salvar|save|set|excluir|delete|deletar|remover|remove|apagar|alterar|change|importar|import|reenviar|resend|resetar|reset|forcar|force|marcar|mark|inativar|reativar|sincron|sync|upload|enviar-email)/i;

  function getAction(url, init) {
    try {
      var u = new URL(url, location.href);
      var a = u.searchParams.get('action');
      if (a) return a;
    } catch (e) {}
    try {
      if (init && typeof init.body === 'string') {
        var j = JSON.parse(init.body);
        if (j && j.action) return j.action;
      }
    } catch (e) {}
    return '';
  }

  var _fetch = window.fetch ? window.fetch.bind(window) : null;
  if (_fetch) {
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = ((init && init.method) || (typeof input === 'object' && input && input.method) || 'GET').toUpperCase();
      var action = getAction(url, init);
      var isBackend = /script\.google\.com/i.test(url);
      if (isBackend && (method === 'POST' || method === 'PUT' || method === 'DELETE') && WRITE.test(action)) {
        console.warn('[PREVIEW] gravação bloqueada:', action || method, url);
        flash('Modo preview: gravação desativada (somente leitura).');
        return Promise.resolve(new Response(
          JSON.stringify({ ok: false, error: 'preview-readonly: gravação desativada neste ambiente de teste.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));
      }
      return _fetch(input, init);
    };
  }

  // Bloqueia também XMLHttpRequest de escrita (por garantia)
  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__pv = { m: (m || '').toUpperCase(), u: u || '' }; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    var pv = this.__pv || {};
    var action = getAction(pv.u, { body: typeof body === 'string' ? body : '' });
    if (/script\.google\.com/i.test(pv.u) && pv.m !== 'GET' && WRITE.test(action)) {
      console.warn('[PREVIEW] XHR gravação bloqueada:', action);
      flash('Modo preview: gravação desativada (somente leitura).');
      var self = this;
      Object.defineProperty(self, 'responseText', { get: function () { return '{"ok":false,"error":"preview-readonly"}'; } });
      Object.defineProperty(self, 'status', { get: function () { return 200; } });
      setTimeout(function () { self.onload && self.onload(); self.onreadystatechange && self.onreadystatechange(); }, 0);
      return;
    }
    return _send.apply(this, arguments);
  };

  var flashEl = null, flashTimer = null;
  function flash(msg) {
    if (!document.body) return;
    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.style.cssText = 'position:fixed;bottom:70px;right:16px;z-index:100000;background:#E74C3C;color:#fff;font:600 12px/1.3 Montserrat,system-ui,sans-serif;padding:11px 15px;border-radius:10px;box-shadow:0 8px 24px rgba(20,26,40,.35);max-width:280px';
      document.body.appendChild(flashEl);
    }
    flashEl.textContent = msg;
    flashEl.style.opacity = '1';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { if (flashEl) flashEl.style.opacity = '0'; }, 2600);
    flashEl.style.transition = 'opacity .3s';
  }

  function urlFor(model) {
    return location.pathname.replace(/\/preview\/(refinado|clean|denso)\//, '/preview/' + model + '/') + location.search;
  }

  function buildBar() {
    if (!document.body || document.getElementById('pv-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'pv-bar';
    bar.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:99999;display:flex;align-items:center;gap:8px;background:#141d3a;color:#fff;padding:7px 8px 7px 14px;border-radius:100px;box-shadow:0 10px 30px rgba(20,26,40,.4);font:600 12px/1 Montserrat,system-ui,sans-serif';
    var dot = '<span style="width:7px;height:7px;border-radius:50%;background:#60C0BF;display:inline-block;margin-right:2px"></span>';
    var chips = '';
    ['refinado', 'clean', 'denso'].forEach(function (m) {
      var active = (m === seg);
      chips += '<a href="' + urlFor(m) + '" style="text-decoration:none;padding:5px 11px;border-radius:100px;font-weight:700;letter-spacing:.02em;' +
        (active ? 'background:#5BAEE2;color:#141d3a;' : 'color:#9fb0cf;') + '">' + MODELS[m] + '</a>';
    });
    bar.innerHTML = dot + '<span style="color:#9fb0cf;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:10px;margin-right:2px">Preview · leitura</span>' +
      '<span style="display:flex;gap:2px;background:rgba(255,255,255,.06);padding:2px;border-radius:100px">' + chips + '</span>' +
      '<a href="/preview/index.html" title="Comparar" style="text-decoration:none;color:#9fb0cf;padding:5px 8px;font-size:14px">⌂</a>';
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildBar);
  } else {
    buildBar();
  }
})();
