const mongoose = require('mongoose');

const contactRequestSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
}, { timestamps: true });

// Remove unique constraint to allow resending after rejection
contactRequestSchema.index({ fromUser: 1, toUser: 1 });
contactRequestSchema.index({ toUser: 1, status: 1 });

const ContactRequest = mongoose.model('ContactRequest', contactRequestSchema);
module.exports = { ContactRequest };
