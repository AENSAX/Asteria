import { useEffect, useState } from 'react';
import type {
  ApiPermissionRecord,
  ApiServiceAvailability,
  ApiServiceDraft,
  ApiServiceRecord
} from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';
import { ResizableColumns } from '../components/ResizableColumns';

const defaultServiceName = 'API 服务';

export function ApiManagerWindow(): JSX.Element {
  const [services, setServices] = useState<ApiServiceRecord[]>([]);
  const [permissions, setPermissions] = useState<ApiPermissionRecord[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ApiServiceDraft | null>(null);
  const [availability, setAvailability] = useState<ApiServiceAvailability | null>(null);
  const [serviceInput, setServiceInput] = useState('');
  const [message, setMessage] = useState('未加载');
  const selectedService = services.find((service) => service.id === selectedServiceId) ?? null;

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    setDraft(selectedService ? createDraftFromService(selectedService) : null);
    void loadAvailability(selectedService?.id ?? null);
  }, [selectedServiceId, services]);

  async function loadInitialState(nextSelectedServiceId?: number): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    const [nextPermissions, nextServices] = await Promise.all([
      window.asteria.listApiPermissions(),
      window.asteria.listApiServices()
    ]);
    const nextSelectedId =
      nextSelectedServiceId ??
      (selectedServiceId && nextServices.some((service) => service.id === selectedServiceId)
        ? selectedServiceId
        : nextServices[0]?.id ?? null);

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

    const nextServices = await window.asteria.createApiService(serviceInput || defaultServiceName);
    const createdService = nextServices[nextServices.length - 1] ?? nextServices[0] ?? null;

    setServices(nextServices);
    setSelectedServiceId(createdService?.id ?? null);
    setServiceInput('');
    setMessage(`${nextServices.length} 个 API 服务`);
  }

  async function saveService(): Promise<void> {
    if (!window.asteria || !draft || selectedServiceId === null) {
      return;
    }

    const nextServices = await window.asteria.updateApiService(selectedServiceId, draft);
    setServices(nextServices);
    setMessage(`${nextServices.length} 个 API 服务`);
    await loadAvailability(selectedServiceId);
  }

  async function deleteService(): Promise<void> {
    if (!window.asteria || selectedServiceId === null) {
      return;
    }

    const nextServices = await window.asteria.deleteApiService(selectedServiceId);

    setServices(nextServices);
    setSelectedServiceId(nextServices[0]?.id ?? null);
    setMessage('已删除');
  }

  function updateDraft(patch: Partial<ApiServiceDraft>): void {
    setDraft((currentDraft) => (currentDraft ? { ...currentDraft, ...patch } : currentDraft));
  }

  function togglePermission(permissionId: string): void {
    if (!draft) {
      return;
    }

    updateDraft({
      permissions: draft.permissions.includes(permissionId)
        ? draft.permissions.filter((id) => id !== permissionId)
        : [...draft.permissions, permissionId]
    });
  }

  return (
    <ResizableColumns
      className="api-manager-window"
      defaultLeftWidth={190}
      minLeftWidth={140}
      minRightWidth={400}
      storageKey="asteria:api-manager-sidebar-width"
      left={(
        <aside className="api-service-panel">
        <header>服务列表</header>
        <div className="api-service-list">
          {services.length > 0 ? (
            services.map((service) => (
              <button
                className={service.id === selectedServiceId ? 'api-service-item active' : 'api-service-item'}
                key={service.id}
                type="button"
                onClick={() => setSelectedServiceId(service.id)}
              >
                <span className="api-service-enabled-mark">{service.enabled ? '√' : ''}</span>
                <span>{service.name}</span>
                <span>{service.port}</span>
              </button>
            ))
          ) : (
            <div className="api-service-empty">没有 API 服务</div>
          )}
        </div>
        <div className="api-service-create">
          <input
            aria-label="新建 API"
            placeholder="输入 API 名称"
            value={serviceInput}
            onChange={(event) => setServiceInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void createService();
              }
            }}
          />
          <button type="button" onClick={() => void createService()}>
            新建
          </button>
        </div>
        </aside>
      )}
      right={(
        <main className="api-manager-content">
        {draft ? (
          <>
            <header className="api-manager-toolbar">
              <label className="api-inline-check">
                <input
                  checked={draft.enabled}
                  type="checkbox"
                  onChange={(event) => updateDraft({ enabled: event.target.checked })}
                />
                <span>启用</span>
              </label>
              <ActionFeedbackButton label="保存" onAction={saveService} />
              <button type="button" onClick={() => void deleteService()}>
                删除
              </button>
              <button disabled={!selectedService} type="button" onClick={() => void loadAvailability(selectedServiceId)}>
                检查
              </button>
              <span className={availability?.available ? 'api-availability available' : 'api-availability'}>
                {availability ? availability.reason : message}
              </span>
            </header>

            <div className="api-config-grid">
              <label>
                <span>名称</span>
                <input
                  aria-label="API 名称"
                  placeholder="输入 API 名称"
                  value={draft.name}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                />
              </label>
              <label>
                <span>地址</span>
                <input
                  aria-label="API 地址"
                  placeholder="输入 API 地址"
                  value={draft.address}
                  onChange={(event) => updateDraft({ address: event.target.value })}
                />
              </label>
              <label>
                <span>端口</span>
                <input
                  aria-label="API 端口"
                  placeholder="输入 API 端口"
                  type="number"
                  value={draft.port}
                  onChange={(event) => updateDraft({ port: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>校验 token</span>
                <input
                  aria-label="API token"
                  placeholder="输入校验 token"
                  value={draft.token}
                  onChange={(event) => updateDraft({ token: event.target.value })}
                />
              </label>
            </div>

            <section className="api-permission-panel">
              <header>
                <span>权限</span>
                <span>{draft.permissions.length} / {permissions.length}</span>
              </header>
              <div className="api-permission-list">
                {permissions.map((permission) => (
                  <label className="api-permission-item" key={permission.id}>
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
          <div className="api-service-empty">请新建 API 服务</div>
        )}
        </main>
      )}
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
    permissions: [...service.permissions]
  };
}
