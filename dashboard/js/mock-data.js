/**
 * Porchlight — mock data layer.
 * Deterministic (seeded) sample data for 3 doorbell devices: statuses, events,
 * analytics series, health histories, visitors, deliveries, logs and settings.
 * Everything lives on window.MockData so plain <script> tags can share it.
 */
(function (global) {
  'use strict';

  /* ---------- helpers ---------- */

  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngFor(key) {
    return mulberry32(hashSeed(key));
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  var MIN = 60000;
  var HOUR = 3600000;
  var DAY = 86400000;

  var EVENT_TYPES = {
    ring: { label: 'Doorbell ring', tone: 'alert' },
    motion: { label: 'Motion detected', tone: 'warn' },
    person: { label: 'Person detected', tone: 'warn' },
    package: { label: 'Package delivered', tone: 'ok' },
    tamper: { label: 'Tamper alert', tone: 'alert' },
    low_battery: { label: 'Low battery', tone: 'warn' },
    offline: { label: 'Device offline', tone: 'alert' }
  };

  /* ---------- devices ---------- */

  function buildDevices() {
    return [
      {
        id: 'front-door',
        name: 'Front Door',
        model: 'SmartRing Doorbell Pro 2',
        firmware: '2.8.1',
        battery: 86,
        wifiDbm: -48,
        wifiBars: 4,
        online: true,
        lastSeenAt: Date.now() - 12 * 1000,
        storageUsedGb: 12.4,
        storageTotalGb: 32,
        uptime: '14d 6h',
        retentionDays: 30
      },
      {
        id: 'back-door',
        name: 'Back Door',
        model: 'SmartRing Doorbell Pro 2',
        firmware: '2.7.4',
        battery: 41,
        wifiDbm: -67,
        wifiBars: 3,
        online: true,
        lastSeenAt: Date.now() - 47 * 1000,
        storageUsedGb: 6.1,
        storageTotalGb: 32,
        uptime: '9d 2h',
        retentionDays: 30
      },
      {
        id: 'garage',
        name: 'Garage',
        model: 'SmartRing Doorbell Mini',
        firmware: '2.6.9',
        battery: 17,
        wifiDbm: -78,
        wifiBars: 1,
        online: false,
        lastSeenAt: Date.now() - 62 * MIN,
        storageUsedGb: 21.8,
        storageTotalGb: 32,
        uptime: '—',
        retentionDays: 30
      }
    ];
  }

  /* ---------- events ---------- */
  // [minutesAgo, deviceId, type, { unread?, note? }]
  var EVENT_SEEDS = [
    [4, 'front-door', 'ring', { unread: true }],
    [17, 'front-door', 'person', { unread: true }],
    [38, 'back-door', 'motion', { unread: true }],
    [63, 'front-door', 'package', { unread: true }],
    [105, 'front-door', 'motion', { unread: true }],
    [142, 'garage', 'offline', { unread: true }],
    [186, 'back-door', 'ring', {}],
    [231, 'front-door', 'person', {}],
    [288, 'front-door', 'motion', {}],
    [340, 'back-door', 'motion', {}],
    [410, 'front-door', 'ring', {}],
    [495, 'garage', 'low_battery', { note: 'Garage battery dropped to 19%' }],
    [560, 'back-door', 'person', {}],
    [640, 'front-door', 'motion', {}],
    [720, 'front-door', 'ring', {}],
    [890, 'garage', 'motion', {}],
    [1010, 'front-door', 'package', {}],
    [1180, 'back-door', 'ring', {}],
    [1440, 'front-door', 'motion', {}],
    [1620, 'front-door', 'tamper', { note: 'Side panel vibration above threshold' }],
    [1880, 'back-door', 'motion', {}],
    [2300, 'front-door', 'person', {}],
    [2880, 'front-door', 'ring', {}],
    [3300, 'garage', 'low_battery', { note: 'Garage battery dropped to 22%' }],
    [4010, 'back-door', 'motion', {}],
    [4600, 'front-door', 'motion', {}],
    [5300, 'front-door', 'package', {}],
    [6100, 'back-door', 'person', {}],
    [7400, 'front-door', 'ring', {}],
    [8800, 'front-door', 'motion', {}],
    [10120, 'back-door', 'motion', {}],
    [11700, 'front-door', 'person', {}],
    [13200, 'front-door', 'motion', {}],
    [15600, 'back-door', 'ring', {}],
    [18000, 'front-door', 'package', {}],
    [21500, 'front-door', 'motion', {}],
    [25000, 'back-door', 'motion', {}],
    [28400, 'front-door', 'ring', {}],
    [32200, 'garage', 'motion', {}],
    [36600, 'front-door', 'person', {}],
    [41000, 'back-door', 'person', {}],
    [46800, 'front-door', 'motion', {}],
    [53000, 'front-door', 'ring', {}],
    [59400, 'back-door', 'motion', {}],
    [64800, 'front-door', 'motion', {}]
  ];

  function buildEvents(now) {
    var events = [];
    for (var i = 0; i < EVENT_SEEDS.length; i++) {
      var seed = EVENT_SEEDS[i];
      var ts = now - seed[0] * MIN;
      var opts = seed[3] || {};
      events.push({
        id: 'ev-' + (1000 + i),
        deviceId: seed[1],
        type: seed[2],
        ts: ts,
        unread: !!opts.unread,
        note: opts.note || null,
        clip: seed[2] === 'ring' || seed[2] === 'person' || seed[2] === 'package'
      });
    }
    events.sort(function (a, b) { return b.ts - a.ts; });
    return events;
  }

  /* ---------- analytics ---------- */

  var HOUR_SHAPE = [
    0.08, 0.05, 0.04, 0.03, 0.03, 0.05, // 00-05 night
    0.18, 0.42, 0.86, 0.95, 0.62, 0.48, // 06-11 morning
    0.55, 0.44, 0.38, 0.42, 0.58, 0.92, // 12-17 afternoon
    1.0, 0.78, 0.52, 0.34, 0.2, 0.12    // 18-23 evening
  ];

  var DAY_SHAPE = [0.72, 0.64, 0.8, 0.88, 1.0, 0.94, 0.7]; // Mon..Sun

  function scaleSeries(shape, scale, rng, jitter) {
    return shape.map(function (v) {
      return Math.max(0, Math.round(v * scale * (1 + (rng() * 2 - 1) * jitter)));
    });
  }

  function buildHeatmap(scale, rng) {
    // 7 rows (Mon..Sun) x 12 cols (two-hour blocks)
    var rows = [];
    for (var d = 0; d < 7; d++) {
      var row = [];
      for (var h = 0; h < 12; h++) {
        var hour = h * 2;
        var shape = (HOUR_SHAPE[hour] + HOUR_SHAPE[Math.min(23, hour + 1)]) / 2;
        var dayFactor = DAY_SHAPE[d];
        var v = shape * dayFactor * scale * (0.75 + rng() * 0.5);
        row.push(Math.max(0, Math.round(v * 3)));
      }
      rows.push(row);
    }
    return rows;
  }

  function buildAnalytics(devices) {
    var out = {};
    var profiles = {
      'front-door': { scale: 1.0, rings: 9, motion: 23, missed: 2, ringDelta: 12, motionDelta: 8, missedDelta: -25 },
      'back-door': { scale: 0.55, rings: 3, motion: 11, missed: 1, ringDelta: -8, motionDelta: 4, missedDelta: 0 },
      'garage': { scale: 0.3, rings: 1, motion: 6, missed: 1, ringDelta: 0, motionDelta: -12, missedDelta: 100 }
    };
    devices.forEach(function (dev) {
      var p = profiles[dev.id];
      var rng = rngFor(dev.id + ':analytics');
      out[dev.id] = {
        hourly: scaleSeries(HOUR_SHAPE, p.scale * 14, rng, 0.25),
        daily: scaleSeries(DAY_SHAPE, p.scale * 26, rng, 0.18),
        heatmap: buildHeatmap(p.scale * 9, rng),
        stats: {
          rings: { value: p.rings, delta: p.ringDelta },
          motion: { value: p.motion, delta: p.motionDelta },
          missed: { value: p.missed, delta: p.missedDelta }
        }
      };
    });
    return out;
  }

  /* ---------- health ---------- */

  var BATTERY_HISTORY = {
    'front-door': [97, 95, 94, 92, 90, 88, 86],
    'back-door': [56, 54, 51, 49, 46, 44, 41],
    'garage': [31, 28, 26, 24, 21, 19, 17]
  };

  function buildSignalHistory(dev) {
    var rng = rngFor(dev.id + ':signal');
    var pts = [];
    for (var i = 0; i < 24; i++) {
      pts.push(Math.round(dev.wifiDbm + (rng() * 8 - 4)));
    }
    return pts;
  }

  var LOG_SEEDS = {
    'front-door': [
      ['I-001', 'info', 'Firmware 2.8.1 installed successfully', 2 * DAY],
      ['W-210', 'warn', 'Wi-Fi signal dipped below −70 dBm', 30 * HOUR],
      ['I-014', 'info', 'Night vision switched to infrared', 26 * HOUR],
      ['E-104', 'error', 'Camera stream interrupted for 41s', 11 * HOUR],
      ['I-022', 'info', 'Clip uploaded to cloud storage', 5 * HOUR]
    ],
    'back-door': [
      ['W-210', 'warn', 'Wi-Fi signal dipped below −70 dBm', 2 * DAY],
      ['I-001', 'info', 'Firmware 2.7.4 installed successfully', 5 * DAY],
      ['W-118', 'warn', 'Motion zone recalibrated by homeowner', 20 * HOUR],
      ['I-022', 'info', 'Clip uploaded to cloud storage', 9 * HOUR]
    ],
    'garage': [
      ['E-402', 'error', 'Device went offline — no heartbeat for 10 min', 62 * MIN],
      ['W-301', 'warn', 'Battery below 20% — schedule a recharge', 5 * HOUR],
      ['E-210', 'error', 'Wi-Fi association failed (RSI −78 dBm)', 7 * HOUR],
      ['W-210', 'warn', 'Wi-Fi signal dipped below −70 dBm', 2 * DAY],
      ['I-001', 'info', 'Firmware 2.6.9 installed successfully', 9 * DAY]
    ]
  };

  function buildHealth(devices, now) {
    var out = {};
    devices.forEach(function (dev) {
      var logs = (LOG_SEEDS[dev.id] || []).map(function (l, i) {
        return {
          id: dev.id + '-log-' + i,
          code: l[0],
          severity: l[1],
          message: l[2],
          ts: now - l[3]
        };
      });
      out[dev.id] = {
        batteryHistory: BATTERY_HISTORY[dev.id] || [],
        signalHistory: buildSignalHistory(dev),
        logs: logs
      };
    });
    return out;
  }

  /* ---------- visitors, deliveries, log ---------- */

  var VISITORS = [
    { id: 'v-maya', name: 'Maya Chen', initials: 'MC', tag: 'Household', lastVisit: '2h ago', device: 'Front Door' },
    { id: 'v-daniel', name: 'Daniel Ruiz', initials: 'DR', tag: 'Household', lastVisit: 'Yesterday', device: 'Front Door' },
    { id: 'v-priya', name: 'Priya Nair', initials: 'PN', tag: 'Guest', lastVisit: '2d ago', device: 'Back Door' },
    { id: 'v-tom', name: 'Tom Becker', initials: 'TB', tag: 'Neighbor', lastVisit: '5d ago', device: 'Front Door' },
    { id: 'v-lena', name: 'Lena Ford', initials: 'LF', tag: 'Guest', lastVisit: '1w ago', device: 'Back Door' },
    { id: 'v-sam', name: 'Sam Okafor', initials: 'SO', tag: 'Household', lastVisit: '3d ago', device: 'Front Door' }
  ];

  function buildDeliveries(now) {
    return [
      { id: 'd-1', deviceId: 'front-door', carrier: 'UPS', pkg: '1Z999AA10123456784', ts: now - 63 * MIN, status: 'Delivered' },
      { id: 'd-2', deviceId: 'front-door', carrier: 'FedEx', pkg: '7712 4408 9931', ts: now - 26 * HOUR, status: 'Delivered' },
      { id: 'd-3', deviceId: 'back-door', carrier: 'USPS', pkg: '9400 1000 0000 0000 4821', ts: now - 2 * DAY, status: 'Delivered' },
      { id: 'd-4', deviceId: 'front-door', carrier: 'DHL', pkg: 'JJD0003456789', ts: now - 4 * DAY, status: 'Left with neighbor' },
      { id: 'd-5', deviceId: 'front-door', carrier: 'Amazon', pkg: 'TBA307199204500', ts: now - 6 * DAY, status: 'Delivered' }
    ];
  }

  function buildVisitorLog(now) {
    // deviceId is embedded so the table can filter per device
    return [
      { id: 'l-1', deviceId: 'front-door', visitor: 'Maya Chen', type: 'Household', ts: now - 2 * HOUR, event: 'Doorbell answered from app' },
      { id: 'l-2', deviceId: 'front-door', visitor: 'UPS driver', type: 'Delivery', ts: now - 63 * MIN, event: 'Package left at porch' },
      { id: 'l-3', deviceId: 'front-door', visitor: 'Unknown', type: 'Stranger', ts: now - 17 * MIN, event: 'Person detected' },
      { id: 'l-4', deviceId: 'back-door', visitor: 'Priya Nair', type: 'Guest', ts: now - 38 * MIN, event: 'Motion in Walkway' },
      { id: 'l-5', deviceId: 'front-door', visitor: 'Daniel Ruiz', type: 'Household', ts: now - 23 * HOUR, event: 'Doorbell answered' },
      { id: 'l-6', deviceId: 'back-door', visitor: 'Lena Ford', type: 'Guest', ts: now - 3 * DAY, event: 'Doorbell ring' },
      { id: 'l-7', deviceId: 'front-door', visitor: 'Tom Becker', type: 'Neighbor', ts: now - 5 * DAY, event: 'Person detected' },
      { id: 'l-8', deviceId: 'front-door', visitor: 'Sam Okafor', type: 'Household', ts: now - 3 * DAY, event: 'Unlocked with code' },
      { id: 'l-9', deviceId: 'back-door', visitor: 'Unknown', type: 'Stranger', ts: now - 6 * DAY, event: 'Motion in Yard' }
    ];
  }

  /* ---------- settings ---------- */

  var SETTING_TYPES = [
    { id: 'ring', label: 'Doorbell ring' },
    { id: 'motion', label: 'Motion detected' },
    { id: 'person', label: 'Person detected' },
    { id: 'package', label: 'Package delivered' },
    { id: 'tamper', label: 'Tamper alert' },
    { id: 'low_battery', label: 'Low battery' },
    { id: 'offline', label: 'Device offline' }
  ];

  var CHIME_OPTIONS = [
    { id: 'classic', label: 'Classic' },
    { id: 'chime', label: 'Chime' },
    { id: 'melody', label: 'Melody' },
    { id: 'doorbell', label: 'Doorbell' }
  ];

  function defaultMatrix(deviceId) {
    var m = {};
    SETTING_TYPES.forEach(function (t) {
      m[t.id] = {
        push: true,
        sms: t.id === 'ring' || t.id === 'tamper' || t.id === 'person',
        email: t.id === 'offline' || t.id === 'low_battery' || t.id === 'tamper'
      };
    });
    if (deviceId === 'garage') {
      m.motion.push = false;
      m.motion.email = false;
      m.package.push = false;
    }
    return m;
  }

  function buildSettings(devices) {
    var out = {};
    devices.forEach(function (dev) {
      out[dev.id] = {
        matrix: defaultMatrix(dev.id),
        quietHours: {
          enabled: dev.id !== 'garage',
          start: '22:30',
          end: '07:00'
        },
        sensitivity: dev.id === 'front-door' ? 4 : dev.id === 'back-door' ? 3 : 2,
        zones: { porch: true, walkway: dev.id !== 'garage', yard: dev.id === 'front-door' },
        chime: dev.id === 'garage' ? 'classic' : dev.id === 'back-door' ? 'chime' : 'melody',
        volume: dev.id === 'garage' ? 40 : 75
      };
    });
    return out;
  }

  /* ---------- public snapshot ---------- */

  function snapshot() {
    var now = Date.now();
    var devices = buildDevices();
    return {
      now: now,
      devices: devices,
      events: buildEvents(now),
      analytics: buildAnalytics(devices),
      health: buildHealth(devices, now),
      visitors: VISITORS.slice(),
      deliveries: buildDeliveries(now),
      visitorLog: buildVisitorLog(now),
      settings: buildSettings(devices)
    };
  }

  global.MockData = {
    EVENT_TYPES: EVENT_TYPES,
    SETTING_TYPES: SETTING_TYPES,
    CHIME_OPTIONS: CHIME_OPTIONS,
    ZONES: [
      { id: 'porch', label: 'Porch' },
      { id: 'walkway', label: 'Walkway' },
      { id: 'yard', label: 'Yard' }
    ],
    snapshot: snapshot
  };
})(window);
