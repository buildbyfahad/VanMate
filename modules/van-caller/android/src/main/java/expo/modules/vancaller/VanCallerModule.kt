package expo.modules.vancaller

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VanCallerModule : Module() {
  private val ctx get() = appContext.reactContext ?: throw IllegalStateException("React context not ready")

  override fun definition() = ModuleDefinition {
    Name("VanCaller")

    /** Replace the list of upcoming calls: JSON array of { key, at (epoch ms), number }. */
    Function("setPlan") { json: String ->
      CallPlan.savePlan(ctx, json)
      CallPlan.scheduleNext(ctx)
    }

    /** What was actually dialled: JSON array of { key, at, ok, note }. */
    Function("getLog") { CallPlan.logJson(ctx) }

    Function("hasPermissions") { CallPlan.hasPermissions(ctx) }

    /** Whether the app may read the call history (to learn if a call was answered and for how long). */
    Function("hasCallLogPermission") { CallPlan.hasCallLogPermission(ctx) }

    /** Epoch ms of the next booked call, or 0 if nothing is waiting. */
    Function("nextAlarmAt") { CallPlan.nextAlarmAt(ctx) }

    /** Call one number right now (a retry for a call that did not go through). */
    Function("callNow") { key: String, number: String -> CallPlan.callNow(ctx, key, number) }

    /** The SIM cards that can call: JSON array of { id, label, selected }. */
    Function("getSims") { CallPlan.simsJson(ctx) }

    /** Choose which SIM places the calls (null = the phone's own default). */
    Function("setSim") { id: String? -> CallPlan.setSim(ctx, id) }

    /** Let the driver stop the phone from putting the app to sleep (important on many Android phones). */
    Function("openBatterySettings") {
      ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("openAppSettings") {
      ctx.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }
  }
}
