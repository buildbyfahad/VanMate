<div align="center">

<img src="assets/icon.png" alt="VanMate logo" width="140" />

# VanMate

**The school van that calls the parents for you.**

Tap **Start** when you leave. Every parent gets a call from your own phone, one by one, right when the van is near.
No typing, no WhatsApp, no server, no fees.

![Android](https://img.shields.io/badge/Android-7%2B-3DDC84?logo=android&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=black)
![Free](https://img.shields.io/badge/price-free%20forever-0F766E)
![Works offline](https://img.shields.io/badge/internet-not%20needed-F59E0B)

</div>

---

## Why this exists

A school van driver spends every morning and afternoon phoning parents: *"I'm coming, send the child to the stop."*
It is the same ten calls, at the same moments, every day. VanMate makes the phone do it.

The calls are **normal phone calls from the driver's own SIM**. Parents see a familiar number ringing, as they always have. Nothing to install on their side.

## How it works

1. **Add a route**, for example "Sector 5 morning", and pick its students from your contacts.
2. For each student, set **how many minutes after the previous student** they should be called. You know your road and your timing.
3. **Drag the list** to put the students in the order the van reaches them.
4. When you leave, tap **Start**. The **first student is called at once**, and the rest follow one by one by their gaps.

You can put the phone down, lock the screen or use another app. The calls are booked as phone alarms, so they do not depend on VanMate being open.

## What you see

| Home | Live route |
| --- | --- |
| A short list of today's routes: the name, how many students, and a big **Start** button. | The route that is running: who is being called now, who is next, and what happened to everyone. |

Each student shows what **really** happened on the call:

| Status | Meaning |
| --- | --- |
| **Talked 1 min 20 sec** | The parent answered. |
| **Rang, not picked up** | It rang until the phone company ended it. |
| **Call was cut** | The call ended within about 20 seconds, before anyone answered. |
| **Call did not start** | The phone never dialled, for example the SIM box was cancelled. |

## Features

- **Automatic calls from your own SIM**, one after another, with a safe gap between them
- **Several routes**, as many as you need, each with its own students and days
- **Per-student timing** and a **drag to reorder** list. The first student is always called at once
- **Dual SIM**: choose which SIM makes the calls so the phone never stops to ask
- **Pick parents from your contacts**, several at once, or type a number. Extra numbers per student are supported
- **No duplicates**: the same number cannot be added twice to one route
- **Absent today?** One tap skips a student for the day
- **Call again now** for anyone who was not reached
- **Fees by route**: mark paid by cash or UPI and send a WhatsApp reminder
- **Private**: everything stays on the phone. The release build does not even ask for internet permission

## Good to know

- **Android only for automatic calls.** iPhones do not allow an app to place a phone call by itself, so iOS can plan routes but not dial.
- **It never hangs up.** If a parent does not answer, the phone company ends the call as usual. If they answer, it is a normal conversation.
- **A busy phone waits.** If you are already on a call when the next one is due, VanMate waits and tries again shortly. A call more than 20 minutes late is skipped, because a call at the wrong time is worse than none.
- **Cut calls:** the phone cannot tell whether the driver or the parent ended a short call, so both show as "Call was cut".

### Make it reliable on your phone

Many phones put apps to sleep to save battery. In **Settings → Automatic calls** tap *Keep the app awake*, then allow **Auto-start**, **Background activity**, and **Alarms & reminders** for VanMate. On Vivo, Oppo, Xiaomi and similar phones, also lock the app in the recent-apps list.

## Permissions

| Permission | Why |
| --- | --- |
| Phone (`CALL_PHONE`, `READ_PHONE_STATE`) | Place the calls and know when you are already on one |
| Call history (`READ_CALL_LOG`) | Learn whether a call was answered and for how long. Optional: calling still works without it |
| Contacts (`READ_CONTACTS`) | Pick parents from your contacts. Optional: you can type numbers instead |
| Alarms (`USE_EXACT_ALARM`) | Place each call at the right moment |
| Start on boot (`RECEIVE_BOOT_COMPLETED`) | Restore the calls after the phone restarts |

Nothing leaves the phone. There is no account, no server and no tracking.

## Install

Download the APK from `releases/` (or build it, below), copy it to the phone and open it. Android will ask you to allow installing from this source.

> The APK is signed with a debug key, so it is for **sideloading** only. A Play Store release needs its own signing key, and Google restricts apps that read call history or place calls on their own.

## Build it yourself

You need Node 20+, JDK 17 and the Android SDK.

```bash
npm install
npm test                      # schedule engine tests

npx expo run:android          # debug build on a connected phone

# release build (no dev server, no internet permission)
VANMATE_RELEASE=1 npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk
```

## Project layout

```
App.tsx                      app shell, tabs, settings
src/
  plan.ts                    the schedule: who is called when (tested)
  store.tsx                  saved data, validation, duplicates, migration
  caller.tsx                 talks to the phone: plan, permissions, SIMs, call log
  screens/                   Today (home + live route), Routes, Fees
  addChildren.tsx            add students from contacts or by typing
  dragList.tsx               drag-to-reorder list
  pickers.tsx, ui.tsx        inputs and the design system
modules/van-caller/          the Android engine (Kotlin)
  CallPlan.kt                alarms, dialling, SIM choice, call outcome
server/                      an early idea (a cloud caller). Not used by the app
```

## Built with

Expo · React Native · TypeScript · a local Expo module written in Kotlin (`AlarmManager`, `TelecomManager`).

---

<div align="center">

Made for the people who drive our children to school every day. 🚌

</div>
