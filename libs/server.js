/**
 * ThisBlog by "Dusko Jordanovski" <jordanovskid@gmail.com>
 * A simple blog for programmers that like Markdown and git.
 *
 */
var utils     = require('./utils');
var path      = require('path');
var util      = require('util');
var url       = require('url');
var fs        = require('fs');
var connect   = require('connect');
var settings  = global.settings; 
var cache     = global.cache;
var main      = connect();

/* 
 * This is the admin layer that handles requests from the client.
 * You manage This Blog by sending or deleting files.
 *
 * Markdown file's mimes will always be text/markdown.
 * Text files' mimes will always be text/something.
 */
main.use(settings.adminUrl, function(req, res, next){
  if(req.headers.password !== settings.password) {
    return next(404);
  }
  
  // Get the served files' checksums to decide what files need to be sent.
  if(req.method === 'GET'){
    var json = JSON.stringify(cache.checksums);
    res.writeHead(200, { 'content-type': 'text/json', 'content-length': Buffer.byteLength(json) });
    res.end(json);
  }
  
  // Update or Create file
  else if(req.method === 'PUT'){
    if(!req.headers['filename'] || !req.headers['content-type']) {
      return res.end("No filename or content-type supplied for PUT request");
    }
    var options = {
      'save': true,
      'text': req.headers['content-type'].split("/")[0] === 'text',
      'size': parseInt(req.headers['content-length'] || 0, 10)
    }

    var update = req.headers['content-type'] === 'text/markdown' ? utils.updatePost : utils.updateFile;
    update(req, req.headers['filename'], options, function(){
      res.end("Received file: '" + req.headers['filename'] + "'");
    });
  }

  // Delete file
  else if(req.method === 'DELETE'){
    req.on('end', function(){
      utils.deleteFile(req.headers['filename'], function(){
        res.end("Deleted file: '" + req.headers['filename'] + "'");
      });
    });
  }
});


/* Serve static content and favicon */
main.use('/favicon.ico', utils.favicon);
main.use('/static', connect.static(path.normalize(__dirname + '/../static'), {maxAge: 86400000 * 365 }));

/* Redirects to the same url without trailing slash.
 * Detects language or redirects to the default language.
 */
main.use('/', function(req, res, next){
  var parsed = url.parse( req.url );
  if(req.method === 'GET' && (/.+\/+$/).test( parsed.pathname )) {
    parsed.pathname = parsed.pathname.replace(/\/+$/,'');
    res.writeHead(301, { 'Location': url.format( parsed ) });
    return res.end();
  }
  // Get language or redirect to default language
  var chunks = parsed.pathname.split("/");
  if( !~settings.languages.indexOf(chunks[1]) ) {
    chunks.splice(1, 0, settings.languages[0]);
    parsed.pathname = chunks.join("/");
    res.writeHead(301, { 'Location': url.format( parsed ) });
    return res.end();
  }
  req.language = chunks.splice(1, 1)[0];
  req.url = chunks.join("/");
  return next();
});

/* 
 * Builds the sidebar and creates context 
 */
main.use('/', function(req, res, next){
  req.context = {
    menus:    settings.sitemenus.map(function(menu){
                var list = (cache.menus[menu] || []).map(function(slug){
                  var post = cache.posts[slug] && cache.posts[slug][req.language];
                  return post ? "<li><a href='/" + req.language + settings.postsUrl + "/" + slug + "'>" + post.meta.title + "</a></li>" : "";
                }).join("");
                return list ? [ "<h3>", settings.strings[req.language][menu] || "", "</h3>", "<ul class='unstyled'>", list, "</ul>" ].join("") : "";
              }).join(""),
    tags:     "<h3>" + settings.strings[req.language].tags + "</h3>" +
              "<ul class='unstyled'>" +
                Object.keys(cache.tags).map(function(tag){
                  return "<li><a href='/" + req.language +  settings.tagsUrl + "/" + tag + "'>" + (tag.charAt(0).toUpperCase() + tag.slice(1)) + "</a></li>";
                }).join("") + 
              "</ul>",
    strings:  settings.strings[req.language],
    settings: settings
  };
  next();
});

/* 
 * Handles post views.
 */
main.use(settings.postsUrl, function(req, res, next){  
  var post, chunks = req.url.split("/"), slug = chunks[1];

  /* We expect something like "/post-slug" */
  if(chunks.length != 2){
    return next(404);
  }
  if(!(req.method === 'GET' && slug && (post = cache.posts[slug]) && (post = post[req.language]))){
    return next(404);
  }
  // Render post in it's own template
  if(post.meta.template) {
    return utils.template(path.normalize(__dirname + '/../templates/' + post.meta.template), post, function(err, content){
      if(err) {
        return next(err.code === 'ENOENT' ? 404 : 500);
      }
      return res.end(html);
    });
  }

  req.context.content     = "<span class='label date'>" + post.meta.fdate + "</span><h1>" + post.meta.title + "</h1>" + post.content;
  req.context.title       = post.meta.title;
  req.context.author      = post.meta.author || settings.strings[req.language].author;
  req.context.description = post.meta.description;
  req.context.languages   = [
    "<ul class='unstyled'>",
      Object.keys(cache.posts[slug]).map(function(lang){
        return lang !== req.language ? "<li><a href='/" + lang + settings.postsUrl + "/" + slug + "' class='lang " + lang + "'>" + settings.langinfo[lang] + "</a></li>" : "";
      }).join(""),
    "</ul>"
  ].join("");

  next();
});

/* 
 * Handles list views (homepage and tag)
 */
function list(req, res, next, tag){
  var i=0, j=0, post, slug, excerpts = [];
  var tags = cache.tags[tag] || null;

  while((slug = cache.order[i++]) && (post = cache.posts[slug])) {
    if((post = post[req.language]) && (!tag || ~tags.indexOf(slug))) {
      excerpts.push(
        '<div class="chapter-options clearfix"><span class="label date">', post.meta.fdate, '</span></div>',
        '<h2><a href="', post.meta.link, '">', post.meta.title, '</a></h2>',
        '<div class="chapter-excerpt">', post.excerpt, '</div>',
        '<div class="chapter-footer"><a href="', post.meta.link, '">', settings.strings[req.language].entire_post, ' &raquo;</a></div>'
      );
      if(++j >= settings.maxhomepage) {
        break;
      }
    }
  }
  excerpts = excerpts.join("");
  if(!excerpts) {
    excerpts = "<h2>" + settings.strings[req.language].empty_list + "</h2>";
  }

  req.context.content     = excerpts;
  req.context.title       = settings.strings[req.language].homepage;
  req.context.author      = settings.strings[req.language].author;
  req.context.description = settings.strings[req.language].description;
  req.context.languages   = "<ul class='unstyled'>" +
                              settings.languages.map(function(lang){ 
                                return "<li><a href='/" + lang + "' class='lang " + lang + "'>" + settings.langinfo[lang] + "</a></li>"; 
                              }).join("") +
                            "</ul>";
}

/* Render tag lists */
main.use(settings.tagsUrl, function(req, res, next){
  var tag = req.url.substr(1);
  if(tag in cache.tags) {
    list(req, res, next, tag);
  }
  next();
});

/* Render homepage */
main.use('/', function(req, res, next){
  if(req.method === 'GET' && req.url === '/') {
    list(req, res, next);
  }
  next();
});

/* Render master template and serve response */
main.use('/', function(req, res, next){
  if(!req.context.content) {
    return next(404);
  }
  utils.template(path.normalize(__dirname + "/../templates/master.html"), req.context, function(err, html){
    if(err) {
      return next(err.code === "ENOENT" ? 404 : 500);
    }
    return res.end(html);
  });
});

/* In the end show a 404 page */
main.use('/', function(err, req, res, next){
  req.context = {
    strings: settings.strings[req.language],
    content: err.status === 404 ? 404 : 500,
    title:   err.status === 404 ? "Not Found" : "Internal Server Error"
  }
  utils.template(path.normalize(__dirname + "/../templates/error.html"), req.context, function(error, html){
    res.writeHead(err.status);
    res.end(html);
  });
});
module.exports = main;
