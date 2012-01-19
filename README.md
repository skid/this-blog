# This Blog

"This Blog" is a blogging engine made for people that like markdown and the command line. It's a single-user, no database application written in node.js.

## Features

- Simple publishing mechanism - use a single command
- No database or static file servers - all data is kept in files
- Blog posts are single files and contain their own configuration
- Can handle multiple languages
- Can tag posts and dynamically build tag categories
- Posts can have their own templates or use the provided master

## Installation

To use it, you will have to make 2 installations, one on your server and one on your local machine:

    npm install this-blog

## Usage

#### Setting up

Before you start it, you need to edit the `settings.json` file in the root directory. Your local and remote installation **must** have the same settings for these options:

    remoteUrl:    "example.com"
    remotePort:   80
    password:     "icanhazcheezburger"
    contentDirs:  ["posts", "templates", "static"]
    
You need to get these to be the same on your server and local installation. Everything else is configurable later. The `remoteUrl` and `remotePort` are the public URL and port of your blog. The `password` is used to authenticate you when you publish posts.

You can start your server by running 

    node blog.js -s 

on your server.

#### Publishing

To upload posts, images and templates start adding them in one of the `contentDirs` that you defined. Normally your posts would go in the _posts_ directory, templates in the _templates_ directory, but This Blog uses only the file extension to make difference between posts and other files. Any file with the `.md` extension will be treated like a post.

After you're done publish your changes by running 

    node blog.js -p 
    
on your local machine.
    
### Configuration

Here's an overview of the configuration options in the `settings.json` file:

    port:        The port for the node server to listen to (if you use a proxy)
    remotePort:  The public port for your blog (should be 80)
    remoteUrl:   The public URL of your blog
    password:    Authentication password - needs to be the same
    contentDirs: Dirs scanned for content changes before publishing
    gaCode:      Google analytics key
    postsUrl:    Url path for posts (with leading slash)
    tagsUrl:     Url path for tags (with leading slash)
    adminUrl:    Url path for publishing (passworded, with leading slash)
    errorLog:    Error log filename 
    maxExcerpts: Maximum number of posts shown on a tag/home page
    pagination:  Maximum number of pagination links
    languages:   List of languages - ["en", "mk"]
    langinfo:    Hash of language names - {"en": "English", "mk": "Македонски"}
    sitemenus:   List of menus that posts can appear in - ["bookmarks", "2011"]
