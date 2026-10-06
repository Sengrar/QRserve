import { describe, it, expect } from "vitest";
import { ServiceRequestType, ServiceRequestStatus } from "@prisma/client";

// Mock helpers and data structures mirroring our client engine
interface MockServiceRequest {
  id: string;
  restaurantId: string;
  tableId: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  message: string | null;
  createdAt: string;
  table: {
    tableNumber: string;
    name: string | null;
  };
}

class ServiceRequestNotificationEngine {
  public knownRequestIds = new Set<string>();
  public acknowledgedRequestIds = new Set<string>();
  public pendingCount = 0;
  public soundEnabled = true;
  public repeatIntervalSeconds = 60;
  public lastAlertTimestamp = 0;
  public activeToasts: Array<{ id: string; isReminder?: boolean; message: string | null }> = [];
  public chimePlayedCount = 0;
  public reminderPlayedCount = 0;
  public browserNotificationsSent: Array<{ title: string; body: string; tag: string }> = [];

  private isFirstPoll = true;
  private restaurantId: string;

  constructor(restaurantId: string, options?: { soundEnabled?: boolean; repeatIntervalSeconds?: number }) {
    this.restaurantId = restaurantId;
    if (options?.soundEnabled !== undefined) this.soundEnabled = options.soundEnabled;
    if (options?.repeatIntervalSeconds !== undefined) this.repeatIntervalSeconds = options.repeatIntervalSeconds;
  }

  public processRequests(allRequests: MockServiceRequest[], currentTime: number = Date.now()): {
    newRequestsCount: number;
    reminderTriggered: boolean;
  } {
    // Multi-tenant check: filter to current restaurant only
    const restaurantRequests = allRequests.filter((r) => r.restaurantId === this.restaurantId);
    const pendingList = restaurantRequests.filter((r) => r.status === ServiceRequestStatus.PENDING);
    this.pendingCount = pendingList.length;

    // 1. Initial Load: register known IDs without sound spam
    if (this.isFirstPoll) {
      restaurantRequests.forEach((r) => this.knownRequestIds.add(r.id));
      this.isFirstPoll = false;
      if (pendingList.length > 0) {
        this.lastAlertTimestamp = currentTime;
      }
      return { newRequestsCount: 0, reminderTriggered: false };
    }

    // 2. Identify Brand-New PENDING Requests
    const brandNew = pendingList.filter(
      (r) => !this.knownRequestIds.has(r.id) && !this.acknowledgedRequestIds.has(r.id)
    );

    if (brandNew.length > 0) {
      brandNew.forEach((r) => this.knownRequestIds.add(r.id));

      const newToasts = brandNew.map((r) => ({
        id: r.id,
        isReminder: false,
        message: r.message,
      }));
      this.activeToasts = [...newToasts, ...this.activeToasts].slice(0, 5);

      if (this.soundEnabled) {
        this.chimePlayedCount++;
      }

      const newest = brandNew[0];
      this.browserNotificationsSent.push({
        title: `Table ${newest.table.tableNumber}: ${newest.type}`,
        body: newest.message || "Customer needs assistance",
        tag: `service-req-${newest.id}`,
      });

      this.lastAlertTimestamp = currentTime;
      return { newRequestsCount: brandNew.length, reminderTriggered: false };
    }

    // 3. Repeat Reminder Logic
    if (pendingList.length > 0 && this.repeatIntervalSeconds > 0) {
      const intervalMs = this.repeatIntervalSeconds * 1000;
      if (currentTime - this.lastAlertTimestamp >= intervalMs) {
        if (this.soundEnabled) {
          this.reminderPlayedCount++;
        }

        const oldest = pendingList[pendingList.length - 1];
        this.activeToasts = [
          { id: `reminder-${oldest.id}-${currentTime}`, isReminder: true, message: oldest.message },
          ...this.activeToasts.filter((t) => !t.isReminder),
        ].slice(0, 5);

        this.lastAlertTimestamp = currentTime;
        return { newRequestsCount: 0, reminderTriggered: true };
      }
    } else if (pendingList.length === 0) {
      this.lastAlertTimestamp = 0;
    }

    return { newRequestsCount: 0, reminderTriggered: false };
  }

  public acknowledgeRequest(requestId: string): void {
    this.acknowledgedRequestIds.add(requestId);
    this.activeToasts = this.activeToasts.filter((t) => t.id !== requestId && !t.id.includes(requestId));
  }

  public toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
  }
}

describe("Real-time Notification & Sound Alert System", () => {
  const restaurantA = "rest-uuid-aaa";
  const restaurantB = "rest-uuid-bbb";

  it("does not play audio chimes on initial page load (first poll cycle)", () => {
    const engine = new ServiceRequestNotificationEngine(restaurantA);
    const existingRequests: MockServiceRequest[] = [
      {
        id: "req-1",
        restaurantId: restaurantA,
        tableId: "tab-1",
        type: ServiceRequestType.WATER,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "T1", name: "Patio" },
      },
    ];

    const result = engine.processRequests(existingRequests);

    expect(result.newRequestsCount).toBe(0);
    expect(engine.chimePlayedCount).toBe(0);
    expect(engine.pendingCount).toBe(1);
    expect(engine.knownRequestIds.has("req-1")).toBe(true);
    expect(engine.activeToasts.length).toBe(0);
  });

  it("detects a brand-new request on subsequent poll and fires chime, toast, and browser notification", () => {
    const engine = new ServiceRequestNotificationEngine(restaurantA);
    const initialList: MockServiceRequest[] = [];
    engine.processRequests(initialList);

    // Now customer creates a new request
    const newList: MockServiceRequest[] = [
      {
        id: "req-2",
        restaurantId: restaurantA,
        tableId: "tab-2",
        type: ServiceRequestType.CALL_WAITER,
        status: ServiceRequestStatus.PENDING,
        message: "Bill please",
        createdAt: new Date().toISOString(),
        table: { tableNumber: "4", name: "Window" },
      },
    ];

    const result = engine.processRequests(newList);

    expect(result.newRequestsCount).toBe(1);
    expect(engine.chimePlayedCount).toBe(1);
    expect(engine.pendingCount).toBe(1);
    expect(engine.activeToasts.length).toBe(1);
    expect(engine.activeToasts[0].id).toBe("req-2");
    expect(engine.browserNotificationsSent.length).toBe(1);
    expect(engine.browserNotificationsSent[0].title).toContain("Table 4");
    expect(engine.browserNotificationsSent[0].body).toBe("Bill please");
  });

  it("does not play chime or re-toast if the same request is seen in repeated poll cycles", () => {
    const engine = new ServiceRequestNotificationEngine(restaurantA);
    engine.processRequests([]);

    const requests: MockServiceRequest[] = [
      {
        id: "req-3",
        restaurantId: restaurantA,
        tableId: "tab-1",
        type: ServiceRequestType.CUTLERY,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "2", name: null },
      },
    ];

    // Cycle 1: New request arrives
    engine.processRequests(requests, 1000);
    expect(engine.chimePlayedCount).toBe(1);

    // Cycle 2: 8 seconds later, same request still pending
    const secondResult = engine.processRequests(requests, 9000);
    expect(secondResult.newRequestsCount).toBe(0);
    expect(engine.chimePlayedCount).toBe(1); // No duplicate chime
    expect(engine.browserNotificationsSent.length).toBe(1); // No duplicate push
  });

  it("respects sound enabled/disabled setting", () => {
    const engine = new ServiceRequestNotificationEngine(restaurantA, { soundEnabled: false });
    engine.processRequests([]);

    const requests: MockServiceRequest[] = [
      {
        id: "req-4",
        restaurantId: restaurantA,
        tableId: "tab-1",
        type: ServiceRequestType.WATER,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "5", name: null },
      },
    ];

    engine.processRequests(requests);
    expect(engine.chimePlayedCount).toBe(0); // Muted
    expect(engine.activeToasts.length).toBe(1); // Visual toast still shown!

    // Toggle sound back ON
    engine.toggleSound();
    expect(engine.soundEnabled).toBe(true);
  });

  it("handles repeat reminders after configurable interval for unacknowledged pending requests", () => {
    const engine = new ServiceRequestNotificationEngine(restaurantA, {
      soundEnabled: true,
      repeatIntervalSeconds: 30, // 30-second interval
    });
    engine.processRequests([]);

    const requests: MockServiceRequest[] = [
      {
        id: "req-5",
        restaurantId: restaurantA,
        tableId: "tab-5",
        type: ServiceRequestType.CLEANING,
        status: ServiceRequestStatus.PENDING,
        message: "Spilled water",
        createdAt: new Date(1000).toISOString(),
        table: { tableNumber: "8", name: null },
      },
    ];

    // t = 1000: Initial detection
    engine.processRequests(requests, 1000);
    expect(engine.chimePlayedCount).toBe(1);
    expect(engine.reminderPlayedCount).toBe(0);

    // t = 15000 (15s elapsed, interval 30s): no reminder yet
    let reminderResult = engine.processRequests(requests, 15000);
    expect(reminderResult.reminderTriggered).toBe(false);
    expect(engine.reminderPlayedCount).toBe(0);

    // t = 32000 (31s elapsed): reminder SHOULD trigger!
    reminderResult = engine.processRequests(requests, 32000);
    expect(reminderResult.reminderTriggered).toBe(true);
    expect(engine.reminderPlayedCount).toBe(1);
    expect(engine.activeToasts.some((t) => t.isReminder)).toBe(true);
  });

  it("stops repeat reminders immediately once request is acknowledged or status changes", () => {
    const engine = new ServiceRequestNotificationEngine(restaurantA, {
      soundEnabled: true,
      repeatIntervalSeconds: 30,
    });
    engine.processRequests([]);

    const pendingRequests: MockServiceRequest[] = [
      {
        id: "req-6",
        restaurantId: restaurantA,
        tableId: "tab-6",
        type: ServiceRequestType.WATER,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date(1000).toISOString(),
        table: { tableNumber: "1", name: null },
      },
    ];

    engine.processRequests(pendingRequests, 1000);
    expect(engine.chimePlayedCount).toBe(1);

    // Staff accepts request -> status changes to IN_PROGRESS
    const inProgressRequests: MockServiceRequest[] = [
      {
        ...pendingRequests[0],
        status: ServiceRequestStatus.IN_PROGRESS,
      },
    ];

    // Next cycle at t = 35000 (exceeding 30s)
    const result = engine.processRequests(inProgressRequests, 35000);
    expect(result.reminderTriggered).toBe(false);
    expect(engine.reminderPlayedCount).toBe(0);
    expect(engine.pendingCount).toBe(0);
  });

  it("strictly enforces multi-tenant isolation in pending counts and notifications", () => {
    const engineA = new ServiceRequestNotificationEngine(restaurantA);
    const engineB = new ServiceRequestNotificationEngine(restaurantB);

    engineA.processRequests([]);
    engineB.processRequests([]);

    // Multi-tenant mixed batch of requests
    const mixedRequests: MockServiceRequest[] = [
      {
        id: "req-a1",
        restaurantId: restaurantA,
        tableId: "tab-a1",
        type: ServiceRequestType.WATER,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "A1", name: null },
      },
      {
        id: "req-b1",
        restaurantId: restaurantB,
        tableId: "tab-b1",
        type: ServiceRequestType.CALL_WAITER,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "B1", name: null },
      },
      {
        id: "req-b2",
        restaurantId: restaurantB,
        tableId: "tab-b2",
        type: ServiceRequestType.CUTLERY,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "B2", name: null },
      },
    ];

    engineA.processRequests(mixedRequests);
    engineB.processRequests(mixedRequests);

    // Restaurant A must only see 1 pending request
    expect(engineA.pendingCount).toBe(1);
    expect(engineA.knownRequestIds.has("req-a1")).toBe(true);
    expect(engineA.knownRequestIds.has("req-b1")).toBe(false);
    expect(engineA.knownRequestIds.has("req-b2")).toBe(false);

    // Restaurant B must see 2 pending requests
    expect(engineB.pendingCount).toBe(2);
    expect(engineB.knownRequestIds.has("req-a1")).toBe(false);
    expect(engineB.knownRequestIds.has("req-b1")).toBe(true);
    expect(engineB.knownRequestIds.has("req-b2")).toBe(true);
  });

  it("handles dismissing toasts and acknowledges them without re-alerting", () => {
    const engine = new ServiceRequestNotificationEngine(restaurantA);
    engine.processRequests([]);

    const requests: MockServiceRequest[] = [
      {
        id: "req-7",
        restaurantId: restaurantA,
        tableId: "tab-7",
        type: ServiceRequestType.CALL_WAITER,
        status: ServiceRequestStatus.PENDING,
        message: null,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "9", name: null },
      },
    ];

    engine.processRequests(requests);
    expect(engine.activeToasts.length).toBe(1);

    // Dismiss toast
    engine.acknowledgeRequest("req-7");
    expect(engine.activeToasts.length).toBe(0);
    expect(engine.acknowledgedRequestIds.has("req-7")).toBe(true);

    // Subsequent poll should not re-add to toasts
    engine.processRequests(requests);
    expect(engine.activeToasts.length).toBe(0);
  });
});
