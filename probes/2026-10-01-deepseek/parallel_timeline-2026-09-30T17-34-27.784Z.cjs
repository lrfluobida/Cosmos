function createTimeline(events) {
  const list = events.map((e, i) => ({ at: e.at, lane: e.lane, kind: e.kind, i }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  let i = 0, last = -Infinity;
  return {
    advanceTo(now) {
      if (typeof now !== 'number' || !Number.isFinite(now) || now < 0 || now < last)
        throw new RangeError('Invalid nowMs');
      const out = [];
      while (i < list.length && list[i].at <= now) {
        const e = list[i++];
        out.push({ at: e.at, lane: e.lane, kind: e.kind });
      }
      last = now;
      return out;
    }
  };
}

module.exports = createTimeline;
module.exports.createTimeline = createTimeline;
