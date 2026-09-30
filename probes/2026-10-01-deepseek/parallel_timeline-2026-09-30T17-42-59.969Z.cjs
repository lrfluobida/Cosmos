function createTimeline(events) {
  const list = events.map((e, i) => ({ at: e.at, lane: e.lane, kind: e.kind, i }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  let idx = 0;
  let last = -Infinity;
  return {
    advanceTo(nowMs) {
      if (!Number.isFinite(nowMs) || nowMs < 0 || nowMs < last) {
        throw new RangeError('invalid time');
      }
      const out = [];
      while (idx < list.length && list[idx].at <= nowMs) {
        const e = list[idx++];
        out.push({ at: e.at, lane: e.lane, kind: e.kind });
      }
      last = nowMs;
      return out;
    }
  };
}

module.exports = createTimeline;
module.exports.createTimeline = createTimeline;
