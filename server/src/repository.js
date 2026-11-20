const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const dataDirectory = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDirectory, 'store.json');
let connectionPromise;

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: String, required: true },
}, { versionKey: false });

const itemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  kind: { type: String, required: true, enum: ['tasks', 'goals', 'notes', 'activity'] },
  title: String,
  body: String,
  dueDate: String,
  targetDate: String,
  priority: String,
  completed: Boolean,
  message: String,
  createdAt: { type: String, required: true },
}, { versionKey: false, collection: 'trackeritems' });

const User = mongoose.models.TrackerUser || mongoose.model('TrackerUser', userSchema);
const Item = mongoose.models.TrackerItem || mongoose.model('TrackerItem', itemSchema);

function usesMongo() {
  return Boolean(process.env.MONGODB_URI);
}

async function connectDatabase() {
  if (!usesMongo()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI must be configured in production.');
    }
    return;
  }
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    connectionPromise = null;
  }
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    }).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  await connectionPromise;
}

function readStore() {
  if (!fs.existsSync(dataFile)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    writeStore({ users: [], tasks: [], goals: [], notes: [], activity: [] });
  }
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeStore(store) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temporaryFile, dataFile);
}

function toPlain(value) {
  if (!value) return null;
  const object = typeof value.toObject === 'function' ? value.toObject() : value;
  const { _id, __v, ...plain } = object;
  return plain;
}

async function findUserByEmail(email) {
  await connectDatabase();
  if (usesMongo()) return toPlain(await User.findOne({ email }).lean());
  return readStore().users.find((user) => user.email === email) || null;
}

async function createUser(user) {
  await connectDatabase();
  if (usesMongo()) return toPlain(await User.create(user));
  const store = readStore();
  store.users.push(user);
  writeStore(store);
  return user;
}

async function listItems(kind, userId) {
  await connectDatabase();
  if (usesMongo()) {
    const items = await Item.find({ kind, userId }).sort({ createdAt: -1 }).lean();
    return items.map(toPlain);
  }
  return readStore()[kind].filter((item) => item.userId === userId);
}

async function createItem(kind, item) {
  await connectDatabase();
  if (usesMongo()) return toPlain(await Item.create({ ...item, kind }));
  const store = readStore();
  store[kind].unshift(item);
  writeStore(store);
  return item;
}

async function updateItem(kind, id, userId, changes) {
  await connectDatabase();
  if (usesMongo()) {
    const item = await Item.findOneAndUpdate(
      { kind, id, userId },
      { $set: changes },
      { new: true, runValidators: true },
    ).lean();
    return toPlain(item);
  }
  const store = readStore();
  const item = store[kind].find((candidate) => candidate.id === id && candidate.userId === userId);
  if (!item) return null;
  Object.assign(item, changes);
  writeStore(store);
  return item;
}

async function deleteItem(kind, id, userId) {
  await connectDatabase();
  if (usesMongo()) {
    return toPlain(await Item.findOneAndDelete({ kind, id, userId }).lean());
  }
  const store = readStore();
  const item = store[kind].find((candidate) => candidate.id === id && candidate.userId === userId);
  if (!item) return null;
  store[kind] = store[kind].filter((candidate) => candidate.id !== id);
  writeStore(store);
  return item;
}

module.exports = {
  connectDatabase,
  createItem,
  createUser,
  deleteItem,
  findUserByEmail,
  listItems,
  updateItem,
  usesMongo,
};
