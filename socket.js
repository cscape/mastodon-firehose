const InitialFetch = require('./initial-fetch')
const Cheerio = require('cheerio')
const FileSystem = require('fs')
const Firehose = require('./firehose')
require('colors')
const WebSocket = require('ws')
const http = require('http')
const _uniq = require('lodash.uniq')
const twitter = require('twitter-text')
const normalizeURL = require('normalize-url')
const { URL } = require('url')
const franc = require('franc')
// const Hash = require('hash.js')
const polarity = require('polarity')
const natural = require('natural')
const mongoose = require('mongoose')
const Post = require('./models/posts')
const Account = require('./models/accounts')

mongoose.connect(process.env.FIREHOSE_MONGODB, { useNewUrlParser: true })

const DB = mongoose.connection

const server = http.createServer()

const SocketServer = new WebSocket.Server({
  perMessageDeflate: false,
  noServer: true
})

SocketServer.broadcast = (data) => {
  SocketServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      if (typeof data === 'string') client.send(data)
      else client.send(JSON.stringify(data))
    }
  })
}

SocketServer.on('connection', (socket, req) => {
  const ip = req.connection.remoteAddress
  socket.isAlive = true
  socket.send(JSON.stringify({ event: 'system:info', data: `Connected! Streaming to ${ip}` }))

  socket.on('error', () => true)
  socket.on('pong', () => {
    socket.isAlive = true
  })
})

setInterval(() => {
  SocketServer.clients.forEach(socket => {
    if (socket.isAlive === false) {
      socket.terminate()
      return
    }

    socket.isAlive = false
    socket.ping('', false, true)
  })
}, 30000)

server.on('upgrade', (request, socket, head) => {
  SocketServer.handleUpgrade(request, socket, head, (ws) => {
    SocketServer.emit('connection', ws, request)
  })
})

server.on('error', () => true)

server.listen(process.env.PORT || 8080)

function FirehoseHandler (servers) {
  // this connects to each server's local feed
  const firehose = new Firehose(servers)
  const superhose = new Firehose(servers, true)

  firehose.attempts = {}
  superhose.attempts = {}

  const statusCheck = setInterval(() => {
    const serverCount = firehose.connections
    console.info(` STATUS `.black.bgWhite + `\t${serverCount[0]} SOCKETS, ${serverCount[1]} STREAMS`.magenta)
  }, 10000)

  setTimeout(() => {
    const newServers = servers // to remove the old reference
    firehose.disconnect()
      .then(() => { clearInterval(statusCheck); superhose.disconnect(); FirehoseHandler(newServers) })
  }, 3600000) // every hour

  // errors happen, but they're unnecessary and useless here
  firehose.events.on('error', () => true)
  superhose.events.on('error', () => true)

  // SUPERHOSE DISCOVERY
  superhose.events.on('servers:posts:update', (post) => {
    if (post.url && twitter.isValidUrl(post.url)) {
      const host = (new URL(normalizeURL(post.url))).host.toLowerCase()
      if (firehose.servers.indexOf(host) === -1 && firehose.blacklist.indexOf(host) === -1) {
        firehose.addServer(host)
        superhose.addServer(host)
        console.info(' DISCOVERY '.black.bgYellow + `\t${host}`.yellow)
      }
    }
  })

  // FIREHOSE SERVER POST EVENTS
  firehose.events.on('servers:posts:update', (post, mainHost) => {
    const inHost = mainHost.toLowerCase()
    post.origin = inHost
    post.account.origin = inHost
    // post.global_id = Hash.sha256().update(`${inHost}:${post.created_at}/${post.account.id}`).digest('hex')
    const $ = Cheerio.load(
      post.content
        .replace('</p><p>', '\n\n')
        .replace('<br />', '\n')
        .replace('<br/>', '\n')
    )
    $('a').each((i, el) => {
      const obj = $(el)
      if (twitter.isValidUrl(obj.attr('href'))) {
        const username = obj.text().replace('@', '')
        if (!twitter.isValidUsername(username)) return
        const host = (new URL(obj.attr('href'))).host
        obj.html(`@${username}@${host}`)
      }
    })
    let textStatus
    if (post.sensitive && post.spoiler_text != null && post.spoiler_text !== '') {
      let spoiler = { text: '', indices: [0, 0] }
      let spoiled = post.spoiler_text
      if (spoiled.charAt(0) === '[') {
        spoiled = spoiled.split('')
        spoiled.shift()
        spoiled = spoiled.join('')
      }
      if (spoiled.charAt(spoiled.length - 1) === ']') {
        spoiled = spoiled.split('')
        spoiled.pop()
        spoiled = spoiled.join('')
      }
      spoiler.text = spoiled
      spoiler.indices[1] = spoiled.length - 1
      post.spoiler = spoiler
      post.sensitive = true
      textStatus = `[${spoiled}]\n\n${$.text()}`
    } else {
      textStatus = $.text()
      post.sensitive = false
      post.spoiler = null
    }
    // TODO: Limit post sizes to 2,000 characters.
    // Any more may exploit the system to store data/etc.
    post.content = textStatus

    post.hashtags = twitter.extractHashtagsWithIndices(textStatus).map(tag => {
      const url = normalizeURL(post.url)
      tag.url = normalizeURL((new URL(url).host), {
        normalizeHttp: (new URL(url)).protocol === 'https:'
      }) + '/tags/' + tag.hashtag.replace('#', '')
      return tag
    })

    post.lang = franc(post.content)
    if (post.lang === 'eng') {
      const tokenizer = new natural.WordTokenizer()
      post.polarity = polarity(tokenizer.tokenize(post.content)).polarity
    } else {
      post.polarity = null
    }

    const localID = post.id
    post.local_id = localID

    delete post.language
    delete post.spoiler_text
    delete post.tags
    delete post.favourites_count
    delete post.reblogs_count
    delete post.favourited
    delete post.visibility
    delete post.uri
    delete post.muted
    delete post.pinned
    delete post.reblogged
    delete post.reblog
    delete post.pinned
    delete post.id

    SocketServer.broadcast({ event: 'posts:update', data: post })
    console.log(' UPDATE '.black.bgCyan + `\t${post.lang}\t${post.content}`.white + `\n\t\t${post.url}`.cyan)

    post.account.local_id = post.account.id
    delete post.account.id

    Account.findOneAndUpdate({
      'acct': post.account.acct,
      'origin': post.account.origin
    }, post.account, { new: true, upsert: true }, (err, doc) => {
      if (err) console.error(' ERROR '.white.bgRed + `\t${err.message}`)
      delete post.account
      post.account = doc._id
      new Post(post).save((err) => {
        if (err) console.error(' ERROR '.white.bgRed + `\t${err.message}`)
      })
    })
  })

  firehose.events.on('servers:posts:delete', (data) => {
    SocketServer.broadcast({ event: 'posts:delete', data: data })
    console.log(' DELETE '.white.bgMagenta + `\t${data.id}`.white + `\t${data.host}`)
  })

  // FIREHOSE SERVER EVENTS
  firehose.events.on('servers:connected', (host) => {
    console.info(' CONNECTED '.white.bgGreen + `\t${host}`.green)
  })

  firehose.events.on('servers:disconnect', (host, code, reason, problematic) => {
    if (problematic === false) {
      if (!firehose.attempts[host]) {
        firehose.attempts[host] = 0
      } else if (firehose.attempts[host] <= 5) {
        setTimeout(() => {
          firehose.attempts[host]++
          firehose.addServer(host, true)
        }, 1000)
      } else {
        delete firehose.attempts[host]
        firehose.connectToServerLegacy(host)
      }
    } else {
      firehose.blacklist.push(host)
    }
    console.warn(' DISCONNECTED '.white.bgRed + `\t${host}`.white + `\tPROBLEMATIC? ${problematic.toString().toUpperCase()}`)
  })

  // SUPERHOSE SERVER RECONNECT
  superhose.events.on('servers:disconnect', (host, code, reason, problematic) => {
    if (problematic === false) {
      if (!superhose.attempts[host]) {
        superhose.attempts[host] = 0
      } else if (superhose.attempts[host] <= 5) {
        setTimeout(() => {
          superhose.attempts[host]++
          superhose.addServer(host, true)
        }, 1000)
      } else {
        delete superhose.attempts[host]
        superhose.connectToServerLegacy(host)
      }
    } else {
      superhose.blacklist.push(host)
    }
  })

  firehose.events.on('servers:error', (host, message) => {
    console.error(' ERROR '.white.bgRed + `\t${host}`.grey + `\t${message}`.red)
  })

  // FIREHOSE SYSTEM EVENTS
  firehose.events.on('system:cleanup', (host) => {
    console.info(` CLEANUP `.white.bgBlue + host.white)
  })

  firehose.events.on('system:discovery', (host) => {
    console.info(' DISCOVERY '.black.bgYellow + `\t${host}`.yellow)
  })
}

DB.on('error', console.error.bind(console, 'connection error:'))
DB.once('open', () => {
  if (FileSystem.existsSync('.servers.json')) {
    FileSystem.readFile('.servers.json', (err, contents) => {
      if (err) throw err
      if (typeof contents !== 'string') contents = contents.toString('utf8')
      const servers = _uniq(JSON.parse(contents))
      FirehoseHandler(servers)
    })
  } else {
    InitialFetch()
      .then(servers => {
        FirehoseHandler(_uniq(servers))
      })
  }
})
