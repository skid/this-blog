var settings  = global.settings;
var cache     = global.cache;
var crypto    = require('crypto');
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
    case "md":    return 'text/markdown';
    case "less":  return 'text/less';
    case "js":    return 'text/javascript';
    default:      return mime.lookup(filename);
  }
}

/**
 * Calculates which files need to be uploaded or removed from the remote instance.
 * Uploads or deletes those files from remote instance.
 */
function upload(localChecksums, remoteChecksums) {
  var i, send = {};
  for(i in localChecksums) {
    if(!(i in remoteChecksums) || remoteChecksums[i] !== localChecksums[i]) {
      send[i] = localChecksums[i];
      delete remoteChecksums[i];
    }
    else if(i in remoteChecksums) {
      delete remoteChecksums[i];
    }
  }
  
  console.log("\nDeleting " + Object.keys(remoteChecksums).length + " items.");
  
  // Remove
  Object.keys(remoteChecksums).forEach(function(filename){
    var data = "", options = utils.extend(reqOpts, { method: "DELETE", headers: { password: settings.password, filename: filename } });
    
    var req = http.request(options, function(res){
      res.on('data', function (chunk) { 
        data += chunk; 
      });
      res.on('end', function(){ 
        console.log(data); 
      });
    });
    req.on('error', function(e){
      console.log("An error happened while deleting file " + filename + "; Try publishing again.");
      console.log("Error Code: " + e.code || e.errno);
    });
    req.end();
  });

  console.log("Uploading " + Object.keys(send).length + " items.\n");

  // Send
  Object.keys(send).forEach(function(filename){
    var filepath = path.normalize(__dirname + '/../' + filename);    
    
    fs.stat(filepath, function(e, stat) {
      var options, req, data = "";
      
      if (e) {
        console.log("Error with local file: " + filename);
        console.log("Error Code: " + e.code || e.errno);
        return;
      }
      options = utils.extend(reqOpts, { 
        "method":   "PUT", 
        "headers":  { 
          "content-length": stat.size,
          "content-type":   lookupMime(filename),
          "password":       settings.password, 
          "filename":       filename 
      }});
      req = http.request(options, function(res){
        res.on('data', function (chunk) { 
          data += chunk; 
        });
        res.on('end', function(){ 
          console.log( data ); 
        });
      });
      req.on('error', function(e){
        console.log("An error happened while sending file " + filename + "; Try publishing again.");
        console.log("Error Code: " + e.code || e.errno);
      });
      fs.ReadStream(filepath).pipe(req);
    });    
  });
}

/**
 * Calculates local checksums, fetches remote checksums
 * and calls the upload function which will take care of the rest.
 */
exports.publish = function(){
  var options   = utils.extend(reqOpts, { headers: { password: settings.password, filename: "" } });
  var checksums = {};
  var req, data = "";
  
  console.log("Calculating local checksums ...");
  ['templates', 'static', 'posts'].forEach(function(dir){
    fs.readdirSync(path.normalize(__dirname + '/../' + dir))
      .filter(function(filename){ 
        return filename[0] !== '.'; 
      })
      .forEach(function(filename){
        filename = dir + '/' + filename;        
        checksums[filename] = crypto.createHash('sha1').update(fs.readFileSync(path.normalize(__dirname + '/../' + filename))).digest('hex');
      });
  });
  
  console.log("Fetching remote checksums ...");
  req = http.request(options, function(res){
    res.on('data', function (chunk) { 
      data += chunk; 
    });
    res.on('end', function(){ 
      upload(checksums, JSON.parse(data)); 
    });
  });
  req.on('error', function(e){
    console.log("An error happened while fetching remote checksums; Check if your server is online.");
    console.log("Error Code: " + e.code || e.errno);
    process.exit(1);
  });
  req.end();
}
