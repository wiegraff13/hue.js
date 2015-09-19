var async = require('async');
var request = require('request');
var dgram = require('dgram');
var semver = require('semver');
var xml = require('xml2js');

var packet = [
  'M-SEARCH * HTTP/1.1',
  'HOST:239.255.255.250:1900',
  'MAN:"ssdp:discover"',
  'ST:ssdp:all',
  'MX:1',
  ''
].join('\r\n');

module.exports = Discoverer;

function Discoverer() {
    var _this = this;
    this.found = [];
    var socketType = semver.gte(process.version, '4.0.0') ? {type: 'udp4', reuseAddr: true} : 'udp4';
    this.client = dgram.createSocket(socketType);
    this.server = dgram.createSocket(socketType);

    this.client.bind(function () {
        _this.client.setMulticastTTL(2);
        _this.server.bind(_this.client.address().port);
    });

    this.server.on('message', handleUDPResponse);

    this.handleSearchResults = function (cb) {
        async.map(_this.found, hueFinder, function (err, results) {
            cb(results.filter(function (item, index, arr) {
                return item;
            }));
        });
    }

    this.search = function () {
        var message = new Buffer(packet);
        _this.client.send(message, 0, message.length, 1900, '239.255.255.250');
    }

    function handleUDPResponse(msg, rinfo) {
        var regex = /^LOCATION(?:.*)description[.]xml$/m;
        if (regex.test(msg))
            if (_this.found.indexOf(rinfo.address) === -1)
                _this.found.push(rinfo.address);
    }

    function hueFinder(server, cb) {
        request('http://' + server + '/description.xml', function (e, r, b) {
            if (!b)
                return cb();
            xml.Parser({
                explicitRoot: false,
                explicitArray: false
            }).parseString(b, function (error, result) {
                if (error)
                    return cb(error);
                else if (/Philips hue bridge/g.test(b))
                    return cb(null, { address: server, info: result });
                else
                    return cb();
            });
        });
    };
}

Discoverer.prototype.discover = function (cb) {
    this.search();
    setTimeout(this.handleSearchResults, 2000, cb);
}