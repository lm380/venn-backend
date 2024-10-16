const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const UserSchema = mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, default: uuidv4 },
    userName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    createdSessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
    joinedSessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
