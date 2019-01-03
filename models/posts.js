const mongoose = require('mongoose')

const Schema = mongoose.Schema

const postSchema = new Schema({
  origin: { type: String, required: true },
  account: { type: Schema.Types.ObjectId, ref: 'accounts', required: true },
  content: { type: String, default: '', required: true },
  created_at: { type: String, required: true },
  emojis: { type: Array, default: [] },
  local_id: { type: String, required: true, default: null },
  lang: { type: String, default: null },
  media_attachments: { type: Array, default: [] },
  mentions: { type: Array, default: [] },
  sensitive: { type: Boolean, default: false },
  spoiler: { type: Map, default: null },
  hashtags: { type: Array, default: [] },
  polarity: { type: Number, default: null },
  url: { type: String, default: null },
  in_reply_to_id: { type: String, default: null },
  in_reply_to_account_id: { type: String, default: null }
})

const Post = mongoose.model('posts', postSchema)

module.exports = Post
