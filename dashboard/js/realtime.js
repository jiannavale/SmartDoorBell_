/**
 * Porchlight — mock realtime engine.
 * Emits weighted doorbell events (motion/person most often) every 8–20 s and
 * pushes them through the central store, exactly the way a live push channel
 * would. It also bumps the in-memory API dataset so a page reload stays
 * consistent during the session.
 */
(function (global) {
  'use strict';

  var TYPE_WEIGHTS = [
    { type: 'motion', weight: 0.3 },
    { type: 'person', weight: 0.22 },
    { type: 'ring', weight: 0.14 },
    { type: 'package', weight: 0.1 },
    { type: 'low_battery', weight: 0.08 },
    { type: 'tamper', weight: 0.06 },
    { type: 'offline', weight: 0.04 }
  ];

  var TOTAL_WEIGHT = TYPE_WEIGHTS.reduce(function (sum, w) { return sum + w.weight; }, 0);

  var NOTES = {
    tamper: 'Side panel vibration above threshold',
    low_battery: 'Battery crossed the 20% threshold',
    offline: 'No heartbeat received for 10 minutes'
  };

  function weightedType(rand) {
    var r = rand() * TOTAL_WEIGHT;
    var acc = 0;
    for (var i = 0; i < TYPE_WEIGHTS.length; i++) {
      acc += TYPE_WEIGHTS[i].weight;
      if (r <= acc) return TYPE_WEIGHTS[i].type;
    }
    return 'motion';
  }

  function MockRealtimeBus(options) {
    this.store = options.store;
    this.rand = Math.random;
    this.timer = null;
    this.seq = 0;
    this.running = false;
    this.lastByDeviceType = {}; // de-dupe cooldown: deviceId:type -> ts
  }

  MockRealtimeBus.prototype.start = function () {
    if (this.running) return;
    this.running = true;

    // PLACEHOLDER: replace this timer with a real push client, e.g.
    //
    //   const socket = new WebSocket('wss://api.porchlight.home/v1/stream');
    //   socket.onmessage = (msg) => this.ingest(JSON.parse(msg.data));
    //
    // …or an MQTT subscription:
    //
    //   const client = mqtt.connect('mqtts://broker.porchlight.home');
    //   client.subscribe('homes/+/devices/+/events');
    //   client.on('message', (topic, payload) => this.ingest(JSON.parse(payload)));
    //
    // `ingest(event)` accepts the same shape the REST API returns, so the
    // dashboard code never changes when the mock is swapped out.

    // Seed the de-dupe window from existing history so the first tick cannot
    // echo a very recent seeded event.
    var history = this.store.get().events || [];
    for (var i = 0, len = Math.min(history.length, 40); i < len; i++) {
      this.lastByDeviceType[history[i].deviceId + ':' + history[i].type] = history[i].ts;
    }

    this._schedule();
  };

  MockRealtimeBus.prototype.stop = function () {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  };

  MockRealtimeBus.prototype._schedule = function () {
    var self = this;
    var wait = 8000 + Math.random() * 12000; // 8–20s
    this.timer = setTimeout(function () {
      if (!self.running) return;
      self._tick();
      self._schedule();
    }, wait);
  };

  var DEDUPE_COOLDOWN_MS = 60000;

  /** True when this device:type pair fired inside the de-dupe window. */
  MockRealtimeBus.prototype._onCooldown = function (deviceId, type) {
    var last = this.lastByDeviceType[deviceId + ':' + type] || 0;
    return Date.now() - last < DEDUPE_COOLDOWN_MS;
  };

  /**
   * Manual / external emit that respects the same de-dupe window as the
   * auto bus, so rapid "Simulate ring" clicks cannot spam near-identical
   * events. Returns true when the event was accepted.
   */
  MockRealtimeBus.prototype.ingestIfFresh = function (event) {
    if (this._onCooldown(event.deviceId, event.type)) return false;
    this.ingest(event);
    return true;
  };

  MockRealtimeBus.prototype._tick = function () {
    var store = this.store;
    var state = store.get();
    if (!state.devices.length) return;

    // Pick a type that is not still inside its de-dupe window for this device.
    var type = weightedType(this.rand);
    var device;
    var cooled = false;
    var attempt;
    for (attempt = 0; attempt < 4; attempt++) {
      device = this.rand() < 0.5
        ? (store.currentDevice() || state.devices[0])
        : state.devices[Math.floor(this.rand() * state.devices.length)];
      if (!this._onCooldown(device.id, type)) { cooled = true; break; }
      type = weightedType(this.rand);
    }
    if (!cooled) return; // whole tick skipped — feed stays believable

    // A dead device cannot ring. Garage is the permanent offline demo device:
    // it must never auto-recover (only a manual Retry could change that).
    if (!device.online && type !== 'offline') {
      if (device.id !== 'garage' && this.rand() < 0.5) {
        this._setOnline(device, true);
        return;
      }
      type = 'offline';
    }
    if (device.online && type === 'offline' && this.rand() < 0.7) {
      type = 'motion';
    }

    var event = {
      id: 'rt-' + Date.now() + '-' + (++this.seq),
      deviceId: device.id,
      type: type,
      ts: Date.now(),
      unread: true,
      note: NOTES[type] || null,
      clip: type === 'ring' || type === 'person' || type === 'package',
      live: true
    };

    this.ingest(event);
  };

  /** Public entry point — also used by the future WebSocket/MQTT handler. */
  MockRealtimeBus.prototype.ingest = function (event) {
    var store = this.store;
    var state = store.get();

    this.lastByDeviceType[event.deviceId + ':' + event.type] = event.ts;

    var events = [event].concat(state.events);
    var analytics = bumpAnalytics(state.analytics, event);
    var devices = state.devices.map(function (d) {
      if (d.id !== event.deviceId) return d;
      var next = Object.assign({}, d, { lastSeenAt: event.ts });
      if (event.type === 'low_battery' && next.battery > 5) {
        next.battery = next.battery - 1;
      }
      return next;
    });

    var patch = { events: events, analytics: analytics, devices: devices };
    var keys = ['events', 'analytics', 'devices'];

    if (event.type === 'ring' && event.deviceId === state.deviceId) {
      patch.banner = { eventId: event.id, deviceId: event.deviceId, ts: event.ts };
      keys.push('banner');
    }

    // Keep the mock API dataset in sync so REST reads see live events too.
    if (global.api && global.api._db) {
      global.api._db.events.unshift(event);
    }

    store.set(patch, keys);
  };

  MockRealtimeBus.prototype._setOnline = function (device, online) {
    var store = this.store;
    var state = store.get();
    var devices = state.devices.map(function (d) {
      if (d.id !== device.id) return d;
      return Object.assign({}, d, {
        online: online,
        lastSeenAt: Date.now(),
        uptime: online ? '0d 0h' : d.uptime
      });
    });
    store.set({ devices: devices }, ['devices']);
  };

  function bumpAnalytics(analytics, event) {
    var next = Object.assign({}, analytics);
    var entry = next[event.deviceId];
    if (!entry) return next;

    var hourly = entry.hourly.slice();
    var daily = entry.daily.slice();
    var heatmap = entry.heatmap.map(function (row) { return row.slice(); });
    var stats = {
      rings: Object.assign({}, entry.stats.rings),
      motion: Object.assign({}, entry.stats.motion),
      missed: Object.assign({}, entry.stats.missed)
    };

    var now = new Date(event.ts);
    hourly[23] = hourly[23] + 1;

    var mondayIdx = (now.getDay() + 6) % 7; // Mon = 0
    var weekIdx = 6; // today is the last bar of the 7-day chart
    daily[weekIdx] = daily[weekIdx] + 1;

    var block = Math.min(11, Math.floor(now.getHours() / 2));
    heatmap[mondayIdx][block] = heatmap[mondayIdx][block] + 1;

    if (event.type === 'ring') {
      stats.rings.value += 1;
    } else if (event.type === 'motion' || event.type === 'person') {
      stats.motion.value += 1;
    } else if (event.type === 'offline' || event.type === 'tamper') {
      stats.missed.value += 1;
    }

    next[event.deviceId] = {
      hourly: hourly,
      daily: daily,
      heatmap: heatmap,
      stats: stats
    };
    return next;
  }

  global.MockRealtimeBus = MockRealtimeBus;
})(window);
