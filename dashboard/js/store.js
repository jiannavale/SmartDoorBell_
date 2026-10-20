/**
 * Porchlight — tiny central store with pub/sub.
 * All panels render from this single state object; nothing else holds truth.
 */
(function (global) {
  'use strict';

  function createStore(initial) {
    var state = initial;
    var listeners = [];

    function get() {
      return state;
    }

    /** set(partialState, changedKeys) — changedKeys defaults to Object.keys(patch) */
    function set(patch, changedKeys) {
      if (!patch) return state;
      var keys = changedKeys || Object.keys(patch);
      Object.keys(patch).forEach(function (k) {
        state[k] = patch[k];
      });
      var changed = {};
      keys.forEach(function (k) { changed[k] = true; });
      listeners.forEach(function (fn) {
        try { fn(state, changed); } catch (err) { console.error('[store] listener failed', err); }
      });
      return state;
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function unsubscribe() {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    /* ---- derived helpers ---- */

    function currentDevice() {
      var found = null;
      state.devices.forEach(function (d) {
        if (d.id === state.deviceId) found = d;
      });
      return found || state.devices[0] || null;
    }

    function deviceById(id) {
      var found = null;
      state.devices.forEach(function (d) {
        if (d.id === id) found = d;
      });
      return found;
    }

    function deviceName(id) {
      var d = deviceById(id);
      return d ? d.name : id;
    }

    function unreadCount(deviceId) {
      return state.events.filter(function (ev) {
        return ev.unread && (!deviceId || deviceId === 'all' || ev.deviceId === deviceId);
      }).length;
    }

    function filteredEvents(filters) {
      var now = Date.now();
      var windowMs = filters.range === 'today'
        ? 24 * 3600000
        : filters.range === '30d'
          ? 30 * 86400000
          : 7 * 86400000;
      var list = state.events.filter(function (ev) {
        var devOk = filters.device === 'all' || ev.deviceId === filters.device;
        var typeOk = filters.type === 'all' || ev.type === filters.type;
        var timeOk = now - ev.ts <= windowMs;
        return devOk && typeOk && timeOk;
      });
      list.sort(function (a, b) { return b.ts - a.ts; });
      return list;
    }

    return {
      get: get,
      set: set,
      subscribe: subscribe,
      currentDevice: currentDevice,
      deviceById: deviceById,
      deviceName: deviceName,
      unreadCount: unreadCount,
      filteredEvents: filteredEvents
    };
  }

  global.createStore = createStore;
})(window);
