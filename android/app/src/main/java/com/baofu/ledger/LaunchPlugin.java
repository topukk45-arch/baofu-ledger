package com.baofu.ledger;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 1019-U：启动画面等首屏画好再收。
 * 网页层首屏出来的那一刻（有首屏快照就是快照画上时，没有就是真的首屏 / 登录页画好时）调 ready()，
 * MainActivity 里的启动画面看到 ready 了就收；网页一直没调（出错、老系统）也最多留 1 秒（MainActivity 里管）。
 *
 * 1019-X：
 *  - timings()：原生那段的时间点（都是 SystemClock.uptimeMillis，开机以来的毫秒）：进程启动、Activity 创建、WebView 建好、
 *    收到「画好了」、启动画面真正收起；再带一对「现在」（uptime + 系统时间），网页拿它把自己的时间换到同一把尺子上。
 *  - setWait({ on }) / getWait()：开发开关里的「启动画面等首屏」（默认开），存在这台手机的 SharedPreferences；
 *    关掉就回到 1019-U 之前的做法（不装启动画面、系统画出第一帧就收），下次打开 App 生效。
 */
@CapacitorPlugin(name = "Launch")
public class LaunchPlugin extends Plugin {

    static final String PREFS = "jiwen_launch";
    static final String KEY_WAIT = "wait_first_screen";

    private static volatile boolean ready = false;
    static volatile long procStart = 0, actCreate = 0, webReady = 0, readyAt = 0, splashGone = 0;
    static volatile boolean waitOn = true;

    public static boolean isReady() { return ready; }

    // 每次 Activity 重新建（重新打开 App）都从「没好」开始
    public static void reset() { ready = false; readyAt = 0; splashGone = 0; webReady = 0; }

    static boolean readWait(Context c) {
        try { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_WAIT, true); }
        catch (Exception e) { return true; }
    }

    @PluginMethod
    public void ready(PluginCall call) {
        if (!ready) { ready = true; readyAt = SystemClock.uptimeMillis(); }
        call.resolve();
    }

    @PluginMethod
    public void timings(PluginCall call) {
        JSObject r = new JSObject();
        r.put("procStart", procStart);
        r.put("actCreate", actCreate);
        r.put("webReady", webReady);
        r.put("readyAt", readyAt);
        r.put("splashGone", splashGone);
        r.put("wait", waitOn);
        r.put("nowUptime", SystemClock.uptimeMillis());
        r.put("nowEpoch", System.currentTimeMillis());
        call.resolve(r);
    }

    @PluginMethod
    public void getWait(PluginCall call) {
        JSObject r = new JSObject();
        r.put("on", readWait(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void setWait(PluginCall call) {
        boolean on = call.getBoolean("on", true);
        try {
            SharedPreferences.Editor ed = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            ed.putBoolean(KEY_WAIT, on).apply();
        } catch (Exception ignored) {}
        JSObject r = new JSObject();
        r.put("on", on);
        call.resolve(r);
    }
}
