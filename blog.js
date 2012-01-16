var path    = require('path');
var fs      = require('fs');
var options = require('optimist').argv;

global.cache    = { posts: {}, tags: {}, menus: {}, order: [], checksums: {} };
global.settings = JSON.parse(fs.readFileSync('settings.json', 'utf-8'));

// These have to be included after we parse the settings file
var utils   = require('./libs/utils');
var server  = require('./libs/server');
var client  = require('./libs/client');

if(options.p || options.publish) {
  client.publish();
}
else if(options.s || options.serve) {
  var checksums, files; 
  
  console.log("Updating posts ...");
  fs.readdirSync(path.join(__dirname, 'posts'))
    .filter(function(f){ 
      return f.substr(-2).toLowerCase() === 'md'; 
    })
    .forEach(function(filename){ 
      utils.updatePost(fs.ReadStream(path.join(__dirname, 'posts', filename)), 'posts/' + filename); 
    });
  
  console.log("Updating static files and templates ...");  
  ['templates', 'static'].forEach(function(dir){
    fs.readdirSync(path.join(__dirname, dir))
      .filter(function(filename){ 
        return filename[0] !== '.'; 
      })
      .forEach(function(filename){ 
        utils.updateFile(fs.ReadStream(path.join(__dirname, dir, filename)), dir + '/' + filename); 
      });
  });

  // Settings file checksum
  utils.updateFile(fs.ReadStream(path.join(__dirname, 'settings.json')), 'settings.json'); 
  
  require('http').createServer(server).listen(global.settings.port);
  console.log("Serving this blog on " + global.settings.server + ":" + global.settings.port);
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