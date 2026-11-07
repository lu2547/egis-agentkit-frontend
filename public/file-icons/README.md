# 文件格式图标库

统一入口：`src/components/common/FileTypeIcon.vue`；格式映射：`src/domain/fileIcons.ts`。

SVG 图标复用本地 OpenCode UI 的文件格式图库（MIT，版权声明见 LICENSE），Word / Excel 调整为深浅背景均清晰的蓝色 / 绿色。图标保持原色，不随主题反色；同一套素材覆盖聊天产物、工作区列表、文件变更、附件及预览标题。代码按实际后缀识别，未知格式使用通用文件图标。
