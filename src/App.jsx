import React, { useEffect, useReducer, useRef, useState } from 'react';
import { fetchTasks, saveTasks } from './api.js';

const PRIORITY_WEIGHT = { Urgent: 3, High: 2, Medium: 1, Low: 0 };
const LOW_STOCK_LIMIT = 15;
const MAX_UNDO_STEPS = 50;

const initialState = {
  tasks: [],
  selectedIds: [],
  history: [],
  sortDirection: 'desc',
};

function withHistory(state, changes) {
  return {
    ...state,
    ...changes,
    history: [
      ...state.history,
      {
        tasks: state.tasks,
        selectedIds: state.selectedIds,
        sortDirection: state.sortDirection,
      },
    ].slice(-MAX_UNDO_STEPS),
  };
}

function dashboardReducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return { ...initialState, tasks: action.tasks };
    case 'TOGGLE_SELECT': {
      const selectedIds = state.selectedIds.includes(action.id)
        ? state.selectedIds.filter((id) => id !== action.id)
        : [...state.selectedIds, action.id];
      return withHistory(state, { selectedIds });
    }
    case 'SET_STOCK': {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task || task.stockUnits === action.stockUnits) return state;
      return withHistory(state, {
        tasks: state.tasks.map((item) =>
          item.id === action.id ? { ...item, stockUnits: action.stockUnits } : item
        ),
      });
    }
    case 'SET_NOTE': {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task || task.note === action.note) return state;
      return withHistory(state, {
        tasks: state.tasks.map((item) =>
          item.id === action.id ? { ...item, note: action.note } : item
        ),
      });
    }
    case 'BULK_COMPLETE': {
      const ids = new Set(action.ids);
      if (!state.tasks.some((task) => ids.has(task.id) && task.status !== 'Completed')) {
        return state;
      }
      return withHistory(state, {
        tasks: state.tasks.map((task) =>
          ids.has(task.id) ? { ...task, status: 'Completed' } : task
        ),
      });
    }
    case 'BULK_RESTOCK': {
      const ids = new Set(action.ids);
      if (!state.tasks.some((task) => ids.has(task.id))) return state;
      return withHistory(state, {
        tasks: state.tasks.map((task) =>
          ids.has(task.id)
            ? { ...task, stockUnits: Math.min(Number.MAX_SAFE_INTEGER, task.stockUnits + 10) }
            : task
        ),
      });
    }
    case 'SORT_PRIORITY': {
      const sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      const direction = sortDirection === 'asc' ? 1 : -1;
      return withHistory(state, {
        sortDirection,
        tasks: [...state.tasks].sort((a, b) => {
          const difference =
            (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) * direction;
          return difference || a.id.localeCompare(b.id, undefined, { numeric: true });
        }),
      });
    }
    case 'REVERSE':
      return withHistory(state, { tasks: [...state.tasks].reverse() });
    case 'UNDO': {
      if (state.history.length === 0) return state;
      return {
        ...state.history[state.history.length - 1],
        history: state.history.slice(0, -1),
      };
    }
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const { tasks, selectedIds, history } = state;
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [stockDrafts, setStockDrafts] = useState({});
  const [countdown, setCountdown] = useState(5);
  const [saveCount, setSaveCount] = useState(0);
  const [lastSavedPayload, setLastSavedPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const snapshotRef = useRef(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    fetchTasks()
      .then((loadedTasks) => {
        if (isMounted) dispatch({ type: 'LOAD', tasks: loadedTasks });
      })
      .catch((loadError) => {
        if (isMounted) setError(`Unable to load tasks: ${loadError.message}`);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  snapshotRef.current = {
    tasks,
    selectedIds,
    searchQuery,
    categoryFilter,
    priorityFilter,
  };

  useEffect(() => {
    let ticks = 5;
    const interval = setInterval(() => {
      ticks -= 1;
      if (ticks > 0) {
        setCountdown(ticks);
        return;
      }

      ticks = 5;
      setCountdown(ticks);
      if (savingRef.current || !snapshotRef.current.tasks.length) return;

      const snapshot = snapshotRef.current;
      savingRef.current = true;
      setIsSaving(true);
      saveTasks(snapshot.tasks)
        .then(() => {
          setLastSavedPayload({
            ...snapshot,
            savedAt: new Date().toLocaleTimeString(),
          });
          setSaveCount((count) => count + 1);
          setError('');
        })
        .catch((saveError) => {
          setError(`Unable to save tasks: ${saveError.message}`);
        })
        .finally(() => {
          savingRef.current = false;
          setIsSaving(false);
        });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const query = searchQuery.trim().toLowerCase();
  const displayedTasks = tasks.filter((task) => {
    const matchesQuery =
      !query ||
      task.id.toLowerCase().includes(query) ||
      task.title.toLowerCase().includes(query);
    return (
      matchesQuery &&
      (categoryFilter === 'All' || task.category === categoryFilter) &&
      (priorityFilter === 'All' || task.priority === priorityFilter)
    );
  });
  const visibleSelectedIds = displayedTasks
    .filter((task) => selectedIds.includes(task.id))
    .map((task) => task.id);
  const visibleSelectedSet = new Set(visibleSelectedIds);
  const totalUnits = displayedTasks.reduce((sum, task) => sum + task.stockUnits, 0);
  const lowStockCount = displayedTasks.filter(
    (task) => task.stockUnits < LOW_STOCK_LIMIT
  ).length;
  const completedCount = displayedTasks.filter(
    (task) => task.status === 'Completed'
  ).length;

  const handleStockChange = (taskId, rawValue) => {
    setStockDrafts((drafts) => ({ ...drafts, [taskId]: rawValue }));
    if (rawValue === '') return;
    const value = Number(rawValue);
    if (Number.isSafeInteger(value) && value >= 0) {
      dispatch({ type: 'SET_STOCK', id: taskId, stockUnits: value });
    }
  };

  const handleStockBlur = (taskId) => {
    const draft = stockDrafts[taskId];
    if (draft === undefined) return;
    const value = Number(draft);
    if (draft === '' || !Number.isSafeInteger(value) || value < 0) {
      setError('Stock units must be a whole number greater than or equal to zero.');
    } else {
      setError('');
    }
    setStockDrafts((drafts) => {
      const nextDrafts = { ...drafts };
      delete nextDrafts[taskId];
      return nextDrafts;
    });
  };

  const handleUndo = () => {
    dispatch({ type: 'UNDO' });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Inventory &amp; Operations Dispatch</h1>
          <p className="muted">Warehouse maintenance schedules, restock audits and field units.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={handleUndo} disabled={!history.length}>
            Undo ({history.length})
          </button>
          <button className="btn primary" onClick={() => dispatch({ type: 'SORT_PRIORITY' })}>
            Sort by Priority
          </button>
          <button className="btn primary" onClick={() => dispatch({ type: 'REVERSE' })}>
            Reverse Order
          </button>
        </div>
      </header>

      <section className="grid-3">
        <div className="card">
          <span className="label">Auto-save</span>
          <p className="big mono accent">
            {isSaving ? 'Saving changes...' : `Next auto-save in: ${countdown} seconds`}
          </p>
          <span className="muted small">Saves completed: {saveCount}</span>
        </div>
        <div className="card span-2">
          <span className="label">Last Saved Payload</span>
          <pre className="payload mono">
            {lastSavedPayload
              ? JSON.stringify(lastSavedPayload, null, 2)
              : 'Awaiting first auto-save...'}
          </pre>
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="grid-4">
        <div className="card stat">
          <span className="label">Visible tasks</span>
          <p className="big">{displayedTasks.length}</p>
        </div>
        <div className="card stat">
          <span className="label">Total stock units</span>
          <p className="big">{totalUnits}</p>
        </div>
        <div className="card stat">
          <span className="label">Low stock items</span>
          <p className="big warn">{lowStockCount}</p>
        </div>
        <div className="card stat">
          <span className="label">Completed</span>
          <p className="big ok">{completedCount}</p>
        </div>
      </section>

      <section className="card toolbar">
        <div className="search">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by title or task code..."
          />
        </div>
        <div className="filters">
          <label>
            Category
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="All">All</option>
              <option value="Inventory">Inventory</option>
              <option value="Hardware">Hardware</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </label>
          <label>
            Priority
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="All">All</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
        </div>
      </section>

      <section className="bulkbar">
        <span><strong>{visibleSelectedIds.length}</strong> selected in current view</span>
        <div className="actions">
          <button
            className="btn ghost"
            onClick={() => dispatch({ type: 'BULK_RESTOCK', ids: visibleSelectedIds })}
            disabled={!visibleSelectedIds.length}
          >
            Restock +10
          </button>
          <button
            className="btn ok"
            onClick={() => dispatch({ type: 'BULK_COMPLETE', ids: visibleSelectedIds })}
            disabled={!visibleSelectedIds.length}
          >
            Mark Complete
          </button>
        </div>
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th className="center">Select</th>
              <th>Task ID</th>
              <th>Operational Item</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Units</th>
              <th>Field Dispatch Notes</th>
            </tr>
          </thead>
          <tbody>
            {displayedTasks.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty">
                  {isLoading
                    ? 'Loading tasks...'
                    : 'No tasks match the current search or filter criteria.'}
                </td>
              </tr>
            ) : (
              displayedTasks.map((task) => (
                <tr key={task.id} className={visibleSelectedSet.has(task.id) ? 'selected' : ''}>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={visibleSelectedSet.has(task.id)}
                      onChange={() => dispatch({ type: 'TOGGLE_SELECT', id: task.id })}
                      aria-label={`Select task ${task.id}`}
                    />
                  </td>
                  <td className="mono strong">{task.id}</td>
                  <td>{task.title}</td>
                  <td className="muted">{task.category}</td>
                  <td>
                    <span className={`pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
                  </td>
                  <td>
                    <span className={`status ${task.status.replace(/\s/g, '').toLowerCase()}`}>
                      {task.status}
                    </span>
                  </td>
                  <td>
                    <input
                      className="units"
                      type="number"
                      min="0"
                      max={Number.MAX_SAFE_INTEGER}
                      step="1"
                      value={stockDrafts[task.id] ?? task.stockUnits}
                      onChange={(event) => handleStockChange(task.id, event.target.value)}
                      onBlur={() => handleStockBlur(task.id)}
                      aria-label={`Stock units for ${task.id}`}
                    />
                  </td>
                  <td>
                    <input
                      className="note"
                      type="text"
                      placeholder="Quick manager note..."
                      value={task.note ?? ''}
                      onChange={(event) =>
                        dispatch({ type: 'SET_NOTE', id: task.id, note: event.target.value })
                      }
                      aria-label={`Manager note for ${task.id}`}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
