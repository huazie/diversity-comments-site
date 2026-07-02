/**
 * Diversity Comments SDK v1.0.0
 * 
 * 外部系统通过 script 导入此文件，通过 DiversityComments.init 进行初始化，
 * 通过 iframe 加载对应的 /comments/ 资源。
 * 
 * @author huazie
 * @since 2.0.0
 */
(function(global) {
    'use strict';

    // ================================================================
    // 判断当前运行上下文：是否在 iframe 内部
    // ================================================================
    var isInIframe = (function() {
        try {
            return global.self !== global.top && global.parent !== global.self;
        } catch (e) {
            return true;
        }
    })();

    // ================================================================
    // OAuth 回调检测（必须在 iframe 判别之前执行）
    // ================================================================
    // GitHub OAuth 会将整个页面重定向到 /comments/?giscus=... 或 /comments/?utterances=... 或 /comments/?code=...
    // 这时页面是顶层页面（isInIframe = false），需要强制重定向回父页面
    // 注意：此检测必须在 if (isInIframe) 判别之前执行
    (function detectOAuthCallback() {
        try {
            var url = new URL(global.location.href);
            var params = url.searchParams;
            var giscusSession = params.get('giscus');
            var utterancesSession = params.get('utterances');

            if (!giscusSession && !utterancesSession) return;

            // Giscus OAuth 回调：?giscus=
            // Giscus client.js 通过 JSON.parse() 读取，需要 JSON 格式
            if (giscusSession) {
                localStorage.setItem('giscus-session', JSON.stringify(giscusSession));
            }

            // Utterances OAuth 回调：?utterances=
            // Utterances 直接读取字符串，不需要 JSON.stringify
            if (utterancesSession) {
                localStorage.setItem('utterances-session', utterancesSession);
            }

            // 重定向回父页面
            var parentUrl = localStorage.getItem('diversity:parentUrl');
            if (parentUrl) {
                global.location.href = parentUrl;
            }
        } catch (e) {}
    })();

    // ================================================================
    // 统一 OAuth Login Hijack（Gitalk + Gitment）
    // ================================================================
    // 背景：Gitalk v1.x 和 Gitment 在 iframe 内 OAuth 登录会失败
    //   - Gitalk：缺少 proxy 配置时默认走 iframe OAuth，CSP 阻止
    //   - Gitment：window.open() + 默认 gh-oauth.imsun.net 代理已失效
    //
    // 解决方案：统一劫持登录按钮 → window.open() 弹窗到 GitHub OAuth
    //   → callback.html?system=xxx → postMessage 回传 token
    //   → iframe 存 localStorage → location.reload() 完成登录
    //
    // 该模块同时运行在父页面和 iframe 中：
    //   - 父页面侧：转发 callback.html 的 postMessage 到 iframe
    //   - iframe 侧：劫持登录按钮 + 接收 token 完成登录
    // ================================================================
    (function() {
        // 各系统的 token 存储 key
        var TOKEN_KEYS = {
            gitalk: 'GT_ACCESS_TOKEN',
            gitment: 'gitment-comments-token'
        };
        // OAuth scope
        var OAUTH_SCOPES = {
            gitalk: 'repo,read:user',
            gitment: 'public_repo'
        };
        var HIJACK_DATASET = {
            gitalk: 'gtHijacked',
            gitment: 'gmHijacked'
        };
        var WRAP_SELECTORS = {
            gitalk: '.gitalk-wrap',
            gitment: '.gitment-wrap'
        };

        // 如果不在 iframe 中，这个模块只负责转发 OAuth 消息（父页面侧在 _handleIframeMessage 中处理）
        if (!isInIframe) return;

        // === iframe 侧逻辑 ===
        var _hijackActive = {};       // 跟踪每个系统的 MutationObserver 是否已启动
        var _hijackObservers = {};    // 存储 MutationObserver 实例

        // 尝试劫持指定系统的登录按钮
        function tryHijack(system) {
            var wrap = document.querySelector(WRAP_SELECTORS[system]);
            if (!wrap) return;

            // 扫描并劫持现有按钮
            scanButtons(system, wrap);

            // 如果 observer 已存在，跳过
            if (_hijackActive[system]) return;
            _hijackActive[system] = true;

            var observer = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].addedNodes.length) {
                        scanButtons(system, wrap);
                        break;
                    }
                }
            });
            observer.observe(wrap, { childList: true, subtree: true });
            _hijackObservers[system] = observer;
        }

        // 扫描并劫持未处理的登录按钮（幂等）
        function scanButtons(system, container) {
            var dsKey = HIJACK_DATASET[system];
            var selector = {
                gitalk: '.gt-avatar-github, .gt-btn-login, .gt-action-login',
                gitment: '.gitment-editor-login-link, .gitment-editor-avatar'
            }[system];
            var buttons = container.querySelectorAll(selector);
            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                // 跳过已标记的按钮
                if (btn.dataset[dsKey]) continue;
                btn.dataset[dsKey] = '1';
                // 在捕获阶段拦截，不修改 DOM（防止破坏 Preact reconciliation）
                btn.addEventListener('click', (function(sys) {
                    return function(e) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        openOAuthPopup(sys);
                    };
                })(system), true);
            }
        }

        // 弹窗 OAuth 授权
        function openOAuthPopup(system) {
            var cfg = conf[system];
            if (!cfg || !cfg.client_id) {
                console.warn('[Diversity OAuth] ' + system + '.client_id not configured');
                return;
            }
            var clientId = cfg.client_id;
            var redirectUri = cfg.redirect_uri || cfg.redirect_url || (window.location.origin + '/callback.html?system=' + system);
            var scope = OAUTH_SCOPES[system] || 'public_repo';

            var oauthUrl = 'https://github.com/login/oauth/authorize' +
                '?client_id=' + encodeURIComponent(clientId) +
                '&redirect_uri=' + encodeURIComponent(redirectUri) +
                '&scope=' + encodeURIComponent(scope) +
                '&allow_signup=true';

            var popup = window.open(
                oauthUrl,
                'github_oauth_' + system,
                'width=880,height=700,scrollbars=yes,resizable=yes,toolbar=no,location=yes'
            );

            if (!popup) {
                alert('弹窗被浏览器拦截了，请允许弹窗后重试，或将 ' + window.location.hostname + ' 加入白名单。');
            }
        }

        // 监听来自 callback.html 的 postMessage（来自父页面的转发）
        global.addEventListener('message', function(event) {
            if (!event.data || typeof event.data !== 'object') return;
            var data = event.data;
            if (!data.type) return;

            var system = null;
            if (data.type.indexOf('diversity:gitalk:oauth') === 0) {
                system = 'gitalk';
            } else if (data.type.indexOf('diversity:gitment:oauth') === 0) {
                system = 'gitment';
            } else {
                return;
            }

            if (data.error) {
                console.warn('[Diversity OAuth] ' + system + ' error:', data.error, data.error_description || '');
                return;
            }

            var authCode = data.code || data.token;
            if (!authCode) return;

            var storageKey = TOKEN_KEYS[system];
            try {
                localStorage.setItem(storageKey, authCode);
            } catch (e) {
                console.error('[Diversity OAuth] Failed to store token:', e);
            }

            // 存储 token 后刷新页面，让评论系统从 localStorage 读取
            window.location.reload();
        });

        // 在 page:loaded 之后启动劫持（评论系统的 wrap 容器此时才渲染）
        document.addEventListener('page:loaded', function() {
            // 稍小延迟，确保各 .ejs 的渲染逻辑执行完成
            setTimeout(function() {
                tryHijack('gitalk');
                tryHijack('gitment');
            }, 0);
        });
    })();

    // Iframe 侧：标记是否已收到父页面的配置
    var _parentConfigReceived = false;
    var _activeComment = null; // 跟踪当前激活的评论系统

    // 脚本加载时即捕获脚本部署地址（document.currentScript 仅在同步执行时可用）
    var _scriptOrigin = (function() {
        try {
            var script = document.currentScript;
            if (script && script.src) {
                var a = document.createElement('a');
                a.href = script.src;
                return a.protocol + '//' + a.host;
            }
        } catch (e) {}
        return '';
    })();

    // ================================================================
    // 通用工具函数
    // ================================================================
    /**
     * 深度合并配置对象
     * @param {Object} target 目标对象
     * @param {Object} source 源对象
     * @returns {Object} 合并后的对象
     */
    function deepMerge(target, source) {
        var result = {};
        var key;
        for (key in target) {
            if (target.hasOwnProperty(key)) {
                result[key] = target[key];
            }
        }
        for (key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null &&
                    !Array.isArray(source[key]) && typeof result[key] === 'object' &&
                    result[key] !== null && !Array.isArray(result[key])) {
                    result[key] = deepMerge(result[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        return result;
    }

    // ================================================================
    // 默认配置（单一来源）
    // 所有上下文（父页面和 iframe）共享同一套默认配置
    // ================================================================
    var DEFAULT_CONFIGS = {
        server: '',
        container: '#diversity-comments',
        comments: {
            style: 'tabs',
            active: 'utterances',
            lazyload: true,
            storage: true,
            darkMode: 'auto',
            lang: 'zh-CN',
            nav: {
                utterances: { text: 'Utterances', order: 1 },
                gitalk:    { text: 'Gitalk',    order: 2 },
                giscus:    { text: 'Giscus',    order: 3 },
                twikoo:    { text: 'Twikoo',    order: 4 },
                gitment:   { text: 'Gitment',   order: 5 },
                waline:    { text: 'Waline',    order: 6 }
            }
        },
        utterances: {
            enable: true,
            loading: true,
            repo: 'user-name/repo-name',
            issue_term: 'pathname',
            theme: 'github-light',
            dark: 'github-dark'
        },
        gitalk: {
            enable: true,
            loading: true,
            github_id: 'user-name',
            repo: 'repo-name',
            client_id: 'your-client-id',
            client_secret: 'your-client-secret',
            admin_user: '',
            distraction_free_mode: true,
            issue_term: 'pathname',
            language: ''
        },
        giscus: {
            enable: true,
            loading: true,
            repo: 'your-username/your-repo-name',
            repo_id: 'R_xxx',
            category: 'Announcements',
            category_id: 'DIC_xxx',
            mapping: 'pathname',
            term: '',
            strict: 0,
            reactions_enabled: 1,
            emit_metadata: 0,
            theme: 'light',
            dark: 'dark',
            lang: '',
            input_position: 'bottom',
            data_loading: 'lazy'
        },
        twikoo: {
            enable: true,
            loading: true,
            env_id: 'xxx',
            path: '',
            lang: 'zh-CN',
            js: 'https://cdn.jsdelivr.net/npm/twikoo@1.7.9/dist/twikoo.min.js'
        },
        gitment: {
            enable: true,
            loading: true,
            owner: 'user-name',
            repo: 'repo-name',
            client_id: 'your-client-id',
            client_secret: 'your-client-secret',
            issue_term: 'pathname',
            id: '',
            title: '',
            link: '',
            desc: '',
            labels: [],
            per_page: 20,
            max_comment_height: 250
        },
        waline: {
            enable: true,
            loading: true,
            server_url: 'https://your-waline-server.netlify.app/.netlify/functions/comment',
            js_url: 'https://unpkg.com/@waline/client@v3/dist/waline.js',
            css_url: 'https://unpkg.com/@waline/client@v3/dist/waline.css',
            path: 'pathname',
            lang: 'zh-CN',
            emoji: null,
            dark: '.dark-theme',
            comment_sorting: 'latest',
            meta: ['nick', 'mail', 'link'],
            required_meta: [],
            login: 'enable',
            word_limit: false,
            page_size: 10,
            search: false,
            no_copyright: false,
            no_rss: false,
            reaction: false
        },
        onReady: null,
        onError: null,
        onActiveChange: null        
    };

    /**
     * 获取默认配置
     * @returns {Object} 默认配置
     */
    function getDefaultConfig() {
        var config = deepMerge({}, DEFAULT_CONFIGS);
        config.comments.pageId = global.location.pathname;
        return config;
    }

    // ================================================================
    // Iframe 侧逻辑：监听父页面消息，动态更新 <diversity-config>
    // ================================================================
    if (isInIframe) {
        // 拦截第一次 page:loaded 事件，等待父页面配置
        // 注意：必须在捕获阶段（capture phase）拦截，才能阻止事件到达其他监听器
        global.addEventListener('page:loaded', function(event) {
            if (!_parentConfigReceived) {
                // 停止事件传播，阻止其他监听器执行
                event.stopImmediatePropagation();
                return false;
            }
        }, true); // capture: true

        // 解析现有的 <diversity-config> 元素
        function parseConfigElements() {
            var configs = {};
            var elements = document.querySelectorAll('script.diversity-config');
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var name = el.getAttribute('data-name');
                try {
                    configs[name] = JSON.parse(el.textContent || el.innerHTML || '{}');
                } catch (e) {
                    configs[name] = {};
                }
            }
            return configs;
        }

        /**
         * 更新 <diversity-config> 元素的内容
         * @param {string} name - data-name 属性值
         * @param {Object} newConfig - 新的配置对象
         */
        function updateConfigElement(name, newConfig) {
            var el = document.querySelector('script.diversity-config[data-name="' + name + '"]');
            if (el) {
                // 获取现有配置
                var existing = {};
                try {
                    existing = JSON.parse(el.textContent || el.innerHTML || '{}');
                } catch (e) {}

                // 合并配置（用户传入的覆盖默认的）
                var merged = deepMerge(existing, newConfig);
                el.textContent = JSON.stringify(merged);
            } else {
                // 如果元素不存在，创建一个新的
                el = document.createElement('script');
                el.className = 'diversity-config';
                el.setAttribute('data-name', name);
                el.setAttribute('type', 'application/json');
                el.textContent = JSON.stringify(newConfig);
                document.head.appendChild(el);
            }
        }

        /**
         * 默认评论配置模板（展示默认值，不含敏感凭据）
         * 实际使用时，配置应通过父页面 DiversityComments.init() 传入
         * 各评论系统默认 enable: false，需要启用时设置为 true
         */

        // <diversity-config> 元素的配置更新方法
        function applyConfigToElement(config, configName) {
            if (config && typeof config === 'object') {
                updateConfigElement(configName, config);
            }
        }

        /**
         * 监听 iframe 内部 tab/dropdown 切换，同步通知父页面
         * 当用户直接点击 iframe 内的 tab 或 dropdown 切换评论系统时触发
         */
        function watchActiveTab() {
            var navContainer = document.getElementById('comment-nav-tab') || document.querySelector('.comments-dropdown');
            if (!navContainer) return;

            var observer = new MutationObserver(function() {
                // 查找当前激活的 tab
                var activeTab = document.querySelector('.comments-nav-tabs a.active[data-comments]');
                if (activeTab) {
                    var name = activeTab.getAttribute('data-comments');
                    if (name && name !== _activeComment) {
                        _activeComment = name;
                        setStoredActive(name);
                        postToParent({
                            type: 'diversity:activeChanged',
                            active: name
                        });
                    }
                    return;
                }
                // 查找 dropdown 的当前值
                var dropdownToggle = document.querySelector('.comments-dropdown-toggle');
                if (dropdownToggle) {
                    var value = dropdownToggle.getAttribute('data-value');
                    if (value && value !== _activeComment) {
                        _activeComment = value;
                        setStoredActive(value);
                        postToParent({
                            type: 'diversity:activeChanged',
                            active: value
                        });
                    }
                }
            });

            observer.observe(navContainer, {
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'data-value']
            });
        }

        /**
         * 根据父页面传来的配置，更新评论配置
         * v1.0.0: 支持传入各评论系统配置
         * @param {Object} parentConfig - 父页面传来的初始化配置
         */
        function applyCommentsConfig(parentConfig) {
            // 更新 comments 主配置
            if (parentConfig.comments) {
                var commentsConfig = parentConfig.comments;
                var merged = {
                    style: commentsConfig.style || 'tabs',
                    active: commentsConfig.active || 'utterances',
                    lazyload: commentsConfig.lazyload !== undefined ? commentsConfig.lazyload : true,
                    storage: commentsConfig.storage !== undefined ? commentsConfig.storage : true,
                    darkMode: commentsConfig.darkMode || 'auto',
                    lang: commentsConfig.lang || 'zh-CN'
                };

                // 处理 nav 配置
                if (commentsConfig.nav) {
                    merged.nav = commentsConfig.nav;
                }

                updateConfigElement('comments', merged);
            }

            // 更新各评论系统配置
            var systems = ['utterances', 'gitalk', 'giscus', 'twikoo', 'gitment', 'waline'];
            for (var i = 0; i < systems.length; i++) {
                var name = systems[i];
                if (parentConfig[name]) {
                    applyConfigToElement(parentConfig[name], name);
                }
            }

        }

        /**
         * 确保每个评论系统都有对应的 <diversity-config> 元素
         * 如果缺失则用 DEFAULT_CONFIGS 中的默认值创建
         */
        function ensureCommentConfigs() {
            var existingConfigs = parseConfigElements();
            var systems = ['utterances', 'gitalk', 'giscus', 'twikoo', 'gitment', 'waline'];
            for (var i = 0; i < systems.length; i++) {
                var name = systems[i];
                if (!existingConfigs[name] && DEFAULT_CONFIGS[name]) {
                    updateConfigElement(name, DEFAULT_CONFIGS[name]);
                }
            }
            if (!existingConfigs.comments) {
                updateConfigElement('comments', DEFAULT_CONFIGS.comments);
            }
        }

        /**
         * 根据主题样式切换显示模式（tabs / dropdown）
         */
        function switchThemeUI(theme) {
            var tabbable = document.querySelector('.comments-tabbable');
            var dropdown = document.querySelector('.comments-selector');

            if (theme === 'dropdown') {
                // 隐藏 tabs，显示 dropdown
                if (tabbable) tabbable.style.display = 'none';
                if (dropdown) dropdown.style.display = 'block';
            } else {
                // 默认: tabs 模式
                if (tabbable) tabbable.style.display = '';
                if (dropdown) dropdown.style.display = 'none';
            }
        }

        /**
         * 切换到指定的评论系统 tab
         * @param {string} name - 评论系统名称 (giscus/utterances/gitalk/twikoo/gitment/waline)
         */
        /**
         * 从 localStorage 读取上次选择的评论系统
         * 使用与 tab.js / dropdown.js 一致的 key: "selected_comment"
         */
        function getStoredActive() {
            try {
                return localStorage.getItem('selected_comment');
            } catch (e) {
                return null;
            }
        }

        /**
         * 将当前选择的评论系统写入 localStorage
         */
        function setStoredActive(name) {
            try {
                localStorage.setItem('selected_comment', name);
            } catch (e) {
                // localStorage 不可用时静默忽略
            }
        }

        function activateCommentTab(name) {
            if (!name) return;
            _activeComment = name;

            // 检查 storage 配置，决定是否记忆
            var allConfigs = parseConfigElements();
            var commentsConfig = allConfigs.comments;
            if (commentsConfig && commentsConfig.storage !== false) {
                setStoredActive(name);
            }

            // 尝试通过 tab 切换
            var tabLink = document.querySelector('a[data-comments="' + name + '"][data-toggle="tab"]');
            if (tabLink) {
                tabLink.click();
                return;
            }

            // 尝试通过 dropdown 切换
            var dropdownItem = document.querySelector('.comments-dropdown-item[data-value="' + name + '"]');
            if (dropdownItem) {
                dropdownItem.click();
                return;
            }

            // 直接通过 class 切换 pane
            var allPanes = document.querySelectorAll('.comments-tab-pane, .comments-dropdown-pane');
            for (var i = 0; i < allPanes.length; i++) {
                allPanes[i].classList.remove('active');
            }
            var targetPane = document.getElementById('comments-' + name);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        }

        /**
         * 获取页面总高度（用于通知父页面调整 iframe 高度）
         */
        function getPageHeight() {
            var body = document.body;
            var html = document.documentElement;
            return Math.max(
                body.scrollHeight, body.offsetHeight,
                html.clientHeight, html.scrollHeight, html.offsetHeight
            );
        }

        /**
         * 向父页面发送消息
         */
        function postToParent(data) {
            if (global.parent && global.parent !== global.self) {
                global.parent.postMessage(data, '*');
            }
        }

        /**
         * 监听页面高度变化，自动通知父页面
         */
        function observeHeightChanges() {
            var lastHeight = getPageHeight();

            // 使用 MutationObserver 监听 DOM 变化
            var observer = new MutationObserver(function() {
                var newHeight = getPageHeight();
                if (Math.abs(newHeight - lastHeight) > 10) {
                    lastHeight = newHeight;
                    postToParent({
                        type: 'diversity:resize',
                        height: newHeight
                    });
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });

            // 也监听 postMessage 来接收主动查询
            // 定期检查高度变化（作为 MutationObserver 的补充）
            setInterval(function() {
                var newHeight = getPageHeight();
                if (Math.abs(newHeight - lastHeight) > 5) {
                    lastHeight = newHeight;
                    postToParent({
                        type: 'diversity:resize',
                        height: newHeight
                    });
                }
            }, 500);
        }

        /**
         * 将 width=100% 样式应用到 iframe 内的 body，确保全宽显示
         */
        function setupIframeStyles() {
            document.body.style.margin = '0';
            document.body.style.padding = '0';
            document.body.style.width = '100%';
            var container = document.getElementById('container');
            if (container) {
                container.style.width = '100%';
            }
        }

        /**
         * 重新初始化评论（触发 page:loaded 事件）
         */
        function reinitComments() {
            // 通知所有评论系统重新初始化
            var event = document.createEvent('Event');
            event.initEvent('page:loaded', true, true);
            document.dispatchEvent(event);
        }

        // ---- Iframe 侧：监听父页面消息 ----
        global.addEventListener('message', function(event) {
            if (!event.data || typeof event.data !== 'object') return;

            var data = event.data;

            switch (data.type) {

                case 'diversity:init':
                    // 父页面初始化配置（v1.0.0 格式）
                    if (data.config) {
                        // 标记已收到父页面配置
                        _parentConfigReceived = true;

                        // 记录父页面 URL 到 localStorage，供 OAuth 回调重定向使用
                        // Giscus/Utterances 会将整个页面重定向到回调地址，
                        // detectOAuthCallback 会通过 diversity:parentUrl 找回父页面地址
                        try {
                            localStorage.setItem('diversity:parentUrl', data.parentUrl);
                        } catch (e) {}
                        
                        setupIframeStyles();
                        // 确保所有评论系统的 <diversity-config> 元素存在
                        ensureCommentConfigs();
                        // 更新配置（支持 comments + 各评论系统配置）
                        applyCommentsConfig(data.config);
                        // 根据 style 决定显示 tabs 还是 dropdown
                        var style = (data.config.comments && data.config.comments.style) || 'tabs';
                        switchThemeUI(style);
                        
                        // ---- 应用父页面传入的暗色模式（必须在 reinitComments 之前！）----
                        var darkMode = (data.config.comments && data.config.comments.darkMode) || 'light';
                        var isDark = darkMode === 'auto'
                            ? global.matchMedia('(prefers-color-scheme: dark)').matches
                            : darkMode === 'dark';
                        document.documentElement.classList.toggle('dark-theme', isDark);
                        
                        // 激活指定的评论系统 tab
                        var active = (data.config.comments && data.config.comments.active) || 'utterances';
                        // 如果 storage 开启，优先使用 localStorage 中记忆的选择
                        var storageEnabled = data.config.comments && data.config.comments.storage !== false;
                        var storedActive = storageEnabled ? getStoredActive() : null;
                        if (storedActive) {
                            active = storedActive;
                        }
                        activateCommentTab(active);
                        // 触发评论加载
                        reinitComments();
                        // 通知父页面已就绪
                        postToParent({
                            type: 'diversity:ready',
                            height: getPageHeight(),
                            active: _activeComment
                        });

                        // 监听 iframe 内部 tab/dropdown 的切换，同步通知父页面
                        watchActiveTab();
                    }
                    break;

                case 'diversity:switchTo':
                    // 切换评论系统
                    if (data.name) {
                        activateCommentTab(data.name);
                        // 通知父页面当前激活的评论系统
                        postToParent({
                            type: 'diversity:activeChanged',
                            active: _activeComment
                        });
                    }
                    break;

                case 'diversity:setColorScheme':
                    // 切换深色/浅色模式
                    var scIsDark = data.scheme === 'auto'
                        ? global.matchMedia('(prefers-color-scheme: dark)').matches
                        : data.scheme === 'dark';
                    document.documentElement.classList.toggle('dark-theme', scIsDark);
                    // 通知评论系统刷新配色
                    var evt = document.createEvent('Event');
                    evt.initEvent('color-scheme:refresh', true, true);
                    document.dispatchEvent(evt);
                    break;

                case 'diversity:refresh':
                    // 刷新当前评论
                    reinitComments();
                    break;

                case 'diversity:getHeight':
                    // 父页面查询高度
                    postToParent({
                        type: 'diversity:resize',
                        height: getPageHeight()
                    });
                    break;

                default:
                    break;
            }
        });

        // 开始监听高度变化
        observeHeightChanges();

        // 通知父页面 iframe 已加载完
        document.addEventListener('DOMContentLoaded', function() {
            setupIframeStyles();
            postToParent({
                type: 'diversity:loaded',
                height: getPageHeight()
            });
        });

        // Iframe 侧逻辑结束，不再执行父页逻辑
        return;
    }

    // ================================================================
    // 父页面侧逻辑：DiversityComments SDK API
    // ================================================================

    var DiversityComments = {};
    var _config = {};
    var _iframe = null;
    var _container = null;
    var _ready = false;

    /**
     * 初始化评论系统
     * 
     * v2.0.0 配置结构：
     * - comments: 收敛通用配置（pageId, style, active, lazyload, storage, darkMode, lang, nav）
     * - utterances/gitalk/giscus/twikoo/gitment/waline: 各评论系统独立配置
     * 
     * @param {Object} options - 配置项
     * @param {string} [options.server] - Diversity Comments 服务地址
     * @param {string} [options.container='#diversity-comments'] - 挂载容器的 CSS 选择器
     * @param {Object} [options.comments] - 评论通用配置
     * @param {string} [options.comments.pageId] - 页面唯一标识
     * @param {string} [options.comments.style='tabs'] - 显示模式: 'tabs' | 'dropdown'
     * @param {string} [options.comments.active='utterances'] - 默认激活的评论系统
     * @param {boolean} [options.comments.lazyload=true] - 是否懒加载
     * @param {boolean} [options.comments.storage=true] - 是否记住用户选择
     * @param {string} [options.comments.darkMode='auto'] - 深色模式
     * @param {string} [options.comments.lang='zh-CN'] - 语言
     * @param {Object} [options.comments.nav] - 导航配置
     * @param {Object} [options.utterances] - Utterances 配置
     * @param {Object} [options.gitalk] - Gitalk 配置
     * @param {Object} [options.giscus] - Giscus 配置
     * @param {Object} [options.twikoo] - Twikoo 配置
     * @param {Object} [options.gitment] - Gitment 配置
     * @param {Object} [options.waline] - Waline 配置
     * @param {Function} [options.onReady] - 初始化完成回调
     * @param {Function} [options.onError] - 错误回调
     * 
     * @example
     * DiversityComments.init({
     *   container: '#my-comments',
     *   comments: {
     *     pageId: '/comments',
     *     style: 'tabs',
     *     active: 'utterances',
     *     lazyload: true,
     *     storage: true,
     *     darkMode: 'auto',
     *     lang: 'zh-CN'
     *   },
     *   utterances: {
     *     enable: true,
     *     repo: 'user/repo',
     *     issue_term: 'pathname'
     *   },
     *   // 其他主题配置
     *   onReady: function(iframe, active) { console.log('评论已就绪，当前:', active); },
     *   onActiveChange: function(active) { console.log('切换到:', active); },
     *   onError: function(msg) { console.error('加载失败: ' + msg); }
     * });
     */
    DiversityComments.init = function(options) {
        // 合并配置
        _config = deepMerge(getDefaultConfig(), options || {});

        // server 未传入时，取脚本加载时捕获的地址，兜底到当前页面 origin
        if (!_config.server) {
            _config.server = _scriptOrigin || (global.location.origin || global.location.protocol + '//' + global.location.host);
        }

        // 查找挂载容器
        _container = document.querySelector(_config.container);
        if (!_container) {
            _onError('未找到挂载容器元素: ' + _config.container);
            return;
        }

        // 创建 iframe
        _createIframe();
    };

    /**
     * 创建 iframe 并加载 /comments/ 页面
     */
    function _createIframe() {
        // 移除已有 iframe
        if (_iframe) {
            _iframe.remove();
            _iframe = null;
        }

        _ready = false;

        // 构建 iframe URL
        var serverUrl = (_config.server || global.location.origin).replace(/\/+$/, '');
        var commentsConfig = _config.comments || {};
        var params = [
            'pageId=' + encodeURIComponent(commentsConfig.pageId || ''),
            'style=' + encodeURIComponent(commentsConfig.style || 'tabs'),
            'active=' + encodeURIComponent(commentsConfig.active || 'utterances'),
            'lang=' + encodeURIComponent(commentsConfig.lang || 'zh-CN')
        ].join('&');

        var iframeUrl = serverUrl + '/comments/?' + params;

        // 创建 iframe 元素
        _iframe = document.createElement('iframe');
        _iframe.src = iframeUrl;
        _iframe.style.width = '100%';
        _iframe.style.minHeight = '150px';
        _iframe.style.border = 'none';
        _iframe.style.overflow = 'hidden';
        _iframe.style.display = 'block';
        _iframe.setAttribute('allowtransparency', 'true');
        _iframe.setAttribute('frameborder', '0');
        _iframe.setAttribute('scrolling', 'no');

        // 清空容器并挂载 iframe
        _container.innerHTML = '';
        _container.appendChild(_iframe);

        // 记录父页面 URL
        var parentUrl = global.location.href;

        // 监听 iframe 加载完成
        _iframe.addEventListener('load', function() {
            // 向 iframe 发送初始化配置
            // v1.0.0: 发送完整的配置（comments + 各评论系统配置）
            var initConfig = {
                comments: _config.comments || {}
            };
            
            // 添加各评论系统配置
            var systems = ['utterances', 'gitalk', 'giscus', 'twikoo', 'gitment', 'waline'];
            for (var i = 0; i < systems.length; i++) {
                var name = systems[i];
                if (_config[name]) {
                    initConfig[name] = _config[name];
                }
            }
            
            _sendToIframe({
                type: 'diversity:init',
                config: initConfig,
                parentUrl: parentUrl
            });
        });

        // 监听 iframe 发送的消息
        global.addEventListener('message', _handleIframeMessage);
    }

    /**
     * 向 iframe 发送消息
     * @param {Object} data - 消息数据
     */
    function _sendToIframe(data) {
        if (_iframe && _iframe.contentWindow) {
            _iframe.contentWindow.postMessage(data, '*');
        } else {
            console.warn('[diversity-comments.js] Cannot send to iframe: _iframe=', _iframe);
        }
    }

    /**
     * 处理来自 iframe 的消息
     * @param {MessageEvent} event - 消息事件
     */
    function _handleIframeMessage(event) {
        if (!event.data || typeof event.data !== 'object') return;
        var data = event.data;

        // 转发 Gitalk/Gitment OAuth 回调消息（来自 callback.html 弹窗）
        // callback.html 用 window.opener.postMessage 发给父页面，父页面需要转发给 iframe
        if (data.type && (
            data.type.indexOf('diversity:gitalk:oauth') === 0 ||
            data.type.indexOf('diversity:gitment:oauth') === 0
        )) {
            _sendToIframe(data);
            return;
        }

        switch (data.type) {
            case 'diversity:ready':
                _ready = true;
                if (typeof _config.onReady === 'function') {
                    _config.onReady(_iframe, data.active);
                }
                break;

            case 'diversity:activeChanged':
                // iframe 侧切换评论系统后通知父页面
                if (typeof _config.onActiveChange === 'function') {
                    _config.onActiveChange(data.active);
                }
                break;

            case 'diversity:loaded':
                // iframe DOM 已加载（早于 ready）
                if (data.height) {
                    _iframe.style.height = data.height + 'px';
                }
                break;

            case 'diversity:resize':
                // iframe 高度变化，调整父页面 iframe 高度
                if (data.height && _iframe) {
                    _iframe.style.height = data.height + 'px';
                }
                break;

            case 'diversity:error':
                _onError(data.message || 'Unknown error');
                break;

            default:
                break;
        }
    }

    /**
     * 错误处理
     * @param {string} msg - 错误信息
     */
    function _onError(msg) {
        if (typeof _config.onError === 'function') {
            _config.onError(msg);
        } else {
            console.error('[DiversityComments] ' + msg);
        }
    }

    /**
     * 切换到指定的评论系统
     * 
     * @param {string} name - 评论系统名称: 'giscus' | 'utterances' | 'gitalk' | 'twikoo' | 'gitment' | 'waline'
     * 
     * @example
     * DiversityComments.switchTo('gitalk');
     */
    DiversityComments.switchTo = function(name) {
        if (!_ready) {
            console.warn('[DiversityComments] 评论系统尚未初始化完成');
            return;
        }
        _sendToIframe({
            type: 'diversity:switchTo',
            name: name
        });
    };

    /**
     * 设置深色/浅色模式
     * 
     * @param {string} scheme - 模式: 'light' | 'dark' | 'auto'
     * 
     * @example
     * DiversityComments.setColorScheme('dark');
     */
    DiversityComments.setColorScheme = function(scheme) {
        if (!_ready) {
            console.warn('[DiversityComments] 评论系统尚未初始化完成');
            return;
        }
        _sendToIframe({
            type: 'diversity:setColorScheme',
            scheme: scheme
        });
    };

    /**
     * 刷新当前评论系统
     * 
     * @example
     * DiversityComments.refresh();
     */
    DiversityComments.refresh = function() {
        if (!_ready) {
            console.warn('[DiversityComments] 评论系统尚未初始化完成');
            return;
        }
        _sendToIframe({
            type: 'diversity:refresh'
        });
    };

    /**
     * 销毁评论实例，移除 iframe 和事件监听
     * 
     * @example
     * DiversityComments.destroy();
     */
    DiversityComments.destroy = function() {
        if (_iframe) {
            _iframe.remove();
            _iframe = null;
        }
        if (_container) {
            _container.innerHTML = '';
        }
        _ready = false;
        global.removeEventListener('message', _handleIframeMessage);
    };

    /**
     * 获取当前配置（深拷贝）
     * 
     * @returns {Object} 当前配置对象
     * 
     * @example
     * var cfg = DiversityComments.getConfig();
     * console.log(cfg.server);
     */
    DiversityComments.getConfig = function() {
        return deepMerge({}, _config);
    };

    /**
     * 获取 SDK 默认配置（深拷贝，不会污染内部默认值）
     *
     * 可用于在初始化前查看所有可配置字段及其默认值，
     * 或基于默认配置进行扩展：
     *
     *     var config = DiversityComments.getDefaultConfig();
     *     config.utterances.repo = 'my-name/my-repo';
     *     DiversityComments.init(config);
     *
     * @returns {Object} 默认配置的深拷贝
     */
    DiversityComments.getDefaultConfig = function() {
        return getDefaultConfig();
    };

    /**
     * SDK 版本号
     * @type {string}
     */
    DiversityComments.version = '1.0.0';

    // 导出到全局
    global.DiversityComments = DiversityComments;

})(window);
