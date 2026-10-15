'use strict';

class EditHistory {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  record(before, after) {
    if (before === after) return;
    this.undoStack.push({ before, after });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  step(action, current) {
    const from = action === 'undo' ? this.undoStack : this.redoStack;
    const to = action === 'undo' ? this.redoStack : this.undoStack;
    const entry = from.at(-1);
    if (!entry) throw new Error(`There is no CeTZ edit to ${action}.`);
    if (current !== (action === 'undo' ? entry.after : entry.before)) {
      this.clear();
      throw new Error('Typst changed outside this CeTZ edit. The edit history was reset.');
    }
    from.pop();
    to.push(entry);
    return action === 'undo' ? entry.before : entry.after;
  }
}

function historyAction(cells, originalCells) {
  for (const [id, item] of cells) {
    if (originalCells.has(id) || item.cell.parent !== '1') continue;
    const action = /(?:^|;)cetzAction=(undo|redo)(?:;|$)/.exec(item.cell.style || '')?.[1];
    if (action) return action;
  }
  return null;
}

module.exports = { EditHistory, historyAction };
