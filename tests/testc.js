// Self ping

const WebSocket = require('ws')

const ws = new WebSocket('ws://localhost:8080')

ws.onopen = () => ws.ping()

ws.on('message', data => console.log(data))

ws.on('ping', () => ws.pong(''))
