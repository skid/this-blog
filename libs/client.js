var settings  = global.settings;
var cache     = global.cache;
var mime      = require('mime');
var http      = require('http');
var path      = require('path');
var fs        = require('fs');
var utils     = require('./utils');
var reqOpts   = {
  connection: "Keep-Alive",
  method:     "GET",
  host:       settings.server,
  port:       settings.port,
  path:       settings.adminUrl,
}

/**
 * Extend mime lookup with some types that we use in This Blog
 */
function lookupMime(filename){
  switch(filename.split(".").pop().toLowerCase()) {
    case "md":
      return 'text/markdown';
      break;
    case "less":
      return 'text/less';
      break;
    case "js":
      return 'text/javascript';
      break;
   default:
      return mime.lookup(filename);
      break;
  }
}

/**
 * Calculates which files need to be uploaded or removed from the remote instance.
 * Uploads or deletes those files from remote instance.
 */
function upload(remoteChecksums) {
  var i, send = {};
  for(i in cache.checksums) {
    if(!(i in remoteChecksums) || remoteChecksums[i] !== cache.checksums[i]) {
      send[i] = cache.checksums[i];
      delete remoteChecksums[i];
    }
    else if(i in remoteChecksums) {
      delete remoteChecksums[i];
    }
  }
  
  // Remove
  Object.keys(remoteChecksums).forEach(function(filename){
    console.log("DELETE " + filename);
    
    var options = utils.extend(reqOpts, { method: "DELETE", headers: { password: settings.password, filename: filename } });
    
    var req = http.request(options, function(res){
      var data = "";
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function(){ console.log(data); });
    });
    req.on('error', function(e){
      console.log("An error happened while deleting file " + filename + "; Try publishing again.");
      console.log(e);
    });
    req.end();
  });

  // Send
  Object.keys(send).forEach(function(filename){
    var filepath = path.normalize(__dirname + '/../' + filename);    
    fs.stat(filepath, function(error, stat) {
      if (error) {
        console.log("Error with local file: " + filename);
        console.log(error);
      }
      else {
        var options = utils.extend(reqOpts, { 
          "method":   "PUT", 
          "headers":  { 
            "content-length": stat.size,
            "content-type":   lookupMime(filename),
            "password":       settings.password, 
            "filename":       filename 
        }});
        var req = http.request(options, function(res){
          var data = "";
          res.on('data', function (chunk) { data += chunk; });
          res.on('end', function(){ console.log( data ); });
        });
        req.on('error', function(e){
          console.log("An error happened while sending file " + filename + "; Try publishing again.");
          console.log(e);
        });
        fs.ReadStream(filepath).pipe(req);
      }
    });    
  });
}

exports.publish = function(){
  var counter = 0;
  var options = utils.extend(reqOpts, { headers: { password: settings.password, filename: "" } });
  
  // Executed once when all checksums are calculated.
  // Shoots a request to get the remote checksums, compares them and does the rest of the job.
  function makeRequest(){
    if(--counter) {
      return;
    }
    var req = http.request(options, function(res){
      var data = "";
      res.on('data', function (chunk) { 
        data += chunk; 
      });
      res.on('end', function(){ 
        upload( JSON.parse(data) ); 
      });
    })
    req.on('error', function(e){
      console.log("An error happened while getting the remote checksums; Try publishing again or check if your server is online.");
      console.log(e);
      process.exit(1);
    });
    req.end();
  };
  
  // Reads all local files, calculates checksums and calls makeRequest, which takes over
  ['templates', 'static', 'posts'].forEach(function(dir){
    fs.readdirSync(path.normalize(__dirname + '/../' + dir))
      .filter(function(filename){ 
        return filename[0] !== '.'; 
      })
      .forEach(function(filename){
        ++counter;
        utils.updateChecksum(fs.ReadStream(path.normalize(__dirname + '/../' + dir + '/' + filename)), dir + '/' + filename, makeRequest);    
      });
  });
}