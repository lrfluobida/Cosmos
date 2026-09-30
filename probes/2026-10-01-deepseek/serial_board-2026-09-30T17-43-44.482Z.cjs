function createBoard(config) {
  const { rows, cols, initialEnergy, cost, cooldownMs } = config;
  let energy = initialEnergy;
  let lastPlacedAt = null;
  const occupied = new Set();
  const key = (r, c) => r * cols + c;

  function place(row, col, nowMs) {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= rows || col < 0 || col >= cols) {
      return { ok: false, error: "invalid_cell" };
    }
    if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < 0) {
      return { ok: false, error: "invalid_time" };
    }
    if (occupied.has(key(row, col))) {
      return { ok: false, error: "occupied" };
    }
    if (lastPlacedAt !== null && nowMs < lastPlacedAt + cooldownMs) {
      return { ok: false, error: "cooldown" };
    }
    if (energy < cost) {
      return { ok: false, error: "insufficient_energy" };
    }
    energy -= cost;
    occupied.add(key(row, col));
    lastPlacedAt = nowMs;
    return { ok: true };
  }

  function addEnergy(amount) {
    if (typeof amount !== "number" || !Number.isInteger(amount) || !Number.isFinite(amount) || amount < 0) {
      throw new RangeError("amount must be a nonnegative finite integer");
    }
    energy += amount;
  }

  function snapshot() {
    const cells = [];
    for (const k of occupied) {
      cells.push({ row: Math.floor(k / cols), col: k % cols });
    }
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    return { energy, lastPlacedAt, cells };
  }

  return { place, addEnergy, snapshot };
}

module.exports = { createBoard };
