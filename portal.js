/* ============================================================================
   VENTANILLA DEPORTIVA DIMAYOR — Portal de los clubes (portal.js)

   Se usa en WordPress (Bricks, elemento "Código") con este bloque:

     <div id="vd-portal" data-api="URL_DE_LA_APLICACION_WEB/exec"></div>
     <script src="URL_DONDE_ESTE_ESTE_ARCHIVO/portal.js"></script>

   O pegando todo este archivo dentro de <script>...</script> debajo del <div>.
   Todo el diseño queda aislado dentro de #vd-portal (clases con prefijo vd-),
   así que no afecta ni se ve afectado por el tema de la página.
   ============================================================================ */
(function () {
  'use strict';

  var raiz = document.getElementById('vd-portal');
  if (!raiz || raiz.getAttribute('data-vd-listo')) return;
  raiz.setAttribute('data-vd-listo', '1');

  var API = (raiz.getAttribute('data-api') || window.VD_API_URL || '').trim();
  var LOGO_BLANCO = 'https://lh3.googleusercontent.com/d/1l4mdgdoIJxuPBRY8VDhhC-AJQW6vgdWr';

  var TIPOS_INFO = {
    puerta_cerrada:     { icono: '🔒', desc: 'Autorización para disputar el partido sin público en el estadio.' },
    actividad_especial: { icono: '🎉', desc: 'Actos, homenajes, activaciones o eventos en el estadio el día del partido.' },
    amistoso:           { icono: '🤝', desc: 'Programación de un partido amistoso que no está en el calendario oficial.' }
  };

  // ---------------------------------------------------------------- estado
  var S = {
    pestana: 'nueva',      // nueva | consultar
    vista: 'cargando',     // cargando | error | tipos | partidos | formulario | exito | consultar | detalle
    sesion: null,
    partidos: [],
    desfase: 0,            // diferencia entre la hora del servidor y la del navegador
    tipo: null,
    partido: null,
    filtroComp: '',
    busqueda: '',
    form: {},
    archivos: [],
    errores: {},
    errorGeneral: '',
    enviando: false,
    resultado: null,
    detalle: null,
    consulta: { consecutivo: '', correo: '' },
    comentario: '',
    cargandoPartidos: false
  };

  // ---------------------------------------------------------------- utilidades
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function iniciales(s) {
    var p = String(s || '').replace(/\b(fc|f\.c\.|s\.a\.|sa|club|deportivo)\b/gi, '').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }
  function ahora() { return Date.now() + S.desfase; }
  function duracion(ms) {
    if (ms <= 0) return '0 min';
    var min = Math.floor(ms / 60000), d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d > 0) return d + ' d ' + h + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    return m + ' min';
  }
  function fechaHora(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
    } catch (e) { return iso; }
  }
  function hoyBogota(sumarDias) {
    var d = new Date(ahora() - 5 * 3600000 + (sumarDias || 0) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function tamano(bytes) {
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }
  function guardar(k, v) { try { localStorage.setItem('vd_' + k, JSON.stringify(v)); } catch (e) {} }
  function leer(k) { try { return JSON.parse(localStorage.getItem('vd_' + k) || 'null'); } catch (e) { return null; } }
  function tipoActual() {
    return (S.sesion && S.sesion.tipos || []).filter(function (t) { return t.clave === S.tipo; })[0] || null;
  }
  function escudo(nombre, clase) {
    var base = S.sesion && S.sesion.escudosBase;
    var ini = '<span class="vd-escudo-ini ' + (clase || '') + '">' + esc(iniciales(nombre)) + '</span>';
    if (!base) return ini;
    // Si la imagen no existe, se reemplaza por las iniciales
    return '<span class="vd-escudo ' + (clase || '') + '" data-ini="' + esc(ini) + '">' +
      '<img src="' + esc(base + slug(nombre) + '.png') + '" alt="" loading="lazy" ' +
      'onerror="this.parentNode.outerHTML=this.parentNode.getAttribute(\'data-ini\')"></span>';
  }

  // ---------------------------------------------------------------- API
  function apiGet(params) {
    var qs = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API + (API.indexOf('?') > -1 ? '&' : '?') + qs, { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.json(); });
  }
  function apiPost(body) {
    return fetch(API, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  // ---------------------------------------------------------------- estilos
  function estilos() {
    if (!document.getElementById('vd-fuentes')) {
      var l = document.createElement('link');
      l.id = 'vd-fuentes'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap';
      document.head.appendChild(l);
    }
    if (document.getElementById('vd-estilos')) return;
    var css = [
      '#vd-portal{--vd-azul:#004c99;--vd-azul2:#0063cc;--vd-azul3:#003578;--vd-fondo:#f0f4f8;--vd-card:#fff;--vd-texto:#0f172a;--vd-suave:#64748b;--vd-linea:#e2e8f0;--vd-verde:#059669;--vd-verde-bg:#ecfdf5;--vd-ambar:#b45309;--vd-ambar-bg:#fffbeb;--vd-rojo:#dc2626;--vd-rojo-bg:#fef2f2;--vd-azul-bg:#eff6ff;--vd-radio:14px;',
      'color-scheme:light;font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:var(--vd-texto);background:var(--vd-fondo);border-radius:18px;overflow:hidden;line-height:1.5;font-size:15px;text-align:left}',
      '#vd-portal *,#vd-portal *::before,#vd-portal *::after{box-sizing:border-box}',
      '#vd-portal h1,#vd-portal h2,#vd-portal h3,#vd-portal p{margin:0;padding:0;font-family:inherit;letter-spacing:normal;text-transform:none}',
      '#vd-portal button,#vd-portal input,#vd-portal textarea,#vd-portal select{font-family:inherit;font-size:15px;color:var(--vd-texto);margin:0}',
      '#vd-portal button{cursor:pointer;border:0;background:none;padding:0;line-height:1.3;text-transform:none;letter-spacing:normal;box-shadow:none}',
      '#vd-portal a{color:var(--vd-azul);text-decoration:none}',
      '#vd-portal img{max-width:none;border:0;box-shadow:none;margin:0}',
      '#vd-portal .vd-cab{background:linear-gradient(135deg,var(--vd-azul3),var(--vd-azul) 60%,var(--vd-azul2));color:#fff;padding:26px 28px 0;position:relative;overflow:hidden}',
      '#vd-portal .vd-cab::after{content:"";position:absolute;right:-60px;top:-80px;width:280px;height:280px;border-radius:50%;background:rgba(255,255,255,.06)}',
      '#vd-portal .vd-cab-top{display:flex;align-items:center;gap:16px;position:relative;z-index:1}',
      '#vd-portal .vd-cab-logo{height:34px;width:auto}',
      '#vd-portal .vd-cab-sep{width:1px;height:34px;background:rgba(255,255,255,.35)}',
      '#vd-portal .vd-cab h1{font-size:22px;font-weight:700;color:#fff;line-height:1.15}',
      '#vd-portal .vd-cab-sub{font-size:13px;color:rgba(255,255,255,.8)}',
      '#vd-portal .vd-tabs{display:flex;gap:4px;margin-top:22px;position:relative;z-index:1}',
      '#vd-portal .vd-tab{padding:11px 18px;border-radius:10px 10px 0 0;color:rgba(255,255,255,.85);font-weight:600;font-size:14px}',
      '#vd-portal .vd-tab:hover{background:rgba(255,255,255,.1)}',
      '#vd-portal .vd-tab.vd-activo{background:var(--vd-fondo);color:var(--vd-azul)}',
      '#vd-portal .vd-cuerpo{padding:24px 28px 32px;min-height:340px}',
      '#vd-portal .vd-pasos{display:flex;gap:6px;align-items:center;margin-bottom:20px;flex-wrap:wrap;font-size:13px;color:var(--vd-suave)}',
      '#vd-portal .vd-paso{display:flex;align-items:center;gap:6px}',
      '#vd-portal .vd-paso b{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--vd-linea);color:var(--vd-suave);font-size:12px}',
      '#vd-portal .vd-paso.vd-hecho b{background:var(--vd-verde);color:#fff}',
      '#vd-portal .vd-paso.vd-actual{color:var(--vd-azul);font-weight:600}',
      '#vd-portal .vd-paso.vd-actual b{background:var(--vd-azul);color:#fff}',
      '#vd-portal .vd-paso-linea{width:22px;height:2px;background:var(--vd-linea)}',
      '#vd-portal .vd-titulo{font-size:20px;font-weight:700;margin-bottom:4px}',
      '#vd-portal .vd-texto-suave{color:var(--vd-suave);font-size:14px}',
      '#vd-portal .vd-grid-tipos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:18px}',
      '#vd-portal .vd-tipo{background:var(--vd-card);border:2px solid var(--vd-linea);border-radius:var(--vd-radio);padding:20px;text-align:left;display:flex;flex-direction:column;gap:8px;transition:border-color .15s,transform .15s,box-shadow .15s;width:100%}',
      '#vd-portal .vd-tipo:hover{border-color:var(--vd-azul2);transform:translateY(-2px);box-shadow:0 8px 24px rgba(15,23,42,.08)}',
      '#vd-portal .vd-tipo-icono{font-size:30px;line-height:1}',
      '#vd-portal .vd-tipo-nombre{font-size:17px;font-weight:700;color:var(--vd-azul)}',
      '#vd-portal .vd-tipo-desc{font-size:14px;color:var(--vd-suave)}',
      '#vd-portal .vd-chips-info{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:6px}',
      '#vd-portal .vd-chip{font-size:12px;padding:4px 9px;border-radius:999px;background:var(--vd-azul-bg);color:var(--vd-azul);font-weight:600;white-space:nowrap}',
      '#vd-portal .vd-chip.vd-gris{background:#f1f5f9;color:var(--vd-suave)}',
      '#vd-portal .vd-aviso{border-radius:12px;padding:12px 14px;font-size:14px;margin:14px 0;display:flex;gap:10px;align-items:flex-start}',
      '#vd-portal .vd-aviso-info{background:var(--vd-azul-bg);color:#1e3a8a}',
      '#vd-portal .vd-aviso-error{background:var(--vd-rojo-bg);color:#991b1b;border:1px solid #fecaca}',
      '#vd-portal .vd-aviso-ok{background:var(--vd-verde-bg);color:#065f46}',
      '#vd-portal .vd-filtros{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:16px 0 6px}',
      '#vd-portal .vd-filtro{padding:7px 13px;border-radius:999px;border:1px solid var(--vd-linea);background:var(--vd-card);font-size:13px;font-weight:600;color:var(--vd-suave);display:inline-flex;align-items:center;gap:6px}',
      '#vd-portal .vd-filtro.vd-activo{background:var(--vd-azul);border-color:var(--vd-azul);color:#fff}',
      '#vd-portal .vd-filtro img{height:16px;width:auto}',
      '#vd-portal .vd-buscar{flex:1;min-width:200px;padding:9px 14px;border:1px solid var(--vd-linea);border-radius:999px;background:var(--vd-card)}',
      '#vd-portal .vd-dia{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--vd-suave);margin:22px 0 10px}',
      '#vd-portal .vd-grid-partidos{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}',
      '#vd-portal .vd-partido{background:var(--vd-card);border-radius:var(--vd-radio);box-shadow:0 1px 3px rgba(15,23,42,.08);border-top:4px solid var(--vd-c,#004c99);display:flex;flex-direction:column}',
      '#vd-portal .vd-partido.vd-apagado{opacity:.72}',
      '#vd-portal .vd-p-cab{display:flex;align-items:center;gap:8px;padding:12px 14px 0;font-size:12px;color:var(--vd-suave);font-weight:600}',
      '#vd-portal .vd-p-cab img{height:20px;width:auto}',
      '#vd-portal .vd-p-cab .vd-jornada{margin-left:auto;background:#f1f5f9;padding:2px 8px;border-radius:6px}',
      '#vd-portal .vd-equipos{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:14px}',
      '#vd-portal .vd-equipo{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;font-weight:700;font-size:14px;line-height:1.2}',
      '#vd-portal .vd-equipo small{font-weight:600;font-size:11px;color:var(--vd-azul);background:var(--vd-azul-bg);padding:1px 7px;border-radius:6px}',
      '#vd-portal .vd-vs{font-size:12px;color:var(--vd-suave);font-weight:700}',
      '#vd-portal .vd-escudo,#vd-portal .vd-escudo-ini{width:46px;height:46px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
      '#vd-portal .vd-escudo img{max-width:46px;max-height:46px;width:auto;height:auto}',
      '#vd-portal .vd-escudo-ini{border-radius:50%;background:linear-gradient(135deg,#e2e8f0,#cbd5e1);color:#334155;font-weight:700;font-size:15px}',
      '#vd-portal .vd-escudo.vd-chico,#vd-portal .vd-escudo-ini.vd-chico{width:30px;height:30px;font-size:11px}',
      '#vd-portal .vd-escudo.vd-chico img{max-width:30px;max-height:30px}',
      '#vd-portal .vd-p-meta{display:flex;flex-wrap:wrap;gap:4px 14px;padding:0 14px 12px;font-size:13px;color:var(--vd-suave)}',
      '#vd-portal .vd-p-pie{margin-top:auto;border-top:1px solid var(--vd-linea);padding:12px 14px;display:flex;align-items:center;gap:10px;justify-content:space-between}',
      '#vd-portal .vd-estado{font-size:13px;font-weight:600;line-height:1.3}',
      '#vd-portal .vd-estado small{display:block;font-weight:500;color:var(--vd-suave);font-size:12px}',
      '#vd-portal .vd-estado.vd-abierta{color:var(--vd-verde)}',
      '#vd-portal .vd-estado.vd-por_abrir{color:var(--vd-ambar)}',
      '#vd-portal .vd-estado.vd-cerrada,#vd-portal .vd-estado.vd-bloqueado{color:var(--vd-suave)}',
      '#vd-portal .vd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 20px;border-radius:10px;font-weight:700;font-size:14px;transition:background .15s,opacity .15s;text-decoration:none;white-space:nowrap}',
      '#vd-portal .vd-btn-pri{background:var(--vd-azul);color:#fff}',
      '#vd-portal .vd-btn-pri:hover{background:var(--vd-azul3)}',
      '#vd-portal .vd-btn-sec{background:var(--vd-card);color:var(--vd-azul);border:1px solid #c7d7ee}',
      '#vd-portal .vd-btn-sec:hover{background:var(--vd-azul-bg)}',
      '#vd-portal .vd-btn[disabled]{opacity:.45;cursor:not-allowed}',
      '#vd-portal .vd-btn-chico{padding:8px 14px;font-size:13px}',
      '#vd-portal .vd-link{color:var(--vd-azul);font-weight:600;font-size:14px}',
      '#vd-portal .vd-volver{display:inline-flex;gap:6px;align-items:center;color:var(--vd-azul);font-weight:600;font-size:14px;margin-bottom:14px}',
      '#vd-portal .vd-card{background:var(--vd-card);border-radius:var(--vd-radio);box-shadow:0 1px 3px rgba(15,23,42,.08);padding:20px;margin-bottom:16px}',
      '#vd-portal .vd-card-titulo{font-size:15px;font-weight:700;color:var(--vd-azul);margin-bottom:14px;padding-left:10px;border-left:4px solid var(--vd-azul)}',
      '#vd-portal .vd-resumen{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 20px}',
      '#vd-portal .vd-dato label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--vd-suave);margin-bottom:2px}',
      '#vd-portal .vd-dato div{font-size:15px;font-weight:600;white-space:pre-wrap;word-break:break-word}',
      '#vd-portal .vd-campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px 18px}',
      '#vd-portal .vd-campo{display:flex;flex-direction:column;gap:5px}',
      '#vd-portal .vd-campo.vd-ancho{grid-column:1/-1}',
      '#vd-portal .vd-campo label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#334155}',
      '#vd-portal .vd-campo label i{color:var(--vd-rojo);font-style:normal}',
      '#vd-portal .vd-input{width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;min-height:44px}',
      '#vd-portal textarea.vd-input{min-height:110px;resize:vertical;line-height:1.5}',
      '#vd-portal .vd-input:focus{border-color:var(--vd-azul2);box-shadow:0 0 0 3px rgba(0,99,204,.15)}',
      '#vd-portal .vd-input.vd-mal{border-color:var(--vd-rojo);background:#fffafa}',
      '#vd-portal .vd-error-campo{color:var(--vd-rojo);font-size:12px;font-weight:600}',
      '#vd-portal .vd-ayuda{color:var(--vd-suave);font-size:12px}',
      '#vd-portal .vd-subir{border:2px dashed #c7d7ee;border-radius:12px;padding:18px;text-align:center;background:#f8fbff;color:var(--vd-suave);font-size:14px;cursor:pointer;display:block}',
      '#vd-portal .vd-subir:hover{border-color:var(--vd-azul2)}',
      '#vd-portal .vd-subir input{display:none}',
      '#vd-portal .vd-archivos{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}',
      '#vd-portal .vd-archivos li{display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid var(--vd-linea);border-radius:10px;padding:8px 12px;font-size:14px;margin:0}',
      '#vd-portal .vd-archivos li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#vd-portal .vd-archivos li em{color:var(--vd-suave);font-style:normal;font-size:12px}',
      '#vd-portal .vd-quitar{color:var(--vd-rojo);font-weight:700;font-size:13px}',
      '#vd-portal .vd-check{display:flex;gap:10px;align-items:flex-start;font-size:14px;cursor:pointer}',
      '#vd-portal .vd-check input{width:18px;height:18px;margin-top:2px;flex-shrink:0;accent-color:var(--vd-azul)}',
      '#vd-portal .vd-acciones{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px}',
      '#vd-portal .vd-exito{text-align:center;padding:24px 10px}',
      '#vd-portal .vd-exito-icono{width:74px;height:74px;border-radius:50%;background:var(--vd-verde-bg);color:var(--vd-verde);display:inline-flex;align-items:center;justify-content:center;font-size:38px;margin-bottom:14px}',
      '#vd-portal .vd-radicado{font-family:"DM Mono",ui-monospace,monospace;font-size:34px;font-weight:500;color:var(--vd-azul);margin:6px 0 8px;letter-spacing:.02em}',
      '#vd-portal .vd-exito .vd-acciones{justify-content:center}',
      '#vd-portal .vd-areas{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}',
      '#vd-portal .vd-area{border-radius:12px;padding:14px;border:1px solid var(--vd-linea);background:#fff}',
      '#vd-portal .vd-area-cab{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}',
      '#vd-portal .vd-area-nombre{font-weight:700}',
      '#vd-portal .vd-badge{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap}',
      '#vd-portal .vd-b-pendiente{background:var(--vd-ambar-bg);color:var(--vd-ambar)}',
      '#vd-portal .vd-b-aprobado{background:var(--vd-verde-bg);color:var(--vd-verde)}',
      '#vd-portal .vd-b-no_aprobado{background:var(--vd-rojo-bg);color:var(--vd-rojo)}',
      '#vd-portal .vd-area p{font-size:14px;color:#334155;white-space:pre-wrap}',
      '#vd-portal .vd-area small{color:var(--vd-suave);font-size:12px;display:block;margin-top:6px}',
      '#vd-portal .vd-hilo{display:flex;flex-direction:column;gap:10px}',
      '#vd-portal .vd-msg{max-width:85%;padding:11px 14px;border-radius:14px;font-size:14px}',
      '#vd-portal .vd-msg-club{align-self:flex-end;background:var(--vd-verde-bg);border:1px solid #a7f3d0;border-bottom-right-radius:4px}',
      '#vd-portal .vd-msg-dimayor{align-self:flex-start;background:var(--vd-azul-bg);border:1px solid #c7d7ee;border-bottom-left-radius:4px}',
      '#vd-portal .vd-msg-quien{font-size:12px;color:var(--vd-suave);margin-bottom:3px}',
      '#vd-portal .vd-msg-quien b{color:var(--vd-texto)}',
      '#vd-portal .vd-msg-texto{white-space:pre-wrap;word-break:break-word}',
      '#vd-portal .vd-vacio{text-align:center;padding:40px 10px;color:var(--vd-suave)}',
      '#vd-portal .vd-vacio b{display:block;font-size:34px;margin-bottom:8px}',
      '#vd-portal .vd-cargando{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 10px;color:var(--vd-suave)}',
      '#vd-portal .vd-spin{width:34px;height:34px;border:3px solid #c7d7ee;border-top-color:var(--vd-azul);border-radius:50%;animation:vdgiro .8s linear infinite}',
      '#vd-portal .vd-spin.vd-blanco{border-color:rgba(255,255,255,.35);border-top-color:#fff;width:18px;height:18px;border-width:2px}',
      '@keyframes vdgiro{to{transform:rotate(360deg)}}',
      '#vd-portal .vd-capa{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px}',
      '#vd-portal .vd-capa-caja{background:#fff;border-radius:16px;padding:28px 30px;text-align:center;max-width:360px;display:flex;flex-direction:column;align-items:center;gap:12px}',
      '#vd-portal .vd-adjuntos{display:flex;flex-wrap:wrap;gap:8px}',
      '#vd-portal .vd-fade{animation:vdaparece .25s ease}',
      '@keyframes vdaparece{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '@media (max-width:640px){',
      '#vd-portal{border-radius:0;font-size:15px}',
      '#vd-portal .vd-cab{padding:18px 16px 0}',
      '#vd-portal .vd-cab h1{font-size:18px}',
      '#vd-portal .vd-cab-logo{height:26px}',
      '#vd-portal .vd-cuerpo{padding:18px 16px 26px}',
      '#vd-portal .vd-tab{padding:10px 12px;font-size:13px;flex:1;text-align:center}',
      '#vd-portal .vd-grid-partidos{grid-template-columns:1fr}',
      '#vd-portal .vd-p-pie{flex-direction:column;align-items:stretch}',
      '#vd-portal .vd-p-pie .vd-btn{width:100%}',
      '#vd-portal .vd-acciones .vd-btn{flex:1}',
      '#vd-portal .vd-radicado{font-size:28px}',
      '#vd-portal .vd-msg{max-width:95%}',
      '#vd-portal .vd-paso-linea{display:none}',
      '}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'vd-estilos';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- piezas
  function cabecera() {
    return '<div class="vd-cab"><div class="vd-cab-top">' +
      '<img class="vd-cab-logo" src="' + LOGO_BLANCO + '" alt="DIMAYOR">' +
      '<span class="vd-cab-sep"></span>' +
      '<div><h1>Ventanilla Deportiva</h1><div class="vd-cab-sub">Solicitudes de los clubes</div></div></div>' +
      '<div class="vd-tabs">' +
        '<button class="vd-tab' + (S.pestana === 'nueva' ? ' vd-activo' : '') + '" data-accion="pestana" data-valor="nueva">📝 Nueva solicitud</button>' +
        '<button class="vd-tab' + (S.pestana === 'consultar' ? ' vd-activo' : '') + '" data-accion="pestana" data-valor="consultar">🔎 Consultar solicitud</button>' +
      '</div></div>';
  }

  function pasos(actual) {
    var t = tipoActual();
    var lista = ['Tipo', 'Partido', 'Datos', 'Listo'];
    if (t && !t.requierePartido) lista = ['Tipo', 'Datos', 'Listo'];
    return '<div class="vd-pasos">' + lista.map(function (n, i) {
      var cls = i < actual ? ' vd-hecho' : (i === actual ? ' vd-actual' : '');
      return (i ? '<span class="vd-paso-linea"></span>' : '') +
        '<span class="vd-paso' + cls + '"><b>' + (i < actual ? '✓' : i + 1) + '</b>' + n + '</span>';
    }).join('') + '</div>';
  }

  function textoRegla(t) {
    var r = S.sesion.reglas;
    return t.ventana
      ? 'Abre ' + r.diasApertura + ' días antes del partido y cierra ' + String(r.textoCierre).replace(/\.?$/, '.')
      : 'Sin plazo especial.';
  }

  function estadoVentana(p) {
    if (S.tipo && (p.tiposBloqueados || []).indexOf(S.tipo) > -1) {
      return { clase: 'bloqueado', html: '✔️ Ya tiene una solicitud de este tipo', puede: false };
    }
    var v = p.ventana, t = ahora();
    var abre = new Date(v.abre).getTime(), cierra = new Date(v.cierra).getTime();
    if (t < abre) return { clase: 'por_abrir', html: '🔒 Abre en ' + duracion(abre - t) + '<small>' + esc(v.abreTexto) + '</small>', puede: false };
    if (t < cierra) return { clase: 'abierta', html: '🟢 Abierta · cierra en ' + duracion(cierra - t) + '<small>Hasta el ' + esc(v.cierraTexto) + '</small>', puede: true };
    return { clase: 'cerrada', html: '⛔ Plazo cerrado<small>Cerró el ' + esc(v.cierraTexto) + '</small>', puede: false };
  }

  function tarjetaPartido(p, conBoton) {
    var est = estadoVentana(p);
    return '<div class="vd-partido' + (est.puede || !conBoton ? '' : ' vd-apagado') + '" style="--vd-c:' + esc(p.color || '#004c99') + '">' +
      '<div class="vd-p-cab">' + (p.logo ? '<img src="' + esc(p.logo) + '" alt="">' : '') + esc(p.competencia) +
        (p.jornada ? '<span class="vd-jornada">' + esc(p.jornada) + '</span>' : '') + '</div>' +
      '<div class="vd-equipos">' +
        '<div class="vd-equipo">' + escudo(p.local) + esc(p.local) + '<small>Local</small></div>' +
        '<div class="vd-vs">VS</div>' +
        '<div class="vd-equipo">' + escudo(p.visitante) + esc(p.visitante) + '</div>' +
      '</div>' +
      '<div class="vd-p-meta"><span>📅 ' + esc(p.fechaTexto) + '</span><span>🕒 ' + esc(p.horaTexto) + '</span>' +
        (p.ubicacion ? '<span>🏟️ ' + esc(p.ubicacion) + '</span>' : '') + '</div>' +
      (conBoton ? '<div class="vd-p-pie"><div class="vd-estado vd-' + est.clase + '">' + est.html + '</div>' +
        '<button class="vd-btn vd-btn-pri vd-btn-chico" data-accion="elegir-partido" data-id="' + esc(p.calendarEventId) + '"' + (est.puede ? '' : ' disabled') + '>Solicitar →</button></div>' : '') +
    '</div>';
  }

  function capaEnvio(texto) {
    return '<div class="vd-capa"><div class="vd-capa-caja"><div class="vd-spin"></div><b>' + esc(texto) + '</b>' +
      '<span class="vd-texto-suave">Esto puede tardar unos segundos. No cierres esta página.</span></div></div>';
  }

  // ---------------------------------------------------------------- vistas
  function vistaCargando(txt) {
    return '<div class="vd-cargando"><div class="vd-spin"></div>' + esc(txt || 'Cargando…') + '</div>';
  }

  function vistaError() {
    return '<div class="vd-vacio"><b>⚠️</b>' + esc(S.errorGeneral || 'No se pudo conectar con la Ventanilla.') +
      '<div class="vd-acciones" style="justify-content:center"><button class="vd-btn vd-btn-pri" data-accion="reintentar">Intentar de nuevo</button></div></div>';
  }

  function vistaTipos() {
    var tipos = S.sesion.tipos;
    return pasos(0) + '<h2 class="vd-titulo">¿Qué necesitas solicitar?</h2>' +
      '<p class="vd-texto-suave">Elige el tipo de solicitud. Recibirás un correo con el radicado y con cada respuesta de DIMAYOR.</p>' +
      '<div class="vd-grid-tipos">' + tipos.map(function (t) {
        var info = TIPOS_INFO[t.clave] || { icono: '📄', desc: '' };
        return '<button class="vd-tipo" data-accion="elegir-tipo" data-valor="' + esc(t.clave) + '">' +
          '<span class="vd-tipo-icono">' + info.icono + '</span>' +
          '<span class="vd-tipo-nombre">' + esc(t.nombre) + '</span>' +
          '<span class="vd-tipo-desc">' + esc(info.desc) + '</span>' +
          '<span class="vd-chips-info">' +
            (t.soloLocal ? '<span class="vd-chip">Solo equipo local</span>' : '') +
            '<span class="vd-chip vd-gris">Responde: ' + esc(t.areas.join(' y ')) + '</span>' +
          '</span>' +
          '<span class="vd-ayuda">' + esc(textoRegla(t)) + '</span>' +
        '</button>';
      }).join('') + '</div>';
  }

  function partidosFiltrados() {
    var q = slug(S.busqueda).replace(/-/g, ' ');
    return S.partidos.filter(function (p) {
      if (S.filtroComp && p.competencia !== S.filtroComp) return false;
      if (q && slug([p.local, p.visitante, p.ubicacion, p.competencia].join(' ')).replace(/-/g, ' ').indexOf(q) === -1) return false;
      return true;
    });
  }

  function vistaPartidos() {
    var t = tipoActual();
    var html = '<button class="vd-volver" data-accion="ir" data-valor="tipos">← Cambiar tipo de solicitud</button>' + pasos(1) +
      '<h2 class="vd-titulo">' + (TIPOS_INFO[t.clave] || {}).icono + ' ' + esc(t.nombre) + ': elige el partido</h2>' +
      '<div class="vd-aviso vd-aviso-info"><span>ℹ️</span><span>Solo el <b>equipo local</b> puede hacer esta solicitud y queda radicada a su nombre. ' +
        esc(textoRegla(t)) + '</span></div>';

    if (S.cargandoPartidos && !S.partidos.length) return html + vistaCargando('Consultando partidos…');

    var comps = [];
    S.partidos.forEach(function (p) { if (comps.indexOf(p.competencia) === -1) comps.push(p.competencia); });
    var info = {};
    (S.sesion.competencias || []).forEach(function (c) { info[c.nombre] = c; });

    html += '<div class="vd-filtros">' +
      '<button class="vd-filtro' + (!S.filtroComp ? ' vd-activo' : '') + '" data-accion="filtro" data-valor="">Todas</button>' +
      comps.map(function (c) {
        return '<button class="vd-filtro' + (S.filtroComp === c ? ' vd-activo' : '') + '" data-accion="filtro" data-valor="' + esc(c) + '">' +
          (info[c] && info[c].logo ? '<img src="' + esc(info[c].logo) + '" alt="">' : '') + esc(c.replace(' BetPlay Dimayor', '')) + '</button>';
      }).join('') +
      '<input class="vd-buscar" type="search" placeholder="🔍 Buscar equipo o estadio" data-campo-busqueda value="' + esc(S.busqueda) + '">' +
    '</div>';

    var lista = partidosFiltrados();
    if (!lista.length) {
      return html + '<div class="vd-vacio"><b>📭</b>' + (S.partidos.length ? 'Ningún partido coincide con el filtro.' : 'No hay partidos programados en los próximos días.') + '</div>';
    }
    // Primero los que se pueden solicitar ahora; dentro de cada grupo, por fecha
    var grupos = {}, orden = [];
    lista.forEach(function (p) {
      if (!grupos[p.fechaTexto]) { grupos[p.fechaTexto] = []; orden.push(p.fechaTexto); }
      grupos[p.fechaTexto].push(p);
    });
    html += '<div data-zona-partidos>' + orden.map(function (dia) {
      return '<div class="vd-dia">' + esc(dia) + '</div><div class="vd-grid-partidos">' +
        grupos[dia].map(function (p) { return tarjetaPartido(p, true); }).join('') + '</div>';
    }).join('') + '</div>';
    return html;
  }

  function inputCampo(c, prefijo) {
    var id = 'vd-' + prefijo + '-' + c.clave;
    var valor = S.form[c.clave] || '';
    var err = S.errores[c.clave];
    var largo = c.tipo === 'texto' && c.max && c.max > 300;
    var attrs = ' id="' + id + '" class="vd-input' + (err ? ' vd-mal' : '') + '" data-campo="' + esc(c.clave) + '"' +
      (c.max ? ' maxlength="' + c.max + '"' : '') + (c.obligatorio ? ' required' : '');
    var control;
    if (largo) control = '<textarea' + attrs + ' rows="4">' + esc(valor) + '</textarea>';
    else {
      var tipo = { hora: 'time', fecha: 'date', numero: 'number', correo: 'email' }[c.tipo] || 'text';
      var extra = c.tipo === 'fecha' ? ' min="' + hoyBogota(1) + '"' : (c.tipo === 'numero' ? ' min="0" step="1" inputmode="numeric"' : '');
      if (c.clave === 'celular') extra += ' inputmode="tel"';
      control = '<input type="' + tipo + '"' + attrs + extra + ' value="' + esc(valor) + '">';
    }
    return '<div class="vd-campo' + (largo ? ' vd-ancho' : '') + '"><label for="' + id + '">' + esc(c.etiqueta) + (c.obligatorio ? ' <i>*</i>' : '') + '</label>' +
      control + (err ? '<span class="vd-error-campo">' + esc(err) + '</span>' : '') + '</div>';
  }

  function vistaFormulario() {
    var t = tipoActual();
    var p = S.partido;
    var r = S.sesion.reglas;
    var html = '<button class="vd-volver" data-accion="ir" data-valor="' + (t.requierePartido ? 'partidos' : 'tipos') + '">← ' +
      (t.requierePartido ? 'Cambiar partido' : 'Cambiar tipo de solicitud') + '</button>' + pasos(t.requierePartido ? 2 : 1) +
      '<h2 class="vd-titulo">' + (TIPOS_INFO[t.clave] || {}).icono + ' ' + esc(t.nombre) + '</h2>';

    if (S.errorGeneral) html += '<div class="vd-aviso vd-aviso-error"><span>⚠️</span><span>' + esc(S.errorGeneral) + '</span></div>';

    if (p) {
      var est = estadoVentana(p);
      html += '<div class="vd-card"><div class="vd-card-titulo">Partido</div><div class="vd-resumen">' +
        dato('Campeonato', p.competencia) + dato('Fecha del campeonato', p.jornada || '—') +
        dato('Fecha calendario del partido', p.fechaTexto) + dato('Hora del partido', p.horaTexto) +
        dato('Equipos que se enfrentan', p.local + ' vs ' + p.visitante) + dato('Estadio', p.ubicacion || '—') +
        '</div><div class="vd-aviso ' + (est.puede ? 'vd-aviso-ok' : 'vd-aviso-error') + '" style="margin-bottom:0"><span class="vd-estado vd-' + est.clase + '">' + est.html + '</span></div>' +
        '<p class="vd-ayuda" style="margin-top:10px">La solicitud queda radicada a nombre de <b>' + esc(p.local) + '</b> (equipo local).</p></div>';
    }

    html += '<div class="vd-card"><div class="vd-card-titulo">Datos de quien solicita</div><div class="vd-campos">' +
      S.sesion.camposSolicitante.map(function (c) { return inputCampo(c, 's'); }).join('') + '</div></div>';

    html += '<div class="vd-card"><div class="vd-card-titulo">' + (t.requierePartido ? 'Detalle de la solicitud' : 'Datos del partido') + '</div><div class="vd-campos">' +
      t.campos.map(function (c) { return inputCampo(c, 'd'); }).join('') + '</div></div>';

    html += '<div class="vd-card"><div class="vd-card-titulo">Anexos (opcional)</div>' +
      '<label class="vd-subir">📎 <b>Toca para adjuntar archivos</b><br><span class="vd-ayuda">PDF, imágenes, Word o Excel · máximo 5 archivos y ' + r.maxMbAnexos + ' MB en total</span>' +
      '<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" data-archivos></label>' +
      (S.errores._anexos ? '<p class="vd-error-campo" style="margin-top:8px">' + esc(S.errores._anexos) + '</p>' : '') +
      (S.archivos.length ? '<ul class="vd-archivos">' + S.archivos.map(function (a, i) {
        return '<li>📄 <span>' + esc(a.nombre) + '</span><em>' + tamano(a.tamano) + '</em><button class="vd-quitar" data-accion="quitar-archivo" data-i="' + i + '">Quitar</button></li>';
      }).join('') + '</ul>' : '') + '</div>';

    var local = p ? p.local : (S.form.equipoLocal || 'el equipo local');
    html += '<div class="vd-card"><label class="vd-check"><input type="checkbox" data-campo="_confirmo"' + (S.form._confirmo ? ' checked' : '') + '>' +
      '<span>Confirmo que hago esta solicitud en representación de <b>' + esc(local) + '</b> y que la información es correcta.</span></label>' +
      (S.errores._confirmo ? '<p class="vd-error-campo" style="margin-top:8px">' + esc(S.errores._confirmo) + '</p>' : '') +
      '<div class="vd-acciones"><button class="vd-btn vd-btn-pri" data-accion="enviar"' + (p && !estadoVentana(p).puede ? ' disabled' : '') + '>Radicar solicitud</button>' +
      '<span class="vd-ayuda">Los campos con <b style="color:#dc2626">*</b> son obligatorios.</span></div></div>';

    if (S.enviando) html += capaEnvio('Radicando tu solicitud…');
    return html;
  }

  function dato(etiqueta, valor) {
    return '<div class="vd-dato"><label>' + esc(etiqueta) + '</label><div>' + esc(valor) + '</div></div>';
  }

  function vistaExito() {
    var r = S.resultado, sol = r.solicitud, t = tipoActual();
    var p = sol.partido || {};
    return pasos(t && t.requierePartido ? 3 : 2) + '<div class="vd-card vd-exito vd-fade">' +
      '<div class="vd-exito-icono">✓</div>' +
      '<h2 class="vd-titulo">¡Solicitud radicada!</h2>' +
      '<p class="vd-texto-suave">Tu número de radicado es</p>' +
      '<div class="vd-radicado">' + esc(sol.consecutivo) + '</div>' +
      '<p class="vd-texto-suave">' + esc(sol.tipoNombre) + ' · ' + esc(p.local) + ' vs ' + esc(p.visitante) + '<br>' +
        'Enviamos la confirmación a <b>' + esc(sol.solicitante.correo) + '</b>. Te escribiremos cuando ' +
        esc((sol.areas || []).map(function (a) { return a === 'deportiva' ? 'Deportiva' : 'Mercadeo'; }).join(' y ')) + ' respondan.</p>' +
      '<div class="vd-acciones">' +
        (r.pdf && r.pdf.url ? '<a class="vd-btn vd-btn-sec" href="' + esc(r.pdf.url) + '" target="_blank" rel="noopener">📄 Ver PDF</a>' : '') +
        '<button class="vd-btn vd-btn-sec" data-accion="ver-radicado">🔎 Ver estado</button>' +
        '<button class="vd-btn vd-btn-pri" data-accion="otra">Hacer otra solicitud</button>' +
      '</div></div>';
  }

  function vistaConsultar() {
    var c = S.consulta;
    return '<h2 class="vd-titulo">Consultar una solicitud</h2>' +
      '<p class="vd-texto-suave">Escribe el número de radicado y el correo con el que la enviaste.</p>' +
      (S.errorGeneral ? '<div class="vd-aviso vd-aviso-error"><span>⚠️</span><span>' + esc(S.errorGeneral) + '</span></div>' : '') +
      '<div class="vd-card" style="margin-top:16px"><div class="vd-campos">' +
        '<div class="vd-campo"><label for="vd-c-rad">Número de radicado</label><input id="vd-c-rad" class="vd-input" data-consulta="consecutivo" placeholder="Ej: Solic-145 o 145" value="' + esc(c.consecutivo) + '"></div>' +
        '<div class="vd-campo"><label for="vd-c-cor">Correo</label><input id="vd-c-cor" type="email" class="vd-input" data-consulta="correo" placeholder="correo@club.com" value="' + esc(c.correo) + '"></div>' +
      '</div><div class="vd-acciones"><button class="vd-btn vd-btn-pri" data-accion="consultar">Consultar</button></div></div>' +
      (S.enviando ? capaEnvio('Consultando…') : '');
  }

  function etiquetaEstado(e) {
    return e === 'aprobado' ? '✅ Aprobado' : (e === 'no_aprobado' ? '❌ No aprobado' : '⏳ Pendiente');
  }

  function vistaDetalle() {
    var sol = S.detalle, p = sol.partido || {}, d = sol.datos || {};
    var tipo = (S.sesion.tipos || []).filter(function (x) { return x.clave === sol.tipo; })[0];
    var nombresArea = { deportiva: 'Deportiva', mercadeo: 'Mercadeo' };

    var html = '<button class="vd-volver" data-accion="ir" data-valor="consultar">← Consultar otra</button>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
        '<div><div class="vd-radicado" style="font-size:26px;margin:0">' + esc(sol.consecutivo) + '</div>' +
        '<div class="vd-texto-suave">' + esc(sol.tipoNombre) + ' · ' + esc(sol.club) + ' · radicada el ' + esc(fechaHora(sol.creadoEn)) + '</div></div>' +
        '<button class="vd-btn vd-btn-sec vd-btn-chico" data-accion="refrescar-detalle">↻ Actualizar</button></div>';

    if (S.errorGeneral) html += '<div class="vd-aviso vd-aviso-error"><span>⚠️</span><span>' + esc(S.errorGeneral) + '</span></div>';

    html += '<div class="vd-card"><div class="vd-card-titulo">Respuestas de DIMAYOR</div><div class="vd-areas">' +
      (sol.areas || []).map(function (a) {
        var r = (sol.respuestas || {})[a] || {};
        return '<div class="vd-area"><div class="vd-area-cab"><span class="vd-area-nombre">' + esc(nombresArea[a] || a) + '</span>' +
          '<span class="vd-badge vd-b-' + esc(r.estado || 'pendiente') + '">' + etiquetaEstado(r.estado) + '</span></div>' +
          (r.comentario ? '<p>' + esc(r.comentario) + '</p>' : '<p class="vd-texto-suave">Aún no ha respondido.</p>') +
          (r.nombre ? '<small>' + esc(r.nombre) + ' · ' + esc(fechaHora(r.fecha)) + '</small>' : '') + '</div>';
      }).join('') + '</div></div>';

    html += '<div class="vd-card"><div class="vd-card-titulo">Solicitud</div><div class="vd-resumen">' +
      dato('Campeonato', p.competencia) + (p.jornada ? dato('Fecha del campeonato', p.jornada) : '') +
      dato('Partido', (p.local || '') + ' vs ' + (p.visitante || '')) + dato('Fecha', p.fechaTexto) +
      dato('Hora', p.horaTexto) + dato('Estadio', p.ubicacion || '—') +
      dato('Diligenciado por', (sol.solicitante || {}).nombre + ' — ' + (sol.solicitante || {}).cargo) +
      (tipo ? tipo.campos.filter(function (c) { return d[c.clave] && ['equipoLocal', 'equipoVisitante', 'fecha', 'hora', 'estadio'].indexOf(c.clave) === -1; })
        .map(function (c) { return dato(c.etiqueta, d[c.clave]); }).join('') : '') +
      '</div>';
    var links = [];
    if (sol.pdf && sol.pdf.url) links.push('<a class="vd-btn vd-btn-sec vd-btn-chico" href="' + esc(sol.pdf.url) + '" target="_blank" rel="noopener">📄 PDF de la solicitud</a>');
    (sol.anexos || []).forEach(function (a) {
      links.push('<a class="vd-btn vd-btn-sec vd-btn-chico" href="' + esc(a.url) + '" target="_blank" rel="noopener">📎 ' + esc(a.nombre) + '</a>');
    });
    if (links.length) html += '<div class="vd-adjuntos" style="margin-top:16px">' + links.join('') + '</div>';
    html += '</div>';

    var coms = sol.comentarios || [];
    html += '<div class="vd-card"><div class="vd-card-titulo">Comentarios</div>' +
      (coms.length ? '<div class="vd-hilo">' + coms.map(function (c) {
        var club = c.tipoAutor === 'club';
        return '<div class="vd-msg ' + (club ? 'vd-msg-club' : 'vd-msg-dimayor') + '">' +
          '<div class="vd-msg-quien"><b>' + esc(c.autor) + '</b> · ' + esc(club ? sol.club : (c.area || 'DIMAYOR')) + ' · ' + esc(fechaHora(c.fecha)) +
          (c.tipo === 'respuesta' ? ' · ' + etiquetaEstado(c.decision) : '') + '</div>' +
          '<div class="vd-msg-texto">' + esc(c.texto) + '</div></div>';
      }).join('') + '</div>' : '<p class="vd-texto-suave">Todavía no hay comentarios.</p>') +
      '<div class="vd-campo" style="margin-top:16px"><label for="vd-com">Escribir un comentario</label>' +
      '<textarea id="vd-com" class="vd-input" maxlength="2000" data-comentario placeholder="' + ((sol.areas || []).indexOf('mercadeo') > -1 ? 'Tu comentario lo verán Deportiva y Mercadeo.' : 'Tu comentario lo verá Deportiva.') + '">' + esc(S.comentario) + '</textarea></div>' +
      '<div class="vd-acciones"><button class="vd-btn vd-btn-pri" data-accion="comentar">Enviar comentario</button></div></div>';

    if (S.enviando) html += capaEnvio('Enviando…');
    return html;
  }

  // ---------------------------------------------------------------- render
  function contenido() {
    switch (S.vista) {
      case 'cargando': return vistaCargando();
      case 'error': return vistaError();
      case 'tipos': return vistaTipos();
      case 'partidos': return vistaPartidos();
      case 'formulario': return vistaFormulario();
      case 'exito': return vistaExito();
      case 'consultar': return vistaConsultar();
      case 'detalle': return vistaDetalle();
    }
    return '';
  }

  function render() {
    var foco = document.activeElement && raiz.contains(document.activeElement) ? document.activeElement : null;
    var focoSel = foco ? (foco.getAttribute('data-campo') ? '[data-campo="' + foco.getAttribute('data-campo') + '"]'
      : foco.hasAttribute('data-campo-busqueda') ? '[data-campo-busqueda]'
      : foco.getAttribute('data-consulta') ? '[data-consulta="' + foco.getAttribute('data-consulta') + '"]'
      : foco.hasAttribute('data-comentario') ? '[data-comentario]' : null) : null;
    var pos = foco && typeof foco.selectionStart === 'number' ? foco.selectionStart : null;

    // La animación de entrada solo cuando cambia la pantalla, no en cada letra que se escribe
    var animar = S.vista !== render.ultima;
    render.ultima = S.vista;
    raiz.innerHTML = cabecera() + '<div class="vd-cuerpo' + (animar ? ' vd-fade' : '') + '">' + contenido() + '</div>';

    if (focoSel) {
      var el = raiz.querySelector(focoSel);
      if (el) { el.focus(); try { if (pos !== null) el.setSelectionRange(pos, pos); } catch (e) {} }
    }
  }

  // Solo redibuja las tarjetas (cuenta regresiva) sin tocar el resto
  function refrescarContadores() {
    if (S.vista === 'partidos') {
      var zona = raiz.querySelector('[data-zona-partidos]');
      if (zona) {
        var tmp = document.createElement('div');
        tmp.innerHTML = vistaPartidos();
        var nueva = tmp.querySelector('[data-zona-partidos]');
        if (nueva) zona.innerHTML = nueva.innerHTML;
      }
    }
  }

  function subir() {
    var top = raiz.getBoundingClientRect().top + window.pageYOffset - 20;
    if (raiz.getBoundingClientRect().top < 0) window.scrollTo({ top: top, behavior: 'smooth' });
  }

  function ir(vista) {
    S.vista = vista;
    S.errorGeneral = '';
    render();
    subir();
  }

  // ---------------------------------------------------------------- datos
  function cargarSesion() {
    S.vista = 'cargando'; render();
    if (!API) {
      S.errorGeneral = 'Falta configurar la dirección de la Ventanilla (atributo data-api del bloque).';
      S.vista = 'error'; render(); return;
    }
    apiGet({ action: 'sesion' }).then(function (r) {
      if (!r.ok) throw new Error(r.error || 'Error');
      S.sesion = r;
      S.vista = S.pestana === 'consultar' ? 'consultar' : 'tipos';
      render();
      cargarPartidos();
    }).catch(function (e) {
      S.errorGeneral = 'No se pudo conectar con la Ventanilla. ' + (e && e.message && e.message !== 'Failed to fetch' ? e.message : 'Revisa tu conexión e intenta de nuevo.');
      S.vista = 'error'; render();
    });
  }

  function cargarPartidos() {
    S.cargandoPartidos = true;
    if (S.vista === 'partidos') render();
    return apiGet({ action: 'partidos' }).then(function (r) {
      S.cargandoPartidos = false;
      if (!r.ok) throw new Error(r.error);
      if (r.ahora) S.desfase = new Date(r.ahora).getTime() - Date.now();
      S.partidos = r.partidos || [];
      if (S.partido) {
        var act = S.partidos.filter(function (p) { return p.calendarEventId === S.partido.calendarEventId; })[0];
        if (act) S.partido = act;
      }
      if (S.vista === 'partidos') render();
    }).catch(function (e) {
      S.cargandoPartidos = false;
      if (S.vista === 'partidos') { S.errorGeneral = 'No se pudieron cargar los partidos. ' + (e.message || ''); render(); }
    });
  }

  // ---------------------------------------------------------------- formulario
  function validar() {
    var t = tipoActual(), e = {};
    var campos = S.sesion.camposSolicitante.concat(t.campos);
    campos.forEach(function (c) {
      var v = String(S.form[c.clave] || '').trim();
      if (!v) { if (c.obligatorio) e[c.clave] = 'Este campo es obligatorio'; return; }
      if (c.tipo === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e[c.clave] = 'Correo no válido';
      if (c.tipo === 'hora' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) e[c.clave] = 'Hora no válida';
      if (c.tipo === 'numero' && !/^\d{1,6}$/.test(v)) e[c.clave] = 'Escribe solo números';
      if (c.tipo === 'fecha' && v < hoyBogota(1)) e[c.clave] = 'La fecha debe ser futura';
    });
    if (S.form.horaInicioActo && S.form.horaFinActo && S.form.horaFinActo <= S.form.horaInicioActo) e.horaFinActo = 'Debe ser posterior a la hora de inicio';
    if (!S.form._confirmo) e._confirmo = 'Debes confirmar para radicar la solicitud';
    S.errores = e;
    return !Object.keys(e).length;
  }

  function enviar() {
    if (S.enviando) return;
    var t = tipoActual();
    if (!validar()) {
      S.errorGeneral = 'Revisa los campos marcados en rojo.';
      render();
      var primero = raiz.querySelector('.vd-mal, .vd-error-campo');
      if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var solicitante = {}, datos = {};
    S.sesion.camposSolicitante.forEach(function (c) { solicitante[c.clave] = String(S.form[c.clave] || '').trim(); });
    t.campos.forEach(function (c) { datos[c.clave] = String(S.form[c.clave] || '').trim(); });
    guardar('solicitante', solicitante);

    S.enviando = true; S.errorGeneral = ''; render();
    apiPost({
      action: 'crear', tipo: t.clave,
      calendarEventId: S.partido ? S.partido.calendarEventId : '',
      solicitante: solicitante, datos: datos,
      anexos: S.archivos.map(function (a) { return { nombre: a.nombre, tipo: a.tipo, base64: a.base64 }; })
    }).then(function (r) {
      S.enviando = false;
      if (!r.ok) {
        S.errorGeneral = r.error || 'No se pudo radicar la solicitud.';
        render(); subir();
        if (r.codigo === 409) cargarPartidos();
        return;
      }
      S.resultado = r;
      guardar('ultima', { consecutivo: r.consecutivo, correo: solicitante.correo });
      S.consulta = { consecutivo: r.consecutivo, correo: solicitante.correo };
      S.archivos = []; S.form = {};
      ir('exito');
      cargarPartidos();
    }).catch(function () {
      S.enviando = false;
      S.errorGeneral = 'No se pudo conectar. Revisa tu conexión e intenta de nuevo. Si el problema sigue, verifica en "Consultar solicitud" si quedó radicada antes de volver a enviarla.';
      render(); subir();
    });
  }

  function agregarArchivos(lista) {
    var r = S.sesion.reglas;
    var permitidos = /\.(pdf|jpe?g|png|webp|docx?|xlsx?)$/i;
    var errores = [];
    var nuevos = Array.prototype.slice.call(lista);
    var pendientes = nuevos.length;
    if (!pendientes) return;
    nuevos.forEach(function (f) {
      if (S.archivos.length >= 5) { errores.push('Máximo 5 archivos.'); fin(); return; }
      if (!permitidos.test(f.name)) { errores.push(f.name + ': tipo de archivo no permitido.'); fin(); return; }
      var total = S.archivos.reduce(function (s, a) { return s + a.tamano; }, 0) + f.size;
      if (total > r.maxMbAnexos * 1048576) { errores.push(f.name + ': supera el máximo de ' + r.maxMbAnexos + ' MB en total.'); fin(); return; }
      var lector = new FileReader();
      lector.onload = function () {
        S.archivos.push({ nombre: f.name, tipo: f.type || tipoPorExtension(f.name), tamano: f.size, base64: String(lector.result).split(',')[1] || '' });
        fin();
      };
      lector.onerror = function () { errores.push(f.name + ': no se pudo leer.'); fin(); };
      lector.readAsDataURL(f);
    });
    function fin() {
      if (--pendientes > 0) return;
      S.errores._anexos = errores.join(' ');
      render();
    }
  }

  function tipoPorExtension(n) {
    var e = (n.split('.').pop() || '').toLowerCase();
    return {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }[e] || 'application/octet-stream';
  }

  function consultar(c) {
    c = c || S.consulta;
    if (!String(c.consecutivo).trim() || !String(c.correo).trim()) {
      S.errorGeneral = 'Escribe el número de radicado y el correo.';
      render(); return;
    }
    S.enviando = true; S.errorGeneral = ''; render();
    apiGet({ action: 'solicitud', consecutivo: c.consecutivo.trim(), correo: c.correo.trim() }).then(function (r) {
      S.enviando = false;
      if (!r.ok) {
        S.errorGeneral = 'No encontramos una solicitud con ese radicado y ese correo.';
        S.vista = 'consultar'; render(); return;
      }
      S.detalle = r.solicitud;
      guardar('ultima', { consecutivo: r.solicitud.consecutivo, correo: c.correo.trim() });
      S.pestana = 'consultar';
      ir('detalle');
    }).catch(function () {
      S.enviando = false;
      S.errorGeneral = 'No se pudo conectar. Intenta de nuevo.';
      render();
    });
  }

  function comentar() {
    var texto = S.comentario.trim();
    if (!texto || S.enviando) return;
    S.enviando = true; S.errorGeneral = ''; render();
    apiPost({ action: 'comentar', consecutivo: S.detalle.consecutivo, correo: S.consulta.correo, texto: texto }).then(function (r) {
      S.enviando = false;
      if (!r.ok) { S.errorGeneral = r.error || 'No se pudo enviar el comentario.'; render(); return; }
      S.detalle = r.solicitud; S.comentario = '';
      render();
    }).catch(function () {
      S.enviando = false; S.errorGeneral = 'No se pudo conectar. Intenta de nuevo.'; render();
    });
  }

  // ---------------------------------------------------------------- eventos
  raiz.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-accion]');
    if (!b || !raiz.contains(b) || b.disabled) return;
    var accion = b.getAttribute('data-accion'), valor = b.getAttribute('data-valor');
    if (accion !== 'pestana' && b.tagName === 'A') return;
    ev.preventDefault();

    if (accion === 'pestana') {
      S.pestana = valor;
      if (!S.sesion) return;
      if (valor === 'consultar') {
        var u = leer('ultima');
        if (u && !S.consulta.consecutivo) S.consulta = { consecutivo: u.consecutivo, correo: u.correo };
        ir(S.detalle ? 'detalle' : 'consultar');
      } else ir(S.vista === 'exito' ? 'tipos' : (S.tipo && S.partido ? 'formulario' : (S.tipo ? (tipoActual().requierePartido ? 'partidos' : 'formulario') : 'tipos')));
    } else if (accion === 'elegir-tipo') {
      S.tipo = valor; S.partido = null; S.errores = {};
      var guardado = leer('solicitante') || {};
      S.form = Object.assign({}, guardado, { _confirmo: false });
      S.archivos = [];
      ir(tipoActual().requierePartido ? 'partidos' : 'formulario');
      if (tipoActual().requierePartido && !S.partidos.length) cargarPartidos();
    } else if (accion === 'elegir-partido') {
      S.partido = S.partidos.filter(function (p) { return p.calendarEventId === b.getAttribute('data-id'); })[0] || null;
      S.errores = {};
      if (S.partido) ir('formulario');
    } else if (accion === 'ir') {
      if (valor === 'consultar') { S.detalle = null; }
      ir(valor);
    } else if (accion === 'filtro') {
      S.filtroComp = valor; render();
    } else if (accion === 'quitar-archivo') {
      S.archivos.splice(Number(b.getAttribute('data-i')), 1); S.errores._anexos = ''; render();
    } else if (accion === 'enviar') {
      enviar();
    } else if (accion === 'otra') {
      S.tipo = null; S.partido = null; S.resultado = null; ir('tipos');
    } else if (accion === 'ver-radicado') {
      S.pestana = 'consultar'; consultar(S.consulta);
    } else if (accion === 'consultar') {
      consultar();
    } else if (accion === 'refrescar-detalle') {
      consultar({ consecutivo: S.detalle.consecutivo, correo: S.consulta.correo });
    } else if (accion === 'comentar') {
      comentar();
    } else if (accion === 'reintentar') {
      cargarSesion();
    }
  });

  raiz.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.hasAttribute('data-campo')) {
      var k = el.getAttribute('data-campo');
      S.form[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'equipoLocal') {
        var lbl = raiz.querySelector('.vd-check b');
        if (lbl) lbl.textContent = el.value || 'el equipo local';
      }
      if (S.errores[k]) {
        delete S.errores[k];
        var quedan = Object.keys(S.errores).filter(function (x) { return x !== '_anexos'; }).length;
        if (k === '_confirmo' || !quedan) {
          if (!quedan && S.errorGeneral === 'Revisa los campos marcados en rojo.') S.errorGeneral = '';
          render();
        } else {
          el.classList.remove('vd-mal');
          var m = el.parentNode.querySelector('.vd-error-campo');
          if (m) m.remove();
        }
      }
    } else if (el.hasAttribute('data-campo-busqueda')) {
      S.busqueda = el.value; render();
    } else if (el.hasAttribute('data-consulta')) {
      S.consulta[el.getAttribute('data-consulta')] = el.value;
    } else if (el.hasAttribute('data-comentario')) {
      S.comentario = el.value;
    }
  });

  raiz.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.hasAttribute('data-archivos')) { agregarArchivos(el.files); el.value = ''; }
    else if (el.type === 'checkbox' && el.hasAttribute('data-campo')) { S.form[el.getAttribute('data-campo')] = el.checked; }
  });

  raiz.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.hasAttribute('data-consulta')) { ev.preventDefault(); consultar(); }
  });

  // ---------------------------------------------------------------- arranque
  estilos();
  var ult = leer('ultima');
  if (ult) S.consulta = { consecutivo: ult.consecutivo || '', correo: ult.correo || '' };
  if (/[?&]radicado=/.test(location.search)) {
    S.pestana = 'consultar';
    S.consulta.consecutivo = decodeURIComponent((location.search.match(/[?&]radicado=([^&]+)/) || [])[1] || '');
  }
  cargarSesion();
  setInterval(refrescarContadores, 30000);               // cuenta regresiva
  setInterval(function () { if (S.sesion && S.vista === 'partidos') cargarPartidos(); }, 300000);   // partidos cada 5 min
})();
