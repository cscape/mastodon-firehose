// 2d-graph (JavaScript)
// Transforms server list into a 2d graph of connected
// peers to build a relationship diagram

const FileSystem = require('fs')

// Partial Graphing
const stage = 1 // current stage
const maxstage = 10

function TwoDify (graph, tags) {
  const MassGraph = graph
  const le = Object.keys(MassGraph).length
  let K = 0
  for (var BaseHost in MassGraph) {
    if (K < (le / maxstage) * (stage - 1)) continue
    if (K >= (le / maxstage) * stage) break
    console.log(BaseHost)
    for (var i = 0; i < tags.length; i++) {
      const it = tags[i]
      if (MassGraph[BaseHost][it] != null) continue
      else MassGraph[BaseHost][it] = 0
    }
    K++
  }
  FileSystem.writeFileSync(`.servers-massgraph.cm.${stage}.json`, JSON.stringify(MassGraph))
}

FileSystem.readFile('.servers-massgraph.json', (e, contents) =>
  FileSystem.readFile('.servers-massgraph.tags.json', (e, tags) => {
    TwoDify(JSON.parse(contents), JSON.parse(tags))
  })
)
