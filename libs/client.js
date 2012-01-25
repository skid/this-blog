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
  host:       global.settings.remoteUrl,
  port:       global.settings.remotePort,
  path:       global.settings.adminUrl,
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
 * Calculates local checksums, fetches remote checksums
 * and calls the upload function which will take care of the rest.
 */
exports.publish = function(){
  var options   = utils.extend(reqOpts, { headers: { password: global.settings.password, filename: "" } });
  var checksums = {};
  var req, data = "";

  console.log("Fetching remote checksums ...");
  req = http.request(options, function(res){
    
    res.on('data', function (chunk) { 
      data += chunk; 
    });
    
    res.on('end', function(){ 
      
      // On successful GET of remote checksums, compare them and send 
      // files that have been added / changed / removed
      if(res.statusCode === 200) {
        var i, send = {}, remoteChecksums = JSON.parse(data);
        
        for(i in cache.checksums) {
          if(!(i in remoteChecksums) || remoteChecksums[i] !== cache.checksums[i]) {
            send[i] = cache.checksums[i];
            delete remoteChecksums[i];
          }
          else if(i in remoteChecksums) {
            delete remoteChecksums[i];
          }
        }
        
        console.log("\nDeleting " + Object.keys(remoteChecksums).length + " items.");
  
        // Remove
        Object.keys(remoteChecksums).forEach(function(filename){
          var data = "", options = utils.extend(reqOpts, { 
            method: "DELETE", 
            headers: {
              'content-length': 0,
              'password':       global.settings.password, 
              'filename':       filename 
            } 
          });
    
          var req = http.request(options, function(res){
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function(){ console.log(data); });
          });

          req.on('error', function(e){
            console.log("An error happened while issuing a delete request for " + filename + "; Try publishing again.");
            console.log("Error Code: " + e.code || e.errno);
          });
          
          req.end();
        });

        console.log("Uploading " + Object.keys(send).length + " items.\n");

        // Send
        Object.keys(send).forEach(function(filename){
          var filepath = path.join(settings.root, filename);    
    
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
                "password":       global.settings.password, 
                "filename":       filename 
            }});
            
            req = http.request(options, function(res){
              res.on('data', function (chunk) { data += chunk; });
              res.on('end', function(){ console.log( data ); });
            });
            
            req.on('error', function(e){
              console.log("An error happened issuing a PUT request for file " + filename + "; Try publishing again.");
              console.log("Error Code: " + e.code || e.errno);
            });
            
            fs.ReadStream(filepath).pipe(req);
          });
        });
      }
      
      // If the remote server responds with a 404 to the checksum fetch, then we 
      // most probably have a different password on the local installation
      else if(res.statusCode === 404) {
        return  console.log("Not found. Did you change your password ?");
      }
      
      // Otherwise some error happened
      else if(res.statusCode !== 200){
        console.log("Error: " + res.statusCode);
      }

    });
  });
  
  req.on('error', function(e){
    
    console.log("An error happened while fetching remote checksums; Check if your server is online.");
    console.log("Error Code: " + e.code || e.errno);
    process.exit(1);
    
  });
  
  req.end();
}
