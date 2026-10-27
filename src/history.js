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

  record(before, after, group) {
    if (before === after) return;
    const last = this.undoStack.at(-1);
    if (group && last?.group === group && last.after === before) last.after = after;
    else this.undoStack.push({ before, after, ...(group ? {group} : {}) });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canStep(action) {
    return (action === 'undo' ? this.undoStack : this.redoStack).length > 0;
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

function historyAction(cells, originalCells, handledIds = new Set()) {
  for (const [id, item] of cells) {
    if (originalCells.has(id) || item.cell.parent !== '1') continue;
    const style = item.cell.style || '';
    const action = /(?:^|;)cetzAction=(undo|redo)(?:;|$)/.exec(style)?.[1];
    const token = /(?:^|;)cetzActionToken=([\w-]+)(?:;|$)/.exec(style)?.[1];
    const key = token || id;
    if (action && !handledIds.has(key)) return { id, action, key };
  }
  return null;
}

module.exports = { EditHistory, historyAction };
