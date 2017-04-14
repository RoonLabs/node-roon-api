[![Gitter Chat](https://img.shields.io/badge/gitter-%20chat%20%E2%86%92-blue.svg)](https://gitter.im/RoonLabs/node-roon-api)
![Status](https://img.shields.io/badge/status-beta-red.svg)
[![LICENSE](https://img.shields.io/badge/license-Apache%20License%202.0-yellow.svg)](https://github.com/RoonLabs/node-roon-api/blob/master/LICENSE)
# Roon API for Javascript: An overview and tutorial
------------

JSDoc Documentation: https://roonlabs.github.io/node-roon-api/

## Getting started

1. This Roon API for Javascript is called `node-roon-api`, because it has
complete functionality in the [Node.js](https://nodejs.org/) environment, but
it also works in a [web browser](#using-roon-api-in-a-web-browser).

1. Install Node.js from https://nodejs.org/.

   * On Windows, install from the above link.
   * On Mac OS, you can use [homebrew](http://brew.sh) to install Node.js.
   * On Linux, you can use your distribution's package manager, but make sure it installs a recent Node.js. Otherwise just install from the above link.

   Make sure you are running node 5.x or higher.
   ```sh
   node -v
   ```

   For example:

   ```sh
   $ node -v
   v5.10.1
   ```

1. Create a new extension folder
    ```sh
    mkdir roon-extension-test
    cd roon-extension-test
    ```

1. Initialize your package.json file and install the dependencies:
    ```sh
    cat << EOF > package.json
    {
        "name": "roon-extension-test",
        "version": "1.0.0",
        "description": "Roon Extension to test using Roon API",
        "main": "app.js",
        "author": "Elvis Presley",
        "license": "Apache-2.0",
        "dependencies": {
            "node-roon-api": "github:roonlabs/node-roon-api"
        }
    }
    EOF

    npm install
    ```

1. Create an `app.js` file in with the following contents:

    ```javascript
    var RoonApi = require("node-roon-api");

    var roon = new RoonApi({
        extension_id:        'com.elvis.test',
        display_name:        "Elvis's First Roon API Test",
        display_version:     "1.0.0",
        publisher:           'Elvis Presley',
        email:               'elvis@presley.com',
        website:             'https://github.com/elvispresley/roon-extension-test'
    });
    
    roon.init_services({});

    roon.start_discovery();
    ```

1. Run it!
    ```bash
    node .
    ```

    This extension does nothing right now, but it should appear in Roon now.
    See Settings->Setup->Extensions and you should see it in the list. If you
    have multiple Roon Cores on the network, all of them should see it.

## Connecting to a Roon Core

The extension must declare it's own information using the `RoonApi`
constructor. When your extension connects to Roon, it will register itself with
this information.

Roon extensions are meant to discover Roon Cores, to avoid having to have the
end user point them at a running Roon Core via IP address.
`RoonApi::start_discovery()` will start watching for any Roon Cores that might be
running on the network, and will connect to them automatically.

If the extension uses any services from Roon (note that our test extension
above does not use any services), those services must be granted access by the
user by hitting "Enable" in Roon's Settings. If it uses no services, then Roon
will auto-authorize the extension.

Once the extension has been authorized (or auto-authorized), Roon will pass
back a token that represents that authorization. The Roon API will
automatically persist this across runs.

If Roon previously authorized the extension, the token is passed and
Roon will validate that the authorization still exists.

Your extension can be connected to multiple Roon Cores at once, but if your
extension really wants to be connected to only 1 Roon Core, then you should
using the [pairing](#pairing) functionality.

## Services

Roon extensions can _use_ and/or _provide_ **services**. This works a bit
differently than most APIs out there.

Using a **service** is probably what one first thinks of when using the Roon
API. If an extension wants to tell Roon to change the volume or pause the
music, it will use the transport service that Roon provides.

Providing a **service** is when an extension tells Roon that it has some
functionality it can provide, and if Roon desires, it can use it.

**Services** provided by Roon, and used by an extension include:

* **[browsing](http://github.com/roonlabs/node-roon-api-browse)**

    This service let's an extension browse Roon's music library (and more) in a
simple list orient manner, and even do common actions like play music.

* **[image downloading](http://github.com/roonlabs/node-roon-api-image)**

    This service let's an extension download an image related to artist photos,
album artwork, or other images in the Roon databases.

* **[transport](http://github.com/roonlabs/node-roon-api-transport)**

    This service let's an extension manage and control zones. This includes
actions such as zone grouping, transport controls (play, pause, next, prev,
etc...), volume control, standby, etc...

* _more..._


**Services** provided by an extension and used by Roon:

* **ping**

    The Node.js Roon API automatically provides this API. Roon will notice this
and periodically ping the extension over the network to make sure the extension
is available. This helps Roon provide a better experience on less than
ideal networks.

* **[status](http://github.com/roonlabs/node-roon-api-status)**

    Implementing this service in an extension enables it to be able to
provide a small status message to Roon about the status of the extension.

    Roon will display this status along with the information about the
extension in the extensions listing inside Roon Settings.

    For example, the [Roon extension for the Griffin Powermate USB
knob](http://github.com/roonlabs/roon-extension-powermate) will let Roon
know if the USB device is plugged in or not plugged in using this service.


* **[settings](http://github.com/roonlabs/node-roon-api-settings)**

    Many extensions will want to have some simple actions and/or configuration.
Roon can use a **settings service** provided by an extension to display a UI
inside the Roon Settings screens that is defined by the extension.

* **[volume control](http://github.com/roonlabs/node-roon-api-volume-control)** and **[source control](http://github.com/roonlabs/node-roon-api-source-control)**

    Audio devices that are [Roon
Ready](https://kb.roonlabs.com/Roon_partner_programs#Roon_Ready), allow Roon's
user interface on all remotes to send volume commands directly to the hardware,
for the most accurate and high quality volume control. Roon will also
convenience switch the inputs of Roon Ready devices with multiple source
inputs, and support standby functionality in-app.

    However, if you have a device that is not Roon Ready, then providing these
two services in your extension can allow you to enable this functionality to
Roon via Serial/RS232, Infrared, network, or some other mechanism, without
hardware Roon support.

## Pairing

Most extensions that use services will want to communicate with one Roon Core
at a time.

Pairing works by allowing all Roon Cores on the network to show the extension
in the Settings, but only one Roon Core can be "paired" to the extension.

For example, the [Roon extension for the Griffin Powermate USB
knob](http://github.com/roonlabs/roon-extension-powermate) is an extension that
modifies the volume of a zone when a USB knob is rotated. If you ran this
extension on a network with multiple Roon Cores, it wouldn't know which Roon
Core to control.

With pairing, initial authorization of the extension will automatically pair
that Roon Core with this extension. Future connections to the same Roon Core
will auto-pair. If you then click 'Enable' on a second Roon core, the pairing
will change to the second Roon Core and the knob will begin to control it
instead. If you then look at the first Roon Core, the authorization still
exists, but instead of seeing an "Enable" button, the user will see a "Pair"
button, which will move the pairing back to the first Roon Core.

On a network with 1 Roon Core, this pairing mechanism is very simple and
completely transparent to the user. But on a network with multiple Roon Cores,
it provides a mechanism that is easy to use, while relieving the extension
author of the responsibility of having to create a user interface to select a
Roon Core.

## Providing a service

1. Let's make our test extension report a status to Roon.

   Make sure your `package.json` file's `dependencies` section looks like this now:

   ```javascript
   "dependencies": {
       "node-roon-api":        "github:roonlabs/node-roon-api",
       "node-roon-api-status": "github:roonlabs/node-roon-api-status"
   }
   ```

   and be sure to install the module:

   ```sh
   npm install
   ```

   Let's modify the app.js to provide the **status service**.

   ```javascript
   var RoonApi       = require("node-roon-api"),
       RoonApiStatus = require("node-roon-api-status");

   var roon = new RoonApi({
       extension_id:        'com.elvis.test',
       display_name:        "Elvis's First Roon API Test",
       display_version:     "1.0.0",
       publisher:           'Elvis Presley',
       email:               'elvis@presley.com',
       website:             'https://github.com/elvispresley/roon-extension-test',
   });

   var svc_status = new RoonApiStatus(roon);

   roon.init_services({
       provided_services: [ svc_status ]
   });

   svc_status.set_status("All is good", false);

   roon.start_discovery();
   ```

2. The `provided_services` field when calling the `RoonApi::init_services()`
let's Roon know you have are providing service. Above, we pass an instance of
`RoonApiStatus`, which enables Roon to show a status message below the extension
information in Roon Settings. 

The `RoonApiStatus::set_status()` method notifies the connected Roon Cores
know of the new status. The second argument is true if the status is an error,
and false if it is neutral or good.


## Using a service

1. Let's make our test extension list all the zones.

   Make sure your `package.json` file's `dependencies` section looks like this now:

   ```javascript
   "dependencies": {
       "node-roon-api":           "github:roonlabs/node-roon-api",
       "node-roon-api-status":    "github:roonlabs/node-roon-api-status",
       "node-roon-api-transport": "github:roonlabs/node-roon-api-transport"
   }
   ```
   and be sure to install the module:

   ```sh
   npm install
   ```

   Let's modify the app.js to use the **transport service**.

   ```javascript
   var RoonApi          = require("node-roon-api"),
       RoonApiStatus    = require("node-roon-api-status"),
       RoonApiTransport = require("node-roon-api-transport");

   var roon = new RoonApi({
       extension_id:        'com.elvis.test',
       display_name:        "Elvis's First Roon API Test",
       display_version:     "1.0.0",
       publisher:           'Elvis Presley',
       email:               'elvis@presley.com',
       website:             'https://github.com/elvispresley/roon-extension-test',

       core_paired: function(core) {
           let transport = core.services.RoonApiTransport;
           transport.subscribe_zones(function(cmd, data) {
                                         console.log(core.core_id,
                                                     core.display_name,
                                                     core.display_version,
                                                     "-",
                                                     cmd,
                                                     JSON.stringify(data, null, '  '));
                                     });
       },

       core_unpaired: function(core) {
                      console.log(core.core_id,
                              core.display_name,
                              core.display_version,
                              "-",
                              "LOST");
                  }
   });

   var svc_status = new RoonApiStatus(roon);

   roon.init_services({
       required_services: [ RoonApiTransport ],
       provided_services: [ svc_status ],
   });

   svc_status.set_status("All is good", false);

   roon.start_discovery();
   ```

2. In addition to providing the
   [status](http://github.com/roonlabs/node-roon-api-status) service, we also
   specify here that we require the
   [transport](http://github.com/roonlabs/node-roon-api-transport) service.

   Additionally, you see above that the `RoonApi` constructor can be passed
   `core_paired` and `core_unpaired` members, which will be called when Roon
   Cores are paired or unpaired.

   When you get a hold of a core, you can use the
[transport service's](http://github.com/roonlabs/node-roon-api-transport)
functionality via `core.services.RoonApiTransport`.

    In this example, we subscribe to the zone listing and print
the subscription messages sent to us from the Roon Core. This will print a
list of zones at subscription time, and any modification to the zones listing
that happen while we are connected.

## Working with multiple Roon Cores

In the above examples, the extension provided the `core_paired` function to get
access to the Roon Cores that it was paired with.

When you provide `core_paired` and `core_unpaired`, you are notified only of
the Roon Core you are paired with.

If you want to be notified of all the Roon Cores, and disable the pairing
functionality, you can provide `core_found` and `core_lost` instead.

Those functions will be called with every Roon Core discovered (after the
extension is authorized or auto-authorized), and no "Pair" button will ever be
shown by Roon.

**Normally, you don't want to use `core_found` and `core_lost`, and
instead you want to use Roon API's [pairing](#pairing) functionality.**

## Using Roon API in a Web Browser

The Roon API for Javascript uses web browser friendly networking to speak to
Roon, so the API works inside a web browser like Chrome, Safari, IE, and
FireFox.

The big exception in functionality is discovery. Roon's discovery protocol uses
UDP networking packets, and the web browsers don't have access to that. To get
around this, instead of using `RoonApi:start_discovery()`, you can use
`RoonApi::connect(host, [port], [close_cb])`. You will have to pass the IP
address or hostname of your Roon Core to this method, and optionally you can
pass port number and/or a callback to call upon disconnection (for retrying the
connection). Unfortunately, this means your web app will probably need an input
for the IP address of the Roon Core.

The best way to use this API is to use [browserify](http://browserify.org/) +
[partialify](https://github.com/bclinkinbeard/partialify) to combine your
html/js/css and the entire Roon API into 1 large `bundle.js` file.

For an example, see the [web test
app](http://github.com/roonlabs/roon-extension-web-testapp).

