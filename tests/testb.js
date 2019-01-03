// Fetches fresh new server list from instances.social

const InitialFetch = require('../initial-fetch')

InitialFetch()
  .then(servers => {
    console.log(servers)
  })
