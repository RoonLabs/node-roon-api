"use strict";

/**
Roon API.                                   
 * @class RoonApi
 * @param {object} desc - Information about your extension. Used by Roon to display to the end user what is trying to access Roon.
 * @param {string} desc.extension_id - A unique ID for this extension. Something like @com.your_company_or_name.name_of_extension@.
 * @param {string} desc.display_name - The name of your extension.
 * @param {string} desc.display_version - A version string that is displayed to the user for this extension. Can be anything you want.
 * @param {string} desc.publisher - The name of the developer of the extension.
 * @param {string} desc.website - Website for more information about the extension.
 * @param {string} desc.log_level - How much logging information to print.  "all" for all messages, "none" for no messages, anything else for all messages not tagged as "quiet" by the Roon core.
 * @param {string} desc.force_server - Force app into NodeJS mode (usaully can auto-detect, but may not be able to do it properly in Electron).
 * @param {RoonApi~core_paired} [desc.core_paired] - Called when Roon pairs you.
 * @param {RoonApi~core_unpaired} [desc.core_unpaired] - Called when Roon unpairs you.
 * @param {RoonApi~core_found} [desc.core_found] - Called when a Roon Core is found. Usually, you want to implement pairing instead of using this.
 * @param {RoonApi~core_lost} [desc.core_lost] - Called when Roon Core is lost. Usually, you want to implement pairing instead of using this.
 * @param {RoonApi~onerror} [desc.moo_onerror] - Called when there is an error on the connection to a core.
 * @param {string} [desc.configDir] - The directory to store configuration files.
 */
/**
 * @callback RoonApi~core_paired
 * @param {Core} core
 */
/**
 * @callback RoonApi~core_unpaired
 * @param {Core} core
 */
/**
 * @callback RoonApi~core_found
 * @param {Core} core
 */
/**
 * @callback RoonApi~core_lost
 * @param {Core} core
 */

/**
 * @callback RoonApi~onclose
 */

/**
 * @callback RoonApi~onerror
 * @param {Moo} moo connection object
 */

var WSTransport = require('./transport-websocket.js'),
    Moo         = require('./moo.js'),
    MooMessage  = require('./moomsg.js'),
    Core        = require('./core.js'),
    os          = require('os');

function Logger(roonapi) {
    this.roonapi = roonapi;
};

Logger.prototype.log = function() {
    if (this.roonapi.log_level != "none") {
        console.log.apply(null, arguments);
    }
};

function RoonApi(o) {
    this._service_request_handlers = {};

    if (typeof(o.extension_id)    != 'string') throw new Error("Roon Extension options is missing the required 'extension_id' property.");
    if (typeof(o.display_name)    != 'string') throw new Error("Roon Extension options is missing the required 'display_name' property.");
    if (typeof(o.display_version) != 'string') throw new Error("Roon Extension options is missing the required 'display_version' property.");
    if (typeof(o.publisher)       != 'string') throw new Error("Roon Extension options is missing the required 'publisher' property.");
    if (typeof(o.email)           != 'string') throw new Error("Roon Extension options is missing the required 'email' property.");

    if (typeof(o.set_persisted_state) == 'undefined')
        this.set_persisted_state = state => { this.save_config("roonstate", state); };
    else
        this.set_persisted_state = o.set_persisted_state;

    if (typeof(o.get_persisted_state) == 'undefined')
        this.get_persisted_state = () => { return this.load_config("roonstate") || {}; };
    else
        this.get_persisted_state = o.get_persisted_state;

    if (o.core_found && !o.core_lost) throw new Error("Roon Extension options .core_lost is required if you implement .core_found.");
    if (!o.core_found && o.core_lost) throw new Error("Roon Extension options .core_found is required if you implement .core_lost.");
    if (o.core_paired && !o.core_unpaired) throw new Error("Roon Extension options .core_unpaired is required if you implement .core_paired.");
    if (!o.core_paired && o.core_unpaired) throw new Error("Roon Extension options .core_paired is required if you implement .core_unpaired.");

    if (o.core_paired && o.core_found) throw new Error("Roon Extension options can not specify both .core_paired and .core_found.");

    if (o.core_found    && typeof(o.core_found)    != "function") throw new Error("Roon Extensions options has a .core_found which is not a function");
    if (o.core_lost     && typeof(o.core_lost)     != "function") throw new Error("Roon Extensions options has a .core_lost which is not a function");
    if (o.core_paired   && typeof(o.core_paired)   != "function") throw new Error("Roon Extensions options has a .core_paired which is not a function");
    if (o.core_unpaired && typeof(o.core_unpaired) != "function") throw new Error("Roon Extensions options has a .core_unpaired which is not a function");
    if (o.moo_onerror && typeof(o.moo_onerror) != "function") throw new Error("Roon Extensions options has a .moo_onerror which is not a function");

    this.extension_reginfo = {
        extension_id:      o.extension_id,
        display_name:      o.display_name,
        display_version:   o.display_version,
        publisher:         o.publisher,
        email:             o.email,
        required_services: [],
        optional_services: [],
        provided_services: []
    };
    if (o.website) this.extension_reginfo.website = o.website;

    this.logger = new Logger(this);
    this.log_level = o.log_level;
    this.extension_opts = o;
    this.is_paired = false;
    this.configDir = o.configDir;

    // - pull in Sood and provide discovery methods in Node, but not in WebBrowser
    //
    // - implement save_config/load_config based on:
    //      Node:       require('fs')
    //      WebBrowser: localStroage
    //
    if (o.force_server || typeof(window) == "undefined" || typeof(nw) !== "undefined") {
        /**
        * Begin the discovery process to find/connect to a Roon Core.
        */
        RoonApi.prototype.start_discovery = function() {
            if (this._sood) return;
            this._sood = require('./sood.js')(this.logger);
            this._sood_conns = {};
            this._sood.on('message', msg => {
                //this.logger.log(msg);
                if (msg.props.service_id == "00720724-5143-4a9b-abac-0e50cba674bb" && msg.props.unique_id) {
                    if (this._sood_conns[msg.props.unique_id]) {
                        return;
                    }

                    let ip = msg.from.ip;
                    let ni = os.networkInterfaces();
                    for (let prot in ni) {
                        for (let addr of ni[prot]) {
                            if (ip === addr.address) {
                                ip = '127.0.0.1';
                                break
                            }
                        }
                    }

                    this._sood_conns[msg.props.unique_id] = this.ws_connect({
                        host: ip,
                        port: msg.props.http_port,
                        onclose: () => {
                            delete(this._sood_conns[msg.props.unique_id]);
                        },
                        onerror: (moo) => {
                            if (this.extension_opts.moo_onerror) this.extension_opts.moo_onerror(moo);
                        }
                    });
                }
            });
            this._sood.on('network', () => {
                this._sood.query({ query_service_id: "00720724-5143-4a9b-abac-0e50cba674bb" });
            });
            this._sood.start(() => {
                this._sood.query({ query_service_id: "00720724-5143-4a9b-abac-0e50cba674bb" });
                setInterval(() => this.periodic_scan(), (10 * 1000));
                this.scan_count = -1;
            });
        };

        RoonApi.prototype.periodic_scan = function() {
            this.scan_count += 1;
            if (this.is_paired) return;
            if ((this.scan_count < 6) || ((this.scan_count % 6) == 0)) {
                this._sood.query({ query_service_id: "00720724-5143-4a9b-abac-0e50cba674bb" });
            }
        };

        var fs = ((typeof _fs) === 'undefined') ? require('fs') : _fs;

        /**
        * Save a key value pair in the configuration data store.
        * @param {string} key
        * @param {object} value
        */
        RoonApi.prototype.save_config = function(k, v) {
            try {
                let config;
                let configPath = this.configDir ? this.configDir + "/config.json" : "config.json";
                try {
                    let content = fs.readFileSync(configPath, { encoding: "utf8" });
                    config = JSON.parse(content) || {};
                } catch (e) {
                    config = {};
                } 
                if (v === undefined || v === null)
                    delete(config[k]);
                else
                    config[k] = v;
                fs.writeFileSync(configPath, JSON.stringify(config, null, "    "));
            } catch (e) { }
        };

        /**
        * Load a key value pair in the configuration data store.
        * @param {string} key
        * @return {object} value
        */
        RoonApi.prototype.load_config = function(k) {
            try {
                let configPath = this.configDir ? this.configDir + "/config.json" : "config.json";
                let content = fs.readFileSync(configPath, { encoding: "utf8" });
                return JSON.parse(content)[k];
            } catch (e) {
                return undefined;
            }
        };

    } else {
        RoonApi.prototype.save_config = function(k, v) {
            if (v === undefined || v === null)
                localStorage.removeItem(k);
            else
                localStorage.setItem(k, JSON.stringify(v));
        };
        RoonApi.prototype.load_config = function(k) {
            try {
                let r = localStorage.getItem(k);
                return r ? JSON.parse(r) : undefined;
            } catch (e) {
                return undefined;
            }
        };
    }


}

 /**
 * Initializes the services you require and that you provide.
 *
 * @this RoonApi
 * @param {object} services - Information about your extension. Used by Roon to display to the end user what is trying to access Roon.
 * @param {object[]} [services.required_services] - A list of services which the Roon Core must provide.
 * @param {object[]} [services.optional_services] - A list of services which the Roon Core may provide.
 * @param {object[]} [services.provided_services] - A list of services which this extension provides to the Roon Core.
 */
RoonApi.prototype.init_services = function(o) {
    if (!(o.required_services instanceof Array)) o.required_services = []; 
    if (!(o.optional_services instanceof Array)) o.optional_services = [];
    if (!(o.provided_services instanceof Array)) o.provided_services = [];

    if (o.required_services.length || o.optional_services.length)
	if (!this.extension_opts.core_paired && !this.extension_opts.core_found) throw new Error("Roon Extensions options has required or optional services, but has neither .core_paired nor .core_found.");

    if (this.extension_opts.core_paired) {
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
                    if (this.paired_core_id != req.moo.core.core_id) {
		        if (this.paired_core) {
                            this.pairing_service_1.lost_core(this.paired_core);
                            delete this.paired_core_id;
                            delete this.paired_core;
                        }
                        this.pairing_service_1.found_core(req.moo.core);
                    }
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
                    this.paired_core = core;
                    this.is_paired = true;
		    svc.send_continue_all("subscribe_pairing", "Changed", { paired_core_id: this.paired_core_id  })
		}
		if (core.core_id == this.paired_core_id)
		    if (this.extension_opts.core_paired) this.extension_opts.core_paired(core);
	    },
	    lost_core: core => {
		if (core.core_id == this.paired_core_id)
                    this.is_paired = false;
		    if (this.extension_opts.core_unpaired) this.extension_opts.core_unpaired(core);
	    },
	};
	o.provided_services.push(this.pairing_service_1);
    }

    o.provided_services.push({ services: [ this.register_service("com.roonlabs.ping:1", {
                                                        methods: {
                                                            ping: function(req) {
                                                                req.send_complete("Success");
                                                            },
                                                        }
                                                    })]})
    o.required_services.forEach(svcobj => { svcobj.services.forEach(svc => { this.extension_reginfo.required_services.push(svc.name); }); });
    o.optional_services.forEach(svcobj => { svcobj.services.forEach(svc => { this.extension_reginfo.optional_services.push(svc.name); }); });
    o.provided_services.forEach(svcobj => { svcobj.services.forEach(svc => { this.extension_reginfo.provided_services.push(svc.name); }); });

    this.services_opts = o;
};

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

                req.orig_send_complete = req.send_complete; 
                req.send_complete = function() {
                    this.orig_send_complete.apply(this, arguments);
                    delete(ret._subtypes[subname][req.moo.mooid][this.body.subscription_key]);
                };
		s.start(req);
                if (!ret._subtypes[subname].hasOwnProperty(req.moo.mooid)) {
                    ret._subtypes[subname][req.moo.mooid] = { };
                }
		ret._subtypes[subname][req.moo.mooid][req.body.subscription_key] = req;
	    };
	    spec.methods[s.unsubscribe_name] = (req) => {
		// XXX make sure req.body.subscription_key exists or respond send_complete with error
                delete(ret._subtypes[subname][req.moo.mooid][req.body.subscription_key]);
		if (s.end) s.end(req);
		req.send_complete("Unsubscribed");
	    };
	}
    }

    // process incoming requests from the other side
    this._service_request_handlers[svcname] = (req, mooid) => {
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
                    delete(ret._subtypes[subname][mooid]);
                    if (s.end) s.end(req);
                }
            }
        }
    };

    ret.name = svcname;
    ret.send_continue_all = (subtype, name, props) => {
        for (let id in ret._subtypes[subtype]) {
            for (let x in ret._subtypes[subtype][id]) (ret._subtypes[subtype][id][x].send_continue(name, props));
        }
    };
    ret.send_complete_all = (subtype, name, props) => {
        for (let id in ret._subtypes[subtype]) {
            for (let x in ret._subtypes[subtype][id]) (ret._subtypes[subtype][id][x].send_complete(name, props));
        }
    };
    return ret;
};

 /**
 * If not using Roon discovery, call this to connect to the Core via a websocket.
 *
 * @this RoonApi
 * @param {object}          options
 * @param {string}          options.host - hostname or ip to connect to
 * @param {number}          options.port - port to connect to
 * @param {RoonApi~onclose} [options.onclose] - Called once when connect to host is lost
 * @param {RoonApi~onerror} [options.onerror] - Called when there is a websocket error
 */
RoonApi.prototype.ws_connect = function({ host, port, onclose, onerror }) {
    let moo = new Moo(new WSTransport(host, port, this.logger));

    moo.transport.onopen = () => {
        //        this.logger.log("OPEN");

        moo.send_request("com.roonlabs.registry:1/info",
			     (msg, body) => {
			         if (!msg) return;
			         let s = this.get_persisted_state();
			         if (s.tokens && s.tokens[body.core_id]) this.extension_reginfo.token = s.tokens[body.core_id];
			         
			         moo.send_request("com.roonlabs.registry:1/register", this.extension_reginfo,
					                    (msg, body) => {
						                ev_registered.call(this, moo, msg, body);
					                    });
			     });
    };

    moo.transport.onclose = () => {
//        this.logger.log("CLOSE");
        Object.keys(this._service_request_handlers).forEach(e => this._service_request_handlers[e] && this._service_request_handlers[e](null, moo.mooid));
        moo.clean_up();
        onclose && onclose();
        onclose = undefined;
    };

    moo.transport.onerror = err => {
        this.logger.log("ERROR", err);
        onerror && onerror(moo);
    };

    moo.transport.onmessage = msg => {
//        this.logger.log("GOTMSG");
        var body = msg.body;
        delete(msg.body);
        var logging = msg && msg.headers && msg.headers["Logging"];
        msg.log = ((this.log_level == "all") || (logging != "quiet"));
        if (msg.verb == "REQUEST") {
            if (msg.log) this.logger.log('<-', msg.verb, msg.request_id, msg.service + "/" +  msg.name, body ? JSON.stringify(body) : "");
            var req = new MooMessage(moo, msg, body, this.logger);
            var handler = this._service_request_handlers[msg.service];
            if (handler)
                handler(req, req.moo.mooid);
            else
                req.send_complete("InvalidRequest", { error: "unknown service: " + msg.service });
        } else {
            if (msg.log) this.logger.log('<-', msg.verb, msg.request_id, msg.name, body ? JSON.stringify(body) : "");
            if (!moo.handle_response(msg, body)) {
                moo.transport.close(); // this will trigger the above onclose handler
            }
        }
    };

    return moo;
};

// DO NOT USE -- internal only
RoonApi.prototype.ws_connect_with_token = function({ host, port, token, onclose }) {
    var moo = this.ws_connect({ host, port, onclose })

    moo.transport.onopen = () => {
        let args = Object.assign({}, this.extension_reginfo);
        args.token = token;
        moo.send_request("com.roonlabs.registry:1/register_one_time_token", args,
                                   (msg, body) => {
				       ev_registered.call(this, moo, msg, body);
                                   });
    };

    return moo;
}

function ev_registered(moo, msg, body) {
    if (!msg) { // lost connection
	if (moo.core) {
	    if (this.pairing_service_1)        this.pairing_service_1.lost_core(moo.core);
	    if (this.extension_opts.core_lost) this.extension_opts.core_lost(moo.core);
	    moo.core = undefined;
	}
    } else if (msg.name == "Registered") {
	moo.core = new Core(moo, this, body, this.logger);

	let settings = this.get_persisted_state();
	if (!settings.tokens) settings.tokens = {};
	settings.tokens[body.core_id] = body.token;
	this.set_persisted_state(settings);

	if (this.pairing_service_1)         this.pairing_service_1.found_core(moo.core);
	if (this.extension_opts.core_found) this.extension_opts.core_found(moo.core);
    }
}

exports = module.exports = RoonApi;
