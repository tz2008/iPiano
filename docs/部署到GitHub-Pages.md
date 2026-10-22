# 部署到 GitHub Pages

项目是纯静态站点（无构建），可以直接用 GitHub Pages 托管，获得 HTTPS 地址，
从而启用 iPad 上的**麦克风跟练**与**离线缓存**。

最终地址形如：`https://你的用户名.github.io/仓库名/`

---

## 一、准备工作（一次性）

### 1. 安装 Git

Windows 下载：https://git-scm.com/download/win

安装后在 PowerShell 或 Git Bash 里确认：

```bash
git --version
```

### 2. 配置 Git 身份

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

> 邮箱建议与 GitHub 账号一致，提交记录才会关联到你。

### 3. 准备 GitHub 账号

没有的话到 https://github.com 注册（免费）。

---

## 二、在 GitHub 上创建仓库

1. 打开 https://github.com/new
2. **Repository name** 填 `ipiano`（或任意名字，会出现在网址里）
3. 可见性选 **Public**
   > GitHub Pages 免费账号要求仓库公开；私有仓库需要 Pro。
4. **不要**勾选 "Add a README file" / ".gitignore" / "license"（本地已有）
5. 点 **Create repository**

创建后会看到一个空仓库页面，里面有仓库地址，形如：

```
https://github.com/你的用户名/ipiano.git
```

---

## 三、把本地代码推上去

项目已经在本地初始化好 git 并完成首次提交。打开终端，进入项目目录：

```bash
cd "C:\Users\Administrator\Desktop\iPiano"
```

### 1. 关联远程仓库

把下面的地址换成你自己的：

```bash
git remote add origin https://github.com/你的用户名/ipiano.git
```

### 2. 推送

```bash
git push -u origin main
```

**首次推送会要求登录**。GitHub 已不支持密码，需要用 **Personal Access Token**：

1. 打开 https://github.com/settings/tokens
2. **Generate new token (classic)**
3. Note 随便填（如 `ipiano-deploy`），Expiration 选 90 天
4. 勾选 **`repo`** 权限（必须）
5. 点 **Generate token**，**立刻复制**（只显示一次）
6. 回到终端：
   - Username 填 GitHub 用户名
   - Password 粘贴刚才的 token（不是账号密码）

> 也可以安装 [GitHub CLI](https://cli.github.com/) 后运行 `gh auth login`，
> 之后推送会自动使用已登录的凭据。

---

## 四、开启 GitHub Pages

推送成功后：

1. 打开仓库页面 → **Settings**（顶部菜单）
2. 左侧栏 → **Pages**
3. **Build and deployment** → **Source** 选择 **GitHub Actions**
   > 不要选 "Deploy from a branch"，本项目用的是 Actions 工作流。
4. 不需要手动选分支，工作流已经配置好

---

## 五、等待自动部署

仓库里已包含 `.github/workflows/deploy.yml`，每次推送到 `main` 会自动：

1. 安装依赖
2. **跑全部测试**（8 个测试文件，任一失败则停止部署）
3. 只打包运行所需文件到 `_site/`（排除测试代码、`node_modules`、`scripts`）
4. 发布到 GitHub Pages

查看进度：

- 仓库页面 → **Actions** 标签 → 点最新一次 **Deploy to GitHub Pages**
- 约 1–2 分钟完成
- 成功后 Settings → Pages 顶部会显示 **Your site is live at ...**

---

## 六、在 iPad 上使用

1. 用 Safari 打开 `https://你的用户名.github.io/ipiano/`
2. 点 **分享** → **添加到主屏幕**
3. 从主屏幕图标打开，即为全屏应用

此时：

| 功能 | 状态 |
|---|---|
| 麦克风跟练（唱谱 / 跟弹） | ✅ 可用（HTTPS 满足安全上下文要求） |
| 离线使用 | ✅ 首次加载后由 Service Worker 缓存 |
| 数据保存 | ✅ 存在 iPad 本地（建议定期用「数据备份」导出） |

---

## 常见问题

### 页面 404

- 确认 Settings → Pages → Source 已选 **GitHub Actions**
- 确认 Actions 里最新一次部署是绿色 ✅
- 网址末尾要有斜杠：`.../ipiano/`

### 样式或脚本没加载

本项目全部使用相对路径，放在子路径下也能正常工作。
若出现异常，按 `Ctrl + Shift + R` 强制刷新，或清除 Service Worker 缓存
（Safari：设置 → Safari → 高级 → 网站数据 → 删除本站数据）。

### 麦克风没有反应

- 必须是 `https://` 地址（GitHub Pages 默认就是）
- Safari 会询问麦克风权限，要选「允许」
- 若之前误点拒绝：设置 → Safari → 麦克风 → 允许此网站

### 推送被拒绝（rejected）

远程仓库比本地新（例如创建时勾选了 README）：

```bash
git pull origin main --allow-unrelated-histories
git push origin main
```

### 更新代码后 iPad 还是旧版本

Service Worker 采用 cache-first。刷新一次页面让新的 SW 接管，
或在 `sw.js` 里修改 `CACHE` 版本号后重新推送（会自动触发更新）。

### 想换成自定义域名

1. 在仓库 Settings → Pages → Custom domain 填入域名
2. 在域名服务商处添加 CNAME 记录指向 `你的用户名.github.io`
3. 勾选 Enforce HTTPS（证书签发需要几分钟）

---

## 附：本地预览

不想每次都推送到 GitHub 才能看效果时：

```bash
node server.js
```

然后打开 http://localhost:8123 。
注意：局域网 IP（如 `http://192.168.1.5:8123`）不是安全上下文，
iPad 通过它访问时麦克风跟练不可用，但其余功能正常。
