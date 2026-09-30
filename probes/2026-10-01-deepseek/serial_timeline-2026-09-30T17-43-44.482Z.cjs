"use strict";

module.exports = function createTimeline(events) {
  const snap = events.map((e, i) => ({ at: e.at, lane: e.lane, kind: e.kind, _i: i }));
  snap.sort((a, b) => a.at - b.at || a._i - b._i);
  let cursor = 0;
  let lastNow = -Infinity;
  return {
    advanceTo(nowMs) {
      if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < 0) {
        throw new RangeError("nowMs must be a nonnegative finite number");
      }
      if (nowMs < lastNow) {
        throw new RangeError("nowMs must not go backward");
      }
      lastNow = nowMs;
      const out = [];
      while (cursor < snap.length && snap[cursor].at <= nowMs) {
        const e = snap[cursor++];
        out.push({ at: e.at, lane: e.lane, kind: e.kind });
      }
      return out;
    }
  };
};
