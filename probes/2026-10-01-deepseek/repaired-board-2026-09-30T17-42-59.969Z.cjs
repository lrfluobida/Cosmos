'use strict';

function createBoard(config) {
  const rows = config.rows;
  const cols = config.cols;
  const cost = config.cost;
  const cooldownMs = config.cooldownMs;
  let energy = config.initialEnergy;
  let lastPlacedAt = null;
  const occupied = new Set();

  function isInt(n) {
    return Number.isInteger(n);
  }

  function key(row, col) {
    return row + ',' + col;
  }

  return {
    place(row, col, nowMs) {
      if (!isInt(row) || !isInt(col) || row < 0 || row >= rows || col < 0 || col >= cols) {
        return { ok: false, error: 'invalid_cell' };
      }
      if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < 0) {
        return { ok: false, error: 'invalid_time' };
      }
      const k = key(row, col);
      if (occupied.has(k)) {
        return { ok: false, error: 'occupied' };
      }
      if (lastPlacedAt !== null && nowMs < lastPlacedAt + cooldownMs) {
        return { ok: false, error: 'cooldown' };
      }
      if (energy < cost) {
        return { ok: false, error: 'insufficient_energy' };
      }
      energy -= cost;
      occupied.add(k);
      lastPlacedAt = nowMs;
      return { ok: true };
    },

    addEnergy(amount) {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || !isInt(amount)) {
        throw new RangeError('amount must be a nonnegative finite integer');
      }
      energy += amount;
    },

    snapshot() {
      const cells = [];
      for (const k of occupied) {
        const parts = k.split(',');
        cells.push({ row: Number(parts[0]), col: Number(parts[1]) });
      }
      cells.sort((a, b) => (a.row - b.row) || (a.col - b.col));
      return {
        energy: energy,
        lastPlacedAt: lastPlacedAt,
        cells: cells
      };
    }
  };
}

module.exports = { createBoard };
