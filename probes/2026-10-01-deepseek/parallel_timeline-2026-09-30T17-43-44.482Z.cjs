module.exports = function createTimeline(events) {
  const items = events.map((e, i) => ({
    at: e.at,
    lane: e.lane,
    kind: e.kind,
    i
  })).sort((a, b) => a.at - b.at || a.i - b.i);
  let cursor = 0;
  let last = -Infinity;
  return {
    advanceTo(nowMs) {
      if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < last) {
        throw new RangeError("invalid nowMs");
      }
      const out = [];
      while (cursor < items.length && items[cursor].at <= nowMs) {
        const it = items[cursor++];
        out.push({ at: it.at, lane: it.lane, kind: it.kind });
      }
      last = nowMs;
      return out;
    }
  };
};
