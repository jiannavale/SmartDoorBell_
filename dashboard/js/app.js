/**
 * Porchlight — application bootstrap.
 * Renders every panel from the central store, wires controls, and starts the
 * mock realtime bus. Plain DOM, no framework.
 */
(function () {
  'use strict';

  /* Session guard — bounce to login.html when signed out (js/auth.js). */
  if (window.PorchlightAuth && !window.PorchlightAuth.requireAuth()) return;

  /* ========================= helpers ========================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name, size) {
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  var DAY_MS = 86400000;

  function relTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 5000) return 'just now';
    if (diff < 60000) return Math.round(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
    if (diff < DAY_MS) return Math.round(diff / 3600000) + 'h ago';
    if (diff < 2 * DAY_MS) return 'yesterday';
    if (diff < 7 * DAY_MS) return Math.round(diff / DAY_MS) + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function absTime(ts) {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function batteryTone(pct) {
    if (pct >= 50) return 'ok';
    if (pct >= 20) return 'warn';
    return 'crit';
  }

  function wifiTone(dbm) {
    if (dbm >= -55) return 'ok';
    if (dbm >= -70) return 'warn';
    return 'crit';
  }

  function wifiBarsHtml(bars, tone) {
    var out = '<span class="wifi-bars' + (tone === 'ok' ? '' : ' wifi-bars--' + tone) + '" aria-hidden="true">';
    for (var i = 1; i <= 4; i++) out += '<i class="' + (i <= bars ? 'on' : '') + '"></i>';
    return out + '</span>';
  }

  function typeInfo(type) {
    var map = window.MockData.EVENT_TYPES;
    return map[type] || { label: type, tone: 'warn' };
  }

  var TYPE_ICON = {
    ring: 'ring', motion: 'motion', person: 'person', package: 'package',
    tamper: 'tamper', low_battery: 'battery-low', offline: 'offline'
  };

  /* Small stylised camera thumbnails, drawn per event type. */
  function thumbSvg(type) {
    var sky = '<defs><linearGradient id="tg-' + type + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#1a2138"/><stop offset="100%" stop-color="#3a2f3d"/></linearGradient></defs>' +
      '<rect width="56" height="42" fill="url(#tg-' + type + ')"/>' +
      '<rect x="18" y="10" width="20" height="26" rx="2" fill="#0f1420"/>' +
      '<rect x="20" y="12" width="16" height="22" rx="1.5" fill="#3a2a22"/>' +
      '<circle cx="40" cy="12" r="7" fill="#ffb86b" opacity=".25"/>';
    var extra = '';
    if (type === 'ring' || type === 'person') {
      extra = '<circle cx="28" cy="22" r="3.4" fill="#0b0f1a"/><path d="M22 38c0-7 2.5-12 6-12s6 5 6 12z" fill="#0b0f1a"/>';
    } else if (type === 'motion') {
      extra = '<g fill="none" stroke="#ffb86b" stroke-width="1.4" stroke-linecap="round" opacity=".85">' +
        '<path d="M8 16a10 10 0 0 1 0 12"/><path d="M12 13a15 15 0 0 1 0 18"/></g>';
    } else if (type === 'package') {
      extra = '<rect x="20" y="28" width="14" height="9" rx="1.4" fill="#c9a66b"/><path d="M20 32h14M27 28v9" stroke="#8a6a3b" stroke-width="1"/>';
    } else if (type === 'tamper') {
      extra = '<path d="M28 14l6 3v4.5c0 3.5-2.4 6-6 7.3-3.6-1.3-6-3.8-6-7.3V17z" fill="none" stroke="#ff7d72" stroke-width="1.5"/>' +
        '<path d="M28 19.5v3" stroke="#ff7d72" stroke-width="1.6" stroke-linecap="round"/>';
    } else if (type === 'low_battery') {
      extra = '<rect x="20" y="18" width="13" height="8" rx="1.6" fill="none" stroke="#f2b544" stroke-width="1.4"/>' +
        '<rect x="22" y="20.5" width="3" height="3" fill="#f2b544"/><rect x="34" y="20.5" width="1.6" height="3" fill="#f2b544"/>';
    } else if (type === 'offline') {
      extra = '<g fill="none" stroke="#ff7d72" stroke-width="1.4" stroke-linecap="round">' +
        '<path d="M14 18a16 16 0 0 1 8-3.6"/><path d="M17.5 22.5a11 11 0 0 1 3.4-2"/>' +
        '<circle cx="19" cy="28" r="1.3" fill="#ff7d72" stroke="none"/><path d="M12 12l16 18"/></g>';
    }
    return '<svg viewBox="0 0 56 42" aria-hidden="true">' + sky + extra + '</svg>';
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ========================= store ========================= */

  var Store = window.createStore({
    ready: false,
    loading: true,
    deviceId: 'front-door',
    devices: [],
    events: [],
    analytics: {},
    health: {},
    visitors: [],
    deliveries: [],
    visitorLog: [],
    settings: {},
    filters: { type: 'all', range: '7d', device: 'current' },
    banner: null,
    ui: { talk: false, mute: false }
  });

  var bus = new window.MockRealtimeBus({ store: Store });
  var renderedEventIds = [];
  var bannerTimer = null;
  var unlockedFor = null;
  var doorTimer = null;
  var lastShot = null;
  var analyticsTimer = null;
  var settingsDraft = null;
  var settingsDirty = false;
  var booted = false;

  /* ========================= toasts / a11y ========================= */

  function toast(title, text, tone) {
    var stack = $('#toast-stack');
    var node = document.createElement('div');
    node.className = 'toast toast--' + (tone || 'accent');
    node.innerHTML =
      '<span class="toast__icon">' + icon(tone === 'danger' ? 'tamper' : tone === 'ok' ? 'check' : 'bell', 17) + '</span>' +
      '<span><span class="toast__title">' + esc(title) + '</span>' +
      (text ? '<br><span class="toast__text">' + esc(text) + '</span>' : '') + '</span>';
    stack.appendChild(node);
    setTimeout(function () {
      node.classList.add('is-leaving');
      setTimeout(function () { node.remove(); }, 260);
    }, 3600);
    while (stack.children.length > 3) stack.firstChild.remove();
  }

  function announce(msg) {
    var region = $('#sr-polite');
    region.textContent = '';
    setTimeout(function () { region.textContent = msg; }, 40);
  }

  /* ========================= theme ========================= */

  function bindTheme() {
    var btn = $('#theme-toggle');
    function sync() {
      var theme = document.documentElement.getAttribute('data-theme');
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('porchlight-theme', next); } catch (e) { /* private mode */ }
      sync();
      renderAnalytics(); // heatmap glow / chart colours follow the theme variables
    });
    sync();
  }

  /* ========================= account ========================= */

  function bindAccount() {
    var Auth = window.PorchlightAuth;
    var user = Auth && Auth.session() && Auth.session().user;
    if (user) {
      $('#acct-name').textContent = user.name;
      $('#acct-avatar').textContent = user.name.split(/\s+/).map(function (w) {
        return w.charAt(0);
      }).join('').slice(0, 2).toUpperCase();
    }
    $('#btn-logout').addEventListener('click', function () {
      if (Auth) Auth.logout();
      location.href = 'login.html';
    });
  }

  /* ========================= header ========================= */

  function renderDevicePills() {
    var state = Store.get();
    var host = $('#device-switch');
    host.innerHTML = state.devices.map(function (dev) {
      return '<button type="button" class="device-pill" data-device="' + dev.id + '" aria-pressed="' + (dev.id === state.deviceId) + '">' +
        '<span class="device-pill__dot' + (dev.online ? '' : ' device-pill__dot--off') + '" aria-hidden="true"></span>' +
        esc(dev.name) +
        (dev.online ? '' : '<span class="sr-only"> (offline)</span>') +
        '</button>';
    }).join('');
  }

  function renderStatusStrip() {
    var state = Store.get();
    var dev = Store.currentDevice();
    if (!dev) return;
    var tone = batteryTone(dev.battery);
    var wtone = wifiTone(dev.wifiDbm);
    var bars = wtone === 'ok' ? 4 : wtone === 'warn' ? (dev.wifiBars >= 3 ? 3 : 2) : Math.max(1, dev.wifiBars - 1);

    $('#status-strip').innerHTML =
      '<div class="status-item status-item--name">' +
        '<span class="status-item__label">Device</span>' +
        '<span class="status-item__value">' + esc(dev.name) + '</span>' +
        '<span class="badge-dot' + (dev.online ? '' : ' badge-dot--off') + '">' + (dev.online ? 'Online' : 'Offline') + '</span>' +
      '</div>' +
      '<div class="status-item battery battery--' + tone + '">' +
        '<span class="status-item__label">Battery</span>' +
        '<span class="battery__track"><span class="battery__fill' + (tone === 'ok' ? '' : ' battery__fill--' + tone) + '" style="width:' + dev.battery + '%"></span></span>' +
        '<span class="battery__pct">' + dev.battery + '%</span>' +
      '</div>' +
      '<div class="status-item">' +
        '<span class="status-item__label">Wi-Fi</span>' +
        wifiBarsHtml(bars, wtone) +
        '<span class="status-item__value">' + dev.wifiDbm + ' dBm</span>' +
      '</div>' +
      '<div class="status-item">' +
        '<span class="status-item__label">Firmware</span>' +
        '<span class="status-item__value">' + esc(dev.firmware) + '</span>' +
      '</div>' +
      '<div class="status-item">' +
        '<span class="status-item__label">Last seen</span>' +
        '<span class="status-item__value" id="strip-lastseen" data-ts="' + dev.lastSeenAt + '">' + relTime(dev.lastSeenAt) + '</span>' +
      '</div>' +
      '<div class="status-item">' +
        '<span class="status-item__label">Model</span>' +
        '<span class="status-item__value">' + esc(dev.model) + '</span>' +
      '</div>';
    void state;
  }

  function updateUnreadBadges() {
    var state = Store.get();
    var count = Store.unreadCount(state.deviceId);
    var all = Store.unreadCount('all');
    var sectionBadge = $('#unread-badge');
    var context = $('#unread-context');
    var navBadge = $('#nav-unread');
    var deviceName = Store.deviceName(state.deviceId);

    // Section badge = this device; when it differs from the home-wide total,
    // show both so the two numbers never silently contradict each other.
    sectionBadge.textContent = count === all ? count : count + ' of ' + all;
    sectionBadge.hidden = count === 0;
    sectionBadge.setAttribute('aria-label',
      count + ' unread on ' + deviceName + (count === all ? '' : ', ' + all + ' across all devices'));
    context.hidden = count === all || count === 0;

    navBadge.textContent = all;
    navBadge.hidden = all === 0;
    navBadge.setAttribute('aria-label', all + ' unread events across all devices');
  }

  /* ========================= live feed ========================= */

  var STREAM_STATS = {
    'front-door': { bitrate: '2.4 Mbps', latency: '118 ms', loss: '0.1 %', recording: 'Continuous' },
    'back-door': { bitrate: '1.8 Mbps', latency: '146 ms', loss: '0.4 %', recording: 'Continuous' },
    'garage': { bitrate: '—', latency: '—', loss: '—', recording: 'Paused' }
  };

  function renderFeed() {
    var state = Store.get();
    var dev = Store.currentDevice();
    if (!dev) return;

    $('#feed-device-label').textContent = dev.name;
    $('#feed-quality').textContent = dev.online ? '1080p · 30 fps' : 'Signal lost';
    $('#live-badge').classList.toggle('is-offline', !dev.online);
    $('#live-badge').lastChild.textContent = dev.online ? 'Live' : 'Offline';

    var offline = $('#feed-offline');
    offline.hidden = dev.online;
    if (!dev.online) {
      $('#feed-offline-detail').textContent =
        dev.name + ' stopped streaming ' + relTime(dev.lastSeenAt) + '. Live view, talk and remote unlock are unavailable.';
    }

    ['btn-talk', 'btn-mute', 'btn-snapshot', 'btn-unlock', 'btn-simulate'].forEach(function (id) {
      $('#' + id).disabled = !dev.online;
    });
    $('#btn-simulate').title = dev.online
      ? 'Fire a mock doorbell ring for this device'
      : 'Unavailable while ' + dev.name + ' is offline';

    var stats = STREAM_STATS[dev.id] || STREAM_STATS['front-door'];
    $('#stat-bitrate').textContent = dev.online ? stats.bitrate : '—';
    $('#stat-latency').textContent = dev.online ? stats.latency : '—';
    $('#stat-loss').textContent = dev.online ? stats.loss : '—';
    $('#stat-recording').textContent = dev.online ? stats.recording : 'Paused';
    $('#stream-stats').classList.toggle('is-offline', !dev.online);
    $('#stream-stats').setAttribute('aria-label', 'Stream health for ' + dev.name);

    $('#feed-stage').classList.toggle('is-ringing', !!state.banner);
    var unlocked = unlockedFor === dev.id && dev.online;
    $('#feed-stage').classList.toggle('is-unlocked', unlocked);
    $('#unlocked-badge').hidden = !unlocked;

    var shot = lastShot && lastShot.deviceId === dev.id ? lastShot : null;
    $('#feed-lastshot').hidden = !shot;
    $('#feed-lastshot-sep').hidden = !shot;
    if (shot) $('#feed-lastshot').textContent = 'Shot ' + shot.time;

    if (state.ui.talk) {
      $('#btn-talk').setAttribute('aria-pressed', 'true');
      $('#btn-talk').querySelector('span').textContent = 'Talking';
    } else {
      $('#btn-talk').setAttribute('aria-pressed', 'false');
      $('#btn-talk').querySelector('span').textContent = 'Talk';
    }
    $('#btn-mute').setAttribute('aria-pressed', state.ui.mute ? 'true' : 'false');
    $('#btn-mute').querySelector('span').textContent = state.ui.mute ? 'Muted' : 'Mute';
    $('#btn-mute').querySelector('use').setAttribute('href', state.ui.mute ? '#i-mute' : '#i-speaker');
  }

  function renderBanner() {
    var state = Store.get();
    var banner = $('#ring-banner');
    clearTimeout(bannerTimer);
    if (!state.banner) {
      banner.hidden = true;
      $('#feed-stage').classList.remove('is-ringing');
      return;
    }
    $('#ring-banner-meta').textContent = Store.deviceName(state.banner.deviceId) + ' · ' + relTime(state.banner.ts);
    banner.hidden = false;
    $('#feed-stage').classList.add('is-ringing');
    bannerTimer = setTimeout(function () {
      Store.set({ banner: null }, ['banner']);
    }, 20000);
  }

  function setTalk(on) {
    var state = Store.get();
    var dev = Store.currentDevice();
    if (!dev || !dev.online) return;
    if (on === state.ui.talk) return;
    Store.set({ ui: Object.assign({}, state.ui, { talk: on }) }, ['ui']);
    api.setTalk(dev.id, on).catch(function () { /* toast already handled upstream */ });
    toast(on ? 'Talk channel open' : 'Talk channel closed', on ? 'Speak now — ' + dev.name + ' is streaming your voice.' : null, on ? 'accent' : 'ok');
  }

  /* ========================= notifications ========================= */

  function eventNode(ev, isNew) {
    var info = typeInfo(ev.type);
    var li = document.createElement('li');
    li.className = 'event' + (ev.unread ? ' event--unread' : '') + (isNew ? ' is-new' : '');
    li.dataset.id = ev.id;
    li.innerHTML =
      '<span class="event__thumb" aria-hidden="true">' + thumbSvg(ev.type) + '</span>' +
      '<div class="event__body">' +
        '<div class="event__row1">' +
          '<span class="event__icon event__icon--' + ev.type + '">' + icon(TYPE_ICON[ev.type] || 'motion', 15) + '</span>' +
          '<span class="event__label">' + esc(info.label) + '</span>' +
          (ev.unread ? '<span class="event__unread-dot" aria-hidden="true"></span><span class="sr-only">Unread</span>' : '') +
        '</div>' +
        '<div class="event__meta">' +
          '<span>' + esc(Store.deviceName(ev.deviceId)) + '</span>' +
          '<span class="dot-sep" aria-hidden="true"></span>' +
          '<time data-ts="' + ev.ts + '" datetime="' + new Date(ev.ts).toISOString() + '" title="' + absTime(ev.ts) + '">' + relTime(ev.ts) + '</time>' +
          (ev.note ? '<span class="dot-sep" aria-hidden="true"></span><span class="event__note">' + esc(ev.note) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="event__actions">' +
        (ev.clip ? '<button type="button" class="icon-btn icon-btn--sm" data-action="clip" aria-label="View clip: ' + esc(info.label) + '">' + icon('play', 14) + '</button>' : '') +
        (ev.unread ? '<button type="button" class="icon-btn icon-btn--sm" data-action="read" aria-label="Mark as read: ' + esc(info.label) + '">' + icon('check', 14) + '</button>' : '') +
        '<button type="button" class="icon-btn icon-btn--sm" data-action="delete" aria-label="Delete: ' + esc(info.label) + '">' + icon('trash', 14) + '</button>' +
      '</div>';
    return li;
  }

  function resolveFilterDevice(filters) {
    return filters.device === 'current' ? Store.get().deviceId : filters.device;
  }

  var EVENT_LIST_CAP = 8;
  var eventsExpanded = false;

  function updateEventListFoot(totalCount) {
    var foot = $('#event-list-foot');
    var showBtn = $('#btn-show-events');
    if (totalCount > EVENT_LIST_CAP) {
      foot.hidden = false;
      var hiddenCount = totalCount - (eventsExpanded ? totalCount : EVENT_LIST_CAP);
      showBtn.textContent = eventsExpanded
        ? 'Show fewer'
        : 'Show ' + hiddenCount + ' older ' + (hiddenCount === 1 ? 'event' : 'events');
      showBtn.setAttribute('aria-expanded', String(eventsExpanded));
    } else {
      foot.hidden = true;
    }
  }

  function renderEventList() {
    var state = Store.get();
    var list = $('#event-list');
    var empty = $('#event-empty');
    var filters = Object.assign({}, state.filters, { device: resolveFilterDevice(state.filters) });
    var events = state.loading ? [] : Store.filteredEvents(filters);

    if (state.loading) {
      renderedEventIds = [];
      list.innerHTML = '<li class="skel skel-row"></li><li class="skel skel-row"></li><li class="skel skel-row"></li><li class="skel skel-row"></li>';
      empty.hidden = true;
      $('#event-list-foot').hidden = true;
      return;
    }

    var shown = eventsExpanded ? events : events.slice(0, EVENT_LIST_CAP);
    renderedEventIds = shown.map(function (e) { return e.id; });
    list.classList.toggle('event-list--expanded', eventsExpanded);
    list.innerHTML = '';
    var frag = document.createDocumentFragment();
    shown.forEach(function (ev) { frag.appendChild(eventNode(ev, false)); });
    list.appendChild(frag);
    empty.hidden = events.length > 0;
    list.hidden = events.length === 0;
    updateEventListFoot(events.length);
  }

  function handleLiveEvents() {
    var state = Store.get();
    if (!booted) {
      renderEventList();
      updateUnreadBadges();
      return;
    }
    var filters = Object.assign({}, state.filters, { device: resolveFilterDevice(state.filters) });
    var visible = Store.filteredEvents(filters);
    var known = {};
    renderedEventIds.forEach(function (id) { known[id] = true; });

    var removed = renderedEventIds.some(function (id) {
      return !state.events.some(function (e) { return e.id === id; });
    });

    // Only events NEWER than the newest rendered row are live additions.
    // Older rows hidden by the list cap must never be treated as "new".
    var newestRenderedTs = 0;
    if (renderedEventIds.length) {
      state.events.forEach(function (e) {
        if (e.id === renderedEventIds[0]) newestRenderedTs = e.ts;
      });
    }
    var added = state.events.filter(function (e) {
      return !known[e.id] && e.ts >= newestRenderedTs;
    });

    if (removed || added.length === 0) {
      renderEventList();
      updateUnreadBadges();
      return;
    }

    var visibleNew = added.filter(function (e) {
      return visible.some(function (v) { return v.id === e.id; });
    });
    if (visibleNew.length === 0) {
      updateUnreadBadges();
      return;
    }
    var list = $('#event-list');
    $('#event-empty').hidden = true;
    list.hidden = false;
    // list is newest-first; insert in reverse so the newest ends up on top
    visibleNew.slice().reverse().forEach(function (ev) {
      list.insertBefore(eventNode(ev, true), list.firstChild);
      renderedEventIds.unshift(ev.id);
    });
    // Keep the collapsed view at the cap: drop the now-oldest row from the DOM.
    if (!eventsExpanded && renderedEventIds.length > EVENT_LIST_CAP) {
      var overflow = renderedEventIds.length - EVENT_LIST_CAP;
      for (var i = 0; i < overflow; i++) {
        renderedEventIds.pop();
        if (list.lastElementChild) list.removeChild(list.lastElementChild);
      }
    }
    announce(visibleNew.length + ' new ' + (visibleNew.length === 1 ? 'event' : 'events') + ': ' +
      visibleNew.map(function (e) { return typeInfo(e.type).label; }).join(', '));
    updateEventListFoot(visible.length);
    updateUnreadBadges();
  }

  function markRead(id) {
    api.markEventRead(id).then(function () {
      var state = Store.get();
      Store.set({
        events: state.events.map(function (e) { return e.id === id ? Object.assign({}, e, { unread: false }) : e; })
      }, ['events']);
    });
  }

  function deleteEvent(id) {
    api.deleteEvent(id).then(function () {
      var state = Store.get();
      Store.set({ events: state.events.filter(function (e) { return e.id !== id; }) }, ['events']);
      toast('Event deleted', 'The clip stays on the device for 30 days.', 'ok');
    });
  }

  /* ========================= analytics ========================= */

  function renderStats() {
    var state = Store.get();
    var a = state.analytics[state.deviceId];
    if (!a) return;
    var pairs = [
      ['rings', '#stat-rings', '#stat-rings-delta', 'neutral'],
      ['motion', '#stat-motion', '#stat-motion-delta', 'neutral'],
      ['missed', '#stat-missed', '#stat-missed-delta', 'bad-up']
    ];
    pairs.forEach(function (p) {
      var stat = a.stats[p[0]];
      $(p[1]).textContent = stat.value;
      var chip = $(p[2]);
      var delta = stat.delta;
      var cls = 'stat__delta ';
      var symbol = delta > 0 ? '▲' : delta < 0 ? '▼' : '■';
      var pct = Math.abs(delta) + '%';
      if (delta === 0) {
        cls += 'stat__delta--flat';
        pct = 'no change';
      } else if (p[3] === 'bad-up') {
        cls += delta > 0 ? 'stat__delta--down' : 'stat__delta--up';
      } else {
        cls += 'stat__delta--up';
      }
      chip.className = cls;
      chip.innerHTML = '<span aria-hidden="true">' + symbol + '</span>' + pct + ' <span style="color:var(--text-3);font-weight:500">vs yesterday</span>';
    });
  }

  function hourLabels() {
    var out = [];
    for (var h = 0; h < 24; h++) {
      out.push(h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p');
    }
    return out;
  }

  function dayLabels() {
    var out = [];
    var now = new Date();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now.getTime() - i * DAY_MS);
      out.push(window.Charts.DAY_LABELS[(d.getDay() + 6) % 7]);
    }
    return out;
  }

  function renderAnalytics() {
    var state = Store.get();
    var a = state.analytics[state.deviceId];
    if (!a || state.loading) return;
    renderStats();
    window.Charts.line($('#chart-hourly'), {
      values: a.hourly,
      labels: hourLabels(),
      labelEvery: 4,
      ariaLabel: 'Events per hour for the last 24 hours on ' + Store.deviceName(state.deviceId)
    });
    window.Charts.bar($('#chart-daily'), {
      values: a.daily,
      labels: dayLabels(),
      ariaLabel: 'Events per day for the last 7 days on ' + Store.deviceName(state.deviceId)
    });

    var heat = a.heatmap;
    var best = { v: -1, d: 0, h: 0 };
    heat.forEach(function (row, di) {
      row.forEach(function (v, hi) { if (v > best.v) best = { v: v, d: di, h: hi }; });
    });
    var block = window.Charts.BLOCK_LABELS[best.h];
    var endH = (best.h * 2 + 2) % 24;
    var blockEnd = endH === 0 ? '12a' : endH < 12 ? endH + 'a' : endH === 12 ? '12p' : (endH - 12) + 'p';
    $('#heat-summary').textContent = 'Busiest: ' + window.Charts.DAY_LABELS[best.d] + ' ' + block + '–' + blockEnd + ' · peak ' + best.v;
    window.Charts.heatmap($('#chart-heatmap'), {
      rows: heat,
      ariaLabel: 'Activity heatmap by day and two-hour block. Busiest ' +
        window.Charts.DAY_LABELS[best.d] + ' at ' + block + ' with ' + best.v + ' events.'
    });
    $('#analytics-updated').textContent = 'Updated ' + relTime(Date.now() - 1000);
  }

  function scheduleAnalyticsRender() {
    clearTimeout(analyticsTimer);
    analyticsTimer = setTimeout(renderAnalytics, 350);
  }

  /* ========================= settings ========================= */

  var SENSITIVITY = {
    1: { label: 'Low', desc: 'Ignores pets and small movement — best for quiet yards.' },
    2: { label: 'Medium-low', desc: 'Filters out passing cars and light foliage motion.' },
    3: { label: 'Medium', desc: 'Balanced detection for most homes.' },
    4: { label: 'Medium-high', desc: 'Detects most people and large pets; ignores moving branches.' },
    5: { label: 'High', desc: 'Records almost everything — expect more clips and alerts.' }
  };

  function cloneSettings(s) { return JSON.parse(JSON.stringify(s)); }

  function loadSettingsDraft() {
    var state = Store.get();
    settingsDraft = cloneSettings(state.settings[state.deviceId]);
    settingsDirty = false;
    renderSettingsForm();
  }

  function markDirty() {
    if (settingsDirty) return;
    settingsDirty = true;
    var el = $('#settings-status');
    el.textContent = 'Unsaved changes';
    el.classList.add('is-dirty');
  }

  function renderSettingsForm() {
    var state = Store.get();
    var dev = Store.currentDevice();
    if (!settingsDraft || !dev) return;

    $('#settings-scope').textContent = dev.name;

    var typeRows = window.MockData.SETTING_TYPES;
    var channels = [
      { id: 'push', label: 'Push' },
      { id: 'sms', label: 'SMS' },
      { id: 'email', label: 'Email' }
    ];
    var locked = { motion: ['sms'], package: ['sms'] };

    var html = '<div class="matrix__head"><span>Event</span>' +
      channels.map(function (c) { return '<span>' + c.label + '</span>'; }).join('') + '</div>';

    typeRows.forEach(function (t) {
      html += '<div class="matrix__row">' +
        '<span class="matrix__event">' + icon(TYPE_ICON[t.id] || 'motion', 15) + esc(t.label) + '</span>';
      channels.forEach(function (c) {
        var isLocked = (locked[t.id] || []).indexOf(c.id) >= 0;
        var on = !!settingsDraft.matrix[t.id][c.id];
        html += '<button type="button" class="switch" role="switch" data-type="' + t.id + '" data-channel="' + c.id + '"' +
          ' aria-checked="' + on + '"' + (isLocked ? ' disabled aria-disabled="true"' : '') +
          ' aria-label="' + c.label + ' alerts for ' + esc(t.label) + '">' +
          '<span class="switch__thumb" aria-hidden="true"></span></button>';
      });
      html += '</div>';
    });
    $('#settings-matrix').innerHTML = html;

    var quiet = settingsDraft.quietHours;
    $('#quiet-toggle').setAttribute('aria-checked', quiet.enabled ? 'true' : 'false');
    $('#quiet-start').value = quiet.start;
    $('#quiet-end').value = quiet.end;
    $('#quiet-start').disabled = !quiet.enabled;
    $('#quiet-end').disabled = !quiet.enabled;
    $('#quiet-hint').textContent = quiet.enabled
      ? 'Push alerts pause ' + quiet.start + '–' + quiet.end + '. Rings still ring the indoor chime.'
      : 'Quiet hours are off — alerts arrive at any time.';

    $('#sensitivity').value = settingsDraft.sensitivity;
    $('#sensitivity-label').textContent = SENSITIVITY[settingsDraft.sensitivity].label;
    $('#sensitivity-desc').textContent = SENSITIVITY[settingsDraft.sensitivity].desc;
    $('#sensitivity').setAttribute('aria-valuetext', SENSITIVITY[settingsDraft.sensitivity].label);

    var zonesHtml = window.MockData.ZONES.map(function (z) {
      var on = !!settingsDraft.zones[z.id];
      return '<li class="switch-row">' +
        '<span class="switch-row__label" id="zone-label-' + z.id + '">' + esc(z.label) + '</span>' +
        '<span class="zones__state">' + (on ? 'Alerts on' : 'Ignored') + '</span>' +
        '<button type="button" class="switch" role="switch" data-zone="' + z.id + '" aria-checked="' + on + '" aria-labelledby="zone-label-' + z.id + '">' +
        '<span class="switch__thumb" aria-hidden="true"></span></button>' +
        '</li>';
    }).join('');
    $('#zones-list').innerHTML = zonesHtml;

    $$('.zone-shape').forEach(function (shape) {
      var on = !!settingsDraft.zones[shape.getAttribute('data-zone')];
      shape.classList.toggle('is-on', on);
    });

    $('#chime-select').value = settingsDraft.chime;
    $('#volume').value = settingsDraft.volume;
    $('#volume-value').textContent = settingsDraft.volume + '%';
  }

  function saveSettings() {
    var state = Store.get();
    var dev = Store.currentDevice();
    var status = $('#settings-status');
    status.textContent = 'Saving…';
    status.classList.remove('is-dirty');
    api.putSettings(dev.id, settingsDraft).then(function () {
      var next = Object.assign({}, state.settings);
      next[dev.id] = cloneSettings(settingsDraft);
      Store.set({ settings: next }, ['settings']);
      settingsDirty = false;
      status.textContent = 'All changes saved';
      toast('Settings saved', 'Notification rules updated for ' + dev.name + '.', 'ok');
    }).catch(function () {
      status.textContent = 'Save failed — try again';
      status.classList.add('is-dirty');
      toast('Could not save', 'The device rejected the update.', 'danger');
    });
  }

  /* ========================= sound (Web Audio) ========================= */
  /* Synthesized cues — no audio files, stays fully offline. Feed sounds
     respect the Mute control; explicit settings previews always play. */

  var SoundFX = {
    _ctx: null,

    ctx: function () {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      if (!this._ctx || this._ctx.state === 'closed') {
        try { this._ctx = new C(); } catch (e) { return null; }
      }
      if (this._ctx.state === 'suspended') this._ctx.resume();
      return this._ctx;
    },

    feedSound: function () { return !Store.get().ui.mute; },

    master: function (vol) {
      var ctx = this.ctx();
      if (!ctx) return null;
      var g = ctx.createGain();
      g.gain.value = vol;
      g.connect(ctx.destination);
      return { ctx: ctx, gain: g };
    },

    tone: function (freq, at, dur, opts) {
      opts = opts || {};
      var m = this.master(opts.vol != null ? opts.vol : 0.12);
      if (!m) return;
      var t0 = m.ctx.currentTime + (at || 0);
      var osc = m.ctx.createOscillator();
      var g = m.ctx.createGain();
      osc.type = opts.type || 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g).connect(m.gain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    },

    noise: function (at, dur, freq, q, vol) {
      var m = this.master(vol != null ? vol : 0.16);
      if (!m) return;
      var ctx = m.ctx;
      var t0 = ctx.currentTime + (at || 0);
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq || 2000;
      bp.Q.value = q || 1;
      src.connect(bp).connect(m.gain);
      src.start(t0);
    },

    /* mechanical double-click shutter */
    shutter: function () {
      if (!this.feedSound()) return;
      this.noise(0, 0.035, 2800, 1.4, 0.32);
      this.noise(0.07, 0.045, 1900, 1.2, 0.26);
      this.tone(120, 0.01, 0.05, { type: 'square', vol: 0.05 });
    },

    /* short cue per event type when a clip starts */
    clipCue: function (type) {
      if (!this.feedSound()) return;
      if (type === 'ring') {
        this.tone(392, 0, 0.4, { vol: 0.15 });
        this.tone(311.13, 0.26, 0.5, { vol: 0.15 });
      } else if (type === 'person') {
        this.noise(0, 0.25, 700, 0.6, 0.08);
        this.tone(784, 0.1, 0.12, { vol: 0.09 });
        this.tone(987.77, 0.24, 0.16, { vol: 0.09 });
      } else if (type === 'motion') {
        this.tone(659.25, 0, 0.14, { vol: 0.08 });
      } else if (type === 'package') {
        this.tone(95, 0.05, 0.22, { type: 'sine', vol: 0.2, glideTo: 60 });
        this.noise(0.05, 0.12, 900, 0.8, 0.1);
      } else if (type === 'tamper') {
        this.tone(932.33, 0, 0.1, { type: 'square', vol: 0.07 });
        this.tone(932.33, 0.16, 0.1, { type: 'square', vol: 0.07 });
      } else if (type === 'low_battery') {
        this.tone(880, 0, 0.12, { vol: 0.09 });
        this.tone(587.33, 0.15, 0.18, { vol: 0.09 });
      } else {
        this.tone(220, 0, 0.25, { type: 'sawtooth', vol: 0.06 });
        this.tone(220, 0.3, 0.25, { type: 'sawtooth', vol: 0.06 });
      }
    },

    clipEnd: function () {
      if (!this.feedSound()) return;
      this.tone(523.25, 0, 0.12, { vol: 0.07 });
    },

    notes: function (notesArr, vol) {
      var m = this.master(Math.max(0.02, vol * 0.22));
      if (!m) return;
      var ctx = m.ctx;
      var t0 = ctx.currentTime;
      notesArr.forEach(function (n) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = n[0];
        g.gain.setValueAtTime(0, t0 + n[1]);
        g.gain.linearRampToValueAtTime(1, t0 + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + n[1] + n[2]);
        osc.connect(g).connect(m.gain);
        osc.start(t0 + n[1]);
        osc.stop(t0 + n[1] + n[2] + 0.05);
      });
    }
  };

  function playChime() {
    if (!SoundFX.ctx()) {
      toast('Preview unavailable', 'This browser blocks audio previews.', 'danger');
      return;
    }
    var patterns = {
      classic: [[880, 0, 0.35]],
      chime: [[659.25, 0, 0.3], [880, 0.18, 0.4]],
      melody: [[523.25, 0, 0.22], [659.25, 0.16, 0.22], [783.99, 0.32, 0.4]],
      doorbell: [[392, 0, 0.45], [311.13, 0.28, 0.55]]
    };
    var notes = patterns[$('#chime-select').value] || patterns.classic;
    SoundFX.notes(notes, Number($('#volume').value) / 100);
  }

  /* ========================= health ========================= */

  function renderHealth() {
    var state = Store.get();
    var dev = Store.currentDevice();
    var h = state.health[state.deviceId];
    if (!dev || !h || state.loading) return;

    $('#health-uptime').textContent = 'Uptime ' + dev.uptime;

    $('#health-battery-value').innerHTML = dev.battery + '<small>%</small>';
    var drain = h.batteryHistory.length > 1 ? h.batteryHistory[0] - h.batteryHistory[h.batteryHistory.length - 1] : 0;
    var daysLeft = drain > 0 ? Math.max(1, Math.round(dev.battery / drain)) : null;
    $('#health-battery-hint').textContent = dev.battery <= 20
      ? 'Critically low — recharge or swap the battery today.'
      : daysLeft ? 'About ' + daysLeft + ' days left at this drain rate (' + drain + '% over the week).' : 'Stable charge over the last week.';
    window.Charts.sparkline($('#health-battery-spark'), {
      values: h.batteryHistory,
      ariaLabel: 'Battery trend, last 7 days, from ' + h.batteryHistory[0] + '% to ' + dev.battery + '%',
      min: 0, max: 100
    });

    var wtone = wifiTone(dev.wifiDbm);
    $('#health-signal-value').innerHTML = dev.wifiDbm + '<small> dBm</small>';
    $('#health-signal-hint').textContent =
      wtone === 'ok' ? 'Strong — video streams without retries.'
      : wtone === 'warn' ? 'Fair — occasional rebuffering possible.'
      : 'Weak — move the router closer or add a mesh point.';
    window.Charts.sparkline($('#health-signal-spark'), {
      values: h.signalHistory,
      ariaLabel: 'Wi-Fi signal trend, last 24 hours, currently ' + dev.wifiDbm + ' dBm',
      min: -90, max: -35
    });

    var pct = (dev.storageUsedGb / dev.storageTotalGb) * 100;
    var tone = pct > 90 ? 'crit' : pct > 75 ? 'warn' : '';
    $('#health-storage-meta').textContent = dev.storageUsedGb + ' / ' + dev.storageTotalGb + ' GB';
    window.Charts.ring($('#health-storage-ring'), {
      percent: pct,
      centerTop: Math.round(pct) + '%',
      centerSub: 'used',
      tone: tone,
      ariaLabel: 'Clip storage ' + Math.round(pct) + ' percent used'
    });
    $('#health-storage-hint').textContent =
      (dev.storageTotalGb - dev.storageUsedGb).toFixed(1) + ' GB free · clips retained ' + dev.retentionDays + ' days.';

    $('#log-list').innerHTML = h.logs.map(function (log) {
      var chip = log.severity === 'error' ? 'chip--danger' : log.severity === 'warn' ? 'chip--warn' : 'chip--ok';
      var label = log.severity === 'error' ? 'Error' : log.severity === 'warn' ? 'Warning' : 'Info';
      return '<li class="log-item">' +
        '<span class="log-code">' + esc(log.code) + '</span>' +
        '<span class="chip ' + chip + '">' + label + '</span>' +
        '<span class="log-msg">' + esc(log.message) + '</span>' +
        '<time class="log-time" data-ts="' + log.ts + '" title="' + absTime(log.ts) + '">' + relTime(log.ts) + '</time>' +
        '</li>';
    }).join('');
  }

  /* ========================= visitors ========================= */

  function renderVisitors() {
    var state = Store.get();
    if (state.loading) return;

    $('#visitors-scope').textContent = 'Showing doorbell activity for ' + Store.deviceName(state.deviceId);

    var deliveries = state.deliveries.filter(function (d) { return d.deviceId === state.deviceId; });
    $('#deliveries-meta').textContent = deliveries.length + ' parcels · ' + Store.deviceName(state.deviceId);
    $('#deliveries-empty').hidden = deliveries.length > 0;
    $('#deliveries-list').hidden = deliveries.length === 0;
    $('#deliveries-list').innerHTML = deliveries.map(function (d) {
      return '<li class="delivery">' +
        '<span class="delivery__thumb" aria-hidden="true">' + icon('package', 18) + '</span>' +
        '<span>' +
          '<span class="delivery__carrier">' + esc(d.carrier) + '</span> ' +
          '<span class="delivery__pkg">' + esc(d.pkg) + '</span>' +
          '<span class="delivery__when"><time data-ts="' + d.ts + '" title="' + absTime(d.ts) + '">' + relTime(d.ts) + '</time> · ' + esc(Store.deviceName(d.deviceId)) + '</span>' +
        '</span>' +
        '<span class="chip ' + (d.status === 'Delivered' ? 'chip--ok' : 'chip--warn') + ' delivery__status">' + esc(d.status) + '</span>' +
        '</li>';
    }).join('');

    var rows = state.visitorLog.filter(function (r) { return r.deviceId === state.deviceId; });
    $('#visitor-log-meta').textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries');
    $('#visitor-log-empty').hidden = rows.length > 0;
    $('.table-wrap').hidden = rows.length === 0;
    $('#visitor-log-body').innerHTML = rows.map(function (r) {
      var chip = r.type === 'Stranger' ? 'chip--danger' : r.type === 'Household' ? 'chip--accent' : 'chip--ghost';
      return '<tr>' +
        '<td>' + esc(r.visitor) + '</td>' +
        '<td><span class="chip ' + chip + '">' + esc(r.type) + '</span></td>' +
        '<td class="t-time"><time data-ts="' + r.ts + '" datetime="' + new Date(r.ts).toISOString() + '" title="' + absTime(r.ts) + '">' + relTime(r.ts) + '</time></td>' +
        '<td>' + esc(r.event) + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ========================= render orchestration ========================= */

  function renderAll() {
    renderDevicePills();
    renderStatusStrip();
    renderFeed();
    renderBanner();
    renderEventList();
    renderAnalytics();
    renderHealth();
    renderVisitors();
    updateUnreadBadges();
  }

  function onStoreChange(state, changed) {
    if (changed.devices) {
      renderDevicePills();
      renderStatusStrip();
      renderFeed();
    }
    if (changed.events) handleLiveEvents();
    if (changed.analytics) { renderStats(); scheduleAnalyticsRender(); }
    if (changed.banner) renderBanner();
    if (changed.deviceId) {
      loadSettingsDraft();
      renderAll();
    }
    if (changed.ui) renderFeed();
    if (changed.settings) { /* draft already local */ }
  }

  /* ========================= events wiring ========================= */

  function bindControls() {
    // device switcher
    $('#device-switch').addEventListener('click', function (evt) {
      var btn = evt.target.closest('[data-device]');
      if (!btn) return;
      var id = btn.getAttribute('data-device');
      if (id === Store.get().deviceId) return;
      setTalk(false);
      Store.set({ deviceId: id, banner: null }, ['deviceId', 'banner']);
      announce('Switched to ' + Store.deviceName(id));
    });

    // notification filters
    $('#filter-type').addEventListener('change', function (e) {
      Store.set({ filters: Object.assign({}, Store.get().filters, { type: e.target.value }) }, ['filters']);
      renderEventList();
    });
    $('#filter-range').addEventListener('change', function (e) {
      Store.set({ filters: Object.assign({}, Store.get().filters, { range: e.target.value }) }, ['filters']);
      renderEventList();
    });
    $('#filter-device').addEventListener('change', function (e) {
      Store.set({ filters: Object.assign({}, Store.get().filters, { device: e.target.value }) }, ['filters']);
      renderEventList();
    });
    $('#btn-clear-filters').addEventListener('click', function () {
      var filters = { type: 'all', range: '30d', device: 'all' };
      $('#filter-type').value = 'all';
      $('#filter-range').value = '30d';
      $('#filter-device').value = 'all';
      Store.set({ filters: filters }, ['filters']);
      renderEventList();
    });

    $('#btn-show-events').addEventListener('click', function () {
      eventsExpanded = !eventsExpanded;
      renderEventList();
      if (!eventsExpanded) {
        $('#notifications').scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    });

    $('#btn-mark-all').addEventListener('click', function () {
      var state = Store.get();
      var ids = state.events.filter(function (e) { return e.unread && e.deviceId === state.deviceId; }).map(function (e) { return e.id; });
      if (!ids.length) { toast('All caught up', 'No unread events on ' + Store.deviceName(state.deviceId) + '.', 'ok'); return; }
      Promise.all(ids.map(function (id) { return api.markEventRead(id); })).then(function () {
        Store.set({
          events: Store.get().events.map(function (e) {
            return e.unread && e.deviceId === state.deviceId ? Object.assign({}, e, { unread: false }) : e;
          })
        }, ['events']);
        toast('Marked as read', ids.length + ' events cleared on ' + Store.deviceName(state.deviceId) + '.', 'ok');
      });
    });

    $('#event-list').addEventListener('click', function (evt) {
      var btn = evt.target.closest('[data-action]');
      if (!btn) return;
      var li = btn.closest('.event');
      var id = li && li.dataset.id;
      if (!id) return;
      var action = btn.getAttribute('data-action');
      if (action === 'clip') {
        var ev = Store.get().events.filter(function (e) { return e.id === id; })[0];
        openClipPlayer(ev);
      } else if (action === 'read') {
        markRead(id);
      } else if (action === 'delete') {
        deleteEvent(id);
      }
    });

    /* ---------------- clip player ---------------- */
    var clipPlayer = { endTimer: null, tickTimer: null, prevFocus: null };
    var CLIP_MS = 4500;

    function openClipPlayer(ev) {
      if (!ev) return;
      var info = typeInfo(ev.type);
      var modal = $('#clip-modal');
      var sceneHost = $('#clip-scene');
      sceneHost.innerHTML = '';

      /* reuse the live porch scene as the clip footage */
      var src = $('#feed-stage .feed__scene');
      if (src) {
        var clone = src.cloneNode(true);
        clone.removeAttribute('class');
        clone.setAttribute('focusable', 'false');
        var fig = clone.querySelector('.scene-figure');
        if (fig) {
          fig.removeAttribute('id');
          fig.setAttribute('opacity', (ev.type === 'ring' || ev.type === 'person') ? '1' : '0.35');
        }
        sceneHost.appendChild(clone);
      }

      $('#clip-modal-title').textContent = info.label;
      $('#clip-modal-sub').textContent = Store.deviceName(ev.deviceId) + ' · ' + absTime(ev.ts);
      $('#clip-caption').textContent = info.label + ' · ' + Store.deviceName(ev.deviceId);

      modal.hidden = false;
      clipPlayer.prevFocus = document.activeElement;
      $('#clip-close').focus();
      $('#clip-rec').classList.remove('is-done');

      /* audio cue per event type (respects the feed Mute control) */
      SoundFX.clipCue(ev.type);

      var bar = $('#clip-bar');
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth;
      bar.style.transition = 'width ' + CLIP_MS + 'ms linear';
      bar.style.width = '100%';

      var start = Date.now();
      clearInterval(clipPlayer.tickTimer);
      clipPlayer.tickTimer = setInterval(function () {
        var elapsed = Math.min(CLIP_MS, Date.now() - start);
        var t = new Date(ev.ts + elapsed);
        $('#clip-clock').textContent = pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds());
        if (elapsed >= CLIP_MS) clearInterval(clipPlayer.tickTimer);
      }, 100);

      clearTimeout(clipPlayer.endTimer);
      clipPlayer.endTimer = setTimeout(function () {
        $('#clip-rec').classList.add('is-done');
        SoundFX.clipEnd();
      }, CLIP_MS);
    }

    function closeClipPlayer() {
      var modal = $('#clip-modal');
      if (modal.hidden) return;
      modal.hidden = true;
      clearTimeout(clipPlayer.endTimer);
      clearInterval(clipPlayer.tickTimer);
      $('#clip-scene').innerHTML = '';
      $('#clip-rec').classList.remove('is-done');
      if (clipPlayer.prevFocus && clipPlayer.prevFocus.focus) clipPlayer.prevFocus.focus();
      clipPlayer.prevFocus = null;
    }

    $('#clip-close').addEventListener('click', closeClipPlayer);
    $('[data-clip-close]').addEventListener('click', closeClipPlayer);

    // feed controls
    $('#btn-talk').addEventListener('click', function () { setTalk(!Store.get().ui.talk); });
    $('#btn-mute').addEventListener('click', function () {
      var state = Store.get();
      var next = Object.assign({}, state.ui, { mute: !state.ui.mute });
      Store.set({ ui: next }, ['ui']);
      toast(next.mute ? 'Speaker muted' : 'Speaker unmuted', null, 'ok');
    });
    $('#btn-snapshot').addEventListener('click', function () {
      var dev = Store.currentDevice();
      var btn = $('#btn-snapshot');
      var stage = $('#feed-stage');
      btn.disabled = true;

      /* shutter feel: flash + click + capture fly-off */
      stage.classList.remove('is-flash');
      void stage.offsetWidth; /* restart animation */
      stage.classList.add('is-flash');
      SoundFX.shutter();
      captureFly(stage);

      api.captureSnapshot(dev.id).then(function () {
        setTimeout(function () { btn.disabled = false; }, 350);
        var now = new Date();
        lastShot = {
          deviceId: dev.id,
          time: now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
        };
        renderFeed();
        toast('Snapshot saved', 'Saved to ' + dev.name + ' clips · just now.', 'ok');
      }).catch(function (err) {
        btn.disabled = false;
        toast('Snapshot failed', err.message, 'danger');
      }).then(function () {
        setTimeout(function () { stage.classList.remove('is-flash'); }, 500);
      });
    });

    /* clone the live scene into a mini frame that flies toward the HUD */
    function captureFly(stage) {
      var scene = $('.feed__scene', stage);
      if (!scene) return;
      var el = document.createElement('div');
      el.className = 'shot-fly';
      el.setAttribute('aria-hidden', 'true');
      var clone = scene.cloneNode(true);
      clone.removeAttribute('class');
      clone.setAttribute('focusable', 'false');
      el.appendChild(clone);
      stage.appendChild(el);
      setTimeout(function () { el.remove(); }, 950);
    }

    var confirmPop = $('#unlock-confirm');
    function closeConfirm() {
      confirmPop.hidden = true;
      $('#btn-unlock').setAttribute('aria-expanded', 'false');
    }
    $('#btn-unlock').addEventListener('click', function (e) {
      e.stopPropagation();
      var open = confirmPop.hidden;
      confirmPop.hidden = !open;
      $('#btn-unlock').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) $('#btn-unlock-confirm').focus();
    });
    $('#btn-unlock-cancel').addEventListener('click', function () {
      closeConfirm();
      $('#btn-unlock').focus();
    });
    $('#btn-unlock-confirm').addEventListener('click', function () {
      var dev = Store.currentDevice();
      closeConfirm();
      api.unlockDevice(dev.id).then(function () {
        toast('Door unlocked', dev.name + ' smart lock disengaged for 5 seconds.', 'ok');
        announce(dev.name + ' unlocked');
        setDoorUnlocked(dev.id);
      }).catch(function (err) {
        toast('Unlock failed', err.message, 'danger');
      });
    });
    document.addEventListener('click', function (e) {
      if (!confirmPop.hidden && !e.target.closest('.ctl-anchor')) closeConfirm();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#clip-modal').hidden) { closeClipPlayer(); return; }
      if (e.key === 'Escape' && !confirmPop.hidden) { closeConfirm(); $('#btn-unlock').focus(); }
    });

    /* Door scene animation: swing open, hold, then re-lock (matches the 5s toast). */
    function setDoorUnlocked(deviceId) {
      unlockedFor = deviceId;
      clearTimeout(doorTimer);
      doorTimer = setTimeout(function () {
        unlockedFor = null;
        renderFeed();
      }, 5000);
      renderFeed();
    }

    $('#btn-retry-stream').addEventListener('click', function () {
      var dev = Store.currentDevice();
      toast('Reconnecting…', 'Pinging ' + dev.name + ' over Wi-Fi.', 'accent');
      setTimeout(function () {
        toast('Still offline', dev.name + ' is out of Wi-Fi range. Check the router or power adapter.', 'danger');
      }, 1400);
    });

    $('#btn-simulate').addEventListener('click', function () {
      var dev = Store.currentDevice();
      if (!dev || !dev.online) return;
      // Route through the bus's de-duped path so rapid clicks cannot stack
      // near-identical ring events.
      var accepted = bus.ingestIfFresh({
        id: 'sim-' + Date.now(),
        deviceId: dev.id,
        type: 'ring',
        ts: Date.now(),
        unread: true,
        note: null,
        clip: true,
        live: true
      });
      if (accepted) {
        announce('Doorbell ring simulated');
      } else {
        toast('Ring already recent', 'A ring for ' + dev.name + ' was logged in the last minute.', 'accent');
      }
    });

    // ring banner
    $('#btn-ring-accept').addEventListener('click', function () {
      var state = Store.get();
      if (state.banner) {
        markRead(state.banner.eventId);
        Store.set({ banner: null }, ['banner']);
      }
      setTalk(true);
      toast('Connected', 'Two-way audio is live.', 'accent');
    });
    $('#btn-ring-dismiss').addEventListener('click', function () {
      Store.set({ banner: null }, ['banner']);
    });

    // settings form
    $('#settings-matrix').addEventListener('click', function (evt) {
      var btn = evt.target.closest('.switch');
      if (!btn || btn.disabled) return;
      var type = btn.getAttribute('data-type');
      var channel = btn.getAttribute('data-channel');
      var next = !settingsDraft.matrix[type][channel];
      settingsDraft.matrix[type][channel] = next;
      btn.setAttribute('aria-checked', String(next));
      markDirty();
    });

    $('#quiet-toggle').addEventListener('click', function () {
      settingsDraft.quietHours.enabled = !settingsDraft.quietHours.enabled;
      renderSettingsForm();
      markDirty();
    });
    ['quiet-start', 'quiet-end'].forEach(function (id) {
      $('#' + id).addEventListener('change', function (e) {
        settingsDraft.quietHours[id === 'quiet-start' ? 'start' : 'end'] = e.target.value;
        renderSettingsForm();
        markDirty();
      });
    });

    $('#sensitivity').addEventListener('input', function (e) {
      settingsDraft.sensitivity = Number(e.target.value);
      $('#sensitivity-label').textContent = SENSITIVITY[settingsDraft.sensitivity].label;
      $('#sensitivity-desc').textContent = SENSITIVITY[settingsDraft.sensitivity].desc;
      e.target.setAttribute('aria-valuetext', SENSITIVITY[settingsDraft.sensitivity].label);
      markDirty();
    });

    $('#zones-list').addEventListener('click', function (evt) {
      var btn = evt.target.closest('[data-zone]');
      if (!btn) return;
      var zone = btn.getAttribute('data-zone');
      settingsDraft.zones[zone] = !settingsDraft.zones[zone];
      renderSettingsForm();
      markDirty();
    });

    $('#chime-select').addEventListener('change', function (e) {
      settingsDraft.chime = e.target.value;
      markDirty();
    });
    $('#volume').addEventListener('input', function (e) {
      settingsDraft.volume = Number(e.target.value);
      $('#volume-value').textContent = settingsDraft.volume + '%';
      markDirty();
    });
    $('#btn-chime-preview').addEventListener('click', playChime);

    $('#settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      saveSettings();
    });
  }

  /* ========================= clock / spy ========================= */

  function bindTopbarCompact() {
    var topbar = $('.topbar');
    if (!topbar) return;
    var compact = false;
    function sync() {
      // Mobile only: collapse the strip + pills into a compact sticky bar.
      var should = window.innerWidth <= 899 && window.scrollY > 140;
      if (should !== compact) {
        compact = should;
        topbar.classList.toggle('is-compact', compact);
      }
    }
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 899 && compact) {
        compact = false;
        topbar.classList.remove('is-compact');
      } else {
        sync();
      }
    });
    // Section-nav jumps: compact first so the anchor clears the header.
    $$('.secnav__link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 899 && !compact) {
          compact = true;
          topbar.classList.add('is-compact');
        }
      });
    });
    sync();
  }

  function startClocks() {
    function tick() {
      var now = new Date();
      $('#feed-clock').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      $('#foot-clock').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
        ' · ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      var lastSeen = $('#strip-lastseen');
      if (lastSeen && lastSeen.dataset.ts) lastSeen.textContent = relTime(Number(lastSeen.dataset.ts));
      $$('time[data-ts]').forEach(function (t) {
        t.textContent = relTime(Number(t.dataset.ts));
      });
    }
    tick();
    setInterval(tick, 1000);

    var feedDev = Store.currentDevice();
    setInterval(function () {
      var dev = Store.currentDevice();
      if (!dev) return;
      if (!dev.online) {
        $('#feed-offline-detail').textContent =
          dev.name + ' stopped streaming ' + relTime(dev.lastSeenAt) + '. Live view, talk and remote unlock are unavailable.';
      }
      void feedDev;
    }, 20000);
  }

  function startScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    var links = $$('.secnav__link');
    var sections = links.map(function (l) { return $(l.getAttribute('href')); }).filter(Boolean);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (l) {
          l.classList.toggle('is-active', l.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-150px 0px -55% 0px', threshold: 0.01 });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ========================= boot ========================= */

  function loadAllData() {
    return api.listDevices().then(function (devices) {
      var ids = devices.map(function (d) { return d.id; });
      var requests = [
        api.getEvents({ deviceId: 'all', range: '30d' }),
        api.getVisitors(),
        api.getDeliveries('all'),
        api.getVisitorLog('all')
      ];
      var perDevice = [];
      ids.forEach(function (id) {
        perDevice.push(
          api.getHourlySeries(id), api.getDailySeries(id), api.getHeatmap(id), api.getAnalyticsSummary(id),
          api.getBatteryHistory(id), api.getSignalHistory(id), api.getLogs(id), api.getSettings(id)
        );
      });
      return Promise.all(requests.concat(perDevice)).then(function (res) {
        var events = res[0], visitors = res[1], deliveries = res[2], visitorLog = res[3];
        var offset = 4;
        var analytics = {}, health = {}, settings = {};
        ids.forEach(function (id, i) {
          var b = offset + i * 8;
          analytics[id] = { hourly: res[b], daily: res[b + 1], heatmap: res[b + 2], stats: res[b + 3] };
          health[id] = { batteryHistory: res[b + 4], signalHistory: res[b + 5], logs: res[b + 6] };
          settings[id] = res[b + 7];
        });
        return {
          devices: devices,
          events: events,
          visitors: visitors,
          deliveries: deliveries,
          visitorLog: visitorLog,
          analytics: analytics,
          health: health,
          settings: settings
        };
      });
    });
  }

  function init() {
    bindTheme();
    bindAccount();
    bindControls();
    renderDevicePills();
    renderStatusStrip();
    renderEventList(); // skeletons
    renderFeed();
    startClocks();
    bindTopbarCompact();
    startScrollSpy();
    Store.subscribe(onStoreChange);

    loadAllData().then(function (data) {
      Store.set({
        ready: true,
        loading: false,
        devices: data.devices,
        deviceId: data.devices[0].id,
        events: data.events,
        visitors: data.visitors,
        deliveries: data.deliveries,
        visitorLog: data.visitorLog,
        analytics: data.analytics,
        health: data.health,
        settings: data.settings
      });
      loadSettingsDraft();
      renderAll();
      booted = true;
      bus.start();
      announce('Dashboard live. Monitoring ' + data.devices[0].name + '.');
    }).catch(function (err) {
      console.error(err);
      Store.set({ loading: false }, ['loading']);
      toast('Could not load dashboard', 'Refresh the page to retry.', 'danger');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
