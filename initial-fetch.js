const HTTPS = require('https')
const { URL } = require('url')
const FileSystem = require('fs')
const _uniq = require('lodash.uniq')
const Request = require('request')

function GetInitialInstances (log = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(process.env.MASTODON_INSTANCES_ENDPOINT)
    HTTPS.get({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: '/api/1.0/instances/list?count=0&include_down=false',
      headers: {
        Authorization: `Bearer ${process.env.MASTODON_INSTANCES_TOKEN}`
      }
    }, function (response) {
      if (log) console.log('Fetching instances...')
      // Continuously update stream with data
      var body = ''

      response.on('data', function (d) {
        body += d
      })

      response.on('end', function () {
        const jsonBody = JSON.parse(body)
        if (jsonBody.error != null) reject(jsonBody)
        else {
          if (log) console.log('Done fetching initial instances from ' + process.env.MASTODON_INSTANCES_ENDPOINT)
          resolve(jsonBody)
        }
      })
    })
  })
}

function FilterInitialInstances (jsonData) {
  return jsonData.instances.map(val => {
    if (val.name.indexOf('@') === -1 && val.name.indexOf('glitch.me') === -1) return val.name
  })
}

// Enumerates through all known instances
// and fetches all their peers, recursively
function SuperConnecter (initServers) {
  let GreatList = []
  let badApples = []
  GreatList = initServers

  const GenericGetSite = (host) => {
    return new Promise((resolve, reject) => {
      Request.get(`http://${host}/api/v1/instance/peers`, (NastyError, response, body) => {
        if (NastyError || !response) return reject(host)
        if (response.statusCode !== 200) return reject(host)
        const ct = response.headers['content-type']
        if (ct == null || ct.indexOf('application/json') === -1) return reject(host)

        let jsonBody
        try {
          jsonBody = JSON.parse(body)
          if (!Array.isArray(jsonBody) || jsonBody == null) return reject(host)

          resolve(jsonBody)
        } catch (err) {
          return reject(host)
        }
      })
    })
  }

  let k = 0
  const go = () => {
    if (k < GreatList.length) {
      FileSystem.writeFileSync('.servers-graph.json', JSON.stringify(_uniq(GreatList).filter(host => badApples.indexOf(host) === -1)))
      return GenericGetSite(initServers[k])
        .then((hostsArray) => {
          hostsArray.forEach(host => {
            if (GreatList.indexOf(host) === -1 && badApples.indexOf(host) === -1) GreatList.push(host)
          })
          k++; return go()
        })
        .catch(host => {
          badApples.push(host)
          k++; return go()
        })
    } else {
      return _uniq(GreatList).filter(host => badApples.indexOf(host) === -1)
    }
  }

  return go()
}

module.exports = () => {
  return new Promise((resolve, reject) => {
    GetInitialInstances(true)
      .then(data => FilterInitialInstances(data))
      // .then(servers => SuperConnecter(servers))
      .then(servers => {
        FileSystem.writeFileSync('.servers.json', JSON.stringify(_uniq(servers)))
        resolve(servers)
      })
      .catch(err => {
        reject(err)
      })
  })
}
