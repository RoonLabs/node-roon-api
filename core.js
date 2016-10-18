"use strict";

function Core(moo, roon, registration) {
    this.moo = moo;
    this.core_id = registration.core_id;
    this.display_name = registration.display_name;
    this.display_version = registration.display_version;
    this.services = {};

    var svcs = {};
    roon.services_opts.required_services.forEach(svcobj => svcobj.services.forEach(svc => svcs[svc.name] = svcobj));
    roon.services_opts.optional_services.forEach(svcobj => svcobj.services.forEach(svc => svcs[svc.name] = svcobj));
    registration.provided_services.forEach(e => { this.services[svcs[e].name] = new svcs[e](this); });
};

exports = module.exports = Core;
