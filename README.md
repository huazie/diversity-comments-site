# Diversity Comments SDK

一套 API 集成六大评论系统，基于 iframe 沙箱隔离，开箱即用的多评论方案。

[英文说明/English Documentation](README_EN.md)

## 功能特性

| 特性 | 说明 |
|------|------|
| **六大评论系统** | Utterances / Gitalk / Giscus / Twikoo / Gitment / Waline 一站集成 |
| **iframe 沙箱隔离** | 评论区运行在独立 iframe 中，不影响宿主页面样式和脚本 |
| **实时切换** | API 一行代码切换评论系统，支持 Tab 和 Dropdown 两种导航模式 |
| **明暗模式** | 支持 `light` / `dark` / `auto` 三种模式，自动跟随系统或手动切换 |
| **懒加载 & 记忆** | 进入视口才加载评论，localStorage 记住用户上次选择的评论系统 |
| **自动高度** | MutationObserver + 定时器双保险，iframe 高度实时同步到父页面 |

## 快速开始

[在线演示](https://huazie.github.io/demo/) · [SDK 文档](#快速开始)

### 三步接入

**Step 1 — 放置容器**

```html
<div id="diversity-comments"></div>
```

**Step 2 — 引入 SDK**

```html
<script src="https://huazie.github.io/js/diversity-comments.js"></script>
```

**Step 3 — 初始化**

```javascript
DiversityComments.init({
    container: '#diversity-comments',
    comments: {
        pageId: '/posts/hello-world',  // 页面唯一标识
        style: 'tabs',                  // 'tabs' | 'dropdown'
        active: 'utterances',           // 默认评论系统
        lazyload: true,                 // 懒加载
        darkMode: 'auto'                // 'auto' | 'light' | 'dark'
    },
    utterances: {
        enable: true,
        repo: 'user/repo',
        issue_term: 'pathname',
        theme: 'github-light',
        dark: 'github-dark'
    },
    giscus: {
        enable: true,
        repo: 'user/repo',
        repo_id: 'R_xxx',
        category: 'Announcements',
        category_id: 'DIC_xxx',
        mapping: 'pathname',
        theme: 'light',
        dark: 'dark'
    },
    onReady: function(iframe, active) {
        console.log('评论已就绪，当前:', active);
    },
    onActiveChange: function(active) {
        console.log('切换到:', active);
    },
    onError: function(msg) {
        console.error('加载失败:', msg);
    }
});
```

## 项目结构

```
diversity-comments-site/
├── source/
│   └── demo/
│       ├── index.html                      # SDK 演示页面
│       ├── index.css                       # 演示页面样式
│       └── diversity.ico                   # 页面图标
├── themes/
│   └── diversity/                          # Hexo 主题
│       ├── _config.yml                     # 主题配置文件
│       ├── layout/                         # EJS 模板
│       │   ├── layout.ejs                  # 页面布局模板
│       │   └── _partial/                   # 局部模板
│       │       └── head.ejs                # 头部模板
│       ├── scripts/                        # 主题脚本
│       │   ├── index.js                    # 主题核心脚本
│       │   └── generator/                  # 生成器脚本
│       │       ├── index.js                # 生成器入口
│       │       └── empty.js                # 空生成器（占位）
│       └── source/                         # 主题静态资源
│           ├── css/
│           │   └── style.css               # 主题样式（支持明暗模式）
│           └── js/
│               └── diversity-comments.js   # SDK 核心文件
├── _config.yml                             # Hexo 配置文件
└── package.json                            # npm 配置文件
```

## 配置参数

### 通用配置 (`comments`)

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `pageId` | string | `location.pathname` | 页面唯一标识 |
| `style` | string | `'tabs'` | 显示模式：`tabs` / `dropdown` |
| `active` | string | `'utterances'` | 默认激活的评论系统 |
| `lazyload` | boolean | `true` | 进入视口才加载评论 |
| `storage` | boolean | `true` | 记住用户选择的评论系统 |
| `darkMode` | string | `'auto'` | `auto` / `light` / `dark` |
| `lang` | string | `'zh-CN'` | 语言设置 |

### 回调函数

| 参数 | 类型 | 说明 |
|------|------|------|
| `onReady` | function | 初始化完成回调，参数 `iframe` / `active` |
| `onError` | function | 错误回调，参数 `msg` |
| `onActiveChange` | function | 评论系统变更回调，参数 `active` |

### API 方法

| 方法 | 说明 |
|------|------|
| `switchTo(name)` | 切换到指定评论系统 |
| `setColorScheme(scheme)` | 切换明暗模式 |
| `refresh()` | 刷新当前评论 |
| `getConfig()` | 获取当前配置（深拷贝） |
| `destroy()` | 销毁实例，移除 iframe |

## 六大评论系统

### Utterances

基于 GitHub Issues 的评论系统，免费开源。

```javascript
utterances: {
    enable: true,
    repo: 'owner/comments-repo',
    issue_term: 'pathname',
    theme: 'github-light',
    dark: 'github-dark'
}
```

### Gitalk

基于 GitHub Issues 的评论组件，支持 OAuth。

```javascript
gitalk: {
    enable: true,
    github_id: 'your-github-id',
    repo: 'comment-repo',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    admin_user: 'your-github-id',
    proxy: 'https://your-oauth-proxy.com/api/auth'
}
```

### Giscus

基于 GitHub Discussions 的评论系统，支持主题映射。

> ⚠️ 通过 iframe 嵌入时，需将网站域名加入 Giscus 白名单，否则 OAuth 授权会失败。

**在评论仓库根目录创建 `giscus.json`：**

```json
{
  "origins": [
    "http://localhost:4000",
    "https://your-domain.com"
  ]
}
```

```javascript
giscus: {
    enable: true,
    repo: 'owner/comments-repo',
    repo_id: 'R_xxx',
    category: 'Announcements',
    category_id: 'DIC_xxx',
    mapping: 'pathname',
    theme: 'light',
    dark: 'dark'
}
```

### Twikoo

基于腾讯云的评论系统，无需申请。

```javascript
twikoo: {
    enable: true,
    env_id: 'https://your-twikoo.vercel.app',
    lang: 'zh-CN'
}
```

### Gitment

基于 GitHub Issues 的评论组件。

```javascript
gitment: {
    enable: true,
    owner: 'your-github-id',
    repo: 'comment-repo',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET'
}
```

### Waline

基于 LeanCloud 的评论系统，功能丰富。

```javascript
waline: {
    enable: true,
    server_url: 'https://your-waline-server.vercel.app/.netlify/functions/comment',
    lang: 'zh-CN',
    dark: '.dark-theme'
}
```

## 插件列表

- [hexo-generator-comments](./packages/hexo-generator-comments/README.md) - Hexo 多评论系统生成插件，支持多种评论系统的集成与切换，提供统一的评论界面。
- [hexo-comments-utterances](./packages/hexo-comments-utterances/README.md) - Hexo Utterances 评论插件，支持 Utterances 评论系统的集成
- [hexo-comments-gitalk](./packages/hexo-comments-gitalk/README.md) - Hexo Gitalk 评论插件，支持 Gitalk 评论系统的集成
- [hexo-comments-giscus](./packages/hexo-comments-giscus/README.md) - Hexo Giscus 评论插件，支持 Giscus 评论系统的集成
- [hexo-comments-twikoo](./packages/hexo-comments-twikoo/README.md) - Hexo Twikoo 评论插件，支持 Twikoo 评论系统的集成
- [hexo-comments-gitment](./packages/hexo-comments-gitment/README.md) - Hexo Gitment 评论插件，支持 Gitment 评论系统的集成
- [hexo-comments-waline](./packages/hexo-comments-waline/README.md) - Hexo Waline 评论插件，支持 Waline 评论系统的集成

## 许可证

[MIT](LICENSE) © [huazie](https://github.com/huazie)
