'use strict';

function createTimeline(events) {
  const items = events.map((e, i) => ({
    at: e.at,
    lane: e.lane,
    kind: e.kind,
    i: i
  }));

  items.sort((a, b) => a.at - b.at || a.i - b.i);

  let next = 0;
  let last = -Infinity;

  return {
    advanceTo(nowMs) {
      if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < last) {
        throw new RangeError('advanceTo requires a finite, non-decreasing timestamp');
      }

      const emitted = [];

      while (next < items.length && items[next].at <= nowMs) {
        const e = items[next++];
        emitted.push({ at: e.at, lane: e.lane, kind: e.kind });
      }

      last = nowMs;
      return emitted;
    }
  };
}

module.exports = { createTimeline };
