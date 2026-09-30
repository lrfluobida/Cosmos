'use strict';
function createTimeline(events) {
  const list = events.map((e, i) => ({ at: e.at, lane: e.lane, kind: e.kind, i }));
  list.sort((a, b) => a.at - b.at || a.i - b.i);
  let pos = 0, last = -Infinity;
  return {
    advanceTo(nowMs) {
      if (!Number.isFinite(nowMs) || nowMs < 0 || nowMs < last) throw new RangeError();
      last = nowMs;
      const out = [];
      while (pos < list.length && list[pos].at <= nowMs) {
        const e = list[pos++];
        out.push({ at: e.at, lane: e.lane, kind: e.kind });
      }
      return out;
    }
  };
}
module.exports = createTimeline;
module.exports.createTimeline = createTimeline;
