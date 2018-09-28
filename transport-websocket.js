"use strict";

// polyfill websockets in Node
if (typeof(WebSocket) == "undefined") global.WebSocket = require('ws');

function Transport(ip, port, logger) {
    var host = ip + ":" + port;
    this.ws = new WebSocket('ws://' + host + '/api');
    if (typeof(window) != "undefined") this.ws.binaryType = 'arraybuffer';
    this.logger = logger;
    
    this.ws.onopen = () => {
        this._isonopencalled = true;
        this.onopen();
    };

    this.ws.onclose = () => {
        this.close();
    };

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
Transport.prototype.onmessage = function() { };

exports = module.exports = Transport;
