!macro customUnInit
  ${IfNot} ${Silent}
    MessageBox MB_ICONEXCLAMATION|MB_YESNO \
      "卸载 Asteria 将删除整个安装目录，并删除个人配置、布局配置、数据库、默认文件库和缩略图缓存。$\r$\n$\r$\n如果你需要保留媒体文件或数据库，请先备份相关文件夹。$\r$\n$\r$\n确认继续卸载吗？" \
      IDYES +2
    Abort
  ${EndIf}
!macroend

!macro customInstall
  SetShellVarContext current
  CreateDirectory "$APPDATA\Asteria"
  CreateDirectory "$APPDATA\Asteria\data"
  CreateDirectory "$APPDATA\Asteria\library-files"
  CreateDirectory "$APPDATA\Asteria\thumbnail-cache"
  CreateDirectory "$APPDATA\Asteria\page-layouts"
  CreateDirectory "$APPDATA\Asteria\runtime"
!macroend
