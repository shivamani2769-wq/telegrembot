const { MongoClient } = require('mongodb');

let client = null;
let chats = null;

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI in .env');

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  chats = client.db(process.env.MONGODB_DB || 'tbot').collection('chats');

  // Automatically delete chats that have been inactive for 30 days
  await chats.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
}

function getChats() {
  if (!chats) throw new Error('Database not connected yet');
  return chats;
}

async function closeDb() {
  if (client) await client.close();
}

module.exports = { connectDb, getChats, closeDb };