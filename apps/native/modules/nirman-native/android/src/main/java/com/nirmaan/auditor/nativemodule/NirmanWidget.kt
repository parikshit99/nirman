package com.nirmaan.auditor.nativemodule

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * "Today's spend" on the home screen: the open project, what was spent on it today and how many bills, and "Add bill".
 * It never runs the app's JS: the app pushes the figures with `setWidget` when its data or the open project changes,
 * and they are kept here (SharedPreferences) with the day they are for. On a new day before the app has pushed again,
 * the widget shows nothing spent for that day (Android redraws it every 30 minutes).
 */
class NirmanWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) draw(context, manager, id)
  }

  companion object {
    private const val TAG = "Widget"
    private const val PREFS = "nirman_widget"

    /** Opens the Purchases tab (tapping the widget anywhere but "Add bill"). */
    const val ACTION_OPEN_PURCHASES = "com.nirmaan.auditor.action.OPEN_PURCHASES"

    /** Keeps the figures from the app and redraws every widget on the home screen. */
    fun save(context: Context, project: String, day: String, spent: Double, bills: Int) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (prefs.getBoolean("set", false) && prefs.getString("project", null) == project && prefs.getString("day", null) == day &&
        prefs.getLong("spent", -1L) == spent.toRawBits() && prefs.getInt("bills", -1) == bills) return
      prefs.edit().putBoolean("set", true).putString("project", project).putString("day", day).putLong("spent", spent.toRawBits()).putInt("bills", bills).apply()
      updateAll(context)
    }

    private fun updateAll(context: Context) {
      try {
        val manager = AppWidgetManager.getInstance(context)
        for (id in manager.getAppWidgetIds(ComponentName(context, NirmanWidget::class.java))) draw(context, manager, id)
      } catch (e: Exception) {
        Log.e(TAG, "Could not update the widget", e)
      }
    }

    private fun draw(context: Context, manager: AppWidgetManager, id: Int) {
      val views = RemoteViews(context.packageName, R.layout.nirman_widget)
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val today = istToday()
      if (prefs.getBoolean("set", false)) {
        // Figures from an earlier day are not today's: nothing spent yet today.
        val sameDay = prefs.getString("day", null) == today
        val spent = if (sameDay) Double.fromBits(prefs.getLong("spent", 0L)) else 0.0
        val bills = if (sameDay) prefs.getInt("bills", 0) else 0
        val date = dayLabel(today)
        views.setTextViewText(R.id.nirman_widget_project, prefs.getString("project", ""))
        views.setTextViewText(R.id.nirman_widget_amount, rupees(spent))
        views.setTextViewText(R.id.nirman_widget_bills, if (bills == 0) "No bills yet · $date" else "$bills ${if (bills == 1) "bill" else "bills"} · $date")
        views.setViewVisibility(R.id.nirman_widget_figures, View.VISIBLE)
        views.setViewVisibility(R.id.nirman_widget_empty, View.GONE)
      } else {
        views.setViewVisibility(R.id.nirman_widget_figures, View.GONE)
        views.setViewVisibility(R.id.nirman_widget_empty, View.VISIBLE)
      }
      launchIntent(context, ACTION_OPEN_PURCHASES, 1)?.let { views.setOnClickPendingIntent(R.id.nirman_widget_root, it) }
      launchIntent(context, NirmanModule.ACTION_NEW_BILL, 2)?.let { views.setOnClickPendingIntent(R.id.nirman_widget_add, it) }
      manager.updateAppWidget(id, views)
    }

    /** Opens the app's own activity with one of its actions (as the app shortcuts do). */
    private fun launchIntent(context: Context, action: String, requestCode: Int): PendingIntent? {
      val activity = context.packageManager.getLaunchIntentForPackage(context.packageName)?.component ?: return null
      val intent = Intent(action).setComponent(activity).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun istFormat(pattern: String) = SimpleDateFormat(pattern, Locale.ENGLISH).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }

    /** Today's date in India (YYYY-MM-DD), as the app's figures are. */
    private fun istToday(): String = istFormat("yyyy-MM-dd").format(Date())

    /** "15 Oct". */
    private fun dayLabel(day: String): String = try {
      istFormat("d MMM").format(istFormat("yyyy-MM-dd").parse(day)!!)
    } catch (e: Exception) {
      day
    }

    /** Whole rupees with Indian grouping: "₹1,23,457". */
    private fun rupees(amount: Double): String {
      val whole = abs(amount).roundToLong().toString()
      val grouped = if (whole.length <= 3) {
        whole
      } else {
        val head = whole.dropLast(3)
        head.reversed().chunked(2).joinToString(",").reversed() + "," + whole.takeLast(3)
      }
      return (if (amount < 0 && grouped != "0") "-₹" else "₹") + grouped
    }
  }
}
