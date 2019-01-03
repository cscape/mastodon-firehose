const mongoose = require('mongoose')

const Schema = mongoose.Schema

const accountSchema = new Schema({
  _id: Schema.Types.ObjectId,
  origin: { type: String, required: true },
  acct: { type: String, required: true },
  avatar: { type: String, required: true },
  bot: { type: Boolean, default: false, required: true },
  created_at: { type: String },
  display_name: { type: String, default: '' },
  emojis: { type: Array, default: [] },
  followers_count: { type: Number, default: null },
  following_count: { type: Number, default: null },
  header: { type: String, default: null },
  local_id: { type: String, default: null },
  statuses_count: { type: Number, default: null },
  url: { type: String, default: null }
})

const Account = mongoose.model('accounts', accountSchema)

module.exports = Account
