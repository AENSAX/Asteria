import type { WorkStatus } from "../../../shared/ipc";
import {
  useLanguage,
  type TranslationFunction,
  type TranslationKey,
} from "../utils/language";

interface WorkStatusBarProps {
  status: WorkStatus;
}

export function WorkStatusBar({ status }: WorkStatusBarProps): JSX.Element {
  const { t } = useLanguage();

  return (
    <footer className="flex h-5 min-w-0 items-center border-t border-(--line) bg-(--statusbar-bg) px-2 text-[10px] text-(--muted)">
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {formatWorkStatus(status, t)}
      </span>
    </footer>
  );
}

function formatWorkStatus(status: WorkStatus, t: TranslationFunction): string {
  const message = formatWorkStatusMessage(status, t);

  if (!status.active) {
    return message || t("app.status.ready");
  }

  return t("app.workStatus", {
    message,
    queued: status.queued,
    processing: status.processing,
    completed: status.completed,
  });
}

function formatWorkStatusMessage(
  status: WorkStatus,
  t: TranslationFunction,
): string {
  if (status.messageKey) {
    return t(status.messageKey as TranslationKey, status.messageValues);
  }

  const { message } = status;

  if (!message) {
    return "";
  }

  const imageConversionPrefix = "正在转换图片为 PNG: ";

  if (message.startsWith(imageConversionPrefix)) {
    return t("app.workStatus.imageConverting", {
      name: message.slice(imageConversionPrefix.length),
    });
  }

  const messageKeyByText: Partial<
    Record<string, Parameters<TranslationFunction>[0]>
  > = {
    缓存就绪: "app.workStatus.thumbnailReady",
    正在生成缩略图: "app.workStatus.thumbnailGenerating",
    模型打标空闲: "app.workStatus.aiIdle",
    正在模型打标: "app.workStatus.aiTagging",
    模型打标完成: "app.workStatus.aiDone",
    图片转换空闲: "app.workStatus.imageConversionIdle",
    标签翻译空闲: "app.workStatus.tagTranslationIdle",
    正在翻译标签: "app.workStatus.tagTranslating",
    标签翻译完成: "app.workStatus.tagTranslationDone",
  };

  const messageKey = messageKeyByText[message];

  return messageKey ? t(messageKey) : message;
}
