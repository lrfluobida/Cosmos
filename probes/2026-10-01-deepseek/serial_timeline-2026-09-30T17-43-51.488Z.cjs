'use strict';

function createTimeline(events) {
  const list = events.map((e, i) => ({ at: e.at, lane: e.lane, kind: e.kind, i }));
  list.sort((a, b) => a.at - b.at ||
