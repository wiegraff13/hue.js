var Hue = require('./lib/Hue');

exports.discoverer = require('./lib/Discoverer');

exports.createClient = function(config) {
  return new Hue(config);
};