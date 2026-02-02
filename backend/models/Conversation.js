const mongoose = require('mongoose');
const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
  topic: String,

  keys: {
    type: Map,
    of: String // encrypted conversation key per user
  }
}, { timestamps: true });

const Conversation = mongoose.model('conversations', conversationSchema);
module.exports = {Conversation};