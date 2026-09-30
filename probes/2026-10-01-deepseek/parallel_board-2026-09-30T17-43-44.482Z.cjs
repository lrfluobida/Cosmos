'use strict';

function createBoard(config) {
  const { rows, cols, initialEnergy, cost, cooldownMs } = config;

  let energy = initialEnergy;
  let lastPlacedAt = null;
  const cells = new Set();

  function isNonNegInt(n) {
    return Number.isInteger(n) && n >= 0;
  }

  function key(row, col) {
    return row * cols + col;
  }

  return {
    place(row, col, nowMs) {
      if (!isNonNegInt(row) || !isNonNegInt(col) || row >= rows || col >= cols) {
        return { ok: false, error: 'invalid_cell' };
      }
      if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < 0) {
        return { ok: false, error: 'invalid_time' };
      }
      const k = key(row, col);
      if (cells.has(k)) {
        return { ok: false, error: 'occupied' };
      }
      if (lastPlacedAt !== null && nowMs < lastPlacedAt + cooldownMs) {
        return { ok: false, error: 'cooldown' };
      }
      if (energy < cost) {
        return { ok: false, error: 'insufficient_energy' };
      }
      energy -= cost;
      cells.add(k);
      lastPlacedAt = nowMs;
      return { ok: true };
    },

    addEnergy(amount) {
      if (!isNonNegInt(amount)) {
        throw new RangeError('amount must be a nonnegative finite integer');
      }
      energy += amount;
    },

    snapshot() {
      const list = [];
      for (const k of cells) {
        list.push({ row: Math.floor(k / cols), col: k % cols });
      }
      list.sort((a, b) => a.row - b.row || a.col - b.col);
      return {
        energy,
        lastPlacedAt,
        cells: list
      };
    }
  };
}

module.exports = { createBoard };
