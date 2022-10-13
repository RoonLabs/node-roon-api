"use strict";

// polyfill websockets in Node
if (typeof(WebSocket) == "undefined") global.WebSocket = require('ws');

function Transport(ip, port, logger) {
    this.host = ip;
    this.port = port;

    this.interval = null;
    this.is_alive = null;

    this.ws = new WebSocket("ws://" + ip + ":" + port + "/api");
    if (typeof(window) != "undefined") this.ws.binaryType = 'arraybuffer';
    this.logger = logger;

    this.ws.on('pong', () => this.is_alive = true);
    this.ws.onopen = () => {
        this.is_alive = true;
        this.interval = setInterval(() => {
            if (this.is_alive === false) {
                logger.log(`Roon API Connection to ${this.host}:${this.port} closed due to missed heartbeat`);
                return this.ws.terminate();
            }
            this.is_alive = false;
            this.ws.ping();
        }, 10000)

        this._isonopencalled = true;
        this.onopen();
    };

    this.ws.onclose = () => {
        this.is_alive = false;
        clearInterval(this.interval);
        this.interval = null;
        this.close();
    };

    this.ws.onerror = (err) => {
        this.onerror();
    }

    this.ws.onmessage = (event) => {
        var msg = this.moo.parse(event.data);
        if (!msg) {
            this.close();
            return;
        }
        this.onmessage(msg);
    };
}

Transport.prototype.send = function(buf) {
    this.ws.send(buf, { binary: true, mask: true});
};

Transport.prototype.close = function() {
    if (this.ws) {
        this.ws.close();
        this.ws = undefined;
    }

    if (!this._onclosecalled && this._isonopencalled) {
        this._onclosecalled = true;
        this.onclose();
    }

    if (this.moo) {
        this.moo.clean_up();
        this.moo = undefined;
    }
};

Transport.prototype.onopen = function() { };
Transport.prototype.onclose = function() { };
Transport.prototype.onerror = function() { };
Transport.prototype.onmessage = function() { };

exports = module.exports = Transport;
