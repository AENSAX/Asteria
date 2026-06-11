import { BrowserWindow, type WebContents } from "electron";
import {
  mainT,
  readWindowLanguageId,
  type MainTranslationKey,
} from "../i18n.js";

export async function createLocalizedIpcError(
  sender: WebContents,
  key: MainTranslationKey,
): Promise<Error> {
  const languageId = await readWindowLanguageId(
    BrowserWindow.fromWebContents(sender),
  );
  return new Error(mainT(languageId, key));
}
