import type { IpcMain } from "electron";
import type {
  ApiPermissionRecord,
  ApiServiceAvailability,
  ApiServiceDraft,
  ApiServiceRecord,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { createLocalizedIpcError } from "./ipcErrors.js";

export interface ApiHandlersContext {
  listApiPermissions: () => ApiPermissionRecord[];
  listApiServices: () => ApiServiceRecord[];
  createApiService: (name: string) => ApiServiceRecord[];
  updateApiService: (
    serviceId: number,
    draft: ApiServiceDraft,
  ) => ApiServiceRecord[];
  deleteApiService: (serviceId: number) => ApiServiceRecord[];
  getApiServiceRuntimeAvailability: (
    serviceId: number,
  ) => ApiServiceAvailability;
  syncApiServers: () => Promise<void>;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isApiServiceDraft(value: unknown): value is ApiServiceDraft {
  const draft = value as Partial<ApiServiceDraft> | null;

  return Boolean(
    draft &&
    typeof draft.name === "string" &&
    typeof draft.address === "string" &&
    typeof draft.port === "number" &&
    typeof draft.token === "string" &&
    typeof draft.enabled === "boolean" &&
    Array.isArray(draft.permissions),
  );
}

function createInvalidServiceAvailability(
  reason: string,
): ApiServiceAvailability {
  return {
    serviceId: 0,
    available: false,
    reason,
    enabled: false,
    address: "",
    port: 0,
    permissionCount: 0,
  };
}

export function registerApiHandlers(
  ipcMain: IpcMain,
  context: ApiHandlersContext,
): void {
  ipcMain.handle(IpcChannel.API_LIST_PERMISSIONS, () =>
    context.listApiPermissions(),
  );
  ipcMain.handle(IpcChannel.API_LIST_SERVICES, () => context.listApiServices());
  ipcMain.handle(
    IpcChannel.API_CREATE_SERVICE,
    async (event, name: unknown) => {
      if (typeof name !== "string") {
        throw await createLocalizedIpcError(
          event.sender,
          "api.invalidServiceName",
        );
      }

      const services = context.createApiService(name);
      await context.syncApiServers();
      return services;
    },
  );
  ipcMain.handle(
    IpcChannel.API_UPDATE_SERVICE,
    async (event, serviceId: unknown, draft: unknown) => {
      if (!isPositiveInteger(serviceId) || !isApiServiceDraft(draft)) {
        throw await createLocalizedIpcError(event.sender, "api.invalidService");
      }

      const services = context.updateApiService(serviceId, draft);
      await context.syncApiServers();
      return services;
    },
  );
  ipcMain.handle(
    IpcChannel.API_DELETE_SERVICE,
    async (event, serviceId: unknown) => {
      if (!isPositiveInteger(serviceId)) {
        throw await createLocalizedIpcError(event.sender, "api.invalidService");
      }

      const services = context.deleteApiService(serviceId);
      await context.syncApiServers();
      return services;
    },
  );
  ipcMain.handle(
    IpcChannel.API_GET_SERVICE_AVAILABILITY,
    async (event, serviceId: unknown) => {
      if (!isPositiveInteger(serviceId)) {
        const error = await createLocalizedIpcError(
          event.sender,
          "api.invalidService",
        );
        return createInvalidServiceAvailability(error.message);
      }

      return context.getApiServiceRuntimeAvailability(serviceId);
    },
  );
}
