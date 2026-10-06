/**
 * HTML5 Web Notification integration.
 * Safe fallback for non-supported browsers or denied permissions.
 */

export type NotificationPermissionStatus = "granted" | "denied" | "default" | "unsupported";

/**
 * Checks current browser notification permission status.
 */
export function getBrowserNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Requests notification permission from user after explicit interaction.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (err) {
    console.warn("Error requesting notification permission:", err);
    return Notification.permission;
  }
}

interface ServiceNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}

/**
 * Dispatches an HTML5 notification if permission is granted.
 */
export function sendBrowserNotification({
  title,
  body,
  tag,
  onClick,
}: ServiceNotificationPayload): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    const notification = new Notification(title, {
      body,
      tag: tag || "qrserve-service-alert",
      icon: "/favicon.ico",
    });

    notification.onclick = () => {
      window.focus();
      if (onClick) {
        onClick();
      }
      notification.close();
    };

    return true;
  } catch (err) {
    console.warn("Failed to display browser notification:", err);
    return false;
  }
}
