// Tests whether fallback connections work well

const Firehose = require('../firehose')
require('colors')

function FirehoseHandler (servers) {
  // this connects to each server's local feed
  const firehose = new Firehose(servers, false, false)

  servers.forEach((host, i) => {
    firehose.connectToServerFallback(host)
      .then(events => console.log(events))
      .catch(err => console.log(err))
  })

  setInterval(() => {
    const serverCount = firehose.connections
    console.info(` STATUS `.black.bgWhite + `\t${serverCount[0]} SOCKETS, ${serverCount[1]} STREAMS`.magenta)
  }, 10000)

  // FIREHOSE SERVER POST EVENTS
  firehose.events.on('servers:posts:update', (data) => {
    console.log(' UPDATE '.black.bgCyan + `\t${data.content}`.white)
  })

  // FIREHOSE SERVER EVENTS
  firehose.events.on('servers:connected', (host) => {
    console.info(' CONNECTED '.white.bgGreen + `\t${host}`.green)
  })

  firehose.events.on('servers:disconnect', (host, code, reason, problematic) => {
    console.warn(' DISCONNECTED '.white.bgRed + `\t${host}\t${code}\t${reason}`.white)
  })

  firehose.events.on('servers:error', (host, message) => {
    console.error(' ERROR '.white.bgRed + `\t${host}`.grey + `\t${message}`.red)
  })
}

const servers = ['mstdn.io']
FirehoseHandler(servers)
