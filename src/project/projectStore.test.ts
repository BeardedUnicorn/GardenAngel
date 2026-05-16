import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "./projectStore";

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  useProjectStore.setState({
    current: null,
    isDirty: false,
    isBusy: false,
    lastError: null,
  });
  mockedInvoke.mockReset();
});

describe("projectStore", () => {
  it("loads metadata on newProject success", async () => {
    mockedInvoke.mockResolvedValueOnce({
      path: "/tmp/test.gardenangel",
      garden_id: 1,
      name: "Untitled Garden",
      created_at: "2026-05-16T00:00:00Z",
      format_version: 1,
      app_version: "0.1.0",
    });

    await useProjectStore.getState().newProject("/tmp/test.gardenangel");

    const state = useProjectStore.getState();
    expect(state.current?.name).toBe("Untitled Garden");
    expect(state.isDirty).toBe(false);
    expect(state.isBusy).toBe(false);
    expect(state.lastError).toBeNull();
  });

  it("records lastError on failure", async () => {
    mockedInvoke.mockRejectedValueOnce("disk full");

    await useProjectStore.getState().newProject("/tmp/test.gardenangel");

    const state = useProjectStore.getState();
    expect(state.current).toBeNull();
    expect(state.lastError).toBe("disk full");
  });

  it("clears dirty flag after save", async () => {
    mockedInvoke.mockResolvedValueOnce({
      path: "/tmp/test.gardenangel",
      garden_id: 1,
      name: "Untitled Garden",
      created_at: "2026-05-16T00:00:00Z",
      format_version: 1,
      app_version: "0.1.0",
    });
    await useProjectStore.getState().newProject("/tmp/test.gardenangel");
    useProjectStore.getState().markDirty();
    expect(useProjectStore.getState().isDirty).toBe(true);

    mockedInvoke.mockResolvedValueOnce(undefined);
    await useProjectStore.getState().saveProject();

    expect(useProjectStore.getState().isDirty).toBe(false);
  });

  it("closeProject resets state", async () => {
    useProjectStore.setState({
      current: {
        path: "/tmp/test.gardenangel",
        garden_id: 1,
        name: "Untitled Garden",
        created_at: "2026-05-16T00:00:00Z",
        format_version: 1,
        app_version: "0.1.0",
      },
      isDirty: true,
    });
    mockedInvoke.mockResolvedValueOnce(undefined);

    await useProjectStore.getState().closeProject();

    expect(useProjectStore.getState().current).toBeNull();
    expect(useProjectStore.getState().isDirty).toBe(false);
  });
});
