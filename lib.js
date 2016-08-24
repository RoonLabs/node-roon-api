"use strict";

// polyfill websockets in Node
if (typeof(WebSocket) == "undefined") global.WebSocket = require('ws');

var Moo        = require('./moo.js'),
    MooMessage = require('./moomsg.js'),
    Core       = require('./core.js');

function RoonApi() {
    this._service_request_handlers = {};
};

// - pull in Sood and provide discovery methods in Node
//
// - implement save_config/load_config based on:
//      Node:       require('fs')
//      WebBrowser: localStroage
//
if (typeof(window) == "undefined") {
    RoonApi.prototype.start_discovery = function() {
	if (this._sood) return;
	this._sood = require('./sood.js');
        this._sood.on('message', msg => {
//	    console.log(msg);
            if (msg.props.service_id == "00720724-5143-4a9b-abac-0e50cba674bb" && msg.props.unique_id) {
		let host = msg.from.ip;
                this.connect(host, msg.props.http_port);
            }
        });
        this._sood.start(() => {
	    this._sood.query({ query_service_id: "00720724-5143-4a9b-abac-0e50cba674bb" });
	});
    };

    var fs = require('fs');
    RoonApi.prototype.save_config = function(k, v) {
        try {
            let config;
            try {
                let content = fs.readFileSync("config.json", { encoding: 'utf8' });
                config = JSON.parse(content);
            } catch (e) {
                config = {};
            } 
            config[k] = v;
            fs.writeFileSync("config.json", JSON.stringify(config, null, '    '));
        } catch (e) { }
    };

    RoonApi.prototype.load_config = function(k) {
        try {
            let content = fs.readFileSync("config.json", { encoding: 'utf8' });
            return JSON.parse(content)[k];
        } catch (e) {
            return undefined;
        }
    };

} else {
    RoonApi.prototype.save_config = function(k, v) { localStorage.setItem(k, !v ? v : JSON.stringify(v)); };
    RoonApi.prototype.load_config = function(k)    { let r = localStorage.getItem(k); return r ? JSON.parse(r) : undefined; };
}

RoonApi.prototype.register_service = function(svcname, spec) {
    let ret = {
	_subtypes: { }
    };

    if (spec.subscriptions) {
	for (let x in spec.subscriptions) {
	    let s = spec.subscriptions[x];
	    let subname = s.subscribe_name;
	    ret._subtypes[subname] = { };
	    spec.methods[subname] = (req) => {
		// XXX make sure req.body.subscription_key exists or respond send_complete with error

		var newreq = {
		    send_continue: function() {
			req.send_continue.apply(req, arguments);
		    },
		    send_complete: function() {
			req.send_complete.apply(req, arguments);
			delete(ret._subtypes[subname][req.body.subscription_key]);
		    }
		};
		s.start(newreq, req);
		ret._subtypes[subname][req.body.subscription_key] = newreq;
	    };
	    spec.methods[s.unsubscribe_name] = (req) => {
		// XXX make sure req.body.subscription_key exists or respond send_complete with error
                delete(ret._subtypes[subname][req.body.subscription_key]);
		if (s.end) s.end(req);
		req.send_complete("Unsubscribed");
	    };
	}
    }

    // process incoming requests from the other side
    this._service_request_handlers[svcname] = req => {
	// make sure the req's request name is something we know about
        if (req) {
            let method = spec.methods[req.msg.name]; 
            if (method) {
                method(req);
            } else {
                req.send_complete("InvalidRequest", { error: "unknown request name (" + svcname + ") : " + req.msg.name });
            }
        } else {
            if (spec.subscriptions) {
                for (let x in spec.subscriptions) {
                    let s = spec.subscriptions[x];
                    let subname = s.subscribe_name;
                    ret._subtypes[subname] = { };
                    if (s.end) s.end(req);
                }
            }
        }
    };

    ret.name = svcname;
    ret.send_continue_all = (subtype, name, props) => { for (let x in ret._subtypes[subtype]) ret._subtypes[subtype][x].send_continue(name, props); };
    ret.send_complete_all = (subtype, name, props) => { for (let x in ret._subtypes[subtype]) ret._subtypes[subtype][x].send_complete(name, props); };
    return ret;
};

RoonApi.prototype.extension = function(o) {
    if (typeof(o.extension_id)    != 'string') throw new Error("Roon Extension options is missing the required 'extension_id' property.");
    if (typeof(o.display_name)    != 'string') throw new Error("Roon Extension options is missing the required 'display_name' property.");
    if (typeof(o.display_version) != 'string') throw new Error("Roon Extension options is missing the required 'display_version' property.");
    if (typeof(o.publisher)       != 'string') throw new Error("Roon Extension options is missing the required 'publisher' property.");
    if (typeof(o.email)           != 'string') throw new Error("Roon Extension options is missing the required 'email' property.");
    if (!Array.isArray(o.required_services)) o.required_services = []; 
    if (!Array.isArray(o.optional_services)) o.optional_services = [];
    if (!Array.isArray(o.provided_services)) o.provided_services = [];

    if (typeof(o.set_persisted_state) == 'undefined')
        this.set_persisted_state = state => { this.save_config("roonstate", state); };
    else
        this.set_persisted_state = o.set_persisted_state;

    if (typeof(o.get_persisted_state) == 'undefined')
        this.get_persisted_state = () => { return this.load_config("roonstate") || {}; };
    else
        this.get_persisted_state = o.get_persisted_state;

    let pinger = {
	services: [ this.register_service("com.roonlabs.ping:1", {
	    methods: {
		ping: function(req) {
		    req.send_complete("Success");
		},
	    }
	}) ]
    };
    // XXX    o.provided_services.push(pinger);

    if (o.core_found && !o.core_lost) throw new Error("Roon Extension options .core_lost is required if you implement .core_found.");
    if (!o.core_found && o.core_lost) throw new Error("Roon Extension options .core_found is required if you implement .core_lost.");
    if (o.core_paired && !o.core_unpaired) throw new Error("Roon Extension options .core_unpaired is required if you implement .core_paired.");
    if (!o.core_paired && o.core_unpaired) throw new Error("Roon Extension options .core_paired is required if you implement .core_unpaired.");

    if (o.core_paired && o.core_found) throw new Error("Roon Extension options can not specify both .core_paired and .core_found.");

    if (o.required_services.length || o.optional_services.length)
	if (!o.core_paired && !o.core_found) throw new Error("Roon Extensions options has required or optional services, but is neither .core_paired nor .core_found.");

    if (o.core_found    && typeof(o.core_found)    != "function") throw new Error("Roon Extensions options has a .core_found which is not a function");
    if (o.core_lost     && typeof(o.core_lost)     != "function") throw new Error("Roon Extensions options has a .core_lost which is not a function");
    if (o.core_paired   && typeof(o.core_paired)   != "function") throw new Error("Roon Extensions options has a .core_paired which is not a function");
    if (o.core_unpaired && typeof(o.core_unpaired) != "function") throw new Error("Roon Extensions options has a .core_unpaired which is not a function");

    if (o.core_paired) {
	let svc = this.register_service("com.roonlabs.pairing:1", {
	    subscriptions: [
	    {
		subscribe_name:   "subscribe_pairing",
		unsubscribe_name: "unsubscribe_pairing",
		start: (req) => {
		    req.send_continue("Subscribed", { paired_core_id: this.paired_core_id });
		}
	    }
	    ],
	    methods: {
		get_pairing: (req) => {
		    req.send_complete("Success", { paired_core_id: this.paired_core_id });
		},
		pair: (req) => {
		    this.paired_core_id = req.moo.core.core_id;
		    svc.send_continue_all("subscribe_pairing", "Changed", { paired_core_id: this.paired_core_id  })
		},
	    }
	});

	this.pairing_service_1 = {
	    services: [ svc ],

	    found_core: core => {
		if (!this.paired_core_id) {
		    let settings = this.get_persisted_state();
		    settings.paired_core_id = core.core_id;
		    this.set_persisted_state(settings);

		    this.paired_core_id = core.core_id;
		    svc.send_continue_all("subscribe_pairing", "Changed", { paired_core_id: this.paired_core_id  })
		}
		if (core.core_id == this.paired_core_id)
		    if (this.extension_opts.core_paired) this.extension_opts.core_paired(core);
	    },
	    lost_core: core => {
		if (core.core_id == this.paired_core_id)
		    if (this.extension_opts.core_unpaired) this.extension_opts.core_unpaired(core);
	    },
	};
	o.provided_services.push(this.pairing_service_1);
    }

    this.extension_opts = o;

    this.extension_reginfo = {
        extension_id:      o.extension_id,
        display_name:      o.display_name,
        display_version:   o.display_version,
        publisher:         o.publisher,
        email:             o.email
    };

    this.extension_reginfo.required_services = []; o.required_services.forEach(svcobj => { svcobj.services.forEach(svc => { this.extension_reginfo.required_services.push(svc.name); }); });
    this.extension_reginfo.optional_services = []; o.optional_services.forEach(svcobj => { svcobj.services.forEach(svc => { this.extension_reginfo.optional_services.push(svc.name); }); });
    this.extension_reginfo.provided_services = []; o.provided_services.forEach(svcobj => { svcobj.services.forEach(svc => { this.extension_reginfo.provided_services.push(svc.name); }); });

    if (o.website) this.extension_reginfo.website = o.website;
    return this;
};

RoonApi.prototype.connect = function() {
    var host, cb;

    var i = 0;
    host = arguments[i++];
    if (typeof(arguments[i]) != "function") host += ":" + arguments[i++];
    cb = arguments[i++];

    var ret = {
        ws: new WebSocket('ws://' + host + '/api')
    };
    if (typeof(window) != "undefined") ret.ws.binaryType = 'arraybuffer';

    ret.ws.onopen = () => {
//        console.log("OPEN");
        ret.moo = new Moo(ret.ws);

        ret.moo.send_request("com.roonlabs.registry:1/info",
			 (msg, body) => {
			     if (!msg) return;
			     let s = this.get_persisted_state();
			     if (s.tokens && s.tokens[body.core_id]) this.extension_reginfo.token = s.tokens[body.core_id];
			
			     ret.moo.send_request("com.roonlabs.registry:1/register", this.extension_reginfo,
					      (msg, body) => {
						  if (!msg) { // lost connection
						      if (ret.moo.core) {
							  if (this.pairing_service_1)        this.pairing_service_1.lost_core(ret.moo.core);
							  if (this.extension_opts.core_lost) this.extension_opts.core_lost(ret.moo.core);
							  ret.moo.core = undefined;
						      }
						  } else if (msg.name == "Registered") {
						      ret.moo.core = new Core(ret.moo, this, body);

						      let settings = this.get_persisted_state();
						      if (!settings.tokens) settings.tokens = {};
						      settings.tokens[body.core_id] = body.token;
						      this.set_persisted_state(settings);

						      if (this.pairing_service_1)         this.pairing_service_1.found_core(ret.moo.core);
						      if (this.extension_opts.core_found) this.extension_opts.core_found(ret.moo.core);
						  }
					      });
			 });
    };

    ret.ws.onclose = () => {
//        console.log("CLOSE");
	if (ret.moo) ret.moo.close();
	ret.moo = undefined;
        cb && cb();
    };

    ret.ws.onerror = err => {
//        console.log("ERROR", e);
//
        Object.keys(this._service_request_handlers).forEach(e => this._service_request_handlers[e] && this._service_request_handlers[e](null));
	if (ret.moo) ret.moo.close();
	ret.moo = undefined;
        ret.ws.close();
        cb && cb();
    };

    ret.ws.onmessage = event => {
//        console.log("GOTMSG");
	if (!ret.moo) return;
        var msg = ret.moo.parse(event.data);
        if (!msg) return;
        var body = msg.body;
        delete(msg.body);
        if (msg.verb == "REQUEST") {
            console.log('<-', msg.verb, msg.request_id, msg.service + "/" +  msg.name, body ? JSON.stringify(body) : "");
            var req = new MooMessage(ret.moo, msg, body);
            var handler = this._service_request_handlers[msg.service];
            if (handler)
                handler(req);
            else
                req.send_complete("InvalidRequest", { error: "unknown service: " + msg.service });
        } else {
            console.log('<-', msg.verb, msg.request_id, msg.name, body ? JSON.stringify(body) : "");
            ret.moo.handle_response(msg, body);
        }
    };

    return ret;
};

exports = module.exports = RoonApi;
