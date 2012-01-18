var crypto    = require('crypto');
var mime      = require('mime');
var path      = require('path');
var fs        = require('fs');
var marked    = require('marked');
var connect   = require('connect');
var templates = {};
var cache     = global.cache;

function formatDate(date, lang) {
  return global.settings.strings[lang].months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
}
function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Recursively reads a directory tree and applies a function to all contained files
 */
var crawl = exports.crawl = function(dir, action){
  fs.readdirSync(dir).forEach(function(filename){
    var filepath = path.join(dir, filename);
      
    if(filename[0] === '.') {
      return;
    }
    if(fs.statSync(filepath).isDirectory()){
      return crawl(filepath, action);
    }
    action(filepath);
  });
}

/**
 * Creates a new object and merges a and b into it.
 */
exports.extend = function(a, b) {
  var i, newobj = {};
  if(a && b) {
    for(i in a) {
      if(a.hasOwnProperty(i)) {
        newobj[i] = a[i];
      }
    }
    for(i in b) {
      if(b.hasOwnProperty(i)) {
        newobj[i] = b[i];
      }
    }
  }
  return newobj;
}

/**
 * Serves static files on custom URLs like /favicon.ico and /robots.txt.
 */
exports.serveFile = function(filepath, headers){
  return function(req, res, next){
    fs.readFile(path, function(err, buf){
      if (err) {
        return next(err.code === 'ENOENT' ? 404 : err);
      }
      headers['Content-Length'] = buf.length;
      headers['Content-Type'] = mime.lookup(path);
      headers['Etag'] = connect.utils.md5(buf);
      res.writeHead(200, headers);
      res.end(buf);
    });
  }
}

/**
 * Deletes a file and removes it from all caches
 */
exports.deleteFile = function(filepath, callback){
  var filename = filepath.substr(filepath.lastIndexOf("/") + 1);
  fs.unlink(filepath);

  delete cache.checksums[filename];
  delete templates[filename];
  
  // Remove posts from cache, menus and tags
  if(filename.substr(-2).toLowerCase() === 'md'){
    var chunks    = filename.split(".");
    var name      = chunks[0];
    var slug      = slugify(name);
    var lang      = chunks.length === 3 ? chunks[1] : global.settings.languages[0];

    delete cache.posts[slug][lang];

    if(Object.keys(cache.posts[slug]).length === 0){
      var i;
      for(i in cache.tags){
        if(~cache.tags[i].indexOf(slug)){
          cache.tags[i].splice(cache.tags[i].indexOf(slug), 1);
        }
        if(cache.tags[i].length === 0){
          delete cache.tags[i];
        }
      }
      for(i in cache.menus){
        if(~cache.menus[i].indexOf(slug)){
          cache.menus[i].splice(cache.menus[i].indexOf(slug), 1);
        }
        if(cache.menus[i].length === 0){
          delete cache.menus[i];
        }
      }
    }
  }
  callback && callback();
}

/**
 * Takes a stream and calculates the hash. It also saves the stream.
 * This is used for templates and static files. For posts see updatePost.
 */
exports.updateFile = function(stream, filepath, options, callback) {
  options = options || {};
  
  var data, tmp, bufcount = 0, hash = crypto.createHash('sha1');
  
  if(options.save){
    data = options.text ? "" : options.size ? new Buffer(options.size) : null;
  }

  stream.on('data', function(part){
    if(options.save) {
      if(options.text) {
        data += part;
      }
      else if( options.size ) {
        part.copy(data, bufcount);
        bufcount += part.length;
      }
      else {
        tmp  = data;
        data = Buffer(bufcount + part.length);
        tmp && tmp.copy(data);
        part.copy(data, bufcount);
        bufcount += part.length;
      }
    }
    hash.update(part);
  });

  stream.on('end', function(){
    var filename = filepath.substr(settings.root.length + 1);
    cache.checksums[filename] = hash.digest('hex');
    if(options.save) {
      // Invalidate cache for templates
      if(filepath in templates){
        delete templates[filename];
      }
      fs.writeFile(filepath, data, 'utf-8', callback);
      if(filename 'settings.json') {
        global.settings = JSON.parse(data);
      }
    }

    callback && callback();
  });
}

/**
 * Does the magic. Takes a stram and prepares a post from it.
 */
exports.updatePost = function(stream, filepath, options, callback) {
  options = options || {};
  
  var data = "", hash = crypto.createHash('sha1');
  stream.on('data', function(part) {
    data += part;
    hash.update(part);
  });

  stream.on('end', function() {
    // Get infor from filename
    var filename  = filepath.substr(filepath.lastIndexOf("/") + 1);
    var chunks    = filename.split(".");
    var name      = chunks[0];
    var slug      = slugify(name);
    var lang      = chunks.length === 3 ? chunks[1] : global.settings.languages[0];
    var headers   = {
      link:       "/" + lang + global.settings.postsUrl + "/" + slug,
      permalink:  global.settings.server + (global.settings.port !== 80 ? ":" + global.settings.port : "") + "/" + lang + global.settings.postsUrl + "/" + slug,
      title:      name
    };
    var post    = {
      meta: headers
    };

    // Parse headers
    data.substr(0, data.indexOf("\n\n")).split("\n").forEach(function(header){
      var hdata, k, v, kv = header.split(":");
      // Invalid header syntax
      if(kv.length < 2) {
        return;
      }
    
      k = kv[0].trim().toLowerCase();
      v = kv[1].trim();
    
      // Parse date into a date object
      if(k === 'date') {
        try {
          hdata = v.split("-");
          v = new Date(parseInt(hdata[0], 10), parseInt(hdata[1], 10) - 1, parseInt(hdata[2], 10));
          headers.fdate = formatDate(v, lang);
        } catch(e) {}; 
      }
      if(k === 'tags' || k === 'menus') {
        v = v.split(",").map(function(tag){ return tag.trim().toLowerCase(); });
      }
      headers[k] = v;
    });
    
    // Parse and compile markdown content
    chunks = data.substr(data.indexOf("\n\n") + 2).split("\n\n-----\n\n");
    post.content = marked(chunks.join("\n\n"));
    post.excerpt = chunks.length > 1 ? marked(chunks[0]) : post.content;
    
    // Put compled post in cache
    if(slug in cache.posts) {
      cache.posts[slug][lang] = post;
    }
    else {
      var temp = {};
      temp[lang] = post;
      cache.posts[slug] = temp;
    }
          
    // Removes posts from menus/tags if they were previously there
    // but in the last update their menus/tags headers were changed.
    Object.keys(cache.tags).forEach(function(tag){
      var index = cache.tags[tag].indexOf(slug);
      if((!post.meta.tags || post.meta.tags.indexOf(tag) === -1) && index > -1) {
        cache.tags[tag].splice(index, 1);
      }
      if(cache.tags[tag].length === 0){
        delete cache.tags[tag];
      }
    });
    Object.keys(cache.menus).forEach(function(menu){
      var index = cache.menus[menu].indexOf(slug);
      if((!post.meta.menus || post.meta.menus.indexOf(menu) === -1) && index > -1) {
        cache.menus[menu].splice(index, 1);
      }
      if(cache.menus[menu].length === 0){
        delete cache.menus[menu];
      }
    });
    
    // Adds posts to menus/tags
    if('tags' in post.meta) {
      post.meta.tags.forEach(function(tag){
        tag = tag.toLowerCase();
        if(tag in cache.tags) {
          if(cache.tags[tag].indexOf(slug) === -1) {
            cache.tags[tag].push(slug);
          }
        }
        else {
          cache.tags[tag] = [slug];
        }
      });
    }

    if('menus' in post.meta) {
      post.meta.menus.forEach(function(menu){
        menu = menu.toLowerCase();
        if(menu in cache.menus) {
          if(cache.menus[menu].indexOf(slug) === -1) {
            cache.menus[menu].push(slug);
          }
        }
        else {
          cache.menus[menu] = [slug];
        }
      });
    }
    
    // Sort the posts in the cache by date
    cache.order = Object.keys(cache.posts);
    cache.order.sort(function(a, b){
      a = cache.posts[a];
      b = cache.posts[b];
      a = a[global.settings.languages[0]] || a[global.settings.languages[1]];
      b = b[global.settings.languages[0]] || b[global.settings.languages[1]];
      return (+b.meta.date || 0) - (+a.meta.date || 0);
    });

    // Update the stored checksums
    cache.checksums[filename] = hash.digest('hex');
    if(options.save) {
      fs.writeFile(filepath, data, 'utf-8', callback);
    }
    else if(callback) {
      callback();
    }
  });
}


/**
 * Mini templating engine for replacing template variables;
 * First take a look at the template functiona and see that when a template is parsed,
 * all strings that look like {{obj.prop.prop}} are stored as an array.
 * 
 * This render function recognizes arrays as dynamic data and makes a lookup in the post object.
 * For example {{meta.title}} will get the title from the post's media property.
 */ 
function render(template, post) {
  return template.map(function(token){
    var i, obj = post;
    if(typeof token === 'string') {
      return token;
    }
    for(i=0; i < token.length; ++i){
      obj = obj[token[i]];

      if(obj === undefined || obj === null) {
        return "";
      }
    }
    return obj;
  }).join("");
}

/**
 * Applies a template to a post. The post template processed and cached.
 */
exports.template = function(template, post, callback){
  if(template in templates) {
    // If no callback is supplied, return the render results immediately
    return callback ? callback(null, render(templates[template], post)) : render(templates[template], post);
  }
  fs.readFile(template, function(err, data){
    // Probably a wrong template found
    if(err) {
      return callback(err);
    }
    var tmpl = data.toString('utf-8').replace(/(^\n+)|(\n+$)/, '').split(/(\{\{.*?\}\})/)
                   .map(function(token){ return /^\{\{.*?\}\}$/.test(token) ? token.replace(/^\{\{ *| *\}\}$/g, '').split(".") : token; });
    return callback(null, render(templates[template] = tmpl, post));
  });
}