"use strict";

var util    = require("util"),
    events  = require('events'),
    network = require('network');

function Sood() { };

util.inherits(Sood, events.EventEmitter);

Sood.prototype.query = function(serviceid) {
};

exports = module.exports = new Sood();
