function createBoard(config) {
  const rows = config.rows;
  const cols = config.cols;
  let energy = config.initialEnergy;
  const cost = config.cost;
  const cooldownMs = config.cooldownMs;
  let lastPlacedAt = null;
  const occupied = new Set();

  function place(row, col, nowMs) {
    if (!Number.isInteger(row) || row < 0 || row >= rows || !Number.isInteger(col) || col < 0 || col >= cols) {
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
      throw new RangeError('invalid_amount');
    }
    energy += amount;
  }

  function snapshot() {
    const cells = [];
    for (const key of occupied) {
      const parts = key.split(',');
      cells.push({ row: Number(parts[0]), col: Number(parts[1]) });
    }
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    return { energy, lastPlacedAt, cells };
  }

  return { place, addEnergy, snapshot };
}

module.exports = createBoard;
module.exports.createBoard = createBoard;
