"use strict";

function Moo(transport) {
    this.transport = transport;
    this.reqid = 0;
    this.subkey = 0;
    this.requests = {};
    this.mooid = Moo._counter++;
    this.logger = transport.logger;
}

Moo._counter = 0;

Moo.prototype._subscribe_helper = function(svcname, reqname, cb) {
    var self = this;
    var subkey = self.subkey++;
    self.send_request(svcname + "/subscribe_" + reqname,
                            { subscription_key: subkey },
                            function (msg, body) {
                                if (cb)
                                    cb(msg && msg.name == "Success" ? false : (msg ? msg.name : "NetworkError"), body);
                            });
    return {
        unsubscribe: function(ucb) {
            self.send_request(svcname + "/unsubscribe_" + reqname,
                                { subscription_key: subkey },
                                ucb);
        }
    };
};

Moo.prototype.send_request = function() {
    var name;
    var body;
    var content_type;

    var cb;

    var i = 0;
    name = arguments[i++];
    if (typeof(arguments[i]) != 'function') { body         = arguments[i++]; }
    if (typeof(arguments[i]) != 'function') { content_type = arguments[i++]; }
    cb = arguments[i++];

    var origbody = body;

    if (typeof(body) == 'undefined') {
        // nothing needed here
    } else if (!Buffer.isBuffer(body)) {
        body = Buffer.from(JSON.stringify(body), 'utf8');
        content_type = content_type || "application/json";
    } else {
        throw new Error("missing content_type");
    }

    let header = 'MOO/1 REQUEST ' + name + '\n' +
                 'Request-Id: ' + this.reqid + '\n';

    if (body) {
        header += 'Content-Length: ' + body.length + '\n' +
                  'Content-Type: ' + content_type + '\n';
    }

    this.logger.log('-> REQUEST', this.reqid, name, origbody ? JSON.stringify(origbody) : "");
    const m = Buffer.from(header + '\n');
    if (body)
        this.transport.send(Buffer.concat([ m, body ], m.length + body.length));
    else
        this.transport.send(m);

    this.requests[this.reqid] = { cb: cb };
    this.reqid++;
};

Moo.prototype.parse = function(buf) {
    var e = 0;
    var s = 0;
    var ret = {
        is_success: false,
        bytes_consumed: 0,
        msg: {}
    };
    var msg = {
        content_length: 0,
        headers: {}
    };

    if ((typeof ArrayBuffer != 'undefined') && (buf instanceof (ArrayBuffer))) {
        // convert to Node Buffer
        var view = new Uint8Array(buf);
        var buf = new Buffer(buf.byteLength);
        for (var i = 0; i < buf.length; ++i) buf[i] = view[i];
    }
    var state;
    while (e < buf.length) {
        if (buf[e] == 0xa) {
            // parsing headers or first line?
            if (state == 'header') {
                if (s == e) {
                    // end of MOO header
                    if (msg.request_id === undefined) {
                        this.logger.log('MOO: missing Request-Id header: ', msg);
                        return ret;
                    }
                    if (msg.content_length > 0) {
                        if (msg.content_type == "application/json") {
                            var json = buf.toString('utf8', e+1, e+1+msg.content_length);
                            try {
                                msg.body = JSON.parse(json);
                            } catch (e) {
                                this.logger.log("MOO: bad json body: ", json, msg);
                                return ret;
                            }
                        } else {
                          msg.body = buf.slice(e+1, e+1+msg.content_length);
                        }
                        ret.bytes_consumed = e + 1 + msg.content_length;
                    } else {
                        ret.bytes_consumed = e + 1;
                    }
                    ret.msg = msg;
                    ret.is_success = true;
		    return ret;
                } else {
                    // parse MOO header line
                    var line = buf.toString('utf8', s, e);
                    var matches = line.match(/([^:]+): *(.*)/);
                    if (matches) {
                        if (matches[1] == "Content-Type")
                            msg.content_type = matches[2];
                        else if (matches[1] == "Content-Length")
                            msg.content_length = parseInt(matches[2]);
                        else if (matches[1] == "Request-Id")
                            msg.request_id = matches[2];
                        else
                            msg.headers[matches[1]] = matches[2];
                    } else {
                        this.logger.log("MOO: bad header: ", line, msg);
                        return ret;
                    }
                }
            } else {
                // parse MOO first line
                var line = buf.toString('utf8', s, e);
                var matches = line.match(/^MOO\/([0-9]+) ([A-Z]+) (.*)/);
                if (matches) {
                    msg.verb = matches[2];
                    if (msg.verb == "REQUEST") {
                        matches = matches[3].match(/([^\/]+)\/(.*)/);
                        if (matches) {
                            msg.service = matches[1];
                            msg.name = matches[2];
                        } else {
                            this.logger.log("MOO: bad request header: ", line, msg);
                            return ret;
                        }
                    } else {
                        msg.name = matches[3];
                    }
                    state = 'header';
                } else {
                    this.logger.log("MOO: bad header: ", line, msg);
                    return ret;
                }
            }
            s = e+1;
        }
        e++;
    }
    this.logger.log("ignoring malformed moo msg", buf);
    return ret;
};

Moo.prototype.handle_response = function(msg, body) {
    let cb = this.requests[msg.request_id].cb;
    if (cb) cb(msg, body);
    if (msg.verb == "COMPLETE") delete(this.requests[msg.request_id]);
};

Moo.prototype.close = function() {
    Object.keys(this.requests).forEach(e => {
	let cb = this.requests[e].cb;
	if (cb) cb();
    });
    this.requests = {};
};

exports = module.exports = Moo;
