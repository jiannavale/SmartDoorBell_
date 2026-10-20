/**
 * ============================================================================
 * Porchlight REST API surface
 * ============================================================================
 * Every dashboard panel talks to the backend exclusively through the client
 * below. In production these functions become thin fetch() wrappers against a
 * real device/cloud API; the dashboard UI never touches transport directly.
 *
 *   GET    /devices                          listDevices()
 *   GET    /devices/:id/status               getDeviceStatus(id)
 *   GET    /events?device=&type=&range=      getEvents(query)
 *   POST   /events/:id/read                  markEventRead(id)
 *   DELETE /events/:id                       deleteEvent(id)
 *   GET    /analytics/summary?device=        getAnalyticsSummary(deviceId)
 *   GET    /analytics/hourly?device=         getHourlySeries(deviceId)
 *   GET    /analytics/daily?device=          getDailySeries(deviceId)
 *   GET    /analytics/heatmap?device=        getHeatmap(deviceId)
 *   GET    /health?device=                   getHealth(deviceId)
 *   GET    /health/battery-history?device=   getBatteryHistory(deviceId)
 *   GET    /health/signal-history?device=    getSignalHistory(deviceId)
 *   GET    /logs?device=                     getLogs(deviceId)
 *   GET    /visitors                         getVisitors()
 *   GET    /deliveries?device=               getDeliveries(deviceId)
 *   GET    /settings?device=                 getSettings(deviceId)
 *   PUT    /settings?device=                 putSettings(deviceId, settings)
 *   POST   /devices/:id/unlock               unlockDevice(id)
 *   POST   /devices/:id/talk                 setTalk(id, active)
 *   POST   /devices/:id/snapshot             captureSnapshot(id)
 *   POST   /auth/login                       (see js/auth.js — mock session)
 *   POST   /auth/logout                      (see js/auth.js)
 *   GET    /auth/me                          (see js/auth.js)
 *
 * Live telemetry (ring / motion / person / …) is NOT polled — it arrives over
 * a push channel. See the PLACEHOLDER comment in js/realtime.js where the
 * WebSocket / MQTT client connects and publishes into the same store.
 * ============================================================================
 */
(function (global) {
  'use strict';

  var DB = global.MockData.snapshot();

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deviceById(id) {
    var found = null;
    DB.devices.forEach(function (d) {
      if (d.id === id) found = d;
    });
    return found;
  }

  var RANGE_MS = {
    today: 24 * 3600000,
    '7d': 7 * 86400000,
    '30d': 30 * 86400000
  };

  function getEvents(query) {
    query = query || {};
    return delay(180).then(function () {
      var now = Date.now();
      var windowMs = RANGE_MS[query.range || '7d'] || RANGE_MS['7d'];
      var list = DB.events.filter(function (ev) {
        if (query.deviceId && query.deviceId !== 'all' && ev.deviceId !== query.deviceId) return false;
        if (query.type && query.type !== 'all' && ev.type !== query.type) return false;
        return now - ev.ts <= windowMs;
      });
      list.sort(function (a, b) { return b.ts - a.ts; });
      return clone(list);
    });
  }

  function markEventRead(id) {
    return delay(90).then(function () {
      DB.events.forEach(function (ev) {
        if (ev.id === id) ev.unread = false;
      });
      return { ok: true, id: id };
    });
  }

  function deleteEvent(id) {
    return delay(110).then(function () {
      DB.events = DB.events.filter(function (ev) { return ev.id !== id; });
      return { ok: true, id: id };
    });
  }

  var api = {
    /** GET /devices */
    listDevices: function () {
      return delay(160).then(function () { return clone(DB.devices); });
    },

    /** GET /devices/:id/status */
    getDeviceStatus: function (id) {
      return delay(120).then(function () {
        var dev = deviceById(id);
        if (!dev) throw new Error('Unknown device: ' + id);
        return clone(dev);
      });
    },

    getEvents: getEvents,
    markEventRead: markEventRead,
    deleteEvent: deleteEvent,

    /** GET /analytics/summary */
    getAnalyticsSummary: function (deviceId) {
      return delay(140).then(function () {
        return clone(DB.analytics[deviceId].stats);
      });
    },

    /** GET /analytics/hourly */
    getHourlySeries: function (deviceId) {
      return delay(140).then(function () {
        return clone(DB.analytics[deviceId].hourly);
      });
    },

    /** GET /analytics/daily */
    getDailySeries: function (deviceId) {
      return delay(140).then(function () {
        return clone(DB.analytics[deviceId].daily);
      });
    },

    /** GET /analytics/heatmap */
    getHeatmap: function (deviceId) {
      return delay(140).then(function () {
        return clone(DB.analytics[deviceId].heatmap);
      });
    },

    /** GET /health */
    getHealth: function (deviceId) {
      return delay(150).then(function () {
        var dev = deviceById(deviceId);
        var h = DB.health[deviceId];
        return {
          battery: dev ? dev.battery : 0,
          wifiDbm: dev ? dev.wifiDbm : 0,
          uptime: dev ? dev.uptime : '—',
          storageUsedGb: dev ? dev.storageUsedGb : 0,
          storageTotalGb: dev ? dev.storageTotalGb : 32,
          batteryHistory: clone(h.batteryHistory),
          signalHistory: clone(h.signalHistory)
        };
      });
    },

    /** GET /health/battery-history */
    getBatteryHistory: function (deviceId) {
      return delay(130).then(function () {
        return clone(DB.health[deviceId].batteryHistory);
      });
    },

    /** GET /health/signal-history */
    getSignalHistory: function (deviceId) {
      return delay(130).then(function () {
        return clone(DB.health[deviceId].signalHistory);
      });
    },

    /** GET /logs */
    getLogs: function (deviceId) {
      return delay(170).then(function () {
        return clone(DB.health[deviceId].logs);
      });
    },

    /** GET /visitors */
    getVisitors: function () {
      return delay(150).then(function () { return clone(DB.visitors); });
    },

    /** GET /deliveries */
    getDeliveries: function (deviceId) {
      return delay(160).then(function () {
        var list = DB.deliveries.filter(function (d) {
          return !deviceId || deviceId === 'all' || d.deviceId === deviceId;
        });
        return clone(list);
      });
    },

    /** GET /visitors/log — access history rows (device-filtered) */
    getVisitorLog: function (deviceId) {
      return delay(160).then(function () {
        var list = DB.visitorLog.filter(function (row) {
          return !deviceId || deviceId === 'all' || row.deviceId === deviceId;
        });
        list.sort(function (a, b) { return b.ts - a.ts; });
        return clone(list);
      });
    },

    /** GET /settings */
    getSettings: function (deviceId) {
      return delay(130).then(function () {
        return clone(DB.settings[deviceId]);
      });
    },

    /** PUT /settings */
    putSettings: function (deviceId, settings) {
      return delay(220).then(function () {
        DB.settings[deviceId] = clone(settings);
        return { ok: true, deviceId: deviceId };
      });
    },

    /** POST /devices/:id/unlock */
    unlockDevice: function (id) {
      return delay(450).then(function () {
        var dev = deviceById(id);
        if (!dev) throw new Error('Unknown device: ' + id);
        if (!dev.online) throw new Error(dev.name + ' is offline — unlock unavailable');
        return { ok: true, deviceId: id, unlockedAt: Date.now() };
      });
    },

    /** POST /devices/:id/talk */
    setTalk: function (id, active) {
      return delay(120).then(function () {
        return { ok: true, deviceId: id, talk: !!active };
      });
    },

    /** POST /devices/:id/snapshot */
    captureSnapshot: function (id) {
      return delay(260).then(function () {
        var dev = deviceById(id);
        if (!dev || !dev.online) throw new Error('Snapshot failed — device offline');
        return { ok: true, deviceId: id, savedAt: Date.now() };
      });
    },

    /** Internal: keeps mock DB reachable for the realtime bus. */
    _db: DB
  };

  global.api = api;
})(window);
