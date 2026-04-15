const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  result: {
    type: String,
    enum: ['win', 'lose'],
    required: true,
  },
  score: {
    type: Number,
    required: true,
  },
  wave: {
    type: Number,
    required: true,
  },
  players: {
    type: Number,
    default: 2,
  },
  playedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Score', scoreSchema);
