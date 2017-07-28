"use strict";

// polyfill websockets in Node
if (typeof(WebSocket) == "undefined") global.WebSocket = require('ws');

var Moo = require('./moo.js');

function Transport(ip, http_port, tcp_port, logger) {
    var host = ip + ":" + http_port;
    this.ws = new WebSocket('ws://' + host + '/api');
    if (typeof(window) != "undefined") this.ws.binaryType = 'arraybuffer';
    this.logger = logger;
    
    this.ws.onopen = () => {
        this.moo = new Moo(this);
        this.onopen();
    };

    this.ws.onclose = () => {
        this.onclose();
    };

    this.ws.onmessage = (event) => {
        if (!this.moo) return;
        var result = this.moo.parse(event.data);
        if (!result || !result.is_success) {
            this.close();
            return;
        }
        this.onmessage(result.msg);
    };
}

Transport.prototype.send = function(buf) {
    this.ws.send(buf, { binary: true, mask: true});
};

Transport.prototype.close = function() {
    this.ws.close();
};

Transport.prototype.onopen = function() { };
Transport.prototype.onclose = function() { };
Transport.prototype.onmessage = function() { };

exports = module.exports = Transport;
