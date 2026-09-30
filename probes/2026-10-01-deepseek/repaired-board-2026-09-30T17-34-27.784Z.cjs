function createBoard(config) {
  const { rows, cols, initialEnergy, cost, cooldownMs } = config;
  let energy = initialEnergy;
  let lastPlacedAt = null;
  const cells = new Map();
  const key = (row, col) => row + ',' + col;

  return {
    place(row, col, nowMs) {
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= rows || col < 0 || col >= cols) {
        return { ok: false, error: 'invalid_cell' };
      }
      if (!Number.isFinite(nowMs) || nowMs < 0) {
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
      cells.set(k, { row, col });
      lastPlacedAt = nowMs;
      return { ok: true };
    },

    addEnergy(amount) {
      if (!Number.isInteger(amount) || amount < 0) {
        throw new RangeError('invalid amount');
      }
      energy += amount;
    },

    snapshot() {
      const out = [];
      for (const cell of cells.values()) {
        out.push({ row: cell.row, col: cell.col });
      }
      out.sort((a, b) => {
        if (a.row !== b.row) return a.row < b.row ? -1 : 1;
        if (a.col !== b.col) return a.col < b.col ? -1 : 1;
        return 0;
      });
      return { energy, lastPlacedAt, cells: out };
    }
  };
}

module.exports = createBoard;
module.exports.createBoard = createBoard;
