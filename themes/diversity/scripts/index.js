'use strict';

// 在生成器解析前执行
hexo.extend.filter.register('before_generate', () => {
    // 配置生成器
    require('./generator')(hexo);
}, 100);
