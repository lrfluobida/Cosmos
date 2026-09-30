'use strict';

function createBoard(config) {
  const rows = config.rows;
  const cols = config.cols;
  const cost = config.cost;
  const cooldownMs = config.cooldownMs;
  let energy = config.initialEnergy;
  let lastPlacedAt = null;
  const occupied = new Set();

  function keyOf(row, col) {
    return row * cols + col;
  }

  function place(row, col, nowMs) {
    if (
      typeof row !== 'number' ||
      typeof col !== 'number' ||
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= rows ||
      col < 0 ||
      col >= cols
    ) {
      return { ok: false, error: 'invalid_cell' };
    }

    if (
      typeof nowMs !== 'number' ||
      !Number.isFinite(nowMs) ||
      nowMs < 0
    ) {
      return { ok: false, error: 'invalid_time' };
    }

    const key = keyOf(row, col);
    if (occupied.has(key)) {
      return { ok: false, error: 'occupied' };
    }

    if (lastPlacedAt !== null && nowMs < lastPlacedAt + cooldownMs) {
      return { ok: false, error: 'cooldown' };
    }

    if (energy < cost) {
      return { ok: false, error: 'insufficient_energy' };
    }

    energy -= cost;
    occupied.add(key);
    lastPlacedAt = nowMs;
    return { ok: true };
  }

  function addEnergy(amount) {
    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      throw new RangeError('amount must be a nonnegative finite integer');
    }
    energy += amount;
  }

  function snapshot() {
    const cells = [];
    for (const key of occupied) {
      cells.push({ row: Math.floor(key / cols), col: key % cols });
    }
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    return {
      energy: energy,
      lastPlacedAt: lastPlacedAt,
      cells: cells
    };
  }

  return { place, addEnergy, snapshot };
}

module.exports = { createBoard };
