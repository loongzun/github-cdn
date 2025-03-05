# github-cdn
### 使用方法
在cloudflare中点击workers and pages 创建一个Workers,点击编辑代码将复制_workers.js的内容，粘贴进去。
点击部署，并配置自定义域名。
### 设置环境变量
1. 在 Worker 的设置页面中，找到 "环境变量" 部分
2. 点击 "添加变量" 按钮
3. 变量名： GITHUB_TOKEN
4. 值：您的 GitHub Token
5. 勾选 "加密" 选项以保护敏感信息
