# Diversity Comments SDK

One API to integrate six comment systems, with iframe sandbox isolation — ready to use out of the box.

[中文说明/Chinese Documentation](README.md)

## Features

| Feature | Description |
|---------|-------------|
| **Six Comment Systems** | Utterances / Gitalk / Giscus / Twikoo / Gitment / Waline in one place |
| **iframe Sandbox** | Comments run in an isolated iframe — no style or script conflicts with your page |
| **Real-time Switching** | Switch comment systems with one API call. Supports Tab and Dropdown navigation |
| **Dark / Light Mode** | `light` / `dark` / `auto` — auto-detect system preference or switch manually |
| **Lazy Load & Memory** | Loads only when in viewport; localStorage remembers user's last choice |
| **Auto Height** | MutationObserver + timer dual protection; iframe height syncs to parent automatically |

## Quick Start

[Live Demo](https://huazie.github.io/demo/)

### Three Steps

**Step 1 — Place the container**

```html
<div id="diversity-comments"></div>
```

**Step 2 — Load the SDK**

```html
<script src="https://huazie.github.io/js/diversity-comments.js"></script>
```

**Step 3 — Initialize**

```javascript
DiversityComments.init({
    container: '#diversity-comments',
    comments: {
        pageId: '/posts/hello-world',
        style: 'tabs',           // 'tabs' | 'dropdown'
        active: 'utterances',
        lazyload: true,
        darkMode: 'auto'         // 'auto' | 'light' | 'dark'
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
        console.log('Ready:', active);
    },
    onActiveChange: function(active) {
        console.log('Switched to:', active);
    },
    onError: function(msg) {
        console.error('Error:', msg);
    }
});
```


💡 **Recommended**: When enabling multiple comment systems, it's recommended to call `DiversityComments.getDefaultConfig()` first to get the default config, then override the needed fields. This keeps your config in sync with SDK defaults. See [demo page](source/demo/index.html) for a complete example.

```javascript
var config = DiversityComments.getDefaultConfig();
config.comments.pageId = '/posts/hello-world';
config.utterances.enable = true;
config.utterances.repo = 'user/repo';
// ... other config
DiversityComments.init(config);
```

## Project Structure

```
diversity-comments-site/
├── source/
│   └── demo/
│       ├── index.html                      # SDK demo page
│       ├── index.css                       # Demo page styles
│       └── diversity.ico                   # Page icon
├── themes/
│   └── diversity/                          # Hexo theme
│       ├── _config.yml                     # Theme config file
│       ├── layout/                         # EJS templates
│       │   ├── layout.ejs                  # Page layout template
│       │   └── _partial/                   # Partial templates
│       │       └── head.ejs                # Head template
│       ├── scripts/                        # Theme scripts
│       │   ├── index.js                    # Theme core script
│       │   └── generator/                  # Generator scripts
│       │       ├── index.js                # Generator entry
│       │       └── empty.js                # Empty generator (placeholder)
│       └── source/                         # Theme static assets
│           ├── css/
│           │   └── style.css               # Theme styles (dark/light mode)
│           └── js/
│               ├── diversity.js            # Theme interaction script
│               └── diversity-comments.js   # SDK core file
├── _config.yml                             # Hexo config file
└── package.json                            # npm config file
```

## Configuration

### Common Options (`comments`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pageId` | string | `location.pathname` | Unique page identifier |
| `style` | string | `'tabs'` | Navigation style: `tabs` / `dropdown` |
| `active` | string | `'utterances'` | Default active comment system |
| `lazyload` | boolean | `true` | Load only when in viewport |
| `storage` | boolean | `true` | Remember user's last choice |
| `darkMode` | string | `'auto'` | `auto` / `light` / `dark` |
| `lang` | string | `'zh-CN'` | Language |

### Callbacks

| Parameter | Type | Description |
|-----------|------|-------------|
| `onReady` | function | Fired when initialized, args: `iframe`, `active` |
| `onError` | function | Fired on error, args: `msg` |
| `onActiveChange` | function | Fired on system switch, args: `active` |

### API Methods

| Method | Description |
|--------|-------------|
| `switchTo(name)` | Switch to a specific comment system |
| `setColorScheme(scheme)` | Switch light/dark mode |
| `refresh()` | Refresh current comments |
| `getConfig()` | Get current config (deep clone) |
| `destroy()` | Destroy instance, remove iframe |

## Six Comment Systems

### Utterances

GitHub Issues based, free and open source.

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

GitHub Issues based with OAuth support.

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

GitHub Discussions based with topic mapping.

> ⚠️ When embedded via iframe, you must add your domain to the Giscus whitelist, or OAuth will fail.

**Create `giscus.json` in your comment repository root:**

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

Tencent Cloud based, no registration required.

```javascript
twikoo: {
    enable: true,
    env_id: 'https://your-twikoo.vercel.app',
    lang: 'zh-CN'
}
```

### Gitment

GitHub Issues based.

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

LeanCloud based, feature-rich.

```javascript
waline: {
    enable: true,
    server_url: 'https://your-waline-server.vercel.app/.netlify/functions/comment',
    lang: 'zh-CN',
    dark: '.dark-theme'
}
```

## Plugin List

- [hexo-generator-comments](./packages/hexo-generator-comments/README_EN.md) - Hexo multi-comment system generator plugin, supporting integration and switching of multiple comment systems, providing a unified comment interface
- [hexo-comments-utterances](./packages/hexo-comments-utterances/README_EN.md) - Hexo Utterances comment plugin, supporting integration of Utterances comment system
- [hexo-comments-gitalk](./packages/hexo-comments-gitalk/README_EN.md) - Hexo Gitalk comment plugin, supporting integration of Gitalk comment system
- [hexo-comments-giscus](./packages/hexo-comments-giscus/README_EN.md) - Hexo Giscus comment plugin, supporting integration of Giscus comment system
- [hexo-comments-twikoo](./packages/hexo-comments-twikoo/README_EN.md) - Hexo Twikoo comment plugin, supporting integration of Twikoo comment system
- [hexo-comments-gitment](./packages/hexo-comments-gitment/README_EN.md) - Hexo Gitment comment plugin, supporting integration of Gitment comment system
- [hexo-comments-waline](./packages/hexo-comments-waline/README_EN.md) - Hexo Waline comment plugin, supporting integration of Waline comment system

## License

[MIT](LICENSE) © [huazie](https://github.com/huazie)
