import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const EMPTY_DATA = { tasks: [], goals: [], notes: [], activity: [] };
const NAV_ITEMS = [
  ['overview', 'Overview'],
  ['tasks', 'Tasks'],
  ['calendar', 'Calendar'],
  ['goals', 'Goals'],
  ['notes', 'Notes'],
  ['reports', 'Reports'],
];

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return payload;
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function TaskList({ tasks, onToggle, onDelete, compact = false }) {
  if (!tasks.length) {
    return <p className="empty-state">Nothing here yet. Add a task to get started.</p>;
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <div className={`task-row ${task.completed ? 'is-complete' : ''}`} key={task.id}>
          <button
            className={`check-button ${task.completed ? 'checked' : ''}`}
            onClick={() => onToggle(task)}
            aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
          >
            {task.completed ? '✓' : ''}
          </button>
          <div className="task-copy">
            <strong>{task.title}</strong>
            <span>{formatDate(task.dueDate)} · {task.priority || 'normal'} priority</span>
          </div>
          {!compact && (
            <button className="icon-button" onClick={() => onDelete(task)} aria-label="Delete task">
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ppt-token'));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ppt-user') || 'null');
    } catch {
      return null;
    }
  });
  const [data, setData] = useState(EMPTY_DATA);
  const [activePage, setActivePage] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  async function loadData(activeToken = token) {
    if (!activeToken) return;
    const result = await request('/data', { token: activeToken });
    setData(result);
  }

  useEffect(() => {
    let active = true;

    async function initializeWorkspace() {
      if (token) {
        try {
          await loadData(token);
          return;
        } catch {
          localStorage.removeItem('ppt-token');
          localStorage.removeItem('ppt-user');
          setToken(null);
          setUser(null);
          setData(EMPTY_DATA);
        }
      }

      const session = await request('/auth/guest', { method: 'POST' });
      if (!active) return;
      localStorage.setItem('ppt-token', session.token);
      localStorage.setItem('ppt-user', JSON.stringify(session.user));
      setToken(session.token);
      setUser(session.user);
      await loadData(session.token);
    }

    initializeWorkspace()
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function mutate(path, method, body) {
    setError('');
    try {
      await request(path, {
        token,
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      await loadData();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }

  async function addTask(event) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    if (await mutate('/tasks', 'POST', { title: taskTitle.trim(), dueDate: taskDate })) {
      setTaskTitle('');
      setTaskDate('');
    }
  }

  async function addGoal(event) {
    event.preventDefault();
    if (!goalTitle.trim()) return;
    if (await mutate('/goals', 'POST', { title: goalTitle.trim(), targetDate: goalDate })) {
      setGoalTitle('');
      setGoalDate('');
    }
  }

  async function addNote(event) {
    event.preventDefault();
    if (!noteTitle.trim() || !noteBody.trim()) return;
    if (await mutate('/notes', 'POST', { title: noteTitle.trim(), body: noteBody.trim() })) {
      setNoteTitle('');
      setNoteBody('');
    }
  }

  const openTasks = useMemo(() => data.tasks.filter((task) => !task.completed), [data.tasks]);
  const chartData = [
    { name: 'To do', count: openTasks.length, fill: '#8bbfc1' },
    { name: 'Done', count: data.tasks.length - openTasks.length, fill: '#d8a98c' },
    { name: 'Goals', count: data.goals.length, fill: '#a99ac5' },
    { name: 'Notes', count: data.notes.length, fill: '#e5c773' },
  ];

  if (loading) {
    return <div className="loading-screen">Getting your workspace ready…</div>;
  }

  if (!token || !user) {
    return (
      <main className="loading-screen">
        <p role="alert">{error || 'Could not open your workspace.'}</p>
        <button className="button primary-button" onClick={() => location.reload()}>Try again</button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setActivePage('overview')}>
          <span className="brand-mark small-mark">R</span>
          <span>Rasam Sanketh Tracker</span>
        </a>
        <p className="nav-label">WORKSPACE</p>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(([id, label], index) => (
            <button
              className={`nav-item ${activePage === id ? 'active' : ''}`}
              key={id}
              onClick={() => setActivePage(id)}
            >
              <span className="nav-icon">{['⌂', '◷', '▦', '◎', '▤', '▥'][index]}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip">
            <span className="avatar">G</span>
            <span className="user-copy"><strong>Guest workspace</strong><small>Auto-saved</small></span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">PERSONAL PRODUCTIVITY</p>
            <h1>{NAV_ITEMS.find(([id]) => id === activePage)?.[1]}</h1>
          </div>
          <div className="today-pill">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </header>

        {error && (
          <div className="notice error-notice" role="alert">
            {error}
            <button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error">×</button>
          </div>
        )}

        {activePage === 'overview' && (
          <>
            <section className="welcome-banner">
              <div>
                <p className="eyebrow">A FRESH START</p>
                <h2>Make room for what matters, {user.name?.split(' ')[0] || 'friend'}.</h2>
                <p>Small steps add up. Here’s your day at a glance.</p>
              </div>
              <div className="banner-sun" aria-hidden="true">☼</div>
            </section>
            <section className="stats-grid">
              <article className="stat-card teal-card"><span>Open tasks</span><strong>{openTasks.length}</strong><small>ready when you are</small></article>
              <article className="stat-card peach-card"><span>Completed</span><strong>{data.tasks.length - openTasks.length}</strong><small>look at you go</small></article>
              <article className="stat-card lilac-card"><span>Active goals</span><strong>{data.goals.filter((goal) => !goal.completed).length}</strong><small>keep your eye on them</small></article>
              <article className="stat-card yellow-card"><span>Notes</span><strong>{data.notes.length}</strong><small>ideas worth keeping</small></article>
            </section>
            <section className="content-grid">
              <article className="panel">
                <div className="panel-heading"><div><p className="eyebrow">YOUR NEXT STEPS</p><h2>Tasks</h2></div><button className="text-button" onClick={() => setActivePage('tasks')}>View all →</button></div>
                <TaskList tasks={openTasks.slice(0, 5)} compact onToggle={(task) => mutate(`/tasks/${task.id}`, 'PATCH', { completed: !task.completed })} />
              </article>
              <article className="panel chart-panel">
                <div className="panel-heading"><div><p className="eyebrow">A LITTLE PROGRESS</p><h2>Your overview</h2></div></div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="#edf0ee" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#727b78', fontSize: 12 }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#727b78', fontSize: 12 }} />
                      <Tooltip cursor={{ fill: '#f5f7f5' }} />
                      <Bar dataKey="count" radius={[7, 7, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </section>
          </>
        )}

        {activePage === 'tasks' && (
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">ONE THING AT A TIME</p><h2>Tasks</h2></div><span className="soft-badge">{openTasks.length} open</span></div>
            <form className="inline-form" onSubmit={addTask}>
              <input aria-label="Task name" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="What needs doing?" required />
              <input aria-label="Due date" type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} />
              <button className="button primary-button">Add task</button>
            </form>
            <TaskList
              tasks={data.tasks}
              onToggle={(task) => mutate(`/tasks/${task.id}`, 'PATCH', { completed: !task.completed })}
              onDelete={(task) => mutate(`/tasks/${task.id}`, 'DELETE')}
            />
          </section>
        )}

        {activePage === 'calendar' && (
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">MAKE A LITTLE PLAN</p><h2>Calendar</h2></div><input aria-label="Choose a date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></div>
            <div className="calendar-date"><span>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}</span><strong>{formatDate(selectedDate)}</strong></div>
            <TaskList
              tasks={data.tasks.filter((task) => task.dueDate === selectedDate)}
              onToggle={(task) => mutate(`/tasks/${task.id}`, 'PATCH', { completed: !task.completed })}
              onDelete={(task) => mutate(`/tasks/${task.id}`, 'DELETE')}
            />
          </section>
        )}

        {activePage === 'goals' && (
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">KEEP THE BIG PICTURE</p><h2>Goals</h2></div><span className="soft-badge">{data.goals.filter((goal) => !goal.completed).length} in progress</span></div>
            <form className="inline-form" onSubmit={addGoal}>
              <input aria-label="Goal name" value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="A goal you care about…" required />
              <input aria-label="Target date" type="date" value={goalDate} onChange={(event) => setGoalDate(event.target.value)} />
              <button className="button primary-button">Add goal</button>
            </form>
            <div className="goal-grid">
              {data.goals.map((goal) => (
                <article className={`goal-card ${goal.completed ? 'is-complete' : ''}`} key={goal.id}>
                  <button className={`check-button ${goal.completed ? 'checked' : ''}`} onClick={() => mutate(`/goals/${goal.id}`, 'PATCH', { completed: !goal.completed })} aria-label="Toggle goal complete">{goal.completed ? '✓' : ''}</button>
                  <h3>{goal.title}</h3><p>Target · {formatDate(goal.targetDate)}</p>
                  <button className="text-button" onClick={() => mutate(`/goals/${goal.id}`, 'DELETE')}>Remove</button>
                </article>
              ))}
            </div>
            {!data.goals.length && <p className="empty-state">Your goals will show up here.</p>}
          </section>
        )}

        {activePage === 'notes' && (
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">SAVE THE GOOD IDEAS</p><h2>Notes</h2></div></div>
            <form className="stack-form note-form" onSubmit={addNote}>
              <input aria-label="Note title" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Give this note a title" required />
              <textarea aria-label="Note text" rows="3" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Write something worth remembering…" required />
              <button className="button primary-button">Save note</button>
            </form>
            <div className="note-grid">
              {data.notes.map((note) => (
                <article className="note-card" key={note.id}>
                  <div className="note-card-heading"><h3>{note.title}</h3><button className="icon-button" onClick={() => mutate(`/notes/${note.id}`, 'DELETE')} aria-label="Delete note">×</button></div>
                  <p>{note.body}</p><small>{new Date(note.createdAt).toLocaleDateString()}</small>
                </article>
              ))}
            </div>
            {!data.notes.length && <p className="empty-state">No notes yet. Save an idea before it wanders off.</p>}
          </section>
        )}

        {activePage === 'reports' && (
          <section className="content-grid report-grid">
            <article className="panel chart-panel">
              <div className="panel-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Progress snapshot</h2></div></div>
              <div className="chart-wrap report-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#edf0ee" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#727b78', fontSize: 12 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#727b78', fontSize: 12 }} />
                    <Tooltip /><Bar dataKey="count" fill="#8bbfc1" radius={[7, 7, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className="panel">
              <div className="panel-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Latest updates</h2></div></div>
              {data.activity.length ? (
                <ul className="activity-list">
                  {data.activity.slice(0, 8).map((item) => <li key={item.id}><span className="activity-dot" /><div><strong>{item.message}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div></li>)}
                </ul>
              ) : <p className="empty-state">Your activity will appear here as you go.</p>}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
