/**
 * Diversity SDK — versioned minified output.
 *   hexo g → on exit, copy public/js/{name}.js → {name}.{version}.min.js
 *   hexo s → middleware intercepts the versioned path and re-renders the source
 */
var fs       = require('fs');
var path     = require('path');
var pkg      = require(path.join(hexo.base_dir, 'package.json'));
var version  = pkg.version || '1.0.0';

var SDK_NAME          = 'diversity-comments';                 // 源文件名（不含 .js）
var SDK_SOURCE        = 'js/' + SDK_NAME + '.js';             // 源文件路由路径
var SDK_OUTPUT_FILE   = SDK_NAME + '.' + version + '.min.js'; // 输出文件名
var SDK_OUTPUT_PATH   = 'js/' + SDK_OUTPUT_FILE;              // 输出路由路径
var SDK_SOURCE_ABS    = path.join(hexo.theme_dir, 'source', SDK_SOURCE);

// ---------- helper ----------
hexo.extend.helper.register('sdk_script', function () {
    return '/' + SDK_OUTPUT_PATH;
});

// ---------- hexo g ----------
hexo.on('exit', function () {
    var src  = path.join(hexo.public_dir, SDK_SOURCE);
    var dest = path.join(hexo.public_dir, SDK_OUTPUT_PATH);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('[diversity-sdk] generated: public/' + SDK_OUTPUT_PATH);
    }
});

// ---------- hexo s ----------
var cached;
hexo.extend.filter.register('server_middleware', function (app) {
    app.use('/' + SDK_OUTPUT_PATH, function (req, res, next) {
        if (cached) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            return res.end(cached);
        }
        hexo.render.render({ path: SDK_SOURCE_ABS }).then(function (result) {
            cached = result;
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.end(result);
        }).catch(next);
    });
});
