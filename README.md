# Mastodon Firehose (Central Server)

Dynamically connect to hundreds (or thousands) of Mastodon instances
and stream new posts in realtime in a single data stream.
A WebSocket endpoint is provided to proxy posts to clients.

## Setup

``` bash
# install dependencies
$ npm install

# first load environment variables
# as specified in .env.sample
$ npm run update

# start the socket server + command line output
$ npm start
```

Different utilities are provided for messing with the server list. You may also use your own server list, provided it's a flat array of hosts.

## License

[MIT](LICENSE) © [Cyberscape](https://cyberscape.co/).
