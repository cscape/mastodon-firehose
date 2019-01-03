const FileSystem = require('fs')
const Request = require('request')

function SuperConnecter (initServers) {
  const MassGraph = {}
  let GreatList = []
  let badApples = []
  GreatList = initServers

  const GenericGetSite = (host) => {
    return new Promise((resolve, reject) => {
      Request.get(`https://${host}/api/v1/instance/peers`, (NastyError, response, body) => {
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
      const currentHost = GreatList[k].toLowerCase()
      if (k % 10 === 0) FileSystem.writeFileSync('.server-massgraph.json', JSON.stringify(MassGraph))
      // duplicate
      if (GreatList.indexOf(currentHost) !== k) { k++; return go }

      return GenericGetSite(currentHost)
        .then(hostsArray => {
          const links = {}
          for (let i = 0; i < hostsArray.length; i++) {
            const ht = hostsArray[i]
            links[ht] = 1
            if (MassGraph[ht] == null) MassGraph[ht] = { [currentHost]: 1 }
            else if (MassGraph[ht][currentHost] == null || MassGraph[ht][currentHost] === 0) {
              MassGraph[ht][currentHost] = 1
            }
          }
          MassGraph[currentHost] = {
            ...links,
            [currentHost]: 1
          }

          hostsArray.forEach(host => GreatList[host.toLowerCase()] == null ? GreatList.push(host.toLowerCase()) : null)
          k++; return go()
        })
        .catch(host => {
          badApples.push(host)
          k++; return go()
        })
    } else {
      return MassGraph
    }
  }

  go()
}

if (FileSystem.existsSync('.servers.json')) {
  FileSystem.readFile('.servers.json', (err, contents) => {
    [err].pop()
    SuperConnecter(JSON.parse(contents))
  })
}
