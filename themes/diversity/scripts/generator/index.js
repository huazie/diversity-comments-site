"use strict";
module.exports = (ctx) => {
    const { generator } = ctx.extend;
    generator.register('post', require('./empty'));
    generator.register('category', require('./empty'));
    generator.register('archive', require('./empty'));
    generator.register('atom', require('./empty'));
    generator.register('tag', require('./empty'));
};