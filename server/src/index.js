const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const jwt = require('jsonwebtoken');
const {
  connectDatabase,
  createItem,
  createUser,
  deleteItem,
  findUserByEmail,
  listItems,
  updateItem,
  usesMongo,
} = require('./repository');

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 5000;
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const allowedOrigins = (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production.');
}

app.use(cors({
  origin(origin, callback) {
    const allowLocalOrigin = process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0;
    callback(null, !origin || allowLocalOrigin || allowedOrigins.includes(origin));
  },
}));
app.use(express.json({ limit: '100kb' }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function recordActivity(userId, message) {
  return createItem('activity', {
    id: crypto.randomUUID(),
    userId,
    message,
    createdAt: new Date().toISOString(),
  });
}

function signInResponse(user) {
  const token = jwt.sign(
    { sub: user.id, email: user.email },
    jwtSecret,
    { expiresIn: '7d' },
  );
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Please sign in to continue.' });
  }

  try {
    const payload = jwt.verify(authorization.slice(7), jwtSecret);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

function isValidDate(value) {
  return value === '' || value === undefined || (
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  );
}

app.get('/api/health', asyncRoute(async (req, res) => {
  await connectDatabase();
  res.json({ status: 'ok', storage: usesMongo() ? 'mongodb' : 'local-json' });
}));

app.post('/api/auth/guest', (req, res) => {
  const guest = { id: crypto.randomUUID(), name: 'Guest', email: '' };
  return res.status(201).json(signInResponse(guest));
});

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_REGISTRATION !== 'true') {
    return res.status(403).json({ message: 'Account registration is disabled.' });
  }
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter your name and a valid email address.' });
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be between 8 and 72 bytes.' });
  }
  if (await findUserByEmail(email)) {
    return res.status(409).json({ message: 'An account with that email already exists.' });
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };
  try {
    await createUser(user);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    throw error;
  }
  return res.status(201).json(signInResponse(user));
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  return res.json(signInResponse(user));
}));

app.get('/api/data', authenticate, asyncRoute(async (req, res) => {
  const [tasks, goals, notes, activity] = await Promise.all([
    listItems('tasks', req.user.id),
    listItems('goals', req.user.id),
    listItems('notes', req.user.id),
    listItems('activity', req.user.id),
  ]);
  res.json({ tasks, goals, notes, activity });
}));

app.post('/api/tasks', authenticate, asyncRoute(async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const dueDate = req.body.dueDate || '';
  if (!title || title.length > 200 || !isValidDate(dueDate)) {
    return res.status(400).json({ message: 'Enter a task title and a valid due date.' });
  }
  const task = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    title,
    dueDate,
    priority: 'normal',
    completed: false,
    createdAt: new Date().toISOString(),
  };
  await createItem('tasks', task);
  await recordActivity(req.user.id, `Added task “${title}”`);
  return res.status(201).json(task);
}));

app.patch('/api/tasks/:id', authenticate, asyncRoute(async (req, res) => {
  const changes = {};
  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.trim().length > 200) {
      return res.status(400).json({ message: 'Task title must be between 1 and 200 characters.' });
    }
    changes.title = req.body.title.trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'dueDate')) {
    if (!isValidDate(req.body.dueDate)) return res.status(400).json({ message: 'Enter a valid due date.' });
    changes.dueDate = req.body.dueDate;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'completed')) {
    if (typeof req.body.completed !== 'boolean') return res.status(400).json({ message: 'Completed must be true or false.' });
    changes.completed = req.body.completed;
  }
  const task = await updateItem('tasks', req.params.id, req.user.id, changes);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  await recordActivity(req.user.id, `${task.completed ? 'Completed' : 'Updated'} task “${task.title}”`);
  return res.json(task);
}));

app.delete('/api/tasks/:id', authenticate, asyncRoute(async (req, res) => {
  const task = await deleteItem('tasks', req.params.id, req.user.id);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  await recordActivity(req.user.id, `Deleted task “${task.title}”`);
  return res.status(204).end();
}));

app.post('/api/goals', authenticate, asyncRoute(async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const targetDate = req.body.targetDate || '';
  if (!title || title.length > 200 || !isValidDate(targetDate)) {
    return res.status(400).json({ message: 'Enter a goal title and a valid target date.' });
  }
  const goal = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    title,
    targetDate,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  await createItem('goals', goal);
  await recordActivity(req.user.id, `Set a new goal: “${title}”`);
  return res.status(201).json(goal);
}));

app.patch('/api/goals/:id', authenticate, asyncRoute(async (req, res) => {
  if (typeof req.body.completed !== 'boolean') {
    return res.status(400).json({ message: 'Completed must be true or false.' });
  }
  const goal = await updateItem('goals', req.params.id, req.user.id, { completed: req.body.completed });
  if (!goal) return res.status(404).json({ message: 'Goal not found.' });
  await recordActivity(req.user.id, `${goal.completed ? 'Completed' : 'Updated'} goal “${goal.title}”`);
  return res.json(goal);
}));

app.delete('/api/goals/:id', authenticate, asyncRoute(async (req, res) => {
  const goal = await deleteItem('goals', req.params.id, req.user.id);
  if (!goal) return res.status(404).json({ message: 'Goal not found.' });
  await recordActivity(req.user.id, `Removed goal “${goal.title}”`);
  return res.status(204).end();
}));

app.post('/api/notes', authenticate, asyncRoute(async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!title || title.length > 200 || !body || body.length > 10000) {
    return res.status(400).json({ message: 'Notes need a title and text (up to 10,000 characters).' });
  }
  const note = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    title,
    body,
    createdAt: new Date().toISOString(),
  };
  await createItem('notes', note);
  await recordActivity(req.user.id, `Saved note “${title}”`);
  return res.status(201).json(note);
}));

app.delete('/api/notes/:id', authenticate, asyncRoute(async (req, res) => {
  const note = await deleteItem('notes', req.params.id, req.user.id);
  if (!note) return res.status(404).json({ message: 'Note not found.' });
  await recordActivity(req.user.id, `Deleted note “${note.title}”`);
  return res.status(204).end();
}));

app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: 'Unexpected server error.' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Productivity Tracker API listening on http://localhost:${port}`);
    console.log(`Storage: ${usesMongo() ? 'MongoDB' : 'local JSON'}`);
    if (!process.env.JWT_SECRET) {
      console.warn('Using an ephemeral JWT secret. Set JWT_SECRET to preserve sessions across restarts.');
    }
  });
}

module.exports = app;
