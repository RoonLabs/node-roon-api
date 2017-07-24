"use strict";


// polyfill websockets in Node
if (typeof(WebSocket) == "undefined") global.WebSocket = require('ws');

var Moo = require('./moo.js');

function Transport(host) {
    console.log("new transport: " + host);
    this.ws = new WebSocket('ws://' + host + '/api');
    if (typeof(window) != "undefined") this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
        this.moo = new Moo(this);
        this.onopen();
    };

    this.ws.onclose = () => {
        this.onclose();
    };

    this.ws.onmessage = (event) => {
        if (!this.moo) return;
        var msg = this.moo.parse(event.data);
        if (!msg) return;
        this.onmessage(msg);
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
