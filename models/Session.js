const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const SessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, default: uuidv4 },
    title: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    options: [
      {
        optionId: String,
        description: String,
        yesVotes: Number,
        noVotes: Number,
      },
    ],
    status: {
      type: String,
      enum: ['Pending', 'Active', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    swipes: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        optionSwipes: {
          type: Map,
          of: String,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', SessionSchema);
