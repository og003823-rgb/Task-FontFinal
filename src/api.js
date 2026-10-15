let serverDb = [
  { id: 'TSK-101', title: 'Audit warehouse safety supplies', category: 'Inventory', priority: 'High', stockUnits: 45, status: 'In Progress' },
  { id: 'TSK-102', title: 'Restock barcode scanner batteries', category: 'Hardware', priority: 'Urgent', stockUnits: 12, status: 'Pending' },
  { id: 'TSK-103', title: 'Recalibrate conveyor scale sensor', category: 'Maintenance', priority: 'Low', stockUnits: 80, status: 'Completed' },
  { id: 'TSK-104', title: 'Inspect forklift hydraulic fluid', category: 'Maintenance', priority: 'Medium', stockUnits: 30, status: 'In Progress' },
  { id: 'TSK-105', title: 'Cycle count shelf aisle B4', category: 'Inventory', priority: 'High', stockUnits: 150, status: 'Pending' },
  { id: 'TSK-106', title: 'Replace thermal printer heads', category: 'Hardware', priority: 'Urgent', stockUnits: 6, status: 'Pending' },
  { id: 'TSK-107', title: 'Label returned pallet inventory', category: 'Inventory', priority: 'Medium', stockUnits: 64, status: 'Pending' },
  { id: 'TSK-108', title: 'Service dock door actuators', category: 'Maintenance', priority: 'High', stockUnits: 9, status: 'In Progress' },
  { id: 'TSK-109', title: 'Update handheld scanner firmware', category: 'Hardware', priority: 'Low', stockUnits: 22, status: 'Pending' },
  { id: 'TSK-110', title: 'Reconcile damaged goods ledger', category: 'Inventory', priority: 'Urgent', stockUnits: 18, status: 'Pending' },
];

const STORAGE_KEY = 'operations-dispatch-tasks';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTaskList(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (task) =>
        task &&
        typeof task.id === 'string' &&
        typeof task.title === 'string' &&
        typeof task.category === 'string' &&
        typeof task.priority === 'string' &&
        typeof task.status === 'string' &&
        Number.isSafeInteger(task.stockUnits) &&
        task.stockUnits >= 0 &&
        (task.note === undefined || typeof task.note === 'string')
    )
  );
}

export async function fetchTasks() {
  await wait(100);
  if (typeof window !== 'undefined') {
    const savedTasks = window.localStorage.getItem(STORAGE_KEY);
    if (savedTasks !== null) {
      const parsedTasks = JSON.parse(savedTasks);
      if (!isTaskList(parsedTasks)) {
        throw new Error('Saved task data is invalid.');
      }
      serverDb = parsedTasks;
    }
  }
  return serverDb.map((task) => ({ ...task }));
}

export async function saveTasks(tasks) {
  if (!isTaskList(tasks)) {
    throw new Error('Task data is invalid and cannot be saved.');
  }
  await wait(100);
  const snapshot = tasks.map((task) => ({ ...task }));
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }
  serverDb = snapshot;
  return snapshot.map((task) => ({ ...task }));
}
