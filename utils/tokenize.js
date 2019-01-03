const FileSystem = require('fs')

let writeStream = FileSystem.createWriteStream('.massgraph.csv')

writeStream.on('finish', () => {
  console.log('Finished writing to CSV')
})

function MakeCSV (MassGraph) {
  let i = 0
  const len = Object.keys(MassGraph).length
  for (let BaseHost in MassGraph) {
    if (i >= len) return writeStream.end()
    if (i === 0) {
      const listOfHosts = Object.keys(MassGraph['mastodon.social']).join(',')
      writeStream.write(`HOST,${listOfHosts}\n`, 'utf8')
    }
    const listOfVals = Object.values(MassGraph[BaseHost]).join(',')
    writeStream.write(`${BaseHost},${listOfVals}\n`, 'utf8')
    i += 1
  }
}

FileSystem.readFile('.servers-massgraph.cm.1.json', (err, contents) => {
  [err].pop()
  MakeCSV(JSON.parse(contents))
})
