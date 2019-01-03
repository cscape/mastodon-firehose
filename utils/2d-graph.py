# 2d-graph (Python)
# Transforms server list into a 2d graph of connected
# peers to build a relationship diagram

# Note: This does not implement partial graphing
# like the JavaScript utility, so it may be prone
# to crashing because of insufficient memory

import json

with open('.servers-massgraph.json') as f:
  massGraph = json.load(f)

with open('.servers-massgraph.tags.json') as t:
  tags = json.load(t)

for baseHost in massGraph:
  for tag in tags:
    if tag in massGraph[baseHost]:
      continue
    else:
      massGraph[baseHost][tag] = 0

GraphFile = open(".server-massgraph.cm.json", "w")
GraphFile.write(json.dumps(massGraph))
