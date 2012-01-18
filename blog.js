var path    = require('path');
var fs      = require('fs');
var options = require('optimist').argv;
var winston = require('winston');

global.settings = JSON.parse(fs.readFileSync('settings.json', 'utf-8'));
settings.root   = __dirname.replace(/\/+$/, "");

global.cache    = { posts: {}, tags: {}, menus: {}, order: [], checksums: {} };
global.logger   = new (winston.Logger)({
  exitOnError: false,
  transports:  [
    new (winston.transports.File)({
      handleExceptions: true,
      filename: settings.errorLog
    })
  ]
})

// These have to be included after we parse the settings file
var utils   = require('./libs/utils');
var server  = require('./libs/server');
var client  = require('./libs/client');

// Settings file checksum
utils.updateFile(fs.ReadStream(path.join(settings.root, 'settings.json')), path.join(settings.root, 'settings.json'));

var counter = 0;

console.log("Updating local files cache ...");
settings.contentDirs.forEach(function(dir){
  utils.crawl(path.join(settings.root, dir), function(filepath){
    counter++;
    utils[filepath.substr(-2).toLowerCase() === 'md' ? 'updatePost' : 'updateFile'](fs.ReadStream(filepath), filepath, {}, function(){
   
      if(--counter === 0){
        if(options.p || options.publish) {
          client.publish();
        }
        else if(options.s || options.serve) {
          require('http').createServer(server).listen(settings.port);
          console.log("Serving this blog on " + settings.server + ":" + settings.port);
        }
        else {
          console.log("");
          console.log("Usage:");
          console.log("");
          console.log("blog.js --serve (-s) to start the server.");
          console.log("blog.js --publish (-p) to publish your latest changes.");
          console.log("Edit settings.json to change settings.");
          console.log("");
        }
      }
      
    });
  });
});