"use strict";

function MooMessage(moo, msg, body) {
    this.moo = moo;
    this.msg = msg;
    this.body = body;
}

MooMessage.prototype.send_continue = function() {
    var name;
    var body;
    var content_type;

    if (arguments.length == 1) {
        name = arguments[0];
    } else if (arguments.length == 2) {
        name = arguments[0];
        body = arguments[1];
    } else if (arguments.length >= 3) {
        name         = arguments[0];
        body         = arguments[1];
        content_type = arguments[2];
    }

    var origbody = body;

    if (typeof(body) == 'undefined') {
        // nothing needed here
    } else if (!Buffer.isBuffer(body)) {
        body = Buffer.from(JSON.stringify(body), 'utf8');
        content_type = content_type || "application/json";
    } else {
        throw new Error("missing content_type");
    }

    let header = 'MOO/1 CONTINUE ' + name + '\n' +
                 'Request-Id: ' + this.msg.request_id + '\n';

    if (body) {
        header += 'Content-Length: ' + body.length + '\n' +
                  'Content-Type: ' + content_type + '\n';
    }

    if (this.msg.log) this.moo.logger.log('-> CONTINUE', this.msg.request_id, name, origbody ? JSON.stringify(origbody) : "");
    const m = Buffer.from(header + '\n');
    if (body)
        this.moo.transport.send(Buffer.concat([ m, body ], m.length + body.length));
    else
        this.moo.transport.send(m);
};

MooMessage.prototype.send_complete = function() {
    var name;
    var body;
    var content_type;

    if (arguments.length == 1) {
        name = arguments[0];
    } else if (arguments.length == 2) {
        name = arguments[0];
        body = arguments[1];
    } else if (arguments.length >= 3) {
        name         = arguments[0];
        body         = arguments[1];
        content_type = arguments[2];
    }

    var origbody = body;

    if (typeof(body) == 'undefined') {
        // nothing needed here
    } else if (!Buffer.isBuffer(body)) {
        body = Buffer.from(JSON.stringify(body), 'utf8');
        content_type = content_type || "application/json";
    } else {
        throw new Error("missing content_type");
    }

    let header = 'MOO/1 COMPLETE ' + name + '\n' +
                 'Request-Id: ' + this.msg.request_id + '\n';

    if (body) {
        header += 'Content-Length: ' + body.length + '\n' +
                  'Content-Type: ' + content_type + '\n';
    }

    if (this.msg.log) this.moo.logger.log('-> COMPLETE', this.msg.request_id, name, origbody ? JSON.stringify(origbody) : "");
    const m = Buffer.from(header + '\n');
    if (body)
        this.moo.transport.send(Buffer.concat([ m, body ], m.length + body.length));
    else
        this.moo.transport.send(m);
};


exports = module.exports = MooMessage;
