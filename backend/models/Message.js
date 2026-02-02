const mongoose = require('mongoose');
const messageSchema = new mongoose.Schema({
  conversationId: mongoose.Schema.Types.ObjectId,
  senderId: mongoose.Schema.Types.ObjectId,
  encryptedMessage: String
}, { timestamps: true });

const Message = mongoose.model('messages', messageSchema);
module.exports = { Message };