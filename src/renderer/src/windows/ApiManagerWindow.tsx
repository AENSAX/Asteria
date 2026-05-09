import { useEffect, useState } from "react";
import type {
  ApiPermissionRecord,
  ApiServiceAvailability,
  ApiServiceDraft,
  ApiServiceRecord,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";

const defaultServiceName = "API 服务";
const apiShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[190px_minmax(0,1fr)] bg-(--panel)";
const apiSidebarClass =
  "flex min-h-0 min-w-0 flex-col border-r border-(--line) bg-(--surface-bg)";
const apiSidebarHeaderClass =
  "h-7 border-b border-(--line) bg-(--panel-strong) px-2 leading-7 text-[11px] font-semibold";
const apiSidebarListClass = "min-h-0 overflow-auto";
const apiSidebarItemClass =
  "grid min-h-[26px] w-full grid-cols-[18px_minmax(0,1fr)_48px] items-center border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px] text-(--ink)";
const apiSidebarActiveClass = "bg-(--surface-raised-bg)";
const apiSidebarCreateClass =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 border-t border-(--line) p-2";
const apiInputClass =
  "h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)";
const apiButtonClass =
  "h-6 cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink)";
const apiContentClass =
  "grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-(--panel)";
const apiToolbarClass =
  "flex min-h-0 items-center gap-1.5 border-b border-(--line) bg-(--panel) p-2 text-[11px]";
const apiInlineCheckClass = "flex min-w-0 items-center gap-1.5 text-(--ink)";
const apiAvailabilityClass =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)";
const apiGridClass =
  "grid gap-1.5 border-b border-(--line) bg-(--surface-bg) p-2";
const apiFieldClass =
  "grid grid-cols-[84px_minmax(0,1fr)] items-center gap-1.5 [&>span]:text-(--muted) [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-inset-bg) [&>input]:px-1.5 [&>input]:text-(--ink)";
const apiPermissionPanelClass =
  "grid min-h-0 grid-rows-[24px_minmax(0,1fr)] border border-(--line) bg-(--panel)";
const apiPermissionHeaderClass =
  "flex items-center justify-between border-b border-(--line) bg-(--surface-raised-bg) px-2 text-[11px]";
const apiPermissionListClass = "min-h-0 overflow-auto";
const apiPermissionItemClass =
  "grid min-h-6 grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 border-b border-(--line) px-2 text-[11px]";
const apiEmptyClass = "p-2 text-(--muted)";

export function ApiManagerWindow(): JSX.Element {
  const [services, setServices] = useState<ApiServiceRecord[]>([]);
  const [permissions, setPermissions] = useState<ApiPermissionRecord[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(
    null,
  );
  const [draft, setDraft] = useState<ApiServiceDraft | null>(null);
  const [availability, setAvailability] =
    useState<ApiServiceAvailability | null>(null);
  const [serviceInput, setServiceInput] = useState("");
  const [message, setMessage] = useState("未加载");
  const selectedService =
    services.find((service) => service.id === selectedServiceId) ?? null;

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    setDraft(selectedService ? createDraftFromService(selectedService) : null);
    void loadAvailability(selectedService?.id ?? null);
  }, [selectedServiceId, services]);

  async function loadInitialState(
    nextSelectedServiceId?: number,
  ): Promise<void> {
    if (!window.asteria) {
      setMessage("preload unavailable");
      return;
    }

    const [nextPermissions, nextServices] = await Promise.all([
      window.asteria.listApiPermissions(),
      window.asteria.listApiServices(),
    ]);
    const nextSelectedId =
      nextSelectedServiceId ??
      (selectedServiceId &&
      nextServices.some((service) => service.id === selectedServiceId)
        ? selectedServiceId
        : (nextServices[0]?.id ?? null));

    setPermissions(nextPermissions);
    setServices(nextServices);
    setSelectedServiceId(nextSelectedId);
    setMessage(`${nextServices.length} 个 API 服务`);
  }

  async function loadAvailability(serviceId: number | null): Promise<void> {
    if (!window.asteria || serviceId === null) {
      setAvailability(null);
      return;
    }

    setAvailability(await window.asteria.getApiServiceAvailability(serviceId));
  }

  async function createService(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextServices = await window.asteria.createApiService(
      serviceInput || defaultServiceName,
    );
    const createdService =
      nextServices[nextServices.length - 1] ?? nextServices[0] ?? null;

    setServices(nextServices);
    setSelectedServiceId(createdService?.id ?? null);
    setServiceInput("");
    setMessage(`${nextServices.length} 个 API 服务`);
  }

  async function saveService(): Promise<void> {
    if (!window.asteria || !draft || selectedServiceId === null) {
      return;
    }

    const nextServices = await window.asteria.updateApiService(
      selectedServiceId,
      draft,
    );
    setServices(nextServices);
    setMessage(`${nextServices.length} 个 API 服务`);
    await loadAvailability(selectedServiceId);
  }

  async function deleteService(): Promise<void> {
    if (!window.asteria || selectedServiceId === null) {
      return;
    }

    const nextServices =
      await window.asteria.deleteApiService(selectedServiceId);

    setServices(nextServices);
    setSelectedServiceId(nextServices[0]?.id ?? null);
    setMessage("已删除");
  }

  function updateDraft(patch: Partial<ApiServiceDraft>): void {
    setDraft((currentDraft) =>
      currentDraft ? { ...currentDraft, ...patch } : currentDraft,
    );
  }

  function togglePermission(permissionId: string): void {
    if (!draft) {
      return;
    }

    updateDraft({
      permissions: draft.permissions.includes(permissionId)
        ? draft.permissions.filter((id) => id !== permissionId)
        : [...draft.permissions, permissionId],
    });
  }

  return (
    <ResizableColumns
      className={apiShellClass}
      defaultLeftWidth={190}
      minLeftWidth={140}
      minRightWidth={400}
      storageKey="asteria:api-manager-sidebar-width"
      left={
        <aside className={apiSidebarClass}>
          <header className={apiSidebarHeaderClass}>服务列表</header>
          <div className={apiSidebarListClass}>
            {services.length > 0 ? (
              services.map((service) => (
                <button
                  className={`${apiSidebarItemClass} ${service.id === selectedServiceId ? apiSidebarActiveClass : ""}`}
                  key={service.id}
                  type="button"
                  onClick={() => setSelectedServiceId(service.id)}
                >
                  <span className="text-center text-(--success-ink)">
                    {service.enabled ? "√" : ""}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {service.name}
                  </span>
                  <span className="text-right text-(--muted)">
                    {service.port}
                  </span>
                </button>
              ))
            ) : (
              <div className={apiEmptyClass}>没有 API 服务</div>
            )}
          </div>
          <div className={apiSidebarCreateClass}>
            <input
              className={apiInputClass}
              aria-label="新建 API"
              placeholder="输入 API 名称"
              value={serviceInput}
              onChange={(event) => setServiceInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void createService();
                }
              }}
            />
            <button type="button" onClick={() => void createService()}>
              新建
            </button>
          </div>
        </aside>
      }
      right={
        <main className={apiContentClass}>
          {draft ? (
            <>
              <header className={apiToolbarClass}>
                <label className={apiInlineCheckClass}>
                  <input
                    checked={draft.enabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft({ enabled: event.target.checked })
                    }
                  />
                  <span>启用</span>
                </label>
                <ActionFeedbackButton label="保存" onAction={saveService} />
                <button
                  className={apiButtonClass}
                  type="button"
                  onClick={() => void deleteService()}
                >
                  删除
                </button>
                <button
                  className={apiButtonClass}
                  disabled={!selectedService}
                  type="button"
                  onClick={() => void loadAvailability(selectedServiceId)}
                >
                  检查
                </button>
                <span
                  className={
                    availability?.available
                      ? "text-(--success-ink)"
                      : apiAvailabilityClass
                  }
                >
                  {availability ? availability.reason : message}
                </span>
              </header>

              <div className={apiGridClass}>
                <label className={apiFieldClass}>
                  <span>名称</span>
                  <input
                    aria-label="API 名称"
                    placeholder="输入 API 名称"
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft({ name: event.target.value })
                    }
                  />
                </label>
                <label className={apiFieldClass}>
                  <span>地址</span>
                  <input
                    aria-label="API 地址"
                    placeholder="输入 API 地址"
                    value={draft.address}
                    onChange={(event) =>
                      updateDraft({ address: event.target.value })
                    }
                  />
                </label>
                <label className={apiFieldClass}>
                  <span>端口</span>
                  <input
                    aria-label="API 端口"
                    placeholder="输入 API 端口"
                    type="number"
                    value={draft.port}
                    onChange={(event) =>
                      updateDraft({ port: Number(event.target.value) })
                    }
                  />
                </label>
                <label className={apiFieldClass}>
                  <span>校验 token</span>
                  <input
                    aria-label="API token"
                    placeholder="输入校验 token"
                    value={draft.token}
                    onChange={(event) =>
                      updateDraft({ token: event.target.value })
                    }
                  />
                </label>
              </div>

              <section className={apiPermissionPanelClass}>
                <header className={apiPermissionHeaderClass}>
                  <span>权限</span>
                  <span>
                    {draft.permissions.length} / {permissions.length}
                  </span>
                </header>
                <div className={apiPermissionListClass}>
                  {permissions.map((permission) => (
                    <label
                      className={apiPermissionItemClass}
                      key={permission.id}
                    >
                      <input
                        checked={draft.permissions.includes(permission.id)}
                        type="checkbox"
                        onChange={() => togglePermission(permission.id)}
                      />
                      <span>{permission.name}</span>
                      <span>{permission.description}</span>
                    </label>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className={apiEmptyClass}>请新建 API 服务</div>
          )}
        </main>
      }
    />
  );
}

function createDraftFromService(service: ApiServiceRecord): ApiServiceDraft {
  return {
    name: service.name,
    address: service.address,
    port: service.port,
    token: service.token,
    enabled: service.enabled,
    permissions: [...service.permissions],
  };
}
