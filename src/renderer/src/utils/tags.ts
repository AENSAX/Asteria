import type { TagDraft } from "../../../shared/ipc";
import type { CSSProperties } from "react";

export interface TagToken extends TagDraft {
  key: string;
  styleName?: string;
  color?: string | null;
  searchValue?: string;
}

export function parseTagText(value: string): TagDraft | null {
  const normalizedValue = value.trim().replace(/\s+/g, " ");

  if (!normalizedValue) {
    return null;
  }

  const separatorIndex = normalizedValue.indexOf(":");

  if (separatorIndex < 0) {
    return {
      namespace: "",
      name: normalizedValue,
    };
  }

  const namespace = normalizedValue.slice(0, separatorIndex).trim();
  const name = normalizedValue.slice(separatorIndex + 1).trim();

  if (!name) {
    return null;
  }

  return {
    namespace,
    name,
  };
}

export function createTagToken(
  tag: TagDraft & {
    styleName?: string;
    color?: string | null;
    searchValue?: string;
  },
): TagToken {
  const idKey = tag.id ? `id:${tag.id}` : "";
  const textKey = `${tag.namespace.trim().toLowerCase()}:${tag.name.trim().toLowerCase()}`;
  const token: TagToken = {
    namespace: tag.namespace.trim(),
    name: tag.name.trim(),
    key: idKey || textKey,
  };

  if (tag.id !== undefined) {
    token.id = tag.id;
  }

  if (tag.styleName !== undefined) {
    token.styleName = tag.styleName;
  }

  if (tag.color !== undefined) {
    token.color = tag.color;
  }

  if (tag.searchValue !== undefined) {
    token.searchValue = tag.searchValue;
  }

  return token;
}

export function formatTagLabel(
  tag: Pick<TagDraft, "namespace" | "name">,
): string {
  return tag.namespace ? `${tag.namespace}:${tag.name}` : tag.name;
}

export function getTagNamespaceClassName(
  tag: Pick<TagDraft, "namespace">,
  baseClassName: string,
): string {
  return tag.namespace
    ? `${baseClassName} border-(--tag-namespace-border) bg-(--tag-namespace-bg) text-(--tag-namespace-ink)`
    : baseClassName;
}

export function getTagNamespaceStyle(
  tag: Pick<TagDraft, "namespace">,
): CSSProperties | undefined {
  if (!tag.namespace) {
    return undefined;
  }

  const color = createNamespaceColor(tag.namespace);

  return {
    "--tag-namespace-bg": color.background,
    "--tag-namespace-border": color.border,
    "--tag-namespace-ink": color.ink,
  } as CSSProperties;
}

export function getSearchTokenStyle(
  tag: Pick<TagDraft, "namespace"> & { color?: string | null },
): CSSProperties | undefined {
  if (tag.color) {
    return {
      borderColor: tag.color,
      color: tag.color,
    };
  }

  return getTagNamespaceStyle(tag);
}

function createNamespaceColor(namespace: string): {
  background: string;
  border: string;
  ink: string;
} {
  const hue = hashNamespace(namespace) % 360;
  const namespaceColor = `hsl(${hue} 48% 52%)`;

  return {
    background: `color-mix(in srgb, ${namespaceColor} 22%, var(--tag-bg))`,
    border: namespaceColor,
    ink: "var(--ink)",
  };
}

function hashNamespace(namespace: string): number {
  let hash = 2166136261;

  for (const character of namespace.trim().toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
