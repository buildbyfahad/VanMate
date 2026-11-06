package expo.modules.vancaller

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fires when the alarm goes off: place the next due call. */
class CallAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      CallPlan.ACTION_FIRE -> CallPlan.fire(context.applicationContext)
      CallPlan.ACTION_VERIFY -> CallPlan.poll(context.applicationContext)
    }
  }
}

/** Alarms are wiped by a reboot or app update; book them again from the saved plan. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      CallPlan.scheduleNext(context.applicationContext)
    }
  }
}
