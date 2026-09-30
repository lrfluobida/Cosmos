function createBoard(config) {
  const rows = config.rows;
  const cols = config.cols;
  const cost = config.cost;
  const cooldownMs = config.cooldownMs;
  let energy = config.initialEnergy;
  let lastPlacedAt = null;
  const occupied = new Set();

  function place(row, col, nowMs) {
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= rows ||
      col < 0 ||
      col >= cols
    ) {
      return { ok: false, error: 'invalid_cell' };
    }

    if (!Number.isFinite(nowMs) || nowMs < 0) {
      return { ok: false, error: 'invalid_time' };
    }

    const key = row + ',' + col;

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
    if (!Number.isInteger(amount) || amount < 0) {
      throw new RangeError('amount must be a nonnegative finite integer');
    }
    energy += amount;
  }

  function snapshot() {
    const cells = [];

    for (const key of occupied) {
      const comma = key.indexOf(',');
      const row = Number(key.slice(0, comma));
      const col = Number(key.slice(comma + 1));
      cells.push({ row, col });
    }

    cells.sort((a, b) => (a.row - b.row) || (a.col - b.col));

    return {
      energy,
      lastPlacedAt,
      cells
    };
  }

  return { place, addEnergy, snapshot };
}

module.exports = { createBoard };
