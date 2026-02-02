const mongoose = require('mongoose');

const usersSchema = new mongoose.Schema({
  identifiant: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hashed with bcrypt
  role: { type: Number, default: 0 },
  publicKey: { type: String, required: true },
  encryptedPrivateKey: { type: String, required: true },
  iv: { type: String, required: true },   // AES-GCM IV
  salt: { type: String, required: true }  // password derivation salt
}, { collection: 'users' });

const User = mongoose.model('users', usersSchema);
module.exports = { User };
