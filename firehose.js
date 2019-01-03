const WebSocket = require('ws')
const EventEmitter = require('events')
const FileSystem = require('fs')
const { URL } = require('url')
const Request = require('request')
const Package = require('./package.json')
const Cheerio = require('cheerio')
require('colors')
const _uniq = require('lodash.uniq')
const normalizeURL = require('normalize-url')
const EventSource = require('eventsource')

class FirehoseEvents extends EventEmitter {}

class Firehose {
  constructor (servers = ['mastodon.social'], spread = false, autostart = true) {
    this.servers = _uniq(servers)
    this.blacklist = ['t.co', 'youtube.com', 'twitter.com'] // not mastodon servers, ignore
    this.activeSockets = []
    this.activeStreams = []
    this.events = new FirehoseEvents()
    this.spread = spread
    if (autostart) this.init()
  }
  init () {
    this.connectAll()
    setInterval(() => {
      this.activeSockets.forEach((socket, index) => {
        if (socket.readyState === WebSocket.CLOSED) this.activeSockets.splice(index, 1)
      })
      this.activeStreams.forEach((stream, index) => {
        if (stream.readyState === 2) this.activeStreams.splice(index, 1)
      })
      this.cleanDupes()
    }, 10000)
  }
  /** List of active WebSocket connections and Event Streams
   * @returns number[] Two-value array
   */
  get connections () {
    return [
      this.activeSockets.filter(socket => socket.readyState === 1).length,
      this.activeStreams.filter(eventStream => eventStream.readyState === 1).length
    ]
  }
  disconnect () {
    return new Promise((resolve, reject) => {
      this.activeSockets.forEach((socket, index) => {
        socket.removeAllListeners()
        socket.close()
        socket.terminate()
      })
      for (let i = 0; i < this.activeSockets.length; i++) delete this.activeSockets[i]
      this.events.removeAllListeners()
      resolve(true)
    })
  }
  checkInstance (incHost, skipChecks = false) {
    const host = incHost.toLowerCase()
    return new Promise((resolve, reject) => {
      // Skips everything, useful for reconnects
      if (skipChecks) resolve(true)
      // fail when it's blacklisted, saves bandwidth
      if (this.blacklist.indexOf(host) > -1) reject(new Error())
      if (this.servers.indexOf(host) > -1) reject(new Error())

      // stop bugging me about errors
      const fail = () => {
        this.blacklist.push(host)
        reject(new Error())
        return new Error()
      }

      Request.get(`http://${host}/api/v1/instance`, (NastyError, response, body) => {
        if (NastyError || !response) return fail()
        if (response.statusCode !== 200) return fail()
        const ct = response.headers['content-type']
        if (ct == null || ct.indexOf('application/json') === -1) return fail()

        let jsonBody
        try {
          jsonBody = JSON.parse(body)
          if (typeof jsonBody !== 'object' || jsonBody == null) return fail()
          if (jsonBody.uri === host) resolve(true)
        } catch (err) {
          return fail()
        }
      })
    })
  }
  cleanDupes () {
    const allSockets = _uniq(this.activeSockets.map(socket => socket != null ? (new URL(socket.url)).host : null))
    let seen = {}
    allSockets.forEach((host, index) => {
      if (seen.hasOwnProperty(host)) {
        const socket = this.activeSockets[index]
        if (socket && socket.url) {
          this.events.emit('system:cleanup', host)
          socket.close() // safe disconnect
        }
        this.activeSockets[index] = null
        return false
      } else {
        return (seen[host] = true)
      }
    })

    // removal of null sockets
    for (let k = 0; k < this.activeSockets.length; k++) {
      if (this.activeSockets[k] == null) {
        delete this.activeSockets[k]
        k--
      }
    }

    const allStreams = _uniq(this.activeStreams.map(stream => stream != null ? (new URL(stream.url)).host : null))
    let seenStreams = {}
    allStreams.forEach((host, index) => {
      if (seenStreams.hasOwnProperty(host)) {
        const stream = this.activeStreams[index]
        if (stream && stream.url) {
          this.events.emit('system:cleanup', host)
          stream.close() // safe disconnect
        }
        this.activeStreams[index] = null
        return false
      } else {
        return (seenStreams[host] = true)
      }
    })

    // removal of null streams
    for (let k = 0; k < this.activeStreams.length; k++) {
      if (this.activeStreams[k] == null) {
        delete this.activeStreams[k]
        k--
      }
    }

    // let allSocketHosts = []
    // for (let k = 0; k < this.activeSockets.length; k++) {
    //   const socket = this.activeSockets[k]
    //   if (socket == null) continue // yeah just skip if it's null/undefined

    //   const socketHost = (new URL(socket.url)).host
    //   // checks to see if it's a new instance or not
    //   if (this.servers.indexOf(socketHost) === -1) this.servers.push(socketHost)

    //   // if the socket host already exists, it's a duplicate. remove it
    //   if (allSocketHosts.indexOf(socketHost) === -1) {
    //     allSocketHosts.push(socketHost)
    //   } else {
    //     this.events.emit('system:cleanup', socketHost)
    //     socket.terminate()
    //     this.activeSockets.splice(k, 1)
    //     k--
    //   }
    // }
  }
  addServer (incHost, force = false) {
    const host = incHost.toLowerCase()

    this.servers.push(host)
    const actives = this.activeSockets.map(socket => (new URL(socket.url).host))
    if (force || (actives.indexOf(host) === -1 && this.blacklist.indexOf(host) === -1)) {
      const failure = () => { const a = this.servers.indexOf(host); if (a > -1) this.servers.splice(a, 1); this.blacklist.push(host) }
      this.checkInstance(host, force)
        .then(() => {
          this.connectToServer(host)
            .then(() => {
              this.updateServers()
            })
            .catch(() => failure())
        })
        .catch(() => failure()) // ignore
    } else {
      const a = this.servers.indexOf(host)
      if (a > -1) this.servers.splice(a, 1)
    }
  }
  updateServers () {
    // unless there's errors, make the list add-only
    if (!this.spread) FileSystem.writeFileSync('.servers.json', JSON.stringify(this.servers))
  }
  connectAll () {
    let k = 0
    const connect = async () => {
      if (k < this.servers.length) {
        const host = this.servers[k]
        const failure = () => { const a = this.servers.indexOf(host); if (a > -1) this.servers.splice(a, 1) }
        this.connectToServerFallback(this.servers[k])
          .then(() => true)
          .catch(() => failure())
        k++
        connect()
      }
    }
    connect()
  }
  discovery (status) {
    if (status.url) {
      const host = (new URL(status.url)).host
      if (this.servers.indexOf(host)) {
        this.addServer(host.toLowerCase())
        this.events.emit('system:discovery', host)
      }
    }
    if (status.content) {
      // checks for all links
      const $ = Cheerio.load(status.content)
      const clickLinks = $('*').toArray().map(el => $(el).attr('href')).filter(text => text != null)
      if (clickLinks.length) {
        _uniq(clickLinks).forEach(val => {
          const host = (new URL(val)).host
          this.addServer(host.toLowerCase())
          this.events.emit('system:discovery', host)
        })
      }
    }
    if (status.mentions.length !== 0) {
      status.mentions.forEach(mention => {
        const url = new URL(mention.url)
        this.addServer(url.host.toLowerCase())
        this.events.emit('system:discovery', url.host)
      })
    }
  }
  get signature () {
    return (new Array(4)).fill(0).map(() => Math.round(Math.random() * 10e8).toString(16)).join('')
  }
  generateHeaders (host) {
    return {
      'user-agent': `${Package.client} (${Package.version}) Integrity/${this.signature}`,
      'origin': normalizeURL(host),
      'referer': normalizeURL(host)
    }
  }
  connectToServer (incHost) {
    const host = incHost.toLowerCase()
    return new Promise((resolve, reject) => {
      let stream
      if (!this.spread) stream = 'public:local'
      else stream = 'public' // The true firehose

      const socket = new WebSocket(`wss://${host}/api/v1/streaming/?stream=${stream}`, {
        headers: this.generateHeaders()
      })
      let interval = false
      socket.problematic = false

      socket.on('open', () => {
        this.events.emit('servers:connected', socket.url)
        interval = setInterval(() => {
          try {
            socket.pong('')
          } catch (err) {
            [err].pop() // shut up useless errors
          }
        }, 5000)
        socket.pong('')
        resolve(socket)
      })

      socket.on('error', err => {
        if (interval !== false) clearInterval(interval)
        socket.problematic = true
        this.blacklist.push(host)
        this.events.emit('servers:error', host, err.message)
        const ind = this.servers.indexOf(host)
        if (ind > -1) this.servers.splice(ind, 1)
        this.updateServers()
      })

      socket.on('message', raw => {
        let data
        try {
          data = JSON.parse(raw)
        } catch (err) {
          return false
        }
        if (data.event === 'delete') {
          this.events.emit('servers:posts:delete', {
            id: data.payload,
            host: host
          })
        } else if (data.event === 'update') {
          const status = JSON.parse(data.payload)
          status.host = host
          this.events.emit('servers:posts:update', status, host)
          // this.discovery(status)
        }
      })

      socket.on('close', (ws, code, reason) => {
        if (interval !== false) clearInterval(interval)

        // const a = this.servers.indexOf(host)
        // if (a > -1) this.servers.splice(a, 1)

        this.events.emit('servers:disconnect', host, code, reason, socket.problematic)
        socket.terminate()
        socket.removeAllListeners()

        const b = this.activeSockets.map(socket => socket.url).indexOf(host)
        if (b > -1) this.activeSockets.splice(b, 1)
      })

      this.activeSockets.push(socket)
    })
  }
  connectToServerFallback (incHost) {
    const host = incHost.toLowerCase()
    return new Promise((resolve, reject) => {
      let endpoint
      if (!this.spread) endpoint = '/api/v1/streaming/public/local'
      else endpoint = '/api/v1/streaming/public' // The true firehose

      const events = new EventSource(normalizeURL(host, { normalizeHttp: true }) + endpoint, {
        headers: this.generateHeaders(host)
      })
      events.problematic = false

      events.onopen = () => {
        this.events.emit('servers:connected', events.url)
        resolve(events)
      }

      events.addEventListener('update', raw => {
        let status
        try {
          status = JSON.parse(raw.data)
        } catch (err) {
          return false
        }
        status.host = host
        this.events.emit('servers:posts:update', status, host)
      })

      events.addEventListener('delete', id => {
        this.events.emit('servers:posts:delete', {
          id: id.data,
          host
        })
      })

      events.onerror = (err) => {
        events.problematic = true
        this.events.emit('servers:error', host, err.message)
        this.events.emit('servers:disconnect', host, err.status, err.message, events.problematic)
        events.close()

        const a = this.activeStreams.map(eventStream => eventStream.url).indexOf(events.url)
        if (a > -1) this.activeStreams.splice(a, 1)

        const b = this.servers.indexOf(host)
        if (b > -1) this.servers.splice(b, 1)
        this.blacklist.push(host)
        this.updateServers()
      }

      this.activeStreams.push(events)
    })
  }
}

module.exports = Firehose
