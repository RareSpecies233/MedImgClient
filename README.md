# MedImgClient (Electron)

## 功能概览
- 顶部自定义导航栏：`主页`（不可关闭）、多个可关闭标签页、`+` 新建标签页
- 下方内容区：按选中标签显示主页或网页内容（`webview`，可交互）
- 主页包含：`开始使用`、`设置`
- 程序启动时自动拉起前端/后端 CLI 进程
- 仅当前后端 CLI 都处于运行状态时，`开始使用` 按钮可点击
- 点击 `开始使用`：打开一个新窗口并加载可配置链接
- 设置弹窗支持：
  - 前端 CLI 路径与参数
  - 后端 CLI 路径与参数
  - 守护功能（异常退出自动重启）
  - 新建标签页默认地址
  - `开始使用` 打开链接
  - 前后端 CLI 输出日志查看

## 项目文件
- `main.js`：主进程，窗口管理、CLI 进程管理、设置持久化、IPC
- `preload.js`：安全桥接 API
- `index.html`：界面结构
- `styles.css`：界面样式
- `renderer.js`：前端交互逻辑

## 运行
1. 安装依赖
   - `npm install`
2. 启动应用
   - `npm start`

## 说明
- 设置数据保存于 Electron `userData` 目录下的 `settings.json`
- macOS 使用 `titleBarStyle: hiddenInset`（保留左上角红绿灯）
- Windows/Linux 使用无边框 + 自定义按钮（右上角最小化/最大化/关闭）

## 网络安装失败排查
如果 `npm install` 失败（例如 TLS/网络中断），可重试：
- `npm config set registry https://registry.npmmirror.com`
- 再执行 `npm install`
- 安装成功后可按需切回默认 registry
