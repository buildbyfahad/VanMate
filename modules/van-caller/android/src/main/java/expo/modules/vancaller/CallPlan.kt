package expo.modules.vancaller

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.CallLog
import android.util.Log
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * The phone-side calling engine. The app hands over a plan (a list of "call this number at this time");
 * this object keeps it on disk and uses Android alarms to place each call as a completely normal phone call.
 *
 * It never hangs up. An unanswered call is ended by the carrier after its usual ring time; an answered call is
 * an ordinary conversation. It does not depend on the JavaScript side being alive.
 */
object CallPlan {
  private const val PREFS = "vancaller"
  const val ACTION_FIRE = "expo.modules.vancaller.FIRE"
  const val ACTION_VERIFY = "expo.modules.vancaller.VERIFY"

  /** While a call is going, look at the phone this often to see when it has ended. */
  private const val POLL_MS = 4_000L

  /** A call that ends without being answered within this many seconds was cut early (by the driver or the parent); longer means it rang out. */
  private const val CUT_EARLY_SEC = 20L

  /** A call more than this late is dropped: calling a parent at the wrong time is worse than not calling. */
  const val STALE_MS = 20 * 60 * 1000L

  /** After placing a call, wait at least this long before the next one (a ring usually lasts 30-40 seconds). */
  private const val CALL_SPACING_MS = 45_000L
  private const val BUSY_RETRY_MS = 15_000L

  data class Entry(val key: String, val at: Long, val number: String)

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // ---- storage ----

  fun savePlan(ctx: Context, json: String) {
    JSONArray(json) // reject malformed input before storing it
    prefs(ctx).edit().putString("plan", json).apply()
  }

  fun loadPlan(ctx: Context): List<Entry> {
    val arr = JSONArray(prefs(ctx).getString("plan", "[]"))
    return (0 until arr.length()).map {
      val o = arr.getJSONObject(it)
      Entry(o.getString("key"), o.getLong("at"), o.getString("number"))
    }
  }

  fun logJson(ctx: Context): String = prefs(ctx).getString("log", "[]") ?: "[]"

  /** Keys already tried (whatever the result) plus the one whose call is being verified. A failed call is not retried by itself. */
  private fun doneKeys(ctx: Context): Set<String> {
    val arr = JSONArray(logJson(ctx))
    val out = HashSet<String>()
    for (i in 0 until arr.length()) out.add(arr.getJSONObject(i).getString("key"))
    prefs(ctx).getString("verifyKey", null)?.let { out.add(it) }
    return out
  }

  /** outcome: talked | unanswered | cut | called (result unknown) | notstarted. talkSec is how long they spoke. */
  private fun appendLog(ctx: Context, key: String, at: Long, ok: Boolean, note: String, outcome: String = "", talkSec: Long = 0) {
    val old = JSONArray(logJson(ctx))
    val arr = JSONArray()
    val start = maxOf(0, old.length() - 400) // keep the log small
    for (i in start until old.length()) arr.put(old.get(i))
    arr.put(JSONObject().put("key", key).put("at", at).put("ok", ok).put("note", note).put("outcome", outcome).put("talkSec", talkSec))
    prefs(ctx).edit().putString("log", arr.toString()).apply()
  }

  fun nextAlarmAt(ctx: Context) = prefs(ctx).getLong("nextAlarmAt", 0L)

  // ---- permissions & call state ----

  /** Needed only to learn whether a call was answered and for how long. Calling works without it. */
  fun hasCallLogPermission(ctx: Context): Boolean =
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

  fun hasPermissions(ctx: Context): Boolean =
    listOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE)
      .all { ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED }

  /** True when the phone is not in a call. We never start a call on top of one the driver is already in. */
  private fun isIdle(ctx: Context): Boolean {
    val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    return try {
      tm.callState == TelephonyManager.CALL_STATE_IDLE
    } catch (e: SecurityException) {
      false
    }
  }

  /**
   * The SIM cards that can place calls, as handles. We only read the list of handles, never each account's details,
   * because some phones refuse the second (it needs a system permission).
   */
  private fun simHandles(ctx: Context): List<android.telecom.PhoneAccountHandle> {
    return try {
      val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      tm.callCapablePhoneAccounts.filter { it.componentName.className.contains("TelephonyConnectionService") }
    } catch (e: SecurityException) {
      Log.w("VanCaller", "cannot list SIMs", e)
      emptyList()
    }
  }

  private fun handleId(h: android.telecom.PhoneAccountHandle) = h.componentName.flattenToString() + "|" + h.id

  /** A readable name for a SIM: "SIM 1 · Jio" when the phone tells us the carrier, else just "SIM 1". */
  private fun simLabel(ctx: Context, h: android.telecom.PhoneAccountHandle, index: Int): String {
    try {
      val sm = ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as android.telephony.SubscriptionManager
      val info = sm.activeSubscriptionInfoList?.firstOrNull { it.subscriptionId.toString() == h.id || it.iccId == h.id }
      if (info != null) {
        val name = info.displayName?.toString()?.trim().orEmpty()
        return "SIM ${info.simSlotIndex + 1}" + if (name.isNotEmpty()) " · $name" else ""
      }
    } catch (e: SecurityException) {
      Log.w("VanCaller", "cannot read SIM names", e)
    }
    return "SIM ${index + 1}"
  }

  /** JSON array of { id, label, selected } for each SIM card, so the driver can pick one. */
  fun simsJson(ctx: Context): String {
    val chosen = prefs(ctx).getString("simId", null)
    val arr = JSONArray()
    simHandles(ctx).forEachIndexed { i, h ->
      arr.put(JSONObject().put("id", handleId(h)).put("label", simLabel(ctx, h, i)).put("selected", handleId(h) == chosen))
    }
    return arr.toString()
  }

  fun setSim(ctx: Context, id: String?) {
    prefs(ctx).edit().apply { if (id.isNullOrEmpty()) remove("simId") else putString("simId", id) }.apply()
  }

  fun placeCall(ctx: Context, number: String): Boolean {
    if (!hasPermissions(ctx)) return false
    return try {
      val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      val extras = Bundle()
      // Use the SIM the driver picked, so a dual-SIM phone never stops to ask. If it is gone, the phone's default is used.
      val sims = simHandles(ctx)
      val chosen = prefs(ctx).getString("simId", null)
      val pick = sims.firstOrNull { handleId(it) == chosen }
        ?: if (sims.size > 1 && tm.getDefaultOutgoingPhoneAccount("tel") == null) sims.first() else null // never leave a "Choose SIM" sheet that nobody will tap
      if (pick != null) extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, pick)
      tm.placeCall(Uri.fromParts("tel", number, null), extras)
      true
    } catch (e: SecurityException) {
      false
    }
  }

  // ---- the alarm-driven loop ----

  /** Called by the alarm. Places at most one due call, then books the next alarm. */
  fun fire(ctx: Context) {
    val now = System.currentTimeMillis()
    val done = doneKeys(ctx)
    val due = loadPlan(ctx)
      .filter { it.key !in done && it.at <= now && now - it.at <= STALE_MS }
      .minByOrNull { it.at }

    if (due != null) {
      when {
        !hasPermissions(ctx) -> appendLog(ctx, due.key, now, false, "call permission missing")
        !isIdle(ctx) -> prefs(ctx).edit().putLong("busyUntil", now + BUSY_RETRY_MS).apply() // already in a call: try again shortly
        else -> {
          dial(ctx, due.key, due.number, now)
        }
      }
    }
    scheduleNext(ctx)
  }

  private fun pollIntent(ctx: Context): PendingIntent =
    PendingIntent.getBroadcast(
      ctx, 2, Intent(ctx, CallAlarmReceiver::class.java).setAction(ACTION_VERIFY),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun schedulePoll(ctx: Context, delayMs: Long) {
    val at = System.currentTimeMillis() + delayMs
    val pi = pollIntent(ctx)
    try {
      alarmManager(ctx).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    } catch (e: SecurityException) {
      alarmManager(ctx).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }
  }

  /** Ask the phone to dial, then watch the call until it ends so we can record what really happened. */
  private fun dial(ctx: Context, key: String, number: String, now: Long): Boolean {
    val ok = placeCall(ctx, number)
    if (!ok) {
      appendLog(ctx, key, now, false, "could not place call", "notstarted")
      return false
    }
    prefs(ctx).edit()
      .putString("verifyKey", key).putString("verifyNumber", number).putLong("dialAt", now)
      .putBoolean("sawCall", false).putInt("emptyPolls", 0)
      .putLong("nextCallNotBefore", now + CALL_SPACING_MS).apply()
    schedulePoll(ctx, POLL_MS)
    return true
  }

  /** The newest outgoing call to this number since we dialled: talk time in seconds, or null if the call history has none. */
  private fun talkSecondsFromLog(ctx: Context, number: String, since: Long): Long? {
    if (!hasCallLogPermission(ctx)) return null
    val tail = number.filter { it.isDigit() }.takeLast(10)
    return try {
      ctx.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DURATION),
        "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.TYPE} = ?",
        arrayOf((since - 10_000).toString(), CallLog.Calls.OUTGOING_TYPE.toString()),
        "${CallLog.Calls.DATE} DESC",
      )?.use { c ->
        var found: Long? = null
        while (found == null && c.moveToNext()) {
          if (c.getString(0).orEmpty().filter { it.isDigit() }.takeLast(10) == tail) found = c.getLong(1)
        }
        found
      }
    } catch (e: SecurityException) {
      null
    }
  }

  /**
   * Runs every few seconds while a call we placed is going. When the phone goes idle the call has ended: ask the
   * call history how long they talked and write down the real outcome.
   */
  fun poll(ctx: Context) {
    val p = prefs(ctx)
    val key = p.getString("verifyKey", null)
    if (key == null) { scheduleNext(ctx); return }
    val number = p.getString("verifyNumber", "") ?: ""
    val dialAt = p.getLong("dialAt", 0L)
    val now = System.currentTimeMillis()
    val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    val idle = try { tm.callState == TelephonyManager.CALL_STATE_IDLE } catch (e: SecurityException) { false }

    if (!idle) {
      p.edit().putBoolean("sawCall", true).apply()
      if (now - dialAt < 3 * 60 * 60_000L) { schedulePoll(ctx, POLL_MS); return } // still on the call
    }

    val talk = talkSecondsFromLog(ctx, number, dialAt)
    val sawCall = p.getBoolean("sawCall", false)
    val empties = p.getInt("emptyPolls", 0)
    if (talk == null && !sawCall && hasCallLogPermission(ctx) && empties < 2) {
      // Not in the call history yet, and no call seen: give it two more looks before deciding it never started.
      p.edit().putInt("emptyPolls", empties + 1).apply()
      schedulePoll(ctx, POLL_MS)
      return
    }

    p.edit().remove("verifyKey").remove("verifyNumber").apply()
    val elapsedSec = (now - dialAt) / 1000
    when {
      talk != null && talk > 0 -> appendLog(ctx, key, now, true, "", "talked", talk)
      talk != null -> appendLog(ctx, key, now, true, "", if (elapsedSec < CUT_EARLY_SEC) "cut" else "unanswered")
      sawCall -> appendLog(ctx, key, now, true, "", "called") // no call-history permission: we only know the phone placed the call
      else -> appendLog(ctx, key, now, false, "Call did not start", "notstarted")
    }
    scheduleNext(ctx)
  }

  /** The driver asked to call this student again right now. */
  fun callNow(ctx: Context, key: String, number: String): Boolean {
    if (!hasPermissions(ctx) || !isIdle(ctx)) return false
    return dial(ctx, key, number, System.currentTimeMillis())
  }

  private fun alarmManager(ctx: Context) = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun fireIntent(ctx: Context): PendingIntent =
    PendingIntent.getBroadcast(
      ctx, 1, Intent(ctx, CallAlarmReceiver::class.java).setAction(ACTION_FIRE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** Book one alarm for the earliest call still waiting. Safe to call any time. */
  fun scheduleNext(ctx: Context) {
    val am = alarmManager(ctx)
    val now = System.currentTimeMillis()
    val done = doneKeys(ctx)
    val next = loadPlan(ctx).filter { it.key !in done && now - it.at <= STALE_MS }.minByOrNull { it.at }
    val fire = fireIntent(ctx)

    if (next == null) {
      am.cancel(fire)
      prefs(ctx).edit().putLong("nextAlarmAt", 0L).apply()
      return
    }
    val p = prefs(ctx)
    // Never start a call while the previous one may still be ringing.
    val trigger = maxOf(next.at, now + 1000, p.getLong("nextCallNotBefore", 0L), p.getLong("busyUntil", 0L))
    p.edit().putLong("nextAlarmAt", trigger).apply()

    // setAlarmClock is the one alarm type Android does not delay in battery-saving (Doze) mode.
    val show = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
      PendingIntent.getActivity(ctx, 3, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    try {
      am.setAlarmClock(AlarmManager.AlarmClockInfo(trigger, show), fire)
    } catch (e: SecurityException) {
      // Exact alarms are not allowed on this phone: fall back to an inexact one (can be a few minutes late) instead of failing.
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, fire)
    }
  }
}
