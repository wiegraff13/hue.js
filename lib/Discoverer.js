var async = require('async');
var request = require('request');
var dgram = require('dgram');
var semver = require('semver');
var xml = require('xml2js');

var packet = [
  'M-SEARCH * HTTP/1.1',
  'HOST:239.255.255.250:1900',
  'MAN:"ssdp:discover"',
  'ST:urn:schemas-upnp-org:device:Basic:1',
  'MX:1',
  ''
].join('\r\n');

module.exports = Discoverer;

function Discoverer() {
    var _this = this;
    this.found = [];
    this.checkedBroker = false;
    var socketType = semver.gte(process.version, '4.0.0') ? {type: 'udp4', reuseAddr: true} : 'udp4';
    this.client = dgram.createSocket(socketType);
    this.server = dgram.createSocket(socketType);

    this.client.bind(function () {
        _this.client.setMulticastTTL(2);
        _this.server.bind(_this.client.address().port);
    });

    this.server.on('message', handleUDPResponse);

    this.checkBrokerServer = function (cb) {
        this.checkedBroker = true;
        request('http://www.meethue.com/api/nupnp', function (e, r, b) {
            if (e)
                console.log('broker error', e);
            if (b) {
                var bridgeData = JSON.parse(b);
                for (var idx in bridgeData) {
                    var ipAddress = bridgeData[idx].internalipaddress;
                    if (_this.found.indexOf(ipAddress) === -1)
                        _this.found.push(ipAddress);
                }
            }
            if (_this.found.length > 0)
                _this.handleSearchResults(cb);
            else
                cb([]);
        });
    }

    this.handleSearchResults = function (cb) {
        var retry = function(attempts) {
            async.map(_this.found, hueFinder, function (err, results) {
                if (err && err.code === 'ECONNRESET' && attempts <= 3) {
                    setTimeout(retry, 1000, attempts + 1);
                    return;
                }
                if (_this.found.length === 0 && !_this.checkingBroker)
                    _this.checkBrokerServer(cb);
                else {
                    _this.checkedBroker = false;
                    cb(results.filter(function (item, index, arr) { return item; }));
                }
            });
        }.bind(this);
        retry(1);
    }

    this.search = function () {
        var message = new Buffer(packet);
        _this.client.send(message, 0, message.length, 1900, '239.255.255.250');
    }

    function handleUDPResponse(msg, rinfo) {
        var regex = /^LOCATION:\shttp:\/\/\d{1,3}[.]\d{1,3}[.]\d{1,3}[.]\d{1,3}(?:[:]\d+)\/description.xml$/m;
        if (regex.test(msg)) {
            if (_this.found.indexOf(rinfo.address) === -1)
                _this.found.push(rinfo.address);
        }
    }

    function hueFinder(server, cb) {
        request('http://' + server + '/description.xml', function (e, r, b) {
            if (e)
                return cb(e);
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
    setTimeout(this.handleSearchResults, 10000, cb);
}