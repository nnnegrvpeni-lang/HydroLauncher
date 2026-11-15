import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { isMockEnabled } from '../api/mock';

/** Системное уведомление Windows/macOS/Linux. Ошибки не критичны. */
export async function notifySystem(title: string, body: string) {
  if (isMockEnabled()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === 'granted';
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // уведомления могут быть запрещены в системе — это не ломает лаунчер
  }
}
