# About 页面文章

About 页每个选项卡的文章都保存在此目录，文章结构与中英文文字放在同一个 JSON 文件中：

| 文件 | 对应内容 |
| --- | --- |
| `welcome.json` | 移动端欢迎页面 |
| `echo.json` | Echo |
| `wkjasdka.json` | W.K.Jasdka |
| `liuyanlin.json` | Liuyanlin |
| `contact.json` | 联系方式 |
| `privacy.json` | 隐私政策 |
| `terms.json` | 用户协议 |

## 修改文章

- `html` 是文章的 HTML 结构，每一项是一行 HTML。可调整段落、卡片和样式；注意 JSON 中的双引号需写成 `\"`。
- `translations.en.article` 是英文文字，`translations.zh-CN.article` 是简体中文文字。
- HTML 中的 `data-i18n="article.字段名"` 对应同一篇文章语言内容中的字段名。例如，`article.title` 对应 `translations.en.article.title` 和 `translations.zh-CN.article.title`。
- 翻译字段按纯文本显示；需要链接或其他 HTML 结构时，将标签放在 `html` 中，再给需要翻译的文字节点设置对应的 `data-i18n`。
- 每个占位段落与卡片使用独立字段，可分别编辑；目前尚未编写的正文仍保留原有的“内容”等占位文字。
- `contact.json` 的邮箱地址及其 `mailto:` 链接在 `html` 中；更改邮箱时请同时更新地址和链接目标。
- 增加文章语言时，在相应文件的 `translations` 中添加语言代码及相同字段，并在全站 i18n 中启用该语言。缺少单个译文时会回退到该文章的英文版本。

现有菜单项与文件名一一对应；增加新的选项卡或文章时，还需在 `about.html` 中添加菜单项并更新 `articleKeys` 白名单。文章加载失败时，页面会显示提示，重新选择该选项可重试。
